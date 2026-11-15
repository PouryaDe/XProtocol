import { Router } from 'express';
import { getDb } from '../db/database.js';
import { generateWireGuardKeypair } from '../security/auth.js';
import { applyInboundRuntime } from '../drivers/runtime.js';
import { renderInboundServerConfig, type InboundRow, type PeerEntry } from '../generators/configs.js';
import { recordAudit } from '../services/audit.js';
import type { AuthedRequest } from './context.js';

function getInboundPeers(inboundId: number, subnet: string): PeerEntry[] {
  const db = getDb();
  const baseNet = subnet.split('/')[0].split('.').slice(0, 3).join('.');
  const clients = db
    .prepare('SELECT id, name, wg_public_key, fixed_ip FROM clients WHERE enabled = 1')
    .all() as Array<{ id: number; name: string; wg_public_key: string; fixed_ip: string }>;
  return clients.map((c) => ({
    clientId: c.id,
    name: c.name,
    wgPublicKey: c.wg_public_key,
    tunnelIp: c.fixed_ip || `${baseNet}.${2 + (c.id % 240)}`,
  }));
}

export function createInboundRouter(driverMode: 'linux' | 'mock'): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.inbounds.view === 'none') {
      res.status(403).json({ error: 'No permission to view inbounds' });
      return;
    }

    const db = getDb();
    let rows = db
      .prepare(
        `SELECT i.*, n.name as node_name, n.status as node_status, n.is_local as node_is_local, c.domain_or_ip as cert_domain
         FROM inbounds i
         LEFT JOIN nodes n ON n.id = i.node_id
         LEFT JOIN certificates c ON c.id = i.cert_id
         ORDER BY i.id ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    if (!acc.isOwner && acc.permissions.inbounds.view === 'granted') {
      rows = rows.filter((r) => acc.allowedInboundIds.includes(Number(r.id)));
    }

    const liveCounts = db.prepare('SELECT inbound_id, COUNT(*) as cnt FROM connections_live GROUP BY inbound_id').all() as {
      inbound_id: number;
      cnt: number;
    }[];
    const liveMap = new Map(liveCounts.map((l) => [l.inbound_id, l.cnt]));

    res.json({
      inbounds: rows.map((r) => ({
        id: Number(r.id),
        nodeId: r.node_id === null ? null : Number(r.node_id),
        nodeName: r.node_name ? String(r.node_name) : null,
        nodeStatus: r.node_status ? String(r.node_status) : null,
        nodeIsLocal: Boolean(r.node_is_local),
        protocol: String(r.protocol),
        name: String(r.name),
        transport: String(r.transport),
        port: Number(r.port),
        subnet: String(r.subnet),
        authMode: String(r.auth_mode),
        description: String(r.description || ''),
        publicAddressOverride: String(r.public_address_override || ''),
        enabled: Boolean(r.enabled),
        running: Boolean(r.running),
        certId: r.cert_id === null ? null : Number(r.cert_id),
        certDomain: r.cert_domain ? String(r.cert_domain) : null,
        serverPublicKey: String(r.server_public_key || ''),
        settings: JSON.parse(String(r.settings_json || '{}')),
        onlineCount: liveMap.get(Number(r.id)) || 0,
        createdAt: String(r.created_at),
      })),
    });
  });

  router.post('/', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission to create inbounds' });
      return;
    }

    const body = req.body as {
      nodeId?: number | null;
      nodeIds?: number[];
      protocol?: string;
      name?: string;
      transport?: string;
      port?: number;
      subnet?: string;
      authMode?: string;
      description?: string;
      publicAddressOverride?: string;
      enabled?: boolean;
      certId?: number | null;
      settings?: Record<string, unknown>;
      groupIds?: number[];
    };

    const name = (body.name || '').trim();
    if (!/^[a-z0-9-]{2,32}$/.test(name)) {
      res.status(400).json({ error: 'Inbound name must be lowercase letters, digits and dashes (2-32 chars)' });
      return;
    }
    const port = Number(body.port || 0);
    if (port < 1 || port > 65535) {
      res.status(400).json({ error: 'Port must be 1-65535' });
      return;
    }

    const protocol = body.protocol || 'wireguard';
    const keys =
      protocol === 'wireguard' || protocol === 'amneziawg'
        ? generateWireGuardKeypair()
        : { privateKey: '', publicKey: '' };

    const db = getDb();
    const targetNodeIds =
      body.nodeIds && body.nodeIds.length > 0
        ? body.nodeIds
        : body.nodeId
          ? [body.nodeId]
          : [null];

    const createdIds: number[] = [];
    try {
      for (let i = 0; i < targetNodeIds.length; i++) {
        const nid = targetNodeIds[i];
        const instanceName = targetNodeIds.length > 1 ? `${name}-n${nid}` : name;
        const shouldRun = nid && body.enabled !== false ? 1 : 0;
        const info = db
          .prepare(
            `INSERT INTO inbounds (node_id, protocol, name, transport, port, subnet, auth_mode, description, public_address_override, enabled, running, cert_id, server_public_key, server_private_key, settings_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            nid ?? null,
            protocol,
            instanceName,
            body.transport || 'udp',
            port,
            body.subnet || '10.69.0.0/24',
            body.authMode || (protocol === 'wireguard' || protocol === 'amneziawg' ? 'device_keys' : 'certificate_password'),
            body.description || '',
            body.publicAddressOverride || '',
            body.enabled === false ? 0 : 1,
            shouldRun,
            body.certId ?? null,
            keys.publicKey,
            keys.privateKey,
            JSON.stringify(body.settings || { dns: '1.1.1.1, 8.8.8.8' }),
            new Date().toISOString(),
          );
        const id = Number(info.lastInsertRowid);
        createdIds.push(id);
        for (const gid of body.groupIds || []) {
          db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gid, id);
        }
        if (shouldRun) {
          const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as unknown as InboundRow;
          await applyInboundRuntime(driverMode, row, getInboundPeers(id, row.subnet), 'start');
        }
      }
      recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.create', target: name, ip: req.clientIp });
      res.status(201).json({ id: createdIds[0], ids: createdIds });
    } catch (err) {
      res.status(400).json({ error: `Could not create inbound: ${String(err)}` });
    }
  });

  router.patch('/:id', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }

    const body = req.body as {
      transport?: string;
      port?: number;
      subnet?: string;
      authMode?: string;
      description?: string;
      publicAddressOverride?: string;
      enabled?: boolean;
      certId?: number | null;
      settings?: Record<string, unknown>;
    };

    db.prepare(
      `UPDATE inbounds SET transport = ?, port = ?, subnet = ?, auth_mode = ?, description = ?, public_address_override = ?, enabled = ?, cert_id = ?, settings_json = ? WHERE id = ?`,
    ).run(
      body.transport ?? existing.transport,
      body.port ?? existing.port,
      body.subnet ?? existing.subnet,
      body.authMode ?? existing.auth_mode,
      body.description ?? existing.description,
      body.publicAddressOverride ?? existing.public_address_override,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      body.certId !== undefined ? body.certId : existing.cert_id,
      body.settings ? JSON.stringify(body.settings) : existing.settings_json,
      id,
    );

    const updated = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as unknown as InboundRow;
    if (updated.node_id && updated.running) {
      await applyInboundRuntime(driverMode, updated, getInboundPeers(id, updated.subnet), 'restart');
    }
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.update', target: existing.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.get('/:id/config', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    const rendered = renderInboundServerConfig(row, getInboundPeers(id, row.subnet));
    const logs = [
      `[${new Date().toISOString()}] inbound=${row.name} protocol=${row.protocol} port=${row.port}`,
      `[${new Date().toISOString()}] state=${row.running ? 'running' : 'stopped'} subnet=${row.subnet}`,
      `[${new Date().toISOString()}] config_path=${rendered.path}`,
    ];
    res.json({ path: rendered.path, content: rendered.content, logs });
  });

  router.post('/:id/:action', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const action = req.params.action as 'start' | 'stop' | 'restart';
    if (!['start', 'stop', 'restart'].includes(action)) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    if (!row.node_id && action !== 'stop') {
      res.status(400).json({ error: 'Attach this inbound to a node before starting it' });
      return;
    }
    const result = await applyInboundRuntime(driverMode, row, getInboundPeers(id, row.subnet), action);
    const nextRunning = action === 'stop' ? 0 : 1;
    db.prepare('UPDATE inbounds SET running = ? WHERE id = ?').run(nextRunning, id);
    res.json({ ok: result.ok, running: Boolean(nextRunning), logs: result.logs });
  });

  router.delete('/:id', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    if (row.running) {
      await applyInboundRuntime(driverMode, row, [], 'stop');
    }
    db.prepare('DELETE FROM inbounds WHERE id = ?').run(id);
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.delete', target: row.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  return router;
}
