import { Router } from 'express';
import {
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_SUB_SETTINGS,
  getDb,
  getSetting,
} from '../db/database.js';
import { computeClientState } from './context.js';
import { resolveClientInbounds } from './clientRoutes.js';
import { generateClientProfile } from '../generators/profiles.js';
import { ensureClientCertificate, ensureOpenVpnPki } from '../drivers/pki.js';

const DEFAULT_APPS: Record<string, { android: { name: string; url: string }[]; ios: { name: string; url: string }[]; desktop: { name: string; url: string }[] }> = {
  wireguard: {
    android: [{ name: 'WireGuard', url: 'https://play.google.com/store/apps/details?id=com.wireguard.android' }],
    ios: [{ name: 'WireGuard', url: 'https://apps.apple.com/app/wireguard/id1441195209' }],
    desktop: [{ name: 'WireGuard Official', url: 'https://www.wireguard.com/install/' }],
  },
  amneziawg: {
    android: [{ name: 'AmneziaVPN', url: 'https://play.google.com/store/apps/details?id=org.amnezia.vpn' }],
    ios: [{ name: 'AmneziaVPN', url: 'https://apps.apple.com/app/amneziavpn/id1600529900' }],
    desktop: [{ name: 'AmneziaVPN', url: 'https://amnezia.org/downloads' }],
  },
  openvpn: {
    android: [{ name: 'OpenVPN Connect', url: 'https://play.google.com/store/apps/details?id=net.openvpn.openvpn' }],
    ios: [{ name: 'OpenVPN Connect', url: 'https://apps.apple.com/app/openvpn-connect/id590379981' }],
    desktop: [{ name: 'OpenVPN Connect', url: 'https://openvpn.net/client/' }],
  },
  openconnect: {
    android: [{ name: 'OpenConnect', url: 'https://play.google.com/store/apps/details?id=app.openconnect' }],
    ios: [{ name: 'Cisco Secure Client', url: 'https://apps.apple.com/app/cisco-secure-client/id1135064690' }],
    desktop: [{ name: 'OpenConnect GUI', url: 'https://openconnect.github.io/openconnect-gui/' }],
  },
  ikev2: {
    android: [{ name: 'strongSwan VPN Client', url: 'https://play.google.com/store/apps/details?id=org.strongswan.android' }],
    ios: [{ name: 'Built-in iOS VPN', url: 'https://support.apple.com' }],
    desktop: [{ name: 'Built-in OS VPN', url: 'https://www.strongswan.org/' }],
  },
  l2tp: {
    android: [{ name: 'Built-in VPN / OpenVPN', url: 'https://openvpn.net/client/' }],
    ios: [{ name: 'Built-in iOS VPN', url: 'https://support.apple.com' }],
    desktop: [{ name: 'Built-in OS VPN', url: 'https://support.microsoft.com' }],
  },
};

