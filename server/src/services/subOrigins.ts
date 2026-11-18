import dns from 'node:dns/promises';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';

export interface SubOriginRow {
  url: string;
  primary: boolean;
  note: string;
  behindCdn: boolean;
  tlsStatus: string;
  addedAt: number;
}

export function normalizeOriginUrl(raw: string): string | null {
  const s = (raw || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function listSubOrigins(adminId = 0): SubOriginRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM sub_origins WHERE admin_id = ? ORDER BY is_primary DESC, id ASC')
    .all(adminId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    url: String(r.url),
    primary: Boolean(r.is_primary),
    note: String(r.note || ''),
    behindCdn: Boolean(r.behind_cdn),
    tlsStatus: String(r.tls_status || 'ok'),
    addedAt: Math.floor(Date.parse(String(r.added_at)) / 1000) || 0,
  }));
}

export async function checkSubOriginDns(rawUrl: string): Promise<{ ok: boolean; host: string; ips: string[]; error?: string }> {
  const norm = normalizeOriginUrl(rawUrl);
  if (!norm) return { ok: false, host: '', ips: [], error: 'Invalid URL' };
  const host = new URL(norm).hostname;
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { ok: true, host, ips: ['127.0.0.1'] };
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    return { ok: addrs.length > 0, host, ips: addrs.map((a) => a.address) };
  } catch (err) {
    return { ok: false, host, ips: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addSubOrigin(
  adminId: number,
  input: { url: string; note?: string; primary?: boolean; behindCdn?: boolean },
): Promise<{ ok: boolean; origin?: SubOriginRow; warning?: string; error?: string }> {
  const url = normalizeOriginUrl(input.url);
  if (!url) return { ok: false, error: 'Invalid subscription address (e.g. https://sub.example.com)' };
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM sub_origins WHERE admin_id = ? AND url = ?').get(adminId, url);
  if (existing) return { ok: false, error: 'This subscription address is already listed' };

  let warning = '';
  if (!input.behindCdn && process.env.XPROTOCOL_SKIP_NET_FETCH !== '1') {
    const dnsCheck = await checkSubOriginDns(url);
    if (!dnsCheck.ok) {
      warning = `DNS lookup failed for ${new URL(url).hostname}: ${dnsCheck.error || 'no records'}`;
    }
  }

  const currentCount = (db.prepare('SELECT COUNT(*) as cnt FROM sub_origins WHERE admin_id = ?').get(adminId) as { cnt: number }).cnt;
  const makePrimary = Boolean(input.primary) || currentCount === 0;
  if (makePrimary) {
    db.prepare('UPDATE sub_origins SET is_primary = 0 WHERE admin_id = ?').run(adminId);
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sub_origins (admin_id, url, is_primary, note, behind_cdn, tls_status, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(adminId, url, makePrimary ? 1 : 0, (input.note || '').slice(0, 120), input.behindCdn ? 1 : 0, url.startsWith('https://') ? 'ok' : 'http', now);

  if (adminId === 0 && makePrimary) {
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    general.subscriptionLinkAddress = url;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      'general',
      JSON.stringify(general),
    );
  }

  const origins = listSubOrigins(adminId);
  return { ok: true, origin: origins.find((o) => o.url === url), warning: warning || undefined };
}

export function updateSubOrigin(
  adminId: number,
  input: { url: string; note?: string; primary?: boolean; behindCdn?: boolean },
): SubOriginRow[] {
  const url = normalizeOriginUrl(input.url);
  if (!url) return listSubOrigins(adminId);
  const db = getDb();
  if (input.primary) {
    db.prepare('UPDATE sub_origins SET is_primary = 0 WHERE admin_id = ?').run(adminId);
    db.prepare('UPDATE sub_origins SET is_primary = 1 WHERE admin_id = ? AND url = ?').run(adminId, url);
    if (adminId === 0) {
      const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
      general.subscriptionLinkAddress = url;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
        'general',
        JSON.stringify(general),
      );
    }
  }
  if (input.note !== undefined) {
    db.prepare('UPDATE sub_origins SET note = ? WHERE admin_id = ? AND url = ?').run(input.note.slice(0, 120), adminId, url);
  }
  if (input.behindCdn !== undefined) {
    db.prepare('UPDATE sub_origins SET behind_cdn = ? WHERE admin_id = ? AND url = ?').run(input.behindCdn ? 1 : 0, adminId, url);
  }
  return listSubOrigins(adminId);
}

export function deleteSubOrigin(adminId: number, rawUrl: string): SubOriginRow[] {
  const url = normalizeOriginUrl(rawUrl) || rawUrl;
  const db = getDb();
  const wasPrimary = db.prepare('SELECT is_primary FROM sub_origins WHERE admin_id = ? AND url = ?').get(adminId, url) as
    | { is_primary: number }
    | undefined;
  db.prepare('DELETE FROM sub_origins WHERE admin_id = ? AND url = ?').run(adminId, url);
  if (wasPrimary?.is_primary) {
    const first = db.prepare('SELECT id, url FROM sub_origins WHERE admin_id = ? ORDER BY id ASC LIMIT 1').get(adminId) as
      | { id: number; url: string }
      | undefined;
    if (first) {
      db.prepare('UPDATE sub_origins SET is_primary = 1 WHERE id = ?').run(first.id);
    }
  }
  return listSubOrigins(adminId);
}

/** Resolve the primary subscription origin for a client (reseller's own primary origin -> panel primary origin -> fallback). */
export function resolvePrimarySubOriginForOwner(ownerId: number, fallbackOrigin: string): string {
  const resellerOrigins = listSubOrigins(ownerId);
  const resellerPrimary = resellerOrigins.find((o) => o.primary) || resellerOrigins[0];
  if (resellerPrimary) return resellerPrimary.url;

  const panelOrigins = listSubOrigins(0);
  const panelPrimary = panelOrigins.find((o) => o.primary) || panelOrigins[0];
  if (panelPrimary) return panelPrimary.url;

  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  if (general.subscriptionLinkAddress?.trim()) {
    return normalizeOriginUrl(general.subscriptionLinkAddress) || general.subscriptionLinkAddress.trim().replace(/\/+$/, '');
  }
  return fallbackOrigin;
}
