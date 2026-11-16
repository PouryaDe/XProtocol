export type InboundKind = 'openvpn' | 'openconnect' | 'ocserv' | 'wireguard' | 'amneziawg' | 'ikev2' | 'l2tp';

export interface InboundRemote {
  label: string;
  host: string;
  port: string;
}

export interface InboundSettings {
  displayName?: string;
  description?: string;
  dns?: string | string[];
  pushRoutes?: string | string[];
  redirectGateway?: boolean;
  nat?: boolean;
  clientToClient?: boolean;
  ipv6?: boolean;
  network6?: string;
  maxClients?: number;
  searchDomain?: string;
  blockOutsideDns?: boolean;

  // OpenVPN
  authMode?: 'cert' | 'cert+pass' | 'pass' | string;
  tlsMode?: 'tls-crypt' | 'tls-auth' | 'none';
  dataCiphers?: string[];
  fallbackCipher?: string;
  authDigest?: string;
  tlsMinVersion?: string;
  keepaliveInterval?: number;
  keepaliveTimeout?: number;
  tunMtu?: number;
  mssFix?: number;
  fragment?: number;
  sndRcvBuf?: number;
  renegSec?: number;
  compression?: string;
  exitNotify?: boolean;
  portShare?: string;
  verb?: number;
  serverCustom?: string;
  clientCustom?: string;

  // WireGuard & AmneziaWG
  mtu?: number;
  keepalive?: number;
  filenameTemplate?: string;
  obfuscation?: 'off' | 'amnezia';
  amnezia?: { Jc: number; Jmin: number; Jmax: number; S1: number; S2: number; H1: number; H2: number; H3: number; H4: number };

  // OpenConnect
  dtls?: boolean;
  ciscoCompat?: boolean;
  camouflage?: boolean;
  camouflageSecret?: string;
  camouflageRealm?: string;
  certSource?: 'pki' | 'panel' | 'acme' | '';
  acmeHost?: string;
  idleTimeout?: number;
  mobileIdleTimeout?: number;
  dpd?: number;
  mobileDpd?: number;
  cookieTimeout?: number;
  tlsPriorities?: string;
  proxyProtocol?: boolean;
  ocCustom?: string;

  // IKEv2 / L2TP IPsec
  serverId?: string;
  psk?: string;
  ikeProposals?: string;
  espProposals?: string;
  rekeySeconds?: number;
  childRekeySeconds?: number;
  dpdSeconds?: number;
  mobike?: boolean;
  fragmentation?: boolean;
  pppMtu?: number;
  pppMru?: number;
  lcpEchoInterval?: number;
  lcpEchoFailure?: number;
  idleSeconds?: number;
  forceEncap?: boolean;

  remotes?: Array<{ label: string; host: string; port: number }>;
  [key: string]: unknown;
}

export interface InboundItem {
  id: number;
  nodeId: number | null;
  nodeName: string | null;
  nodeStatus?: string | null;
  nodeIsLocal?: boolean;
  protocol: InboundKind | string;
  name: string;
  displayName?: string;
  transport: string;
  port: number;
  subnet: string;
  authMode: string;
  description: string;
  publicAddressOverride: string;
  enabled: boolean;
  running: boolean;
  certId?: number | null;
  certDomain?: string | null;
  serverPublicKey?: string;
  settings: InboundSettings;
  onlineCount: number;
  allowedClientsCount?: number;
  createdAt: string;
}

export interface NodeOption {
  id: number;
  name: string;
  address?: string;
  status?: string;
  enabled?: boolean;
  isLocal?: boolean;
  port?: number;
  xprotocolVersion?: string;
}

export interface CidrInfo {
  ok: boolean;
  reason?: 'empty' | 'format' | 'unmasked' | 'range' | 'private';
  total?: number;
  usable?: number;
}

export function normalizeKind(raw: string): 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp' {
  const k = (raw || '').toLowerCase();
  if (k === 'openconnect' || k === 'ocserv') return 'ocserv';
  if (k === 'wireguard' || k === 'amneziawg') return 'wireguard';
  if (k === 'ikev2') return 'ikev2';
  if (k === 'l2tp') return 'l2tp';
  return 'openvpn';
}

export function formatKindBadge(kind: string, obfuscation?: string): string {
  const k = kind.toLowerCase();
  if (k === 'amneziawg' || (k === 'wireguard' && obfuscation === 'amnezia')) return 'AmneziaWG';
  if (k === 'ocserv' || k === 'openconnect') return 'OpenConnect';
  if (k === 'ikev2') return 'IKEv2';
  if (k === 'l2tp') return 'L2TP/IPsec';
  if (k === 'wireguard') return 'WireGuard';
  return 'OpenVPN';
}

export function defaultPortForKind(kind: 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp'): number {
  switch (kind) {
    case 'wireguard':
      return 51820;
    case 'ocserv':
      return 443;
    case 'ikev2':
    case 'l2tp':
      return 500;
    default:
      return 1194;
  }
}

