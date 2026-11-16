import { getDb } from '../db/database.js';
import {
  applyDedicatedSessionLimits,
  applyInterfaceSpeedLimits,
  collectLinuxLiveTunnels,
  disconnectLinuxPeer,
  type LiveTunnelSample,
} from '../drivers/linuxEngine.js';
import { writeLiveClientCounts } from '../drivers/pki.js';
import type { InboundRow, PeerEntry } from '../generators/configs.js';
import { isClientActiveQuota } from './peerResolver.js';
import { kickClientConnections, scheduleSyncRunningInbounds } from './syncService.js';

let collectorTimer: NodeJS.Timeout | null = null;
let bootBaselineDone = false;
const lastTunnelBytes = new Map<string, { in: number; out: number }>();
const lastActivityAt = new Map<string, number>();
const appliedDedicatedShape = new Map<string, string>();
const appliedSharedOvpnShape = new Map<string, string>();
const wgSuppressedClients = new Set<number>();

export interface SessionCapCandidate {
  id: string;
  isWireGuard: boolean;
  connectedAtMs: number;
  lastActiveMs: number;
}

/**
 * Partition one client's concurrent sessions across all protocols into kept vs excess/evicted IDs.
 * Stale WireGuard sessions (no RX bytes for >45s despite PersistentKeepalive) yield to new active
 * connections first; otherwise established connections keep their slot(s) and excess newcomers are cut.
 */
