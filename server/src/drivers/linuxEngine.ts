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
import {
  ensureDaemonGateHooks,
  ensureSessionGateScript,
  syncGateStateFromDb,
} from '../services/sessionGate.js';
import {
  collectXrayLiveStats,
  kickXrayClient,
  kickXrayDeviceIp,
  kickXrayProxiedWithCooldown,
  syncAndApplyXrayEngine,
} from './xrayEngine.js';

const execFileAsync = promisify(execFile);

export type ProtocolName = 'openvpn' | 'wireguard' | 'amneziawg' | 'openconnect' | 'ikev2' | 'l2tp' | 'xray';

export interface ProtocolStatus {
  protocol: ProtocolName;
  installed: boolean;
  version: string;
  warning?: string;
}

export interface LiveTunnelSample {
  id: string;
  clientName: string;
  inboundId: number;
  remoteIp: string;
  tunnelIp: string;
  device: string;
  interfaceName?: string;
  wgPublicKey?: string;
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
  xray: { bin: 'xray', apt: ['curl', 'unzip'] },
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
  if (inbound.protocol === 'ikev2') {
    return `xfrm-${inbound.name}`;
  }
  return '';
}

/** Check whether Ubuntu 22.04+ / Linux kernel supports `xfrm_interface` required for IKEv2 shaping. */
export async function checkIkev2XfrmSupport(): Promise<{ supported: boolean; warning?: string }> {
  if (process.platform !== 'linux') return { supported: true };
  let ubuntuBelow22 = false;
  try {
    if (fs.existsSync('/etc/os-release')) {
      const osRel = fs.readFileSync('/etc/os-release', 'utf8');
      const idMatch = osRel.match(/^ID=([^\s]+)/m);
      const verMatch = osRel.match(/^VERSION_ID="?([0-9.]+)/m);
      if (idMatch?.[1]?.toLowerCase() === 'ubuntu' && verMatch?.[1]) {
        const major = Number(verMatch[1].split('.')[0]);
        if (Number.isFinite(major) && major < 22) ubuntuBelow22 = true;
      }
    }
  } catch {
    // ignore
  }
  await runCmd('modprobe', ['xfrm_interface'], 2000);
  const helpRes = await runCmd('ip', ['link', 'help', 'xfrm'], 2000);
  const hasXfrm = fs.existsSync('/sys/module/xfrm_interface') || helpRes.ok || /type xfrm/i.test(helpRes.stderr || '');
  if (!hasXfrm || ubuntuBelow22) {
    return {
      supported: false,
      warning: ubuntuBelow22
        ? 'Ubuntu < 22.04 detected: Linux xfrm_interface (kernel 5.15+) is required for IKEv2 speed shaping and tunnel routing.'
        : 'Kernel xfrm_interface module is unavailable on this host (requires Ubuntu 22.04+ / kernel 5.15+); IKEv2 speed shaping cannot run.',
    };
  }
  return { supported: true };
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
    let warning: string | undefined;
    if (proto === 'ikev2') {
      const xfrmCheck = await checkIkev2XfrmSupport();
      if (!xfrmCheck.supported) warning = xfrmCheck.warning;
    }
    results.push({ protocol: proto, installed: true, version, ...(warning ? { warning } : {}) });
  }
  return results;
}

export async function disableStockProtocolDaemons(): Promise<void> {
  if (process.platform !== 'linux') return;
  await runCmd('systemctl', ['stop', 'ocserv.socket', 'ocserv.service', 'xl2tpd.service'], 4000);
  await runCmd('systemctl', ['disable', 'ocserv.socket', 'ocserv.service', 'xl2tpd.service'], 4000);
}

