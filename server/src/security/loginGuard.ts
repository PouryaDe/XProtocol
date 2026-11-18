import net from 'node:net';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';

const FAIL_WINDOW_SEC = 600; // 10 minutes
const MAX_FAILS_IN_WINDOW = 5;
const BAN_LADDER_SEC = [600, 3600, 86400, 7 * 86400]; // 10m -> 1h -> 24h -> 7d
const LEVEL_FORGET_SEC = 30 * 86400;

export function normalizeIp(raw: string): string {
  const s = (raw || '').trim();
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s || '127.0.0.1';
}

export function isLoopbackIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

export function ipMatchesCidr(rawIp: string, cidrRaw: string): boolean {
  const ip = normalizeIp(rawIp);
  const entry = cidrRaw.trim();
  if (!entry) return false;
  if (!entry.includes('/')) {
    return ip === normalizeIp(entry);
  }
  const [netAddr, prefixStr] = entry.split('/');
  const prefix = Number(prefixStr);
  const ipNum = ipv4ToInt(ip);
  const netNum = ipv4ToInt(normalizeIp(netAddr));
  if (ipNum !== null && netNum !== null && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (netNum & mask);
  }
  // Simple IPv6 exact/prefix fallback using net.BlockList
  try {
    const bl = new net.BlockList();
    const fam = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
    if (net.isIP(netAddr)) {
      bl.addSubnet(netAddr, prefix, fam);
      return bl.check(ip, fam);
    }
  } catch {
    // ignore malformed CIDR
  }
  return false;
}

export function isIpInAllowlist(rawIp: string, cidrs: string[]): boolean {
  if (isLoopbackIp(rawIp)) return true;
  return cidrs.some((c) => ipMatchesCidr(rawIp, c));
}

export function checkLoginAllowed(
  rawIp: string,
  username: string,
): { allowed: boolean; reason?: string; retryAfterSec?: number; code?: string } {
  const ip = normalizeIp(rawIp);
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const allowCidrs = general.loginAllowCidrs || [];

  if (general.loginOnlyAllowCidrs && !isIpInAllowlist(ip, allowCidrs)) {
    return {
      allowed: false,
      code: 'ip_not_allowed',
      reason: 'Sign-in from this address is restricted by network allowlist policy',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const db = getDb();
  const exempt = isIpInAllowlist(ip, allowCidrs);

  if (!exempt) {
    const ipBan = db.prepare('SELECT level, until FROM security_bans WHERE key = ?').get(`ip:${ip}`) as
      | { level: number; until: number }
      | undefined;
    if (ipBan && ipBan.until > nowSec) {
      return {
        allowed: false,
        code: 'rate_limited',
        retryAfterSec: ipBan.until - nowSec,
        reason: `Too many failed sign-ins. Try again in ${Math.ceil((ipBan.until - nowSec) / 60)} minute(s).`,
      };
    }
  }

  const userKey = `user:${username.trim().toLowerCase()}`;
  const userBan = db.prepare('SELECT until FROM security_bans WHERE key = ?').get(userKey) as
    | { until: number }
    | undefined;
  if (userBan && userBan.until > nowSec) {
    return {
      allowed: false,
      code: 'account_locked',
      retryAfterSec: userBan.until - nowSec,
      reason: `Account temporarily locked due to failed sign-ins. Try again in ${Math.ceil((userBan.until - nowSec) / 60)} minute(s).`,
    };
  }

  return { allowed: true };
}

export function recordLoginFailure(rawIp: string, username: string): { bannedKey?: string; level?: number; until?: number } {
  const ip = normalizeIp(rawIp);
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const allowCidrs = general.loginAllowCidrs || [];
  const exempt = isIpInAllowlist(ip, allowCidrs);
  const nowSec = Math.floor(Date.now() / 1000);
  const db = getDb();

  let banned: { bannedKey?: string; level?: number; until?: number } = {};

  const updateKey = (key: string, kind: 'ip' | 'user', target: string, escalating: boolean) => {
    const existing = db.prepare('SELECT * FROM security_bans WHERE key = ?').get(key) as
      | {
          level: number;
          fail_count: number;
          fail_window_start: number;
          until: number;
          last_fail: number;
        }
      | undefined;

    let level = existing?.level || 0;
    if (existing && nowSec - existing.last_fail > LEVEL_FORGET_SEC) {
      level = 0;
    }
    const inWindow = existing && nowSec - existing.fail_window_start <= FAIL_WINDOW_SEC;
    let failCount = inWindow ? existing.fail_count + 1 : 1;
    let windowStart = inWindow ? existing.fail_window_start : nowSec;
    let until = existing?.until || 0;

    if (failCount >= MAX_FAILS_IN_WINDOW) {
      level = escalating ? Math.min(BAN_LADDER_SEC.length, level + 1) : 1;
      const dur = escalating ? BAN_LADDER_SEC[level - 1] : BAN_LADDER_SEC[0];
      until = nowSec + dur;
      failCount = 0;
      windowStart = nowSec;
      banned = { bannedKey: key, level, until };
    }

    db.prepare(
      `INSERT INTO security_bans (key, kind, target, level, fail_count, fail_window_start, until, last_fail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         level = excluded.level,
         fail_count = excluded.fail_count,
         fail_window_start = excluded.fail_window_start,
         until = excluded.until,
         last_fail = excluded.last_fail`,
    ).run(key, kind, target, level, failCount, windowStart, until, nowSec);
  };

  if (!exempt) {
    updateKey(`ip:${ip}`, 'ip', ip, true);
  }
  const cleanUser = username.trim().toLowerCase();
  if (cleanUser) {
    updateKey(`user:${cleanUser}`, 'user', cleanUser, false);
  }
  return banned;
}

export function clearLoginFailures(rawIp: string, username: string): void {
  const db = getDb();
  const ip = normalizeIp(rawIp);
  db.prepare('UPDATE security_bans SET fail_count = 0, until = 0 WHERE key IN (?, ?)').run(
    `ip:${ip}`,
    `user:${username.trim().toLowerCase()}`,
  );
}
