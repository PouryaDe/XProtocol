import type { InboundRow } from './configs.js';

export interface ClientProfileParams {
  clientName: string;
  vpnPassword: string;
  wgPrivateKey: string;
  fixedIp: string;
  clientIndex: number;
  inbound: InboundRow;
  endpointHost: string;
  nodeName: string;
}

function computeClientIp(subnet: string, clientIndex: number, fixedIp: string): string {
  if (fixedIp) return fixedIp;
  const parts = subnet.split('/')[0].split('.');
  const hostOctet = 2 + (clientIndex % 240);
  return `${parts[0]}.${parts[1]}.${parts[2]}.${hostOctet}`;
}

export function generateClientProfile(p: ClientProfileParams): {
  filename: string;
  mimeType: string;
  content: string;
  uri?: string;
  connectInfo: Record<string, string | number>;
} {
  const host = p.inbound.public_address_override || p.endpointHost || '127.0.0.1';
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(p.inbound.settings_json || '{}');
  } catch {
    settings = {};
  }
  const dns = String(settings.dns || '1.1.1.1, 8.8.8.8');
  const mtu = Number(settings.mtu || (p.inbound.protocol === 'amneziawg' ? 1380 : 1420));
  const clientIp = computeClientIp(p.inbound.subnet, p.clientIndex, p.fixedIp);

  if (p.inbound.protocol === 'wireguard' || p.inbound.protocol === 'amneziawg') {
    const lines = [
      `# ${p.nodeName} — ${p.inbound.name} (${p.clientName})`,
      `[Interface]`,
      `PrivateKey = ${p.wgPrivateKey}`,
      `Address = ${clientIp}/32`,
      `DNS = ${dns}`,
      `MTU = ${mtu}`,
    ];
    if (p.inbound.protocol === 'amneziawg') {
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
    lines.push(
      ``,
      `[Peer]`,
      `PublicKey = ${p.inbound.server_public_key || 'SERVER_PUBLIC_KEY'}`,
      `AllowedIPs = 0.0.0.0/0, ::/0`,
      `Endpoint = ${host}:${p.inbound.port}`,
      `PersistentKeepalive = 25`,
    );
    const content = lines.join('\n') + '\n';
    return {
      filename: `${p.clientName}-${p.inbound.name}.conf`,
      mimeType: 'text/plain; charset=utf-8',
      content,
      connectInfo: {
        endpoint: `${host}:${p.inbound.port}`,
        address: `${clientIp}/32`,
        dns,
      },
    };
  }

  if (p.inbound.protocol === 'openvpn') {
    const proto = p.inbound.transport.startsWith('tcp') ? 'tcp-client' : 'udp';
    const cipher = String(settings.cipher || 'AES-256-GCM');
    const lines = [
      `# ${p.nodeName} — ${p.inbound.name} (${p.clientName})`,
      `client`,
      `dev tun`,
      `proto ${proto}`,
      `remote ${host} ${p.inbound.port}`,
      `resolv-retry infinite`,
      `nobind`,
      `persist-key`,
      `persist-tun`,
      `remote-cert-tls server`,
      `cipher ${cipher}`,
      `verb 3`,
    ];
    if (p.inbound.auth_mode === 'certificate_password' || p.inbound.auth_mode === 'password') {
      lines.push(`auth-user-pass`);
    }
    lines.push(
      `<ca>`,
      `-----BEGIN CERTIFICATE-----`,
      `# Server CA managed by Ovira Open-Core`,
      `-----END CERTIFICATE-----`,
      `</ca>`,
    );
    return {
      filename: `${p.clientName}-${p.inbound.name}.ovpn`,
      mimeType: 'application/x-openvpn-profile',
      content: lines.join('\n') + '\n',
      connectInfo: {
        server: `${host}:${p.inbound.port}`,
        username: p.clientName,
        password: p.vpnPassword,
      },
    };
  }

  if (p.inbound.protocol === 'openconnect') {
    return {
      filename: `${p.clientName}-${p.inbound.name}-openconnect.txt`,
      mimeType: 'text/plain; charset=utf-8',
      content: `Server: ${host}:${p.inbound.port}\nUsername: ${p.clientName}\nPassword: ${p.vpnPassword}\n`,
      uri: `https://${host}:${p.inbound.port}`,
      connectInfo: {
        server: `${host}:${p.inbound.port}`,
        username: p.clientName,
        password: p.vpnPassword,
      },
    };
  }

  return {
    filename: `${p.clientName}-${p.inbound.name}.txt`,
    mimeType: 'text/plain; charset=utf-8',
    content: `Protocol: ${p.inbound.protocol.toUpperCase()}\nServer: ${host}\nPort: ${p.inbound.port}\nUsername: ${p.clientName}\nPassword: ${p.vpnPassword}\n`,
    connectInfo: {
      server: host,
      port: p.inbound.port,
      username: p.clientName,
      password: p.vpnPassword,
    },
  };
}
