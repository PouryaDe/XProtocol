import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { generateSs2022Key, generateWireGuardKeypair, randomToken } from '../security/auth.js';
import { recordAudit } from '../services/audit.js';
import { computeClientState, ensureAccountOperational, type AuthedRequest } from './context.js';
import { getEffectiveLimits } from '../security/rbac.js';

type AuthedAccount = NonNullable<AuthedRequest['auth']>['account'];
type EffectiveLimits = ReturnType<typeof getEffectiveLimits>;
import { generateClientProfile } from '../generators/profiles.js';
import type { InboundRow } from '../generators/configs.js';
import { buildClientXrayServerViews, writeUnifiedXrayConfigFile } from '../drivers/xrayEngine.js';
import {
  ensureClientCertificate,
  ensureOpenVpnPki,
  getClientCertDetails,
  replaceClientCertificate,
} from '../drivers/pki.js';
import { parseOptionalMbps } from '../services/peerResolver.js';
import { kickClientConnections, scheduleSyncRunningInbounds, syncRunningInbounds } from '../services/syncService.js';

async function syncAfterClientChange(): Promise<void> {
  if (process.platform === 'linux') {
    try {
      writeUnifiedXrayConfigFile();
    } catch {
      // Non-fatal if Xray config dir isn't writable yet
    }
    scheduleSyncRunningInbounds();
    return;
  }
  await syncRunningInbounds().catch(() => undefined);
}
import { computeNextResetIso, normalizeResetStrategy } from '../services/resetSchedule.js';
import { emitEvent } from '../services/events.js';
import type { TemplateSettings } from './templateRoutes.js';

const GB = 1024 * 1024 * 1024;

type JoinedInboundRow = InboundRow & {
  node_name: string;
  node_address: string;
  connect_addresses_json: string;
};

/** Resolve all enabled inbounds reachable by a client via enabled groups or direct grants. */
export function resolveClientInbounds(clientId: number): JoinedInboundRow[] {
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
      .all() as unknown as JoinedInboundRow[];
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
    .all(...inboundIds) as unknown as JoinedInboundRow[];
}

function canMutateClient(acc: AuthedAccount, ownerId: number, perm: 'edit' | 'delete' | 'resetTraffic'): boolean {
  const level = acc.permissions.clients[perm];
  if (level === 'none') return false;
  if (!acc.isOwner && level === 'own' && ownerId !== acc.id) return false;
  return true;
}

/** Validate client plan quotas against a non-owner role's effective limits. */
function validateRoleQuotaBounds(
  limits: EffectiveLimits,
  opts: {
    trafficLimitBytes: number | null;
    deviceLimit: number | null;
    expiresAt: string | null;
    firstConnectDays?: number | null;
    groupCount?: number;
  },
): string | null {
  if (!limits.allowUnlimitedTraffic && opts.trafficLimitBytes === null) {
    return 'Traffic limit is required for your role';
  }
  if (limits.maxTrafficPerClientGb !== null && opts.trafficLimitBytes !== null && opts.trafficLimitBytes > limits.maxTrafficPerClientGb * GB) {
    return `Max traffic per client is ${limits.maxTrafficPerClientGb} GB`;
  }
  if (limits.maxDevicesPerClient !== null && (!opts.deviceLimit || opts.deviceLimit > limits.maxDevicesPerClient)) {
    return `Max devices per client is ${limits.maxDevicesPerClient}`;
  }
  if (limits.maxLifetimeDays !== null) {
    if (opts.firstConnectDays && opts.firstConnectDays > limits.maxLifetimeDays) {
      return `Max lifetime is ${limits.maxLifetimeDays} days`;
    }
    if (opts.expiresAt) {
      const capMs = Date.now() + limits.maxLifetimeDays * 86400_000 + 60_000;
      if (Date.parse(opts.expiresAt) > capMs) {
        return `Max lifetime is ${limits.maxLifetimeDays} days`;
      }
    }
  }
  if (limits.requireGroup && opts.groupCount !== undefined && opts.groupCount === 0) {
    return 'At least one group must be selected';
  }
  return null;
}

function loadValidatedTemplate(acc: AuthedAccount, limits: EffectiveLimits, templateId: number): { error?: string; status?: number; settings?: TemplateSettings } {
  const tplRow = getDb().prepare('SELECT id, settings_json, enabled FROM client_templates WHERE id = ?').get(templateId) as
    | { id: number; settings_json: string; enabled: number }
    | undefined;
  if (!tplRow || (!acc.isOwner && !tplRow.enabled)) {
    return { status: 400, error: 'Selected client template is not available' };
  }
  if (!acc.isOwner && limits.allowedTemplateIds.length > 0 && !limits.allowedTemplateIds.includes(tplRow.id)) {
    return { status: 403, error: 'You are not allowed to use this client template' };
  }
  return { settings: JSON.parse(tplRow.settings_json || '{}') as TemplateSettings };
}

function filterAllowedIds(acc: AuthedAccount, requested: number[], allowed: number[]): number[] {
  if (acc.isOwner || allowed.length === 0) return requested;
  return requested.filter((id) => allowed.includes(id));
}

