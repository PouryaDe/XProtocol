import { getDb } from '../db/database.js';
import { applyDedicatedSessionLimits, collectLinuxLiveTunnels } from '../drivers/linuxEngine.js';
import type { InboundRow } from '../generators/configs.js';
import { isClientActiveQuota } from './peerResolver.js';
import { kickClientConnections, kickConnectionById, scheduleSyncRunningInbounds } from './syncService.js';

let collectorTimer: NodeJS.Timeout | null = null;
let bootBaselineDone = false;
const lastTunnelBytes = new Map<string, { in: number; out: number }>();
const appliedDedicatedShape = new Map<string, string>();

function computeNextResetIso(period: string, fromMs = Date.now()): string | null {
  const d = new Date(fromMs);
  if (period === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return null;
}

export async function runPeriodicResets(): Promise<boolean> {
  const db = getDb();
  const nowMs = Date.now();
  const rows = db
    .prepare(
      `SELECT id, reset_period, next_reset_at, traffic_limit_bytes, traffic_used_bytes
       FROM clients
       WHERE reset_period IN ('daily', 'weekly', 'monthly')`,
    )
    .all() as Array<{
    id: number;
    reset_period: string;
    next_reset_at: string | null;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
  }>;

  let anyReactivated = false;
  for (const r of rows) {
    if (!r.next_reset_at) {
      const nextIso = computeNextResetIso(r.reset_period, nowMs);
      if (nextIso) db.prepare('UPDATE clients SET next_reset_at = ? WHERE id = ?').run(nextIso, r.id);
      continue;
    }
    if (Date.parse(r.next_reset_at) <= nowMs) {
      const wasUsedUp = r.traffic_limit_bytes !== null && r.traffic_used_bytes >= r.traffic_limit_bytes;
      const nextIso = computeNextResetIso(r.reset_period, nowMs);
      db.prepare(
        'UPDATE clients SET traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0, next_reset_at = ? WHERE id = ?',
      ).run(nextIso, r.id);
      if (wasUsedUp) anyReactivated = true;
    }
  }
  if (anyReactivated) {
    scheduleSyncRunningInbounds();
  }
  return anyReactivated;
}

export async function runCollectorTick(): Promise<void> {
  await runPeriodicResets().catch(() => false);
  if (process.platform !== 'linux') return;

  const db = getDb();
  const inbounds = db.prepare('SELECT * FROM inbounds WHERE running = 1').all() as unknown as InboundRow[];
  if (inbounds.length === 0) return;

  const clients = db
    .prepare(
      `SELECT id, name, owner_id, wg_public_key, traffic_limit_bytes, traffic_used_bytes,
              expires_at, first_connect_days, first_connected_at, enabled, device_limit,
              download_mbps, upload_mbps
       FROM clients`,
    )
    .all() as Array<{
    id: number;
    name: string;
    owner_id: number;
    wg_public_key: string;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
    expires_at: string | null;
    first_connect_days: number | null;
    first_connected_at: string | null;
    enabled: number;
    device_limit: number | null;
    download_mbps: number | null;
    upload_mbps: number | null;
  }>;

  const groupSpeedRows = db
    .prepare(
      `SELECT cg.client_id, g.download_mbps, g.upload_mbps
       FROM client_groups cg
       JOIN groups g ON g.id = cg.group_id
       WHERE g.enabled = 1 AND (g.download_mbps IS NOT NULL OR g.upload_mbps IS NOT NULL)`,
    )
    .all() as Array<{ client_id: number; download_mbps: number | null; upload_mbps: number | null }>;
  const groupDlMin = new Map<number, number>();
  const groupUlMin = new Map<number, number>();
  for (const gs of groupSpeedRows) {
    if (gs.download_mbps && gs.download_mbps > 0) {
      const cur = groupDlMin.get(gs.client_id);
      if (cur === undefined || gs.download_mbps < cur) groupDlMin.set(gs.client_id, gs.download_mbps);
    }
    if (gs.upload_mbps && gs.upload_mbps > 0) {
      const cur = groupUlMin.get(gs.client_id);
      if (cur === undefined || gs.upload_mbps < cur) groupUlMin.set(gs.client_id, gs.upload_mbps);
    }
  }

  const clientByName = new Map(clients.map((c) => [c.name, c]));
  const clientNameByPub = new Map(clients.map((c) => [c.wg_public_key, c.name]));

  const nodes = db.prepare('SELECT id, multiplier FROM nodes').all() as { id: number; multiplier: number }[];
  const nodeMult = new Map(nodes.map((n) => [n.id, n.multiplier]));

  const live = await collectLinuxLiveTunnels(inbounds, clientNameByPub);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const hourBucket = new Date(nowMs);
  hourBucket.setMinutes(0, 0, 0);
  const hourKey = hourBucket.toISOString();
  const dayKey = nowIso.slice(0, 10);

  let tickDl = 0;
  let tickUl = 0;

  // Preserve original connected_at timestamps for sessions already online
  const prevConnectedAt = new Map<string, string>();
  const existingLive = db.prepare('SELECT id, connected_at FROM connections_live').all() as Array<{
    id: string;
    connected_at: string;
  }>;
  for (const row of existingLive) {
    prevConnectedAt.set(row.id, row.connected_at);
  }

  db.prepare('DELETE FROM connections_live').run();
  const insertLive = db.prepare(
    `INSERT INTO connections_live (id, client_id, inbound_id, node_id, remote_ip, tunnel_ip, device, connected_at, bytes_in, bytes_out, speed_in_bps, speed_out_bps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const clientsToKick = new Set<number>();
  const activeCountByClient = new Map<number, number>();
  const excessConnectionIds: string[] = [];
  const seenLiveIds = new Set<string>();
  const seenDedicatedIfaces = new Set<string>();

  // Evaluate established connections first so newer excess sessions are the ones rejected/kicked
  live.sort((a, b) => {
    const ta = prevConnectedAt.get(a.id) || nowIso;
    const tb = prevConnectedAt.get(b.id) || nowIso;
    return ta.localeCompare(tb);
  });

  for (const s of live) {
    seenLiveIds.add(s.id);
    const client = clientByName.get(s.clientName);
    if (!client) continue;
    const inbound = inbounds.find((i) => i.id === s.inboundId);
    const nodeId = inbound?.node_id || 1;
    const mult = nodeMult.get(nodeId) ?? 1.0;

    // On first collector pass after startup, baseline persistent WireGuard interface counters so
    // bytes transferred prior to restart are not double-counted; per-session counters start at 0.
    const defaultPrev = !bootBaselineDone && s.id.startsWith('wg-') ? { in: s.bytesIn, out: s.bytesOut } : { in: 0, out: 0 };
    const prev = lastTunnelBytes.get(s.id) ?? defaultPrev;
    // Counter reset (tunnel restart): treat full current reading as new traffic delta
    const deltaIn = s.bytesIn >= prev.in ? s.bytesIn - prev.in : s.bytesIn;
    const deltaOut = s.bytesOut >= prev.out ? s.bytesOut - prev.out : s.bytesOut;
    lastTunnelBytes.set(s.id, { in: s.bytesIn, out: s.bytesOut });

    const weightedDelta = Math.round((deltaIn + deltaOut) * mult);
    tickDl += deltaOut;
    tickUl += deltaIn;

    if (client.first_connect_days && !client.first_connected_at) {
      const exp = new Date(nowMs + client.first_connect_days * 86400_000).toISOString();
      db.prepare('UPDATE clients SET first_connected_at = ?, expires_at = ? WHERE id = ?').run(nowIso, exp, client.id);
      client.first_connected_at = nowIso;
      client.expires_at = exp;
    }

    if (weightedDelta > 0) {
      client.traffic_used_bytes += weightedDelta;
      db.prepare(
        'UPDATE clients SET traffic_used_bytes = traffic_used_bytes + ?, download_bytes = download_bytes + ?, upload_bytes = upload_bytes + ?, last_online_at = ? WHERE id = ?',
      ).run(weightedDelta, deltaOut, deltaIn, nowIso, client.id);

      db.prepare('UPDATE accounts SET traffic_used_bytes = traffic_used_bytes + ? WHERE id = ?').run(
        weightedDelta,
        client.owner_id,
      );
      db.prepare('UPDATE nodes SET real_traffic_bytes = real_traffic_bytes + ? WHERE id = ?').run(
        deltaIn + deltaOut,
        nodeId,
      );
    }

    if (!isClientActiveQuota(client, nowMs)) {
      clientsToKick.add(client.id);
      continue;
    }

    const seenCount = (activeCountByClient.get(client.id) || 0) + 1;
    activeCountByClient.set(client.id, seenCount);

    insertLive.run(
      s.id,
      client.id,
      s.inboundId,
      nodeId,
      s.remoteIp,
      s.tunnelIp,
      s.device,
      prevConnectedAt.get(s.id) || nowIso,
      s.bytesIn,
      s.bytesOut,
      Math.round(deltaIn / 5),
      Math.round(deltaOut / 5),
    );

    if (client.device_limit !== null && client.device_limit > 0 && seenCount > client.device_limit) {
      excessConnectionIds.push(s.id);
    } else if (
      s.interfaceName &&
      (s.interfaceName.startsWith('ppp') || s.interfaceName.startsWith('vc') || s.interfaceName.startsWith('vpns'))
    ) {
      seenDedicatedIfaces.add(s.interfaceName);
      const effDl = client.download_mbps ?? groupDlMin.get(client.id) ?? null;
      const effUl = client.upload_mbps ?? groupUlMin.get(client.id) ?? null;
      const shapeKey = `${effDl ?? 0}:${effUl ?? 0}`;
      const prevKey = appliedDedicatedShape.get(s.interfaceName);
      if (shapeKey !== prevKey && (effDl || effUl || prevKey !== undefined)) {
        appliedDedicatedShape.set(s.interfaceName, shapeKey);
        await applyDedicatedSessionLimits(s.interfaceName, effDl, effUl).catch(() => undefined);
      }
    }
  }

  bootBaselineDone = true;
  for (const id of lastTunnelBytes.keys()) {
    if (!seenLiveIds.has(id)) lastTunnelBytes.delete(id);
  }
  for (const iface of appliedDedicatedShape.keys()) {
    if (!seenDedicatedIfaces.has(iface)) appliedDedicatedShape.delete(iface);
  }

  for (const connId of excessConnectionIds) {
    await kickConnectionById(connId, 'device_limit').catch(() => undefined);
  }

  if (clientsToKick.size > 0) {
    for (const cid of clientsToKick) {
      await kickClientConnections(cid, 'quota_or_expired').catch(() => 0);
    }
    scheduleSyncRunningInbounds();
  }

  if (tickDl > 0 || tickUl > 0) {
    db.prepare(
      `INSERT INTO traffic_samples (ts, granularity, download_bytes, upload_bytes)
       VALUES (?, 'hour', ?, ?)
       ON CONFLICT(ts, granularity) DO UPDATE SET
         download_bytes = download_bytes + excluded.download_bytes,
         upload_bytes = upload_bytes + excluded.upload_bytes`,
    ).run(hourKey, tickDl, tickUl);

    db.prepare(
      `INSERT INTO traffic_samples (ts, granularity, download_bytes, upload_bytes)
       VALUES (?, 'day', ?, ?)
       ON CONFLICT(ts, granularity) DO UPDATE SET
         download_bytes = download_bytes + excluded.download_bytes,
         upload_bytes = upload_bytes + excluded.upload_bytes`,
    ).run(dayKey, tickDl, tickUl);
  }
}

export function startCollectorLoop(): void {
  if (collectorTimer) return;
  collectorTimer = setInterval(() => {
    runCollectorTick().catch(() => undefined);
  }, 5000);
}

export function stopCollectorLoop(): void {
  if (collectorTimer) {
    clearInterval(collectorTimer);
    collectorTimer = null;
  }
}
