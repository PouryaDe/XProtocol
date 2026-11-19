export type InboundKind =
  | 'openvpn'
  | 'openconnect'
  | 'ocserv'
  | 'wireguard'
  | 'amneziawg'
  | 'ikev2'
  | 'l2tp'
  | 'xray'
  | 'smartdns'
  | 'telegram';

export interface InboundRemote {
  flag?: string;
  label: string;
  host: string;
  port: string;
  sni?: string;
  hostHeader?: string;
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

  remotes?: Array<{ flag?: string; label: string; host: string; port: number; sni?: string; hostHeader?: string }>;
  // Smart DNS
  dnsCategories?: string[];
  dnsSelectedDomains?: Record<string, string[]>;
  extraDomains?: string[];
  neverPassDomains?: string[];
  maxAddressesPerClient?: number;
  upstreams?: string[];
  smartDnsIpv4?: string;
  smartDnsIpv6?: string;
  extraTlsPorts?: string;
  // Telegram proxy (telemt)
  tgFakeTls?: boolean;
  tgSecure?: boolean;
  tgClassic?: boolean;
  fakeTlsDomain?: string;
  passOtherTraffic?: boolean;
  copyHandshake?: boolean;
  sponsoredTag?: string;
  listenIpv6?: boolean;
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

export function formatInboundApiError(msg: string, lang: 'en' | 'fa'): string {
  if (lang !== 'fa') return msg;
  const byInbound = /^Port (\d+) is already in use by inbound "([^"]+)"/i.exec(msg);
  if (byInbound) {
    return `پورت ${byInbound[1]} هم‌اکنون توسط اینباند «${byInbound[2]}» در حال استفاده است. لطفاً پورت دیگری انتخاب کنید.`;
  }
  const byService = /^Port (\d+) is already in use by another service on this server/i.exec(msg);
  if (byService) {
    return `پورت ${byService[1]} روی این سرور توسط سرویس دیگری اشغال است. لطفاً پورت دیگری انتخاب کنید یا پورت ${byService[1]} را آزاد کنید.`;
  }
  return msg;
}

export function normalizeKind(raw: string): 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp' | 'smartdns' | 'telegram' {
  const k = (raw || '').toLowerCase();
  if (k === 'openconnect' || k === 'ocserv') return 'ocserv';
  if (k === 'wireguard' || k === 'amneziawg') return 'wireguard';
  if (k === 'ikev2') return 'ikev2';
  if (k === 'l2tp') return 'l2tp';
  if (k === 'smartdns') return 'smartdns';
  if (k === 'telegram' || k === 'mtproxy') return 'telegram';
  return 'openvpn';
}

export function formatKindBadge(kind: string, obfuscation?: string): string {
  const k = kind.toLowerCase();
  if (k === 'xray') return 'Xray';
  if (k === 'smartdns') return 'Smart DNS';
  if (k === 'telegram' || k === 'mtproxy') return 'Telegram proxy';
  if (k === 'amneziawg' || (k === 'wireguard' && obfuscation === 'amnezia')) return 'AmneziaWG';
  if (k === 'ocserv' || k === 'openconnect') return 'OpenConnect';
  if (k === 'ikev2') return 'IKEv2';
  if (k === 'l2tp') return 'L2TP/IPsec';
  if (k === 'wireguard') return 'WireGuard';
  return 'OpenVPN';
}