export function randomTokenStr(len = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function randomAmneziaParams() {
  const r = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    Jc: r(4, 8),
    Jmin: r(30, 50),
    Jmax: r(70, 120),
    S1: r(15, 60),
    S2: r(15, 60),
    H1: r(1000000, 999999999),
    H2: r(1000000, 999999999),
    H3: r(1000000, 999999999),
    H4: r(1000000, 999999999),
  };
}

export function pickFreeCidr(existingSubnets: string[], startOctet: number): string {
  for (let o = startOctet; o < 250; o++) {
    const candidate = `10.${o}.0.0/24`;
    if (!existingSubnets.includes(candidate)) return candidate;
  }
  return `10.${startOctet}.0.0/24`;
}

export function validateCidr(raw: string, kind: string): CidrInfo {
  const s = raw.trim();
  if (!s) return { ok: true, total: 256, usable: 253 };
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(s);
  if (!m) return { ok: false, reason: 'format' };
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const prefix = Number(m[5]);
  if (octets.some((o) => o > 255) || prefix > 32) return { ok: false, reason: 'format' };

  const nk = normalizeKind(kind);
  const minP = nk === 'wireguard' ? 8 : 16;
  const maxP = nk === 'wireguard' ? 28 : 28;
  if (prefix < minP || prefix > maxP) return { ok: false, reason: 'range' };

  const ipInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  if ((ipInt & mask) !== ipInt) return { ok: false, reason: 'unmasked' };

  const isPrivate =
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
  if (!isPrivate) return { ok: false, reason: 'private' };

  const total = 2 ** (32 - prefix);
  const usable = Math.max(0, total - 3);
  return { ok: true, total, usable };
}

export function getPresetRanges(_kind: string): Array<{ cidr: string; role: 'default' | 'small' | 'large'; usable: number }> {
  return [
    { cidr: '10.40.0.0/24', role: 'default', usable: 253 },
    { cidr: '10.40.0.0/22', role: 'small', usable: 1021 },
    { cidr: '10.40.0.0/20', role: 'small', usable: 4093 },
    { cidr: '10.40.0.0/16', role: 'large', usable: 65533 },
    { cidr: '10.0.0.0/8', role: 'large', usable: 16777213 },
    { cidr: '172.16.40.0/24', role: 'small', usable: 253 },
    { cidr: '192.168.40.0/24', role: 'small', usable: 253 },
    { cidr: '100.64.40.0/24', role: 'small', usable: 253 },
  ];
}

export function buildDefaultSettings(kind: 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp'): InboundSettings {
  return {
    description: '',
    dns: ['1.1.1.1', '8.8.8.8'],
    pushRoutes: [],
    redirectGateway: true,
    nat: true,
    clientToClient: false,
    ipv6: false,
    network6: '',
    maxClients: kind === 'wireguard' ? 1024 : 253,
    searchDomain: '',
    blockOutsideDns: false,
    authMode: 'cert+pass',
    tlsMode: 'tls-crypt',
    dataCiphers: ['AES-256-GCM', 'AES-128-GCM', 'CHACHA20-POLY1305'],
    fallbackCipher: '',
    authDigest: 'SHA256',
    tlsMinVersion: '1.2',
    keepaliveInterval: 10,
    keepaliveTimeout: 60,
    tunMtu: 0,
    mssFix: 0,
    fragment: 0,
    sndRcvBuf: 0,
    renegSec: 3600,
    compression: 'off',
    exitNotify: true,
    portShare: '',
    verb: 3,
    serverCustom: '',
    clientCustom: '',
    mtu: 1420,
    keepalive: 25,
    filenameTemplate: '',
    obfuscation: kind === 'wireguard' ? 'off' : undefined,
    amnezia: kind === 'wireguard' ? randomAmneziaParams() : undefined,
    dtls: true,
    ciscoCompat: true,
    camouflage: false,
    camouflageSecret: randomTokenStr(16),
    camouflageRealm: 'Welcome',
    certSource: 'pki',
    acmeHost: '',
    idleTimeout: 0,
    mobileIdleTimeout: 0,
    dpd: 90,
    mobileDpd: 1800,
    cookieTimeout: 300,
    tlsPriorities: 'NORMAL:%SERVER_PRECEDENCE:%COMPAT:-VERS-SSL3.0:-VERS-TLS1.0:-VERS-TLS1.1',
    proxyProtocol: false,
    ocCustom: '',
    serverId: '',
    psk: '',
    ikeProposals:
      kind === 'ikev2'
        ? 'aes256gcm16-prfsha384-ecp384,aes256-sha256-modp2048'
        : 'aes256-sha256-modp2048,aes128-sha256-modp2048',
    espProposals: kind === 'ikev2' ? 'aes256gcm16,aes256-sha256' : 'aes256-sha256,aes128-sha256',
    rekeySeconds: 3600,
    childRekeySeconds: 1800,
    dpdSeconds: 30,
    mobike: true,
    fragmentation: true,
    pppMtu: 1400,
    pppMru: 1400,
    lcpEchoInterval: 30,
    lcpEchoFailure: 4,
    idleSeconds: 0,
    forceEncap: false,
  };
}
