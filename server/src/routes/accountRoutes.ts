import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db/database.js';
import { hashPassword } from '../security/auth.js';
import { recordAudit } from '../services/audit.js';
import { getAccountStatus, type RoleLimits, type RolePermissions } from '../security/rbac.js';
import { addSubOrigin, checkSubOriginDns, deleteSubOrigin, listSubOrigins, updateSubOrigin } from '../services/subOrigins.js';
import { loadAccountById, requireOwner, type AuthedRequest } from './context.js';

const GB = 1024 * 1024 * 1024;

export function createAccountRouter(): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/', (_req, res) => {
    const db = getDb();
    const accounts = db.prepare('SELECT id FROM accounts ORDER BY id ASC').all() as { id: number }[];
    const clientStats = db
      .prepare('SELECT owner_id, COUNT(*) as cnt FROM clients GROUP BY owner_id')
      .all() as { owner_id: number; cnt: number }[];
    const countMap = new Map(clientStats.map((c) => [c.owner_id, c.cnt]));

    const onlineStats = db
      .prepare(
        `SELECT c.owner_id, COUNT(*) as cnt
         FROM connections_live l JOIN clients c ON c.id = l.client_id
         GROUP BY c.owner_id`,
      )
      .all() as { owner_id: number; cnt: number }[];
    const onlineMap = new Map(onlineStats.map((o) => [o.owner_id, o.cnt]));

    const rows = accounts
      .map((a) => loadAccountById(a.id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((acc) => {
        const raw = db.prepare('SELECT totp_enabled, note, created_at FROM accounts WHERE id = ?').get(acc.id) as {
          totp_enabled: number;
          note: string;
          created_at: string;
        };
        return {
          ...acc,
          status: getAccountStatus(acc),
          totpEnabled: Boolean(raw.totp_enabled),
          note: raw.note,
          createdAt: raw.created_at,
          clientCount: countMap.get(acc.id) || 0,
          onlineCount: onlineMap.get(acc.id) || 0,
        };
      });

    res.json({ accounts: rows });
  });

  router.post('/', (req: AuthedRequest, res) => {
    const body = req.body as {
      username?: string;
      password?: string;
      roleId?: string;
      active?: boolean;
      trafficPoolGb?: number | null;
      expiresAt?: string | null;
      allowedGroupIds?: number[];
      allowedInboundIds?: number[];
      allowedTemplateIds?: number[];
      overrideClientLimit?: number | null;
      overrideRequireGroup?: boolean | null;
      overrideMaxTrafficGb?: number | null;
      overrideMaxLifetimeDays?: number | null;
      overrideMaxDevices?: number | null;
      overrideAllowUnlimited?: boolean | null;
      overrideTemplatesOnly?: boolean | null;
      note?: string;
    };

    if (!body.username?.trim() || !body.password || body.password.length < 10) {
      res.status(400).json({ error: 'Username and password (min 10 chars) are required' });
      return;
    }

    const db = getDb();
    try {
      const info = db
        .prepare(
          `INSERT INTO accounts (
             username, password_hash, role_id, active,
             traffic_pool_bytes, expires_at, allowed_group_ids_json, allowed_inbound_ids_json,
             override_allowed_templates_json, override_client_limit, override_require_group, override_max_traffic_gb,
             override_max_lifetime_days, override_max_devices, override_allow_unlimited, override_templates_only,
             note, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.username.trim(),
          hashPassword(body.password),
          body.roleId || 'reseller',
          body.active === false ? 0 : 1,
          body.trafficPoolGb && body.trafficPoolGb > 0 ? Math.round(body.trafficPoolGb * GB) : null,
          body.expiresAt || null,
          JSON.stringify(body.allowedGroupIds || []),
          JSON.stringify(body.allowedInboundIds || []),
          JSON.stringify(body.allowedTemplateIds || []),
          body.overrideClientLimit ?? null,
          body.overrideRequireGroup === undefined || body.overrideRequireGroup === null
            ? null
            : body.overrideRequireGroup
              ? 1
              : 0,
          body.overrideMaxTrafficGb ?? null,
          body.overrideMaxLifetimeDays ?? null,
          body.overrideMaxDevices ?? null,
          body.overrideAllowUnlimited === undefined || body.overrideAllowUnlimited === null
            ? null
            : body.overrideAllowUnlimited
              ? 1
              : 0,
          body.overrideTemplatesOnly === undefined || body.overrideTemplatesOnly === null
            ? null
            : body.overrideTemplatesOnly
              ? 1
              : 0,
          body.note || '',
          new Date().toISOString(),
        );
      recordAudit({
        accountId: req.auth!.account.id,
        username: req.auth!.account.username,
        action: 'admin.create',
        target: body.username.trim(),
        ip: req.clientIp,
      });
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: `Could not create account: ${String(err)}` });
    }
  });

  router.patch('/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const body = req.body as {
      roleId?: string;
      active?: boolean;
      password?: string;
      reset2fa?: boolean;
      addTrafficGb?: number;
      addDays?: number;
      resetUsedTraffic?: boolean;
      trafficPoolGb?: number | null;
      expiresAt?: string | null;
      allowedGroupIds?: number[];
      allowedInboundIds?: number[];
      allowedTemplateIds?: number[];
      overrideClientLimit?: number | null;
      overrideRequireGroup?: boolean | null;
      overrideMaxTrafficGb?: number | null;
      overrideMaxLifetimeDays?: number | null;
      overrideMaxDevices?: number | null;
      overrideAllowUnlimited?: boolean | null;
      overrideTemplatesOnly?: boolean | null;
      note?: string;
    };

    if (id === req.auth!.account.id && body.active === false) {
      res.status(400).json({ error: 'Cannot switch off your own account' });
      return;
    }

    if (body.password) {
      if (body.password.length < 10) {
        res.status(400).json({ error: 'Password must be at least 10 characters' });
        return;
      }
      db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), id);
    }

    if (body.reset2fa) {
      db.prepare("UPDATE accounts SET totp_secret = NULL, totp_enabled = 0, recovery_codes_json = '[]' WHERE id = ?").run(id);
    }

    let poolBytes =
      body.trafficPoolGb !== undefined
        ? body.trafficPoolGb && body.trafficPoolGb > 0
          ? Math.round(body.trafficPoolGb * GB)
          : null
        : existing.traffic_pool_bytes === null
          ? null
          : Number(existing.traffic_pool_bytes);

    if (body.addTrafficGb && body.addTrafficGb > 0) {
      poolBytes = (poolBytes || 0) + Math.round(body.addTrafficGb * GB);
    }

    let expiresAt = body.expiresAt !== undefined ? body.expiresAt : (existing.expires_at as string | null);
    if (body.addDays && body.addDays > 0) {
      const baseMs = expiresAt && new Date(expiresAt).getTime() > Date.now() ? new Date(expiresAt).getTime() : Date.now();
      expiresAt = new Date(baseMs + body.addDays * 86400_000).toISOString();
    }

    db.prepare(
      `UPDATE accounts SET
         role_id = ?,
         active = ?,
         traffic_pool_bytes = ?,
         traffic_used_bytes = ?,
         expires_at = ?,
         allowed_group_ids_json = ?,
         allowed_inbound_ids_json = ?,
         override_allowed_templates_json = ?,
         override_client_limit = ?,
         override_require_group = ?,
         override_max_traffic_gb = ?,
         override_max_lifetime_days = ?,
         override_max_devices = ?,
         override_allow_unlimited = ?,
         override_templates_only = ?,
         note = ?
       WHERE id = ?`,
    ).run(
      body.roleId ?? String(existing.role_id),
      body.active !== undefined ? (body.active ? 1 : 0) : Number(existing.active),
      poolBytes,
      body.resetUsedTraffic ? 0 : Number(existing.traffic_used_bytes),
      expiresAt,
      body.allowedGroupIds ? JSON.stringify(body.allowedGroupIds) : String(existing.allowed_group_ids_json),
      body.allowedInboundIds ? JSON.stringify(body.allowedInboundIds) : String(existing.allowed_inbound_ids_json),
      body.allowedTemplateIds !== undefined
        ? JSON.stringify(body.allowedTemplateIds)
        : String(existing.override_allowed_templates_json || '[]'),
      body.overrideClientLimit !== undefined
        ? body.overrideClientLimit
        : existing.override_client_limit === null
          ? null
          : Number(existing.override_client_limit),
      body.overrideRequireGroup !== undefined
        ? body.overrideRequireGroup === null
          ? null
          : body.overrideRequireGroup
            ? 1
            : 0
        : existing.override_require_group === null
          ? null
          : Number(existing.override_require_group),
      body.overrideMaxTrafficGb !== undefined
        ? body.overrideMaxTrafficGb
        : existing.override_max_traffic_gb === null
          ? null
          : Number(existing.override_max_traffic_gb),
      body.overrideMaxLifetimeDays !== undefined
        ? body.overrideMaxLifetimeDays
        : existing.override_max_lifetime_days === null
          ? null
          : Number(existing.override_max_lifetime_days),
      body.overrideMaxDevices !== undefined
        ? body.overrideMaxDevices
        : existing.override_max_devices === null
          ? null
          : Number(existing.override_max_devices),
      body.overrideAllowUnlimited !== undefined
        ? body.overrideAllowUnlimited === null
          ? null
          : body.overrideAllowUnlimited
            ? 1
            : 0
        : existing.override_allow_unlimited === null
          ? null
          : Number(existing.override_allow_unlimited),
      body.overrideTemplatesOnly !== undefined
        ? body.overrideTemplatesOnly === null
          ? null
          : body.overrideTemplatesOnly
            ? 1
            : 0
        : existing.override_templates_only === null || existing.override_templates_only === undefined
          ? null
          : Number(existing.override_templates_only),
      body.note !== undefined ? body.note : String(existing.note || ''),
      id,
    );

    if (body.active === false) {
      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(id);
    }

    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'admin.update',
      target: String(existing.username),
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.delete('/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (id === req.auth!.account.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    const mode = req.query.clients === 'delete' ? 'delete' : 'transfer';
    const db = getDb();
    const existing = db.prepare('SELECT username FROM accounts WHERE id = ?').get(id) as { username: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (mode === 'delete') {
      db.prepare('DELETE FROM clients WHERE owner_id = ?').run(id);
    } else {
      db.prepare('UPDATE clients SET owner_id = ? WHERE owner_id = ?').run(req.auth!.account.id, id);
    }
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'admin.delete',
      target: existing.username,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  // Roles endpoints
  router.get('/roles', (_req, res) => {
    const db = getDb();
    const roles = db.prepare('SELECT * FROM roles ORDER BY is_owner DESC, created_at ASC').all() as Array<
      Record<string, unknown>
    >;
    const counts = db.prepare('SELECT role_id, COUNT(*) as cnt FROM accounts GROUP BY role_id').all() as {
      role_id: string;
      cnt: number;
    }[];
    const countMap = new Map(counts.map((c) => [c.role_id, c.cnt]));

    res.json({
      roles: roles.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        builtIn: Boolean(r.built_in),
        isOwner: Boolean(r.is_owner),
        permissions: JSON.parse(String(r.permissions_json)) as RolePermissions,
        limits: JSON.parse(String(r.limits_json)) as RoleLimits,
        accountCount: countMap.get(String(r.id)) || 0,
      })),
    });
  });

  router.post('/roles', (req: AuthedRequest, res) => {
    const { name, permissions, limits } = req.body as {
      name?: string;
      permissions?: RolePermissions;
      limits?: RoleLimits;
    };
    if (!name?.trim() || !permissions || !limits) {
      res.status(400).json({ error: 'Name, permissions and limits are required' });
      return;
    }
    const id = `role-${crypto.randomBytes(4).toString('hex')}`;
    getDb()
      .prepare(
        'INSERT INTO roles (id, name, built_in, is_owner, permissions_json, limits_json, created_at) VALUES (?, ?, 0, 0, ?, ?, ?)',
      )
      .run(id, name.trim(), JSON.stringify(permissions), JSON.stringify(limits), new Date().toISOString());

    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'role.create',
      target: name.trim(),
      ip: req.clientIp,
    });
    res.status(201).json({ id });
  });

  router.patch('/roles/:id', (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    if (row.built_in || row.is_owner) {
      res.status(400).json({ error: 'Built-in Owner role cannot be edited; duplicate a role instead' });
      return;
    }
    const { name, permissions, limits } = req.body as {
      name?: string;
      permissions?: RolePermissions;
      limits?: RoleLimits;
    };
    db.prepare('UPDATE roles SET name = ?, permissions_json = ?, limits_json = ? WHERE id = ?').run(
      name?.trim() || String(row.name),
      permissions ? JSON.stringify(permissions) : String(row.permissions_json),
      limits ? JSON.stringify(limits) : String(row.limits_json),
      id,
    );
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'role.update',
      target: String(row.name),
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.delete('/roles/:id', (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT name, built_in, is_owner FROM roles WHERE id = ?').get(id) as
      | { name: string; built_in: number; is_owner: number }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    if (row.built_in || row.is_owner) {
      res.status(400).json({ error: 'Built-in role cannot be deleted' });
      return;
    }
    const used = (db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE role_id = ?').get(id) as { cnt: number }).cnt;
    if (used > 0) {
      res.status(400).json({ error: 'Role is in use by panel accounts' });
      return;
    }
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // Per-reseller subscription domains & proxy app branding
  router.get('/:id/sub-origins', (req, res) => {
    const id = Number(req.params.id);
    res.json({ origins: listSubOrigins(id), max: 5, tls: true });
  });

  router.post('/:id/sub-origins', async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const result = await addSubOrigin(id, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ state: 'done', origin: result.origin, warning: result.warning || '', origins: listSubOrigins(id) });
  });

  router.put('/:id/sub-origins', (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const origins = updateSubOrigin(id, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    res.json({ origins, max: 5, tls: true });
  });

  router.delete('/:id/sub-origins', (req, res) => {
    const id = Number(req.params.id);
    const url = String(req.query.url || '');
    const origins = deleteSubOrigin(id, url);
    res.json({ origins, max: 5, tls: true });
  });

  router.post('/:id/sub-origins/check', async (req, res) => {
    const { url } = req.body as { url?: string };
    res.json(await checkSubOriginDns(url || ''));
  });

  router.get('/:id/sub-apps', (req, res) => {
    const id = Number(req.params.id);
    const row = getDb().prepare('SELECT sub_apps_json FROM accounts WHERE id = ?').get(id) as { sub_apps_json: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const parsed = JSON.parse(String(row.sub_apps_json || '{}')) as Record<string, string>;
    res.json({
      supportUrl: parsed.supportUrl || '',
      title: parsed.title || '',
      renewLink: parsed.renewLink || '',
    });
  });

  router.put('/:id/sub-apps', (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { supportUrl?: string; title?: string; renewLink?: string };
    const payload = {
      supportUrl: String(body.supportUrl || '').trim(),
      title: String(body.title || '').slice(0, 60),
      renewLink: String(body.renewLink || '').trim(),
    };
    getDb().prepare('UPDATE accounts SET sub_apps_json = ? WHERE id = ?').run(JSON.stringify(payload), id);
    res.json(payload);
  });

  return router;
}
