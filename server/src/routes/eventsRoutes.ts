import { Router } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { randomToken } from '../security/auth.js';
import {
  addSubOrigin,
  checkSubOriginDns,
  deleteSubOrigin,
  listSubOrigins,
  updateSubOrigin,
} from '../services/subOrigins.js';
import {
  deliverWebhookOnce,
  emitEvent,
  getAllowedEventTypesForAccount,
  sendTelegramHtml,
  validateWebhookUrl,
  type NotificationPrefs,
} from '../services/events.js';
import { DEFAULT_TELEGRAM_BACKUP, type TelegramBackupSettings } from '../services/telegramBackup.js';
import type { AuthedRequest } from './context.js';

export function createEventsRouter(): Router {
  const router = Router();

  router.get('/events', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const before = Number(req.query.before || 0);
    const db = getDb();

    const params: Array<string | number> = [];
    const where: string[] = [];
    if (!acc.isOwner) {
      where.push('owner_id = ?');
      params.push(acc.id);
    }
    if (before > 0) {
      where.push('id < ?');
      params.push(before);
    }
    const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: Number(r.id),
        type: String(r.type),
        at: Number(r.at),
        ownerId: Number(r.owner_id),
        subject: String(r.subject || ''),
        data: JSON.parse(String(r.data_json || '{}')),
      })),
    );
  });

  router.get('/events/unread', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const db = getDb();
    const readRow = db
      .prepare('SELECT last_seen_event_id FROM account_event_reads WHERE account_id = ?')
      .get(acc.id) as { last_seen_event_id: number } | undefined;
    const lastSeen = readRow?.last_seen_event_id ?? 0;

    const countRow = acc.isOwner
      ? (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE id > ?').get(lastSeen) as { cnt: number })
      : (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE id > ? AND owner_id = ?').get(lastSeen, acc.id) as { cnt: number });

    res.json({ unread: Math.min(99, Number(countRow?.cnt || 0)) });
  });

  router.post('/events/seen', (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const db = getDb();
    const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) as max_id FROM events').get() as { max_id: number };
    const reqId = Number((req.body as { id?: number })?.id ?? maxRow.max_id);
    const seenId = Math.min(Number(maxRow.max_id || 0), Math.max(0, reqId));

    db.prepare(
      `INSERT INTO account_event_reads (account_id, last_seen_event_id) VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET last_seen_event_id = MAX(last_seen_event_id, excluded.last_seen_event_id)`,
    ).run(acc.id, seenId);

    const countRow = acc.isOwner
      ? (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE id > ?').get(seenId) as { cnt: number })
      : (db.prepare('SELECT COUNT(*) as cnt FROM events WHERE id > ? AND owner_id = ?').get(seenId, acc.id) as { cnt: number });

    res.json({ unread: Math.min(99, Number(countRow?.cnt || 0)) });
  });

  // --- Webhooks ---
  function canManageWebhooks(req: AuthedRequest): boolean {
    const acc = req.auth!.account;
    return acc.isOwner || Boolean(acc.permissions.webhooks);
  }

  function mapWebhookRow(r: Record<string, unknown>) {
    return {
      id: Number(r.id),
      ownerId: Number(r.owner_id),
      url: String(r.url),
      events: JSON.parse(String(r.events_json || '[]')) as string[],
      includeSubLink: Boolean(r.include_sub_link),
      allowPrivate: Boolean(r.allow_private),
      enabled: Boolean(r.enabled),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  router.get('/webhooks', (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission to manage webhooks' });
      return;
    }
    const acc = req.auth!.account;
    const db = getDb();
    const rows = acc.isOwner
      ? (db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all() as Array<Record<string, unknown>>)
      : (db.prepare('SELECT * FROM webhooks WHERE owner_id = ? ORDER BY id DESC').all(acc.id) as Array<Record<string, unknown>>);

    res.json({
      items: rows.map(mapWebhookRow),
      types: getAllowedEventTypesForAccount(acc.isOwner),
      owner: acc.isOwner,
    });
  });

  router.post('/webhooks', async (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission to manage webhooks' });
      return;
    }
    const acc = req.auth!.account;
    const body = req.body as {
      url?: string;
      events?: string[];
      includeSubLink?: boolean;
      allowPrivate?: boolean;
      enabled?: boolean;
    };
    const url = (body.url || '').trim();
    const allowPrivate = acc.isOwner ? Boolean(body.allowPrivate) : false;
    const check = await validateWebhookUrl(url, allowPrivate);
    if (!check.ok) {
      res.status(400).json({ error: check.error || 'Invalid webhook URL' });
      return;
    }

    const secret = `whsec_${randomToken(24)}`;
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        `INSERT INTO webhooks (owner_id, url, secret, events_json, include_sub_link, allow_private, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        acc.isOwner ? 0 : acc.id,
        url,
        secret,
        JSON.stringify(Array.isArray(body.events) ? body.events : []),
        body.includeSubLink ? 1 : 0,
        allowPrivate ? 1 : 0,
        body.enabled === false ? 0 : 1,
        now,
        now,
      );
    const item = getDb().prepare('SELECT * FROM webhooks WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({ item: mapWebhookRow(item), secret, warning: check.warning || '' });
  });

  router.put('/webhooks/:id', async (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    const acc = req.auth!.account;
    if (!acc.isOwner && Number(existing.owner_id) !== acc.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as {
      url?: string;
      events?: string[];
      includeSubLink?: boolean;
      allowPrivate?: boolean;
      enabled?: boolean;
    };
    const nextUrl = body.url !== undefined ? body.url.trim() : String(existing.url);
    const allowPrivate = acc.isOwner && body.allowPrivate !== undefined ? Boolean(body.allowPrivate) : Boolean(existing.allow_private);
    const check = await validateWebhookUrl(nextUrl, allowPrivate);
    if (!check.ok) {
      res.status(400).json({ error: check.error || 'Invalid webhook URL' });
      return;
    }
    db.prepare(
      `UPDATE webhooks SET url = ?, events_json = ?, include_sub_link = ?, allow_private = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    ).run(
      nextUrl,
      body.events !== undefined ? JSON.stringify(body.events) : String(existing.events_json),
      body.includeSubLink !== undefined ? (body.includeSubLink ? 1 : 0) : Number(existing.include_sub_link),
      allowPrivate ? 1 : 0,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(existing.enabled),
      new Date().toISOString(),
      id,
    );
    const updated = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ item: mapWebhookRow(updated), warning: check.warning || '' });
  });

  router.delete('/webhooks/:id', (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT owner_id FROM webhooks WHERE id = ?').get(id) as { owner_id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    if (!req.auth!.account.isOwner && existing.owner_id !== req.auth!.account.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  router.post('/webhooks/:id/rotate-secret', (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission to manage webhooks' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT owner_id FROM webhooks WHERE id = ?').get(id) as { owner_id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    if (!req.auth!.account.isOwner && existing.owner_id !== req.auth!.account.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const secret = `whsec_${randomToken(24)}`;
    db.prepare('UPDATE webhooks SET secret = ?, updated_at = ? WHERE id = ?').run(secret, new Date().toISOString(), id);
    res.json({ secret });
  });

  router.post('/webhooks/:id/test', async (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission to manage webhooks' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const hook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as {
      id: number;
      owner_id: number;
      url: string;
      secret: string;
      include_sub_link: number;
      allow_private: number;
    } | undefined;
    if (!hook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    if (!req.auth!.account.isOwner && hook.owner_id !== req.auth!.account.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const testEv = emitEvent({
      type: 'webhook.test',
      ownerId: req.auth!.account.id,
      subject: `webhook:${id}`,
      data: { message: 'Test event from XProtocol' },
    });
    const result = await deliverWebhookOnce(hook, testEv);
    res.json(result);
  });

  router.get('/webhooks/:id/deliveries', (req: AuthedRequest, res) => {
    if (!canManageWebhooks(req)) {
      res.status(403).json({ error: 'No permission to manage webhooks' });
      return;
    }
    const id = Number(req.params.id);
    const db = getDb();
    const hook = db.prepare('SELECT owner_id FROM webhooks WHERE id = ?').get(id) as { owner_id: number } | undefined;
    if (!hook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    if (!req.auth!.account.isOwner && hook.owner_id !== req.auth!.account.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const rows = db
      .prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 30')
      .all(id) as Array<Record<string, unknown>>;
    res.json({
      items: rows.map((r) => ({
        id: Number(r.id),
        eventId: Number(r.event_id),
        eventType: String(r.event_type),
        statusCode: Number(r.status_code),
        ok: Boolean(r.ok),
        error: String(r.error || ''),
        durationMs: Number(r.duration_ms || 0),
        deliveredAt: Number(r.delivered_at),
      })),
    });
  });

  // --- Per-account Telegram notification preferences ---
  function buildNotificationSettings(accId: number, isOwner: boolean) {
    const db = getDb();
    const row = db
      .prepare('SELECT telegram_chat_id, telegram_chat_name, notification_prefs_json FROM accounts WHERE id = ?')
      .get(accId) as { telegram_chat_id: string; telegram_chat_name: string; notification_prefs_json: string } | undefined;
    const tgCfg = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    let prefs: NotificationPrefs = { off: [], locale: '', scope: 'all' };
    try {
      prefs = { ...prefs, ...JSON.parse(row?.notification_prefs_json || '{}') };
    } catch {
      // ignore
    }
    return {
      botReady: Boolean(tgCfg.botToken),
      linked: Boolean(row?.telegram_chat_id),
      name: row?.telegram_chat_name || (row?.telegram_chat_id ? `Chat ${row.telegram_chat_id}` : ''),
      chatId: row?.telegram_chat_id || '',
      prefs,
      types: getAllowedEventTypesForAccount(isOwner),
      defaultLocale: general.defaultSubLanguage || 'en',
      owner: isOwner,
    };
  }

  router.get('/account/notifications', (req: AuthedRequest, res) => {
    res.json(buildNotificationSettings(req.auth!.account.id, req.auth!.account.isOwner));
  });

  router.put('/account/notifications', (req: AuthedRequest, res) => {
    const body = req.body as Partial<NotificationPrefs>;
    const prefs: NotificationPrefs = {
      off: Array.isArray(body.off) ? body.off.map(String) : [],
      locale: body.locale === 'en' || body.locale === 'fa' ? body.locale : '',
      scope: body.scope === 'mine' ? 'mine' : 'all',
    };
    getDb()
      .prepare('UPDATE accounts SET notification_prefs_json = ? WHERE id = ?')
      .run(JSON.stringify(prefs), req.auth!.account.id);
    res.json(buildNotificationSettings(req.auth!.account.id, req.auth!.account.isOwner));
  });

  router.post('/account/telegram/link', async (req: AuthedRequest, res) => {
    const { chatId, name } = req.body as { chatId?: string; name?: string };
    const tgCfg = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    if (chatId?.trim()) {
      getDb()
        .prepare('UPDATE accounts SET telegram_chat_id = ?, telegram_chat_name = ? WHERE id = ?')
        .run(chatId.trim(), (name || `Chat ${chatId.trim()}`).trim(), req.auth!.account.id);
      res.json(buildNotificationSettings(req.auth!.account.id, req.auth!.account.isOwner));
      return;
    }
    // Generate a link token & optionally inspect bot username
    const token = randomToken(12);
    getDb().prepare('UPDATE accounts SET telegram_link_token = ? WHERE id = ?').run(token, req.auth!.account.id);
    let botUsername = '';
    if (tgCfg.botToken && process.env.XPROTOCOL_SKIP_NET_FETCH !== '1') {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tgCfg.botToken}/getMe`, { signal: AbortSignal.timeout(5000) });
        const d = (await r.json()) as { ok?: boolean; result?: { username?: string } };
        if (d.ok && d.result?.username) botUsername = d.result.username;
      } catch {
        // ignore
      }
    }
    res.json({
      linked: false,
      token,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${token}` : '',
    });
  });

  router.delete('/account/telegram', (req: AuthedRequest, res) => {
    getDb()
      .prepare("UPDATE accounts SET telegram_chat_id = '', telegram_chat_name = '', telegram_link_token = '' WHERE id = ?")
      .run(req.auth!.account.id);
    res.json({ ok: true });
  });

  router.post('/account/telegram/test', async (req: AuthedRequest, res) => {
    const row = getDb()
      .prepare('SELECT telegram_chat_id FROM accounts WHERE id = ?')
      .get(req.auth!.account.id) as { telegram_chat_id: string } | undefined;
    const tgCfg = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    if (!tgCfg.botToken || !row?.telegram_chat_id) {
      res.status(400).json({ error: 'Telegram bot token or linked chat ID is missing' });
      return;
    }
    const r = await sendTelegramHtml(
      tgCfg.botToken,
      row.telegram_chat_id,
      `✅ <b>XProtocol</b>\nTest notification for <code>${req.auth!.account.username}</code>`,
    );
    if (!r.ok) {
      res.status(502).json({ error: r.error || 'Telegram send failed' });
      return;
    }
    res.json({ ok: true });
  });

  // --- Self Reseller SubOrigins & SubApps ---
  function canOwnSubOrigins(req: AuthedRequest): boolean {
    return req.auth!.account.isOwner || Boolean(req.auth!.account.permissions.ownSubOrigins);
  }

  router.get('/account/sub-origins', (req: AuthedRequest, res) => {
    if (!canOwnSubOrigins(req)) {
      res.status(403).json({ error: 'Own subscription domain permission required' });
      return;
    }
    const ownerId = req.auth!.account.isOwner ? 0 : req.auth!.account.id;
    res.json({ origins: listSubOrigins(ownerId), max: 10, tls: true });
  });

  router.post('/account/sub-origins', async (req: AuthedRequest, res) => {
    if (!canOwnSubOrigins(req)) {
      res.status(403).json({ error: 'Own subscription domain permission required' });
      return;
    }
    const ownerId = req.auth!.account.isOwner ? 0 : req.auth!.account.id;
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const result = await addSubOrigin(ownerId, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ state: 'done', origin: result.origin, warning: result.warning || '', origins: listSubOrigins(ownerId) });
  });

  router.put('/account/sub-origins', (req: AuthedRequest, res) => {
    if (!canOwnSubOrigins(req)) {
      res.status(403).json({ error: 'Own subscription domain permission required' });
      return;
    }
    const ownerId = req.auth!.account.isOwner ? 0 : req.auth!.account.id;
    const body = req.body as { url?: string; note?: string; primary?: boolean; behindCdn?: boolean };
    const origins = updateSubOrigin(ownerId, {
      url: body.url || '',
      note: body.note,
      primary: body.primary,
      behindCdn: body.behindCdn,
    });
    res.json({ origins, max: 10, tls: true });
  });

  router.delete('/account/sub-origins', (req: AuthedRequest, res) => {
    if (!canOwnSubOrigins(req)) {
      res.status(403).json({ error: 'Own subscription domain permission required' });
      return;
    }
    const ownerId = req.auth!.account.isOwner ? 0 : req.auth!.account.id;
    const url = String(req.query.url || '');
    res.json({ origins: deleteSubOrigin(ownerId, url), max: 10, tls: true });
  });

  router.post('/account/sub-origins/check', async (req: AuthedRequest, res) => {
    const { url } = req.body as { url?: string };
    res.json(await checkSubOriginDns(url || ''));
  });

  router.get('/account/sub-apps', (req: AuthedRequest, res) => {
    const row = getDb()
      .prepare('SELECT sub_apps_json FROM accounts WHERE id = ?')
      .get(req.auth!.account.id) as { sub_apps_json?: string } | undefined;
    const parsed = JSON.parse(String(row?.sub_apps_json || '{}')) as Record<string, string>;
    res.json({
      title: parsed.title || '',
      supportUrl: parsed.supportUrl || '',
      renewLink: parsed.renewLink || '',
    });
  });

  router.put('/account/sub-apps', (req: AuthedRequest, res) => {
    if (!canOwnSubOrigins(req)) {
      res.status(403).json({ error: 'Own subscription domain permission required' });
      return;
    }
    const body = req.body as { title?: string; supportUrl?: string; renewLink?: string };
    const existing = getDb()
      .prepare('SELECT sub_apps_json FROM accounts WHERE id = ?')
      .get(req.auth!.account.id) as { sub_apps_json?: string } | undefined;
    const prev = JSON.parse(String(existing?.sub_apps_json || '{}')) as Record<string, string>;
    const payload = {
      title: body.title !== undefined ? String(body.title).trim().slice(0, 60) : prev.title || '',
      supportUrl: body.supportUrl !== undefined ? String(body.supportUrl).trim().slice(0, 200) : prev.supportUrl || '',
      renewLink: body.renewLink !== undefined ? String(body.renewLink).trim().slice(0, 200) : prev.renewLink || '',
    };
    getDb().prepare('UPDATE accounts SET sub_apps_json = ? WHERE id = ?').run(JSON.stringify(payload), req.auth!.account.id);
    res.json(payload);
  });

  return router;
}
