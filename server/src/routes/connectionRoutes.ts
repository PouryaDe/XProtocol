import { Router } from 'express';
import { getDb } from '../db/database.js';
import { recordAudit } from '../services/audit.js';
import { kickConnectionById } from '../services/syncService.js';
import type { AuthedRequest } from './context.js';

export function createConnectionRouter(): Router {
  const router = Router();

  router.get('/live', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.connections.view === 'none') {
      res.status(403).json({ error: 'No permission to view connections' });
      return;
    }
    const db = getDb();
    const ownOnly = !acc.isOwner && acc.permissions.connections.view === 'own';

    const rows = (
      ownOnly
        ? db
            .prepare(
              `SELECT l.*, c.name as client_name, c.device_limit, i.name as inbound_name, i.protocol, n.name as node_name
               FROM connections_live l
               JOIN clients c ON c.id = l.client_id
               JOIN inbounds i ON i.id = l.inbound_id
               JOIN nodes n ON n.id = l.node_id
               WHERE c.owner_id = ?
               ORDER BY l.connected_at DESC`,
            )
            .all(acc.id)
        : db
            .prepare(
              `SELECT l.*, c.name as client_name, c.device_limit, i.name as inbound_name, i.protocol, n.name as node_name
               FROM connections_live l
               JOIN clients c ON c.id = l.client_id
               JOIN inbounds i ON i.id = l.inbound_id
               JOIN nodes n ON n.id = l.node_id
               ORDER BY l.connected_at DESC`,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    res.json({
      connections: rows.map((r) => ({
        id: String(r.id),
        clientId: Number(r.client_id),
        clientName: String(r.client_name),
        deviceLimit: r.device_limit === null ? null : Number(r.device_limit),
        inboundId: Number(r.inbound_id),
        inboundName: String(r.inbound_name),
        protocol: String(r.protocol),
        nodeId: Number(r.node_id),
        nodeName: String(r.node_name),
        remoteIp: String(r.remote_ip),
        tunnelIp: String(r.tunnel_ip),
        device: String(r.device),
        connectedAt: String(r.connected_at),
        bytesIn: Number(r.bytes_in),
        bytesOut: Number(r.bytes_out),
        speedInBps: Number(r.speed_in_bps),
        speedOutBps: Number(r.speed_out_bps),
      })),
    });
  });

  router.get('/history', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.connections.view === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const db = getDb();
    const ownOnly = !acc.isOwner && acc.permissions.connections.view === 'own';
    const rows = (
      ownOnly
        ? db
            .prepare(
              `SELECT h.* FROM connections_history h
               JOIN clients c ON c.id = h.client_id
               WHERE c.owner_id = ?
               ORDER BY h.disconnected_at DESC LIMIT 200`,
            )
            .all(acc.id)
        : db.prepare('SELECT * FROM connections_history ORDER BY disconnected_at DESC LIMIT 200').all()
    ) as Array<Record<string, unknown>>;

    res.json({
      history: rows.map((r) => ({
        id: String(r.id),
        clientId: r.client_id ? Number(r.client_id) : null,
        clientName: String(r.client_name),
        inboundName: String(r.inbound_name),
        protocol: String(r.protocol),
        nodeName: String(r.node_name),
        remoteIp: String(r.remote_ip),
        tunnelIp: String(r.tunnel_ip),
        device: String(r.device),
        connectedAt: String(r.connected_at),
        disconnectedAt: String(r.disconnected_at),
        durationSec: Number(r.duration_sec),
        bytesTotal: Number(r.bytes_total),
        reason: String(r.reason),
      })),
    });
  });

  router.post('/:id/disconnect', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.connections.disconnect === 'none') {
      res.status(403).json({ error: 'No permission to disconnect clients' });
      return;
    }
    const id = String(req.params.id);
    const db = getDb();
    const check = db
      .prepare('SELECT c.owner_id, c.name as client_name FROM connections_live l JOIN clients c ON c.id = l.client_id WHERE l.id = ?')
      .get(id) as { owner_id: number; client_name: string } | undefined;
    if (!check) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (!acc.isOwner && acc.permissions.connections.disconnect === 'own' && Number(check.owner_id) !== acc.id) {
      res.status(403).json({ error: 'No permission' });
      return;
    }

    await kickConnectionById(id, 'admin_kick');
    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'connection.kick',
      target: check.client_name,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  return router;
}
