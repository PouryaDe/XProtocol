import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../config.js';
import { extractAmneziaParams, isAmneziaInbound, type InboundRow } from './configs.js';
import { resolveClientTunnelIp } from '../services/peerResolver.js';

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

function readOptionalFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    // ignore
  }
  return '';
}

function formatTemplateFilename(
  template: unknown,
  vars: { inbound: string; client: string; node: string; kind: string },
  ext: string,
): string {
  const raw = typeof template === 'string' && template.trim() ? template.trim() : '{client}-{inbound}';
  const resolved = raw
    .replace(/\{inbound\}/g, vars.inbound)
    .replace(/\{client\}/g, vars.client)
    .replace(/\{node\}/g, vars.node)
    .replace(/\{kind\}/g, vars.kind)
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${resolved}.${ext}`;
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

  const dnsRaw = Array.isArray(settings.dns)
    ? settings.dns.map((x) => String(x).trim()).filter(Boolean).join(', ')
    : String(settings.dns || '1.1.1.1, 8.8.8.8');
  const amneziaOn = isAmneziaInbound(p.inbound.protocol, settings);
  const mtu = Number(settings.mtu || (amneziaOn ? 1380 : 1420));
  const keepalive = Number(settings.keepalive ?? 25);
  const clientIp = p.fixedIp || resolveClientTunnelIp(p.inbound.id, p.inbound.subnet, p.clientIndex);

  if (p.inbound.protocol === 'wireguard' || p.inbound.protocol === 'amneziawg') {
    const lines = [
      `# ${p.nodeName} — ${p.inbound.name} (${p.clientName})`,
      `[Interface]`,
      `PrivateKey = ${p.wgPrivateKey}`,
      `Address = ${clientIp}/32`,
      `DNS = ${dnsRaw}`,
      `MTU = ${mtu}`,
    ];
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
    lines.push(
      ``,
      `[Peer]`,
      `PublicKey = ${p.inbound.server_public_key || 'SERVER_PUBLIC_KEY'}`,
      `AllowedIPs = 0.0.0.0/0, ::/0`,
      `Endpoint = ${host}:${p.inbound.port}`,
      `PersistentKeepalive = ${keepalive}`,
    );
    const content = lines.join('\n') + '\n';
    const filename = formatTemplateFilename(
      settings.filenameTemplate,
      {
        inbound: p.inbound.name,
        client: p.clientName,
        node: p.nodeName,
        kind: amneziaOn ? 'awg' : 'wg',
      },
      'conf',
    );
    return {
      filename,
      mimeType: 'text/plain; charset=utf-8',
      content,
      connectInfo: {
        endpoint: `${host}:${p.inbound.port}`,
        address: `${clientIp}/32`,
        dns: dnsRaw,
      },
    };
  }

  if (p.inbound.protocol === 'openvpn') {
    const proto = p.inbound.transport.startsWith('tcp') ? 'tcp-client' : 'udp';
    const dataCiphers = Array.isArray(settings.dataCiphers)
      ? (settings.dataCiphers as unknown[]).map((x) => String(x)).join(':')
      : String(settings.cipher || 'AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305');
    const authDigest = String(settings.authDigest || 'SHA256');
    const tlsMode = String(settings.tlsMode || 'tls-crypt');
    const authMode = String(settings.authMode || p.inbound.auth_mode || 'cert');

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
      `data-ciphers ${dataCiphers}`,
      `auth ${authDigest}`,
      `verb 3`,
    ];

    if (authMode === 'cert+pass' || authMode === 'pass' || authMode === 'certificate_password' || authMode === 'password') {
      lines.push(`# Username: ${p.clientName}`, `# Password: ${p.vpnPassword}`, `auth-user-pass`);
    }

    const pkiDir = path.join(getDataDir(), 'pki');
    const safeName = p.clientName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const caPem = readOptionalFile(path.join(pkiDir, 'ca.crt'));
    const clientCert = readOptionalFile(path.join(pkiDir, 'clients', `${safeName}.crt`));
    const clientKey = readOptionalFile(path.join(pkiDir, 'clients', `${safeName}.key`));
    const taKey = readOptionalFile(path.join(pkiDir, 'ta.key'));

    lines.push(`<ca>`);
    lines.push(caPem || `-----BEGIN CERTIFICATE-----\n# CA not yet initialized on this server\n-----END CERTIFICATE-----`);
    lines.push(`</ca>`);

    if (authMode !== 'pass' && authMode !== 'password' && clientCert && clientKey) {
      lines.push(`<cert>`, clientCert, `</cert>`, `<key>`, clientKey, `</key>`);
    }
    if (tlsMode === 'tls-crypt' && taKey) {
      lines.push(`<tls-crypt>`, taKey, `</tls-crypt>`);
    } else if (tlsMode === 'tls-auth' && taKey) {
      lines.push(`key-direction 1`, `<tls-auth>`, taKey, `</tls-auth>`);
    }
    if (settings.clientCustom) {
      lines.push(String(settings.clientCustom).trim());
    }

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

  if (p.inbound.protocol === 'openconnect' || p.inbound.protocol === 'ocserv') {
    const secret = settings.camouflage && settings.camouflageSecret ? `/?${settings.camouflageSecret}` : '';
    return {
      filename: `${p.clientName}-${p.inbound.name}-openconnect.txt`,
      mimeType: 'text/plain; charset=utf-8',
      content: `Server: ${host}:${p.inbound.port}${secret}\nUsername: ${p.clientName}\nPassword: ${p.vpnPassword}\n`,
      uri: `https://${host}:${p.inbound.port}${secret}`,
      connectInfo: {
        server: `${host}:${p.inbound.port}${secret}`,
        username: p.clientName,
        password: p.vpnPassword,
      },
    };
  }

  if (p.inbound.protocol === 'l2tp') {
    return {
      filename: `${p.clientName}-${p.inbound.name}-l2tp.txt`,
      mimeType: 'text/plain; charset=utf-8',
      content: `Protocol: L2TP/IPsec\nServer: ${host}\nPSK: ${String(settings.psk || '')}\nUsername: ${p.clientName}\nPassword: ${p.vpnPassword}\n`,
      connectInfo: {
        server: host,
        psk: String(settings.psk || ''),
        username: p.clientName,
        password: p.vpnPassword,
      },
    };
  }

  return {
    filename: `${p.clientName}-${p.inbound.name}.txt`,
    mimeType: 'text/plain; charset=utf-8',
    content: `Protocol: ${p.inbound.protocol.toUpperCase()}\nServer: ${host}\nPort: ${p.inbound.port}\nRemote ID: ${String(settings.serverId || host)}\nUsername: ${p.clientName}\nPassword: ${p.vpnPassword}\n`,
    connectInfo: {
      server: host,
      port: p.inbound.port,
      username: p.clientName,
      password: p.vpnPassword,
    },
  };
}
