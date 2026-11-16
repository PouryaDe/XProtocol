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

/** Write per-inbound salted scrypt credentials JSON and OpenVPN auth-user-pass-verify script. */
export function syncOpenVpnAuthScript(inboundName: string, peers: PeerEntry[]): string {
  const safeName = inboundName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const authDir = getAuthDir();
  const usersFile = path.join(authDir, `${safeName}.users.json`);
  const records = peers.map((p) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(p.vpnPassword || ''), salt, 32).toString('hex');
    return { u: p.name, s: salt, h: derived };
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
const rec = users.find((x) => x.u === user);
if (!rec || !rec.s || !rec.h) process.exit(1);
const actual = crypto.scryptSync(pass, String(rec.s), 32);
const expected = Buffer.from(String(rec.h), 'hex');
if (actual.length !== expected.length) process.exit(1);
process.exit(crypto.timingSafeEqual(actual, expected) ? 0 : 1);
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
      `subjectAltName=DNS:${fallbackHost}`,
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
