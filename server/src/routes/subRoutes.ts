import { Router } from 'express';
import {
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_PROXY_APPS,
  DEFAULT_SUB_SETTINGS,
  getDb,
  getSetting,
} from '../db/database.js';
import { buildClientXrayServerViews } from '../drivers/xrayEngine.js';
import { resolvePrimarySubOriginForOwner } from '../services/subOrigins.js';
import { computeClientState } from './context.js';
import { resolveClientInbounds } from './clientRoutes.js';
import { generateClientProfile } from '../generators/profiles.js';
import { ensureClientCertificate, ensureOpenVpnPki } from '../drivers/pki.js';

const DEFAULT_APPS: Record<string, { android: { name: string; url: string }[]; ios: { name: string; url: string }[]; desktop: { name: string; url: string }[] }> = {
  xray: {
    android: [
      { name: 'Happ', url: 'https://play.google.com/store/apps/details?id=com.happproxy' },
      { name: 'v2rayNG', url: 'https://github.com/2dust/v2rayNG/releases' },
      { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-app/releases' },
      { name: 'Karing', url: 'https://github.com/KaringX/karing/releases' },
    ],
    ios: [
      { name: 'Happ', url: 'https://apps.apple.com/app/happ-proxy-utility/id6504287215' },
      { name: 'Hiddify', url: 'https://apps.apple.com/app/hiddify-proxy-vpn/id6596777532' },
      { name: 'Karing', url: 'https://apps.apple.com/app/karing/id6472431552' },
    ],
    desktop: [
      { name: 'Happ', url: 'https://github.com/Happ-proxy/happ-desktop/releases' },
      { name: 'v2rayN', url: 'https://github.com/2dust/v2rayN/releases' },
      { name: 'Hiddify', url: 'https://github.com/hiddify/hiddify-app/releases' },
      { name: 'Karing', url: 'https://github.com/KaringX/karing/releases' },
    ],
  },
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
    const proxyApps = getSetting('proxy_apps', DEFAULT_PROXY_APPS);
    const assignedInbounds = resolveClientInbounds(clientId);

    if (assignedInbounds.some((ib) => ib.protocol === 'openvpn')) {
      await ensureOpenVpnPki().catch(() => undefined);
      await ensureClientCertificate(String(client.name)).catch(() => null);
    }

    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const fallbackHost = general.publicAddress && general.publicAddress !== '127.0.0.1' ? general.publicAddress : reqHost || '127.0.0.1';

    const xrayInbounds = assignedInbounds.filter((ib) => ib.protocol === 'xray');
    const nonXrayInbounds = assignedInbounds.filter((ib) => ib.protocol !== 'xray');

    const xrayServers = buildClientXrayServerViews(
      {
        id: clientId,
        name: String(client.name),
        xrayUuid: String(client.xray_uuid || ''),
        vpnPassword: String(client.vpn_password || ''),
        ssPassword: String(client.ss_password || ''),
      },
      xrayInbounds,
      fallbackHost,
    );

    const profiles = nonXrayInbounds.map((ib) => {
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
        if (p.id === 'xray') {
          return {
            ...p,
            apps: p.useRecommendedApps ? DEFAULT_APPS.xray : p.customApps,
            profiles: [],
            xrayServers,
          };
        }
        const matchingProfiles = profiles.filter((pr) => {
          const norm = pr.protocol === 'ocserv' ? 'openconnect' : pr.protocol;
          return norm === p.id;
        });
        return {
          ...p,
          apps: p.useRecommendedApps ? DEFAULT_APPS[p.id] || DEFAULT_APPS.wireguard : p.customApps,
          profiles: matchingProfiles,
          xrayServers: [],
        };
      })
      .filter((tab) => (tab.id === 'xray' ? tab.xrayServers.length > 0 : tab.profiles.length > 0));

    const reqOrigin = `${req.protocol}://${req.get('host') || 'localhost'}`;
    const primaryOrigin = resolvePrimarySubOriginForOwner(Number(client.owner_id), reqOrigin);
    const subPathClean = req.baseUrl || '';
    const tokenClean = req.params.token;
    const primarySubUrl = `${primaryOrigin}${subPathClean}/${tokenClean}`;
    const newSubUrl = primaryOrigin !== reqOrigin ? primarySubUrl : undefined;

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
        nextResetAt: client.next_reset_at ? String(client.next_reset_at) : null,
        subUpdateHours: Number(client.sub_update_hours || 0),
        subAnnounce: String(client.sub_announce || ''),
      },
      appearance: {
        look: subSettings.look,
        accentColor: subSettings.accentColor,
        shopName: subSettings.shopName,
        supportLink: subSettings.supportLink || proxyApps.supportUrl,
        supportButtonText: subSettings.supportButtonText,
        channelLink: subSettings.channelLink,
        defaultLanguage: general.defaultSubLanguage,
      },
      proxyApps: {
        updateHours: Number(client.sub_update_hours || 0) || proxyApps.updateHours,
        announce: String(client.sub_announce || '') || proxyApps.announce,
      },
      subUrl: primarySubUrl,
      newSubUrl,
      xrayServers,
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

  // Proxy app subscription endpoint (Happ, v2rayNG, v2rayN, Hiddify, Karing, Shadowrocket, etc.)
  const handleProxySub = (req: import('express').Request, res: import('express').Response) => {
    const db = getDb();
    const token = String(req.params.token || '');
    const client = db.prepare('SELECT * FROM clients WHERE sub_token = ?').get(token) as
      | Record<string, unknown>
      | undefined;
    if (!client) {
      res.status(404).type('text/plain').send('Invalid subscription token');
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
    const proxyApps = getSetting('proxy_apps', DEFAULT_PROXY_APPS);
    const ownerRow = db.prepare('SELECT sub_apps_json FROM accounts WHERE id = ?').get(Number(client.owner_id)) as
      | { sub_apps_json: string }
      | undefined;
    let ownerSubApps: { supportUrl?: string; title?: string; renewLink?: string } = {};
    try {
      ownerSubApps = JSON.parse(ownerRow?.sub_apps_json || '{}');
    } catch {
      ownerSubApps = {};
    }

    const reqHost = req.hostname && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1' ? req.hostname : '';
    const fallbackHost = general.publicAddress && general.publicAddress !== '127.0.0.1' ? general.publicAddress : reqHost || '127.0.0.1';
    const xrayInbounds = resolveClientInbounds(clientId).filter((ib) => ib.protocol === 'xray');
    const servers = buildClientXrayServerViews(
      {
        id: clientId,
        name: String(client.name),
        xrayUuid: String(client.xray_uuid || ''),
        vpnPassword: String(client.vpn_password || ''),
        ssPassword: String(client.ss_password || ''),
      },
      xrayInbounds,
      fallbackHost,
    );

    const canConnect = state.status === 'active' || state.status === 'online' || state.status === 'not_started';
    let lines = servers.flatMap((s) => s.links);
    if (!canConnect && proxyApps.expiredEntry) {
      const reasonLabel =
        state.status === 'expired'
          ? 'Subscription expired'
          : state.status === 'used_up'
            ? 'Traffic quota used up'
            : 'Account disabled';
      lines = [`vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?security=none&type=tcp#${encodeURIComponent(reasonLabel)}`];
    }

    const brand = subSettings.shopName || general.brandName || 'XProtocol';
    const titlePattern = ownerSubApps.title || proxyApps.titlePattern || '{brand} · {user}';
    const title = titlePattern.replace(/\{brand\}/g, brand).replace(/\{user\}/g, String(client.name));
    const updateHours = Number(client.sub_update_hours || 0) || proxyApps.updateHours || 6;
    const supportUrl = ownerSubApps.supportUrl || proxyApps.supportUrl || subSettings.supportLink || '';
    const announce = String(client.sub_announce || '') || proxyApps.announce || '';

    const upload = Number(client.upload_bytes || 0);
    const download = Number(client.download_bytes || 0);
    const total = client.traffic_limit_bytes === null ? 0 : Number(client.traffic_limit_bytes);
    const expire = client.expires_at ? Math.floor(Date.parse(String(client.expires_at)) / 1000) : 0;

    res.setHeader('subscription-userinfo', `upload=${upload}; download=${download}; total=${total}; expire=${expire}`);
    res.setHeader('profile-title', `base64:${Buffer.from(title, 'utf8').toString('base64')}`);
    res.setHeader('profile-update-interval', String(updateHours));
    if (supportUrl) res.setHeader('support-url', supportUrl);
    if (announce) res.setHeader('announce', `base64:${Buffer.from(announce, 'utf8').toString('base64')}`);
    const reqOrigin = `${req.protocol}://${req.get('host') || 'localhost'}`;
    res.setHeader('profile-web-page-url', `${resolvePrimarySubOriginForOwner(Number(client.owner_id), reqOrigin)}/sub/${req.params.token}`);
    if (proxyApps.providerId) res.setHeader('providerid', proxyApps.providerId);

    const payload = lines.join('\n');
    const wantsRaw = req.query.format === 'raw' || req.query.format === 'txt' || req.path.endsWith('/raw');
    res.type('text/plain; charset=utf-8').send(wantsRaw ? payload : Buffer.from(payload, 'utf8').toString('base64'));
  };

  router.get('/:token/proxy', handleProxySub);
  router.get('/:token/raw', handleProxySub);
  router.get('/:token', handleProxySub);

  return router;
}
