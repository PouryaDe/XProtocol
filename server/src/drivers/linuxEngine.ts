import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InboundRow, PeerEntry } from '../generators/configs.js';
import { renderInboundServerConfig } from '../generators/configs.js';

const execFileAsync = promisify(execFile);

export type ProtocolName = 'openvpn' | 'wireguard' | 'amneziawg' | 'openconnect' | 'ikev2' | 'l2tp';

export interface ProtocolStatus {
  protocol: ProtocolName;
  installed: boolean;
  version: string;
}

export interface LiveTunnelSample {
  id: string;
  clientName: string;
  inboundId: number;
  remoteIp: string;
  tunnelIp: string;
  device: string;
  bytesIn: number;
  bytesOut: number;
}

const PROTOCOL_BINARIES: Record<ProtocolName, { bin: string; apt: string[] }> = {
  openvpn: { bin: 'openvpn', apt: ['openvpn', 'easy-rsa'] },
  wireguard: { bin: 'wg', apt: ['wireguard', 'wireguard-tools'] },
  amneziawg: { bin: 'awg', apt: ['wireguard-tools'] },
  openconnect: { bin: 'ocserv', apt: ['ocserv'] },
  ikev2: { bin: 'swanctl', apt: ['strongswan', 'strongswan-swanctl', 'libcharon-extra-plugins'] },
  l2tp: { bin: 'xl2tpd', apt: ['xl2tpd', 'strongswan'] },
};

async function runCmd(cmd: string, args: string[], timeout = 15000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const res = await execFileAsync(cmd, args, { timeout });
    return { ok: true, stdout: res.stdout, stderr: res.stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout || '', stderr: e.stderr || e.message || String(err) };
  }
}

export async function detectInstalledProtocols(): Promise<ProtocolStatus[]> {
  const results: ProtocolStatus[] = [];
  for (const [proto, meta] of Object.entries(PROTOCOL_BINARIES) as [ProtocolName, { bin: string; apt: string[] }][]) {
    if (process.platform !== 'linux') {
      results.push({ protocol: proto, installed: proto === 'wireguard' || proto === 'openvpn', version: 'ubuntu-target' });
      continue;
    }
    const which = await runCmd('which', [meta.bin], 3000);
    if (!which.ok) {
      results.push({ protocol: proto, installed: false, version: '' });
      continue;
    }
    let version = 'installed';
    const ver = await runCmd(meta.bin, ['--version'], 3000);
    if (ver.stdout || ver.stderr) {
      const firstLine = (ver.stdout || ver.stderr).split('\n')[0] || '';
      const match = firstLine.match(/\d+\.\d+(\.\d+)?/);
      if (match) version = match[0];
    }
    results.push({ protocol: proto, installed: true, version });
  }
  return results;
}

export async function installProtocolPackage(protocol: ProtocolName): Promise<{ ok: boolean; log: string }> {
  if (process.platform !== 'linux') {
    return { ok: false, log: 'Protocol installation via apt-get requires Ubuntu 22.04+ Linux.' };
  }
  const meta = PROTOCOL_BINARIES[protocol];
  if (!meta) return { ok: false, log: 'Unknown protocol' };
  const update = await runCmd('apt-get', ['update', '-qq'], 120000);
  const inst = await runCmd('apt-get', ['install', '-y', '-qq', ...meta.apt], 180000);
  // Enable IP forwarding for VPN routing
  await runCmd('sysctl', ['-w', 'net.ipv4.ip_forward=1'], 5000);
  return {
    ok: inst.ok,
    log: [update.stdout, update.stderr, inst.stdout, inst.stderr].filter(Boolean).join('\n'),
  };
}

export async function openFirewallPort(port: number, transport: string): Promise<void> {
  if (process.platform !== 'linux') return;
  const proto = transport.startsWith('tcp') ? 'tcp' : 'udp';
  await runCmd('ufw', ['allow', `${port}/${proto}`], 5000);
}