export function defaultPortForKind(kind: 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp' | 'smartdns' | 'telegram'): number {
  switch (kind) {
    case 'wireguard':
      return 51820;
    case 'ocserv':
    case 'telegram':
      return 443;
    case 'smartdns':
      return 53;
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

export const SMARTDNS_CATEGORIES: Array<{
  id: string;
  labelEn: string;
  labelFa: string;
  defaultEnabled: boolean;
  domains: string[];
}> = [
  {
    id: 'games',
    labelEn: 'Games',
    labelFa: 'بازی‌ها',
    defaultEnabled: true,
    domains: [
      'steampowered.com', 'store.steampowered.com', 'steamcommunity.com', 'steamstatic.com', 'epicgames.com',
      'unrealengine.com', 'riotgames.com', 'leagueoflegends.com', 'valorant.com', 'battle.net', 'blizzard.com',
      'ea.com', 'origin.com', 'ubisoft.com', 'uplay.com', 'playstation.com', 'playstation.net', 'xboxlive.com',
      'xbox.com', 'nintendo.com', 'nintendo.net', 'roblox.com', 'rbxcdn.com', 'minecraft.net', 'mojang.com',
      'rockstargames.com', 'socialclub.rockstargames.com', 'bethesda.net', 'pubg.com', 'krafton.com', 'callofduty.com',
      'activision.com', 'supercell.com', 'clashofclans.com', 'brawlstars.com', 'garena.com', 'hoyoverse.com',
      'genshinimpact.com', 'twitch.tv', 'ttvnw.net', 'discord.com', 'discordapp.com', 'discord.gg', 'curseforge.com',
      'modrinth.com', 'faceit.com', 'esea.net', 'nexusmods.com', 'itch.io', 'gog.com', 'humblebundle.com',
      'paradoxinteractive.com', 'bungie.net', 'warframe.com', 'pathofexile.com', 'escape-from-tarkov.com',
      'escapefromtarkov.com', 'wargaming.net', 'gaijin.net', 'warthunder.com', 'arena.net', 'guildwars2.com',
      'runescape.com', 'jagex.com', 'chess.com', 'lichess.org', 'speedrun.com',
    ],
  },
  {
    id: 'dev',
    labelEn: 'Development',
    labelFa: 'توسعه و برنامه‌نویسی',
    defaultEnabled: true,
    domains: [
      'github.com', 'githubusercontent.com', 'githubassets.com', 'ghcr.io', 'gitlab.com', 'bitbucket.org',
      'npmjs.org', 'registry.npmjs.org', 'yarnpkg.com', 'pypi.org', 'files.pythonhosted.org', 'crates.io',
      'pkg.go.dev', 'proxy.golang.org', 'hub.docker.com', 'registry-1.docker.io', 'docker.com', 'quay.io',
      'gcr.io', 'k8s.io', 'registry.k8s.io', 'terraform.io', 'hashicorp.com', 'releases.hashicorp.com',
      'stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org', 'mozilla.org', 'jetbrains.com',
      'visualstudio.com', 'vscode-cdn.net', 'marketplace.visualstudio.com', 'cursor.sh', 'vercel.com',
      'netlify.com', 'cloudflare.com', 'dash.cloudflare.com', 'digitalocean.com', 'linode.com', 'hetzner.com',
      'vultr.com', 'aws.amazon.com', 'console.aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
      'portal.azure.com', 'gradle.org', 'maven.org', 'repo.maven.apache.org', 'rubygems.org', 'packagist.org',
      'nuget.org', 'brew.sh', 'formulae.brew.sh', 'anaconda.com', 'conda.io', 'nodesource.com', 'nodejs.org',
      'deno.land', 'bun.sh', 'rust-lang.org', 'golang.org', 'php.net', 'python.org',
    ],
  },
  {
    id: 'ai',
    labelEn: 'AI services',
    labelFa: 'سرویس‌های هوش مصنوعی',
    defaultEnabled: true,
    domains: [
      'openai.com', 'chat.openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'platform.openai.com',
      'anthropic.com', 'claude.ai', 'console.anthropic.com', 'gemini.google.com', 'aistudio.google.com',
      'generativelanguage.googleapis.com', 'deepmind.google', 'notebooklm.google.com', 'perplexity.ai',
      'poe.com', 'copilot.microsoft.com', 'huggingface.co', 'hf.co', 'replicate.com', 'midjourney.com',
      'stability.ai', 'dreamstudio.ai', 'runwayml.com', 'elevenlabs.io', 'suno.com', 'suno.ai', 'udio.com',
      'pika.art', 'lumalabs.ai', 'klingai.com', 'groq.com', 'together.ai', 'fireworks.ai', 'openrouter.ai',
      'cohere.com', 'mistral.ai', 'civitai.com', 'kaggle.com',
    ],
  },
  {
    id: 'general',
    labelEn: 'General',
    labelFa: 'عمومی',
    defaultEnabled: true,
    domains: [
      'spotify.com', 'scdn.co', 'netflix.com', 'nflxvideo.net', 'youtube.com', 'googlevideo.com', 'ytimg.com',
      'youtu.be', 'google.com', 'googleapis.com', 'gstatic.com', 'gmail.com', 'drive.google.com',
      'play.google.com', 'apple.com', 'icloud.com', 'itunes.apple.com', 'mzstatic.com', 'paypal.com',
      'stripe.com', 'wise.com', 'coinbase.com', 'binance.com', 'bybit.com', 'okx.com', 'kraken.com',
      'tradingview.com', 'linkedin.com', 'licdn.com', 'medium.com', 'substack.com', 'reddit.com', 'redd.it',
      'x.com', 'twitter.com', 'twimg.com', 'instagram.com', 'threads.net', 'pinterest.com', 'quora.com',
      'notion.so', 'figma.com', 'canva.com',
    ],
  },
  {
    id: 'download',
    labelEn: 'Download servers',
    labelFa: 'سرورهای دانلود',
    defaultEnabled: false,
    domains: [
      'download.microsoft.com', 'update.microsoft.com', 'software-download.microsoft.com', 'swcdn.apple.com',
      'updates.cdn-apple.com', 'archive.ubuntu.com', 'security.ubuntu.com', 'deb.debian.org', 'dl.google.com',
      'ftp.mozilla.org',
    ],
  },
  {
    id: 'broad',
    labelEn: 'Broad (whole companies)',
    labelFa: 'دامنه‌های گسترده (کل شرکت‌ها)',
    defaultEnabled: false,
    domains: [
      'amazonaws.com', 'cloudfront.net', 'fastly.net', 'akamaiedge.net', 'googleusercontent.com', 'azureedge.net',
      'cloudflare.net', 'edgecastcdn.net',
    ],
  },
];

export function buildDefaultSettings(
  kind: 'openvpn' | 'ocserv' | 'wireguard' | 'ikev2' | 'l2tp' | 'smartdns' | 'telegram',
): InboundSettings {
  const networkBase: InboundSettings = {
    dns: ['1.1.1.1', '8.8.8.8'],
    pushRoutes: [],
    redirectGateway: true,
    nat: true,
    clientToClient: false,
    ipv6: false,
    maxClients: 1024,
  };

  switch (kind) {
    case 'wireguard':
      return {
        ...networkBase,
        mtu: 1420,
        keepalive: 25,
        obfuscation: 'off',
        amnezia: randomAmneziaParams(),
      };
    case 'openvpn':
      return {
        ...networkBase,
        blockOutsideDns: true,
        authMode: 'cert',
        tlsMode: 'tls-crypt',
        dataCiphers: ['AES-256-GCM', 'AES-128-GCM', 'CHACHA20-POLY1305'],
        authDigest: 'SHA256',
        tlsMinVersion: '1.2',
        keepaliveInterval: 10,
        keepaliveTimeout: 60,
        renegSec: 3600,
        compression: 'off',
        exitNotify: true,
        verb: 3,
      };
    case 'ocserv':
      return {
        ...networkBase,
        dtls: true,
        ciscoCompat: true,
        camouflage: true,
        camouflageSecret: randomTokenStr(16),
        camouflageRealm: 'Restricted Content',
        certSource: 'pki',
        idleTimeout: 1200,
        mobileIdleTimeout: 2400,
        dpd: 90,
        mobileDpd: 1800,
        cookieTimeout: 300,
        tlsPriorities: 'NORMAL:%SERVER_PRECEDENCE:%COMPAT:-VERS-SSL3.0:-VERS-TLS1.0:-VERS-TLS1.1',
        proxyProtocol: false,
      };
    case 'ikev2':
      return {
        ...networkBase,
        certSource: 'pki',
        ikeProposals: 'aes256gcm16-prfsha384-ecp384,aes256-sha256-modp2048',
        espProposals: 'aes256gcm16,aes256-sha256',
        rekeySeconds: 14400,
        childRekeySeconds: 3600,
        dpdSeconds: 30,
        mobike: true,
        fragmentation: true,
      };
    case 'l2tp':
      return {
        ...networkBase,
        ikeProposals: 'aes256-sha256-modp2048,aes128-sha256-modp2048',
        espProposals: 'aes256-sha256,aes128-sha256',
        pppMtu: 1400,
        pppMru: 1400,
        lcpEchoInterval: 30,
        lcpEchoFailure: 4,
        idleSeconds: 0,
        forceEncap: false,
      };
    case 'smartdns':
      return {
        dnsCategories: SMARTDNS_CATEGORIES.filter((c) => c.defaultEnabled).map((c) => c.id),
        dnsSelectedDomains: Object.fromEntries(SMARTDNS_CATEGORIES.map((c) => [c.id, [...c.domains]])),
        extraDomains: [],
        neverPassDomains: [],
        maxAddressesPerClient: 1,
        upstreams: ['1.1.1.1', '8.8.8.8'],
        smartDnsIpv4: '',
        smartDnsIpv6: '',
        extraTlsPorts: '',
      };
    case 'telegram':
      return {
        maxClients: 10000,
        tgFakeTls: true,
        tgSecure: false,
        tgClassic: false,
        fakeTlsDomain: 'www.cloudflare.com',
        passOtherTraffic: true,
        copyHandshake: true,
        sponsoredTag: '',
        listenIpv6: true,
      };
  }
}
