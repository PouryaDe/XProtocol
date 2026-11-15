import type { Request, Response, NextFunction } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { sha256Hex } from '../security/auth.js';
import {
  getAccountStatus,
  type AccountRecord,
  type RoleLimits,
  type RolePermissions,
} from '../security/rbac.js';

export interface AuthContext {
  account: AccountRecord;
  sessionId?: string;
  csrfToken?: string;
  viaApiToken: boolean;
  apiScopes?: string[];
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
  clientIp?: string;
}

export function extractClientIp(req: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) {
      return fwd.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export function loadAccountById(accountId: number): AccountRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.*, r.name as role_name, r.is_owner, r.permissions_json, r.limits_json
       FROM accounts a
       JOIN roles r ON r.id = a.role_id
       WHERE a.id = ?`,
    )
    .get(accountId) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: Number(row.id),
    username: String(row.username),
    roleId: String(row.role_id),
    roleName: String(row.role_name),
    isOwner: Boolean(row.is_owner),
    active: Boolean(row.active),
    permissions: JSON.parse(String(row.permissions_json)) as RolePermissions,
    roleLimits: JSON.parse(String(row.limits_json)) as RoleLimits,
    trafficPoolBytes: row.traffic_pool_bytes === null ? null : Number(row.traffic_pool_bytes),
    trafficUsedBytes: Number(row.traffic_used_bytes || 0),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    allowedGroupIds: JSON.parse(String(row.allowed_group_ids_json || '[]')) as number[],
    allowedInboundIds: JSON.parse(String(row.allowed_inbound_ids_json || '[]')) as number[],
    overrideClientLimit: row.override_client_limit === null ? null : Number(row.override_client_limit),
    overrideRequireGroup: row.override_require_group === null ? null : Boolean(row.override_require_group),
    overrideMaxTrafficGb: row.override_max_traffic_gb === null ? null : Number(row.override_max_traffic_gb),
    overrideMaxLifetimeDays: row.override_max_lifetime_days === null ? null : Number(row.override_max_lifetime_days),
    overrideMaxDevices: row.override_max_devices === null ? null : Number(row.override_max_devices),
    overrideAllowUnlimited: row.override_allow_unlimited === null ? null : Boolean(row.override_allow_unlimited),
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    result[k] = decodeURIComponent(v);
  }
  return result;
}

export function requireAuth(trustProxy: () => boolean) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const db = getDb();
    req.clientIp = extractClientIp(req, trustProxy());

    // 1. Check Bearer API token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const tokenHash = sha256Hex(token);
      const tokenRow = db
        .prepare('SELECT id, account_id, scopes_json FROM api_tokens WHERE token_hash = ?')
        .get(tokenHash) as { id: string; account_id: number; scopes_json: string } | undefined;
      if (!tokenRow) {
        res.status(401).json({ error: 'Invalid API token' });
        return;
      }
      const account = loadAccountById(tokenRow.account_id);
      if (!account || !account.active) {
        res.status(401).json({ error: 'Account is disabled' });
        return;
      }
      const scopes = JSON.parse(tokenRow.scopes_json) as string[];
      if (req.method !== 'GET' && req.method !== 'HEAD' && !scopes.includes('write')) {
        res.status(403).json({ error: 'API token lacks write scope' });
        return;
      }
      db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), tokenRow.id);
      req.auth = { account, viaApiToken: true, apiScopes: scopes };
      next();
      return;
    }

    // 2. Check session cookie
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies['xprotocol_session'];
    if (!sid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const sessionRow = db
      .prepare('SELECT id, account_id, csrf_token, last_seen_at FROM sessions WHERE id = ?')
      .get(sid) as { id: string; account_id: number; csrf_token: string; last_seen_at: string } | undefined;
    if (!sessionRow) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const timeoutMs = (general.inactivityTimeoutHours || 72) * 3600_000;
    if (Date.now() - new Date(sessionRow.last_seen_at).getTime() > timeoutMs) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionRow.id);
      res.status(401).json({ error: 'Session timed out due to inactivity' });
      return;
    }

    const account = loadAccountById(sessionRow.account_id);
    if (!account || !account.active) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionRow.id);
      res.status(401).json({ error: 'Account disabled' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const csrfHeader = String(req.headers['x-csrf-token'] || '');
      if (!csrfHeader || csrfHeader !== sessionRow.csrf_token) {
        res.status(403).json({ error: 'Invalid or missing CSRF token' });
        return;
      }
    }

    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), sessionRow.id);
    req.auth = {
      account,
      sessionId: sessionRow.id,
      csrfToken: sessionRow.csrf_token,
      viaApiToken: false,
    };
    next();
  };
}

export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.auth?.account.isOwner) {
    res.status(403).json({ error: 'Owner permission required' });
    return;
  }
  next();
}

export function ensureAccountOperational(acc: AccountRecord): string | null {
  if (acc.isOwner) return null;
  const st = getAccountStatus(acc);
  if (st === 'disabled') return 'Account is switched off';
  if (st === 'expired') return 'Reseller plan has expired';
  if (st === 'out_of_traffic') return 'Reseller traffic pool is used up';
  return null;
}

export function computeClientState(
  client: {
    enabled: number;
    traffic_limit_bytes: number | null;
    traffic_used_bytes: number;
    expires_at: string | null;
    first_connect_days: number | null;
    first_connected_at: string | null;
  },
  onlineCount: number,
) {
  const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
  const now = Date.now();
  let status: 'online' | 'active' | 'disabled' | 'expired' | 'used_up' | 'not_started' = 'active';

  if (!client.enabled) {
    status = 'disabled';
  } else if (client.expires_at && new Date(client.expires_at).getTime() <= now) {
    status = 'expired';
  } else if (client.traffic_limit_bytes !== null && client.traffic_used_bytes >= client.traffic_limit_bytes) {
    status = 'used_up';
  } else if (client.first_connect_days && !client.first_connected_at) {
    status = 'not_started';
  } else if (onlineCount > 0) {
    status = 'online';
  }

  let runningOutReason: string | null = null;
  if (status === 'active' || status === 'online') {
    if (client.expires_at) {
      const daysLeft = (new Date(client.expires_at).getTime() - now) / 86400_000;
      if (daysLeft <= general.warnExpiresWithinDays) {
        runningOutReason = 'expiring';
      }
    }
    if (!runningOutReason && client.traffic_limit_bytes && client.traffic_limit_bytes > 0) {
      const pct = (client.traffic_used_bytes / client.traffic_limit_bytes) * 100;
      if (pct >= general.warnTrafficPercent) {
        runningOutReason = 'traffic';
      }
    }
  }

  return { status, runningOutReason };
}
