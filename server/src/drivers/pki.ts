import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDataDir } from '../config.js';
import { getDb } from '../db/database.js';
import type { PeerEntry } from '../generators/configs.js';

const execFileAsync = promisify(execFile);

export function getPkiDir(): string {
  const dir = path.join(getDataDir(), 'pki');
  fs.mkdirSync(dir, { recursive: true, mode: 0o711 });
  return dir;
}

export function getCertsDir(): string {
  const dir = path.join(getDataDir(), 'certs');
  fs.mkdirSync(dir, { recursive: true, mode: 0o711 });
  return dir;
}

export function getAuthDir(): string {
  const dir = path.join(getDataDir(), 'auth');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function getBinDir(): string {
  const dir = path.join(getDataDir(), 'bin');
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

export function getDaemonGateHookPaths(inboundName: string): {
  gateScriptPath: string;
  ovpnConnectPath: string;
  ovpnDisconnectPath: string;
  ocservHookPath: string;
  ikev2UpdownPath: string;
} {
  const safeName = inboundName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const binDir = getBinDir();
  return {
    gateScriptPath: path.join(binDir, 'xp-gate.mjs'),
    ovpnConnectPath: path.join(binDir, `ovpn-connect-${safeName}.sh`),
    ovpnDisconnectPath: path.join(binDir, `ovpn-disconnect-${safeName}.sh`),
    ocservHookPath: path.join(binDir, `ocserv-hook-${safeName}.sh`),
    ikev2UpdownPath: path.join(binDir, 'ikev2-updown.sh'),
  };
}

export function generateOpenVpnStaticKey(): string {
  const hex = crypto.randomBytes(256).toString('hex');
  const lines = [
    '#',
    '# 2048 bit OpenVPN static key (XProtocol)',
    '#',
    '-----BEGIN OpenVPN Static key V1-----',
  ];
  for (let i = 0; i < hex.length; i += 32) {
    lines.push(hex.slice(i, i + 32));
  }
  lines.push('-----END OpenVPN Static key V1-----');
  return lines.join('\n') + '\n';
}

async function runOpenSsl(args: string[]): Promise<boolean> {
  try {
    await execFileAsync('openssl', args, { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureOpenVpnPki(): Promise<{
  caCrtPath: string;
  serverCrtPath: string;
  serverKeyPath: string;
  taKeyPath: string;
}> {
  const dir = getPkiDir();
  const caKeyPath = path.join(dir, 'ca.key');
  const caCrtPath = path.join(dir, 'ca.crt');
  const serverKeyPath = path.join(dir, 'server.key');
  const serverCsrPath = path.join(dir, 'server.csr');
  const serverCrtPath = path.join(dir, 'server.crt');
  const serverExtPath = path.join(dir, 'server.ext');
  const taKeyPath = path.join(dir, 'ta.key');

  if (!fs.existsSync(taKeyPath)) {
    fs.writeFileSync(taKeyPath, generateOpenVpnStaticKey(), { mode: 0o600 });
  }

  if (!fs.existsSync(caCrtPath) || !fs.existsSync(caKeyPath)) {
    const ok = await runOpenSsl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '3650',
      '-subj',
      '/CN=XProtocol Root CA',
      '-keyout',
      caKeyPath,
      '-out',
      caCrtPath,
    ]);
    if (ok && fs.existsSync(caKeyPath)) {
      fs.chmodSync(caKeyPath, 0o600);
    }
  }

  if ((!fs.existsSync(serverCrtPath) || !fs.existsSync(serverKeyPath)) && fs.existsSync(caCrtPath) && fs.existsSync(caKeyPath)) {
    fs.writeFileSync(
      serverExtPath,
      'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
      { mode: 0o644 },
    );
    const csrOk = await runOpenSsl([
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=xprotocol-server',
      '-keyout',
      serverKeyPath,
      '-out',
      serverCsrPath,
    ]);
    if (csrOk) {
      await runOpenSsl([
        'x509',
        '-req',
        '-in',
        serverCsrPath,
        '-CA',
        caCrtPath,
        '-CAkey',
        caKeyPath,
        '-CAcreateserial',
        '-out',
        serverCrtPath,
        '-days',
        '3650',
        '-extfile',
        serverExtPath,
      ]);
      if (fs.existsSync(serverKeyPath)) fs.chmodSync(serverKeyPath, 0o600);
    }
  }

  return { caCrtPath, serverCrtPath, serverKeyPath, taKeyPath };
}

export async function ensureClientCertificate(clientName: string): Promise<{ certPem: string; keyPem: string } | null> {
  const safeName = clientName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const pkiDir = getPkiDir();
  const clientsDir = path.join(pkiDir, 'clients');
  fs.mkdirSync(clientsDir, { recursive: true, mode: 0o700 });

  const crtPath = path.join(clientsDir, `${safeName}.crt`);
  const keyPath = path.join(clientsDir, `${safeName}.key`);
  if (fs.existsSync(crtPath) && fs.existsSync(keyPath)) {
    return {
      certPem: fs.readFileSync(crtPath, 'utf-8').trim(),
      keyPem: fs.readFileSync(keyPath, 'utf-8').trim(),
    };
  }

  const { caCrtPath } = await ensureOpenVpnPki();
  const caKeyPath = path.join(pkiDir, 'ca.key');
  if (!fs.existsSync(caCrtPath) || !fs.existsSync(caKeyPath)) return null;

  const csrPath = path.join(clientsDir, `${safeName}.csr`);
  const extPath = path.join(clientsDir, `${safeName}.ext`);
  fs.writeFileSync(
    extPath,
    'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=clientAuth\n',
    { mode: 0o644 },
  );

  const okReq = await runOpenSsl([
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    `/CN=${safeName}`,
    '-keyout',
    keyPath,
    '-out',
    csrPath,
  ]);
  if (!okReq) return null;

  const okSign = await runOpenSsl([
    'x509',
    '-req',
    '-in',
    csrPath,
    '-CA',
    caCrtPath,
    '-CAkey',
    caKeyPath,
    '-CAcreateserial',
    '-out',
    crtPath,
    '-days',
    '1825',
    '-extfile',
    extPath,
  ]);
  if (!okSign || !fs.existsSync(crtPath) || !fs.existsSync(keyPath)) return null;
  fs.chmodSync(keyPath, 0o600);

  return {
    certPem: fs.readFileSync(crtPath, 'utf-8').trim(),
    keyPem: fs.readFileSync(keyPath, 'utf-8').trim(),
  };
}

/** Read or deterministically derive a client's certificate serial and expiration timestamp without mutating state. */
export function getClientCertDetails(
  clientName: string,
  existingSerial?: string | null,
  existingExpiresAt?: string | null,
  fallbackCreatedAt?: string | null,
): { serial: string; expiresAt: string } {
  const safeName = clientName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const crtPath = path.join(getPkiDir(), 'clients', `${safeName}.crt`);
  if (fs.existsSync(crtPath)) {
    try {
      const pem = fs.readFileSync(crtPath, 'utf-8');
      const cert = new crypto.X509Certificate(pem);
      const validToMs = Date.parse(cert.validTo);
      return {
        serial: cert.serialNumber.toUpperCase(),
        expiresAt: Number.isFinite(validToMs)
          ? new Date(validToMs).toISOString()
          : new Date(Date.now() + 3650 * 86400_000).toISOString(),
      };
    } catch {
      // fall through to stored metadata
    }
  }
  const baseMs = fallbackCreatedAt ? Date.parse(fallbackCreatedAt) || Date.now() : Date.now();
  const deterministicSerial = crypto
    .createHash('sha256')
    .update(`${clientName}:${fallbackCreatedAt || ''}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
  return {
    serial: existingSerial && existingSerial.trim() ? existingSerial.trim().toUpperCase() : deterministicSerial,
    expiresAt: existingExpiresAt && existingExpiresAt.trim() ? existingExpiresAt : new Date(baseMs + 3650 * 86400_000).toISOString(),
  };
}

/** Revoke/remove any existing client PKI cert files and issue a fresh certificate/serial. */
export async function replaceClientCertificate(clientName: string): Promise<{ serial: string; expiresAt: string }> {
  const safeName = clientName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const clientsDir = path.join(getPkiDir(), 'clients');
  for (const ext of ['crt', 'key', 'csr', 'ext']) {
    const p = path.join(clientsDir, `${safeName}.${ext}`);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore unlink errors
    }
  }
  await ensureClientCertificate(clientName).catch(() => null);
  return getClientCertDetails(clientName, '', null, new Date().toISOString());
}

/** Atomically write current active connection counts per lowercase client name for OpenVPN login enforcement. */
export function writeLiveClientCounts(countsByClientNameLower: Record<string, number>): void {
  const authDir = getAuthDir();
  const target = path.join(authDir, 'live-counts.json');
  const tmp = path.join(authDir, `live-counts.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(countsByClientNameLower), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

/** Write per-inbound salted scrypt credentials JSON and OpenVPN auth-user-pass-verify script. */
export function syncOpenVpnAuthScript(inboundName: string, peers: PeerEntry[]): string {
  const safeName = inboundName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const authDir = getAuthDir();
  const usersFile = path.join(authDir, `${safeName}.users.json`);
  const liveCountsFile = path.join(authDir, 'live-counts.json');
  const records = peers.map((p) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(p.vpnPassword || ''), salt, 32).toString('hex');
    return { u: p.name, s: salt, h: derived, l: p.deviceLimit ?? null };
  });
  fs.writeFileSync(usersFile, JSON.stringify(records, null, 2), { mode: 0o600 });

  const binDir = getBinDir();
  const scriptPath = path.join(binDir, `ovpn-auth-${safeName}.mjs`);
  const script = `#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const credFile = process.argv[2];
if (!credFile || !fs.existsSync(credFile)) process.exit(1);
const lines = fs.readFileSync(credFile, 'utf8').split(/\\r?\\n/);
const user = (lines[0] || '').trim();
const pass = lines[1] || '';
if (!user) process.exit(1);
const users = JSON.parse(fs.readFileSync(${JSON.stringify(usersFile)}, 'utf8'));
const userLower = user.toLowerCase();
const rec = users.find((x) => x.u === user) || users.find((x) => String(x.u || '').toLowerCase() === userLower);
if (!rec || !rec.s || !rec.h) process.exit(1);
const actual = crypto.scryptSync(pass, String(rec.s), 32);
const expected = Buffer.from(String(rec.h), 'hex');
if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) process.exit(1);
// Skip device_limit check during TLS renegotiation (reneg-sec) when trusted_ip is already established
if (!process.env.trusted_ip && rec.l && Number(rec.l) > 0 && fs.existsSync(${JSON.stringify(liveCountsFile)})) {
  try {
    const counts = JSON.parse(fs.readFileSync(${JSON.stringify(liveCountsFile)}, 'utf8'));
    const active = Number(counts[String(rec.u).toLowerCase()] || 0);
    if (active >= Number(rec.l)) process.exit(1);
  } catch {
    // allow login if live-counts file is momentarily unavailable
  }
}
process.exit(0);
`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

export async function ensureInboundTlsCertFiles(
  certId: number | null,
  fallbackHost = 'vpn.xprotocol.local',
): Promise<{ certPath: string; keyPath: string }> {
  const certsDir = getCertsDir();
  const tag = certId ? String(certId) : 'default';
  const certPath = path.join(certsDir, `cert-${tag}.pem`);
  const keyPath = path.join(certsDir, `key-${tag}.pem`);

  if (certId) {
    try {
      const row = getDb().prepare('SELECT domain_or_ip, cert_type FROM certificates WHERE id = ?').get(certId) as
        | { domain_or_ip: string; cert_type: string }
        | undefined;
      if (row && row.cert_type === 'letsencrypt') {
        const leCert = `/etc/letsencrypt/live/${row.domain_or_ip}/fullchain.pem`;
        const leKey = `/etc/letsencrypt/live/${row.domain_or_ip}/privkey.pem`;
        if (fs.existsSync(leCert) && fs.existsSync(leKey)) {
          fs.copyFileSync(leCert, certPath);
          fs.copyFileSync(leKey, keyPath);
          fs.chmodSync(keyPath, 0o600);
          return { certPath, keyPath };
        }
      }
      if (row?.domain_or_ip) {
        fallbackHost = row.domain_or_ip;
      }
    } catch {
      // fallback below
    }
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(fallbackHost);
    const san = isIpv4 ? `IP:${fallbackHost},DNS:${fallbackHost}` : `DNS:${fallbackHost}`;
    const ok = await runOpenSsl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '3650',
      '-subj',
      `/CN=${fallbackHost}`,
      '-addext',
      `subjectAltName=${san}`,
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ]);
    if (ok && fs.existsSync(keyPath)) {
      fs.chmodSync(keyPath, 0o600);
    }
  }

  return { certPath, keyPath };
}
