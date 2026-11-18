import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { DEFAULT_TELEGRAM_BACKUP, type TelegramBackupSettings } from './telegramBackup.js';

export const ALL_EVENT_TYPES = [
  'client.created',
  'client.deleted',
  'client.expired',
  'client.limited',
  'client.quota_warning',
  'client.expiring',
  'client.renewed',
  'client.reset',
  'client.first_connect',
  'reseller.pool_low',
  'reseller.expiring',
  'reseller.expired',
  'node.disconnected',
  'node.connected',
  'node.disk_high',
  'node.memory_high',
  'inbound.stopped',
  'inbound.error',
  'admin.login_new_ip',
  'security.ban',
  'backup.failed',
  'license.expiring',
] as const;

export type EventType = (typeof ALL_EVENT_TYPES)[number] | 'webhook.test' | string;

export interface EventRecord {
  id: number;
  type: string;
  at: number;
  ownerId: number;
  subject: string;
  data: Record<string, unknown>;
}

export interface NotificationPrefs {
  off: string[];
  locale: '' | 'en' | 'fa';
  scope: 'all' | 'mine';
}

function isPrivateOrLocalIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '');
  if (clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') return true;
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (net.isIPv6(clean)) {
    const low = clean.toLowerCase();
    if (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  }
  return false;
}

export async function validateWebhookUrl(rawUrl: string, allowPrivate: boolean): Promise<{ ok: boolean; warning?: string; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid webhook URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Webhook URL must use http or https' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Webhook URL must not include credentials' };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const lowHost = host.toLowerCase();
  if (!allowPrivate && (lowHost === 'localhost' || lowHost.endsWith('.localhost'))) {
    return { ok: false, error: 'Localhost webhook URLs are blocked unless explicitly allowed' };
  }
  if (net.isIP(host)) {
    if (!allowPrivate && isPrivateOrLocalIp(host)) {
      return { ok: false, error: 'Private and internal network addresses are blocked unless explicitly allowed' };
    }
    return { ok: true };
  }
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { ok: true };
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!allowPrivate && addrs.some((a) => isPrivateOrLocalIp(a.address))) {
      return { ok: false, error: 'Resolved host points to a private or internal network' };
    }
    return { ok: true };
  } catch {
    return { ok: true, warning: 'unresolved' };
  }
}

export function getAllowedEventTypesForAccount(isOwner: boolean): string[] {
  if (isOwner) return [...ALL_EVENT_TYPES];
  return ALL_EVENT_TYPES.filter((t) => t.startsWith('client.') || t.startsWith('reseller.') || t === 'admin.login_new_ip');
}

