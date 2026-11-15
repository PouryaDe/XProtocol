import { getDb } from '../db/database.js';
import { collectLinuxLiveTunnels } from '../drivers/linuxEngine.js';
import type { InboundRow } from '../generators/configs.js';

let collectorTimer: NodeJS.Timeout | null = null;
const lastTunnelBytes = new Map<string, { in: number; out: number }>();

export async function runCollectorTick(): Promise<void> {
  if (process.platform !== 'linux') return;

  const db = getDb();
  const inbounds = db.prepare('SELECT * FROM inbounds WHERE running = 1').all() as unknown as InboundRow[];
  if (inbounds.length === 0) return;

  const clients = db.prepare('SELECT id, name, owner_id, wg_public_key, traffic_limit_bytes, traffic_used_bytes, expires_at, first_connect_days, first_connected_at, enabled FROM clients').all() as Array<{
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
  }>;

  const clientByName = new Map(clients.map((c) => [c.name, c]));
  const clientNameByPub = new Map(clients.map((c) => [c.wg_public_key, c.name]));

  const nodes = db.prepare('SELECT id, multiplier FROM nodes').all() as { id: number; multiplier: number }[];
  const nodeMult = new Map(nodes.map((n) => [n.id, n.multiplier]));

  const live = await collectLinuxLiveTunnels(inbounds, clientNameByPub);
  const nowIso = new Date().toISOString();
  const hourBucket = new Date();
  hourBucket.setMinutes(0, 0, 0);
  const hourKey = hourBucket.toISOString();
  const dayKey = nowIso.slice(0, 10);

  let tickDl = 0;
  let tickUl = 0;

  // Replace live table snapshot
  db.prepare('DELETE FROM connections_live').run();
  const insertLive = db.prepare(
    `INSERT INTO connections_live (id, client_id, inbound_id, node_id, remote_ip, tunnel_ip, device, connected_at, bytes_in, bytes_out, speed_in_bps, speed_out_bps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const s of live) {
    const client = clientByName.get(s.clientName);
    if (!client) continue;
    const inbound = inbounds.find((i) => i.id === s.inboundId);
    const nodeId = inbound?.node_id || 1;
    const mult = nodeMult.get(nodeId) ?? 1.0;

    const prev = lastTunnelBytes.get(s.id) || { in: s.bytesIn, out: s.bytesOut };
    const deltaIn = Math.max(0, s.bytesIn - prev.in);
    const deltaOut = Math.max(0, s.bytesOut - prev.out);
    lastTunnelBytes.set(s.id, { in: s.bytesIn, out: s.bytesOut });

    const weightedDelta = Math.round((deltaIn + deltaOut) * mult);
    tickDl += deltaOut;
    tickUl += deltaIn;

    // Activate first_connect_days clock on first connection
    if (client.first_connect_days && !client.first_connected_at) {
      const exp = new Date(Date.now() + client.first_connect_days * 86400_000).toISOString();
      db.prepare('UPDATE clients SET first_connected_at = ?, expires_at = ? WHERE id = ?').run(nowIso, exp, client.id);
    }

    if (weightedDelta > 0) {
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

    insertLive.run(
      s.id,
      client.id,
      s.inboundId,
      nodeId,
      s.remoteIp,
      s.tunnelIp,
      s.device,
      nowIso,
      s.bytesIn,
      s.bytesOut,
      Math.round(deltaIn / 5),
      Math.round(deltaOut / 5),
    );
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
