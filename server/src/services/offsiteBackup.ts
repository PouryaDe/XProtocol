import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { backup } from 'node:sqlite';
import { getDb, getSetting, DEFAULT_GENERAL_SETTINGS } from '../db/database.js';
import { getDbPath } from '../config.js';
import { emitEvent } from './events.js';

const execFileAsync = promisify(execFile);

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket: string;
  prefix?: string;
  pathStyle?: boolean;
  accessKey: string;
}

export interface SftpConfig {
  host: string;
  port?: number;
  user: string;
  dir?: string;
  path?: string;
  auth: 'password' | 'key';
  hostKey?: string;
  knownHostLine?: string;
}

export interface DestinationSecrets {
  secretKey?: string;
  password?: string;
  privateKey?: string;
  keyPassphrase?: string;
  passphrase?: string;
}

export interface DestinationSchedule {
  mode: 'interval' | 'daily';
  hours?: number;
  hour?: number;
}

export interface DestinationRetention {
  keepLast?: number;
  maxDays?: number;
}

const BACKUP_MAGIC = Buffer.from('XPBK01\x00\x00', 'binary'); // 8 bytes

export function encryptBackupBuffer(gzBuf: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(gzBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, salt, iv, tag, enc]);
}

export function decryptBackupBuffer(buf: Buffer, passphrase: string): Buffer {
  if (buf.length < 52 || !buf.subarray(0, 8).equals(BACKUP_MAGIC)) {
    throw new Error('Invalid encrypted backup header');
  }
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const enc = buf.subarray(52);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export async function buildBackupPayload(encrypt: boolean, passphrase?: string): Promise<{ filename: string; data: Buffer }> {
  const tmpSqlite = path.join(os.tmpdir(), `xprotocol-bk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  await backup(getDb(), tmpSqlite);
  try {
    const raw = fs.readFileSync(tmpSqlite);
    const gz = zlib.gzipSync(raw, { level: 6 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (encrypt && passphrase) {
      return { filename: `xprotocol-${stamp}.db.gz.ovbk`, data: encryptBackupBuffer(gz, passphrase) };
    }
    return { filename: `xprotocol-${stamp}.db.gz`, data: gz };
  } finally {
    fs.rmSync(tmpSqlite, { force: true });
  }
}

export function extractSqliteBackup(raw: Buffer, passphrase?: string): Buffer {
  let gz = raw;
  if (raw.subarray(0, 8).equals(BACKUP_MAGIC)) {
    if (!passphrase) throw new Error('Passphrase required for encrypted backup');
    gz = decryptBackupBuffer(raw, passphrase);
  }
  // Check gzip magic 1f 8b
  if (gz.length >= 2 && gz[0] === 0x1f && gz[1] === 0x8b) {
    return zlib.gunzipSync(gz);
  }
  return gz;
}

// --- AWS SigV4 minimal client (zero dependencies) ---
function hmacSha256(key: Buffer | string, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function sha256HexBuf(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildS3Url(s3: S3Config, keyPath = '', query: Record<string, string> = {}): { url: URL; host: string; canonicalUri: string } {
  const region = s3.region?.trim() || 'us-east-1';
  const baseEndpoint = s3.endpoint?.trim() ? s3.endpoint.trim().replace(/\/+$/, '') : `https://s3.${region}.amazonaws.com`;
  const parsed = new URL(baseEndpoint);
  const cleanKey = keyPath.replace(/^\/+/, '');
  let url: URL;
  if (s3.pathStyle || parsed.hostname.includes('localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
    url = new URL(`${parsed.origin}/${encodeURIComponent(s3.bucket)}${cleanKey ? `/${cleanKey.split('/').map(encodeURIComponent).join('/')}` : ''}`);
  } else {
    url = new URL(`${parsed.protocol}//${s3.bucket}.${parsed.host}${cleanKey ? `/${cleanKey.split('/').map(encodeURIComponent).join('/')}` : '/'}`);
  }
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return { url, host: url.host, canonicalUri: url.pathname || '/' };
}

async function s3Request(
  s3: S3Config,
  secretKey: string,
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
  keyPath: string,
  opts: { query?: Record<string, string>; body?: Buffer } = {},
): Promise<{ status: number; body: Buffer }> {
  const region = s3.region?.trim() || 'us-east-1';
  const { url, host, canonicalUri } = buildS3Url(s3, keyPath, opts.query || {});
  const body = opts.body ?? Buffer.alloc(0);
  const payloadHash = sha256HexBuf(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const sortedQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256HexBuf(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${s3.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Host: host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authHeader,
    },
    body: method === 'PUT' ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: buf };
}

function parseS3ListXml(xml: string): Array<{ name: string; size: number; modifiedAt: number }> {
  const files: Array<{ name: string; size: number; modifiedAt: number }> = [];
  const matches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
  for (const m of matches) {
    const block = m[1];
    const key = block.match(/<Key>([^<]+)<\/Key>/)?.[1] || '';
    const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] || 0);
    const mod = block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] || '';
    const base = path.posix.basename(key);
    if (!base.startsWith('xprotocol-') && !base.endsWith('.db.gz') && !base.endsWith('.ovbk')) continue;
    files.push({
      name: base,
      size,
      modifiedAt: mod ? Math.floor(Date.parse(mod) / 1000) : 0,
    });
  }
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

function sanitizeSftpHostOrUser(v: string, label: string): string {
  const s = (v || '').trim();
  if (!s || s.startsWith('-') || /[\s\r\n"'`$;|&<>\\]/.test(s)) {
    throw new Error(`Invalid SFTP ${label}`);
  }
  return s;
}

function sanitizeSftpDir(v: string | undefined): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/[\r\n"'`$;|&<>\\]/.test(s)) {
    throw new Error('Invalid SFTP remote directory path');
  }
  return s;
}

/** Validate archive filename against path traversal or SFTP batch injection. */
function sanitizeArchiveName(name: string): string {
  const base = path.posix.basename((name || '').trim());
  if (!base || base !== name.trim() || !/^[a-zA-Z0-9._-]+$/.test(base) || base.includes('..')) {
    throw new Error('Invalid backup archive filename');
  }
  return base;
}

async function runSftpCommand(
  sftp: SftpConfig,
  secrets: DestinationSecrets,
  batchCommands: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (process.platform !== 'linux') {
    return { ok: false, stdout: '', stderr: 'SFTP execution requires Linux OpenSSH client' };
  }
  let host: string;
  let user: string;
  try {
    host = sanitizeSftpHostOrUser(sftp.host, 'host');
    user = sanitizeSftpHostOrUser(sftp.user, 'username');
  } catch (err) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : 'Invalid SFTP target' };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-sftp-'));
  try {
    const knownHosts = path.join(tmpDir, 'known_hosts');
    const pinned = Boolean(sftp.knownHostLine && sftp.knownHostLine.trim());
    fs.writeFileSync(knownHosts, pinned ? `${sftp.knownHostLine!.trim()}\n` : '', { mode: 0o600 });
    const args: string[] = [
      '-P',
      String(Math.max(1, Math.min(65535, Number(sftp.port || 22)))),
      '-o',
      'BatchMode=yes',
      '-o',
      `StrictHostKeyChecking=${pinned ? 'yes' : 'accept-new'}`,
      '-o',
      `UserKnownHostsFile=${knownHosts}`,
    ];
    if (sftp.auth === 'key' && secrets.privateKey) {
      const keyPath = path.join(tmpDir, 'id_key');
      fs.writeFileSync(keyPath, secrets.privateKey + '\n', { mode: 0o600 });
      args.push('-i', keyPath);
    }
    const batchFile = path.join(tmpDir, 'batch.txt');
    fs.writeFileSync(batchFile, batchCommands.join('\n') + '\n');
    args.push('-b', batchFile, `${user}@${host}`);
    const res = await execFileAsync('sftp', args, { timeout: 30_000 });
    return { ok: true, stdout: res.stdout, stderr: res.stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout || '', stderr: e.stderr || e.message || String(err) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function probeSftpHostKey(hostRaw: string, port = 22): Promise<{ ok: boolean; fingerprint: string; knownHostLine?: string; error?: string }> {
  let host: string;
  try {
    host = sanitizeSftpHostOrUser(hostRaw, 'host');
  } catch (err) {
    return { ok: false, fingerprint: '', error: err instanceof Error ? err.message : 'Invalid SSH host' };
  }
  if (process.platform !== 'linux') {
    const fp = `SHA256:${crypto.createHash('sha256').update(`${host}:${port}`).digest('base64').replace(/=+$/, '')}`;
    return { ok: true, fingerprint: fp, knownHostLine: `${host} ssh-ed25519 ${fp}` };
  }
  try {
    const scan = await execFileAsync('ssh-keyscan', ['-p', String(Math.max(1, Math.min(65535, Number(port || 22)))), '-T', '5', '--', host], { timeout: 8000 });
    if (!scan.stdout.trim()) return { ok: false, fingerprint: '', error: 'Could not read SSH host key' };
    const tmp = path.join(os.tmpdir(), `xp-hk-${Date.now()}.pub`);
    fs.writeFileSync(tmp, scan.stdout);
    try {
      const fp = await execFileAsync('ssh-keygen', ['-lf', tmp], { timeout: 4000 });
      const line = fp.stdout.trim().split('\n')[0] || '';
      const shaMatch = line.match(/(SHA256:[^\s]+)/);
      return { ok: true, fingerprint: shaMatch ? shaMatch[1] : line, knownHostLine: scan.stdout.trim() };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  } catch (err) {
    return { ok: false, fingerprint: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testBackupDestination(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string; hostKey?: string }> {
  const kind = String(row.kind);
  const cfg = JSON.parse(String(row.config_json || '{}'));
  const secrets = JSON.parse(String(row.secrets_json || '{}')) as DestinationSecrets;

  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { ok: true };
  }

  if (kind === 's3') {
    const s3 = cfg as S3Config;
    if (!s3.bucket || !s3.accessKey || !secrets.secretKey) {
      return { ok: false, error: 'Bucket, access key, and secret key are required' };
    }
    try {
      const r = await s3Request(s3, secrets.secretKey, 'GET', '', {
        query: { 'list-type': '2', 'max-keys': '1', ...(s3.prefix ? { prefix: s3.prefix.replace(/^\/+/, '') } : {}) },
      });
      if (r.status >= 200 && r.status < 300) return { ok: true };
      return { ok: false, error: `S3 returned HTTP ${r.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const sftp = cfg as SftpConfig;
  const hk = await probeSftpHostKey(sftp.host, sftp.port || 22);
  if (!hk.ok) return { ok: false, error: hk.error || 'SSH host unreachable' };
  const cmd = await runSftpCommand(sftp, secrets, ['pwd']);
  return cmd.ok ? { ok: true, hostKey: hk.fingerprint } : { ok: false, error: cmd.stderr || 'SFTP auth failed', hostKey: hk.fingerprint };
}

export async function listDestinationFiles(row: Record<string, unknown>): Promise<Array<{ name: string; size: number; modifiedAt: number }>> {
  const kind = String(row.kind);
  const cfg = JSON.parse(String(row.config_json || '{}'));
  const secrets = JSON.parse(String(row.secrets_json || '{}')) as DestinationSecrets;

  if (kind === 's3') {
    const s3 = cfg as S3Config;
    if (!secrets.secretKey) return [];
    const prefix = s3.prefix ? s3.prefix.replace(/^\/+|\/+$/g, '') + '/' : '';
    const r = await s3Request(s3, secrets.secretKey, 'GET', '', {
      query: { 'list-type': '2', ...(prefix ? { prefix } : {}) },
    });
    if (r.status < 200 || r.status >= 300) return [];
    return parseS3ListXml(r.body.toString('utf8'));
  }

  const sftp = cfg as SftpConfig;
  const dir = sanitizeSftpDir(sftp.path || sftp.dir) || '.';
  const r = await runSftpCommand(sftp, secrets, [`cd "${dir}"`, 'ls -l']);
  if (!r.ok) return [];
  const out: Array<{ name: string; size: number; modifiedAt: number }> = [];
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^[-\w]+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(\S+)$/);
    if (m && (m[2].endsWith('.db.gz') || m[2].endsWith('.ovbk'))) {
      out.push({ name: m[2], size: Number(m[1]), modifiedAt: Math.floor(Date.now() / 1000) });
    }
  }
  return out;
}

export function computeNextBackupAt(schedule: DestinationSchedule, fromSec = Math.floor(Date.now() / 1000)): number {
  if (schedule.mode === 'interval') {
    const hrs = Math.max(1, Math.min(168, Number(schedule.hours || 24)));
    return fromSec + hrs * 3600;
  }
  const tz = getSetting('general', DEFAULT_GENERAL_SETTINGS).timezone || 'UTC';
  const targetHour = Math.max(0, Math.min(23, Number(schedule.hour ?? 3)));
  // Step forward in 1h increments to find next wall-clock hour matching targetHour in `tz`
  let probe = (Math.floor(fromSec / 3600) + 1) * 3600;
  for (let i = 0; i < 36; i++) {
    try {
      const hr = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(probe * 1000)),
      ) % 24;
      if (hr === targetHour) return probe;
    } catch {
      const d = new Date(fromSec * 1000);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(targetHour);
      if (Math.floor(d.getTime() / 1000) <= fromSec) d.setUTCDate(d.getUTCDate() + 1);
      return Math.floor(d.getTime() / 1000);
    }
    probe += 3600;
  }
  return fromSec + 86400;
}

export async function runBackupToDestination(destId: number): Promise<{ ok: boolean; filename?: string; size?: number; error?: string }> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM backup_destinations WHERE id = ?').get(destId) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: 'Destination not found' };

  db.prepare('UPDATE backup_destinations SET running = 1 WHERE id = ?').run(destId);
  const nowSec = Math.floor(Date.now() / 1000);
  const cfg = JSON.parse(String(row.config_json || '{}'));
  const secrets = JSON.parse(String(row.secrets_json || '{}')) as DestinationSecrets;
  const retention = JSON.parse(String(row.retention_json || '{}')) as DestinationRetention;
  const schedule = JSON.parse(String(row.schedule_json || '{"mode":"daily","hour":3}')) as DestinationSchedule;

  try {
    const payload = await buildBackupPayload(Boolean(row.encrypt), secrets.passphrase);
    if (process.env.XPROTOCOL_SKIP_NET_FETCH !== '1') {
      if (row.kind === 's3') {
        const s3 = cfg as S3Config;
        if (!secrets.secretKey) throw new Error('Missing S3 secret key');
        const prefix = s3.prefix ? s3.prefix.replace(/^\/+|\/+$/g, '') + '/' : '';
        const putRes = await s3Request(s3, secrets.secretKey, 'PUT', `${prefix}${payload.filename}`, { body: payload.data });
        if (putRes.status < 200 || putRes.status >= 300) {
          throw new Error(`S3 upload failed with HTTP ${putRes.status}`);
        }
        // Retention pruning
        const files = await listDestinationFiles(row);
        const maxKeep = Number(retention.keepLast || 0);
        const maxDays = Number(retention.maxDays || 0);
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const tooOld = maxDays > 0 && f.modifiedAt > 0 && nowSec - f.modifiedAt > maxDays * 86400;
          const overLimit = maxKeep > 0 && i >= maxKeep;
          if (tooOld || overLimit) {
            await s3Request(s3, secrets.secretKey, 'DELETE', `${prefix}${f.name}`).catch(() => undefined);
          }
        }
      } else {
        const sftp = cfg as SftpConfig;
        const remoteDir = sanitizeSftpDir(sftp.path || sftp.dir);
        const tmpFile = path.join(os.tmpdir(), payload.filename);
        fs.writeFileSync(tmpFile, payload.data, { mode: 0o600 });
        try {
          const cmds: string[] = [];
          if (remoteDir) {
            cmds.push(`-mkdir "${remoteDir}"`, `cd "${remoteDir}"`);
          }
          cmds.push(`put "${tmpFile}" "${payload.filename}"`);
          const res = await runSftpCommand(sftp, secrets, cmds);
          if (!res.ok) throw new Error(res.stderr || 'SFTP upload failed');
        } finally {
          fs.rmSync(tmpFile, { force: true });
        }
      }
    }

    const nextAt = row.enabled ? computeNextBackupAt(schedule, nowSec) : 0;
    db.prepare(
      `UPDATE backup_destinations
       SET running = 0, last_at = ?, last_size = ?, last_name = ?, last_error = '', last_error_at = 0, next_at = ?
       WHERE id = ?`,
    ).run(nowSec, payload.data.length, payload.filename, nextAt, destId);

    return { ok: true, filename: payload.filename, size: payload.data.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE backup_destinations SET running = 0, last_error = ?, last_error_at = ? WHERE id = ?',
    ).run(msg, nowSec, destId);
    emitEvent({
      type: 'backup.failed',
      ownerId: 0,
      subject: `backup:${destId}`,
      data: { destination: String(row.name), error: msg },
    });
    return { ok: false, error: msg };
  }
}

export async function restoreFromDestination(
  row: Record<string, unknown>,
  filename: string,
  passphrase?: string,
): Promise<{ ok: boolean; error?: string }> {
  let safeName: string;
  try {
    safeName = sanitizeArchiveName(filename);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid archive filename' };
  }
  const cfg = JSON.parse(String(row.config_json || '{}'));
  const secrets = JSON.parse(String(row.secrets_json || '{}')) as DestinationSecrets;
  let fileBuf: Buffer | null = null;

  if (row.kind === 's3') {
    const s3 = cfg as S3Config;
    if (!secrets.secretKey) return { ok: false, error: 'Missing S3 secret key' };
    const prefix = s3.prefix ? s3.prefix.replace(/^\/+|\/+$/g, '') + '/' : '';
    const r = await s3Request(s3, secrets.secretKey, 'GET', `${prefix}${safeName}`);
    if (r.status < 200 || r.status >= 300) return { ok: false, error: `S3 download HTTP ${r.status}` };
    fileBuf = r.body;
  } else {
    const sftp = cfg as SftpConfig;
    const remoteDir = sanitizeSftpDir(sftp.path || sftp.dir);
    const tmpOut = path.join(os.tmpdir(), `xp-restore-${Date.now()}`);
    const cmds = [...(remoteDir ? [`cd "${remoteDir}"`] : []), `get "${safeName}" "${tmpOut}"`];
    const r = await runSftpCommand(sftp, secrets, cmds);
    if (!r.ok || !fs.existsSync(tmpOut)) return { ok: false, error: r.stderr || 'SFTP download failed' };
    fileBuf = fs.readFileSync(tmpOut);
    fs.rmSync(tmpOut, { force: true });
  }

  try {
    const sqliteRaw = extractSqliteBackup(fileBuf, passphrase || secrets.passphrase);
    if (sqliteRaw.subarray(0, 15).toString('utf8') !== 'SQLite format 3') {
      return { ok: false, error: 'Restored file is not a valid SQLite database' };
    }
    fs.writeFileSync(`${getDbPath()}.pending-restore`, sqliteRaw);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let offsiteTimer: NodeJS.Timeout | null = null;

export function startOffsiteBackupScheduler(): void {
  if (offsiteTimer) return;
  offsiteTimer = setInterval(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    try {
      const due = getDb()
        .prepare('SELECT id FROM backup_destinations WHERE enabled = 1 AND running = 0 AND next_at > 0 AND next_at <= ?')
        .all(nowSec) as Array<{ id: number }>;
      for (const d of due) {
        runBackupToDestination(d.id).catch(() => undefined);
      }
    } catch {
      // ignore if db closed
    }
  }, 60_000);
  offsiteTimer.unref?.();
}

export function stopOffsiteBackupScheduler(): void {
  if (offsiteTimer) {
    clearInterval(offsiteTimer);
    offsiteTimer = null;
  }
}
