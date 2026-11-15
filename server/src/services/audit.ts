import { getDb } from '../db/database.js';

export function recordAudit(params: {
  accountId?: number | null;
  username?: string;
  action: string;
  target?: string;
  details?: string;
  ip?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (ts, account_id, username, action, target, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    params.accountId ?? null,
    params.username ?? '-',
    params.action,
    params.target ?? '',
    params.details ?? '',
    params.ip ?? '',
  );
}