export function createSubRouter(): Router {
  const router = Router();

  router.get('/:token/data', async (req, res) => {
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE sub_token = ?').get(req.params.token) as
      | Record<string, unknown>
      | undefined;
    if (!client) {
      res.status(404).json({ error: 'This link is not valid. Ask for a new one.' });
      return;
    }

    const clientId = Number(client.id);
    const liveCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM connections_live WHERE client_id = ?').get(clientId) as { cnt: number }
    ).cnt;
    const state = computeClientState(
      {
        enabled: Number(client.enabled),
        traffic_limit_bytes: client.traffic_limit_bytes === null ? null : Number(client.traffic_limit_bytes),
        traffic_used_bytes: Number(client.traffic_used_bytes),
        expires_at: client.expires_at ? String(client.expires_at) : null,
        first_connect_days: client.first_connect_days === null ? null : Number(client.first_connect_days),
        first_connected_at: client.first_connected_at ? String(client.first_connected_at) : null,
      },
      liveCount,
    );

    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const subSettings = getSetting('subscription_page', DEFAULT_SUB_SETTINGS);
    const assignedInbounds = resolveClientInbounds(clientId);

    if (assignedInbounds.some((ib) => ib.protocol === 'openvpn')) {
      await ensureOpenVpnPki().catch(() => undefined);
      await ensureClientCertificate(String(client.name)).catch(() => null);
    }

    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const profiles = assignedInbounds.map((ib) => {
      const connectAddrs = JSON.parse(ib.connect_addresses_json || '[]') as string[];
      const rawHost = connectAddrs[0] || (ib.node_address !== '127.0.0.1' ? ib.node_address : general.publicAddress);
      const host = !rawHost || rawHost === '127.0.0.1' ? reqHost || rawHost || '127.0.0.1' : rawHost;
      const gen = generateClientProfile({
        clientName: String(client.name),
        vpnPassword: String(client.vpn_password),
        wgPrivateKey: String(client.wg_private_key),
        fixedIp: String(client.fixed_ip || ''),
        clientIndex: clientId,
        inbound: ib,
        endpointHost: host,
        nodeName: ib.node_name,
      });
      return {
        inboundId: ib.id,
        inboundName: ib.name,
        protocol: ib.protocol,
        nodeName: ib.node_name,
        description: ib.description,
        filename: gen.filename,
        configText: gen.content,
        connectInfo: gen.connectInfo,
      };
    });

    const protocolTabs = subSettings.protocols
      .filter((p) => p.shown)
      .map((p) => {
        const matchingProfiles = profiles.filter((pr) => {
          const norm = pr.protocol === 'ocserv' ? 'openconnect' : pr.protocol;
          return norm === p.id;
        });
        return {
          ...p,
          apps: p.useRecommendedApps ? DEFAULT_APPS[p.id] || DEFAULT_APPS.wireguard : p.customApps,
          profiles: matchingProfiles,
        };
      })
      .filter((tab) => tab.profiles.length > 0);

    const daily = db
      .prepare("SELECT ts, download_bytes, upload_bytes FROM traffic_samples WHERE granularity = 'day' ORDER BY ts DESC LIMIT 7")
      .all()
      .reverse();

    res.json({
      client: {
        name: String(client.name),
        status: state.status,
        trafficLimitBytes: client.traffic_limit_bytes === null ? null : Number(client.traffic_limit_bytes),
        trafficUsedBytes: Number(client.traffic_used_bytes),
        downloadBytes: Number(client.download_bytes),
        uploadBytes: Number(client.upload_bytes),
        expiresAt: client.expires_at ? String(client.expires_at) : null,
        firstConnectDays: client.first_connect_days === null ? null : Number(client.first_connect_days),
        firstConnectedAt: client.first_connected_at ? String(client.first_connected_at) : null,
        deviceLimit: client.device_limit === null ? null : Number(client.device_limit),
        onlineCount: liveCount,
        resetPeriod: String(client.reset_period),
      },
      appearance: {
        look: subSettings.look,
        accentColor: subSettings.accentColor,
        shopName: subSettings.shopName,
        supportLink: subSettings.supportLink,
        supportButtonText: subSettings.supportButtonText,
        channelLink: subSettings.channelLink,
        defaultLanguage: general.defaultSubLanguage,
      },
      protocolTabs,
      usageChart: daily,
    });
  });

  router.get('/:token/profile/:inboundId', async (req, res) => {
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE sub_token = ?').get(req.params.token) as
      | Record<string, unknown>
      | undefined;
    if (!client) {
      res.status(404).send('Invalid subscription token');
      return;
    }
    const clientId = Number(client.id);
    const inbounds = resolveClientInbounds(clientId);
    const inbound = inbounds.find((i) => i.id === Number(req.params.inboundId));
    if (!inbound) {
      res.status(404).send('Inbound not available for this client');
      return;
    }
    if (inbound.protocol === 'openvpn') {
      await ensureOpenVpnPki().catch(() => undefined);
      await ensureClientCertificate(String(client.name)).catch(() => null);
    }
    const general = getSetting('general', DEFAULT_GENERAL_SETTINGS);
    const connectAddrs = JSON.parse(inbound.connect_addresses_json || '[]') as string[];
    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const rawHost = connectAddrs[0] || (inbound.node_address !== '127.0.0.1' ? inbound.node_address : general.publicAddress);
    const host = !rawHost || rawHost === '127.0.0.1' ? reqHost || rawHost || '127.0.0.1' : rawHost;

    const gen = generateClientProfile({
      clientName: String(client.name),
      vpnPassword: String(client.vpn_password),
      wgPrivateKey: String(client.wg_private_key),
      fixedIp: String(client.fixed_ip || ''),
      clientIndex: clientId,
      inbound,
      endpointHost: host,
      nodeName: inbound.node_name,
    });
    res.setHeader('Content-Type', gen.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${gen.filename}"`);
    res.send(gen.content);
  });

  return router;
}