export function selectSessionsWithinLimit(
  sessions: SessionCapCandidate[],
  deviceLimit: number | null,
  nowMs: number,
): { keepIds: Set<string>; evictIds: string[] } {
  const keepIds = new Set<string>();
  const evictIds: string[] = [];
  if (deviceLimit === null || deviceLimit <= 0 || sessions.length <= deviceLimit) {
    for (const s of sessions) keepIds.add(s.id);
    return { keepIds, evictIds };
  }

  const ordered = [...sessions].sort((a, b) => {
    const aStale = a.isWireGuard && a.lastActiveMs > 0 && nowMs - a.lastActiveMs > 45_000;
    const bStale = b.isWireGuard && b.lastActiveMs > 0 && nowMs - b.lastActiveMs > 45_000;
    if (aStale !== bStale) return aStale ? 1 : -1;
    return a.connectedAtMs - b.connectedAtMs;
  });

  for (let idx = 0; idx < ordered.length; idx += 1) {
    if (idx < deviceLimit) keepIds.add(ordered[idx].id);
    else evictIds.push(ordered[idx].id);
  }
  return { keepIds, evictIds };
}

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
  const clientByNameLower = new Map(clients.map((c) => [c.name.toLowerCase(), c]));
  const clientNameByPub = new Map(clients.map((c) => [c.wg_public_key, c.name]));

  const nodes = db.prepare('SELECT id, name, multiplier FROM nodes').all() as { id: number; name: string; multiplier: number }[];
  const nodeMult = new Map(nodes.map((n) => [n.id, n.multiplier]));
  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));

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
  const seenLiveIds = new Set<string>();
  const seenDedicatedIfaces = new Set<string>();
  const seenOvpnIfaces = new Set<string>();
  let needSyncAfterTick = false;

  interface ProcessedSample {
    sample: LiveTunnelSample;
    client: (typeof clients)[number];
    inbound: InboundRow;
    nodeId: number;
    connectedAtIso: string;
    connectedAtMs: number;
    deltaIn: number;
    deltaOut: number;
    effDl: number | null;
    effUl: number | null;
  }

  const perClientSessions = new Map<number, ProcessedSample[]>();

  for (const s of live) {
    seenLiveIds.add(s.id);
    const client = clientByName.get(s.clientName) ?? clientByNameLower.get(s.clientName.toLowerCase());
    if (!client) continue;
    const inbound = inbounds.find((i) => i.id === s.inboundId);
    if (!inbound) continue;
    const nodeId = inbound.node_id || 1;
    const mult = nodeMult.get(nodeId) ?? 1.0;

    // On first collector pass after startup, baseline persistent WireGuard interface counters so
    // bytes transferred prior to restart are not double-counted; per-session counters start at 0.
    const defaultPrev = !bootBaselineDone && s.id.startsWith('wg-') ? { in: s.bytesIn, out: s.bytesOut } : { in: 0, out: 0 };
    const prev = lastTunnelBytes.get(s.id) ?? defaultPrev;
    // Counter reset (tunnel restart): treat full current reading as new traffic delta
    const deltaIn = s.bytesIn >= prev.in ? s.bytesIn - prev.in : s.bytesIn;
    const deltaOut = s.bytesOut >= prev.out ? s.bytesOut - prev.out : s.bytesOut;
    lastTunnelBytes.set(s.id, { in: s.bytesIn, out: s.bytesOut });
    if (deltaIn > 0 || !lastActivityAt.has(s.id)) {
      lastActivityAt.set(s.id, nowMs);
    }

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

    const connectedAtIso = prevConnectedAt.get(s.id) || nowIso;
    const effDl = client.download_mbps ?? groupDlMin.get(client.id) ?? null;
    const effUl = client.upload_mbps ?? groupUlMin.get(client.id) ?? null;
    const list = perClientSessions.get(client.id) || [];
    list.push({
      sample: s,
      client,
      inbound,
      nodeId,
      connectedAtIso,
      connectedAtMs: Date.parse(connectedAtIso) || nowMs,
      deltaIn,
      deltaOut,
      effDl,
      effUl,
    });
    perClientSessions.set(client.id, list);
  }

  const liveCountsByLowerName: Record<string, number> = {};
  const ovpnPeersByIface = new Map<string, PeerEntry[]>();
  const excessItems: ProcessedSample[] = [];

  for (const [clientId, items] of perClientSessions) {
    const client = items[0].client;
    const { keepIds, evictIds } = selectSessionsWithinLimit(
      items.map((it) => ({
        id: it.sample.id,
        isWireGuard: it.sample.id.startsWith('wg-'),
        connectedAtMs: it.connectedAtMs,
        lastActiveMs: lastActivityAt.get(it.sample.id) ?? nowMs,
      })),
      client.device_limit,
      nowMs,
    );

    const evictSet = new Set(evictIds);
    for (const it of items) {
      if (evictSet.has(it.sample.id)) {
        excessItems.push(it);
        if (it.sample.id.startsWith('wg-')) {
          wgSuppressedClients.add(clientId);
          needSyncAfterTick = true;
        }
        continue;
      }
      if (!keepIds.has(it.sample.id)) continue;

      const lname = client.name.toLowerCase();
      liveCountsByLowerName[lname] = (liveCountsByLowerName[lname] || 0) + 1;

      insertLive.run(
        it.sample.id,
        client.id,
        it.sample.inboundId,
        it.nodeId,
        it.sample.remoteIp,
        it.sample.tunnelIp,
        it.sample.device,
        it.connectedAtIso,
        it.sample.bytesIn,
        it.sample.bytesOut,
        Math.round(it.deltaIn / 5),
        Math.round(it.deltaOut / 5),
      );

      if (it.inbound.protocol === 'openvpn' && it.sample.tunnelIp) {
        const tunIface = it.sample.interfaceName || `tun-${it.inbound.name}`;
        seenOvpnIfaces.add(tunIface);
        const list = ovpnPeersByIface.get(tunIface) || [];
        list.push({
          clientId: client.id,
          name: client.name,
          wgPublicKey: client.wg_public_key,
          tunnelIp: it.sample.tunnelIp,
          downloadMbps: it.effDl,
          uploadMbps: it.effUl,
        });
        ovpnPeersByIface.set(tunIface, list);
      } else if (
        it.sample.interfaceName &&
        (it.sample.interfaceName.startsWith('ppp') ||
          it.sample.interfaceName.startsWith('vc') ||
          it.sample.interfaceName.startsWith('vpns'))
      ) {
        seenDedicatedIfaces.add(it.sample.interfaceName);
        const shapeKey = `${it.effDl ?? 0}:${it.effUl ?? 0}`;
        const prevKey = appliedDedicatedShape.get(it.sample.interfaceName);
        if (shapeKey !== prevKey && (it.effDl || it.effUl || prevKey !== undefined)) {
          appliedDedicatedShape.set(it.sample.interfaceName, shapeKey);
          await applyDedicatedSessionLimits(it.sample.interfaceName, it.effDl, it.effUl).catch(() => undefined);
        }
      }
    }

    const hasActiveWg = items.some((it) => keepIds.has(it.sample.id) && it.sample.id.startsWith('wg-'));
    if (
      !hasActiveWg &&
      client.device_limit !== null &&
      client.device_limit > 0 &&
      keepIds.size >= client.device_limit
    ) {
      if (!wgSuppressedClients.has(clientId)) {
        wgSuppressedClients.add(clientId);
        needSyncAfterTick = true;
      }
    } else if (
      wgSuppressedClients.has(clientId) &&
      (client.device_limit === null || client.device_limit <= 0 || keepIds.size < client.device_limit)
    ) {
      wgSuppressedClients.delete(clientId);
      needSyncAfterTick = true;
    }
  }

  for (const clientId of [...wgSuppressedClients]) {
    if (!perClientSessions.has(clientId)) {
      wgSuppressedClients.delete(clientId);
      needSyncAfterTick = true;
    }
  }

  // Shape OpenVPN virtual client IPs dynamically by live session IP (required for server-assigned pool IPs & duplicate-cn)
  for (const ib of inbounds) {
    if (ib.protocol !== 'openvpn' || !ib.running) continue;
    const tunIface = `tun-${ib.name}`;
    const ovpnPeers = ovpnPeersByIface.get(tunIface) || [];
    const sig = ovpnPeers
      .map((p) => `${p.tunnelIp}:${p.downloadMbps ?? 0}:${p.uploadMbps ?? 0}`)
      .sort()
      .join('|');
    if (sig !== (appliedSharedOvpnShape.get(tunIface) ?? '')) {
      appliedSharedOvpnShape.set(tunIface, sig);
      await applyInterfaceSpeedLimits(tunIface, ovpnPeers).catch(() => undefined);
    }
  }
  for (const iface of appliedSharedOvpnShape.keys()) {
    if (!seenOvpnIfaces.has(iface) && !inbounds.some((ib) => ib.protocol === 'openvpn' && `tun-${ib.name}` === iface)) {
      appliedSharedOvpnShape.delete(iface);
    }
  }

  try {
    writeLiveClientCounts(liveCountsByLowerName);
  } catch {
    // ignore in restricted environments
  }

  bootBaselineDone = true;
  for (const id of lastTunnelBytes.keys()) {
    if (!seenLiveIds.has(id)) {
      lastTunnelBytes.delete(id);
      lastActivityAt.delete(id);
    }
  }
  for (const iface of appliedDedicatedShape.keys()) {
    if (!seenDedicatedIfaces.has(iface)) appliedDedicatedShape.delete(iface);
  }

  for (const ex of excessItems) {
    await disconnectLinuxPeer(ex.inbound, {
      clientName: ex.client.name,
      wgPublicKey: ex.client.wg_public_key,
      connectionId: ex.sample.id,
    }).catch(() => undefined);
    const durSec = Math.max(1, Math.round((nowMs - ex.connectedAtMs) / 1000));
    db.prepare(
      `INSERT INTO connections_history (id, client_id, client_name, inbound_id, inbound_name, protocol, node_id, node_name, remote_ip, tunnel_ip, device, connected_at, disconnected_at, duration_sec, bytes_total, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ex.client.id,
      ex.client.name,
      ex.inbound.id,
      ex.inbound.name,
      ex.inbound.protocol,
      ex.nodeId,
      nodeNameById.get(ex.nodeId) || 'This server',
      ex.sample.remoteIp,
      ex.sample.tunnelIp,
      ex.sample.device,
      ex.connectedAtIso,
      nowIso,
      durSec,
      ex.sample.bytesIn + ex.sample.bytesOut,
      'device_limit',
    );
  }

  if (clientsToKick.size > 0) {
    for (const cid of clientsToKick) {
      await kickClientConnections(cid, 'quota_or_expired').catch(() => 0);
    }
    needSyncAfterTick = true;
  }

  if (needSyncAfterTick) {
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