export async function syncOpenConnectPasswd(inbound: InboundRow, clients: { name: string; vpnPassword: string }[]): Promise<void> {
  if (process.platform !== 'linux') return;
  const dir = '/etc/ocserv';
  fs.mkdirSync(dir, { recursive: true });
  const passwdPath = path.join(dir, `${inbound.name}.passwd`);
  for (const c of clients) {
    await runCmd('ocpasswd', ['-c', passwdPath, c.name], 5000).catch(() => undefined);
  }
}

export async function syncL2tpSecrets(clients: { name: string; vpnPassword: string }[]): Promise<void> {
  if (process.platform !== 'linux') return;
  const lines = ['# Managed by XProtocol Open-Core', ...clients.map((c) => `"${c.name}" * "${c.vpnPassword}" *`)];
  fs.writeFileSync('/etc/ppp/chap-secrets', lines.join('\n') + '\n', { mode: 0o600 });
}

export async function applyLinuxInbound(
  inbound: InboundRow,
  peers: PeerEntry[],
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: boolean; logs: string[] }> {
  const rendered = renderInboundServerConfig(inbound, peers);
  const logs: string[] = [];

  if (process.platform !== 'linux') {
    logs.push(`[${new Date().toISOString()}] Rendered ${rendered.path} (${peers.length} peers); deploy on Ubuntu 22.04+ for live execution.`);
    return { ok: true, logs };
  }

  if (action !== 'stop') {
    fs.mkdirSync(path.dirname(rendered.path), { recursive: true });
    fs.writeFileSync(rendered.path, rendered.content, { mode: 0o600 });
    await openFirewallPort(inbound.port, inbound.transport);
  }

  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    const tool = inbound.protocol === 'amneziawg' ? 'awg-quick' : 'wg-quick';
    if (action === 'stop' || action === 'restart') {
      const r = await runCmd(tool, ['down', inbound.name]);
      logs.push(`${tool} down ${inbound.name}: ${r.ok ? 'ok' : r.stderr}`);
    }
    if (action === 'start' || action === 'restart') {
      const r = await runCmd(tool, ['up', inbound.name]);
      logs.push(`${tool} up ${inbound.name}: ${r.ok ? 'ok' : r.stderr}`);
      return { ok: r.ok, logs };
    }
    return { ok: true, logs };
  }

  if (inbound.protocol === 'openvpn') {
    const unit = `openvpn-server@${inbound.name}`;
    const r = await runCmd('systemctl', [action, unit]);
    logs.push(`systemctl ${action} ${unit}: ${r.ok ? 'ok' : r.stderr}`);
    return { ok: r.ok, logs };
  }

  if (inbound.protocol === 'openconnect') {
    const r = await runCmd('systemctl', [action, 'ocserv']);
    logs.push(`systemctl ${action} ocserv: ${r.ok ? 'ok' : r.stderr}`);
    return { ok: r.ok, logs };
  }

  if (inbound.protocol === 'ikev2') {
    if (action !== 'stop') {
      const r = await runCmd('swanctl', ['--load-all']);
      logs.push(`swanctl --load-all: ${r.ok ? 'ok' : r.stderr}`);
      return { ok: r.ok, logs };
    }
    return { ok: true, logs };
  }

  if (inbound.protocol === 'l2tp') {
    const r = await runCmd('systemctl', [action, 'xl2tpd']);
    logs.push(`systemctl ${action} xl2tpd: ${r.ok ? 'ok' : r.stderr}`);
    return { ok: r.ok, logs };
  }

  return { ok: true, logs };
}

