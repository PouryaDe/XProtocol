import fs from 'node:fs';
import { Router } from 'express';
import { getDb } from '../db/database.js';
import { generateRealityKeypair, generateShortId, generateSs2022Key, generateWireGuardKeypair } from '../security/auth.js';
import { applyInboundRuntime } from '../drivers/runtime.js';
import { getInboundRuntimeStatus, issueLetsEncryptCert } from '../drivers/linuxEngine.js';
import {
  CURATED_SNI_DOMAINS,
  buildXrayPresetDefaults,
  probeRealitySni,
  sanitizeXraySettingsForClient,
  saveSniResult,
  syncAndApplyXrayEngine,
  validateXraySettings,
  type XrayPresetId,
} from '../drivers/xrayEngine.js';
import { renderInboundServerConfig, type InboundRow, type PeerEntry } from '../generators/configs.js';
import { recordAudit } from '../services/audit.js';
import { getEligiblePeersForInbound } from '../services/peerResolver.js';
import type { AuthedRequest } from './context.js';

const runtimeLogsByInbound = new Map<number, string[]>();

function recordInboundLogs(inboundId: number, entries: string[]) {
  if (!entries.length) return;
  const prev = runtimeLogsByInbound.get(inboundId) ?? [];
  runtimeLogsByInbound.set(inboundId, [...prev, ...entries].slice(-40));
}

function getInboundPeers(inboundId: number, subnet: string): PeerEntry[] {
  return getEligiblePeersForInbound(inboundId, subnet);
}

function defaultSlugPrefix(protocol: string, transport: string): string {
  switch (protocol) {
    case 'wireguard':
    case 'amneziawg':
      return 'wg';
    case 'ocserv':
    case 'openconnect':
      return 'oc';
    case 'ikev2':
      return 'ikev2';
    case 'l2tp':
      return 'l2tp';
    case 'smartdns':
      return 'dns';
    case 'telegram':
      return 'tg';
    default:
      return (transport || 'udp').toLowerCase().startsWith('tcp') ? 'tcp' : 'udp';
  }
}

function resolveUniqueSlug(rawName: string | undefined, displayName: string | undefined, protocol: string, transport: string, port: number): string {
  const db = getDb();
  let base = (rawName || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base || base.length < 2) {
    const slugFromDisplay = (displayName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    base = slugFromDisplay.length >= 2 ? slugFromDisplay.slice(0, 11) : `${defaultSlugPrefix(protocol, transport)}${port}`;
  }
  base = base.slice(0, 11).replace(/-+$/g, '') || `${defaultSlugPrefix(protocol, transport)}${port}`.slice(0, 11);
  let candidate = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM inbounds WHERE name = ?').get(candidate)) {
    candidate = `${base.slice(0, 11)}-${n++}`;
  }
  return candidate;
}

