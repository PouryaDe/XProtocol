import path from 'node:path';
import { getDataDir } from '../config.js';
import { intToIp, parseCidr } from '../services/peerResolver.js';

export interface InboundRow {
  id: number;
  node_id: number | null;
  protocol: string;
  name: string;
  transport: string;
  port: number;
  subnet: string;
  auth_mode: string;
  description: string;
  public_address_override: string;
  enabled: number;
  running: number;
  cert_id: number | null;
  server_public_key: string;
  server_private_key: string;
  settings_json: string;
}

export interface PeerEntry {
  clientId: number;
  name: string;
  wgPublicKey: string;
  vpnPassword?: string;
  tunnelIp: string;
  downloadMbps?: number | null;
  uploadMbps?: number | null;
}

export interface RenderedConfigFile {
  path: string;
  content: string;
  mode?: number;
}

export function isAmneziaInbound(protocol: string, settings: Record<string, unknown>): boolean {
  return protocol === 'amneziawg' || (protocol === 'wireguard' && settings.obfuscation === 'amnezia');
}

export function extractAmneziaParams(settings: Record<string, unknown>): {
  Jc: number;
  Jmin: number;
  Jmax: number;
  S1: number;
  S2: number;
  H1: number;
  H2: number;
  H3: number;
  H4: number;
} {
  const nested = (settings.amnezia && typeof settings.amnezia === 'object' ? settings.amnezia : {}) as Record<
    string,
    unknown
  >;
  return {
    Jc: Number(nested.Jc ?? settings.jc ?? 4),
    Jmin: Number(nested.Jmin ?? settings.jmin ?? 40),
    Jmax: Number(nested.Jmax ?? settings.jmax ?? 70),
    S1: Number(nested.S1 ?? settings.s1 ?? 0),
    S2: Number(nested.S2 ?? settings.s2 ?? 0),
    H1: Number(nested.H1 ?? settings.h1 ?? 1),
    H2: Number(nested.H2 ?? settings.h2 ?? 2),
    H3: Number(nested.H3 ?? settings.h3 ?? 3),
    H4: Number(nested.H4 ?? settings.h4 ?? 4),
  };
}

function sanitizeLine(raw: unknown): string {
  return String(raw ?? '').replace(/[\r\n\0]+/g, ' ').trim();
}