export async function installProtocolPackage(protocol: ProtocolName): Promise<{ ok: boolean; log: string }> {
  if (process.platform !== 'linux') {
    return { ok: false, log: 'Protocol installation via apt-get requires Ubuntu 22.04+ Linux.' };
  }
  const meta = PROTOCOL_BINARIES[protocol];
  if (!meta) return { ok: false, log: 'Unknown protocol' };
  const update = await runCmd('apt-get', ['update', '-qq'], 120000);
  const inst = await runCmd('apt-get', ['install', '-y', '-qq', ...meta.apt], 180000);
  if (protocol === 'openconnect' || protocol === 'l2tp') {
    await disableStockProtocolDaemons();
  }
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

const ocservHashCache = new Map<string, string>();

async function hashUnixSha512(password: string): Promise<string> {
  const cached = ocservHashCache.get(password);
  if (cached) return cached;
  const res = await runCmd('openssl', ['passwd', '-6', password], 4000);
  if (res.ok && res.stdout.trim()) {
    const out = res.stdout.trim();
    if (ocservHashCache.size > 5000) ocservHashCache.clear();
    ocservHashCache.set(password, out);
    return out;
  }
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

/** Sync `/etc/ppp/chap-secrets` and `/etc/ppp/pap-secrets` safely with escaped credentials for L2TP/PPP clients. */
export async function syncL2tpSecrets(clients: { name: string; vpnPassword: string }[]): Promise<void> {
  if (process.platform !== 'linux') return;
  fs.mkdirSync('/etc/ppp', { recursive: true });
  const lines = [
    '# Managed by XProtocol Open-Core',
    ...clients.map((c) => `"${escapeSecretField(c.name)}" * "${escapeSecretField(c.vpnPassword)}" *`),
  ];
  const body = lines.join('\n') + '\n';
  fs.writeFileSync('/etc/ppp/chap-secrets', body, { mode: 0o600 });
  fs.writeFileSync('/etc/ppp/pap-secrets', body, { mode: 0o600 });
}

function writeIfChanged(filePath: string, content: string, mode: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing !== content) {
    fs.writeFileSync(filePath, content, { mode });
  }
}

function ensurePppSessionHooks(): void {
  if (process.platform !== 'linux') return;
  const gateScript = ensureSessionGateScript();
  const nodeBin = process.execPath;

  const preUpFile = '/etc/ppp/ip-pre-up.d/99-xprotocol';
  writeIfChanged(
    preUpFile,
    `#!/bin/sh
exec ${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} ppp-pre-up "$1" "$6"
`,
    0o755,
  );

  const upFile = '/etc/ppp/ip-up.d/99-xprotocol';
  writeIfChanged(
    upFile,
    `#!/bin/sh
REMOTE_WAN=$(printf '%s' "\${CALLER_ID:-0.0.0.0}" | tr -cd '0-9a-fA-F.:')
[ -n "\${REMOTE_WAN}" ] || REMOTE_WAN="0.0.0.0"
cat > "/var/run/xprotocol-ppp-\${IFNAME}.json" <<EOF
{"ifname":"\${IFNAME}","clientName":"\${PEERNAME}","remoteIp":"\${REMOTE_WAN}","tunnelIp":"\${IPREMOTE}","inboundName":"\${6}"}
EOF
${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} ppp-up "$1" "$6" || true
`,
    0o755,
  );

  const downFile = '/etc/ppp/ip-down.d/99-xprotocol';
  writeIfChanged(
    downFile,
    `#!/bin/sh
rm -f "/var/run/xprotocol-ppp-\${IFNAME}.json"
${JSON.stringify(nodeBin)} ${JSON.stringify(gateScript)} ppp-down "$1" "$6" || true
`,
    0o755,
  );
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

function calcTcRateAndBurst(mbps: number): { rate: string; burst: string } {
  const kbps = Math.max(100, Math.round(mbps * 1000));
  const burst = Math.max(16384, Math.round((kbps * 1024) / 8));
  return { rate: `${kbps}kbit`, burst: String(burst) };
}

function minorOfIp(ip: string): number {
  const parts = ip.trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return 0;
  const minor = (parts[2] << 8) | parts[3];
  return minor === 0 || minor === 0xffff ? 0 : minor;
}

const activeInterfaceFilters = new Map<string, Set<number>>();

/**
 * Apply per-client download (HTB) and upload (native kernel ingress policer — no IFB required)
 * traffic shaping on shared tunnel interfaces such as `wg*`, `tun-*`, and `xfrm-*`.
 * Updates classes/filters incrementally when the HTB root is already present so active peers do not drop.
 */
export async function applyInterfaceSpeedLimits(iface: string, peers: PeerEntry[]): Promise<void> {
  if (process.platform !== 'linux' || !iface) return;
  const check = await runCmd('ip', ['link', 'show', iface], 3000);
  if (!check.ok) return;

  const dlEntries = peers
    .filter((p) => p.downloadMbps && p.downloadMbps > 0 && p.tunnelIp)
    .map((p) => ({ ip: p.tunnelIp, mbps: Number(p.downloadMbps) }));

  const qdiscShow = await runCmd('tc', ['qdisc', 'show', 'dev', iface], 2500);
  const hasHtbRoot = qdiscShow.ok && qdiscShow.stdout.includes('qdisc htb 1:');
  const hasIngress = qdiscShow.ok && qdiscShow.stdout.includes('qdisc ingress ffff:');

  if (dlEntries.length === 0) {
    if (hasHtbRoot) {
      await runCmd('tc', ['qdisc', 'del', 'dev', iface, 'root'], 3000);
    }
    activeInterfaceFilters.delete(`${iface}:dl`);
  } else {
    if (!hasHtbRoot) {
      await runCmd('tc', ['qdisc', 'del', 'dev', iface, 'root'], 3000);
      await runCmd('tc', ['qdisc', 'replace', 'dev', iface, 'root', 'handle', '1:', 'htb', 'default', 'fff'], 3000);
    }
    await runCmd('tc', ['class', 'replace', 'dev', iface, 'parent', '1:', 'classid', '1:fff', 'htb', 'rate', '10gbit'], 3000);
    const nextDlMinors = new Set<number>();
    for (const item of dlEntries) {
      const m = minorOfIp(item.ip);
      if (!m) continue;
      nextDlMinors.add(m);
      const cid = `1:${m.toString(16)}`;
      const { rate, burst } = calcTcRateAndBurst(item.mbps);
      await runCmd('tc', ['class', 'replace', 'dev', iface, 'parent', '1:', 'classid', cid, 'htb', 'rate', rate, 'ceil', rate, 'burst', burst], 3000);
      await runCmd(
        'tc',
        ['filter', 'replace', 'dev', iface, 'protocol', 'ip', 'parent', '1:', 'prio', String(m), 'u32', 'match', 'ip', 'dst', `${item.ip}/32`, 'flowid', cid],
        3000,
      );
    }
    const prevDlMinors = activeInterfaceFilters.get(`${iface}:dl`);
    if (prevDlMinors && hasHtbRoot) {
      for (const oldM of prevDlMinors) {
        if (!nextDlMinors.has(oldM)) {
          await runCmd('tc', ['filter', 'del', 'dev', iface, 'parent', '1:', 'prio', String(oldM)], 2500);
          await runCmd('tc', ['class', 'del', 'dev', iface, 'classid', `1:${oldM.toString(16)}`], 2500);
        }
      }
    }
    activeInterfaceFilters.set(`${iface}:dl`, nextDlMinors);
  }

  const ulEntries = peers
    .filter((p) => p.uploadMbps && p.uploadMbps > 0 && p.tunnelIp)
    .map((p) => ({ ip: p.tunnelIp, mbps: Number(p.uploadMbps) }));
  if (ulEntries.length === 0) {
    if (hasIngress) {
      await runCmd('tc', ['qdisc', 'del', 'dev', iface, 'ingress'], 3000);
    }
    activeInterfaceFilters.delete(`${iface}:ul`);
  } else {
    if (!hasIngress) {
      await runCmd('tc', ['qdisc', 'add', 'dev', iface, 'handle', 'ffff:', 'ingress'], 3000);
    }
    const nextUlMinors = new Set<number>();
    for (const item of ulEntries) {
      const m = minorOfIp(item.ip);
      if (!m) continue;
      nextUlMinors.add(m);
      const { rate, burst } = calcTcRateAndBurst(item.mbps);
      await runCmd(
        'tc',
        [
          'filter',
          'replace',
          'dev',
          iface,
          'parent',
          'ffff:',
          'protocol',
          'ip',
          'prio',
          String(m),
          'u32',
          'match',
          'ip',
          'src',
          `${item.ip}/32`,
          'police',
          'rate',
          rate,
          'burst',
          burst,
          'drop',
          'flowid',
          ':1',
        ],
        3000,
      );
    }
    const prevUlMinors = activeInterfaceFilters.get(`${iface}:ul`);
    if (prevUlMinors && hasIngress) {
      for (const oldM of prevUlMinors) {
        if (!nextUlMinors.has(oldM)) {
          await runCmd('tc', ['filter', 'del', 'dev', iface, 'parent', 'ffff:', 'prio', String(oldM)], 2500);
        }
      }
    }
    activeInterfaceFilters.set(`${iface}:ul`, nextUlMinors);
  }
}

/**
 * Apply dedicated TBF egress (download) + ingress policer (upload) directly on per-session
 * interfaces such as L2TP (`pppN`) or OpenConnect (`vcN` / `vpnsN`).
 */
export async function applyDedicatedSessionLimits(
  dev: string,
  downloadMbps: number | null,
  uploadMbps: number | null,
): Promise<void> {
  if (process.platform !== 'linux' || !dev) return;
  const check = await runCmd('ip', ['link', 'show', dev], 3000);
  if (!check.ok) return;

  if (downloadMbps && downloadMbps > 0) {
    const { rate, burst } = calcTcRateAndBurst(downloadMbps);
    await runCmd('tc', ['qdisc', 'replace', 'dev', dev, 'root', 'tbf', 'rate', rate, 'burst', burst, 'latency', '100ms'], 3000);
  } else {
    await runCmd('tc', ['qdisc', 'del', 'dev', dev, 'root'], 3000);
  }

  await runCmd('tc', ['qdisc', 'del', 'dev', dev, 'ingress'], 3000);
  if (uploadMbps && uploadMbps > 0) {
    const { rate, burst } = calcTcRateAndBurst(uploadMbps);
    await runCmd('tc', ['qdisc', 'add', 'dev', dev, 'handle', 'ffff:', 'ingress'], 3000);
    await runCmd(
      'tc',
      [
        'filter',
        'replace',
        'dev',
        dev,
        'parent',
        'ffff:',
        'protocol',
        'all',
        'prio',
        '1',
        'u32',
        'match',
        'u32',
        '0',
        '0',
        'police',
        'rate',
        rate,
        'burst',
        burst,
        'drop',
        'flowid',
        ':1',
      ],
      3000,
    );
  }
}

/** Configure kernel IPv4 forwarding, idempotent iptables NAT/FORWARD rules, and TCP MSS clamping for a tunnel subnet. */
export async function ensureSubnetNat(subnet: string, enable: boolean): Promise<void> {
  if (process.platform !== 'linux' || !subnet) return;
  await runCmd('sysctl', ['-w', 'net.ipv4.ip_forward=1'], 4000);

  const natArgs = ['-t', 'nat', '-s', subnet, '!', '-d', subnet, '-j', 'MASQUERADE'];
  const fwdOut = ['-s', subnet, '-j', 'ACCEPT'];
  const fwdIn = ['-d', subnet, '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'ACCEPT'];
  const mssOut = ['-t', 'mangle', '-s', subnet, '-p', 'tcp', '--tcp-flags', 'SYN,RST', 'SYN', '-j', 'TCPMSS', '--set-mss', '1240'];
  const mssIn = ['-t', 'mangle', '-d', subnet, '-p', 'tcp', '--tcp-flags', 'SYN,RST', 'SYN', '-j', 'TCPMSS', '--set-mss', '1240'];

  const ensureRule = async (chain: string, args: string[], insertFirst = false) => {
    if (!(await runCmd('iptables', ['-C', chain, ...args], 3000)).ok) {
      await runCmd('iptables', insertFirst ? ['-I', chain, '1', ...args] : ['-A', chain, ...args], 3000);
    }
  };

  if (enable) {
    await ensureRule('POSTROUTING', natArgs, false);
    await ensureRule('FORWARD', fwdOut, true);
    await ensureRule('FORWARD', fwdIn, true);
    await ensureRule('FORWARD', mssOut, true);
    await ensureRule('FORWARD', mssIn, true);
  } else {
    await runCmd('iptables', ['-D', 'POSTROUTING', ...natArgs], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...fwdOut], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...fwdIn], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...mssOut], 3000);
    await runCmd('iptables', ['-D', 'FORWARD', ...mssIn], 3000);
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

  if (inbound.protocol === 'xray') {
    if (process.platform === 'linux' && action !== 'stop') {
      const transport = String(settings.transport || 'raw');
      await openFirewallPort(inbound.port, transport === 'kcp' ? 'udp' : 'tcp');
    }
    const r = await syncAndApplyXrayEngine();
    logs.push(`[${new Date().toISOString()}] Xray ${action} ${inbound.name} (${peers.length} peers): ${r.statusMessage}`);
    return { ok: r.ok, logs };
  }

  if (inbound.protocol === 'openvpn') {
    await ensureOpenVpnPki();
    syncOpenVpnAuthScript(inbound.name, peers);
    ensureDaemonGateHooks(inbound.name);
    try {
      syncGateStateFromDb();
    } catch {
      // ignore if db not ready
    }
  } else if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    await ensureInboundTlsCertFiles(inbound.cert_id, inbound.public_address_override || undefined);
    ensureDaemonGateHooks(inbound.name);
    try {
      syncGateStateFromDb();
    } catch {
      // ignore
    }
    await syncOpenConnectPasswd(
      inbound,
      peers.map((p) => ({ name: p.name, vpnPassword: p.vpnPassword || '' })),
    );
  } else if (inbound.protocol === 'ikev2') {
    ensureDaemonGateHooks(inbound.name);
    try {
      syncGateStateFromDb();
    } catch {
      // ignore
    }
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
    try {
      syncGateStateFromDb();
    } catch {
      // ignore
    }
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
    const xfrmName = `xfrm-${inbound.name}`;
    const xfrmId = 1000 + Math.max(1, Number(inbound.id || 1));
    if (action !== 'stop') {
      await runCmd('modprobe', ['xfrm_interface'], 2000);
      const routeRes = await runCmd('ip', ['-4', '-o', 'route', 'show', 'default'], 2500);
      const wanIface = routeRes.stdout?.match(/\bdev\s+(\S+)/)?.[1] || 'eth0';
      await runCmd('ip', ['link', 'del', xfrmName], 2000);
      const xfrmAdd = await runCmd(
        'ip',
        ['link', 'add', xfrmName, 'type', 'xfrm', 'dev', wanIface, 'if_id', String(xfrmId)],
        3000,
      );
      if (!xfrmAdd.ok) {
        const xfrmDiag = await checkIkev2XfrmSupport();
        const errMsg =
          xfrmDiag.warning ||
          `ERROR: Failed to create ${xfrmName} (requires Ubuntu 22.04+ / kernel 5.15+ with xfrm_interface): ${xfrmAdd.stderr.trim()}`;
        logs.push(errMsg);
        return { ok: false, logs };
      }
      await runCmd('ip', ['link', 'set', xfrmName, 'up'], 2500);
      await runCmd('ip', ['route', 'replace', inbound.subnet, 'dev', xfrmName], 2500);
      await runCmd('systemctl', ['start', 'strongswan'], 5000);
      const r = await runCmd('swanctl', ['--load-all']);
      logs.push(`swanctl --load-all: ${r.ok ? 'ok' : r.stderr}`);
      return { ok: r.ok, logs };
    } else {
      await runCmd('swanctl', ['--terminate', '--ike', inbound.name]);
      await runCmd('ip', ['link', 'del', xfrmName], 2000);
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

  if (inbound.protocol === 'smartdns') {
    if (action !== 'stop') {
      await openFirewallPort(53, 'udp');
      await openFirewallPort(53, 'tcp');
      await openFirewallPort(80, 'tcp');
      await openFirewallPort(443, 'tcp');
      for (const extraP of String(settings.extraTlsPorts || '').split(/[,\s]+/).filter(Boolean)) {
        const num = Number(extraP);
        if (num > 0 && num <= 65535) await openFirewallPort(num, 'tcp');
      }
      const hasDnsmasq = await runCmd('which', ['dnsmasq'], 2000);
      if (hasDnsmasq.ok) {
        await runCmd('systemctl', ['restart', 'dnsmasq'], 5000);
      }
      logs.push(`Smart DNS configured at ${rendered.path}`);
    }
    return { ok: true, logs };
  }

  if (inbound.protocol === 'telegram') {
    if (action !== 'stop') {
      await openFirewallPort(inbound.port || 443, 'tcp');
      const hasTelemt = await runCmd('which', ['telemt'], 2000);
      if (hasTelemt.ok) {
        const r = await runCmd('systemctl', [action, `xprotocol-telemt@${inbound.name}`], 5000);
        logs.push(`systemctl ${action} xprotocol-telemt@${inbound.name}: ${r.ok ? 'ok' : r.stderr}`);
        return { ok: r.ok, logs };
      }
      logs.push(`Telegram MTProto config written to ${rendered.path} (engine: telemt)`);
    }
    return { ok: true, logs };
  }

  return { ok: true, logs };
}

export async function syncLinuxInboundPeers(inbound: InboundRow, peers: PeerEntry[]): Promise<void> {
  if (!inbound.running) return;
  const settings = parseInboundSettings(inbound);
  const rendered = renderInboundServerConfig(inbound, peers);

  if (inbound.protocol === 'openvpn') {
    syncOpenVpnAuthScript(inbound.name, peers);
    ensureDaemonGateHooks(inbound.name);
    // OpenVPN assigns dynamic tunnel IPs; collector.ts owns live `tc` shaping on `tun-*`
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

  if (inbound.protocol === 'xray') {
    await syncAndApplyXrayEngine();
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
    await applyInterfaceSpeedLimits(`xfrm-${inbound.name}`, peers);
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
  opts: { clientName: string; wgPublicKey?: string; connectionId?: string; singleDeviceOnly?: boolean; remoteIp?: string },
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
    const cidMatch = opts.connectionId?.match(/-cid(\d+)$/);
    if (cidMatch) {
      const ok = await sendOpenVpnManagementCmd(inbound.name, `client-kill ${cidMatch[1]}`);
      if (ok) return true;
    }
    return sendOpenVpnManagementCmd(inbound.name, `kill ${opts.clientName}`);
  }

  if (inbound.protocol === 'openconnect' || inbound.protocol === 'ocserv') {
    const idMatch = opts.connectionId?.match(/^oc-\d+-(\d+)$/);
    if (idMatch) {
      const r = await runCmd('occtl', ['-s', `/var/run/occtl-${inbound.name}.sock`, 'disconnect', 'id', idMatch[1]], 4000);
      if (r.ok) return true;
    }
    const r = await runCmd('occtl', ['-s', `/var/run/occtl-${inbound.name}.sock`, 'disconnect', 'user', opts.clientName], 4000);
    return r.ok;
  }

  if (inbound.protocol === 'ikev2') {
    const ikeIdMatch = opts.connectionId?.match(/^ikev2-\d+-(\d+)$/);
    if (ikeIdMatch) {
      const r = await runCmd('swanctl', ['--terminate', '--ike-id', ikeIdMatch[1]], 4000);
      if (r.ok) return true;
    }
    const r = await runCmd('swanctl', ['--terminate', '--ike', inbound.name, '--remote-id', opts.clientName], 4000);
    return r.ok;
  }

  if (inbound.protocol === 'l2tp' && opts.connectionId?.startsWith('l2tp-ppp-')) {
    const dev = opts.connectionId.split('-').slice(3).join('-');
    if (dev) {
      const pidFile = `/var/run/${dev}.pid`;
      if (fs.existsSync(pidFile)) {
        const pid = Number(fs.readFileSync(pidFile, 'utf-8').trim());
        if (Number.isInteger(pid) && pid > 1) {
          try {
            process.kill(pid, 'SIGHUP');
            return true;
          } catch {
            // fallback to link down
          }
        }
      }
      await runCmd('ip', ['link', 'set', dev, 'down'], 3000);
      return true;
    }
  }

  if (inbound.protocol === 'xray') {
    const ipFromConn = opts.connectionId?.match(/@ip:([^\s]+)$/)?.[1] || opts.remoteIp || '';
    const isProxied = Boolean(settings.behindCdn || settings.cdn || settings.proxyProtocol);
    if (opts.singleDeviceOnly) {
      if (isProxied) {
        return kickXrayProxiedWithCooldown(inbound.name, opts.clientName);
      }
      if (ipFromConn && ipFromConn !== '0.0.0.0') {
        return kickXrayDeviceIp(inbound.port, inbound.transport, ipFromConn);
      }
    }
    const rmuOk = await kickXrayClient(inbound.name, opts.clientName);
    if (!isProxied && ipFromConn && ipFromConn !== '0.0.0.0') {
      await kickXrayDeviceIp(inbound.port, inbound.transport, ipFromConn).catch(() => false);
    }
    return rmuOk;
  }

  return false;
}

async function resolveInterfaceByTunnelIp(tunnelIp: string): Promise<string> {
  if (!tunnelIp || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tunnelIp)) return '';
  const r = await runCmd('ip', ['-4', '-o', 'route', 'get', tunnelIp], 2000);
  if (!r.ok || !r.stdout) return '';
  const m = r.stdout.match(/\bdev\s+(\S+)/);
  return m ? m[1] : '';
}

/** Parse `swanctl --list-sas` output into per-SA live samples keyed by unique SA ID and EAP/remote identity. */
export function parseSwanctlSasOutput(stdout: string, inboundId: number): LiveTunnelSample[] {
  const samples: LiveTunnelSample[] = [];
  let curUniqueId = '';
  let curRemoteIp = '0.0.0.0';
  let curClientName = '';
  let curTunnelIp = '';
  let curBytesIn = 0;
  let curBytesOut = 0;

  const flushIfReady = () => {
    if (!curClientName) return;
    const uid = curUniqueId || `${curClientName}-${curRemoteIp}-${samples.length + 1}`;
    samples.push({
      id: `ikev2-${inboundId}-${uid}`,
      clientName: curClientName,
      inboundId,
      remoteIp: curRemoteIp,
      tunnelIp: curTunnelIp,
      device: 'IKEv2',
      bytesIn: curBytesIn,
      bytesOut: curBytesOut,
    });
    curUniqueId = '';
    curRemoteIp = '0.0.0.0';
    curClientName = '';
    curTunnelIp = '';
    curBytesIn = 0;
    curBytesOut = 0;
  };

  for (const line of stdout.split('\n')) {
    const saHeader = line.match(/^\S+:\s+#(\d+),/);
    if (saHeader) {
      flushIfReady();
      curUniqueId = saHeader[1];
    }
    const remoteMatch = line.match(/remote\s+'([^']+)'\s+@\s+([\d.]+)/);
    if (remoteMatch) {
      if (!curClientName) curClientName = remoteMatch[1];
      curRemoteIp = remoteMatch[2];
    }
    const eapMatch = line.match(/(?:EAP|XAuth):\s+'([^']+)'/i);
    if (eapMatch) {
      curClientName = eapMatch[1];
    }
    const vipMatch = line.match(/(?:remote|local) virtual IP:\s+([\d.]+)/i);
    if (vipMatch) curTunnelIp = vipMatch[1];
    const inMatch = line.match(/in\s+[\da-f]+,\s+(\d+)\s+bytes/i);
    if (inMatch) curBytesIn += Number(inMatch[1] || 0);
    const outMatch = line.match(/out\s+[\da-f]+,\s+(\d+)\s+bytes/i);
    if (outMatch) curBytesOut += Number(outMatch[1] || 0);
  }
  flushIfReady();
  return samples;
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
        // PersistentKeepalive is 25s; >75s silence means >3 missed keepalives
        if (latestHandshake > 0 && Date.now() / 1000 - latestHandshake <= 75) {
          const clientName = clientsByWgPub.get(pubKey);
          if (!clientName) continue;
          samples.push({
            id: `wg-${ib.id}-${pubKey.slice(0, 10)}`,
            clientName,
            inboundId: ib.id,
            remoteIp: endpoint.split(':')[0] || '0.0.0.0',
            tunnelIp: allowedIps.split('/')[0] || '',
            device: isAmneziaInbound(ib.protocol, settings) ? 'AmneziaWG' : 'WireGuard',
            wgPublicKey: pubKey,
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
        if (line.startsWith('CLIENT_LIST\t')) {
          const parts = line.split('\t');
          if (parts.length < 11) continue;
          const clientName = parts[9] && parts[9] !== 'UNDEF' ? parts[9] : parts[1];
          const remoteIp = parts[2].split(':')[0] || '0.0.0.0';
          const tunnelIp = parts[3] || '';
          const bytesIn = Number(parts[5] || 0);
          const bytesOut = Number(parts[6] || 0);
          const cid = (parts[10] || '').trim();
          samples.push({
            id: cid ? `ovpn-${ib.id}-cid${cid}` : `ovpn-${ib.id}-${clientName}-${tunnelIp}`,
            clientName,
            inboundId: ib.id,
            remoteIp,
            tunnelIp,
            device: 'OpenVPN',
            interfaceName: `tun-${ib.name}`,
            bytesIn,
            bytesOut,
          });
        } else if (line.startsWith('CLIENT_LIST,')) {
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
            interfaceName: `tun-${ib.name}`,
            bytesIn,
            bytesOut,
          });
        }
      }
    } else if (ib.protocol === 'openconnect' || ib.protocol === 'ocserv') {
      const ocRes = await runCmd('occtl', ['-s', `/var/run/occtl-${ib.name}.sock`, '-j', 'show', 'users'], 4000);
      if (!ocRes.ok || !ocRes.stdout.trim()) continue;
      try {
        const users = JSON.parse(ocRes.stdout) as Array<Record<string, unknown>>;
        for (const u of users) {
          const clientName = String(u.Username || u.username || '');
          if (!clientName) continue;
          const tunnelIp = String(u.IPv4 || '');
          let ifaceName = String(u.Device || u.device || '');
          if (!ifaceName && tunnelIp) {
            ifaceName = await resolveInterfaceByTunnelIp(tunnelIp);
          }
          samples.push({
            id: `oc-${ib.id}-${String(u.ID || clientName)}`,
            clientName,
            inboundId: ib.id,
            remoteIp: String(u['Remote IP'] || '0.0.0.0'),
            tunnelIp,
            device: String(u['User-Agent'] || 'OpenConnect'),
            interfaceName: ifaceName || undefined,
            bytesIn: Number(u.RX ?? u.rx ?? 0),
            bytesOut: Number(u.TX ?? u.tx ?? 0),
          });
        }
      } catch {
        // ignore invalid json
      }
    } else if (ib.protocol === 'ikev2') {
      const saRes = await runCmd('swanctl', ['--list-sas', '--ike', ib.name], 4000);
      if (!saRes.ok || !saRes.stdout.trim()) continue;
      samples.push(...parseSwanctlSasOutput(saRes.stdout, ib.id));
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
              interfaceName: meta.ifname,
              bytesIn: Number(fs.readFileSync(rxFile, 'utf-8').trim() || 0),
              bytesOut: Number(fs.readFileSync(txFile, 'utf-8').trim() || 0),
            });
        }
      } catch {
        // ignore missing /var/run or sysfs race
      }
    }
  }

  // Collect active Xray user traffic deltas & per-device IPs if any Xray inbound is running
  const xrayInbounds = inbounds.filter((i) => i.running && i.protocol === 'xray');
  if (xrayInbounds.length > 0) {
    const xrStats = await collectXrayLiveStats(xrayInbounds);
    const xrByName = new Map(xrayInbounds.map((ib) => [ib.name, ib]));
    const fallbackIb = xrayInbounds[0];
    for (const xs of xrStats) {
      const targetIb = (xs.inboundName ? xrByName.get(xs.inboundName) : undefined) || fallbackIb;
      const ipSuffix = xs.remoteIp && xs.remoteIp !== '0.0.0.0' ? `@ip:${xs.remoteIp}` : '';
      samples.push({
        id: `xray-${targetIb.id}-${xs.clientName}${ipSuffix}`,
        clientName: xs.clientName,
        inboundId: targetIb.id,
        remoteIp: xs.remoteIp,
        tunnelIp: '',
        device: 'Xray',
        bytesIn: xs.uplink,
        bytesOut: xs.downlink,
      });
    }
  }

  return samples;
}

export async function applyXrayRouting(enabled: boolean, configJson: string): Promise<{ ok: boolean; statusMessage: string }> {
  void enabled;
  void configJson;
  return syncAndApplyXrayEngine();
}

/** Query live runtime diagnostic output for an inbound on Ubuntu Linux. */
export async function getInboundRuntimeStatus(inbound: InboundRow): Promise<string[]> {
  if (process.platform !== 'linux') return [];
  const settings = parseInboundSettings(inbound);
  const out: string[] = [];
  if (inbound.protocol === 'xray') {
    const r = await runCmd('systemctl', ['status', 'xprotocol-xray', '--no-pager', '-n', '15'], 3000);
    if (r.stdout || r.stderr) out.push((r.stdout || r.stderr).trim());
    if (fs.existsSync('/var/log/xprotocol/xray-error.log')) {
      const errLines = fs.readFileSync('/var/log/xprotocol/xray-error.log', 'utf8').trim().split('\n').slice(-10).join('\n');
      if (errLines) out.push(`[xray-error.log]\n${errLines}`);
    }
  } else if (inbound.protocol === 'wireguard' || inbound.protocol === 'amneziawg') {
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
