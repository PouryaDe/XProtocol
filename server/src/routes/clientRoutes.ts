import { Router } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { generateWireGuardKeypair, randomToken } from '../security/auth.js';
import { recordAudit } from '../services/audit.js';
import { computeClientState, ensureAccountOperational, type AuthedRequest } from './context.js';
import { getEffectiveLimits } from '../security/rbac.js';
import { generateClientProfile } from '../generators/profiles.js';
import type { InboundRow } from '../generators/configs.js';

const GB = 1024 * 1024 * 1024;

export function resolveClientInbounds(clientId: number): (InboundRow & { node_name: string; node_address: string; connect_addresses_json: string })[] {
  const db = getDb();
  const groupRows = db
    .prepare(
      `SELECT g.id, g.all_inbounds FROM client_groups cg
       JOIN groups g ON g.id = cg.group_id
       WHERE cg.client_id = ? AND g.enabled = 1`,
    )
    .all(clientId) as { id: number; all_inbounds: number }[];

  const inboundIds = new Set<number>();
  let allInbounds = false;
  for (const g of groupRows) {
    if (g.all_inbounds) {
      allInbounds = true;
      break;
    }
    const gInbs = db.prepare('SELECT inbound_id FROM group_inbounds WHERE group_id = ?').all(g.id) as {
      inbound_id: number;
    }[];
    for (const gi of gInbs) inboundIds.add(gi.inbound_id);
  }

  if (allInbounds) {
    return db
      .prepare(
        `SELECT i.*, n.name as node_name, n.address as node_address, n.connect_addresses_json
         FROM inbounds i
         JOIN nodes n ON n.id = i.node_id
         WHERE i.enabled = 1 AND n.enabled = 1`,
      )
      .all() as unknown as (InboundRow & { node_name: string; node_address: string; connect_addresses_json: string })[];
  }

  const direct = db.prepare('SELECT inbound_id FROM client_inbounds WHERE client_id = ?').all(clientId) as {
    inbound_id: number;
  }[];
  for (const d of direct) inboundIds.add(d.inbound_id);

  if (inboundIds.size === 0) return [];
  const placeholders = [...inboundIds].map(() => '?').join(',');
  return db
    .prepare(
      `SELECT i.*, n.name as node_name, n.address as node_address, n.connect_addresses_json
       FROM inbounds i
       JOIN nodes n ON n.id = i.node_id
       WHERE i.id IN (${placeholders}) AND i.enabled = 1 AND n.enabled = 1`,
    )
    .all(...inboundIds) as unknown as (InboundRow & { node_name: string; node_address: string; connect_addresses_json: string })[];
}

