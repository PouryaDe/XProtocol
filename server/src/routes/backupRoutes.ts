import { Router } from 'express';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import {
  computeNextBackupAt,
  listDestinationFiles,
  probeSftpHostKey,
  restoreFromDestination,
  runBackupToDestination,
  testBackupDestination,
  type DestinationRetention,
  type DestinationSchedule,
  type DestinationSecrets,
  type S3Config,
  type SftpConfig,
} from '../services/offsiteBackup.js';
import { recordAudit } from '../services/audit.js';
import { requireFreshMfa, requireOwner, type AuthedRequest } from './context.js';

function mapDestination(r: Record<string, unknown>) {
  const cfg = JSON.parse(String(r.config_json || '{}'));
  const secrets = JSON.parse(String(r.secrets_json || '{}')) as DestinationSecrets;
  const schedule = JSON.parse(String(r.schedule_json || '{"mode":"daily","hour":3}')) as DestinationSchedule;
  const retention = JSON.parse(String(r.retention_json || '{"keepLast":7,"maxDays":30}')) as DestinationRetention;
  return {
    id: Number(r.id),
    kind: String(r.kind) as 's3' | 'sftp',
    name: String(r.name),
    enabled: Boolean(r.enabled),
    encrypt: Boolean(r.encrypt),
    s3: r.kind === 's3' ? (cfg as S3Config) : undefined,
    sftp: r.kind === 'sftp' ? (cfg as SftpConfig) : undefined,
    hasSecretKey: Boolean(secrets.secretKey),
    hasPassword: Boolean(secrets.password),
    hasPrivateKey: Boolean(secrets.privateKey),
    hasKeyPassphrase: Boolean(secrets.keyPassphrase),
    hasPassphrase: Boolean(secrets.passphrase),
    schedule,
    retention,
    lastAt: Number(r.last_at || 0),
    lastSize: Number(r.last_size || 0),
    lastName: String(r.last_name || ''),
    lastError: String(r.last_error || ''),
    lastErrorAt: Number(r.last_error_at || 0),
    lastPrune: String(r.last_prune || ''),
    nextAt: Number(r.next_at || 0),
    running: Boolean(r.running),
    createdAt: Number(r.created_at || 0),
  };
}

