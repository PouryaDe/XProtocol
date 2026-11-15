import { Router } from 'express';
import { getDb } from '../db/database.js';
import { randomToken, verifyPassword, hashPassword } from '../security/auth.js';
import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotp,
} from '../security/totp.js';
import { recordAudit } from '../services/audit.js';
import { extractClientIp, loadAccountById, type AuthedRequest } from './context.js';
import { getAccountStatus, getEffectiveLimits } from '../security/rbac.js';

export function createAuthRouter(
  authMiddleware: ReturnType<typeof import('./context.js').requireAuth>,
  trustProxy: () => boolean,
): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { username, password, totpCode } = req.body as {
      username?: string;
      password?: string;
      totpCode?: string;
    };
    const ip = extractClientIp(req, trustProxy());
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare('SELECT id, username, password_hash, active, totp_enabled, totp_secret, recovery_codes_json FROM accounts WHERE username = ?')
      .get(username.trim()) as
      | {
          id: number;
          username: string;
          password_hash: string;
          active: number;
          totp_enabled: number;
          totp_secret: string | null;
          recovery_codes_json: string;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      recordAudit({ username: username.trim(), action: 'login.failed', target: username.trim(), ip });
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    if (!row.active) {
      recordAudit({ accountId: row.id, username: row.username, action: 'login.refused', target: 'account disabled', ip });
      res.status(403).json({ error: 'This account has been switched off' });
      return;
    }

    if (row.totp_enabled && row.totp_secret) {
      if (!totpCode) {
        res.status(200).json({ requires2fa: true });
        return;
      }
      const codeTrimmed = totpCode.trim().toUpperCase();
      const totpValid = verifyTotp(row.totp_secret, codeTrimmed);
      if (!totpValid) {
        const recoveryCodes = JSON.parse(row.recovery_codes_json || '[]') as string[];
        const idx = recoveryCodes.indexOf(codeTrimmed);
        if (idx === -1) {
          recordAudit({ accountId: row.id, username: row.username, action: 'login.failed', target: '2fa invalid', ip });
          res.status(401).json({ error: 'Invalid two-factor code' });
          return;
        }
        recoveryCodes.splice(idx, 1);
        db.prepare('UPDATE accounts SET recovery_codes_json = ? WHERE id = ?').run(
          JSON.stringify(recoveryCodes),
          row.id,
        );
        recordAudit({ accountId: row.id, username: row.username, action: 'login.recovery-code', target: row.username, ip });
      }
    }

    const sessionId = randomToken(32);
    const csrfToken = randomToken(24);
    const now = new Date().toISOString();
    const ua = String(req.headers['user-agent'] || '').slice(0, 180);

    db.prepare(
      'INSERT INTO sessions (id, account_id, csrf_token, ip, user_agent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(sessionId, row.id, csrfToken, ip, ua, now, now);

    recordAudit({ accountId: row.id, username: row.username, action: 'login', target: row.username, ip });

    res.cookie('ovira_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400 * 1000,
    });

    const acc = loadAccountById(row.id)!;
    res.json({
      csrfToken,
      account: {
        ...acc,
        status: getAccountStatus(acc),
        effectiveLimits: getEffectiveLimits(acc),
      },
    });
  });

  router.post('/logout', authMiddleware, (req: AuthedRequest, res) => {
    if (req.auth?.sessionId) {
      getDb().prepare('DELETE FROM sessions WHERE id = ?').run(req.auth.sessionId);
    }
    res.clearCookie('ovira_session', { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', authMiddleware, (req: AuthedRequest, res) => {
    const acc = req.auth!.account;
    const db = getDb();
    const raw = db.prepare('SELECT totp_enabled FROM accounts WHERE id = ?').get(acc.id) as { totp_enabled: number };
    const sessions = db
      .prepare('SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE account_id = ? ORDER BY last_seen_at DESC')
      .all(acc.id) as { id: string; ip: string; user_agent: string; created_at: string; last_seen_at: string }[];

    res.json({
      csrfToken: req.auth!.csrfToken || null,
      account: {
        ...acc,
        totpEnabled: Boolean(raw?.totp_enabled),
        status: getAccountStatus(acc),
        effectiveLimits: getEffectiveLimits(acc),
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        current: s.id === req.auth?.sessionId,
      })),
    });
  });

  router.post('/me/password', authMiddleware, (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 10) {
      res.status(400).json({ error: 'New password must be at least 10 characters' });
      return;
    }
    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(req.auth!.account.id) as {
      password_hash: string;
    };
    if (!verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword),
      req.auth!.account.id,
    );
    if (req.auth?.sessionId) {
      db.prepare('DELETE FROM sessions WHERE account_id = ? AND id != ?').run(
        req.auth.account.id,
        req.auth.sessionId,
      );
    }
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'account.password',
      target: req.auth!.account.username,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.post('/me/2fa/setup', authMiddleware, (req: AuthedRequest, res) => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(req.auth!.account.username, 'Ovira', secret);
    res.json({ secret, uri });
  });

  router.post('/me/2fa/enable', authMiddleware, (req: AuthedRequest, res) => {
    const { secret, code } = req.body as { secret?: string; code?: string };
    if (!secret || !code || !verifyTotp(secret, code)) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }
    const recoveryCodes = generateRecoveryCodes(8);
    getDb()
      .prepare('UPDATE accounts SET totp_secret = ?, totp_enabled = 1, recovery_codes_json = ? WHERE id = ?')
      .run(secret, JSON.stringify(recoveryCodes), req.auth!.account.id);

    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'account.2fa.enable',
      target: req.auth!.account.username,
      ip: req.clientIp,
    });
    res.json({ ok: true, recoveryCodes });
  });

  router.post('/me/2fa/disable', authMiddleware, (req: AuthedRequest, res) => {
    const { password } = req.body as { password?: string };
    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(req.auth!.account.id) as {
      password_hash: string;
    };
    if (!password || !verifyPassword(password, row.password_hash)) {
      res.status(400).json({ error: 'Password is incorrect' });
      return;
    }
    db.prepare('UPDATE accounts SET totp_secret = NULL, totp_enabled = 0, recovery_codes_json = ? WHERE id = ?').run(
      '[]',
      req.auth!.account.id,
    );
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'account.2fa.disable',
      target: req.auth!.account.username,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  router.post('/me/2fa/recovery-codes', authMiddleware, (req: AuthedRequest, res) => {
    const { password } = req.body as { password?: string };
    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(req.auth!.account.id) as {
      password_hash: string;
    };
    if (!password || !verifyPassword(password, row.password_hash)) {
      res.status(400).json({ error: 'Password is incorrect' });
      return;
    }
    const recoveryCodes = generateRecoveryCodes(8);
    db.prepare('UPDATE accounts SET recovery_codes_json = ? WHERE id = ?').run(
      JSON.stringify(recoveryCodes),
      req.auth!.account.id,
    );
    res.json({ recoveryCodes });
  });

  router.delete('/me/sessions/:id', authMiddleware, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const db = getDb();
    if (id === 'others' && req.auth?.sessionId) {
      db.prepare('DELETE FROM sessions WHERE account_id = ? AND id != ?').run(
        req.auth.account.id,
        req.auth.sessionId,
      );
    } else {
      db.prepare('DELETE FROM sessions WHERE id = ? AND account_id = ?').run(id, req.auth!.account.id);
    }
    recordAudit({
      accountId: req.auth!.account.id,
      username: req.auth!.account.username,
      action: 'account.sessions.revoke',
      target: id,
      ip: req.clientIp,
    });
    res.json({ ok: true });
  });

  return router;
}
