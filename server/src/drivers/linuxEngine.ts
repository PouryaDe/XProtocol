import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDataDir } from '../config.js';
import {
  isAmneziaInbound,
  renderInboundExtraFiles,
  renderInboundServerConfig,
  type InboundRow,
  type PeerEntry,
} from '../generators/configs.js';
import {
  ensureInboundTlsCertFiles,
  ensureOpenVpnPki,
  syncOpenVpnAuthScript,
} from './pki.js';

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
  l2tp: { bin: 'xl2tpd', apt: ['xl2tpd', 'strongswan', 'strongswan-swanctl'] },
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

function escapeSecretField(raw: string): string {
  return String(raw || '').replace(/[\r\n\0]+/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseInboundSettings(inbound: InboundRow): Record<string, unknown> {
  try {
    return JSON.parse(inbound.settings_json || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function resolveInboundInterfaceName(inbound: InboundRow): string {
  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    return inbound.name;
  }
  if (inbound.protocol === 'openvpn') {
    return `tun-${inbound.name}`;
  }
  return '';
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
  await runCmd('sysctl', ['-w', 'net.ipv4.ip_forward=1'], 5000);
  return {
    ok: inst.ok,
    log: [update.stdout, update.stderr, inst.stdout, inst.stderr].filter(Boolean).join('\n'),
  };
}

export async function openFirewallPort(port: number, transport: string): Promise<void> {
  if (process.platform !== 'linux' || !port) return;
  const proto = transport.startsWith('tcp') ? 'tcp' : 'udp';
  await runCmd('ufw', ['allow', `${port}/${proto}`], 5000);
}

async function hashUnixSha512(password: string): Promise<string> {
  const res = await runCmd('openssl', ['passwd', '-6', password], 4000);
  if (res.ok && res.stdout.trim()) return res.stdout.trim();
  return password;
}

export async function syncOpenConnectPasswd(inbound: InboundRow, clients: { name: string; vpnPassword: string }[]): Promise<void> {
  const dir = process.platform === 'linux' ? '/etc/ocserv' : path.join(getDataDir(), 'ocserv');
  fs.mkdirSync(dir, { recursive: true });
  const passwdPath = path.join(dir, `${inbound.name}.passwd`);
  if (process.platform !== 'linux') {
    const lines = clients.map((c) => `${c.name}:*:plain`);
    fs.writeFileSync(passwdPath, lines.join('\n') + '\n');
    return;
  }
  const lines: string[] = [];
  for (const c of clients) {
    const hash = await hashUnixSha512(c.vpnPassword || '');
    lines.push(`${c.name}:*:${hash}`);
  }
  fs.writeFileSync(passwdPath, lines.join('\n') + '\n', { mode: 0o600 });
}

/** Sync `/etc/ppp/chap-secrets` safely with escaped credentials for L2TP/PPP clients. */
export async function syncL2tpSecrets(clients: { name: string; vpnPassword: string }[]): Promise<void> {
  if (process.platform !== 'linux') return;
  fs.mkdirSync('/etc/ppp', { recursive: true });
  const lines = [
    '# Managed by XProtocol Open-Core',
    ...clients.map((c) => `"${escapeSecretField(c.name)}" * "${escapeSecretField(c.vpnPassword)}" *`),
  ];
  fs.writeFileSync('/etc/ppp/chap-secrets', lines.join('\n') + '\n', { mode: 0o600 });
}

function ensurePppSessionHooks(): void {
  if (process.platform !== 'linux') return;
  const upDir = '/etc/ppp/ip-up.d';
  const downDir = '/etc/ppp/ip-down.d';
  const upFile = path.join(upDir, '99-xprotocol');
  const downFile = path.join(downDir, '99-xprotocol');
  if (!fs.existsSync(upFile)) {
    fs.mkdirSync(upDir, { recursive: true });
    fs.writeFileSync(
      upFile,
      `#!/bin/sh
cat > "/var/run/xprotocol-ppp-\${IFNAME}.json" <<EOF
{"ifname":"\${IFNAME}","clientName":"\${PEERNAME}","remoteIp":"\${IPREMOTE}","tunnelIp":"\${IPLOCAL}","inboundName":"\${6}"}
EOF
`,
      { mode: 0o755 },
    );
  }
  if (!fs.existsSync(downFile)) {
    fs.mkdirSync(downDir, { recursive: true });
    fs.writeFileSync(
      downFile,
      `#!/bin/sh
rm -f "/var/run/xprotocol-ppp-\${IFNAME}.json"
`,
      { mode: 0o755 },
    );
  }
}

function ensureSystemdTemplateUnits(): void {
  if (process.platform !== 'linux') return;
  const ocUnit = '/etc/systemd/system/xprotocol-ocserv@.service';
  if (!fs.existsSync(ocUnit)) {
    fs.writeFileSync(
      ocUnit,
      `[Unit]
Description=XProtocol OpenConnect Server (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/sbin/ocserv --foreground --pid-file /run/ocserv-%i.pid --config /etc/ocserv/%i.conf
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`,
    );
  }
  const l2tpUnit = '/etc/systemd/system/xprotocol-xl2tpd@.service';
  if (!fs.existsSync(l2tpUnit)) {
    fs.writeFileSync(
      l2tpUnit,
      `[Unit]
Description=XProtocol L2TP Daemon (%i)
After=network-online.target strongswan-starter.service

[Service]
Type=simple
ExecStartPre=/bin/mkdir -p /var/run/xl2tpd
ExecStart=/usr/sbin/xl2tpd -D -c /etc/xl2tpd/%i.conf
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`,
    );
  }
}

async function applyTcIpClasses(
  dev: string,
  handlePrefix: string,
  entries: Array<{ ip: string; mbps: number }>,
  direction: 'dst' | 'src',
): Promise<void> {
  if (entries.length === 0) return;
  await runCmd('tc', ['qdisc', 'add', 'dev', dev, 'root', 'handle', `${handlePrefix}:`, 'htb', 'default', '999'], 3000);
  await runCmd('tc', ['class', 'add', 'dev', dev, 'parent', `${handlePrefix}:`, 'classid', `${handlePrefix}:999`, 'htb', 'rate', '10gbit'], 3000);
  let idx = 10;
  for (const item of entries) {
    const rate = `${Math.max(0.1, item.mbps).toFixed(2)}mbit`;
    const cls = `${handlePrefix}:${idx++}`;
    await runCmd('tc', ['class', 'add', 'dev', dev, 'parent', `${handlePrefix}:`, 'classid', cls, 'htb', 'rate', rate, 'ceil', rate], 3000);
    await runCmd(
      'tc',
      ['filter', 'add', 'dev', dev, 'protocol', 'ip', 'parent', `${handlePrefix}:`, 'prio', '1', 'u32', 'match', 'ip', direction, `${item.ip}/32`, 'flowid', cls],
      3000,
    );
  }
}

/** Apply per-client download and (when IFB is supported) upload bandwidth shaping via Linux `tc`. */
export async function applyInterfaceSpeedLimits(iface: string, peers: PeerEntry[]): Promise<void> {
  if (process.platform !== 'linux' || !iface) return;
  const check = await runCmd('ip', ['link', 'show', iface], 3000);
  if (!check.ok) return;

  await runCmd('tc', ['qdisc', 'del', 'dev', iface, 'root'], 3000);
  const dlEntries = peers
    .filter((p) => p.downloadMbps && p.downloadMbps > 0)
    .map((p) => ({ ip: p.tunnelIp, mbps: Number(p.downloadMbps) }));
  await applyTcIpClasses(iface, '1', dlEntries, 'dst');

  const ifbDev = `ifb-${iface}`.slice(0, 15);
  await runCmd('tc', ['qdisc', 'del', 'dev', iface, 'ingress'], 3000);
  await runCmd('ip', ['link', 'del', ifbDev], 3000);
  const ulEntries = peers
    .filter((p) => p.uploadMbps && p.uploadMbps > 0)
    .map((p) => ({ ip: p.tunnelIp, mbps: Number(p.uploadMbps) }));
  if (ulEntries.length > 0 && (await runCmd('modprobe', ['ifb'], 3000)).ok) {
    await runCmd('ip', ['link', 'add', ifbDev, 'type', 'ifb'], 3000);
    await runCmd('ip', ['link', 'set', ifbDev, 'up'], 3000);
    await runCmd('tc', ['qdisc', 'add', 'dev', iface, 'handle', 'ffff:', 'ingress'], 3000);
    await runCmd(
      'tc',
      ['filter', 'add', 'dev', iface, 'parent', 'ffff:', 'protocol', 'ip', 'u32', 'match', 'u32', '0', '0', 'action', 'mirred', 'egress', 'redirect', 'dev', ifbDev],
      3000,
    );
    await applyTcIpClasses(ifbDev, '2', ulEntries, 'src');
  }
}

/** Configure kernel IPv4 forwarding and idempotent iptables NAT/FORWARD rules for a tunnel subnet. */
export async function ensureSubnetNat(subnet: string, enable: boolean): Promise<void> {
  if (process.platform !== 'linux' || !subnet) return;
  await runCmd('sysctl', ['-w', 'net.ipv4.ip_forward=1'], 4000);
  const route = await runCmd('ip', ['route', 'show', 'default'], 3000);
  const outIface = route.stdout.match(/\bdev\s+(\S+)/)?.[1] || '';
  if (!outIface) return;

  const natArgs = ['-t', 'nat', '-s', subnet, '-o', outIface, '-j', 'MASQUERADE'];
  const fwdOut = ['-s', subnet, '-j', 'ACCEPT'];
  const fwdIn = ['-d', subnet, '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'ACCEPT'];

  if (enable) {
    if (!(await runCmd('iptables', ['-C', 'POSTROUTING', ...natArgs], 3000)).ok) {
      await runCmd('iptables', ['-A', 'POSTROUTING', ...natArgs], 3000);
    }
    if (!(await runCmd('iptables', ['-C', 'FORWARD', ...fwdOut], 3000)).ok) {
      await runCmd('iptables', ['-I', 'FORWARD', '1', ...fwdOut], 3000);
    }
    if (!(await runCmd('iptables', ['-C', 'FORWARD', ...fwdIn], 3000)).ok) {
      await runCmd('iptables', ['-I', 'FORWARD', '1', ...fwdIn], 3000);
    }
  } else {
    await runCmd('iptables', ['-D', 'POSTROUTING', ...natArgs], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...fwdOut], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...fwdIn], 3000);
  }
}

export async function applyLinuxInbound(
  inbound: InboundRow,
  peers: PeerEntry[],
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: boolean; logs: string[] }> {
  const settings = parseInboundSettings(inbound);
  const rendered = renderInboundServerConfig(inbound, peers);
  const extraFiles = renderInboundExtraFiles(inbound, peers);
  const logs: string[] = [];

  if (inbound.protocol === 'openvpn') {
    await ensureOpenVpnPki();
    syncOpenVpnAuthScript(inbound.name, peers);
  } else if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    await ensureInboundTlsCertFiles(inbound.cert_id, inbound.public_address_override || undefined);
    await syncOpenConnectPasswd(
      inbound,
      peers.map((p) => ({ name: p.name, vpnPassword: p.vpnPassword || '' })),
    );
  } else if (inbound.protocol === 'ikev2') {
    const certs = await ensureInboundTlsCertFiles(inbound.cert_id, String(settings.serverId || '') || undefined);
    if (process.platform === 'linux') {
      const tag = inbound.cert_id ? String(inbound.cert_id) : 'default';
      fs.mkdirSync('/etc/swanctl/x509', { recursive: true });
      fs.mkdirSync('/etc/swanctl/private', { recursive: true });
      if (fs.existsSync(certs.certPath)) fs.copyFileSync(certs.certPath, `/etc/swanctl/x509/xprotocol-${tag}.pem`);
      if (fs.existsSync(certs.keyPath)) fs.copyFileSync(certs.keyPath, `/etc/swanctl/private/xprotocol-${tag}.pem`);
    }
  } else if (inbound.protocol === 'l2tp') {
    ensurePppSessionHooks();
    await syncL2tpSecrets(peers.map((p) => ({ name: p.name, vpnPassword: p.vpnPassword || '' })));
  }

  if (process.platform !== 'linux') {
    logs.push(
      `[${new Date().toISOString()}] Rendered ${rendered.path} (${peers.length} eligible peers); deploy on Ubuntu 22.04+ for live execution.`,
    );
    return { ok: true, logs };
  }

  ensureSystemdTemplateUnits();

  if (action !== 'stop') {
    fs.mkdirSync(path.dirname(rendered.path), { recursive: true });
    fs.writeFileSync(rendered.path, rendered.content, { mode: 0o600 });
    for (const f of extraFiles) {
      fs.mkdirSync(path.dirname(f.path), { recursive: true });
      fs.writeFileSync(f.path, f.content, { mode: f.mode ?? 0o600 });
    }
    await openFirewallPort(inbound.port, inbound.transport);
    if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
      if (settings.dtls !== false) await openFirewallPort(inbound.port, 'udp');
    } else if (inbound.protocol === 'ikev2' || inbound.protocol === 'l2tp') {
      await openFirewallPort(500, 'udp');
      await openFirewallPort(4500, 'udp');
      if (inbound.protocol === 'l2tp') await openFirewallPort(1701, 'udp');
    }
  }

  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    const amneziaOn = isAmneziaInbound(inbound.protocol, settings);
    const tool = amneziaOn ? 'awg-quick' : 'wg-quick';
    const wgBin = amneziaOn ? 'awg' : 'wg';
    await ensureSubnetNat(inbound.subnet, action !== 'stop' && settings.nat !== false);
    if (action === 'stop' || action === 'restart') {
      const r = await runCmd(tool, ['down', rendered.path]);
      if (!r.ok) await runCmd('ip', ['link', 'del', inbound.name], 3000);
      logs.push(`${tool} down ${inbound.name}: ${r.ok ? 'ok' : r.stderr}`);
    }
    if (action === 'start' || action === 'restart') {
      if (action === 'start') {
        const exists = await runCmd('ip', ['link', 'show', inbound.name], 3000);
        if (exists.ok) {
          await runCmd(tool, ['down', rendered.path], 5000);
          await runCmd('ip', ['link', 'del', inbound.name], 3000);
        }
      }
      const r = await runCmd(tool, ['up', rendered.path]);
      logs.push(`${tool} up ${inbound.name}: ${r.ok ? 'ok' : r.stderr}`);
      if (r.ok) {
        await applyInterfaceSpeedLimits(inbound.name, peers);
        const show = await runCmd(wgBin, ['show', inbound.name], 3000);
        if (show.ok && show.stdout) logs.push(show.stdout.trim());
      }
      return { ok: r.ok, logs };
    }
    return { ok: true, logs };
  }

  if (inbound.protocol === 'openvpn') {
    await ensureSubnetNat(inbound.subnet, action !== 'stop' && settings.nat !== false);
    const unit = `openvpn-server@${inbound.name}`;
    const r = await runCmd('systemctl', [action, unit]);
    logs.push(`systemctl ${action} ${unit}: ${r.ok ? 'ok' : r.stderr}`);
    if (r.ok && action !== 'stop') {
      await applyInterfaceSpeedLimits(`tun-${inbound.name}`, peers);
    }
    return { ok: r.ok, logs };
  }

  if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    await ensureSubnetNat(inbound.subnet, action !== 'stop' && settings.nat !== false);
    // Disable stock ocserv unit/socket once so port 443 stays free for per-inbound units
    await runCmd('systemctl', ['stop', 'ocserv.socket', 'ocserv.service'], 4000);
    await runCmd('systemctl', ['disable', 'ocserv.socket', 'ocserv.service'], 4000);
    await runCmd('systemctl', ['daemon-reload'], 5000);
    const unit = `xprotocol-ocserv@${inbound.name}`;
    const r = await runCmd('systemctl', [action, unit]);
    logs.push(`systemctl ${action} ${unit}: ${r.ok ? 'ok' : r.stderr}`);
    return { ok: r.ok, logs };
  }

  if (inbound.protocol === 'ikev2') {
    await ensureSubnetNat(inbound.subnet, action !== 'stop' && settings.nat !== false);
    if (action !== 'stop') {
      await runCmd('systemctl', ['start', 'strongswan'], 5000);
      const r = await runCmd('swanctl', ['--load-all']);
      logs.push(`swanctl --load-all: ${r.ok ? 'ok' : r.stderr}`);
      return { ok: r.ok, logs };
    } else {
      await runCmd('swanctl', ['--terminate', '--ike', inbound.name]);
    }
    return { ok: true, logs };
  }

  if (inbound.protocol === 'l2tp') {
    await ensureSubnetNat(inbound.subnet, action !== 'stop' && settings.nat !== false);
    await runCmd('systemctl', ['stop', 'xl2tpd.service'], 4000);
    await runCmd('systemctl', ['disable', 'xl2tpd.service'], 4000);
    await runCmd('systemctl', ['daemon-reload'], 5000);
    const unit = `xprotocol-xl2tpd@${inbound.name}`;
    const r = await runCmd('systemctl', [action, unit]);
    logs.push(`systemctl ${action} ${unit}: ${r.ok ? 'ok' : r.stderr}`);
    if (action !== 'stop') {
      await runCmd('systemctl', ['start', 'strongswan'], 5000);
      const sw = await runCmd('swanctl', ['--load-all']);
      logs.push(`swanctl --load-all: ${sw.ok ? 'ok' : sw.stderr}`);
    }
    return { ok: r.ok, logs };
  }

  return { ok: true, logs };
}