function formatTelegramEventText(event: EventRecord, locale: 'en' | 'fa', panelUrl: string): string {
  const name = String(event.data.name || event.data.username || event.subject || '');
  const linkLine = panelUrl ? `\n${panelUrl.replace(/\/+$/, '')}` : '';
  if (locale === 'fa') {
    const mapFa: Record<string, string> = {
      'client.created': `کاربر جدید ساخته شد: ${name}`,
      'client.deleted': `کاربر حذف شد: ${name}`,
      'client.expired': `اشتراک کاربر منقضی شد: ${name}`,
      'client.limited': `حجم کاربر به پایان رسید: ${name}`,
      'client.quota_warning': `هشدار حجم کاربر (${event.data.pct ?? ''}%): ${name}`,
      'client.expiring': `نزدیک به انقضا (${event.data.days ?? ''} روز): ${name}`,
      'client.renewed': `اشتراک تمدید شد: ${name}`,
      'client.reset': `ترافیک کاربر ریست شد: ${name}`,
      'client.first_connect': `اولین اتصال کاربر: ${name}`,
      'node.disconnected': `نود قطع شد: ${name}`,
      'node.connected': `نود متصل شد: ${name}`,
      'node.disk_high': `مصرف دیسک نود بالا است: ${name}`,
      'node.memory_high': `مصرف رم نود بالا است: ${name}`,
      'admin.login_new_ip': `ورود از IP جدید (${event.data.ip || ''}): ${name}`,
      'security.ban': `مسدودسازی امنیتی ورود: ${event.data.target || name}`,
      'backup.failed': `خطا در بکاپ خودکار (${event.data.destination || ''}): ${event.data.error || ''}`,
      'reseller.pool_low': `حجم نماینده رو به اتمام است: ${name}`,
      'reseller.expiring': `حساب نماینده نزدیک به انقضا است: ${name}`,
    };
    return `🔔 <b>XProtocol</b>\n${mapFa[event.type] || `${event.type}: ${name}`}${linkLine}`;
  }
  const mapEn: Record<string, string> = {
    'client.created': `Client created: ${name}`,
    'client.deleted': `Client deleted: ${name}`,
    'client.expired': `Client expired: ${name}`,
    'client.limited': `Client traffic used up: ${name}`,
    'client.quota_warning': `Client quota warning (${event.data.pct ?? ''}%): ${name}`,
    'client.expiring': `Client expiring soon (${event.data.days ?? ''}d): ${name}`,
    'client.renewed': `Client renewed: ${name}`,
    'client.reset': `Client traffic reset: ${name}`,
    'client.first_connect': `Client first connected: ${name}`,
    'node.disconnected': `Node disconnected: ${name}`,
    'node.connected': `Node connected: ${name}`,
    'node.disk_high': `Node disk usage high: ${name}`,
    'node.memory_high': `Node memory usage high: ${name}`,
    'admin.login_new_ip': `Sign-in from new IP (${event.data.ip || ''}): ${name}`,
    'security.ban': `Sign-in ban triggered: ${event.data.target || name}`,
    'backup.failed': `Backup failed (${event.data.destination || ''}): ${event.data.error || ''}`,
    'reseller.pool_low': `Reseller traffic pool low: ${name}`,
    'reseller.expiring': `Reseller account expiring: ${name}`,
  };
  return `🔔 <b>XProtocol</b>\n${mapEn[event.type] || `${event.type}: ${name}`}${linkLine}`;
}