function escapeQuoted(raw: unknown): string {
  return sanitizeLine(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseListSetting(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) {
    const items = raw.map((x) => sanitizeLine(x)).filter(Boolean);
    return items.length > 0 ? items : fallback;
  }
  if (typeof raw === 'string') {
    const items = raw
      .split(/[\n,]+/)
      .map((x) => sanitizeLine(x))
      .filter(Boolean);
    return items.length > 0 ? items : fallback;
  }
  return fallback;
}

/** Render the protocol daemon configuration path and contents for a given inbound and eligible peers. */
export function renderInboundServerConfig(inbound: InboundRow, peers: PeerEntry[]): { path: string; content: string } {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(inbound.settings_json || '{}');
  } catch {
    settings = {};
  }

  const dataDir = getDataDir();
  const cidr = parseCidr(inbound.subnet);
  const dnsList = parseListSetting(settings.dns, ['1.1.1.1', '8.8.8.8']);
  const amneziaOn = isAmneziaInbound(inbound.protocol, settings);
  const mtu = Number(settings.mtu || (amneziaOn ? 1380 : 1420));

  switch (inbound.protocol) {
    case 'wireguard':
    case 'amneziawg': {
      const natOn = settings.nat !== false;
      const lines = [
        `# Managed by XProtocol Open-Core (${inbound.name})`,
        `[Interface]`,
        `Address = ${cidr.gatewayIp}/${cidr.prefix}`,
        `ListenPort = ${inbound.port}`,
        `PrivateKey = ${inbound.server_private_key || '<server-private-key>'}`,
        `MTU = ${mtu}`,
      ];
      if (natOn) {
        const netCidr = `${cidr.networkIp}/${cidr.prefix}`;
        lines.push(
          `PostUp = iptables -C FORWARD -i %i -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -i %i -j ACCEPT; iptables -C FORWARD -o %i -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -o %i -j ACCEPT; iptables -t nat -C POSTROUTING -s ${netCidr} ! -o %i -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s ${netCidr} ! -o %i -j MASQUERADE; iptables -t mangle -C FORWARD -s ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240 2>/dev/null || iptables -t mangle -I FORWARD 1 -s ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240; iptables -t mangle -C FORWARD -d ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240 2>/dev/null || iptables -t mangle -I FORWARD 1 -d ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240`,
          `PostDown = iptables -D FORWARD -i %i -j ACCEPT 2>/dev/null || true; iptables -D FORWARD -o %i -j ACCEPT 2>/dev/null || true; iptables -t nat -D POSTROUTING -s ${netCidr} ! -o %i -j MASQUERADE 2>/dev/null || true; iptables -t mangle -D FORWARD -s ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240 2>/dev/null || true; iptables -t mangle -D FORWARD -d ${netCidr} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1240 2>/dev/null || true`,
        );
      }
      if (amneziaOn) {
        const awg = extractAmneziaParams(settings);
        lines.push(
          `Jc = ${awg.Jc}`,
          `Jmin = ${awg.Jmin}`,
          `Jmax = ${awg.Jmax}`,
          `S1 = ${awg.S1}`,
          `S2 = ${awg.S2}`,
          `H1 = ${awg.H1}`,
          `H2 = ${awg.H2}`,
          `H3 = ${awg.H3}`,
          `H4 = ${awg.H4}`,
        );
      }
      for (const p of peers) {
        lines.push(
          ``,
          `# ${p.name}`,
          `[Peer]`,
          `PublicKey = ${p.wgPublicKey}`,
          `AllowedIPs = ${p.tunnelIp}/32`,
        );
      }
      const confDir = amneziaOn ? '/etc/amnezia/amneziawg' : '/etc/wireguard';
      return {
        path: `${confDir}/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }

    case 'openvpn': {
      const pkiDir = path.join(dataDir, 'pki');
      const safeName = inbound.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const authScript = path.join(dataDir, 'bin', `ovpn-auth-${safeName}.mjs`);
      const proto = inbound.transport.startsWith('tcp') ? 'tcp-server' : 'udp';
      const dataCiphers = parseListSetting(settings.dataCiphers, [
        sanitizeLine(settings.cipher || 'AES-256-GCM'),
        'AES-128-GCM',
        'CHACHA20-POLY1305',
      ]);
      const fallbackCipher = sanitizeLine(settings.fallbackCipher || 'AES-256-CBC');
      const authDigest = sanitizeLine(settings.authDigest || 'SHA256');
      const tlsMin = sanitizeLine(settings.tlsMinVersion || '1.2');
      const tlsMode = String(settings.tlsMode || 'tls-crypt');
      const authMode = String(settings.authMode || inbound.auth_mode || 'cert');
      const keepInterval = Number(settings.keepaliveInterval ?? 5);
      const keepTimeout = Number(settings.keepaliveTimeout ?? 20);
      const tunMtu = Number(settings.tunMtu ?? 1350);
      const mssFix = Number(settings.mssFix ?? 1350);
      const maxClients = Number(settings.maxClients ?? 100);
      const renegSec = Number(settings.renegSec ?? 3600);
      const verb = Number(settings.verb ?? 3);

      const lines = [
        `# Managed by XProtocol Open-Core (${inbound.name})`,
        `port ${inbound.port}`,
        `proto ${proto}`,
        `dev tun-${inbound.name}`,
        `topology subnet`,
        `server ${cidr.networkIp} ${cidr.netmask}`,
        `ca ${pkiDir}/ca.crt`,
        `cert ${pkiDir}/server.crt`,
        `key ${pkiDir}/server.key`,
        `dh none`,
        `data-ciphers ${dataCiphers.join(':')}`,
        `data-ciphers-fallback ${fallbackCipher}`,
        `auth ${authDigest}`,
        `tls-version-min ${tlsMin}`,
      ];

      if (tlsMode === 'tls-crypt') {
        lines.push(`tls-crypt ${pkiDir}/ta.key`);
      } else if (tlsMode === 'tls-auth') {
        lines.push(`tls-auth ${pkiDir}/ta.key 0`);
      }

      if (settings.redirectGateway !== false) {
        lines.push(`push "redirect-gateway def1 bypass-dhcp"`);
      }
      for (const d of dnsList) {
        lines.push(`push "dhcp-option DNS ${d}"`);
      }
      if (settings.blockOutsideDns !== false) {
        lines.push(`push "block-outside-dns"`);
      }
      if (!settings.ipv6) {
        lines.push(`push "block-ipv6"`);
      }
      if (settings.clientToClient) {
        lines.push(`client-to-client`);
      }
      for (const route of parseListSetting(settings.pushRoutes, [])) {
        lines.push(`push "route ${route}"`);
      }

      lines.push(
        `keepalive ${keepInterval} ${keepTimeout}`,
        `tun-mtu ${tunMtu}`,
        ...(proto === 'udp' && mssFix > 0 ? [`mssfix ${mssFix}`] : []),
        `sndbuf 524288`,
        `rcvbuf 524288`,
        `max-clients ${maxClients}`,
        `reneg-sec ${renegSec}`,
        `persist-key`,
        `persist-tun`,
        `management /var/run/xprotocol-${inbound.name}.sock unix`,
        `status /var/run/xprotocol-${inbound.name}.status 5`,
        `status-version 3`,
        `verb ${verb}`,
      );

      if (proto === 'tcp-server') {
        lines.push(`tcp-nodelay`);
      }
      if (proto === 'udp' && settings.exitNotify !== false) {
        lines.push(`explicit-exit-notify 1`);
      }
      if (proto === 'tcp-server' && settings.portShare) {
        lines.push(`port-share ${sanitizeLine(settings.portShare)}`);
      }

      if (authMode === 'pass' || authMode === 'password') {
        lines.push(
          `duplicate-cn`,
          `verify-client-cert none`,
          `username-as-common-name`,
          `script-security 2`,
          `auth-user-pass-verify ${authScript} via-file`,
        );
      } else if (authMode === 'cert+pass' || authMode === 'certificate_password') {
        lines.push(
          `duplicate-cn`,
          `script-security 2`,
          `auth-user-pass-verify ${authScript} via-file`,
        );
      }

      if (settings.serverCustom) {
        lines.push(`# Custom server directives`, String(settings.serverCustom).trim());
      }

      return {
        path: `/etc/openvpn/server/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }

    case 'openconnect':
    case 'ocserv': {
      const certsDir = path.join(dataDir, 'certs');
      const certTag = inbound.cert_id ? String(inbound.cert_id) : 'default';
      const lines = [
        `# Managed by XProtocol Open-Core (${inbound.name})`,
        `auth = "plain[passwd=/etc/ocserv/${inbound.name}.passwd]"`,
        `tcp-port = ${inbound.port}`,
        ...(settings.dtls !== false ? [`udp-port = ${inbound.port}`] : []),
        `run-as-user = nobody`,
        `run-as-group = nogroup`,
        `isolate-workers = false`,
        `device = vc${inbound.id}-`,
        `socket-file = /var/run/ocserv-${inbound.name}.socket`,
        `occtl-socket-file = /var/run/occtl-${inbound.name}.sock`,
        `server-cert = ${certsDir}/cert-${certTag}.pem`,
        `server-key = ${certsDir}/key-${certTag}.pem`,
        `ipv4-network = ${cidr.networkIp}`,
        `ipv4-netmask = ${cidr.netmask}`,
        `dns = ${dnsList[0] || '1.1.1.1'}`,
        ...(dnsList[1] ? [`dns = ${dnsList[1]}`] : []),
        `try-mtu-discovery = false`,
        `mtu = ${Number(settings.mtu ?? 1420)}`,
        `cisco-client-compat = ${settings.ciscoCompat !== false ? 'true' : 'false'}`,
        `dtls-legacy = true`,
        `keepalive = ${Number(settings.keepalive ?? 10)}`,
        `idle-timeout = ${Number(settings.idleTimeout ?? 1200)}`,
        `dpd = ${Number(settings.dpd ?? 30)}`,
        `mobile-dpd = ${Number(settings.mobileDpd ?? 30)}`,
        `switch-to-tcp-timeout = 25`,
        `auth-timeout = 240`,
        `stats-report-time = 60`,
        `cookie-timeout = ${Number(settings.cookieTimeout ?? 300)}`,
        `tls-priorities = "${escapeQuoted(settings.tlsPriorities || 'NORMAL:%SERVER_PRECEDENCE:%COMPAT:-VERS-SSL3.0')}"`,
        `max-clients = 0`,
        `max-same-clients = 0`,
        `max-ban-score = 0`,
        `ban-reset-time = 60`,
      ];
      if (settings.redirectGateway !== false) {
        lines.push(`route = default`);
      }
      if (settings.proxyProtocol) {
        lines.push(`listen-proxy-proto = true`);
      }
      if (settings.camouflage && settings.camouflageSecret) {
        lines.push(
          `camouflage = true`,
          `camouflage_secret = "${escapeQuoted(settings.camouflageSecret)}"`,
          `camouflage_realm = "${escapeQuoted(settings.camouflageRealm || 'Login')}"`,
        );
      }
      if (settings.ocCustom) {
        lines.push(String(settings.ocCustom).trim());
      }
      return {
        path: `/etc/ocserv/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }

    case 'ikev2': {
      const certTag = inbound.cert_id ? String(inbound.cert_id) : 'default';
      const serverId = sanitizeLine(settings.serverId || '');
      const ikeProps = sanitizeLine(settings.ikeProposals || 'aes256-sha256-modp2048,aes128-sha256-modp2048');
      const espProps = sanitizeLine(settings.espProposals || 'aes256-sha256,aes128-sha256');
      const lines = [
        `# Managed by XProtocol Open-Core (${inbound.name})`,
        `connections {`,
        `  ${inbound.name} {`,
        `    version = 2`,
        `    pools = pool-${inbound.name}`,
        `    proposals = ${ikeProps}`,
        `    rekey_time = ${Number(settings.rekeySeconds ?? 10800)}s`,
        `    dpd_delay = ${Number(settings.dpdSeconds ?? 30)}s`,
        `    send_certreq = no`,
        `    encap = yes`,
        `    mobike = ${settings.mobike !== false ? 'yes' : 'no'}`,
        `    fragmentation = ${settings.fragmentation !== false ? 'yes' : 'no'}`,
        `    local {`,
        `      auth = pubkey`,
        `      certs = xprotocol-${certTag}.pem`,
        ...(serverId ? [`      id = ${serverId}`] : []),
        `    }`,
        `    remote {`,
        `      auth = eap-mschapv2`,
        `      eap_id = %any`,
        `    }`,
        `    children {`,
        `      net {`,
        `        local_ts = 0.0.0.0/0`,
        `        esp_proposals = ${espProps}`,
        `        rekey_time = ${Number(settings.childRekeySeconds ?? 3600)}s`,
        `      }`,
        `    }`,
        `  }`,
        `}`,
        `pools {`,
        `  pool-${inbound.name} {`,
        `    addrs = ${inbound.subnet}`,
        `    dns = ${dnsList.join(', ')}`,
        `  }`,
        `}`,
        `secrets {`,
      ];
      for (const p of peers) {
        lines.push(
          `  eap-${inbound.name}-${p.clientId} {`,
          `    id = "${escapeQuoted(p.name)}"`,
          `    secret = "${escapeQuoted(p.vpnPassword || '')}"`,
          `  }`,
        );
      }
      lines.push(`}`);
      return {
        path: `/etc/swanctl/conf.d/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }

    default: {
      const rangeStart = intToIp((cidr.baseInt + 2) >>> 0);
      const rangeEnd = intToIp(Math.max(cidr.baseInt + 2, cidr.broadcastInt - 2) >>> 0);
      const lines = [
        `# Managed by XProtocol Open-Core (${inbound.name})`,
        `[global]`,
        `port = ${inbound.port || 1701}`,
        ...(settings.kernelMode ? [] : [`force userspace = yes`]),
        `[lns default]`,
        `ip range = ${rangeStart}-${rangeEnd}`,
        `local ip = ${cidr.gatewayIp}`,
        ...(settings.strictMschapV2 ? [`require chap = yes`, `refuse pap = yes`] : []),
        `require authentication = yes`,
        `name = xprotocol-l2tp`,
        `pppoptfile = /etc/ppp/options.xl2tpd.${inbound.name}`,
        `length bit = yes`,
      ];
      return {
        path: `/etc/xl2tpd/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }
  }
}

export function renderInboundExtraFiles(inbound: InboundRow, peers: PeerEntry[]): RenderedConfigFile[] {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(inbound.settings_json || '{}');
  } catch {
    settings = {};
  }
  const dnsList = parseListSetting(settings.dns, ['1.1.1.1', '8.8.8.8']);
  const files: RenderedConfigFile[] = [];

  if (inbound.protocol === 'l2tp') {
    const mtu = Number(settings.pppMtu ?? 1280);
    const mru = Number(settings.pppMru ?? 1280);
    const lcpInt = Number(settings.lcpEchoInterval ?? 10);
    const lcpFail = Number(settings.lcpEchoFailure ?? 6);
    const idleSec = Number(settings.idleSeconds ?? 0);
    const pppLines = [
      `ipcp-accept-local`,
      `ipcp-accept-remote`,
      `noccp`,
      `noipv6`,
      `auth`,
      `refuse-eap`,
      ...(settings.strictMschapV2 ? [`require-mschap-v2`] : []),
      `mtu ${mtu}`,
      `mru ${mru}`,
      `lcp-echo-interval ${lcpInt}`,
      `lcp-echo-failure ${lcpFail}`,
      ...(idleSec > 0 ? [`idle ${idleSec}`] : []),
      ...dnsList.map((d) => `ms-dns ${d}`),
      `nodefaultroute`,
      `proxyarp`,
      `connect-delay 5000`,
      `ipparam ${sanitizeLine(inbound.name)}`,
    ];
    files.push({
      path: `/etc/ppp/options.xl2tpd.${inbound.name}`,
      content: pppLines.join('\n') + '\n',
      mode: 0o644,
    });

    const psk = escapeQuoted(settings.psk || 'xprotocol-l2tp-psk');
    const ikeProps = sanitizeLine(
      settings.ikeProposals ||
        'aes256-sha1-modp2048,aes128-sha1-modp2048,aes256-sha256-modp2048,aes256-sha1-modp1024,aes128-sha1-modp1024,3des-sha1-modp1024',
    );
    const espProps = sanitizeLine(settings.espProposals || 'aes256-sha1,aes128-sha1,aes256-sha256,aes128-sha256,3des-sha1');
    files.push({
      path: `/etc/swanctl/conf.d/l2tp-${inbound.name}.conf`,
      content: [
        `# L2TP/IPsec PSK transport (${inbound.name})`,
        `connections {`,
        `  l2tp-${inbound.name} {`,
        `    version = 1`,
        `    local_addrs = %any`,
        `    remote_addrs = %any`,
        `    proposals = ${ikeProps}`,
        `    fragmentation = yes`,
        `    dpd_delay = 30s`,
        `    unique = no`,
        `    encap = ${settings.forceEncap !== false ? 'yes' : 'no'}`,
        `    local { auth = psk }`,
        `    remote { auth = psk }`,
        `    children {`,
        `      l2tp {`,
        `        mode = transport`,
        `        local_ts = dynamic[udp/1701]`,
        `        remote_ts = dynamic[udp]`,
        `        esp_proposals = ${espProps}`,
        `        rekey_time = 1h`,
        `        dpd_action = clear`,
        `      }`,
        `    }`,
        `  }`,
        `}`,
        `secrets {`,
        `  ike-l2tp-${inbound.name} { secret = "${psk}" }`,
        `}`,
      ].join('\n') + '\n',
      mode: 0o600,
    });
  }

  void peers;
  return files;
}