export async function syncLinuxInboundPeers(inbound: InboundRow, peers: PeerEntry[]): Promise<void> {
  if (!inbound.running) return;
  const settings = parseInboundSettings(inbound);
  const rendered = renderInboundServerConfig(inbound, peers);

  if (inbound.protocol === 'openvpn') {
    syncOpenVpnAuthScript(inbound.name, peers);
    return;
  }

  if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    await syncOpenConnectPasswd(
      inbound,
      peers.map((p) => ({ name: p.name, vpnPassword: p.vpnPassword || '' })),
    );
    return;
  }

  if (inbound.protocol === 'l2tp') {
    await syncL2tpSecrets(peers.map((p) => ({ name: p.name, vpnPassword: p.vpnPassword || '' })));
    return;
  }

  if (process.platform !== 'linux') return;

  fs.mkdirSync(path.dirname(rendered.path), { recursive: true });
  fs.writeFileSync(rendered.path, rendered.content, { mode: 0o600 });

  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    const amneziaOn = isAmneziaInbound(inbound.protocol, settings);
    const wgBin = amneziaOn ? 'awg' : 'wg';
    const quickBin = amneziaOn ? 'awg-quick' : 'wg-quick';
    const upCheck = await runCmd('ip', ['link', 'show', inbound.name], 3000);
    if (upCheck.ok) {
      const stripped = await runCmd(quickBin, ['strip', rendered.path], 5000);
      if (stripped.ok && stripped.stdout) {
        const tmpFile = path.join(os.tmpdir(), `xp-wg-${inbound.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.conf`);
        fs.writeFileSync(tmpFile, stripped.stdout, { mode: 0o600 });
        try {
          const syncRes = await runCmd(wgBin, ['syncconf', inbound.name, tmpFile], 5000);
          if (!syncRes.ok) {
            await applyLinuxInbound(inbound, peers, 'restart');
          }
        } finally {
          fs.rmSync(tmpFile, { force: true });
        }
      }
      await applyInterfaceSpeedLimits(inbound.name, peers);
    } else {
      await applyLinuxInbound(inbound, peers, 'start');
    }
  } else if (inbound.protocol === 'ikev2') {
    await runCmd('swanctl', ['--load-creds'], 5000);
  }
}

