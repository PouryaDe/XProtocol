import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { getDb } from '../db/database.js';
import { testTcpLatency } from '../drivers/runtime.js';
import { applyXrayRouting, updateXrayGeoAssets } from '../drivers/linuxEngine.js';
import {
  renderXrayRoutingConfig,
  type InboundRouteOverride,
  type RoutingRule,
} from '../generators/configs.js';
import { generateWireGuardKeypair } from '../security/auth.js';
import { requireOwner } from './context.js';

const SECRET_KEYS = ['id', 'password', 'secret', 'privateKey', 'preSharedKey', 'accessToken', 'licenseKey'] as const;

const POPULAR_GEOSITE = [
  'google-gemini',
  'openai',
  'anthropic',
  'youtube',
  'netflix',
  'category-ir',
  'category-ads-all',
  'category-porn',
  'telegram',
  'instagram',
];

const EXTRA_GEOSITE = [
  'google',
  'spotify',
  'tiktok',
  'xai',
  'github',
  'apple',
  'microsoft',
  'meta',
  'discord',
  'whatsapp',
  'twitter',
  'reddit',
  'twitch',
  'steam',
  'nvidia',
  'cloudflare',
  'amazon',
  'bing',
  'wikipedia',
  'ir',
  'category-ru',
  'category-dev',
  'category-ai-!cn',
  'category-games',
];

const POPULAR_GEOIP = ['ir', 'private', 'cloudflare', 'telegram', 'google', 'netflix'];
const EXTRA_GEOIP = ['us', 'de', 'nl', 'gb', 'fr', 'ru', 'tr', 'ae', 'jp', 'sg', 'fastly', 'cloudfront'];

const PSIPHON_REGIONS = [
  'AUTO',
  'AT',
  'AU',
  'BE',
  'BG',
  'CA',
  'CH',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'HR',
  'HU',
  'IE',
  'IN',
  'IT',
  'JP',
  'LV',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'RS',
  'SE',
  'SG',
  'SK',
  'US',
];

function getGeoDir(): string {
  return process.platform === 'linux' ? '/usr/local/lib/xprotocol/xray' : path.join(os.tmpdir(), 'xprotocol-xray');
}

function getGeoStatus(): { updatedAt: number; available: boolean; refreshing: boolean } {
  const dir = getGeoDir();
  try {
    const geositePath = path.join(dir, 'geosite.dat');
    const geoipPath = path.join(dir, 'geoip.dat');
    const st1 = fs.existsSync(geositePath) ? fs.statSync(geositePath) : null;
    const st2 = fs.existsSync(geoipPath) ? fs.statSync(geoipPath) : null;
    if (st1 && st2) {
      return {
        updatedAt: Math.max(st1.mtimeMs, st2.mtimeMs),
        available: true,
        refreshing: false,
      };
    }
  } catch {
    // ignore fs errors
  }
  return { updatedAt: 0, available: false, refreshing: false };
}

