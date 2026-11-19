import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { getDbPath } from '../config.js';
import { hashPassword, generateWireGuardKeypair, generateSs2022Key, randomToken } from '../security/auth.js';
import {
  ADMIN_PERMISSIONS,
  OWNER_PERMISSIONS,
  RESELLER_PERMISSIONS,
  type RoleLimits,
} from '../security/rbac.js';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(getDbPath());
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export interface GeneralSettings {
  brandName: string;
  publicAddress: string;
  panelUrl: string;
  subscriptionLinkAddress: string;
  supportTelegram: string;
  defaultSubLanguage: 'en' | 'fa';
  timezone: string;
  panelColor: 'lime' | 'cyan' | 'mint' | 'amber' | 'coral' | 'rose' | 'violet' | 'sky';
  warnExpiresWithinDays: number;
  warnTrafficPercent: number;
  inactivityTimeoutHours: number;
  retentionTrafficDays: number;
  retentionConnectionDays: number;
  retentionActivityDays: number;
  eventRetainDays: number;
  nodeSampleRawDays: number;
  nodeSampleKeepDays: number;
  metricsRoot: boolean;
  loginAllowCidrs: string[];
  loginOnlyAllowCidrs: boolean;
}

export interface SubPageProtocolConfig {
  id: 'openvpn' | 'wireguard' | 'amneziawg' | 'openconnect' | 'ikev2' | 'l2tp' | 'xray' | 'smartdns' | 'telegram';
  shown: boolean;
  tabName: string;
  guideNote: string;
  useRecommendedApps: boolean;
  customApps: {
    android: { name: string; url: string }[];
    ios: { name: string; url: string }[];
    desktop: { name: string; url: string }[];
  };
}

export interface SubscriptionPageSettings {
  look: 'night_shift' | 'aurora' | 'pop' | 'ticket' | 'orbit' | 'mono';
  accentColor: string;
  shopName: string;
  supportLink: string;
  supportButtonText: string;
  channelLink: string;
  protocols: SubPageProtocolConfig[];
}

export interface ProxyAppsSettings {
  updateHours: number;
  titlePattern: string;
  supportUrl: string;
  announce: string;
  expiredEntry: boolean;
  providerId: string;
  happ: {
    routingEnable?: boolean;
    hideSettings?: boolean;
    showTraffic?: boolean;
    showExpire?: boolean;
    renewUrl?: string;
  };
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  brandName: 'XProtocol',
  publicAddress: process.env.XPROTOCOL_PUBLIC_IP || '127.0.0.1',
  panelUrl: '',
  subscriptionLinkAddress: '',
  supportTelegram: '',
  defaultSubLanguage: 'en',
  timezone: 'Asia/Tehran',
  panelColor: 'mint',
  warnExpiresWithinDays: 5,
  warnTrafficPercent: 85,
  inactivityTimeoutHours: 72,
  retentionTrafficDays: 30,
  retentionConnectionDays: 30,
  retentionActivityDays: 90,
  eventRetainDays: 30,
  nodeSampleRawDays: 7,
  nodeSampleKeepDays: 90,
  metricsRoot: false,
  loginAllowCidrs: [],
  loginOnlyAllowCidrs: false,
};

export const DEFAULT_PROXY_APPS: ProxyAppsSettings = {
  updateHours: 6,
  titlePattern: '{brand} · {user}',
  supportUrl: '',
  announce: '',
  expiredEntry: true,
  providerId: '',
  happ: {
    routingEnable: false,
    hideSettings: false,
    showTraffic: true,
    showExpire: true,
    renewUrl: '',
  },
};