export function createClientRouter(): Router {
  const router = Router();

  router.get('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.clients.view === 'none') {
      res.status(403).json({ error: 'No permission to view clients' });
      return;
    }

    const db = getDb();
    const ownOnly = !acc.isOwner && acc.permissions.clients.view === 'own';
    const rows = (
      ownOnly
        ? db
            .prepare(
              `SELECT c.*, a.username as owner_username
               FROM clients c JOIN accounts a ON a.id = c.owner_id
               WHERE c.owner_id = ? ORDER BY c.id DESC`,
            )
            .all(acc.id)
        : db
            .prepare(
              `SELECT c.*, a.username as owner_username
               FROM clients c JOIN accounts a ON a.id = c.owner_id
               ORDER BY c.id DESC`,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    const liveRows = db.prepare('SELECT client_id, COUNT(*) as cnt FROM connections_live GROUP BY client_id').all() as {
      client_id: number;
      cnt: number;
    }[];
    const onlineMap = new Map(liveRows.map((r) => [r.client_id, r.cnt]));

    const cgRows = db
      .prepare('SELECT cg.client_id, g.id as group_id, g.name as group_name FROM client_groups cg JOIN groups g ON g.id = cg.group_id')
      .all() as { client_id: number; group_id: number; group_name: string }[];
    const groupMap = new Map<number, { id: number; name: string }[]>();
    for (const r of cgRows) {
      const list = groupMap.get(r.client_id) || [];
      list.push({ id: r.group_id, name: r.group_name });
      groupMap.set(r.client_id, list);
    }

    const ciRows = db.prepare('SELECT client_id, inbound_id FROM client_inbounds').all() as {
      client_id: number;
      inbound_id: number;
    }[];
    const ciMap = new Map<number, number[]>();
    for (const r of ciRows) {
      const list = ciMap.get(r.client_id) || [];
      list.push(r.inbound_id);
      ciMap.set(r.client_id, list);
    }

    const list = rows.map((r) => {
      const id = Number(r.id);
      const onlineCount = onlineMap.get(id) || 0;
      const st = computeClientState(
        {
          enabled: Number(r.enabled),
          traffic_limit_bytes: r.traffic_limit_bytes === null ? null : Number(r.traffic_limit_bytes),
          traffic_used_bytes: Number(r.traffic_used_bytes),
          expires_at: r.expires_at ? String(r.expires_at) : null,
          first_connect_days: r.first_connect_days === null ? null : Number(r.first_connect_days),
          first_connected_at: r.first_connected_at ? String(r.first_connected_at) : null,
        },
        onlineCount,
      );
      return {
        id,
        name: String(r.name),
        ownerId: Number(r.owner_id),
        ownerUsername: String(r.owner_username),
        status: st.status,
        runningOutReason: st.runningOutReason,
        trafficLimitBytes: r.traffic_limit_bytes === null ? null : Number(r.traffic_limit_bytes),
        trafficUsedBytes: Number(r.traffic_used_bytes),
        uploadBytes: Number(r.upload_bytes),
        downloadBytes: Number(r.download_bytes),
        expiresAt: r.expires_at ? String(r.expires_at) : null,
        firstConnectDays: r.first_connect_days === null ? null : Number(r.first_connect_days),
        firstConnectedAt: r.first_connected_at ? String(r.first_connected_at) : null,
        deviceLimit: r.device_limit === null ? null : Number(r.device_limit),
        onlineCount,
        resetPeriod: String(r.reset_period),
        fixedIp: String(r.fixed_ip || ''),
        enabled: Boolean(r.enabled),
        note: String(r.note || ''),
        contact: String(r.contact || ''),
        subToken: String(r.sub_token),
        groups: groupMap.get(id) || [],
        inboundIds: ciMap.get(id) || [],
        createdAt: String(r.created_at),
        lastOnlineAt: r.last_online_at ? String(r.last_online_at) : null,
        vpnPassword: String(r.vpn_password || ''),
      };
    });

    res.json({ clients: list });
  });

  router.post('/', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (acc.permissions.clients.create === 'none') {
      res.status(403).json({ error: 'No permission to create clients' });
      return;
    }
    const opErr = ensureAccountOperational(acc);
    if (opErr) {
      res.status(403).json({ error: opErr });
      return;
    }

    const body = req.body as {
      name?: string;
      prefix?: string;
      startNumber?: number;
      count?: number;
      trafficGb?: number | null;
      expiryMode?: 'unlimited' | 'days' | 'first_connect' | 'date';
      expiryDays?: number;
      expiresAt?: string;
      deviceLimit?: number | null;
      resetPeriod?: 'never' | 'daily' | 'weekly' | 'monthly';
      fixedIp?: string;
      vpnPassword?: string;
      note?: string;
      contact?: string;
      groupIds?: number[];
      inboundIds?: number[];
      enabled?: boolean;
    };

    const db = getDb();
    const limits = getEffectiveLimits(acc);
    const count = Math.min(50, Math.max(1, Number(body.count || 1)));
    const isBulk = count > 1;

    const currentOwnedCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM clients WHERE owner_id = ?').get(acc.id) as { cnt: number }
    ).cnt;
    if (!acc.isOwner && limits.clientLimit !== null && currentOwnedCount + count > limits.clientLimit) {
      res.status(403).json({ error: `Client limit reached (${limits.clientLimit})` });
      return;
    }

    if (!acc.isOwner) {
      if (!limits.allowUnlimitedTraffic && (body.trafficGb === null || body.trafficGb === undefined || body.trafficGb <= 0)) {
        res.status(400).json({ error: 'Traffic limit is required for your role' });
        return;
      }
      if (limits.maxTrafficPerClientGb !== null && body.trafficGb && body.trafficGb > limits.maxTrafficPerClientGb) {
        res.status(400).json({ error: `Max traffic per client is ${limits.maxTrafficPerClientGb} GB` });
        return;
      }
      if (limits.maxDevicesPerClient !== null && (!body.deviceLimit || body.deviceLimit > limits.maxDevicesPerClient)) {
        res.status(400).json({ error: `Max devices per client is ${limits.maxDevicesPerClient}` });
        return;
      }
      if (limits.requireGroup && (!body.groupIds || body.groupIds.length === 0)) {
        res.status(400).json({ error: 'At least one group must be selected' });
        return;
      }
    }

    const baseName = (isBulk ? body.prefix || body.name || 'user' : body.name || '').trim();
    if (!/^[a-zA-Z0-9._-]{2,48}$/.test(baseName)) {
      res.status(400).json({ error: 'Client name must be 2-48 characters (letters, digits, dot, dash, underscore)' });
      return;
    }

    const trafficLimitBytes =
      body.trafficGb === null || body.trafficGb === undefined || body.trafficGb <= 0
        ? null
        : Math.round(body.trafficGb * GB);

    let expiresAt: string | null = null;
    let firstConnectDays: number | null = null;
    if (body.expiryMode === 'days' && body.expiryDays && body.expiryDays > 0) {
      expiresAt = new Date(Date.now() + body.expiryDays * 86400_000).toISOString();
    } else if (body.expiryMode === 'first_connect' && body.expiryDays && body.expiryDays > 0) {
      firstConnectDays = body.expiryDays;
    } else if (body.expiryMode === 'date' && body.expiresAt) {
      expiresAt = new Date(body.expiresAt).toISOString();
    }

    const createdIds: number[] = [];
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO clients (name, owner_id, traffic_limit_bytes, expires_at, first_connect_days, device_limit, reset_period, fixed_ip, enabled, note, contact, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const groupIds = (body.groupIds || []).filter((id) =>
      acc.isOwner || acc.allowedGroupIds.length === 0 ? true : acc.allowedGroupIds.includes(id),
    );
    const inboundIds = (body.inboundIds || []).filter((id) =>
      acc.isOwner || acc.allowedInboundIds.length === 0 ? true : acc.allowedInboundIds.includes(id),
    );

    try {
      const startNum = Math.max(1, Number(body.startNumber || 1));
      for (let i = 0; i < count; i++) {
        const seq = startNum + i;
        const name = isBulk ? `${baseName}-${String(seq).padStart(2, '0')}` : baseName;
        const keys = generateWireGuardKeypair();
        const vpnPass = !isBulk && body.vpnPassword?.trim() ? body.vpnPassword.trim() : randomToken(12);
        const info = insert.run(
          name,
          acc.id,
          trafficLimitBytes,
          expiresAt,
          firstConnectDays,
          body.deviceLimit ?? null,
          body.resetPeriod || 'never',
          isBulk ? '' : body.fixedIp || '',
          body.enabled === false ? 0 : 1,
          body.note || '',
          body.contact || '',
          randomToken(18),
          keys.privateKey,
          keys.publicKey,
          vpnPass,
          now,
        );
        const cid = Number(info.lastInsertRowid);
        createdIds.push(cid);
        for (const gid of groupIds) {
          db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(cid, gid);
        }
        for (const iid of inboundIds) {
          db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cid, iid);
        }
      }
    } catch (err) {
      res.status(400).json({ error: `Could not create client: ${String(err)}` });
      return;
    }

    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: isBulk ? 'client.bulk-create' : 'client.create',
      target: isBulk ? `${baseName} x${count}` : baseName,
      ip: req.clientIp,
    });

    res.status(201).json({ ids: createdIds });
  });

  router.patch('/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (acc.permissions.clients.edit === 'none' || (!acc.isOwner && acc.permissions.clients.edit === 'own' && Number(existing.owner_id) !== acc.id)) {
      res.status(403).json({ error: 'No permission to edit this client' });
      return;
    }

    const body = req.body as {
      trafficGb?: number | null;
      expiresAt?: string | null;
      addDays?: number;
      addTrafficGb?: number;
      deviceLimit?: number | null;
      resetPeriod?: string;
      fixedIp?: string;
      vpnPassword?: string;
      note?: string;
      contact?: string;
      enabled?: boolean;
      groupIds?: number[];
      inboundIds?: number[];
    };

    let trafficLimitBytes =
      body.trafficGb !== undefined
        ? body.trafficGb === null || body.trafficGb <= 0
          ? null
          : Math.round(body.trafficGb * GB)
        : existing.traffic_limit_bytes === null
          ? null
          : Number(existing.traffic_limit_bytes);

    if (body.addTrafficGb && body.addTrafficGb > 0) {
      trafficLimitBytes = (trafficLimitBytes ?? Number(existing.traffic_used_bytes)) + Math.round(body.addTrafficGb * GB);
    }

    let expiresAt = body.expiresAt !== undefined ? body.expiresAt : (existing.expires_at as string | null);
    if (body.addDays && body.addDays > 0) {
      const baseMs = expiresAt && new Date(expiresAt).getTime() > Date.now() ? new Date(expiresAt).getTime() : Date.now();
      expiresAt = new Date(baseMs + body.addDays * 86400_000).toISOString();
    }

    db.prepare(
      `UPDATE clients SET
         traffic_limit_bytes = ?,
         expires_at = ?,
         device_limit = ?,
         reset_period = ?,
         fixed_ip = ?,
         vpn_password = ?,
         note = ?,
         contact = ?,
         enabled = ?
       WHERE id = ?`,
    ).run(
      trafficLimitBytes,
      expiresAt,
      body.deviceLimit !== undefined ? body.deviceLimit : (existing.device_limit === null ? null : Number(existing.device_limit)),
      body.resetPeriod ?? String(existing.reset_period),
      body.fixedIp !== undefined ? body.fixedIp : String(existing.fixed_ip || ''),
      body.vpnPassword !== undefined && body.vpnPassword.trim() ? body.vpnPassword.trim() : String(existing.vpn_password || ''),
      body.note !== undefined ? body.note : String(existing.note || ''),
      body.contact !== undefined ? body.contact : String(existing.contact || ''),
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(existing.enabled),
      id,
    );

    if (body.groupIds !== undefined) {
      db.prepare('DELETE FROM client_groups WHERE client_id = ?').run(id);
      for (const gid of body.groupIds) {
        db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(id, gid);
      }
    }
    if (body.inboundIds !== undefined) {
      db.prepare('DELETE FROM client_inbounds WHERE client_id = ?').run(id);
      for (const iid of body.inboundIds) {
        db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(id, iid);
      }
    }

    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'client.update',
      target: String(existing.name),
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.post('/:id/reset-traffic', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    const db = getDb();
    const existing = db.prepare('SELECT id, name, owner_id FROM clients WHERE id = ?').get(id) as
      | { id: number; name: string; owner_id: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (acc.permissions.clients.resetTraffic === 'none' || (!acc.isOwner && acc.permissions.clients.resetTraffic === 'own' && existing.owner_id !== acc.id)) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    db.prepare('UPDATE clients SET traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0 WHERE id = ?').run(id);
    recordAudit({ accountId: acc.id, username: acc.username, action: 'client.update', target: existing.name, details: 'reset traffic', ip: req.clientIp });
    res.json({ ok: true });
  });

  router.post('/:id/regenerate-sub', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    const db = getDb();
    const existing = db.prepare('SELECT id, name, owner_id FROM clients WHERE id = ?').get(id) as
      | { id: number; name: string; owner_id: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (acc.permissions.clients.edit === 'none' || (!acc.isOwner && acc.permissions.clients.edit === 'own' && existing.owner_id !== acc.id)) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const token = randomToken(18);
    db.prepare('UPDATE clients SET sub_token = ? WHERE id = ?').run(token, id);
    res.json({ subToken: token });
  });

  router.post('/bulk', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const { ids, action, addDays, addTrafficGb, groupId, groupIds, groupOp } = req.body as {
      ids?: number[];
      action?: 'enable' | 'disable' | 'reset_traffic' | 'disconnect' | 'delete' | 'extend' | 'group';
      addDays?: number;
      addTrafficGb?: number;
      groupId?: number;
      groupIds?: number[];
      groupOp?: 'add' | 'remove' | 'replace';
    };
    if (!ids || ids.length === 0 || !action) {
      res.status(400).json({ error: 'ids and action are required' });
      return;
    }

    const db = getDb();
    const targetGroupIds = Array.isArray(groupIds)
      ? groupIds.map(Number).filter((x) => Number.isFinite(x) && x > 0)
      : groupId
        ? [Number(groupId)]
        : [];

    for (const id of ids) {
      const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) continue;
      if (!acc.isOwner && Number(existing.owner_id) !== acc.id && acc.permissions.clients.edit !== 'all') continue;

      if (action === 'enable') db.prepare('UPDATE clients SET enabled = 1 WHERE id = ?').run(id);
      else if (action === 'disable') db.prepare('UPDATE clients SET enabled = 0 WHERE id = ?').run(id);
      else if (action === 'reset_traffic')
        db.prepare('UPDATE clients SET traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0 WHERE id = ?').run(id);
      else if (action === 'disconnect') db.prepare('DELETE FROM connections_live WHERE client_id = ?').run(id);
      else if (action === 'delete') db.prepare('DELETE FROM clients WHERE id = ?').run(id);
      else if (action === 'extend') {
        if (addDays && addDays > 0) {
          const cur = existing.expires_at ? new Date(String(existing.expires_at)).getTime() : Date.now();
          const next = new Date(Math.max(cur, Date.now()) + addDays * 86400_000).toISOString();
          db.prepare('UPDATE clients SET expires_at = ? WHERE id = ?').run(next, id);
        }
        if (addTrafficGb && addTrafficGb > 0 && existing.traffic_limit_bytes !== null) {
          db.prepare('UPDATE clients SET traffic_limit_bytes = traffic_limit_bytes + ? WHERE id = ?').run(
            Math.round(addTrafficGb * GB),
            id,
          );
        }
      } else if (action === 'group') {
        if (groupOp === 'replace') {
          db.prepare('DELETE FROM client_groups WHERE client_id = ?').run(id);
          for (const gid of targetGroupIds) {
            db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(id, gid);
          }
        } else if (groupOp === 'remove') {
          for (const gid of targetGroupIds) {
            db.prepare('DELETE FROM client_groups WHERE client_id = ? AND group_id = ?').run(id, gid);
          }
        } else {
          for (const gid of targetGroupIds) {
            db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(id, gid);
          }
        }
      }
    }

    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: `client.bulk.${action}`,
      target: `${ids.length} clients`,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.delete('/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    const db = getDb();
    const existing = db.prepare('SELECT id, name, owner_id FROM clients WHERE id = ?').get(id) as
      | { id: number; name: string; owner_id: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (acc.permissions.clients.delete === 'none' || (!acc.isOwner && acc.permissions.clients.delete === 'own' && existing.owner_id !== acc.id)) {
      res.status(403).json({ error: 'No permission to delete this client' });
      return;
    }
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    recordAudit({ accountId: acc.id, username: acc.username, action: 'client.delete', target: existing.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.get('/:id/profile', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const inbounds = resolveClientInbounds(id);
    if (inbounds.length === 0) {
      res.status(400).json({ error: 'Client has no active inbounds assigned' });
      return;
    }
    const reqInboundId = req.query.inboundId ? Number(req.query.inboundId) : inbounds[0].id;
    const inbound = inbounds.find((i) => i.id === reqInboundId) || inbounds[0];
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const connectAddrs = JSON.parse(inbound.connect_addresses_json || '[]') as string[];
    const endpointHost = connectAddrs[0] || (inbound.node_address !== '127.0.0.1' ? inbound.node_address : general.publicAddress);

    const profile = generateClientProfile({
      clientName: String(client.name),
      vpnPassword: String(client.vpn_password),
      wgPrivateKey: String(client.wg_private_key),
      fixedIp: String(client.fixed_ip || ''),
      clientIndex: id,
      inbound,
      endpointHost,
      nodeName: inbound.node_name,
    });

    res.setHeader('Content-Type', profile.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${profile.filename}"`);
    res.send(profile.content);
  });

  return router;
}