function ensureInboundRoutesColumn(): void {
  const db = getDb();
  try {
    const cols = db.prepare('PRAGMA table_info(routing_policies)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'inbound_routes_json')) {
      db.exec(`ALTER TABLE routing_policies ADD COLUMN inbound_routes_json TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch {
    // ignore if migration already applied
  }
}

function parseWireGuardConf(raw: string): { name: string; type: string; config: Record<string, unknown> } | null {
  if (!/\[Interface\]/i.test(raw) || !/\[Peer\]/i.test(raw)) return null;
  let section = '';
  const iface: Record<string, string> = {};
  const peer: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.split('#')[0].split(';')[0].trim();
    if (!clean) continue;
    const sec = /^\[(\w+)\]$/.exec(clean);
    if (sec) {
      section = sec[1].toLowerCase();
      continue;
    }
    const eq = clean.indexOf('=');
    if (eq <= 0) continue;
    const k = clean.slice(0, eq).trim().toLowerCase();
    const v = clean.slice(eq + 1).trim();
    if (section === 'interface') iface[k] = v;
    else if (section === 'peer') peer[k] = v;
  }
  if (!peer.publickey || !peer.endpoint) return null;
  const lastColon = peer.endpoint.lastIndexOf(':');
  const host = lastColon > 0 ? peer.endpoint.slice(0, lastColon).replace(/^\[|\]$/g, '') : peer.endpoint;
  const port = lastColon > 0 ? Number(peer.endpoint.slice(lastColon + 1)) || 51820 : 51820;
  return {
    name: `wg-${host}`,
    type: 'wireguard',
    config: {
      address: host,
      port,
      publicKey: peer.publickey,
      privateKey: iface.privatekey || '',
      preSharedKey: peer.presharedkey || '',
      addresses: iface.address || '10.0.0.2/32',
      allowedIPs: peer.allowedips || '0.0.0.0/0, ::/0',
      keepAlive: Number(peer.persistentkeepalive || 25),
      mtu: Number(iface.mtu || 1420),
    },
  };
}

function parseShareLink(link: string): { name: string; type: string; config: Record<string, unknown> } | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const proto = String(json.protocol || json.type || 'vless').toLowerCase();
      const settings = (json.settings as Record<string, unknown>) || {};
      const stream = (json.streamSettings as Record<string, unknown>) || {};
      const vnext = Array.isArray(settings.vnext) ? (settings.vnext[0] as Record<string, unknown>) : undefined;
      const servers = Array.isArray(settings.servers) ? (settings.servers[0] as Record<string, unknown>) : undefined;
      const peers = Array.isArray(settings.peers) ? (settings.peers[0] as Record<string, unknown>) : undefined;
      const endpoint = String(peers?.endpoint || '');
      const [epHost, epPort] = endpoint.includes(':') ? endpoint.split(':') : ['', ''];
      const address = String(vnext?.address || servers?.address || settings.address || epHost || json.address || '');
      const port = Number(vnext?.port || servers?.port || settings.port || epPort || json.port || 443);
      return {
        name: String(json.tag || json.name || `${proto}-${address || 'custom'}`),
        type: proto === 'ss' ? 'shadowsocks' : proto,
        config: {
          ...json,
          address,
          port,
          transport: String(stream.network || json.transport || 'tcp'),
          security: String(stream.security || json.security || 'none'),
        },
      };
    }

    const wg = parseWireGuardConf(trimmed);
    if (wg) return wg;

    if (trimmed.startsWith('vless://') || trimmed.startsWith('trojan://')) {
      const u = new URL(trimmed);
      const isVless = trimmed.startsWith('vless://');
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `${isVless ? 'vless' : 'trojan'}-${u.hostname}`,
        type: isVless ? 'vless' : 'trojan',
        config: {
          address: u.hostname,
          port: Number(u.port || 443),
          id: decodeURIComponent(u.username),
          password: decodeURIComponent(u.username),
          transport: u.searchParams.get('type') || 'tcp',
          security: u.searchParams.get('security') || 'tls',
          sni: u.searchParams.get('sni') || u.hostname,
          pbk: u.searchParams.get('pbk') || '',
          sid: u.searchParams.get('sid') || '',
          flow: u.searchParams.get('flow') || '',
          fingerprint: u.searchParams.get('fp') || 'chrome',
          path: u.searchParams.get('path') || '',
          host: u.searchParams.get('host') || '',
          serviceName: u.searchParams.get('serviceName') || '',
        },
      };
    }
    if (trimmed.startsWith('vmess://')) {
      const json = JSON.parse(Buffer.from(trimmed.slice(8), 'base64').toString('utf-8')) as Record<string, unknown>;
      return {
        name: String(json.ps || `vmess-${json.add}`),
        type: 'vmess',
        config: {
          address: String(json.add || ''),
          port: Number(json.port || 443),
          id: String(json.id || ''),
          alterId: Number(json.aid || 0),
          transport: String(json.net || 'tcp'),
          security: String(json.tls || 'none'),
          sni: String(json.sni || json.host || ''),
          path: String(json.path || ''),
          host: String(json.host || ''),
        },
      };
    }
    if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) {
      const u = new URL(trimmed.replace(/^hy2:\/\//, 'hysteria2://'));
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `hy2-${u.hostname}`,
        type: 'hysteria2',
        config: {
          address: u.hostname,
          port: Number(u.port || 443),
          password: decodeURIComponent(u.username),
          sni: u.searchParams.get('sni') || u.hostname,
          insecure: u.searchParams.get('insecure') === '1',
          obfs: u.searchParams.get('obfs') || '',
          obfsPassword: u.searchParams.get('obfs-password') || '',
        },
      };
    }
    if (trimmed.startsWith('ss://')) {
      const u = new URL(trimmed);
      let method = 'aes-256-gcm';
      let secret = decodeURIComponent(u.username);
      try {
        const decoded = Buffer.from(decodeURIComponent(u.username), 'base64').toString('utf8');
        if (decoded.includes(':')) {
          const [m, p] = decoded.split(':');
          method = m;
          secret = p;
        }
      } catch {
        // leave plain username
      }
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `ss-${u.hostname}`,
        type: 'shadowsocks',
        config: {
          address: u.hostname,
          port: Number(u.port || 8388),
          method,
          secret,
        },
      };
    }
    if (trimmed.startsWith('socks://') || trimmed.startsWith('socks5://') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const normalized = trimmed.replace(/^socks5:\/\//, 'socks://');
      const u = new URL(normalized);
      const isSocks = normalized.startsWith('socks://');
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `${isSocks ? 'socks' : 'http'}-${u.hostname}`,
        type: isSocks ? 'socks' : 'http',
        config: {
          address: u.hostname,
          port: Number(u.port || (isSocks ? 1080 : 8080)),
          username: decodeURIComponent(u.username || ''),
          password: decodeURIComponent(u.password || ''),
        },
      };
    }
  } catch {
    return null;
  }
  return null;
}

function redactConfig(cfg: Record<string, unknown>): {
  safeConfig: Record<string, unknown>;
  secretsSet: string[];
} {
  const safeConfig = { ...cfg };
  const secretsSet: string[] = [];
  for (const key of SECRET_KEYS) {
    if (safeConfig[key] && String(safeConfig[key]).length > 0) {
      secretsSet.push(key);
      safeConfig[key] = '••••••••';
    }
  }
  return { safeConfig, secretsSet };
}

function collectUsedByMap(): Map<number, number[]> {
  ensureInboundRoutesColumn();
  const db = getDb();
  const policies = db
    .prepare('SELECT node_id, default_action, default_outbound_id, rules_json, inbound_routes_json FROM routing_policies')
    .all() as Array<{
    node_id: number;
    default_action: string;
    default_outbound_id: number | null;
    rules_json: string;
    inbound_routes_json: string | null;
  }>;
  const map = new Map<number, Set<number>>();
  const addRef = (obId: number | null | undefined, nodeId: number) => {
    if (!obId || !Number.isFinite(obId)) return;
    let set = map.get(obId);
    if (!set) {
      set = new Set<number>();
      map.set(obId, set);
    }
    set.add(nodeId);
  };
  for (const p of policies) {
    if (p.default_action === 'outbound') {
      addRef(p.default_outbound_id, p.node_id);
    }
    try {
      const rules = JSON.parse(p.rules_json || '[]') as RoutingRule[];
      for (const r of rules) {
        if (r.action === 'outbound') addRef(r.outboundId, p.node_id);
      }
    } catch {
      // ignore
    }
    try {
      const routes = JSON.parse(p.inbound_routes_json || '[]') as InboundRouteOverride[];
      for (const ir of routes) {
        if (ir.action.type === 'outbound') addRef(ir.action.outboundId, p.node_id);
      }
    } catch {
      // ignore
    }
  }
  const out = new Map<number, number[]>();
  for (const [obId, nodes] of map.entries()) {
    out.set(obId, Array.from(nodes));
  }
  return out;
}

export function createRoutingRouter(): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/catalog', (_req, res) => {
    res.json({
      geo: getGeoStatus(),
      geosite: Array.from(new Set([...POPULAR_GEOSITE, ...EXTRA_GEOSITE])),
      geoip: Array.from(new Set([...POPULAR_GEOIP, ...EXTRA_GEOIP])),
      favorites: {
        geosite: POPULAR_GEOSITE,
        geoip: POPULAR_GEOIP,
      },
      psiphonRegions: PSIPHON_REGIONS,
    });
  });

  router.get('/outbounds', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM outbounds ORDER BY id DESC').all() as Array<Record<string, unknown>>;
    const usedByMap = collectUsedByMap();
    res.json({
      outbounds: rows.map((r) => {
        const id = Number(r.id);
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse(String(r.config_json));
        } catch {
          cfg = {};
        }
        const { safeConfig, secretsSet } = redactConfig(cfg);
        return {
          id,
          name: String(r.name),
          type: String(r.type),
          config: safeConfig,
          secretsSet,
          usedBy: usedByMap.get(id) || [],
          lastTest: r.last_test_json ? JSON.parse(String(r.last_test_json)) : null,
          createdAt: String(r.created_at),
        };
      }),
    });
  });

  router.post('/outbounds/parse-link', (req, res) => {
    const { link } = req.body as { link?: string };
    if (!link) {
      res.status(400).json({ error: 'Link is required' });
      return;
    }
    const parsed = parseShareLink(link);
    if (!parsed) {
      res.status(400).json({ error: 'Unsupported or malformed outbound link' });
      return;
    }
    res.json(parsed);
  });

  router.post('/outbounds/test-draft', async (req, res) => {
    const body = req.body as {
      type?: string;
      config?: Record<string, unknown>;
      link?: string;
      id?: number;
    };
    let cfg = body.config || {};
    if (body.link) {
      const parsed = parseShareLink(body.link);
      if (!parsed) {
        res.status(400).json({ error: 'Unsupported or malformed outbound link' });
        return;
      }
      cfg = parsed.config;
    }
    const host = String(cfg.address || '').trim();
    const port = Number(cfg.port || 443);
    if (!host) {
      res.status(400).json({ error: 'Server address is required to test' });
      return;
    }
    const probe = await testTcpLatency(host, port, 3000);
    res.json({
      testedAt: new Date().toISOString(),
      reachable: probe.reachable,
      latencyMs: probe.latencyMs,
      bestMs: probe.latencyMs,
      avgMs: probe.latencyMs,
      error: probe.error || null,
      exitHost: host,
      attempts: [{ ms: probe.latencyMs, error: probe.error || null }],
    });
  });

  router.post('/outbounds', (req, res) => {
    const body = req.body as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      link?: string;
      preset?: 'warp' | 'nordvpn' | 'psiphon';
    };

    const db = getDb();
    let name = (body.name || '').trim();
    let type = body.type || 'vless';
    let config: Record<string, unknown> = body.config || {};

    if (body.link && !body.preset) {
      const parsed = parseShareLink(body.link);
      if (!parsed) {
        res.status(400).json({ error: 'Unsupported or malformed outbound link' });
        return;
      }
      name = name || parsed.name;
      type = parsed.type;
      config = parsed.config;
    }

    if (body.preset === 'warp') {
      const keys = generateWireGuardKeypair();
      type = 'wireguard';
      name = name || `WARP-${Math.floor(Math.random() * 900 + 100)}`;
      config = {
        provider: 'warp',
        address: String(config.address || 'engage.cloudflareclient.com'),
        port: Number(config.port || 2408),
        publicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
        privateKey: keys.privateKey,
        licenseKey: config.licenseKey || '',
        accountType: config.licenseKey ? 'plus' : 'free',
        deviceId: config.deviceId || `xp-${Math.random().toString(36).slice(2, 10)}`,
      };
    } else if (body.preset === 'nordvpn') {
      const keys = generateWireGuardKeypair();
      type = 'wireguard';
      name = name || `NordVPN-${String(config.country || 'NL').toLowerCase()}`;
      config = {
        provider: 'nordvpn',
        address: String(config.address || 'nl912.nordvpn.com'),
        port: Number(config.port || 51820),
        country: config.country || 'Netherlands',
        serverHostname: config.serverHostname || String(config.address || 'nl912.nordvpn.com'),
        privateKey: keys.privateKey,
        accessToken: config.accessToken || '',
      };
    } else if (body.preset === 'psiphon') {
      type = 'socks';
      name = name || `psiphon-${String(config.region || 'auto').toLowerCase()}`;
      config = {
        provider: 'psiphon',
        address: '127.0.0.1',
        port: Number(config.port || 10820),
        region: config.region || 'AUTO',
      };
    }

    if (!name) {
      res.status(400).json({ error: 'Outbound name is required' });
      return;
    }

    try {
      const info = db
        .prepare('INSERT INTO outbounds (name, type, config_json, created_at) VALUES (?, ?, ?, ?)')
        .run(name, type, JSON.stringify(config), new Date().toISOString());
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: `Could not save outbound: ${String(err)}` });
    }
  });

  router.put('/outbounds/:id', (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      clearSecrets?: string[];
    };
    const db = getDb();
    const existing = db.prepare('SELECT * FROM outbounds WHERE id = ?').get(id) as
      | { id: number; name: string; type: string; config_json: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Outbound not found' });
      return;
    }

    const name = (body.name ?? existing.name).trim();
    if (!name) {
      res.status(400).json({ error: 'Outbound name is required' });
      return;
    }
    const type = body.type || existing.type;

    let prevCfg: Record<string, unknown> = {};
    try {
      prevCfg = JSON.parse(existing.config_json);
    } catch {
      prevCfg = {};
    }

    const incoming = body.config ?? prevCfg;
    const merged: Record<string, unknown> = { ...prevCfg, ...incoming };
    const cleared = new Set(body.clearSecrets || []);
    for (const key of SECRET_KEYS) {
      if (cleared.has(key)) {
        delete merged[key];
      } else {
        const val = incoming[key];
        if ((val === undefined || val === '' || val === '••••••••') && prevCfg[key]) {
          merged[key] = prevCfg[key];
        }
      }
    }

    try {
      db.prepare('UPDATE outbounds SET name = ?, type = ?, config_json = ? WHERE id = ?').run(
        name,
        type,
        JSON.stringify(merged),
        id,
      );
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: `Could not update outbound: ${String(err)}` });
    }
  });

  router.post('/outbounds/:id/test', async (req, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM outbounds WHERE id = ?').get(id) as
      | { id: number; name: string; type: string; config_json: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Outbound not found' });
      return;
    }
    const cfg = JSON.parse(row.config_json) as { address?: string; port?: number };
    const host = cfg.address || '1.1.1.1';
    const port = Number(cfg.port || 443);
    const probe = await testTcpLatency(host, port, 3000);
    const result = {
      testedAt: new Date().toISOString(),
      reachable: probe.reachable,
      latencyMs: probe.latencyMs,
      bestMs: probe.latencyMs,
      avgMs: probe.latencyMs,
      error: probe.error || null,
      exitHost: host,
      attempts: [{ ms: probe.latencyMs, error: probe.error || null }],
    };
    db.prepare('UPDATE outbounds SET last_test_json = ? WHERE id = ?').run(JSON.stringify(result), id);
    res.json(result);
  });

  router.delete('/outbounds/:id', (req, res) => {
    getDb().prepare('DELETE FROM outbounds WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.post('/geo-update', async (_req, res) => {
    const result = await updateXrayGeoAssets();
    res.json({
      ...result,
      geo: getGeoStatus(),
    });
  });

  router.get('/policies/:nodeId', (req, res) => {
    ensureInboundRoutesColumn();
    const nodeId = Number(req.params.nodeId);
    const db = getDb();
    const row = db.prepare('SELECT * FROM routing_policies WHERE node_id = ?').get(nodeId) as
      | Record<string, unknown>
      | undefined;

    const outbounds = db.prepare('SELECT id, name, type, config_json FROM outbounds').all() as Array<{
      id: number;
      name: string;
      type: string;
      config_json: string;
    }>;

    const nodeInbounds = db
      .prepare('SELECT id, name, protocol, port, subnet, enabled, running FROM inbounds WHERE node_id = ? ORDER BY id ASC')
      .all(nodeId) as Array<{
      id: number;
      name: string;
      protocol: string;
      port: number;
      subnet: string;
      enabled: number;
      running: number;
    }>;

    const inboundRoutes = row?.inbound_routes_json
      ? (JSON.parse(String(row.inbound_routes_json)) as InboundRouteOverride[])
      : [];

    const policy = row
      ? {
          nodeId,
          enabled: Boolean(row.enabled),
          inboundScope: String(row.inbound_scope) as 'all' | 'chosen',
          inboundIds: JSON.parse(String(row.inbound_ids_json || '[]')) as number[],
          inboundRoutes,
          defaultAction: String(row.default_action) as 'direct' | 'outbound' | 'block',
          defaultOutboundId: row.default_outbound_id ? Number(row.default_outbound_id) : null,
          rules: JSON.parse(String(row.rules_json || '[]')) as RoutingRule[],
          status: String(row.status),
          statusMessage: String(row.status_message || ''),
          updatedAt: String(row.updated_at),
        }
      : {
          nodeId,
          enabled: false,
          inboundScope: 'all' as const,
          inboundIds: [] as number[],
          inboundRoutes: [] as InboundRouteOverride[],
          defaultAction: 'direct' as const,
          defaultOutboundId: null,
          rules: [] as RoutingRule[],
          status: 'inactive',
          statusMessage: '',
          updatedAt: new Date().toISOString(),
        };

    const inboundNamesById: Record<number, string> = {};
    for (const ib of nodeInbounds) {
      inboundNamesById[ib.id] = ib.name;
    }

    const defaultOb = outbounds.find((o) => o.id === policy.defaultOutboundId);
    const renderedConfig = renderXrayRoutingConfig({
      outbounds,
      defaultAction: policy.defaultAction,
      defaultOutboundName: defaultOb?.name,
      rules: policy.rules,
      inboundRoutes: policy.inboundRoutes,
      inboundNamesById,
    });

    res.json({
      policy,
      renderedConfig,
      inbounds: nodeInbounds.map((ib) => ({
        ...ib,
        enabled: Boolean(ib.enabled),
        running: Boolean(ib.running),
      })),
    });
  });

  router.put('/policies/:nodeId', async (req, res) => {
    ensureInboundRoutesColumn();
    const nodeId = Number(req.params.nodeId);
    const body = req.body as {
      enabled?: boolean;
      inboundScope?: 'all' | 'chosen';
      inboundIds?: number[];
      inboundRoutes?: InboundRouteOverride[];
      defaultAction?: 'direct' | 'outbound' | 'block';
      defaultOutboundId?: number | null;
      rules?: RoutingRule[];
    };
    const db = getDb();
    const now = new Date().toISOString();
    const outbounds = db.prepare('SELECT id, name, type, config_json FROM outbounds ORDER BY id ASC').all() as Array<{
      id: number;
      name: string;
      type: string;
      config_json: string;
    }>;
    const nodeInbounds = db
      .prepare('SELECT id, name FROM inbounds WHERE node_id = ? ORDER BY id ASC')
      .all(nodeId) as Array<{ id: number; name: string }>;
    const inboundNamesById: Record<number, string> = {};
    for (const ib of nodeInbounds) inboundNamesById[ib.id] = ib.name;
    const defaultOb = outbounds.find((o) => o.id === (body.defaultOutboundId ?? null));
    const renderedConfig = renderXrayRoutingConfig({
      outbounds,
      defaultAction: body.defaultAction || 'direct',
      defaultOutboundName: defaultOb?.name,
      rules: body.rules || [],
      inboundRoutes: body.inboundRoutes || [],
      inboundNamesById,
    });

    const node = db.prepare('SELECT is_local FROM nodes WHERE id = ?').get(nodeId) as { is_local: number } | undefined;
    let statusMessage = '';
    if (!node || node.is_local) {
      const applied = await applyXrayRouting(Boolean(body.enabled), renderedConfig);
      statusMessage = applied.statusMessage;
    } else {
      statusMessage = 'Queued for remote node';
    }
    const status = body.enabled ? 'active' : 'inactive';

    db.prepare(
      `INSERT INTO routing_policies (node_id, enabled, inbound_scope, inbound_ids_json, inbound_routes_json, default_action, default_outbound_id, rules_json, status, status_message, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         enabled = excluded.enabled,
         inbound_scope = excluded.inbound_scope,
         inbound_ids_json = excluded.inbound_ids_json,
         inbound_routes_json = excluded.inbound_routes_json,
         default_action = excluded.default_action,
         default_outbound_id = excluded.default_outbound_id,
         rules_json = excluded.rules_json,
         status = excluded.status,
         status_message = excluded.status_message,
         updated_at = excluded.updated_at`,
    ).run(
      nodeId,
      body.enabled ? 1 : 0,
      body.inboundScope || 'all',
      JSON.stringify(body.inboundIds || []),
      JSON.stringify(body.inboundRoutes || []),
      body.defaultAction || 'direct',
      body.defaultOutboundId ?? null,
      JSON.stringify(body.rules || []),
      status,
      statusMessage,
      now,
    );
    res.json({ ok: true, status, statusMessage });
  });

  return router;
}