function countAllowedClients(inboundId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT c.id) AS cnt
       FROM clients c
       LEFT JOIN client_groups cg ON cg.client_id = c.id
       LEFT JOIN groups g ON g.id = cg.group_id AND g.enabled = 1
       LEFT JOIN group_inbounds gi ON gi.group_id = g.id AND gi.inbound_id = ?
       LEFT JOIN client_inbounds ci ON ci.client_id = c.id AND ci.inbound_id = ?
       WHERE g.all_inbounds = 1 OR gi.inbound_id IS NOT NULL OR ci.inbound_id IS NOT NULL`,
    )
    .get(inboundId, inboundId) as { cnt: number } | undefined;
  return Number(row?.cnt || 0);
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
      inbounds: rows.map((r) => {
        const id = Number(r.id);
        const rawSettings = JSON.parse(String(r.settings_json || '{}')) as Record<string, unknown>;
        const settings = String(r.protocol) === 'xray' ? sanitizeXraySettingsForClient(rawSettings) : rawSettings;
        return {
          id,
          nodeId: r.node_id === null ? null : Number(r.node_id),
          nodeName: r.node_name ? String(r.node_name) : null,
          nodeStatus: r.node_status ? String(r.node_status) : null,
          nodeIsLocal: Boolean(r.node_is_local),
          protocol: String(r.protocol),
          name: String(r.name),
          displayName: String(settings.displayName || r.name),
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
          settings,
          onlineCount: liveMap.get(id) || 0,
          allowedClientsCount: countAllowedClients(id),
          createdAt: String(r.created_at),
        };
      }),
    });
  });

  router.get('/defaults', (req, res) => {
    const kind = String(req.query.kind || 'xray');
    if (kind === 'xray') {
      const preset = (String(req.query.preset || 'direct') as XrayPresetId);
      const node = Number(req.query.node || 0) || 0;
      res.json(buildXrayPresetDefaults(preset, node));
      return;
    }
    const defaultsByKind: Record<string, { port: number; proto: string; network: string }> = {
      openvpn: { port: 1194, proto: 'udp', network: '10.42.0.0/24' },
      ocserv: { port: 443, proto: 'tcp', network: '10.44.0.0/24' },
      openconnect: { port: 443, proto: 'tcp', network: '10.44.0.0/24' },
      wireguard: { port: 51820, proto: 'udp', network: '10.66.0.0/24' },
      amneziawg: { port: 51820, proto: 'udp', network: '10.66.0.0/24' },
      ikev2: { port: 500, proto: 'udp', network: '10.46.0.0/24' },
      l2tp: { port: 500, proto: 'udp', network: '10.48.0.0/24' },
      smartdns: { port: 53, proto: 'udp', network: '' },
      telegram: { port: 443, proto: 'tcp', network: '' },
    };
    const d = defaultsByKind[kind] || defaultsByKind.wireguard;
    res.json({ port: d.port, proto: d.proto, network: d.network, settings: {} });
  });

  router.get('/brief', (req: AuthedRequest, res) => {
    const rows = getDb()
      .prepare('SELECT id, name, protocol, port, enabled, running, settings_json FROM inbounds ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      items: rows.map((r) => {
        const s = JSON.parse(String(r.settings_json || '{}')) as Record<string, unknown>;
        return {
          id: Number(r.id),
          name: String(r.name),
          displayName: String(s.displayName || r.name),
          protocol: String(r.protocol),
          port: Number(r.port),
          enabled: Boolean(r.enabled),
          running: Boolean(r.running),
        };
      }),
    });
  });

  router.post('/preflight', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission to manage inbounds' });
      return;
    }
    const { nodeIds = [], port, ports = {}, excludeInboundId } = req.body as {
      nodeIds?: number[];
      port?: number;
      ports?: Record<number, number>;
      excludeInboundId?: number;
    };
    const db = getDb();
    const items = nodeIds.map((nodeId) => {
      const node = db.prepare('SELECT id, enabled, status, is_local FROM nodes WHERE id = ?').get(nodeId) as
        | { id: number; enabled: number; status: string; is_local: number }
        | undefined;
      if (!node) return { nodeId, error: 'Node not found' };
      if (!node.enabled) return { nodeId, error: 'Node is disabled' };
      if (!node.is_local && node.status === 'offline') return { nodeId, error: 'Node is unreachable' };
      const targetPort = Number(ports[nodeId] || port || 0);
      if (targetPort > 0) {
        const conflict = db
          .prepare('SELECT id, name FROM inbounds WHERE node_id = ? AND port = ? AND (? IS NULL OR id != ?)')
          .get(nodeId, targetPort, excludeInboundId ?? null, excludeInboundId ?? null) as
          | { id: number; name: string }
          | undefined;
        if (conflict) {
          return { nodeId, error: `Port ${targetPort} is already used by ${conflict.name}` };
        }
      }
      return { nodeId, error: null };
    });
    res.json({ items });
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
      ports?: Record<number, number>;
      protocol?: string;
      kind?: string;
      preset?: XrayPresetId;
      name?: string;
      displayName?: string;
      transport?: string;
      proto?: string;
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

    const protocol = body.protocol || body.kind || 'wireguard';
    const isXray = protocol === 'xray';

    let settingsObj: Record<string, unknown> = {
      ...(body.settings || (isXray ? {} : { dns: '1.1.1.1, 8.8.8.8' })),
      ...(body.displayName ? { displayName: body.displayName.trim() } : {}),
    };
    const nonXrayDefaultTransport =
      protocol === 'ocserv' || protocol === 'openconnect' || protocol === 'telegram' ? 'tcp' : 'udp';
    const nonXrayDefaultPort: Record<string, number> = {
      openvpn: 1194,
      ocserv: 443,
      openconnect: 443,
      wireguard: 51820,
      amneziawg: 51820,
      ikev2: 500,
      l2tp: 500,
      smartdns: 53,
      telegram: 443,
    };
    let transport = body.transport || body.proto || (isXray ? 'tcp' : nonXrayDefaultTransport);
    let port = Number(body.port || (isXray ? 0 : nonXrayDefaultPort[protocol] || 0));
    let keys = { privateKey: '', publicKey: '' };

    const db = getDb();

    if (isXray) {
      const defaults = buildXrayPresetDefaults(body.preset || 'direct', Number(body.nodeId || 0));
      settingsObj = { ...defaults.settings, ...settingsObj };
      if (!port) port = defaults.port;
      transport = String(settingsObj.transport || '') === 'kcp' ? 'udp' : 'tcp';
      const errMsg = validateXraySettings(settingsObj);
      if (errMsg) {
        res.status(400).json({ error: errMsg });
        return;
      }
      if (String(settingsObj.security || '') === 'reality') {
        if (!settingsObj.realityPublicKey || !settingsObj._realityPrivateKey) {
          const rk = generateRealityKeypair();
          settingsObj.realityPublicKey = rk.publicKey;
          settingsObj._realityPrivateKey = rk.privateKey;
        }
        keys = {
          publicKey: String(settingsObj.realityPublicKey),
          privateKey: String(settingsObj._realityPrivateKey),
        };
      } else if (String(settingsObj.protocol || '') === 'shadowsocks') {
        const method = String(settingsObj.ssMethod || '2022-blake3-aes-128-gcm');
        const ssKey = String(settingsObj._ssServerKey || generateSs2022Key(method));
        keys = { publicKey: ssKey, privateKey: ssKey };
      }
    } else if (protocol === 'wireguard' || protocol === 'amneziawg') {
      keys = generateWireGuardKeypair();
    }

    if (port < 1 || port > 65535) {
      res.status(400).json({ error: 'Port must be 1-65535' });
      return;
    }

    if (body.name && !/^[a-z0-9-]{2,32}$/.test(body.name.trim()) && !body.displayName) {
      res.status(400).json({ error: 'Inbound name must be lowercase letters, digits and dashes (2-32 chars)' });
      return;
    }

    const name = resolveUniqueSlug(body.name, body.displayName, protocol, transport, port);

    const resolveNodeId = (rawId: number | null | undefined): number | null => {
      if (rawId === null || rawId === undefined || rawId < 0) return null;
      if (rawId === 0) {
        const local = db.prepare('SELECT id FROM nodes WHERE is_local = 1 ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
        return local?.id ?? 1;
      }
      return rawId;
    };

    const targetNodeIds =
      body.nodeIds && body.nodeIds.length > 0
        ? body.nodeIds.map((nid) => resolveNodeId(nid))
        : body.nodeId !== undefined && body.nodeId !== null
          ? [resolveNodeId(body.nodeId)]
          : isXray
            ? [resolveNodeId(0)]
            : [null];

    const existingSubnets = new Set(
      (db.prepare('SELECT subnet FROM inbounds').all() as { subnet: string }[]).map((r) => r.subnet),
    );
    let resolvedSubnet = (body.subnet || '').trim();
    if (!resolvedSubnet) {
      for (let oct = 40; oct < 250; oct++) {
        const cand = `10.${oct}.0.0/24`;
        if (!existingSubnets.has(cand)) {
          resolvedSubnet = cand;
          break;
        }
      }
      if (!resolvedSubnet) resolvedSubnet = '10.69.0.0/24';
    }

    const createdIds: number[] = [];
    try {
      for (let i = 0; i < targetNodeIds.length; i++) {
        const nid = targetNodeIds[i];
        const instanceName = targetNodeIds.length > 1 ? `${name}-n${nid}` : name;
        const nodePort = nid && body.ports?.[nid] ? Number(body.ports[nid]) : port;
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
            transport,
            nodePort,
            resolvedSubnet,
            body.authMode || (protocol === 'wireguard' || protocol === 'amneziawg' ? 'device_keys' : 'certificate_password'),
            body.description || '',
            body.publicAddressOverride || '',
            body.enabled === false ? 0 : 1,
            shouldRun,
            body.certId ?? null,
            keys.publicKey,
            keys.privateKey,
            JSON.stringify(settingsObj),
            new Date().toISOString(),
          );
        const id = Number(info.lastInsertRowid);
        createdIds.push(id);
        for (const gid of body.groupIds || []) {
          db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gid, id);
        }
        if (shouldRun) {
          const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as unknown as InboundRow;
          const rt = await applyInboundRuntime(driverMode, row, getInboundPeers(id, row.subnet), 'start');
          recordInboundLogs(id, rt.logs);
          if (!rt.ok) {
            db.prepare('UPDATE inbounds SET running = 0 WHERE id = ?').run(id);
          }
        }
      }
      recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.create', target: name, ip: req.clientIp });
      res.status(201).json({ id: createdIds[0], ids: createdIds });
    } catch (err) {
      res.status(400).json({ error: `Could not create inbound: ${String(err)}` });
    }
  });

  const handleUpdate = async (req: AuthedRequest, res: import('express').Response) => {
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
      displayName?: string;
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

    if (body.port !== undefined) {
      const nextPort = Number(body.port);
      if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
        res.status(400).json({ error: 'Port must be 1-65535' });
        return;
      }
    }

    const existingSettings = JSON.parse(existing.settings_json || '{}') as Record<string, unknown>;
    const nextSettings = body.settings
      ? {
          ...existingSettings,
          ...body.settings,
          ...(existingSettings._realityPrivateKey ? { _realityPrivateKey: existingSettings._realityPrivateKey } : {}),
          ...(existingSettings._ssServerKey ? { _ssServerKey: existingSettings._ssServerKey } : {}),
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        }
      : body.displayName !== undefined
        ? { ...existingSettings, displayName: body.displayName }
        : existingSettings;

    if (existing.protocol === 'xray') {
      const errMsg = validateXraySettings(nextSettings);
      if (errMsg) {
        res.status(400).json({ error: errMsg });
        return;
      }
    }

    db.prepare(
      `UPDATE inbounds SET transport = ?, port = ?, subnet = ?, auth_mode = ?, description = ?, public_address_override = ?, enabled = ?, cert_id = ?, settings_json = ? WHERE id = ?`,
    ).run(
      body.transport ?? existing.transport,
      body.port !== undefined ? Number(body.port) : existing.port,
      body.subnet ?? existing.subnet,
      body.authMode ?? existing.auth_mode,
      body.description ?? existing.description,
      body.publicAddressOverride ?? existing.public_address_override,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      body.certId !== undefined ? body.certId : existing.cert_id,
      JSON.stringify(nextSettings),
      id,
    );

    const updated = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as unknown as InboundRow;
    if (updated.node_id) {
      if (!updated.enabled && updated.running) {
        const rt = await applyInboundRuntime(driverMode, updated, [], 'stop');
        recordInboundLogs(id, rt.logs);
        db.prepare('UPDATE inbounds SET running = 0 WHERE id = ?').run(id);
      } else if (updated.enabled && !updated.running && body.enabled === true) {
        const rt = await applyInboundRuntime(driverMode, updated, getInboundPeers(id, updated.subnet), 'start');
        recordInboundLogs(id, rt.logs);
        db.prepare('UPDATE inbounds SET running = ? WHERE id = ?').run(rt.ok ? 1 : 0, id);
      } else if (updated.enabled && updated.running) {
        const rt = await applyInboundRuntime(driverMode, updated, getInboundPeers(id, updated.subnet), 'restart');
        recordInboundLogs(id, rt.logs);
        if (!rt.ok) {
          db.prepare('UPDATE inbounds SET running = 0 WHERE id = ?').run(id);
        }
      }
    }
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.update', target: existing.name, ip: req.clientIp });
    res.json({ ok: true });
  };

  router.patch('/:id', handleUpdate);
  router.put('/:id', handleUpdate);

  router.post('/:id/deployments', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const { nodeIds = [], ports = {} } = req.body as { nodeIds?: number[]; ports?: Record<number, number> };
    const db = getDb();
    const existing = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    if (!nodeIds.length) {
      res.status(400).json({ error: 'Select at least one node' });
      return;
    }

    const firstNode = nodeIds[0];
    const restNodes = nodeIds.slice(1);
    if (!existing.node_id) {
      const nodePort = Number(ports[firstNode] || existing.port);
      const shouldRun = existing.enabled ? 1 : 0;
      db.prepare('UPDATE inbounds SET node_id = ?, port = ?, running = ? WHERE id = ?').run(
        firstNode,
        nodePort,
        shouldRun,
        id,
      );
      const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as unknown as InboundRow;
      if (shouldRun) {
        const rt = await applyInboundRuntime(driverMode, row, getInboundPeers(id, row.subnet), 'start');
        recordInboundLogs(id, rt.logs);
        if (!rt.ok) {
          db.prepare('UPDATE inbounds SET running = 0 WHERE id = ?').run(id);
        }
      }
    } else if (existing.node_id !== firstNode) {
      restNodes.unshift(firstNode);
    }

    for (const nid of restNodes) {
      const nodePort = Number(ports[nid] || existing.port);
      const cloneName = resolveUniqueSlug(`${existing.name}-n${nid}`, undefined, existing.protocol, existing.transport, nodePort);
      const shouldRun = existing.enabled ? 1 : 0;
      const info = db
        .prepare(
          `INSERT INTO inbounds (node_id, protocol, name, transport, port, subnet, auth_mode, description, public_address_override, enabled, running, cert_id, server_public_key, server_private_key, settings_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nid,
          existing.protocol,
          cloneName,
          existing.transport,
          nodePort,
          existing.subnet,
          existing.auth_mode,
          existing.description,
          existing.public_address_override,
          existing.enabled,
          shouldRun,
          existing.cert_id,
          existing.server_public_key,
          existing.server_private_key,
          existing.settings_json,
          new Date().toISOString(),
        );
      const newId = Number(info.lastInsertRowid);
      if (shouldRun) {
        const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(newId) as unknown as InboundRow;
        const rt = await applyInboundRuntime(driverMode, row, getInboundPeers(newId, row.subnet), 'start');
        recordInboundLogs(newId, rt.logs);
        if (!rt.ok) {
          db.prepare('UPDATE inbounds SET running = 0 WHERE id = ?').run(newId);
        }
      }
    }

    res.json({ ok: true });
  });

  router.delete('/:id/deployments/:nodeId', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const nodeId = Number(req.params.nodeId);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row || row.node_id !== nodeId) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }
    if (row.running) {
      await applyInboundRuntime(driverMode, row, [], 'stop');
    }
    db.prepare('UPDATE inbounds SET node_id = NULL, running = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  router.get('/:id/config', async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Inbound not found' });
      return;
    }
    const peers = getInboundPeers(id, row.subnet);
    const rendered = renderInboundServerConfig(row, peers);
    const liveStatus = driverMode === 'linux' && row.node_id ? await getInboundRuntimeStatus(row) : [];
    const logs = [
      `[${new Date().toISOString()}] inbound=${row.name} protocol=${row.protocol} port=${row.port}`,
      `[${new Date().toISOString()}] state=${row.running ? 'running' : 'stopped'} subnet=${row.subnet} peers=${peers.length}`,
      `[${new Date().toISOString()}] config_path=${rendered.path}`,
      ...(runtimeLogsByInbound.get(id) ?? []),
      ...liveStatus,
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
    recordInboundLogs(id, result.logs);
    const nextRunning = action === 'stop' ? 0 : result.ok ? 1 : 0;
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
    if (row.protocol === 'xray' && row.running) {
      await syncAndApplyXrayEngine().catch(() => undefined);
    }
    recordAudit({ accountId: acc.id, username: acc.username, action: 'instance.delete', target: row.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.post('/:id/xray/reality-keys', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const { confirm } = req.body as { confirm?: boolean };
    if (!confirm) {
      res.status(400).json({ error: 'Confirmation required: rotating Reality keys changes every client link' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row || row.protocol !== 'xray') {
      res.status(404).json({ error: 'Xray inbound not found' });
      return;
    }
    const settings = JSON.parse(row.settings_json || '{}') as Record<string, unknown>;
    const rk = generateRealityKeypair();
    const sid = generateShortId(4);
    const reality = (settings.reality && typeof settings.reality === 'object' ? settings.reality : {}) as Record<string, unknown>;
    reality.shortIds = [sid];
    settings.reality = reality;
    settings.realityPublicKey = rk.publicKey;
    settings._realityPrivateKey = rk.privateKey;

    db.prepare('UPDATE inbounds SET server_public_key = ?, server_private_key = ?, settings_json = ? WHERE id = ?').run(
      rk.publicKey,
      rk.privateKey,
      JSON.stringify(settings),
      id,
    );
    let warning = '';
    if (row.running) {
      const r = await syncAndApplyXrayEngine();
      if (!r.ok) warning = r.statusMessage;
    }
    res.json({ ok: true, publicKey: rk.publicKey, shortId: sid, warning: warning || undefined });
  });

  router.post('/:id/xray/sni/replace', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const { confirm } = req.body as { confirm?: boolean };
    if (!confirm) {
      res.status(400).json({ error: 'Confirmation required: replacing camouflage site changes every client link' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row || row.protocol !== 'xray') {
      res.status(404).json({ error: 'Xray inbound not found' });
      return;
    }
    const settings = JSON.parse(row.settings_json || '{}') as Record<string, unknown>;
    const reality = (settings.reality && typeof settings.reality === 'object' ? settings.reality : {}) as Record<string, unknown>;
    const currentSni = Array.isArray(reality.serverNames) ? String(reality.serverNames[0] || '') : '';

    let bestResult = null;
    for (const c of CURATED_SNI_DOMAINS) {
      if (c.domain === currentSni) continue;
      const r = await probeRealitySni(c.domain, c.tag);
      saveSniResult(row.node_id || 0, r);
      if (r.grade === 'green') {
        bestResult = r;
        break;
      }
    }
    if (!bestResult) {
      bestResult = await probeRealitySni(CURATED_SNI_DOMAINS[0].domain, CURATED_SNI_DOMAINS[0].tag);
    }

    reality.serverNames = [bestResult.domain];
    reality.target = `${bestResult.domain}:443`;
    settings.reality = reality;
    settings.sniTested = true;
    settings.sniChecked = bestResult.checkedAt;
    settings.sniMillis = bestResult.tlsMs;
    settings.sniGrade = bestResult.grade;
    settings.sniReasons = bestResult.reasons;

    db.prepare('UPDATE inbounds SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), id);
    let warning = '';
    if (row.running) {
      const r = await syncAndApplyXrayEngine();
      if (!r.ok) warning = r.statusMessage;
    }
    res.json({ ok: true, result: bestResult, warning: warning || undefined });
  });

  router.post('/:id/xray/certificate', async (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.inbounds.manage === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row || row.protocol !== 'xray') {
      res.status(404).json({ error: 'Xray inbound not found' });
      return;
    }
    const settings = JSON.parse(row.settings_json || '{}') as Record<string, unknown>;
    const host = String(settings.tlsHost || settings.cdnHost || row.public_address_override || '').trim();
    if (!host) {
      res.status(400).json({ error: 'TLS domain name (tlsHost / cdnHost) is required before issuing a certificate' });
      return;
    }
    const certRes = await issueLetsEncryptCert(host);
    if (!certRes.ok) {
      res.status(502).json({ error: certRes.log || 'Certificate issuance failed' });
      return;
    }
    const tlsObj = (settings.tls && typeof settings.tls === 'object' ? settings.tls : {}) as Record<string, unknown>;
    tlsObj.certFile = certRes.certPath;
    tlsObj.keyFile = certRes.keyPath;
    settings.tls = tlsObj;
    db.prepare('UPDATE inbounds SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), id);
    if (row.running) await syncAndApplyXrayEngine().catch(() => undefined);
    res.json({ ok: true, certFile: certRes.certPath, keyFile: certRes.keyPath });
  });

  router.get('/:id/xray/proxy-check', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const row = getDb().prepare('SELECT * FROM inbounds WHERE id = ?').get(id) as InboundRow | undefined;
    if (!row || row.protocol !== 'xray') {
      res.status(404).json({ error: 'Xray inbound not found' });
      return;
    }
    const settings = JSON.parse(row.settings_json || '{}') as Record<string, unknown>;
    const relays = Array.isArray(settings.allowFrom) ? settings.allowFrom.map(String) : [];
    let lastIp = '';
    let lastSeenAt = 0;
    const accessLog = '/var/log/xprotocol/xray-access.log';
    if (process.platform === 'linux' && fs.existsSync(accessLog)) {
      try {
        const tail = fs.readFileSync(accessLog, 'utf8').split('\n').slice(-40);
        for (const line of tail.reverse()) {
          const m = line.match(/from\s+(?:tcp:|udp:)?(\d{1,3}(?:\.\d{1,3}){3}):\d+/);
          if (m) {
            lastIp = m[1];
            lastSeenAt = Math.floor(fs.statSync(accessLog).mtimeMs / 1000);
            break;
          }
        }
      } catch {
        // ignore log read errors
      }
    }
    res.json({
      enabled: Boolean(settings.proxyProtocol),
      running: Boolean(row.running),
      relays,
      headerReceived: Boolean(lastIp),
      lastIp,
      lastSeenAt,
      looksLikeRelay: Boolean(lastIp && relays.includes(lastIp)),
    });
  });

  return router;
}
