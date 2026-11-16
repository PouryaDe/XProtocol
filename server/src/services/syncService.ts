import { getDb } from '../db/database.js';
import { disconnectLinuxPeer, syncLinuxInboundPeers } from '../drivers/linuxEngine.js';
import type { InboundRow } from '../generators/configs.js';
import { getEligiblePeersForInbound } from './peerResolver.js';

let syncInFlight: Promise<void> | null = null;
let syncQueued = false;

async function runSyncPass(): Promise<void> {
  const db = getDb();
  const runningInbounds = db
    .prepare('SELECT * FROM inbounds WHERE running = 1 AND node_id IS NOT NULL')
    .all() as unknown as InboundRow[];

  for (const ib of runningInbounds) {
    const peers = getEligiblePeersForInbound(ib.id, ib.subnet);
    await syncLinuxInboundPeers(ib, peers).catch(() => undefined);
  }
}

export async function syncRunningInbounds(): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }
  syncInFlight = (async () => {
    try {
      await runSyncPass();
      while (syncQueued) {
        syncQueued = false;
        await runSyncPass();
      }
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

export function scheduleSyncRunningInbounds(): void {
  syncRunningInbounds().catch(() => undefined);
}

export async function kickConnectionById(
  connectionId: string,
  reason = 'admin_kick',
): Promise<{ found: boolean; row?: Record<string, unknown> }> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.*, c.name as client_name, c.wg_public_key, c.owner_id,
              i.*, i.name as inbound_name, n.name as node_name
       FROM connections_live l
       JOIN clients c ON c.id = l.client_id
       JOIN inbounds i ON i.id = l.inbound_id
       JOIN nodes n ON n.id = l.node_id
       WHERE l.id = ?`,
    )
    .get(connectionId) as Record<string, unknown> | undefined;

  if (!row) return { found: false };

  const inbound = row as unknown as InboundRow;
  await disconnectLinuxPeer(inbound, {
    clientName: String(row.client_name),
    wgPublicKey: String(row.wg_public_key || ''),
    connectionId,
  }).catch(() => undefined);

  const now = new Date().toISOString();
  const durationSec = Math.max(1, Math.round((Date.now() - new Date(String(row.connected_at)).getTime()) / 1000));
  db.prepare(
    `INSERT INTO connections_history (id, client_id, client_name, inbound_id, inbound_name, protocol, node_id, node_name, remote_ip, tunnel_ip, device, connected_at, disconnected_at, duration_sec, bytes_total, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    Number(row.client_id),
    String(row.client_name),
    Number(row.inbound_id),
    String(row.inbound_name),
    String(row.protocol),
    Number(row.node_id),
    String(row.node_name),
    String(row.remote_ip),
    String(row.tunnel_ip),
    String(row.device),
    String(row.connected_at),
    now,
    durationSec,
    Number(row.bytes_in) + Number(row.bytes_out),
    reason,
  );
  db.prepare('DELETE FROM connections_live WHERE id = ?').run(connectionId);

  return { found: true, row };
}

export async function kickClientConnections(clientId: number, reason = 'admin_kick'): Promise<number> {
  const db = getDb();
  const conns = db.prepare('SELECT id FROM connections_live WHERE client_id = ?').all(clientId) as { id: string }[];
  let count = 0;
  for (const c of conns) {
    const res = await kickConnectionById(c.id, reason);
    if (res.found) count += 1;
  }
  return count;
}
