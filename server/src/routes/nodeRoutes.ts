import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db/database.js';
import { recordAudit } from '../services/audit.js';
import { testTcpLatency } from '../drivers/runtime.js';
import { detectInstalledProtocols, installProtocolPackage, type ProtocolName } from '../drivers/linuxEngine.js';
import type { AuthedRequest } from './context.js';

export function createNodeRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.nodes.view === 'none') {
      res.status(403).json({ error: 'No permission to view nodes' });
      return;
    }

    const db = getDb();
    const nodes = db.prepare('SELECT * FROM nodes ORDER BY is_local DESC, id ASC').all() as Array<Record<string, unknown>>;
    const inbounds = db.prepare('SELECT id, node_id, name, protocol, port, running FROM inbounds').all() as Array<{
      id: number;
      node_id: number | null;
      name: string;
      protocol: string;
      port: number;
      running: number;
    }>;
    const liveRows = db.prepare('SELECT node_id, COUNT(*) as cnt FROM connections_live GROUP BY node_id').all() as {
      node_id: number;
      cnt: number;
    }[];
    const liveMap = new Map(liveRows.map((l) => [l.node_id, l.cnt]));

    res.json({
      nodes: nodes.map((n) => {
        const id = Number(n.id);
        return {
          id,
          isLocal: Boolean(n.is_local),
          name: String(n.name),
          address: String(n.address),
          port: Number(n.port),
          multiplier: Number(n.multiplier),
          connectAddresses: JSON.parse(String(n.connect_addresses_json || '[]')) as string[],
          note: String(n.note || ''),
          enabled: Boolean(n.enabled),
          status: Boolean(n.enabled) ? String(n.status) : 'disabled',
          lastSeenAt: String(n.last_seen_at),
          cpuPct: Number(n.cpu_pct),
          memPct: Number(n.mem_pct),
          diskPct: Number(n.disk_pct),
          uptimeSec: Number(n.uptime_sec),
          realTrafficBytes: Number(n.real_traffic_bytes),
          oviraVersion: String(n.ovira_version),
          openvpnVersion: String(n.openvpn_version),
          wireguardReady: Boolean(n.wireguard_ready),
          openconnectVersion: String(n.openconnect_version),
          ikev2Ready: Boolean(n.ikev2_ready),
          l2tpReady: Boolean(n.l2tp_ready),
          onlineCount: liveMap.get(id) || 0,
          inbounds: inbounds
            .filter((i) => i.node_id === id)
            .map((i) => ({ ...i, running: Boolean(i.running) })),
        };
      }),
    });
  });

  router.post('/', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.nodes.manage === 'none') {
      res.status(403).json({ error: 'No permission to add nodes' });
      return;
    }

    const body = req.body as {
      name?: string;
      address?: string;
      port?: number;
      nodeKey?: string;
      multiplier?: number;
      connectAddresses?: string[];
      note?: string;
      enabled?: boolean;
    };

    if (!body.name?.trim() || !body.address?.trim()) {
      res.status(400).json({ error: 'Node name and address are required' });
      return;
    }

    const port = Number(body.port || 62060);
    const probe = await testTcpLatency(body.address.trim(), port, 1500);
    const now = new Date().toISOString();

    const info = getDb()
      .prepare(
        `INSERT INTO nodes (is_local, name, address, port, node_key, multiplier, connect_addresses_json, note, enabled, status, last_seen_at)
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.name.trim(),
        body.address.trim(),
        port,
        body.nodeKey?.trim() || crypto.randomBytes(16).toString('hex'),
        Number(body.multiplier ?? 1.0),
        JSON.stringify(body.connectAddresses || []),
        body.note || '',
        body.enabled === false ? 0 : 1,
        probe.reachable ? 'connected' : 'unreachable',
        now,
      );

    recordAudit({ accountId: acc.id, username: acc.username, action: 'node.create', target: body.name.trim(), ip: req.clientIp });
    res.status(201).json({ id: Number(info.lastInsertRowid), reachable: probe.reachable });
  });

  router.patch('/:id', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.nodes.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const body = req.body as {
      name?: string;
      address?: string;
      port?: number;
      nodeKey?: string;
      multiplier?: number;
      connectAddresses?: string[];
      note?: string;
      enabled?: boolean;
    };

    db.prepare(
      `UPDATE nodes SET name = ?, address = ?, port = ?, node_key = ?, multiplier = ?, connect_addresses_json = ?, note = ?, enabled = ? WHERE id = ?`,
    ).run(
      body.name?.trim() || String(existing.name),
      body.address?.trim() || String(existing.address),
      body.port ?? Number(existing.port),
      body.nodeKey?.trim() || String(existing.node_key),
      body.multiplier ?? Number(existing.multiplier),
      body.connectAddresses ? JSON.stringify(body.connectAddresses) : String(existing.connect_addresses_json),
      body.note !== undefined ? body.note : String(existing.note || ''),
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(existing.enabled),
      id,
    );

    recordAudit({ accountId: acc.id, username: acc.username, action: 'node.update', target: String(existing.name), ip: req.clientIp });
    res.json({ ok: true });
  });

  router.post('/:id/attach', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.nodes.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const nodeId = Number(req.params.id);
    const { inboundId } = req.body as { inboundId?: number };
    if (!inboundId) {
      res.status(400).json({ error: 'inboundId is required' });
      return;
    }
    const db = getDb();
    const inbound = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(Number(inboundId)) as
      | { id: number; name: string; port: number; transport: string; subnet: string }
      | undefined;
    if (!inbound) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    const conflict = db
      .prepare('SELECT name FROM inbounds WHERE node_id = ? AND port = ? AND id != ?')
      .get(nodeId, inbound.port, inbound.id) as { name: string } | undefined;
    if (conflict) {
      res.status(400).json({ error: `Port ${inbound.port} is already used on this node by ${conflict.name}` });
      return;
    }
    db.prepare('UPDATE inbounds SET node_id = ?, running = 1 WHERE id = ?').run(nodeId, inbound.id);
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.assign', target: inbound.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.post('/:id/detach', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.nodes.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const { inboundId } = req.body as { inboundId?: number };
    if (!inboundId) {
      res.status(400).json({ error: 'inboundId is required' });
      return;
    }
    const db = getDb();
    db.prepare('UPDATE inbounds SET node_id = NULL, running = 0 WHERE id = ?').run(Number(inboundId));
    db.prepare('DELETE FROM connections_live WHERE inbound_id = ?').run(Number(inboundId));
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.unassign', target: String(inboundId), ip: req.clientIp });
    res.json({ ok: true });
  });

  router.get('/:id/protocols', async (_req: AuthedRequest, res) => {
    const protocols = await detectInstalledProtocols();
    res.json({ protocols });
  });

  router.post('/:id/protocols/install', async (req: AuthedRequest, res) => {
    if (!req.auth!.account.isOwner) {
      res.status(403).json({ error: 'Owner permission required' });
      return;
    }
    const { protocol } = req.body as { protocol?: ProtocolName };
    if (!protocol) {
      res.status(400).json({ error: 'Protocol is required' });
      return;
    }
    const result = await installProtocolPackage(protocol);
    res.json(result);
  });

  router.post('/:id/reset-traffic', (req: AuthedRequest, res) => {
    if (!req.auth!.account.isOwner) {
      res.status(403).json({ error: 'Owner permission required' });
      return;
    }
    getDb().prepare('UPDATE nodes SET real_traffic_bytes = 0 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.delete('/:id', (req: AuthedRequest, res) => {
    if (!req.auth!.account.isOwner) {
      res.status(403).json({ error: 'Owner permission required' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const node = db.prepare('SELECT is_local, name FROM nodes WHERE id = ?').get(id) as
      | { is_local: number; name: string }
      | undefined;
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    if (node.is_local) {
      res.status(400).json({ error: 'Cannot delete local server node; disable it instead' });
      return;
    }
    db.prepare('UPDATE inbounds SET node_id = NULL, running = 0 WHERE node_id = ?').run(id);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'node.delete', target: node.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  return router;
}