export async function collectLinuxLiveTunnels(
  inbounds: InboundRow[],
  clientsByWgPub: Map<string, string>,
): Promise<LiveTunnelSample[]> {
  if (process.platform !== 'linux') return [];
  const samples: LiveTunnelSample[] = [];

  for (const ib of inbounds) {
    if (!ib.running) continue;
    if (ib.protocol === 'wireguard' || ib.protocol === 'amneziawg') {
      const tool = ib.protocol === 'amneziawg' ? 'awg' : 'wg';
      const dump = await runCmd(tool, ['show', ib.name, 'dump'], 4000);
      if (!dump.ok) continue;
      const lines = dump.stdout.trim().split('\n').slice(1);
      for (const line of lines) {
        const cols = line.split('\t');
        if (cols.length < 7) continue;
        const [pubKey, , endpoint, allowedIps, latestHandshakeStr, rxStr, txStr] = cols;
        const latestHandshake = Number(latestHandshakeStr || 0);
        // Consider active if handshake within last 3 minutes
        if (latestHandshake > 0 && Date.now() / 1000 - latestHandshake <= 180) {
          const clientName = clientsByWgPub.get(pubKey);
          if (!clientName) continue;
          samples.push({
            id: `wg-${ib.id}-${pubKey.slice(0, 10)}`,
            clientName,
            inboundId: ib.id,
            remoteIp: endpoint.split(':')[0] || '0.0.0.0',
            tunnelIp: allowedIps.split('/')[0] || '',
            device: 'WireGuard',
            bytesIn: Number(rxStr || 0),
            bytesOut: Number(txStr || 0),
          });
        }
      }
    } else if (ib.protocol === 'openvpn') {
      const statusFile = `/var/run/xprotocol-${ib.name}.status`;
      if (!fs.existsSync(statusFile)) continue;
      const raw = fs.readFileSync(statusFile, 'utf-8');
      for (const line of raw.split('\n')) {
        if (!line.startsWith('CLIENT_LIST,')) continue;
        const parts = line.split(',');
        if (parts.length < 7) continue;
        const clientName = parts[1];
        const remoteIp = parts[2].split(':')[0];
        const tunnelIp = parts[3];
        const bytesIn = Number(parts[5] || 0);
        const bytesOut = Number(parts[6] || 0);
        samples.push({
          id: `ovpn-${ib.id}-${clientName}-${tunnelIp}`,
          clientName,
          inboundId: ib.id,
          remoteIp,
          tunnelIp,
          device: 'OpenVPN',
          bytesIn,
          bytesOut,
        });
      }
    }
  }

  return samples;
}

export async function updateXrayGeoAssets(): Promise<{ ok: boolean; message: string }> {
  if (process.env.XPROTOCOL_SKIP_NET_FETCH === '1') {
    return { ok: true, message: 'Skipped external download in test mode' };
  }
  const dir = process.platform === 'linux' ? '/usr/local/lib/xprotocol/xray' : path.join(os.tmpdir(), 'xprotocol-xray');
  fs.mkdirSync(dir, { recursive: true });
  const files = [
    { name: 'geosite.dat', url: 'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat' },
    { name: 'geoip.dat', url: 'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat' },
  ];
  try {
    for (const f of files) {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Failed downloading ${f.name}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(dir, f.name), buf);
    }
    return { ok: true, message: `Updated geosite.dat and geoip.dat in ${dir}` };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function issueLetsEncryptCert(domain: string, email?: string): Promise<{ ok: boolean; certPath: string; keyPath: string; log: string }> {
  if (process.platform !== 'linux') {
    return { ok: false, certPath: '', keyPath: '', log: 'Let’s Encrypt issuance requires Ubuntu Linux with port 80 open.' };
  }
  const args = ['certonly', '--standalone', '--non-interactive', '--agree-tos', '-d', domain];
  if (email) args.push('--email', email);
  else args.push('--register-unsafely-without-email');
  const res = await runCmd('certbot', args, 120000);
  const base = `/etc/letsencrypt/live/${domain}`;
  return {
    ok: res.ok,
    certPath: path.join(base, 'fullchain.pem'),
    keyPath: path.join(base, 'privkey.pem'),
    log: [res.stdout, res.stderr].filter(Boolean).join('\n'),
  };
}