export const DEFAULT_SUB_SETTINGS: SubscriptionPageSettings = {
  look: 'night_shift',
  accentColor: 'theme',
  shopName: 'XProtocol VPN',
  supportLink: '',
  supportButtonText: '',
  channelLink: '',
  protocols: [
    {
      id: 'xray',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'wireguard',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'openvpn',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'amneziawg',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'openconnect',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'ikev2',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'l2tp',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'smartdns',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
    {
      id: 'telegram',
      shown: true,
      tabName: '',
      guideNote: '',
      useRecommendedApps: true,
      customApps: { android: [], ios: [], desktop: [] },
    },
  ],
};

export function getSetting<T>(key: string, fallback: T): T {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

export function setSetting<T>(key: string, value: T): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function initDatabase(): { initialPasswordGenerated?: string } {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      built_in INTEGER NOT NULL DEFAULT 0,
      is_owner INTEGER NOT NULL DEFAULT 0,
      permissions_json TEXT NOT NULL,
      limits_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id),
      active INTEGER NOT NULL DEFAULT 1,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      recovery_codes_json TEXT NOT NULL DEFAULT '[]',
      traffic_pool_bytes INTEGER,
      traffic_used_bytes INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      allowed_group_ids_json TEXT NOT NULL DEFAULT '[]',
      allowed_inbound_ids_json TEXT NOT NULL DEFAULT '[]',
      override_client_limit INTEGER,
      override_require_group INTEGER,
      override_max_traffic_gb REAL,
      override_max_lifetime_days INTEGER,
      override_max_devices INTEGER,
      override_allow_unlimited INTEGER,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes_json TEXT NOT NULL DEFAULT '["read","write"]',
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_local INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 62060,
      node_key TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1.0,
      connect_addresses_json TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'connected',
      last_seen_at TEXT NOT NULL,
      cpu_pct REAL NOT NULL DEFAULT 0,
      mem_pct REAL NOT NULL DEFAULT 0,
      disk_pct REAL NOT NULL DEFAULT 0,
      uptime_sec INTEGER NOT NULL DEFAULT 0,
      real_traffic_bytes INTEGER NOT NULL DEFAULT 0,
      xprotocol_version TEXT NOT NULL DEFAULT '1.0.4',
      openvpn_version TEXT NOT NULL DEFAULT '2.6.9',
      wireguard_ready INTEGER NOT NULL DEFAULT 1,
      openconnect_version TEXT NOT NULL DEFAULT '1.2.2',
      ikev2_ready INTEGER NOT NULL DEFAULT 1,
      l2tp_ready INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      domain_or_ip TEXT NOT NULL,
      cert_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'valid',
      expires_at TEXT NOT NULL,
      auto_renew INTEGER NOT NULL DEFAULT 1,
      cert_pem TEXT NOT NULL DEFAULT '',
      key_pem TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
      protocol TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      transport TEXT NOT NULL DEFAULT 'udp',
      port INTEGER NOT NULL,
      subnet TEXT NOT NULL,
      auth_mode TEXT NOT NULL DEFAULT 'certificate',
      description TEXT NOT NULL DEFAULT '',
      public_address_override TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      running INTEGER NOT NULL DEFAULT 0,
      cert_id INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
      server_public_key TEXT NOT NULL DEFAULT '',
      server_private_key TEXT NOT NULL DEFAULT '',
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      note TEXT NOT NULL DEFAULT '',
      all_inbounds INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      download_mbps REAL,
      upload_mbps REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_inbounds (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      inbound_id INTEGER NOT NULL REFERENCES inbounds(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, inbound_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      owner_id INTEGER NOT NULL REFERENCES accounts(id),
      traffic_limit_bytes INTEGER,
      traffic_used_bytes INTEGER NOT NULL DEFAULT 0,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      first_connect_days INTEGER,
      first_connected_at TEXT,
      device_limit INTEGER,
      download_mbps REAL,
      upload_mbps REAL,
      reset_period TEXT NOT NULL DEFAULT 'never',
      next_reset_at TEXT,
      fixed_ip TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      sub_token TEXT NOT NULL UNIQUE,
      wg_private_key TEXT NOT NULL,
      wg_public_key TEXT NOT NULL,
      vpn_password TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_online_at TEXT
    );

    CREATE TABLE IF NOT EXISTS client_groups (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (client_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS client_inbounds (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      inbound_id INTEGER NOT NULL REFERENCES inbounds(id) ON DELETE CASCADE,
      PRIMARY KEY (client_id, inbound_id)
    );

    CREATE TABLE IF NOT EXISTS connections_live (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      inbound_id INTEGER NOT NULL REFERENCES inbounds(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      remote_ip TEXT NOT NULL,
      tunnel_ip TEXT NOT NULL,
      device TEXT NOT NULL DEFAULT 'Unknown',
      connected_at TEXT NOT NULL,
      bytes_in INTEGER NOT NULL DEFAULT 0,
      bytes_out INTEGER NOT NULL DEFAULT 0,
      speed_in_bps INTEGER NOT NULL DEFAULT 0,
      speed_out_bps INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS connections_history (
      id TEXT PRIMARY KEY,
      client_id INTEGER,
      client_name TEXT NOT NULL,
      inbound_id INTEGER,
      inbound_name TEXT NOT NULL,
      protocol TEXT NOT NULL,
      node_id INTEGER,
      node_name TEXT NOT NULL,
      remote_ip TEXT NOT NULL,
      tunnel_ip TEXT NOT NULL,
      device TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      disconnected_at TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      bytes_total INTEGER NOT NULL,
      reason TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traffic_samples (
      ts TEXT NOT NULL,
      granularity TEXT NOT NULL,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ts, granularity)
    );

    CREATE TABLE IF NOT EXISTS client_traffic_samples (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      granularity TEXT NOT NULL,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (client_id, ts, granularity)
    );

    CREATE TABLE IF NOT EXISTS outbounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      config_json TEXT NOT NULL,
      last_test_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routing_policies (
      node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      inbound_scope TEXT NOT NULL DEFAULT 'all',
      inbound_ids_json TEXT NOT NULL DEFAULT '[]',
      default_action TEXT NOT NULL DEFAULT 'direct',
      default_outbound_id INTEGER REFERENCES outbounds(id) ON DELETE SET NULL,
      rules_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'inactive',
      status_message TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      account_id INTEGER,
      username TEXT NOT NULL DEFAULT '-',
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS client_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      settings_json TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_origins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      behind_cdn INTEGER NOT NULL DEFAULT 0,
      tls_status TEXT NOT NULL DEFAULT 'ok',
      added_at TEXT NOT NULL,
      UNIQUE(admin_id, url)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      at INTEGER NOT NULL,
      owner_id INTEGER NOT NULL DEFAULT 0,
      subject TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS account_event_reads (
      account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      last_seen_event_id INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events_json TEXT NOT NULL DEFAULT '[]',
      include_sub_link INTEGER NOT NULL DEFAULT 0,
      allow_private INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      delivered_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      encrypt INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      secrets_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"daily","hour":3}',
      retention_json TEXT NOT NULL DEFAULT '{"keepLast":7,"maxDays":30}',
      last_at INTEGER NOT NULL DEFAULT 0,
      last_size INTEGER NOT NULL DEFAULT 0,
      last_name TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      last_error_at INTEGER NOT NULL DEFAULT 0,
      last_prune TEXT NOT NULL DEFAULT '',
      next_at INTEGER NOT NULL DEFAULT 0,
      running INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS node_health_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      granularity TEXT NOT NULL DEFAULT 'raw',
      online INTEGER NOT NULL DEFAULT 1,
      cpu REAL,
      mem_used INTEGER,
      mem_total INTEGER,
      disk_used INTEGER,
      disk_total INTEGER,
      upload INTEGER NOT NULL DEFAULT 0,
      download INTEGER NOT NULL DEFAULT 0,
      clients INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_node_health_lookup ON node_health_samples(node_id, granularity, ts);

    CREATE TABLE IF NOT EXISTS xray_sni_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL DEFAULT 0,
      domain TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'general',
      grade TEXT NOT NULL,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      tcp_ms INTEGER NOT NULL DEFAULT 0,
      tls_ms INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER NOT NULL,
      UNIQUE(node_id, domain)
    );

    CREATE TABLE IF NOT EXISTS security_bans (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      fail_count INTEGER NOT NULL DEFAULT 0,
      fail_window_start INTEGER NOT NULL DEFAULT 0,
      until INTEGER NOT NULL DEFAULT 0,
      last_fail INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Idempotent schema migrations for pre-existing databases
  const ensureCol = (table: string, col: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  };
  ensureCol('groups', 'download_mbps', 'REAL');
  ensureCol('groups', 'upload_mbps', 'REAL');
  ensureCol('clients', 'download_mbps', 'REAL');
  ensureCol('clients', 'upload_mbps', 'REAL');
  ensureCol('clients', 'xray_uuid', "TEXT NOT NULL DEFAULT ''");
  ensureCol('clients', 'ss_password', "TEXT NOT NULL DEFAULT ''");
  ensureCol('clients', 'reset_every_days', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('clients', 'reset_anchor', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('clients', 'template_id', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('clients', 'sub_update_hours', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('clients', 'sub_announce', "TEXT NOT NULL DEFAULT ''");
  ensureCol('routing_policies', 'inbound_routes_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureCol('accounts', 'override_allowed_templates_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureCol('accounts', 'override_templates_only', 'INTEGER');
  ensureCol('accounts', 'telegram_chat_id', "TEXT NOT NULL DEFAULT ''");
  ensureCol('accounts', 'telegram_chat_name', "TEXT NOT NULL DEFAULT ''");
  ensureCol('accounts', 'telegram_link_token', "TEXT NOT NULL DEFAULT ''");
  ensureCol('accounts', 'notification_prefs_json', "TEXT NOT NULL DEFAULT '{\"off\":[],\"locale\":\"\",\"scope\":\"all\"}'");
  ensureCol('accounts', 'sub_apps_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureCol('sessions', 'mfa_confirmed_at', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('nodes', 'allow_from_json', "TEXT NOT NULL DEFAULT '[]'");

  // Backfill and deduplicate Xray UUID / SS2022 password for existing clients
  const allClientsForXray = db
    .prepare('SELECT id, xray_uuid, ss_password FROM clients ORDER BY id ASC')
    .all() as Array<{ id: number; xray_uuid: string; ss_password: string }>;
  const seenXrayUuids = new Set<string>();
  for (const mc of allClientsForXray) {
    const curUuid = String(mc.xray_uuid || '').trim();
    const needUuid = !curUuid || seenXrayUuids.has(curUuid);
    const nextUuid = needUuid ? crypto.randomUUID() : curUuid;
    seenXrayUuids.add(nextUuid);
    const needSs = !String(mc.ss_password || '').trim();
    if (needUuid || needSs) {
      db.prepare('UPDATE clients SET xray_uuid = ?, ss_password = ? WHERE id = ?').run(
        nextUuid,
        needSs ? generateSs2022Key('2022-blake3-aes-128-gcm') : mc.ss_password,
        mc.id,
      );
    }
  }

  const now = new Date().toISOString();

  // Seed default roles
  const existingOwnerRole = db.prepare('SELECT id FROM roles WHERE id = ?').get('owner');
  if (!existingOwnerRole) {
    const emptyLimits: RoleLimits = {
      defaultTrafficPoolGb: null,
      clientLimit: null,
      requireGroup: false,
      maxTrafficPerClientGb: null,
      maxLifetimeDays: null,
      maxDevicesPerClient: null,
      allowUnlimitedTraffic: true,
      allowedTemplates: [],
      templatesOnly: false,
    };
    const resellerLimits: RoleLimits = {
      defaultTrafficPoolGb: 100,
      clientLimit: 50,
      requireGroup: true,
      maxTrafficPerClientGb: 100,
      maxLifetimeDays: 90,
      maxDevicesPerClient: 3,
      allowUnlimitedTraffic: false,
      allowedTemplates: [],
      templatesOnly: false,
    };
    const insertRole = db.prepare(
      'INSERT INTO roles (id, name, built_in, is_owner, permissions_json, limits_json, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)',
    );
    insertRole.run('owner', 'Owner', 1, JSON.stringify(OWNER_PERMISSIONS), JSON.stringify(emptyLimits), now);
    insertRole.run('admin', 'Admin', 0, JSON.stringify(ADMIN_PERMISSIONS), JSON.stringify(emptyLimits), now);
    insertRole.run('reseller', 'Reseller', 0, JSON.stringify(RESELLER_PERMISSIONS), JSON.stringify(resellerLimits), now);
  }

  // Seed settings
  if (!db.prepare('SELECT key FROM settings WHERE key = ?').get('general')) {
    setSetting('general', DEFAULT_GENERAL_SETTINGS);
  }
  if (!db.prepare('SELECT key FROM settings WHERE key = ?').get('subscription_page')) {
    setSetting('subscription_page', DEFAULT_SUB_SETTINGS);
  } else {
    const subCfg = getSetting('subscription_page', DEFAULT_SUB_SETTINGS);
    if (!subCfg.protocols.some((p) => p.id === 'xray')) {
      subCfg.protocols = [
        {
          id: 'xray',
          shown: true,
          tabName: '',
          guideNote: '',
          useRecommendedApps: true,
          customApps: { android: [], ios: [], desktop: [] },
        },
        ...subCfg.protocols,
      ];
      setSetting('subscription_page', subCfg);
    }
  }
  if (!db.prepare('SELECT key FROM settings WHERE key = ?').get('proxy_apps')) {
    setSetting('proxy_apps', DEFAULT_PROXY_APPS);
  }

  // Seed owner account
  let initialPasswordGenerated: string | undefined;
  const accountCount = (db.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number }).cnt;
  if (accountCount === 0) {
    const defaultPass = process.env.XPROTOCOL_ADMIN_PASS || 'admin123456';
    initialPasswordGenerated = defaultPass;
    db.prepare(
      'INSERT INTO accounts (username, password_hash, role_id, active, note, created_at) VALUES (?, ?, ?, 1, ?, ?)',
    ).run('admin', hashPassword(defaultPass), 'owner', 'Default owner account', now);
  }

  // Seed local node ("This server")
  const nodeCount = (db.prepare('SELECT COUNT(*) as cnt FROM nodes').get() as { cnt: number }).cnt;
  if (nodeCount === 0) {
    db.prepare(
      `INSERT INTO nodes (is_local, name, address, port, node_key, multiplier, enabled, status, last_seen_at, cpu_pct, mem_pct, disk_pct, uptime_sec)
       VALUES (1, 'This server', ?, 62060, ?, 1.0, 1, 'connected', ?, 14.2, 32.8, 24.5, 432100)`,
    ).run(process.env.XPROTOCOL_PUBLIC_IP || '127.0.0.1', crypto.randomBytes(16).toString('hex'), now);

    // Seed internal XProtocol CA certificate
    const caExpiry = new Date(Date.now() + 3650 * 86400_000).toISOString();
    db.prepare(
      `INSERT INTO certificates (node_id, name, domain_or_ip, cert_type, status, expires_at, auto_renew, created_at)
       VALUES (1, 'XProtocol Internal CA', 'local-ca', 'ca', 'valid', ?, 1, ?)`,
    ).run(caExpiry, now);

    // Seed starter inbounds, group, traffic history, and sample clients unless XPROTOCOL_NO_DEMO=1
    if (process.env.XPROTOCOL_NO_DEMO !== '1') {
      const wgKeys = generateWireGuardKeypair();
      const awgKeys = generateWireGuardKeypair();
      const insertInbound = db.prepare(
        `INSERT INTO inbounds (node_id, protocol, name, transport, port, subnet, auth_mode, description, enabled, running, cert_id, server_public_key, server_private_key, settings_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`,
      );
      insertInbound.run(
        1,
        'wireguard',
        'wg-main',
        'udp',
        51820,
        '10.66.0.0/24',
        'device_keys',
        'Fast WireGuard tunnel',
        null,
        wgKeys.publicKey,
        wgKeys.privateKey,
        JSON.stringify({ dns: '1.1.1.1, 8.8.8.8', mtu: 1420 }),
        now,
      );
      insertInbound.run(
        1,
        'openvpn',
        'ovpn-udp',
        'udp',
        1194,
        '10.67.0.0/24',
        'certificate_password',
        'Compatible OpenVPN UDP',
        1,
        '',
        '',
        JSON.stringify({ cipher: 'AES-256-GCM', dns: '1.1.1.1' }),
        now,
      );
      insertInbound.run(
        1,
        'amneziawg',
        'awg-stealth',
        'udp',
        51821,
        '10.68.0.0/24',
        'device_keys',
        'AmneziaWG obfuscated tunnel',
        null,
        awgKeys.publicKey,
        awgKeys.privateKey,
        JSON.stringify({ dns: '1.1.1.1', mtu: 1380, jc: 4, jmin: 40, jmax: 70 }),
        now,
      );

      db.prepare(
        `INSERT INTO groups (name, note, all_inbounds, enabled, created_at) VALUES ('Standard', 'All default inbounds', 1, 1, ?)`,
      ).run(now);

      const client1Keys = generateWireGuardKeypair();
      const client2Keys = generateWireGuardKeypair();
      const GB = 1024 * 1024 * 1024;
      const insertClient = db.prepare(
        `INSERT INTO clients (name, owner_id, traffic_limit_bytes, traffic_used_bytes, upload_bytes, download_bytes, expires_at, first_connect_days, device_limit, reset_period, enabled, note, contact, sub_token, wg_private_key, wg_public_key, vpn_password, xray_uuid, ss_password, created_at, last_online_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const exp30 = new Date(Date.now() + 25 * 86400_000).toISOString();
      const exp3 = new Date(Date.now() + 2 * 86400_000).toISOString();
      insertClient.run(
        'alice',
        100 * GB,
        34.2 * GB,
        6.1 * GB,
        28.1 * GB,
        exp30,
        null,
        3,
        'monthly',
        'VIP subscriber',
        '@alice_vpn',
        randomToken(18),
        client1Keys.privateKey,
        client1Keys.publicKey,
        randomToken(12),
        crypto.randomUUID(),
        generateSs2022Key('2022-blake3-aes-128-gcm'),
        now,
        now,
      );
      insertClient.run(
        'bob',
        50 * GB,
        44.8 * GB,
        8.4 * GB,
        36.4 * GB,
        exp3,
        null,
        2,
        'never',
        'Expiring soon demo',
        'bob@example.com',
        randomToken(18),
        client2Keys.privateKey,
        client2Keys.publicKey,
        randomToken(12),
        crypto.randomUUID(),
        generateSs2022Key('2022-blake3-aes-128-gcm'),
        now,
        new Date(Date.now() - 3600_000).toISOString(),
      );

      db.prepare('INSERT INTO client_groups (client_id, group_id) VALUES (1, 1), (2, 1)').run();

      // Sample 24h and 30d traffic bars
      const insertSample = db.prepare(
        'INSERT OR IGNORE INTO traffic_samples (ts, granularity, download_bytes, upload_bytes) VALUES (?, ?, ?, ?)',
      );
      for (let h = 23; h >= 0; h--) {
        const d = new Date(Date.now() - h * 3600_000);
        d.setMinutes(0, 0, 0);
        const dl = Math.round((0.6 + ((24 - h) % 7) * 0.35) * GB);
        const ul = Math.round(dl * 0.22);
        insertSample.run(d.toISOString(), 'hour', dl, ul);
      }
      for (let day = 29; day >= 0; day--) {
        const d = new Date(Date.now() - day * 86400_000);
        d.setHours(0, 0, 0, 0);
        const dl = Math.round((4 + ((30 - day) % 9) * 1.6) * GB);
        const ul = Math.round(dl * 0.24);
        insertSample.run(d.toISOString().slice(0, 10), 'day', dl, ul);
      }

      // Sample live tunnel for alice
      db.prepare(
        `INSERT INTO connections_live (id, client_id, inbound_id, node_id, remote_ip, tunnel_ip, device, connected_at, bytes_in, bytes_out, speed_in_bps, speed_out_bps)
         VALUES ('conn-demo-1', 1, 1, 1, '185.141.107.42', '10.66.0.2', 'iOS 18', ?, 412000000, 1840000000, 320000, 2450000)`,
      ).run(new Date(Date.now() - 1840_000).toISOString());

      // Sample history entry
      db.prepare(
        `INSERT INTO connections_history (id, client_id, client_name, inbound_id, inbound_name, protocol, node_id, node_name, remote_ip, tunnel_ip, device, connected_at, disconnected_at, duration_sec, bytes_total, reason)
         VALUES ('hist-demo-1', 2, 'bob', 2, 'ovpn-udp', 'openvpn', 1, 'This server', '91.98.44.11', '10.67.0.2', 'Windows 11', ?, ?, 3600, 945000000, 'client_disconnect')`,
      ).run(new Date(Date.now() - 7200_000).toISOString(), new Date(Date.now() - 3600_000).toISOString());
    }
  }

  return { initialPasswordGenerated };
}
