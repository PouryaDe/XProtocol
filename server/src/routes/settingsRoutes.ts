import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { backup } from 'node:sqlite';
import {
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_PROXY_APPS,
  DEFAULT_SUB_SETTINGS,
  getDb,
  getSetting,
  setSetting,
  type ProxyAppsSettings,
} from '../db/database.js';
import { getDataDir, getDbPath, saveRuntimeConfig, type RuntimeConfig } from '../config.js';
import { randomToken, sha256Hex } from '../security/auth.js';
import { isIpInAllowlist, normalizeIp } from '../security/loginGuard.js';
import { recordAudit } from '../services/audit.js';
import { extractSqliteBackup } from '../services/offsiteBackup.js';
import { addSubOrigin, checkSubOriginDns, deleteSubOrigin, listSubOrigins, updateSubOrigin } from '../services/subOrigins.js';
import { requireFreshMfa, requireOwner, type AuthedRequest } from './context.js';
import {
  DEFAULT_TELEGRAM_BACKUP,
  findTelegramChatId,
  sendTelegramBackupNow,
  type TelegramBackupSettings,
} from '../services/telegramBackup.js';

export function createSettingsRouter(
  getRuntimeConfig: () => RuntimeConfig,
  setRuntimeConfig: (cfg: RuntimeConfig) => void,
): Router {
  const router = Router();

  router.get('/general', (_req, res) => {
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const runtime = getRuntimeConfig();
    res.json({
      general,
      subOrigins: listSubOrigins(0),
      system: {
        version: '2.0.0-beta.3',
        platform: `${process.platform} ${process.arch}`,
        machineId: runtime.machineId,
      },
    });
  });

  router.put('/general', requireOwner, (req: AuthedRequest, res) => {
    const current = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const body = req.body as Partial<typeof current>;
    const securityChanging =
      body.loginAllowCidrs !== undefined || body.loginOnlyAllowCidrs !== undefined || body.metricsRoot !== undefined;
    if (securityChanging && !requireFreshMfa(req, res)) return;

    const next = { ...current, ...body };
    if (next.loginOnlyAllowCidrs) {
      const callerIp = normalizeIp(req.clientIp || '127.0.0.1');
      if (!isIpInAllowlist(callerIp, next.loginAllowCidrs || [])) {
        res.status(400).json({
          error: `Your current IP (${callerIp}) must be included in Allowed networks before restricting sign-in.`,
        });
        return;
      }
    }

    setSetting('general', next);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'settings.update',
      target: 'general',
      ip: req.clientIp,
    });
    res.json({ general: next, subOrigins: listSubOrigins(0) });
  });

  // Proxy Apps (Happ / v2rayNG / Hiddify) subscription settings
  const serializeProxyApps = (cfg: ProxyAppsSettings) => ({
    updateHours: cfg.updateHours,
    titlePattern: cfg.titlePattern,
    supportUrl: cfg.supportUrl,
    announce: cfg.announce,
    expiredEntry: cfg.expiredEntry,
    happ: cfg.happ || {},
    providerIdSet: Boolean(cfg.providerId),
  });

  router.get('/sub-apps', requireOwner, (_req, res) => {
    res.json(serializeProxyApps(getSetting('proxy_apps', DEFAULT_PROXY_APPS)));
  });

  router.put('/sub-apps', requireOwner, (req: AuthedRequest, res) => {
    const current = getSetting('proxy_apps', DEFAULT_PROXY_APPS);
    const body = req.body as Partial<ProxyAppsSettings>;
    const next: ProxyAppsSettings = {
      updateHours: body.updateHours !== undefined ? Math.max(1, Math.min(720, Number(body.updateHours))) : current.updateHours,
      titlePattern: body.titlePattern !== undefined ? String(body.titlePattern).slice(0, 60) : current.titlePattern,
      supportUrl: body.supportUrl !== undefined ? String(body.supportUrl).trim() : current.supportUrl,
      announce: body.announce !== undefined ? String(body.announce).slice(0, 200) : current.announce,
      expiredEntry: body.expiredEntry !== undefined ? Boolean(body.expiredEntry) : current.expiredEntry,
      happ: body.happ ? { ...current.happ, ...body.happ } : current.happ,
      providerId: body.providerId !== undefined ? String(body.providerId).trim() : current.providerId,
    };
    setSetting('proxy_apps', next);
    res.json(serializeProxyApps(next));
  });

  // Panel-wide Subscription Domains (SubOrigins)
  router.get('/sub-origins', requireOwner, (_req, res) => {
    res.json({ origins: listSubOrigins(0), max: 10, tls: true });
  });

  router.post('/sub-origins', requireOwner, async (req: AuthedRequest, res) => {
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const result = await addSubOrigin(0, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ state: 'done', origin: result.origin, warning: result.warning || '', origins: listSubOrigins(0) });
  });

  router.put('/sub-origins', requireOwner, (req: AuthedRequest, res) => {
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const origins = updateSubOrigin(0, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    res.json({ origins, max: 10, tls: true });
  });

  router.delete('/sub-origins', requireOwner, (req: AuthedRequest, res) => {
    const url = String(req.query.url || '');
    res.json({ origins: deleteSubOrigin(0, url), max: 10, tls: true });
  });

  router.post('/sub-origins/check', requireOwner, async (req, res) => {
    const { url } = req.body as { url?: string };
    res.json(await checkSubOriginDns(url || ''));
  });

  // Sign-in Protection Bans (owner only)
  router.get('/security/bans', requireOwner, (req: AuthedRequest, res) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const yourIp = normalizeIp(req.clientIp || '127.0.0.1');
    const exempt = isIpInAllowlist(yourIp, general.loginAllowCidrs || []);
    const rows = getDb()
      .prepare('SELECT * FROM security_bans ORDER BY last_fail DESC LIMIT 200')
      .all() as Array<Record<string, unknown>>;
    res.json({
      items: rows.map((r) => ({
        key: String(r.key),
        kind: String(r.kind) as 'ip' | 'user',
        target: String(r.target),
        level: Number(r.level || 0),
        until: Number(r.until || 0),
        lastFail: Number(r.last_fail || 0),
        active: Number(r.until || 0) > nowSec,
      })),
      yourIp,
      exempt,
    });
  });

  router.delete('/security/bans/:key', requireOwner, (req: AuthedRequest, res) => {
    const key = decodeURIComponent(String(req.params.key));
    getDb().prepare('DELETE FROM security_bans WHERE key = ?').run(key);
    recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'security.ban.lift', target: key, ip: req.clientIp });
    res.json({ ok: true });
  });

  router.get('/subscription-page', (_req, res) => {
    const settings = getSetting('subscription_page', DEFAULT_SUB_SETTINGS);
    const firstClient = getDb().prepare('SELECT sub_token FROM clients ORDER BY id ASC LIMIT 1').get() as
      | { sub_token: string }
      | undefined;
    res.json({ settings, previewToken: firstClient?.sub_token || null });
  });

  router.put('/subscription-page', requireOwner, (req: AuthedRequest, res) => {
    const current = getSetting('subscription_page', DEFAULT_SUB_SETTINGS);
    const next = { ...current, ...req.body };
    setSetting('subscription_page', next);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'settings.update',
      target: 'subscription_page',
      ip: req.clientIp,
    });
    res.json({ settings: next });
  });

  router.get('/panel-access', requireOwner, (_req, res) => {
    res.json({ panelAccess: getRuntimeConfig() });
  });

  router.put('/panel-access', requireOwner, (req: AuthedRequest, res) => {
    if (!requireFreshMfa(req, res)) return;
    const current = getRuntimeConfig();
    const body = req.body as Partial<RuntimeConfig>;
    const updated = saveRuntimeConfig({
      ...current,
      port: body.port ? Number(body.port) : current.port,
      bindAddress: body.bindAddress !== undefined ? String(body.bindAddress).trim() : current.bindAddress,
      subPort: body.subPort !== undefined ? (body.subPort ? Number(body.subPort) : null) : current.subPort,
      secretPath: body.secretPath !== undefined ? String(body.secretPath) : current.secretPath,
      subPath: body.subPath !== undefined ? String(body.subPath) : current.subPath,
      tlsCertFile: body.tlsCertFile !== undefined ? String(body.tlsCertFile).trim() : current.tlsCertFile,
      tlsKeyFile: body.tlsKeyFile !== undefined ? String(body.tlsKeyFile).trim() : current.tlsKeyFile,
      trustProxy: body.trustProxy !== undefined ? Boolean(body.trustProxy) : current.trustProxy,
    });
    setRuntimeConfig(updated);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'settings.panel',
      target: `port=${updated.port}`,
      ip: req.clientIp,
    });
    res.json({ panelAccess: updated, restartRequired: true });
  });

  // API Tokens (every logged-in user sees their own)
  router.get('/api-tokens', (req: AuthedRequest, res) => {
    const tokens = getDb()
      .prepare('SELECT id, name, prefix, scopes_json, last_used_at, created_at FROM api_tokens WHERE account_id = ? ORDER BY created_at DESC')
      .all(req.auth!.account.id) as Array<Record<string, unknown>>;
    res.json({
      tokens: tokens.map((t) => ({
        id: String(t.id),
        name: String(t.name),
        prefix: String(t.prefix),
        scopes: JSON.parse(String(t.scopes_json)),
        lastUsedAt: t.last_used_at ? String(t.last_used_at) : null,
        createdAt: String(t.created_at),
      })),
    });
  });

  router.post('/api-tokens', (req: AuthedRequest, res) => {
    const { name, scopes } = req.body as { name?: string; scopes?: string[] };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Token name is required' });
      return;
    }
    const secret = `ovk_${randomToken(28)}`;
    const prefix = secret.slice(0, 10);
    const id = crypto.randomBytes(8).toString('hex');
    const cleanScopes = scopes && scopes.length > 0 ? scopes : ['read', 'write'];

    getDb()
      .prepare('INSERT INTO api_tokens (id, account_id, name, prefix, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.auth!.account.id, name.trim(), prefix, sha256Hex(secret), JSON.stringify(cleanScopes), new Date().toISOString());

    res.status(201).json({ id, secret, prefix });
  });

  router.delete('/api-tokens/:id', (req: AuthedRequest, res) => {
    getDb()
      .prepare('DELETE FROM api_tokens WHERE id = ? AND account_id = ?')
      .run(String(req.params.id), req.auth!.account.id);
    res.json({ ok: true });
  });

  router.get('/openapi.json', (req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'XProtocol Open-Core Panel API',
        version: '1.0.4',
        description: 'Self-hosted VPN panel API with scoped Bearer token authentication.',
      },
      servers: [{ url: `${req.protocol}://${req.get('host')}/api` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/dashboard/overview': { get: { summary: 'Panel overview & server telemetry' } },
        '/clients': { get: { summary: 'List clients' }, post: { summary: 'Create client(s)' } },
        '/clients/{id}': { patch: { summary: 'Update client' }, delete: { summary: 'Delete client' } },
        '/groups': { get: { summary: 'List groups' }, post: { summary: 'Create group' } },
        '/inbounds': { get: { summary: 'List inbounds' }, post: { summary: 'Create inbound' } },
        '/nodes': { get: { summary: 'List nodes' }, post: { summary: 'Connect a node' } },
        '/connections/live': { get: { summary: 'List live VPN tunnels' } },
      },
    });
  });

  // Activity Log
  router.get('/audit-log', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    if (!acc.isOwner && acc.permissions.clients.view !== 'all') {
      res.status(403).json({ error: 'No permission to view activity log' });
      return;
    }
    const offset = Math.max(0, Number(req.query.offset || 0));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 40)));
    const rows = getDb()
      .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as Array<Record<string, unknown>>;
    res.json({ entries: rows });
  });

  // Backup Download
  router.get('/backup/download', requireOwner, async (req: AuthedRequest, res) => {
    const tmpBackup = path.join(getDataDir(), `backup-${Date.now()}.db`);
    try {
      await backup(getDb(), tmpBackup);
      recordAudit({
        accountId: req.auth!.account.id,
        username: req.auth!.account.username,
        action: 'backup.download',
        target: 'xprotocol.db',
        ip: req.clientIp,
      });
      res.download(tmpBackup, `xprotocol-${new Date().toISOString().slice(0, 10)}.db`, () => {
        fs.unlink(tmpBackup, () => undefined);
      });
    } catch (err) {
      res.status(500).json({ error: `Backup failed: ${String(err)}` });
    }
  });

  // Restore validation (stores staged restore file; supports raw .db, .db.gz, or encrypted .ovbk)
  router.post('/backup/restore', requireOwner, (req: AuthedRequest, res) => {
    if (!requireFreshMfa(req, res)) return;
    const { base64Db, passphrase } = req.body as { base64Db?: string; passphrase?: string };
    if (!base64Db) {
      res.status(400).json({ error: 'Backup payload is required' });
      return;
    }
    let buf: Buffer;
    try {
      buf = extractSqliteBackup(Buffer.from(base64Db, 'base64'), passphrase);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not decode backup file' });
      return;
    }
    if (buf.subarray(0, 15).toString('utf-8') !== 'SQLite format 3') {
      res.status(400).json({ error: 'Invalid SQLite backup file' });
      return;
    }
    const dbPath = getDbPath();
    const stagedPath = `${dbPath}.pending-restore`;
    fs.writeFileSync(stagedPath, buf);
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'backup.restore',
      target: 'staged',
      ip: req.clientIp,
    });
    res.json({ ok: true, message: 'Backup uploaded. Restart the panel to switch to it.' });
  });

  // Telegram Backups
  router.get('/telegram-backup', requireOwner, (_req, res) => {
    const cfg = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    res.json({ telegram: { ...cfg, botToken: cfg.botToken ? '••••••••' : '' }, hasToken: Boolean(cfg.botToken) });
  });

  router.put('/telegram-backup', requireOwner, (req: AuthedRequest, res) => {
    const current = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    const body = req.body as Partial<TelegramBackupSettings>;
    const next: TelegramBackupSettings = {
      ...current,
      ...body,
      botToken: body.botToken && body.botToken !== '••••••••' ? body.botToken : current.botToken,
    };
    setSetting('telegram_backup', next);
    res.json({ ok: true });
  });

  router.post('/telegram-backup/find-chat', requireOwner, async (req, res) => {
    const current = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    const { botToken } = req.body as { botToken?: string };
    const token = botToken && botToken !== '••••••••' ? botToken : current.botToken;
    if (!token) {
      res.status(400).json({ error: 'Bot token is required' });
      return;
    }
    try {
      const chats = await findTelegramChatId(token);
      res.json({ chats });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.post('/telegram-backup/send-now', requireOwner, async (req, res) => {
    const current = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    const { botToken, chatId } = req.body as { botToken?: string; chatId?: string };
    const token = botToken && botToken !== '••••••••' ? botToken : current.botToken;
    const targetChat = chatId || current.chatId;
    try {
      await sendTelegramBackupNow(token, targetChat);
      setSetting('telegram_backup', { ...current, botToken: token, chatId: targetChat, lastSentAt: new Date().toISOString() });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  return router;
}
