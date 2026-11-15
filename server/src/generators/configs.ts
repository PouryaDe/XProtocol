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
  tunnelIp: string;
}

export function renderInboundServerConfig(inbound: InboundRow, peers: PeerEntry[]): { path: string; content: string } {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(inbound.settings_json || '{}');
  } catch {
    settings = {};
  }

  const dns = String(settings.dns || '1.1.1.1, 8.8.8.8');
  const mtu = Number(settings.mtu || (inbound.protocol === 'amneziawg' ? 1380 : 1420));

  switch (inbound.protocol) {
    case 'wireguard':
    case 'amneziawg': {
      const baseNet = inbound.subnet.split('/')[0].split('.').slice(0, 3).join('.');
      const lines = [
        `# Managed by Ovira Open-Core (${inbound.name})`,
        `[Interface]`,
        `Address = ${baseNet}.1/24`,
        `ListenPort = ${inbound.port}`,
        `PrivateKey = ${inbound.server_private_key || '<server-private-key>'}`,
        `MTU = ${mtu}`,
      ];
      if (inbound.protocol === 'amneziawg') {
        lines.push(
          `Jc = ${Number(settings.jc ?? 4)}`,
          `Jmin = ${Number(settings.jmin ?? 40)}`,
          `Jmax = ${Number(settings.jmax ?? 70)}`,
          `S1 = ${Number(settings.s1 ?? 0)}`,
          `S2 = ${Number(settings.s2 ?? 0)}`,
          `H1 = ${Number(settings.h1 ?? 1)}`,
          `H2 = ${Number(settings.h2 ?? 2)}`,
          `H3 = ${Number(settings.h3 ?? 3)}`,
          `H4 = ${Number(settings.h4 ?? 4)}`,
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
      return {
        path: `/etc/wireguard/${inbound.name}.conf`,
        content: lines.join('\n') + '\n',
      };
    }

    case 'openvpn': {
      const [netIp] = inbound.subnet.split('/');
      const cipher = String(settings.cipher || 'AES-256-GCM');
      const proto = inbound.transport.startsWith('tcp') ? 'tcp-server' : 'udp';
      return {
        path: `/etc/openvpn/server/${inbound.name}.conf`,
        content: [
          `# Managed by Ovira Open-Core (${inbound.name})`,
          `port ${inbound.port}`,
          `proto ${proto}`,
          `dev tun-${inbound.name}`,
          `topology subnet`,
          `server ${netIp} 255.255.255.0`,
          `ca /var/lib/ovira/pki/ca.crt`,
          `cert /var/lib/ovira/pki/server.crt`,
          `key /var/lib/ovira/pki/server.key`,
          `dh none`,
          `cipher ${cipher}`,
          `data-ciphers ${cipher}:CHACHA20-POLY1305`,
          `push "redirect-gateway def1 bypass-dhcp"`,
          `push "dhcp-option DNS ${dns.split(',')[0].trim()}"`,
          `keepalive 10 60`,
          `persist-key`,
          `persist-tun`,
          `status /var/run/ovira-${inbound.name}.status 5`,
          `verb 3`,
          inbound.auth_mode === 'certificate_password' ? `verify-client-cert require` : `# certificate auth`,
        ].join('\n') + '\n',
      };
    }

    case 'openconnect': {
      return {
        path: `/etc/ocserv/${inbound.name}.conf`,
        content: [
          `# Managed by Ovira Open-Core (${inbound.name})`,
          `auth = "plain[passwd=/etc/ocserv/${inbound.name}.passwd]"`,
          `tcp-port = ${inbound.port}`,
          `udp-port = ${inbound.port}`,
          `run-as-user = ocserv`,
          `server-cert = /var/lib/ovira/certs/cert-${inbound.cert_id || 'default'}.pem`,
          `server-key = /var/lib/ovira/certs/key-${inbound.cert_id || 'default'}.pem`,
          `ipv4-network = ${inbound.subnet}`,
          `dns = ${dns.split(',')[0].trim()}`,
          `try-mtu-discovery = true`,
          `dtls-legacy = true`,
          `max-same-clients = 10`,
        ].join('\n') + '\n',
      };
    }

    case 'ikev2': {
      return {
        path: `/etc/swanctl/conf.d/${inbound.name}.conf`,
        content: [
          `# Managed by Ovira Open-Core (${inbound.name})`,
          `connections {`,
          `  ${inbound.name} {`,
          `    version = 2`,
          `    pools = pool-${inbound.name}`,
          `    local {`,
          `      auth = pubkey`,
          `      certs = cert-${inbound.cert_id || 'default'}.pem`,
          `    }`,
          `    remote {`,
          `      auth = eap-mschapv2`,
          `      eap_id = %any`,
          `    }`,
          `    children {`,
          `      net { local_ts = 0.0.0.0/0 }`,
          `    }`,
          `  }`,
          `}`,
          `pools {`,
          `  pool-${inbound.name} {`,
          `    addrs = ${inbound.subnet}`,
          `    dns = ${dns}`,
          `  }`,
          `}`,
        ].join('\n') + '\n',
      };
    }

    default: {
      return {
        path: `/etc/xl2tpd/${inbound.name}.conf`,
        content: [
          `# Managed by Ovira Open-Core (${inbound.name})`,
          `[global]`,
          `port = ${inbound.port}`,
          `[lns default]`,
          `ip range = ${inbound.subnet}`,
          `require chap = yes`,
          `refuse pap = yes`,
          `pppoptfile = /etc/ppp/options.xl2tpd.${inbound.name}`,
        ].join('\n') + '\n',
      };
    }
  }
}

export interface RoutingRule {
  id: string;
  geosite?: string[];
  geoip?: string[];
  domains?: string[];
  ips?: string[];
  ports?: string;
  inboundNames?: string[];
  action: 'outbound' | 'direct' | 'block';
  outboundTag?: string;
}

export function renderXrayRoutingConfig(params: {
  outbounds: { id: number; name: string; type: string; config_json: string }[];
  defaultAction: 'direct' | 'outbound';
  defaultOutboundName?: string;
  rules: RoutingRule[];
}): string {
  const xrayOutbounds: Record<string, unknown>[] = [];
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
    // Always keep DNS and private networks direct
    { type: 'field', port: '53', outboundTag: 'direct' },
    { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
  ];

  for (const r of params.rules) {
    const entry: Record<string, unknown> = { type: 'field' };
    const domains: string[] = [...(r.domains || []), ...(r.geosite || [])];
    const ips: string[] = [...(r.ips || []), ...(r.geoip || [])];
    if (domains.length > 0) entry.domain = domains;
    if (ips.length > 0) entry.ip = ips;
    if (r.ports) entry.port = r.ports;
    if (r.inboundNames && r.inboundNames.length > 0) entry.inboundTag = r.inboundNames;
    entry.outboundTag =
      r.action === 'block'
        ? 'block'
        : r.action === 'outbound' && r.outboundTag
          ? `out-${r.outboundTag}`
          : 'direct';
    xrayRules.push(entry);
  }

  if (params.defaultAction === 'outbound' && params.defaultOutboundName) {
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