export function createBackupDestinationsRouter(): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/', (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM backup_destinations ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    res.json({ items: rows.map(mapDestination), timezone: general.timezone || '' });
  });

  router.post('/', (req: AuthedRequest, res) => {
    const body = req.body as {
      kind?: 's3' | 'sftp';
      name?: string;
      enabled?: boolean;
      encrypt?: boolean;
      s3?: S3Config;
      sftp?: SftpConfig;
      secrets?: DestinationSecrets;
      schedule?: DestinationSchedule;
      retention?: DestinationRetention;
    };
    const kind = body.kind === 'sftp' ? 'sftp' : 's3';
    const name = (body.name || '').trim().slice(0, 64);
    if (!name) {
      res.status(400).json({ error: 'Destination name is required' });
      return;
    }
    const cfg = kind === 's3' ? body.s3 || { bucket: '', accessKey: '' } : body.sftp || { host: '', user: '', auth: 'password' };
    const schedule: DestinationSchedule = body.schedule || { mode: 'daily', hour: 3 };
    const retention: DestinationRetention = body.retention || { keepLast: 7, maxDays: 30 };
    const enabled = body.enabled !== false;
    const nowSec = Math.floor(Date.now() / 1000);
    const nextAt = enabled ? computeNextBackupAt(schedule, nowSec) : 0;

    const info = getDb()
      .prepare(
        `INSERT INTO backup_destinations (kind, name, enabled, encrypt, config_json, secrets_json, schedule_json, retention_json, next_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        kind,
        name,
        enabled ? 1 : 0,
        body.encrypt ? 1 : 0,
        JSON.stringify(cfg),
        JSON.stringify(body.secrets || {}),
        JSON.stringify(schedule),
        JSON.stringify(retention),
        nextAt,
        nowSec,
      );

    const row = getDb()
      .prepare('SELECT * FROM backup_destinations WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'backup.destination.create', target: name, ip: req.clientIp });
    res.status(201).json(mapDestination(row));
  });

  router.put('/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM backup_destinations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const body = req.body as {
      name?: string;
      enabled?: boolean;
      encrypt?: boolean;
      s3?: S3Config;
      sftp?: SftpConfig;
      secrets?: DestinationSecrets;
      schedule?: DestinationSchedule;
      retention?: DestinationRetention;
    };
    const prevCfg = JSON.parse(String(existing.config_json || '{}'));
    const prevSecrets = JSON.parse(String(existing.secrets_json || '{}')) as DestinationSecrets;
    const prevSched = JSON.parse(String(existing.schedule_json || '{}')) as DestinationSchedule;
    const prevRet = JSON.parse(String(existing.retention_json || '{}')) as DestinationRetention;

    const nextCfg =
      existing.kind === 's3'
        ? { ...prevCfg, ...(body.s3 || {}) }
        : { ...prevCfg, ...(body.sftp || {}), hostKey: prevCfg.hostKey || '' };
    const nextSecrets: DestinationSecrets = { ...prevSecrets };
    if (body.secrets) {
      for (const [k, v] of Object.entries(body.secrets)) {
        if (v !== undefined && v !== '') {
          (nextSecrets as Record<string, string>)[k] = String(v);
        }
      }
    }
    const nextSched = body.schedule ? { ...prevSched, ...body.schedule } : prevSched;
    const nextRet = body.retention ? { ...prevRet, ...body.retention } : prevRet;
    const nextEnabled = body.enabled !== undefined ? body.enabled : Boolean(existing.enabled);
    const nextEncrypt = body.encrypt !== undefined ? body.encrypt : Boolean(existing.encrypt);
    const nextAt = nextEnabled ? computeNextBackupAt(nextSched) : 0;

    db.prepare(
      `UPDATE backup_destinations
       SET name = ?, enabled = ?, encrypt = ?, config_json = ?, secrets_json = ?, schedule_json = ?, retention_json = ?, next_at = ?
       WHERE id = ?`,
    ).run(
      (body.name || String(existing.name)).trim().slice(0, 64),
      nextEnabled ? 1 : 0,
      nextEncrypt ? 1 : 0,
      JSON.stringify(nextCfg),
      JSON.stringify(nextSecrets),
      JSON.stringify(nextSched),
      JSON.stringify(nextRet),
      nextAt,
      id,
    );

    const updated = db.prepare('SELECT * FROM backup_destinations WHERE id = ?').get(id) as Record<string, unknown>;
    res.json(mapDestination(updated));
  });

  router.delete('/:id', (req: AuthedRequest, res) => {
    getDb().prepare('DELETE FROM backup_destinations WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.post('/:id/test', async (req, res) => {
    const row = getDb().prepare('SELECT * FROM backup_destinations WHERE id = ?').get(Number(req.params.id)) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const result = await testBackupDestination(row);
    res.json(result);
  });

  router.post('/:id/accept-hostkey', async (req, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT * FROM backup_destinations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row || row.kind !== 'sftp') {
      res.status(404).json({ error: 'SFTP destination not found' });
      return;
    }
    const cfg = JSON.parse(String(row.config_json || '{}')) as SftpConfig;
    const probe = await probeSftpHostKey(cfg.host, cfg.port || 22);
    if (!probe.ok) {
      res.status(400).json({ error: probe.error || 'Could not retrieve SSH host key' });
      return;
    }
    cfg.hostKey = probe.fingerprint;
    if (probe.knownHostLine) cfg.knownHostLine = probe.knownHostLine;
    db.prepare('UPDATE backup_destinations SET config_json = ? WHERE id = ?').run(JSON.stringify(cfg), id);
    res.json({ ok: true, hostKey: probe.fingerprint, fingerprint: probe.fingerprint });
  });

  router.post('/:id/send', async (req, res) => {
    const result = await runBackupToDestination(Number(req.params.id));
    if (!result.ok) {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  });

  router.get('/:id/files', async (req, res) => {
    const row = getDb().prepare('SELECT * FROM backup_destinations WHERE id = ?').get(Number(req.params.id)) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const files = await listDestinationFiles(row);
    res.json({ files });
  });

  router.post('/:id/restore', async (req: AuthedRequest, res) => {
    if (!requireFreshMfa(req, res)) return;
    if (req.auth?.viaApiToken) {
      res.status(403).json({ error: 'Session required for restore', code: 'token_forbidden' });
      return;
    }
    const row = getDb().prepare('SELECT * FROM backup_destinations WHERE id = ?').get(Number(req.params.id)) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const { name, fileName, passphrase } = req.body as { name?: string; fileName?: string; passphrase?: string };
    const targetName = (name || fileName || '').trim();
    if (!targetName) {
      res.status(400).json({ error: 'Backup filename is required' });
      return;
    }
    const result = await restoreFromDestination(row, targetName, passphrase);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    recordAudit({ accountId: req.auth!.account.id, username: req.auth!.account.username, action: 'backup.restore', target: targetName, ip: req.clientIp });
    res.json({ ok: true, restartRequired: true, message: 'Backup staged. Restart panel service to switch database.' });
  });

  return router;
}
