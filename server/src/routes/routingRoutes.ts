import { Router } from 'express';
import { getDb } from '../db/database.js';
import { testTcpLatency } from '../drivers/runtime.js';
import { updateXrayGeoAssets } from '../drivers/linuxEngine.js';
import { renderXrayRoutingConfig, type RoutingRule } from '../generators/configs.js';
import { generateWireGuardKeypair } from '../security/auth.js';
import { requireOwner, type AuthedRequest } from './context.js';

function parseShareLink(link: string): { name: string; type: string; config: Record<string, unknown> } | null {
  const trimmed = link.trim();
  try {
    if (trimmed.startsWith('vless://') || trimmed.startsWith('trojan://')) {
      const u = new URL(trimmed);
      const isVless = trimmed.startsWith('vless://');
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `${isVless ? 'vless' : 'trojan'}-${u.hostname}`,
        type: isVless ? 'vless' : 'trojan',
        config: {
          address: u.hostname,
          port: Number(u.port || 443),
          id: u.username,
          transport: u.searchParams.get('type') || 'tcp',
          security: u.searchParams.get('security') || 'tls',
          sni: u.searchParams.get('sni') || u.hostname,
          pbk: u.searchParams.get('pbk') || '',
          sid: u.searchParams.get('sid') || '',
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
          transport: String(json.net || 'tcp'),
          security: String(json.tls || 'none'),
          sni: String(json.sni || json.host || ''),
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
          password: u.username,
          sni: u.searchParams.get('sni') || u.hostname,
        },
      };
    }
    if (trimmed.startsWith('ss://')) {
      const u = new URL(trimmed);
      return {
        name: decodeURIComponent(u.hash.replace(/^#/, '')) || `ss-${u.hostname}`,
        type: 'shadowsocks',
        config: {
          address: u.hostname,
          port: Number(u.port || 8388),
          secret: u.username,
        },
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function createRoutingRouter(): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/outbounds', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM outbounds ORDER BY id DESC').all() as Array<Record<string, unknown>>;
    res.json({
      outbounds: rows.map((r) => {
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse(String(r.config_json));
        } catch {
          cfg = {};
        }
        // Never leak secrets in list responses
        const safeCfg = { ...cfg };
        for (const secretKey of ['id', 'password', 'secret', 'privateKey', 'accessToken']) {
          if (safeCfg[secretKey]) safeCfg[secretKey] = '••••••••';
        }
        return {
          id: Number(r.id),
          name: String(r.name),
          type: String(r.type),
          config: safeCfg,
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

  router.post('/outbounds', (req, res) => {
    const body = req.body as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      preset?: 'warp' | 'nordvpn' | 'psiphon';
    };

    const db = getDb();
    let name = (body.name || '').trim();
    let type = body.type || 'vless';
    let config = body.config || {};

    if (body.preset === 'warp') {
      const keys = generateWireGuardKeypair();
      type = 'wireguard';
      name = name || `warp-${Math.floor(Math.random() * 900 + 100)}`;
      config = {
        address: String(config.address || 'engage.cloudflareclient.com'),
        port: Number(config.port || 2408),
        publicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
        privateKey: keys.privateKey,
        licenseKey: config.licenseKey || '',
      };
    } else if (body.preset === 'nordvpn') {
      const keys = generateWireGuardKeypair();
      type = 'wireguard';
      name = name || `nord-${String(config.country || 'nl').toLowerCase()}`;
      config = {
        address: String(config.address || 'nl912.nordvpn.com'),
        port: 51820,
        country: config.country || 'Netherlands',
        privateKey: keys.privateKey,
        accessToken: config.accessToken || '',
      };
    } else if (body.preset === 'psiphon') {
      type = 'socks';
      name = name || `psiphon-${String(config.region || 'auto').toLowerCase()}`;
      config = {
        address: '127.0.0.1',
        port: Number(config.port || 10820),
        region: config.region || 'Automatic',
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
      error: probe.error || null,
      exitHost: host,
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
    res.json(result);
  });

  router.get('/policies/:nodeId', (req, res) => {
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

    const policy = row
      ? {
          nodeId,
          enabled: Boolean(row.enabled),
          inboundScope: String(row.inbound_scope) as 'all' | 'chosen',
          inboundIds: JSON.parse(String(row.inbound_ids_json || '[]')) as number[],
          defaultAction: String(row.default_action) as 'direct' | 'outbound',
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
          defaultAction: 'direct' as const,
          defaultOutboundId: null,
          rules: [] as RoutingRule[],
          status: 'inactive',
          statusMessage: '',
          updatedAt: new Date().toISOString(),
        };

    const defaultOb = outbounds.find((o) => o.id === policy.defaultOutboundId);
    const renderedConfig = renderXrayRoutingConfig({
      outbounds,
      defaultAction: policy.defaultAction,
      defaultOutboundName: defaultOb?.name,
      rules: policy.rules,
    });

    res.json({ policy, renderedConfig });
  });

  router.put('/policies/:nodeId', (req, res) => {
    const nodeId = Number(req.params.nodeId);
    const body = req.body as {
      enabled?: boolean;
      inboundScope?: 'all' | 'chosen';
      inboundIds?: number[];
      defaultAction?: 'direct' | 'outbound';
      defaultOutboundId?: number | null;
      rules?: RoutingRule[];
    };
    const db = getDb();
    const now = new Date().toISOString();
    const status = body.enabled ? 'active' : 'inactive';

    db.prepare(
      `INSERT INTO routing_policies (node_id, enabled, inbound_scope, inbound_ids_json, default_action, default_outbound_id, rules_json, status, status_message, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)
       ON CONFLICT(node_id) DO UPDATE SET
         enabled = excluded.enabled,
         inbound_scope = excluded.inbound_scope,
         inbound_ids_json = excluded.inbound_ids_json,
         default_action = excluded.default_action,
         default_outbound_id = excluded.default_outbound_id,
         rules_json = excluded.rules_json,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    ).run(
      nodeId,
      body.enabled ? 1 : 0,
      body.inboundScope || 'all',
      JSON.stringify(body.inboundIds || []),
      body.defaultAction || 'direct',
      body.defaultOutboundId ?? null,
      JSON.stringify(body.rules || []),
      status,
      now,
    );
    res.json({ ok: true, status });
  });

  return router;
}