async function sendOpenVpnManagementCmd(inboundName: string, command: string): Promise<boolean> {
  const sockPath = `/var/run/xprotocol-${inboundName}.sock`;
  if (!fs.existsSync(sockPath)) return false;
  return new Promise((resolve) => {
    const sock = net.createConnection(sockPath);
    sock.setTimeout(2500);
    sock.on('connect', () => {
      sock.write(`${command}\nquit\n`);
      setTimeout(() => {
        sock.destroy();
        resolve(true);
      }, 150);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

export async function disconnectLinuxPeer(
  inbound: InboundRow,
  opts: { clientName: string; wgPublicKey?: string; connectionId?: string },
): Promise<boolean> {
  if (process.platform !== 'linux') return true;
  const settings = parseInboundSettings(inbound);

  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    if (!opts.wgPublicKey) return false;
    const wgBin = isAmneziaInbound(inbound.protocol, settings) ? 'awg' : 'wg';
    const r = await runCmd(wgBin, ['set', inbound.name, 'peer', opts.wgPublicKey, 'remove'], 4000);
    return r.ok;
  }

  if (inbound.protocol === 'openvpn') {
    return sendOpenVpnManagementCmd(inbound.name, `kill ${opts.clientName}`);
  }

  if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    const r = await runCmd('occtl', ['-s', `/var/run/occtl-${inbound.name}.sock`, 'disconnect', 'user', opts.clientName], 4000);
    return r.ok;
  }

  if (inbound.protocol === 'ikev2') {
    const r = await runCmd('swanctl', ['--terminate', '--ike', inbound.name, '--remote-id', opts.clientName], 4000);
    return r.ok;
  }

  if (inbound.protocol === 'l2tp' && opts.connectionId?.startsWith('l2tp-ppp-')) {
    const dev = opts.connectionId.split('-').slice(3).join('-');
    if (dev) {
      await runCmd('ip', ['link', 'set', dev, 'down'], 3000);
      return true;
    }
  }

  return false;
}

export async function collectLinuxLiveTunnels(
  inbounds: InboundRow[],
  clientsByWgPub: Map<string, string>,
): Promise<LiveTunnelSample[]> {
  if (process.platform !== 'linux') return [];
  const samples: LiveTunnelSample[] = [];

  for (const ib of inbounds) {
    if (!ib.running) continue;
    const settings = parseInboundSettings(ib);

    if (ib.protocol === 'wireguard' || ib.protocol === 'amneziawg') {
      const tool = isAmneziaInbound(ib.protocol, settings) ? 'awg' : 'wg';
      const dump = await runCmd(tool, ['show', ib.name, 'dump'], 4000);
      if (!dump.ok) continue;
      const lines = dump.stdout.trim().split('\n').slice(1);
      for (const line of lines) {
        const cols = line.split('\t');
        if (cols.length < 7) continue;
        const [pubKey, , endpoint, allowedIps, latestHandshakeStr, rxStr, txStr] = cols;
        const latestHandshake = Number(latestHandshakeStr || 0);
        if (latestHandshake > 0 && Date.now() / 1000 - latestHandshake <= 180) {
          const clientName = clientsByWgPub.get(pubKey);
          if (!clientName) continue;
          samples.push({
            id: `wg-${ib.id}-${pubKey.slice(0, 10)}`,
            clientName,
            inboundId: ib.id,
            remoteIp: endpoint.split(':')[0] || '0.0.0.0',
            tunnelIp: allowedIps.split('/')[0] || '',
            device: isAmneziaInbound(ib.protocol, settings) ? 'AmneziaWG' : 'WireGuard',
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
    } else if (ib.protocol === 'openconnect' || ib.protocol === 'ocserv') {
      const ocRes = await runCmd('occtl', ['-s', `/var/run/occtl-${ib.name}.sock`, '-j', 'show', 'users'], 4000);
      if (!ocRes.ok || !ocRes.stdout.trim()) continue;
      try {
        const users = JSON.parse(ocRes.stdout) as Array<Record<string, unknown>>;
        for (const u of users) {
          const clientName = String(u.Username || u.username || '');
          if (!clientName) continue;
          const tunnelIp = String(u.IPv4 || u['Remote IP'] || '');
          samples.push({
            id: `oc-${ib.id}-${String(u.ID || clientName)}`,
            clientName,
            inboundId: ib.id,
            remoteIp: String(u['Remote IP'] || '0.0.0.0'),
            tunnelIp,
            device: String(u['User-Agent'] || 'OpenConnect'),
            bytesIn: Number(u.RX || 0),
            bytesOut: Number(u.TX || 0),
          });
        }
      } catch {
        // ignore invalid json
      }
    } else if (ib.protocol === 'ikev2') {
      const saRes = await runCmd('swanctl', ['--list-sas', '--ike', ib.name], 4000);
      if (!saRes.ok || !saRes.stdout.trim()) continue;
      let curRemoteIp = '0.0.0.0';
      let curClientName = '';
      let curTunnelIp = '';
      let curBytesIn = 0;
      let curBytesOut = 0;
      for (const line of saRes.stdout.split('\n')) {
        const remoteMatch = line.match(/remote\s+'([^']+)'\s+@\s+([\d.]+)/);
        if (remoteMatch) {
          curClientName = remoteMatch[1];
          curRemoteIp = remoteMatch[2];
        }
        const vipMatch = line.match(/local virtual IP:\s+([\d.]+)/i);
        if (vipMatch) curTunnelIp = vipMatch[1];
        const inMatch = line.match(/in\s+[\da-f]+,\s+(\d+)\s+bytes/i);
        if (inMatch) curBytesIn = Number(inMatch[1] || 0);
        const outMatch = line.match(/out\s+[\da-f]+,\s+(\d+)\s+bytes/i);
        if (outMatch) {
          curBytesOut = Number(outMatch[1] || 0);
          if (curClientName) {
            samples.push({
              id: `ikev2-${ib.id}-${curClientName}`,
              clientName: curClientName,
              inboundId: ib.id,
              remoteIp: curRemoteIp,
              tunnelIp: curTunnelIp,
              device: 'IKEv2',
              bytesIn: curBytesIn,
              bytesOut: curBytesOut,
            });
            curClientName = '';
          }
        }
      }
    } else if (ib.protocol === 'l2tp') {
      try {
        const runEntries = fs.readdirSync('/var/run').filter((f) => f.startsWith('xprotocol-ppp-') && f.endsWith('.json'));
        for (const f of runEntries) {
          const meta = JSON.parse(fs.readFileSync(path.join('/var/run', f), 'utf-8')) as {
            ifname?: string;
            clientName?: string;
            remoteIp?: string;
            tunnelIp?: string;
            inboundName?: string;
          };
          if (!meta.ifname || !meta.clientName || (meta.inboundName && meta.inboundName !== ib.name)) continue;
          const rxFile = `/sys/class/net/${meta.ifname}/statistics/rx_bytes`;
          const txFile = `/sys/class/net/${meta.ifname}/statistics/tx_bytes`;
          if (!fs.existsSync(rxFile) || !fs.existsSync(txFile)) continue;
          samples.push({
            id: `l2tp-ppp-${ib.id}-${meta.ifname}`,
            clientName: meta.clientName,
            inboundId: ib.id,
            remoteIp: meta.remoteIp || '0.0.0.0',
            tunnelIp: meta.tunnelIp || '',
            device: 'L2TP/PPP',
            bytesIn: Number(fs.readFileSync(rxFile, 'utf-8').trim() || 0),
            bytesOut: Number(fs.readFileSync(txFile, 'utf-8').trim() || 0),
          });
        }
      } catch {
        // ignore missing /var/run or sysfs race
      }
    }
  }

  return samples;
}

export async function applyXrayRouting(enabled: boolean, configJson: string): Promise<{ ok: boolean; statusMessage: string }> {
  const dir = process.platform === 'linux' ? '/usr/local/lib/xprotocol/xray' : path.join(os.tmpdir(), 'xprotocol-xray');
  fs.mkdirSync(dir, { recursive: true });
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(cfgPath, configJson, { mode: 0o600 });

  if (process.platform !== 'linux') {
    return {
      ok: true,
      statusMessage: enabled
        ? `Saved Xray routing config (${cfgPath}); live execution runs on Ubuntu Linux`
        : 'Policy disabled',
    };
  }

  const whichXray = await runCmd('which', ['xray'], 3000);
  if (!whichXray.ok) {
    return {
      ok: false,
      statusMessage: enabled ? 'xray binary not installed on host' : 'Disabled (xray not installed)',
    };
  }

  const xrayBin = whichXray.stdout.trim();
  const unitPath = '/etc/systemd/system/xprotocol-xray.service';
  if (!fs.existsSync(unitPath)) {
    fs.writeFileSync(
      unitPath,
      `[Unit]
Description=XProtocol Xray Routing Engine
After=network-online.target

[Service]
Type=simple
ExecStart=${xrayBin} run -c ${cfgPath}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`,
    );
    await runCmd('systemctl', ['daemon-reload'], 5000);
  }

  if (enabled) {
    const r = await runCmd('systemctl', ['restart', 'xprotocol-xray'], 8000);
    return { ok: r.ok, statusMessage: r.ok ? 'Xray routing running' : r.stderr };
  } else {
    await runCmd('systemctl', ['stop', 'xprotocol-xray'], 5000);
    return { ok: true, statusMessage: 'Stopped' };
  }
}

/** Query live runtime diagnostic output for an inbound on Ubuntu Linux. */
export async function getInboundRuntimeStatus(inbound: InboundRow): Promise<string[]> {
  if (process.platform !== 'linux') return [];
  const settings = parseInboundSettings(inbound);
  const out: string[] = [];
  if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
    const wgBin = isAmneziaInbound(inbound.protocol, settings) ? 'awg' : 'wg';
    const r = await runCmd(wgBin, ['show', inbound.name], 3000);
    out.push(r.ok ? r.stdout.trim() || `${wgBin} ${inbound.name}: up (0 peers)` : `${wgBin} show ${inbound.name} error: ${r.stderr.trim()}`);
  } else if (inbound.protocol === 'openvpn') {
    const r = await runCmd('systemctl', ['status', `openvpn-server@${inbound.name}`, '--no-pager', '-n', '15'], 3000);
    if (r.stdout || r.stderr) out.push((r.stdout || r.stderr).trim());
  } else if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    const r = await runCmd('systemctl', ['status', `xprotocol-ocserv@${inbound.name}`, '--no-pager', '-n', '15'], 3000);
    if (r.stdout || r.stderr) out.push((r.stdout || r.stderr).trim());
  }
  return out;
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