export interface RoutingRule {
  id: string;
  enabled?: boolean;
  geosite?: string[];
  geoip?: string[];
  domains?: string[];
  ips?: string[];
  ports?: string;
  inboundIds?: number[];
  inboundNames?: string[];
  action: 'outbound' | 'direct' | 'block';
  outboundId?: number;
  outboundTag?: string;
}

export interface InboundRouteOverride {
  inbound: number;
  action: { type: 'none' | 'direct' | 'block' | 'outbound'; outboundId?: number };
}

export function renderXrayRoutingConfig(params: {
  outbounds: { id: number; name: string; type: string; config_json: string }[];
  defaultAction: 'direct' | 'outbound' | 'block';
  defaultOutboundName?: string;
  rules: RoutingRule[];
  inboundRoutes?: InboundRouteOverride[];
  inboundNamesById?: Record<number, string>;
}): string {
  const xrayOutbounds: Record<string, unknown>[] = [];
  const obById = new Map(params.outbounds.map((o) => [o.id, o]));
  for (const ob of params.outbounds) {
    try {
      const cfg = JSON.parse(ob.config_json);
      xrayOutbounds.push({ tag: `out-${ob.name}`, protocol: ob.type, ...cfg });
    } catch {
      xrayOutbounds.push({ tag: `out-${ob.name}`, protocol: ob.type });
    }
  }
  xrayOutbounds.push({ tag: 'direct', protocol: 'freedom' });
  xrayOutbounds.push({ tag: 'block', protocol: 'blackhole' });

  const xrayRules: Record<string, unknown>[] = [
    { type: 'field', port: '53', outboundTag: 'direct' },
    { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
  ];

  const resolveInboundTags = (r: RoutingRule): string[] => {
    const names = [...(r.inboundNames || [])];
    if (r.inboundIds && params.inboundNamesById) {
      for (const id of r.inboundIds) {
        const mapped = params.inboundNamesById[id];
        if (mapped && !names.includes(mapped)) names.push(mapped);
      }
    }
    return names;
  };

  for (const r of params.rules) {
    if (r.enabled === false) continue;
    const entry: Record<string, unknown> = { type: 'field' };
    const domains: string[] = [...(r.domains || []), ...(r.geosite || [])];
    const ips: string[] = [...(r.ips || []), ...(r.geoip || [])];
    if (domains.length > 0) entry.domain = domains;
    if (ips.length > 0) entry.ip = ips;
    if (r.ports) entry.port = r.ports;
    const inboundTags = resolveInboundTags(r);
    if (inboundTags.length > 0) entry.inboundTag = inboundTags;
    const obName = r.outboundTag || (r.outboundId ? obById.get(r.outboundId)?.name : undefined);
    entry.outboundTag =
      r.action === 'block'
        ? 'block'
        : r.action === 'outbound' && obName
          ? `out-${obName}`
          : 'direct';
    xrayRules.push(entry);
  }

  for (const ir of params.inboundRoutes || []) {
    if (ir.action.type === 'none') continue;
    const tagName = params.inboundNamesById?.[ir.inbound];
    if (!tagName) continue;
    const obName = ir.action.outboundId ? obById.get(ir.action.outboundId)?.name : undefined;
    const outboundTag =
      ir.action.type === 'block'
        ? 'block'
        : ir.action.type === 'outbound' && obName
          ? `out-${obName}`
          : 'direct';
    xrayRules.push({ type: 'field', inboundTag: [tagName], network: 'tcp,udp', outboundTag });
  }

  if (params.defaultAction === 'block') {
    xrayRules.push({ type: 'field', network: 'tcp,udp', outboundTag: 'block' });
  } else if (params.defaultAction === 'outbound' && params.defaultOutboundName) {
    xrayRules.push({ type: 'field', network: 'tcp,udp', outboundTag: `out-${params.defaultOutboundName}` });
  }

  return JSON.stringify(
    {
      log: { loglevel: 'warning' },
      routing: {
        domainStrategy: 'IPIfNonMatch',
        rules: xrayRules,
      },
      outbounds: xrayOutbounds,
    },
    null,
    2,
  );
}