export async function sendTelegramHtml(botToken: string, chatId: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!botToken || !chatId) return { ok: false, error: 'Missing bot token or chat id' };
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') return { ok: true };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deliverWebhookOnce(
  webhook: { id: number; url: string; secret: string; include_sub_link: number; allow_private: number },
  event: EventRecord,
  subLink?: string,
  attempt = 0,
): Promise<{ statusCode: number; ok: boolean; error: string; durationMs: number }> {
  const payloadObj: Record<string, unknown> = {
    id: event.id,
    type: event.type,
    version: 1,
    at: event.at,
    data: webhook.include_sub_link && subLink ? { ...event.data, subLink } : event.data,
  };
  const body = JSON.stringify(payloadObj);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', webhook.secret).update(`${ts}.${body}`).digest('hex');

  const start = Date.now();
  let statusCode = 0;
  let ok = false;
  let error = '';

  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    ok = true;
    statusCode = 200;
  } else {
    try {
      const check = await validateWebhookUrl(webhook.url, Boolean(webhook.allow_private));
      if (!check.ok) {
        error = check.error || 'Blocked URL';
      } else {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-XProtocol-Event': event.type,
            'X-Ovira-Event': event.type,
            'X-XProtocol-Delivery': `${event.id}-${webhook.id}`,
            'X-Ovira-Delivery': `${event.id}-${webhook.id}`,
            'X-XProtocol-Signature': `t=${ts},v1=${sig}`,
            'X-Ovira-Signature': `t=${ts},v1=${sig}`,
            'User-Agent': 'XProtocol-Webhook/2.0',
          },
          body,
          signal: AbortSignal.timeout(10000),
        });
        statusCode = res.status;
        ok = res.ok;
        if (res.status === 410) {
          getDb().prepare('UPDATE webhooks SET enabled = 0 WHERE id = ?').run(webhook.id);
          error = 'HTTP 410 Gone (webhook disabled)';
        } else if (!res.ok) {
          error = `HTTP ${res.status}`;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const durationMs = Date.now() - start;
  try {
    getDb()
      .prepare(
        `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, status_code, ok, error, duration_ms, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(webhook.id, event.id, event.type, statusCode, ok ? 1 : 0, error, durationMs, Math.floor(Date.now() / 1000));
  } catch {
    // ignore if db closed during tests
  }

  const backoffMs = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
  if (!ok && statusCode !== 410 && attempt < backoffMs.length && process.env.XPROTOCOL_SKIP_NET_FETCH !== '1') {
    const timer = setTimeout(() => {
      deliverWebhookOnce(webhook, event, subLink, attempt + 1).catch(() => undefined);
    }, backoffMs[attempt]);
    timer.unref?.();
  }

  return { statusCode, ok, error, durationMs };
}

export function emitEvent(input: {
  type: EventType;
  ownerId?: number;
  subject?: string;
  data?: Record<string, unknown>;
  subLink?: string;
}): EventRecord {
  const db = getDb();
  const at = Math.floor(Date.now() / 1000);
  const ownerId = input.ownerId ?? 0;
  const subject = input.subject ?? '';
  const data = input.data ?? {};

  const info = db
    .prepare('INSERT INTO events (type, at, owner_id, subject, data_json) VALUES (?, ?, ?, ?, ?)')
    .run(input.type, at, ownerId, subject, JSON.stringify(data));

  const ev: EventRecord = {
    id: Number(info.lastInsertRowid),
    type: input.type,
    at,
    ownerId,
    subject,
    data,
  };

  // Dispatch webhooks asynchronously
  const hooks = db
    .prepare('SELECT id, owner_id, url, secret, events_json, include_sub_link, allow_private FROM webhooks WHERE enabled = 1')
    .all() as Array<{
    id: number;
    owner_id: number;
    url: string;
    secret: string;
    events_json: string;
    include_sub_link: number;
    allow_private: number;
  }>;

  for (const h of hooks) {
    if (h.owner_id !== 0 && h.owner_id !== ownerId) continue;
    const filter = JSON.parse(h.events_json || '[]') as string[];
    if (filter.length > 0 && !filter.includes(ev.type)) continue;
    deliverWebhookOnce(h, ev, input.subLink).catch(() => undefined);
  }

  // Dispatch Telegram notifications asynchronously
  const tgCfg = getSetting<TelegramBackupSettings>('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
  if (tgCfg.botToken && process.env.XPROTOCOL_SKIP_NET_FETCH !== '1') {
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const admins = db
      .prepare(
        `SELECT a.id, a.telegram_chat_id, a.notification_prefs_json, r.is_owner
         FROM accounts a JOIN roles r ON r.id = a.role_id
         WHERE a.active = 1 AND a.telegram_chat_id != ''`,
      )
      .all() as Array<{
      id: number;
      telegram_chat_id: string;
      notification_prefs_json: string;
      is_owner: number;
    }>;

    for (const adm of admins) {
      if (!adm.is_owner && ownerId !== adm.id) continue;
      let prefs: NotificationPrefs = { off: [], locale: '', scope: 'all' };
      try {
        prefs = { ...prefs, ...JSON.parse(adm.notification_prefs_json || '{}') };
      } catch {
        // ignore
      }
      if (prefs.off.includes(ev.type)) continue;
      if (adm.is_owner && prefs.scope === 'mine' && ev.type.startsWith('client.') && ownerId !== adm.id) {
        continue;
      }
      const loc = (prefs.locale || general.defaultSubLanguage || 'en') as 'en' | 'fa';
      const msg = formatTelegramEventText(ev, loc, general.panelUrl || '');
      sendTelegramHtml(tgCfg.botToken, adm.telegram_chat_id, msg).catch(() => undefined);
    }
  }

  return ev;
}

export function pruneOldEvents(): void {
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const days = Math.max(1, Math.min(365, general.eventRetainDays || 30));
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  getDb().prepare('DELETE FROM events WHERE at < ?').run(cutoff);
}