/** Parse a positive integer route parameter, returning null when malformed. */
function parsePositiveId(raw: string | string[] | undefined): number | null {
  const val = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Load a client row after verifying view RBAC (`all` or `own`), sending 400/403/404 on failure. */
function findClientForView(
  req: AuthedRequest,
  res: import('express').Response,
  sqlSelect = 'SELECT * FROM clients WHERE id = ?',
): Record<string, unknown> | null {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  const acc = req.auth!.account;
  if (acc.permissions.clients.view === 'none') {
    res.status(403).json({ error: 'No permission to view clients' });
    return null;
  }
  const row = getDb().prepare(sqlSelect).get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  if (!acc.isOwner && acc.permissions.clients.view === 'own' && Number(row.owner_id) !== acc.id) {
    res.status(403).json({ error: 'No permission to view this client' });
    return null;
  }
  return row;
}

/** Load a client row after verifying mutation RBAC (`edit`, `delete`, or `resetTraffic`). */
function findClientForMutation(
  req: AuthedRequest,
  res: import('express').Response,
  perm: 'edit' | 'delete' | 'resetTraffic',
): Record<string, unknown> | null {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  const row = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  if (!canMutateClient(req.auth!.account, Number(row.owner_id), perm)) {
    res.status(403).json({ error: 'No permission' });
    return null;
  }
  return row;
}

/** Resolve the public endpoint hostname for a client profile download. */
function resolveClientEndpointHost(req: AuthedRequest, inbound: JoinedInboundRow, generalPublicAddr: string): string {
  const connectAddrs = JSON.parse(inbound.connect_addresses_json || '[]') as string[];
  const rawHost = connectAddrs[0] || (inbound.node_address !== '127.0.0.1' ? inbound.node_address : generalPublicAddr);
  const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
  return !rawHost || rawHost === '127.0.0.1' ? reqHost || rawHost || '127.0.0.1' : rawHost;
}

/** Serialize a raw `clients` SQL row plus live session count and grants into the API DTO. */
function serializeClientRow(
  r: Record<string, unknown>,
  onlineCount: number,
  groups: { id: number; name: string }[],
  inboundIds: number[],
) {
  const id = Number(r.id);
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
  const cert = getClientCertDetails(
    String(r.name),
    r.cert_serial ? String(r.cert_serial) : null,
    r.cert_expires_at ? String(r.cert_expires_at) : null,
    r.created_at ? String(r.created_at) : null,
  );
  const uploadBytes = Number(r.upload_bytes || 0);
  const downloadBytes = Number(r.download_bytes || 0);
  const totalUploadBytes = Math.max(Number(r.total_upload_bytes || 0), uploadBytes);
  const totalDownloadBytes = Math.max(Number(r.total_download_bytes || 0), downloadBytes);
  return {
    id,
    name: String(r.name),
    ownerId: Number(r.owner_id),
    ownerUsername: String(r.owner_username || ''),
    status: st.status,
    runningOutReason: st.runningOutReason,
    trafficLimitBytes: r.traffic_limit_bytes === null ? null : Number(r.traffic_limit_bytes),
    trafficUsedBytes: Number(r.traffic_used_bytes),
    uploadBytes,
    downloadBytes,
    totalUploadBytes,
    totalDownloadBytes,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    firstConnectDays: r.first_connect_days === null ? null : Number(r.first_connect_days),
    firstConnectedAt: r.first_connected_at ? String(r.first_connected_at) : null,
    deviceLimit: r.device_limit === null ? null : Number(r.device_limit),
    downloadMbps: r.download_mbps === null || r.download_mbps === undefined ? null : Number(r.download_mbps),
    uploadMbps: r.upload_mbps === null || r.upload_mbps === undefined ? null : Number(r.upload_mbps),
    onlineCount,
    resetPeriod: String(r.reset_period),
    resetEveryDays: Number(r.reset_every_days || 0),
    resetAnchor: Number(r.reset_anchor || 0),
    nextResetAt: r.next_reset_at ? String(r.next_reset_at) : null,
    templateId: Number(r.template_id || 0),
    subUpdateHours: Number(r.sub_update_hours || 0),
    subAnnounce: String(r.sub_announce || ''),
    fixedIp: String(r.fixed_ip || ''),
    enabled: Boolean(r.enabled),
    note: String(r.note || ''),
    contact: String(r.contact || ''),
    subToken: String(r.sub_token),
    certSerial: cert.serial,
    certExpiresAt: cert.expiresAt,
    groups,
    inboundIds,
    createdAt: String(r.created_at),
    lastOnlineAt: r.last_online_at ? String(r.last_online_at) : null,
    vpnPassword: String(r.vpn_password || ''),
    xrayUuid: String(r.xray_uuid || ''),
  };
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
      return serializeClientRow(r, onlineMap.get(id) || 0, groupMap.get(id) || [], ciMap.get(id) || []);
    });

    res.json({ clients: list });
  });

  router.get('/:id', (req: AuthedRequest, res) => {
    const row = findClientForView(
      req,
      res,
      `SELECT c.*, a.username as owner_username
       FROM clients c JOIN accounts a ON a.id = c.owner_id
       WHERE c.id = ?`,
    );
    if (!row) return;
    const id = Number(row.id);
    const db = getDb();
    const onlineRow = db
      .prepare('SELECT COUNT(*) as cnt FROM connections_live WHERE client_id = ?')
      .get(id) as { cnt: number };
    const groups = db
      .prepare('SELECT g.id, g.name FROM client_groups cg JOIN groups g ON g.id = cg.group_id WHERE cg.client_id = ?')
      .all(id) as { id: number; name: string }[];
    const inboundIds = (
      db.prepare('SELECT inbound_id FROM client_inbounds WHERE client_id = ?').all(id) as { inbound_id: number }[]
    ).map((r) => r.inbound_id);

    res.json({ client: serializeClientRow(row, onlineRow?.cnt || 0, groups, inboundIds) });
  });

  router.post('/', async (req: AuthedRequest, res) => {
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
      templateId?: number;
      trafficGb?: number | null;
      expiryMode?: 'unlimited' | 'days' | 'first_connect' | 'date';
      expiryDays?: number;
      expiresAt?: string;
      deviceLimit?: number | null;
      resetPeriod?: string;
      resetEveryDays?: number;
      resetAnchor?: number;
      subUpdateHours?: number;
      subAnnounce?: string;
      fixedIp?: string;
      vpnPassword?: string;
      note?: string;
      contact?: string;
      groupIds?: number[];
      inboundIds?: number[];
      downloadMbps?: number | null;
      uploadMbps?: number | null;
      enabled?: boolean;
    };

    const db = getDb();
    const limits = getEffectiveLimits(acc);
    const count = Math.min(200, Math.max(1, Number(body.count || 1)));
    const isBulk = count > 1;

    const tplId = Number(body.templateId || 0);
    let tplSettings: TemplateSettings | null = null;
    if (tplId > 0) {
      const loaded = loadValidatedTemplate(acc, limits, tplId);
      if (loaded.error) {
        res.status(loaded.status || 400).json({ error: loaded.error });
        return;
      }
      tplSettings = loaded.settings!;
    } else if (!acc.isOwner && limits.templatesOnly) {
      res.status(403).json({ error: 'Your role may only create clients from approved templates' });
      return;
    }

    const useTemplateValues = Boolean(tplSettings && (acc.isOwner ? body.trafficGb === undefined : limits.templatesOnly));
    const trafficLimitBytes =
      useTemplateValues && tplSettings
        ? tplSettings.trafficLimit > 0
          ? tplSettings.trafficLimit
          : null
        : body.trafficGb === null || body.trafficGb === undefined || body.trafficGb <= 0
          ? null
          : Math.round(body.trafficGb * GB);

    const effDeviceLimit =
      useTemplateValues && tplSettings
        ? tplSettings.maxDevices > 0
          ? tplSettings.maxDevices
          : null
        : (body.deviceLimit ?? null);

    const effResetPeriod = normalizeResetStrategy(
      (useTemplateValues && tplSettings ? tplSettings.resetStrategy : body.resetPeriod) || 'never',
    );
    const effResetEveryDays =
      effResetPeriod === 'every_n_days'
        ? Math.max(1, Math.min(365, Math.trunc(Number((useTemplateValues && tplSettings ? tplSettings.resetEveryDays : body.resetEveryDays) || 30))))
        : 0;
    const effResetAnchor = Number((useTemplateValues && tplSettings ? tplSettings.resetAnchor : body.resetAnchor) || 0) ? 1 : 0;

    const effDlMbps =
      useTemplateValues && tplSettings
        ? tplSettings.speedDown > 0
          ? tplSettings.speedDown / 1000
          : null
        : parseOptionalMbps(body.downloadMbps);
    const effUlMbps =
      useTemplateValues && tplSettings
        ? tplSettings.speedUp > 0
          ? tplSettings.speedUp / 1000
          : null
        : parseOptionalMbps(body.uploadMbps);

    let expiresAt: string | null = null;
    let firstConnectDays: number | null = null;
    if (useTemplateValues && tplSettings) {
      if (tplSettings.days > 0 && tplSettings.startOnFirstUse) firstConnectDays = tplSettings.days;
      else if (tplSettings.days > 0) expiresAt = new Date(Date.now() + tplSettings.days * 86400_000).toISOString();
    } else if (body.expiryMode === 'days' && body.expiryDays && body.expiryDays > 0) {
      expiresAt = new Date(Date.now() + body.expiryDays * 86400_000).toISOString();
    } else if (body.expiryMode === 'first_connect' && body.expiryDays && body.expiryDays > 0) {
      firstConnectDays = body.expiryDays;
    } else if (body.expiryMode === 'date' && body.expiresAt) {
      expiresAt = new Date(body.expiresAt).toISOString();
    }

    const groupIds = filterAllowedIds(
      acc,
      useTemplateValues && tplSettings && tplSettings.groups.length > 0 ? tplSettings.groups : body.groupIds || [],
      acc.allowedGroupIds,
    );
    const inboundIds = filterAllowedIds(
      acc,
      useTemplateValues && tplSettings && tplSettings.instances.length > 0 ? tplSettings.instances : body.inboundIds || [],
      acc.allowedInboundIds,
    );

    const currentOwnedCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM clients WHERE owner_id = ?').get(acc.id) as { cnt: number }
    ).cnt;
    if (!acc.isOwner && limits.clientLimit !== null && currentOwnedCount + count > limits.clientLimit) {
      res.status(403).json({ error: `Client limit reached (${limits.clientLimit})` });
      return;
    }

    if (!acc.isOwner && !(limits.templatesOnly && tplSettings)) {
      const boundErr = validateRoleQuotaBounds(limits, {
        trafficLimitBytes,
        deviceLimit: effDeviceLimit,
        expiresAt,
        firstConnectDays,
        groupCount: groupIds.length,
      });
      if (boundErr) {
        res.status(400).json({ error: boundErr });
        return;
      }
    }

    const baseName = (isBulk ? body.prefix || body.name || 'user' : body.name || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,47}$/.test(baseName)) {
      res.status(400).json({ error: 'Client name must be 2-48 characters, starting with a letter or digit' });
      return;
    }

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const nextResetAt = computeNextResetIso(effResetPeriod, {
      fromMs: Date.now(),
      timeZone: general.timezone || 'Asia/Tehran',
      resetEveryDays: effResetEveryDays,
      resetAnchor: effResetAnchor,
      anchorStartMs: Date.now(),
    });

    const createdIds: number[] = [];
    const createdItems: Array<{ id: number; name: string; subToken: string }> = [];
    const now = new Date().toISOString();
    const certExpiresAt = new Date(Date.now() + 3650 * 86400_000).toISOString();
    const insert = db.prepare(
      `INSERT INTO clients (name, owner_id, traffic_limit_bytes, expires_at, first_connect_days, device_limit, reset_period, reset_every_days, reset_anchor, next_reset_at, template_id, sub_update_hours, sub_announce, fixed_ip, enabled, note, contact, sub_token, wg_private_key, wg_public_key, vpn_password, xray_uuid, ss_password, download_mbps, upload_mbps, cert_serial, cert_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const subUpdateHours = useTemplateValues && tplSettings
      ? tplSettings.subUpdateHours || 0
      : Math.max(0, Math.min(720, Math.trunc(Number(body.subUpdateHours || 0))));
    const subAnnounce = useTemplateValues && tplSettings
      ? tplSettings.subAnnounce || ''
      : String(body.subAnnounce || '').slice(0, 200);

    try {
      const startNum = Math.max(1, Number(body.startNumber || 1));
      const sep = /[-_]$/.test(baseName) ? '' : '-';
      for (let i = 0; i < count; i++) {
        const seq = startNum + i;
        const name = isBulk ? `${baseName}${sep}${String(seq).padStart(2, '0')}` : baseName;
        const keys = generateWireGuardKeypair();
        const vpnPass = !isBulk && body.vpnPassword?.trim() ? body.vpnPassword.trim() : randomToken(12);
        const subTok = randomToken(18);
        const certSerial = crypto.randomBytes(16).toString('hex').toUpperCase();
        const info = insert.run(
          name,
          acc.id,
          trafficLimitBytes,
          expiresAt,
          firstConnectDays,
          effDeviceLimit,
          effResetPeriod,
          effResetEveryDays,
          effResetAnchor,
          nextResetAt,
          tplId,
          subUpdateHours,
          subAnnounce,
          isBulk ? '' : body.fixedIp || '',
          body.enabled === false ? 0 : 1,
          body.note || '',
          body.contact || '',
          subTok,
          keys.privateKey,
          keys.publicKey,
          vpnPass,
          crypto.randomUUID(),
          generateSs2022Key('2022-blake3-aes-128-gcm'),
          effDlMbps,
          effUlMbps,
          certSerial,
          certExpiresAt,
          now,
        );
        const cid = Number(info.lastInsertRowid);
        createdIds.push(cid);
        createdItems.push({ id: cid, name, subToken: subTok });
        for (const gid of groupIds) {
          db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(cid, gid);
        }
        for (const iid of inboundIds) {
          db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cid, iid);
        }
        if (!isBulk) {
          emitEvent({
            type: 'client.created',
            ownerId: acc.id,
            subject: `client:${cid}`,
            data: { clientId: cid, name },
          });
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

    await syncAfterClientChange();
    res.status(201).json({ ids: createdIds, items: createdItems });
  });

  router.patch('/:id', async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (!canMutateClient(acc, Number(existing.owner_id), 'edit')) {
      res.status(403).json({ error: 'No permission to edit this client' });
      return;
    }

    const body = req.body as {
      name?: string;
      trafficGb?: number | null;
      expiresAt?: string | null;
      addDays?: number;
      addTrafficGb?: number;
      deviceLimit?: number | null;
      resetPeriod?: string;
      resetEveryDays?: number;
      resetAnchor?: number;
      subUpdateHours?: number;
      subAnnounce?: string;
      fixedIp?: string;
      vpnPassword?: string;
      note?: string;
      contact?: string;
      enabled?: boolean;
      groupIds?: number[];
      inboundIds?: number[];
      downloadMbps?: number | null;
      uploadMbps?: number | null;
    };

    let nextName = String(existing.name);
    if (body.name !== undefined && body.name.trim() !== nextName) {
      const trimmedName = body.name.trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,47}$/.test(trimmedName)) {
        res.status(400).json({ error: 'Client name must be 2-48 characters, starting with a letter or digit' });
        return;
      }
      const dup = db.prepare('SELECT id FROM clients WHERE name = ? AND id != ?').get(trimmedName, id) as { id: number } | undefined;
      if (dup) {
        res.status(400).json({ error: 'A client with this name already exists' });
        return;
      }
      nextName = trimmedName;
    }

    const prevTrafficLimit = existing.traffic_limit_bytes === null ? null : Number(existing.traffic_limit_bytes);
    let trafficLimitBytes =
      body.trafficGb !== undefined
        ? body.trafficGb === null || body.trafficGb <= 0
          ? null
          : Math.round(body.trafficGb * GB)
        : prevTrafficLimit;

    if (body.addTrafficGb && body.addTrafficGb > 0) {
      trafficLimitBytes = (trafficLimitBytes ?? Number(existing.traffic_used_bytes)) + Math.round(body.addTrafficGb * GB);
    }

    const prevExpiresAt = (existing.expires_at as string | null) ?? null;
    let expiresAt = body.expiresAt !== undefined ? body.expiresAt : prevExpiresAt;
    const nextFirstConnectDays =
      body.expiresAt !== undefined ? null : ((existing.first_connect_days as number | null) ?? null);
    if (body.addDays && body.addDays > 0) {
      const baseMs = expiresAt && new Date(expiresAt).getTime() > Date.now() ? new Date(expiresAt).getTime() : Date.now();
      expiresAt = new Date(baseMs + body.addDays * 86400_000).toISOString();
    }

    const prevDeviceLimit = existing.device_limit === null ? null : Number(existing.device_limit);
    const nextDeviceLimit = body.deviceLimit !== undefined ? body.deviceLimit : prevDeviceLimit;
    const prevDlMbps = parseOptionalMbps(existing.download_mbps);
    const prevUlMbps = parseOptionalMbps(existing.upload_mbps);
    const nextDlMbps = body.downloadMbps !== undefined ? parseOptionalMbps(body.downloadMbps) : prevDlMbps;
    const nextUlMbps = body.uploadMbps !== undefined ? parseOptionalMbps(body.uploadMbps) : prevUlMbps;

    const prevResetPeriod = String(existing.reset_period);
    const nextResetPeriod = body.resetPeriod !== undefined ? normalizeResetStrategy(body.resetPeriod) : prevResetPeriod;
    const prevResetEveryDays = Number(existing.reset_every_days || 0);
    const nextResetEveryDays =
      body.resetEveryDays !== undefined
        ? Math.max(0, Math.min(365, Math.trunc(Number(body.resetEveryDays))))
        : prevResetEveryDays;
    const prevResetAnchor = Number(existing.reset_anchor || 0);
    const nextResetAnchor = body.resetAnchor !== undefined ? (body.resetAnchor ? 1 : 0) : prevResetAnchor;

    // Enforce reseller limits & templatesOnly even on PATCH (only block templatesOnly if plan fields actually changed)
    if (!acc.isOwner) {
      const limits = getEffectiveLimits(acc);
      const planChanged =
        trafficLimitBytes !== prevTrafficLimit ||
        expiresAt !== prevExpiresAt ||
        nextDeviceLimit !== prevDeviceLimit ||
        nextDlMbps !== prevDlMbps ||
        nextUlMbps !== prevUlMbps ||
        nextResetPeriod !== prevResetPeriod ||
        nextResetEveryDays !== prevResetEveryDays ||
        nextResetAnchor !== prevResetAnchor;

      if (limits.templatesOnly && planChanged) {
        res.status(403).json({ error: 'Your role may only change plans via approved templates' });
        return;
      }
      if (planChanged || body.groupIds !== undefined) {
        const boundErr = validateRoleQuotaBounds(limits, {
          trafficLimitBytes,
          deviceLimit: nextDeviceLimit,
          expiresAt,
          groupCount: body.groupIds?.length,
        });
        if (boundErr) {
          res.status(400).json({ error: boundErr });
          return;
        }
      }
    }

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const nextResetAt =
      body.resetPeriod !== undefined || body.resetEveryDays !== undefined || body.resetAnchor !== undefined
        ? computeNextResetIso(nextResetPeriod, {
            fromMs: Date.now(),
            timeZone: general.timezone || 'Asia/Tehran',
            resetEveryDays: nextResetEveryDays,
            resetAnchor: nextResetAnchor,
            anchorStartMs: Date.parse(String(existing.created_at)) || Date.now(),
          })
        : (existing.next_reset_at as string | null);

    db.prepare(
      `UPDATE clients SET
         name = ?, traffic_limit_bytes = ?, expires_at = ?, first_connect_days = ?, device_limit = ?,
         reset_period = ?, reset_every_days = ?, reset_anchor = ?, next_reset_at = ?,
         sub_update_hours = ?, sub_announce = ?, fixed_ip = ?, vpn_password = ?,
         note = ?, contact = ?, enabled = ?, download_mbps = ?, upload_mbps = ?
       WHERE id = ?`,
    ).run(
      nextName,
      trafficLimitBytes,
      expiresAt,
      nextFirstConnectDays,
      nextDeviceLimit,
      nextResetPeriod,
      nextResetEveryDays,
      nextResetAnchor,
      nextResetAt,
      body.subUpdateHours !== undefined ? Math.max(0, Math.min(720, Math.trunc(Number(body.subUpdateHours)))) : Number(existing.sub_update_hours || 0),
      body.subAnnounce !== undefined ? String(body.subAnnounce).slice(0, 200) : String(existing.sub_announce || ''),
      body.fixedIp !== undefined ? body.fixedIp : String(existing.fixed_ip || ''),
      body.vpnPassword !== undefined && body.vpnPassword.trim() ? body.vpnPassword.trim() : String(existing.vpn_password || ''),
      body.note !== undefined ? body.note : String(existing.note || ''),
      body.contact !== undefined ? body.contact : String(existing.contact || ''),
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(existing.enabled),
      nextDlMbps,
      nextUlMbps,
      id,
    );

    if (body.groupIds !== undefined) {
      const nextGroups = filterAllowedIds(acc, body.groupIds, acc.allowedGroupIds);
      db.prepare('DELETE FROM client_groups WHERE client_id = ?').run(id);
      for (const gid of nextGroups) {
        db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, ?)').run(id, gid);
      }
    }
    if (body.inboundIds !== undefined) {
      const nextInbs = filterAllowedIds(acc, body.inboundIds, acc.allowedInboundIds);
      db.prepare('DELETE FROM client_inbounds WHERE client_id = ?').run(id);
      for (const iid of nextInbs) {
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
    if (body.enabled === false) {
      await kickClientConnections(id, 'client_disabled').catch(() => 0);
    }
    await syncAfterClientChange();
    res.json({ ok: true });
  });

  const handleResetTraffic = async (req: AuthedRequest, res: import('express').Response) => {
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
    if (!canMutateClient(acc, existing.owner_id, 'resetTraffic')) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    db.prepare('UPDATE clients SET traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0 WHERE id = ?').run(id);
    emitEvent({
      type: 'client.reset',
      ownerId: existing.owner_id,
      subject: `client:${id}`,
      data: { clientId: id, name: existing.name },
    });
    recordAudit({ accountId: acc.id, username: acc.username, action: 'client.update', target: existing.name, details: 'reset traffic', ip: req.clientIp });
    await syncAfterClientChange();
    res.json({ ok: true });
  };

  router.post('/:id/reset-traffic', handleResetTraffic);
  router.post('/:id/reset', handleResetTraffic);

  const handleSetEnabled = (targetEnabled: boolean) => async (req: AuthedRequest, res: import('express').Response) => {
    const existing = findClientForMutation(req, res, 'edit');
    if (!existing) return;
    const id = Number(existing.id);
    const acc = req.auth!.account;
    getDb().prepare('UPDATE clients SET enabled = ? WHERE id = ?').run(targetEnabled ? 1 : 0, id);
    if (!targetEnabled) {
      await kickClientConnections(id, 'client_disabled').catch(() => 0);
    }
    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'client.update',
      target: String(existing.name),
      details: targetEnabled ? 'enabled' : 'disabled',
      ip: req.clientIp,
    });
    await syncAfterClientChange();
    res.json({ ok: true, enabled: targetEnabled });
  };

  router.post('/:id/enable', handleSetEnabled(true));
  router.post('/:id/disable', handleSetEnabled(false));

  router.post('/:id/extend', async (req: AuthedRequest, res) => {
    const existing = findClientForMutation(req, res, 'edit');
    if (!existing) return;
    const id = Number(existing.id);
    const acc = req.auth!.account;
    const limits = getEffectiveLimits(acc);
    if (!acc.isOwner && limits.templatesOnly) {
      res.status(403).json({ error: 'Your role may only extend plans via approved templates' });
      return;
    }

    const body = req.body as {
      addDays?: number;
      addTrafficGb?: number;
      resetUsedTraffic?: boolean;
    };
    const rawDays = body.addDays === undefined || body.addDays === null ? 0 : Number(body.addDays);
    const rawGb = body.addTrafficGb === undefined || body.addTrafficGb === null ? 0 : Number(body.addTrafficGb);
    if (!Number.isFinite(rawDays) || rawDays < 0 || rawDays > 36500) {
      res.status(400).json({ error: 'Invalid addDays value' });
      return;
    }
    if (!Number.isFinite(rawGb) || rawGb < 0 || rawGb > 1_000_000) {
      res.status(400).json({ error: 'Invalid addTrafficGb value' });
      return;
    }
    const addDays = Math.trunc(rawDays);
    const addTrafficGb = rawGb;
    const resetUsed = Boolean(body.resetUsedTraffic);

    const curExpMs = existing.expires_at ? Date.parse(String(existing.expires_at)) : 0;
    const nextExp =
      addDays > 0
        ? new Date((curExpMs > Date.now() ? curExpMs : Date.now()) + addDays * 86400_000).toISOString()
        : (existing.expires_at as string | null);
    const nextFirstConnectDays = addDays > 0 ? null : ((existing.first_connect_days as number | null) ?? null);

    // Keep unlimited plans unlimited (`null`) when extending so default form values never silently cap them.
    const curLimit = existing.traffic_limit_bytes === null ? null : Number(existing.traffic_limit_bytes);
    const addBytes = addTrafficGb > 0 ? Math.round(addTrafficGb * GB) : 0;
    const nextLimit = addBytes > 0 && curLimit !== null ? curLimit + addBytes : curLimit;

    if (!acc.isOwner) {
      const boundErr = validateRoleQuotaBounds(limits, {
        trafficLimitBytes: nextLimit,
        deviceLimit: existing.device_limit === null ? null : Number(existing.device_limit),
        expiresAt: nextExp,
      });
      if (boundErr) {
        res.status(400).json({ error: boundErr });
        return;
      }
    }

    const db = getDb();
    if (resetUsed) {
      db.prepare(
        `UPDATE clients
         SET expires_at = ?, first_connect_days = ?, traffic_limit_bytes = ?,
             traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0
         WHERE id = ?`,
      ).run(nextExp, nextFirstConnectDays, nextLimit, id);
    } else {
      db.prepare(
        `UPDATE clients
         SET expires_at = ?, first_connect_days = ?, traffic_limit_bytes = ?
         WHERE id = ?`,
      ).run(nextExp, nextFirstConnectDays, nextLimit, id);
    }

    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'client.extend',
      target: String(existing.name),
      details: `+${addDays}d +${addTrafficGb}GB${resetUsed ? ' +reset' : ''}`,
      ip: req.clientIp,
    });
    await syncAfterClientChange();
    res.json({ ok: true });
  });

  router.post('/:id/replace-certificate', async (req: AuthedRequest, res) => {
    const existing = findClientForMutation(req, res, 'edit');
    if (!existing) return;
    const id = Number(existing.id);
    const acc = req.auth!.account;
    const clientName = String(existing.name);
    const cert = await replaceClientCertificate(clientName);
    getDb().prepare('UPDATE clients SET cert_serial = ?, cert_expires_at = ? WHERE id = ?').run(
      cert.serial,
      cert.expiresAt,
      id,
    );
    await kickClientConnections(id, 'certificate_replaced').catch(() => 0);
    await syncAfterClientChange();
    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'client.cert.replace',
      target: clientName,
      ip: req.clientIp,
    });
    res.json({ ok: true, certSerial: cert.serial, certExpiresAt: cert.expiresAt });
  });

  router.get('/:id/usage', (req: AuthedRequest, res) => {
    const client = findClientForView(req, res, 'SELECT id, owner_id FROM clients WHERE id = ?');
    if (!client) return;
    const id = Number(client.id);
    const db = getDb();

    const rawRange = String(req.query.range || '30d');
    const range = rawRange === '24h' || rawRange === '7d' || rawRange === '90d' ? rawRange : '30d';
    const now = new Date();
    const points: Array<{ ts: string; download_bytes: number; upload_bytes: number }> = [];

    if (range === '24h') {
      const rows = db
        .prepare(
          "SELECT ts, download_bytes, upload_bytes FROM client_traffic_samples WHERE client_id = ? AND granularity = 'hour' ORDER BY ts DESC LIMIT 48",
        )
        .all(id) as Array<{ ts: string; download_bytes: number; upload_bytes: number }>;
      // Index by YYYY-MM-DDTHH prefix so collector.ts ISO keys (`...THH:00:00.000Z`) match cleanly.
      const map = new Map(rows.map((r) => [r.ts.slice(0, 13), r]));
      const cur = new Date(now);
      cur.setUTCMinutes(0, 0, 0);
      for (let i = 23; i >= 0; i--) {
        const d = new Date(cur.getTime() - i * 3600_000);
        const hourPrefix = d.toISOString().slice(0, 13);
        const hit = map.get(hourPrefix);
        points.push({
          ts: d.toISOString(),
          download_bytes: hit ? Number(hit.download_bytes || 0) : 0,
          upload_bytes: hit ? Number(hit.upload_bytes || 0) : 0,
        });
      }
      res.json({ range, bucket: 'hour', points });
      return;
    }

    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const rows = db
      .prepare(
        "SELECT ts, download_bytes, upload_bytes FROM client_traffic_samples WHERE client_id = ? AND granularity = 'day' ORDER BY ts DESC LIMIT ?",
      )
      .all(id, days + 2) as Array<{ ts: string; download_bytes: number; upload_bytes: number }>;
    const map = new Map(rows.map((r) => [r.ts.slice(0, 10), r]));
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(todayUtc - i * 86400_000).toISOString().slice(0, 10);
      const hit = map.get(key);
      points.push({
        ts: key,
        download_bytes: hit ? Number(hit.download_bytes || 0) : 0,
        upload_bytes: hit ? Number(hit.upload_bytes || 0) : 0,
      });
    }
    res.json({ range, bucket: 'day', points });
  });

  router.get('/:id/wireguard', (req: AuthedRequest, res) => {
    const client = findClientForView(req, res);
    if (!client) return;
    const id = Number(client.id);

    const wgInbounds = resolveClientInbounds(id).filter(
      (i) => i.protocol === 'wireguard' || i.protocol === 'amneziawg',
    );
    if (wgInbounds.length === 0) {
      res.json({ devices: [] });
      return;
    }

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const wgLive = getDb()
      .prepare(
        `SELECT cl.inbound_id, cl.bytes_in, cl.bytes_out, cl.connected_at
         FROM connections_live cl
         JOIN inbounds i ON i.id = cl.inbound_id
         WHERE cl.client_id = ? AND i.protocol IN ('wireguard', 'amneziawg')`,
      )
      .all(id) as Array<{ inbound_id: number; bytes_in: number; bytes_out: number; connected_at: string }>;

    const privKey = String(client.wg_private_key || '');
    const slotInbounds = wgInbounds.map((ib) => {
      const endpointHost = resolveClientEndpointHost(req, ib, general.publicAddress);
      const prof = generateClientProfile({
        clientName: String(client.name),
        vpnPassword: String(client.vpn_password || ''),
        wgPrivateKey: privKey,
        fixedIp: String(client.fixed_ip || ''),
        clientIndex: id,
        inbound: ib,
        endpointHost,
        nodeName: ib.node_name,
      });
      return {
        id: ib.id,
        name: ib.name,
        port: ib.port,
        protocol: ib.protocol,
        configText: prof.content,
        filename: prof.filename,
      };
    });

    const totalUp = wgLive.reduce((acc, s) => acc + Number(s.bytes_in || 0), 0);
    const totalDown = wgLive.reduce((acc, s) => acc + Number(s.bytes_out || 0), 0);
    res.json({
      devices: [
        {
          slot: 1,
          online: wgLive.length > 0,
          lastHandshakeAt: wgLive[0]?.connected_at || (client.last_online_at ? String(client.last_online_at) : null),
          uploadBytes: totalUp,
          downloadBytes: totalDown,
          inbounds: slotInbounds,
        },
      ],
    });
  });

  router.get('/:id/wireguard/:slot/:inboundId/config.conf', (req: AuthedRequest, res) => {
    const client = findClientForView(req, res);
    if (!client) return;
    const id = Number(client.id);
    const slot = parsePositiveId(req.params.slot);
    if (slot !== 1) {
      res.status(400).json({ error: 'Only WireGuard device slot 1 is supported (single keypair per client)' });
      return;
    }
    const inboundId = parsePositiveId(req.params.inboundId);
    const wgInbounds = resolveClientInbounds(id).filter(
      (i) => i.protocol === 'wireguard' || i.protocol === 'amneziawg',
    );
    const inbound = (inboundId ? wgInbounds.find((i) => i.id === inboundId) : undefined) || wgInbounds[0];
    if (!inbound) {
      res.status(404).json({ error: 'WireGuard inbound not assigned' });
      return;
    }

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const endpointHost = resolveClientEndpointHost(req, inbound, general.publicAddress);
    const prof = generateClientProfile({
      clientName: String(client.name),
      vpnPassword: String(client.vpn_password || ''),
      wgPrivateKey: String(client.wg_private_key || ''),
      fixedIp: String(client.fixed_ip || ''),
      clientIndex: id,
      inbound,
      endpointHost,
      nodeName: inbound.node_name,
    });
    res.setHeader('Content-Type', prof.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${prof.filename}"`);
    res.send(prof.content);
  });

  const handleResetWireguardSlot = async (req: AuthedRequest, res: import('express').Response) => {
    const existing = findClientForMutation(req, res, 'edit');
    if (!existing) return;
    const id = Number(existing.id);
    const slot = parsePositiveId(req.params.slot);
    if (slot !== 1) {
      res.status(400).json({ error: 'Only WireGuard device slot 1 is supported (single keypair per client)' });
      return;
    }
    const acc = req.auth!.account;
    const keys = generateWireGuardKeypair();
    getDb().prepare('UPDATE clients SET wg_private_key = ?, wg_public_key = ? WHERE id = ?').run(
      keys.privateKey,
      keys.publicKey,
      id,
    );
    await kickClientConnections(id, 'wg_keys_rotated').catch(() => 0);
    await syncAfterClientChange();
    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: 'client.wg.reset',
      target: String(existing.name),
      details: `slot ${slot}`,
      ip: req.clientIp,
    });
    res.json({ ok: true, slot });
  };

  router.post('/:id/wireguard/:slot/reset', handleResetWireguardSlot);
  router.post('/:id/wireguard/:slot/:inboundId/reset', handleResetWireguardSlot);

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
    if (!canMutateClient(acc, existing.owner_id, 'edit')) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const token = randomToken(18);
    db.prepare('UPDATE clients SET sub_token = ? WHERE id = ?').run(token, id);
    res.json({ subToken: token });
  });

  router.get('/:id/xray', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const acc = req.auth!.account;
    if (acc.permissions.clients.view === 'none') {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const client = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (!acc.isOwner && acc.permissions.clients.view === 'own' && Number(client.owner_id) !== acc.id) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const fallbackHost =
      general.publicAddress && general.publicAddress !== '127.0.0.1'
        ? general.publicAddress
        : reqHost || '127.0.0.1';
    const xrayInbounds = resolveClientInbounds(id).filter((i) => i.protocol === 'xray');
    const servers = buildClientXrayServerViews(
      {
        id,
        name: String(client.name),
        xrayUuid: String(client.xray_uuid || ''),
        vpnPassword: String(client.vpn_password || ''),
        ssPassword: String(client.ss_password || ''),
      },
      xrayInbounds,
      fallbackHost,
    );
    res.json({ servers });
  });

  router.post('/:id/xray/rotate', async (req: AuthedRequest, res) => {
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
    if (!canMutateClient(acc, existing.owner_id, 'edit')) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const nextUuid = crypto.randomUUID();
    const nextSsPass = generateSs2022Key('2022-blake3-aes-128-gcm');
    const nextVpnPass = randomToken(12);
    db.prepare('UPDATE clients SET xray_uuid = ?, ss_password = ?, vpn_password = ? WHERE id = ?').run(
      nextUuid,
      nextSsPass,
      nextVpnPass,
      id,
    );
    await kickClientConnections(id, 'credentials_rotated').catch(() => 0);
    await syncAfterClientChange();
    recordAudit({ accountId: acc.id, username: acc.username, action: 'client.xray.rotate', target: existing.name, ip: req.clientIp });
    res.json({ ok: true, xrayUuid: nextUuid });
  });

  const handleBulkAction = async (req: AuthedRequest, res: import('express').Response) => {
    const acc = req.auth!.account;
    const {
      ids,
      action,
      addDays,
      days,
      addTrafficGb,
      bytes,
      groupId,
      groupIds,
      groupOp,
      ownerId,
      downloadMbps,
      uploadMbps,
      speedLimitDown,
      speedLimitUp,
      maxDevices,
      templateId,
      subUpdateHours,
      subAnnounce,
    } = req.body as {
      ids?: number[];
      action?: string;
      addDays?: number;
      days?: number;
      addTrafficGb?: number;
      bytes?: number;
      groupId?: number;
      groupIds?: number[];
      groupOp?: 'add' | 'remove' | 'replace';
      ownerId?: number;
      downloadMbps?: number | null;
      uploadMbps?: number | null;
      speedLimitDown?: number;
      speedLimitUp?: number;
      maxDevices?: number | null;
      templateId?: number;
      subUpdateHours?: number;
      subAnnounce?: string;
    };
    if (!ids || ids.length === 0 || !action) {
      res.status(400).json({ error: 'ids and action are required' });
      return;
    }

    const db = getDb();
    const limits = getEffectiveLimits(acc);
    const targetGroupIds = filterAllowedIds(
      acc,
      Array.isArray(groupIds) ? groupIds.map(Number).filter((x) => Number.isFinite(x) && x > 0) : groupId ? [Number(groupId)] : [],
      acc.allowedGroupIds,
    );

    const effAddDays = Number(addDays ?? days ?? 0);
    const effAddBytes = addTrafficGb && addTrafficGb > 0 ? Math.round(addTrafficGb * GB) : Number(bytes || 0);

    if (action === 'move_owner') {
      if (!acc.isOwner) {
        res.status(403).json({ error: 'Only panel owner can move clients' });
        return;
      }
      const targetAcc = db.prepare('SELECT id, active FROM accounts WHERE id = ?').get(Number(ownerId || 0)) as
        | { id: number; active: number }
        | undefined;
      if (!targetAcc || !targetAcc.active) {
        res.json({ done: 0, failed: ['Target account not found or inactive'] });
        return;
      }
      const ph = ids.map(() => '?').join(',');
      const info = db.prepare(`UPDATE clients SET owner_id = ? WHERE id IN (${ph})`).run(targetAcc.id, ...ids);
      recordAudit({ accountId: acc.id, username: acc.username, action: 'client.bulk.move_owner', target: `${ids.length} -> ${targetAcc.id}`, ip: req.clientIp });
      res.json({ ok: true, done: Number(info.changes || 0), failed: [] });
      return;
    }

    let tplSettings: TemplateSettings | null = null;
    if ((action === 'apply_template' || action === 'renew') && templateId) {
      const loaded = loadValidatedTemplate(acc, limits, Number(templateId));
      if (loaded.error) {
        res.status(loaded.status || 400).json({ error: loaded.error });
        return;
      }
      tplSettings = loaded.settings!;
    }

    let done = 0;
    const failed: string[] = [];
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);

    for (const id of ids.slice(0, 1000)) {
      const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        failed.push(`Client #${id} not found`);
        continue;
      }
      if (!acc.isOwner && Number(existing.owner_id) !== acc.id && acc.permissions.clients.edit !== 'all') {
        failed.push(`${existing.name}: no permission`);
        continue;
      }

      if (action === 'enable') {
        db.prepare('UPDATE clients SET enabled = 1 WHERE id = ?').run(id);
      } else if (action === 'disable') {
        db.prepare('UPDATE clients SET enabled = 0 WHERE id = ?').run(id);
        await kickClientConnections(id, 'client_disabled').catch(() => 0);
      } else if (action === 'reset_traffic' || action === 'reset') {
        if (!canMutateClient(acc, Number(existing.owner_id), 'resetTraffic')) {
          failed.push(`${existing.name}: no traffic reset permission`);
          continue;
        }
        db.prepare('UPDATE clients SET traffic_used_bytes = 0, upload_bytes = 0, download_bytes = 0 WHERE id = ?').run(id);
      } else if (action === 'disconnect' || action === 'kick') {
        await kickClientConnections(id, 'admin_kick').catch(() => 0);
      } else if (action === 'delete') {
        if (!canMutateClient(acc, Number(existing.owner_id), 'delete')) {
          failed.push(`${existing.name}: no delete permission`);
          continue;
        }
        await kickClientConnections(id, 'client_deleted').catch(() => 0);
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
        emitEvent({ type: 'client.deleted', ownerId: Number(existing.owner_id), subject: `client:${id}`, data: { clientId: id, name: String(existing.name) } });
      } else if (action === 'extend') {
        if (!acc.isOwner && limits.templatesOnly) {
          failed.push(`${existing.name}: templatesOnly role cannot manually extend quota/expiry`);
          continue;
        }
        const curExp = existing.expires_at ? new Date(String(existing.expires_at)).getTime() : Date.now();
        const nextExp = effAddDays > 0 ? new Date(Math.max(curExp, Date.now()) + effAddDays * 86400_000).toISOString() : (existing.expires_at as string | null);
        const curLimit = existing.traffic_limit_bytes === null ? null : Number(existing.traffic_limit_bytes);
        const nextLimit = effAddBytes > 0 && curLimit !== null ? curLimit + effAddBytes : curLimit;
        if (!acc.isOwner) {
          const boundErr = validateRoleQuotaBounds(limits, {
            trafficLimitBytes: nextLimit,
            deviceLimit: existing.device_limit === null ? null : Number(existing.device_limit),
            expiresAt: nextExp,
          });
          if (boundErr) {
            failed.push(`${existing.name}: ${boundErr}`);
            continue;
          }
        }
        db.prepare('UPDATE clients SET expires_at = ?, traffic_limit_bytes = ? WHERE id = ?').run(nextExp, nextLimit, id);
      } else if (action === 'set_speed') {
        if (!acc.isOwner && limits.templatesOnly) {
          failed.push(`${existing.name}: templatesOnly role cannot override speed limit`);
          continue;
        }
        const dl = speedLimitDown !== undefined ? (speedLimitDown > 0 ? speedLimitDown / 1000 : null) : parseOptionalMbps(downloadMbps);
        const ul = speedLimitUp !== undefined ? (speedLimitUp > 0 ? speedLimitUp / 1000 : null) : parseOptionalMbps(uploadMbps);
        db.prepare('UPDATE clients SET download_mbps = ?, upload_mbps = ? WHERE id = ?').run(dl, ul, id);
      } else if (action === 'set_devices') {
        if (!acc.isOwner && limits.templatesOnly) {
          failed.push(`${existing.name}: templatesOnly role cannot override device limit`);
          continue;
        }
        const cap = maxDevices !== undefined && maxDevices !== null && maxDevices > 0 ? Math.min(1000, Math.trunc(maxDevices)) : null;
        if (!acc.isOwner && limits.maxDevicesPerClient !== null && (!cap || cap > limits.maxDevicesPerClient)) {
          failed.push(`${existing.name}: exceeds role max devices (${limits.maxDevicesPerClient})`);
          continue;
        }
        db.prepare('UPDATE clients SET device_limit = ? WHERE id = ?').run(cap, id);
      } else if (action === 'set_sub') {
        const nextHrs =
          subUpdateHours !== undefined ? Math.max(0, Math.min(720, Math.trunc(Number(subUpdateHours)))) : Number(existing.sub_update_hours || 0);
        const nextAnn = subAnnounce !== undefined ? String(subAnnounce).slice(0, 200) : String(existing.sub_announce || '');
        db.prepare('UPDATE clients SET sub_update_hours = ?, sub_announce = ? WHERE id = ?').run(nextHrs, nextAnn, id);
      } else if (action === 'apply_template' && tplSettings) {
        const nextReset = normalizeResetStrategy(tplSettings.resetStrategy);
        const nextResetAt = computeNextResetIso(nextReset, {
          fromMs: Date.now(),
          timeZone: general.timezone || 'Asia/Tehran',
          resetEveryDays: tplSettings.resetEveryDays,
          resetAnchor: tplSettings.resetAnchor,
        });
        const expAt = tplSettings.days > 0 && !tplSettings.startOnFirstUse ? new Date(Date.now() + tplSettings.days * 86400_000).toISOString() : null;
        const firstDays = tplSettings.days > 0 && tplSettings.startOnFirstUse ? tplSettings.days : null;
        db.prepare(
          `UPDATE clients SET traffic_limit_bytes = ?, expires_at = ?, first_connect_days = ?, device_limit = ?,
           reset_period = ?, reset_every_days = ?, reset_anchor = ?, next_reset_at = ?, template_id = ?,
           download_mbps = ?, upload_mbps = ?, sub_update_hours = ?, sub_announce = ? WHERE id = ?`,
        ).run(
          tplSettings.trafficLimit > 0 ? tplSettings.trafficLimit : null,
          expAt,
          firstDays,
          tplSettings.maxDevices > 0 ? tplSettings.maxDevices : null,
          nextReset,
          tplSettings.resetEveryDays || 0,
          tplSettings.resetAnchor || 0,
          nextResetAt,
          Number(templateId),
          tplSettings.speedDown > 0 ? tplSettings.speedDown / 1000 : null,
          tplSettings.speedUp > 0 ? tplSettings.speedUp / 1000 : null,
          tplSettings.subUpdateHours || 0,
          tplSettings.subAnnounce || '',
          id,
        );
      } else if (action === 'renew' && tplSettings) {
        const curExp = existing.expires_at ? Date.parse(String(existing.expires_at)) : 0;
        const baseMs = curExp > Date.now() ? curExp : Date.now();
        const nextExp = tplSettings.days > 0 ? new Date(baseMs + tplSettings.days * 86400_000).toISOString() : (existing.expires_at as string | null);
        const curLimit = existing.traffic_limit_bytes === null ? null : Number(existing.traffic_limit_bytes);
        const nextLimit = tplSettings.trafficLimit > 0 ? (curLimit ?? Number(existing.traffic_used_bytes)) + tplSettings.trafficLimit : null;
        db.prepare('UPDATE clients SET expires_at = ?, traffic_limit_bytes = ?, template_id = ? WHERE id = ?').run(
          nextExp,
          nextLimit,
          Number(templateId),
          id,
        );
        emitEvent({ type: 'client.renewed', ownerId: Number(existing.owner_id), subject: `client:${id}`, data: { clientId: id, name: String(existing.name) } });
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
      done += 1;
    }

    recordAudit({
      accountId: acc.id,
      username: acc.username,
      action: `client.bulk.${action}`,
      target: `${done}/${ids.length} clients`,
      ip: req.clientIp,
    });
    if (action !== 'disconnect' && action !== 'kick') {
      await syncAfterClientChange();
    }
    res.json({ ok: true, done, failed });
  };

  router.post('/bulk', handleBulkAction);
  router.post('/bulk-action', handleBulkAction);

  router.delete('/:id', async (req: AuthedRequest, res) => {
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
    if (!canMutateClient(acc, existing.owner_id, 'delete')) {
      res.status(403).json({ error: 'No permission to delete this client' });
      return;
    }
    await kickClientConnections(id, 'client_deleted').catch(() => 0);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    emitEvent({
      type: 'client.deleted',
      ownerId: existing.owner_id,
      subject: `client:${id}`,
      data: { clientId: id, name: existing.name },
    });
    await syncAfterClientChange();
    recordAudit({ accountId: acc.id, username: acc.username, action: 'client.delete', target: existing.name, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.get('/:id/profile', async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const inbounds = resolveClientInbounds(id).filter((i) => i.protocol !== 'xray');
    if (inbounds.length === 0) {
      res.status(400).json({ error: 'Client has no tunnel profile inbounds assigned' });
      return;
    }
    const reqInboundId = req.query.inboundId ? Number(req.query.inboundId) : inbounds[0].id;
    const inbound = inbounds.find((i) => i.id === reqInboundId) || inbounds[0];
    if (inbound.protocol === 'openvpn') {
      await ensureOpenVpnPki().catch(() => undefined);
      await ensureClientCertificate(String(client.name)).catch(() => null);
    }
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const connectAddrs = JSON.parse(inbound.connect_addresses_json || '[]') as string[];
    const rawHost = connectAddrs[0] || (inbound.node_address !== '127.0.0.1' ? inbound.node_address : general.publicAddress);
    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const endpointHost = !rawHost || rawHost === '127.0.0.1' ? reqHost || rawHost || '127.0.0.1' : rawHost;

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
