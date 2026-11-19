import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xprotocol-engine-test-'));
process.env.XPROTOCOL_DATA_DIR = tempDir;
process.env.XPROTOCOL_ADMIN_PASS = 'engine-test-pass';
process.env.XPROTOCOL_SKIP_NET_FETCH = '1';

const { initDatabase, closeDb, getDb } = await import('../src/db/database.js');
const { parseCidr, allocateTunnelIp, isClientActiveQuota, getEligiblePeersForInbound, resolveClientTunnelIp, ensureClientDeviceSlots } =
  await import('../src/services/peerResolver.js');
const { renderInboundServerConfig, renderInboundExtraFiles } = await import('../src/generators/configs.js');
const { generateClientProfile } = await import('../src/generators/profiles.js');
const { syncOpenVpnAuthScript, writeLiveClientCounts } = await import('../src/drivers/pki.js');
const { parseSwanctlSasOutput } = await import('../src/drivers/linuxEngine.js');
const { parseXrayAccessLogContent } = await import('../src/drivers/xrayEngine.js');
const { syncGateStateFromDb, admitGateSession, releaseGateSession, ensureDaemonGateHooks, readGateState } =
  await import('../src/services/sessionGate.js');
const { getCurrentCommit, getUpdateState } = await import('../src/services/updater.js');
const { selectSessionsWithinLimit } = await import('../src/services/collector.js');

initDatabase();

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('CIDR parser & collision-free tunnel IP allocator across /29 and /23 subnets', () => {
  const small = parseCidr('10.10.5.0/29');
  assert.equal(small.gatewayIp, '10.10.5.1');
  assert.equal(small.netmask, '255.255.255.248');

  const wide = parseCidr('10.20.0.0/23');
  assert.equal(wide.gatewayIp, '10.20.0.1');
  assert.equal(wide.netmask, '255.255.254.0');
  assert.ok(wide.totalHosts >= 500);

  // Out-of-subnet fixed IP must be ignored; >240 sequential allocations must stay unique
  const used = new Set<string>();
  const ips = new Set<string>();
  for (let cid = 1; cid <= 260; cid++) {
    const ip = allocateTunnelIp('10.20.0.0/23', cid, cid === 1 ? '192.168.99.50' : '', used);
    assert.ok(ip.startsWith('10.20.0.') || ip.startsWith('10.20.1.'), `Unexpected IP ${ip}`);
    assert.equal(ips.has(ip), false, `Collision detected for IP ${ip}`);
    ips.add(ip);
  }
  assert.equal(ips.size, 260);
});

test('Quota & expiry boundary enforcement for peers', () => {
  const now = Date.parse('2026-11-16T12:00:00.000Z');
  assert.equal(
    isClientActiveQuota({ enabled: 1, expires_at: null, traffic_limit_bytes: 1000, traffic_used_bytes: 999 }, now),
    true,
  );
  assert.equal(
    isClientActiveQuota({ enabled: 1, expires_at: null, traffic_limit_bytes: 1000, traffic_used_bytes: 1000 }, now),
    false,
  );
  assert.equal(
    isClientActiveQuota(
      { enabled: 1, expires_at: '2026-11-16T12:00:00.000Z', traffic_limit_bytes: null, traffic_used_bytes: 0 },
      now,
    ),
    false,
  );
  assert.equal(
    isClientActiveQuota({ enabled: 0, expires_at: null, traffic_limit_bytes: null, traffic_used_bytes: 0 }, now),
    false,
  );
});

test('Peer eligibility enforces grants & resolves client/group bandwidth limits', () => {
  const db = getDb();
  const now = new Date().toISOString();
  const wgInbound = db.prepare("SELECT * FROM inbounds WHERE protocol = 'wireguard' LIMIT 1").get() as {
    id: number;
    subnet: string;
  };

  // Create two throttled groups and a test client in both groups -> tightest cap wins unless client overrides
  const gFast = db
    .prepare(
      'INSERT INTO groups (name, note, all_inbounds, enabled, download_mbps, upload_mbps, created_at) VALUES (?, ?, 0, 1, ?, ?, ?)',
    )
    .run('speed-50', '', 50, 20, now);
  const gSlow = db
    .prepare(
      'INSERT INTO groups (name, note, all_inbounds, enabled, download_mbps, upload_mbps, created_at) VALUES (?, ?, 0, 1, ?, ?, ?)',
    )
    .run('speed-15', '', 15, 10, now);
  db.prepare('INSERT INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gFast.lastInsertRowid, wgInbound.id);
  db.prepare('INSERT INTO group_inbounds (group_id, inbound_id) VALUES (?, ?)').run(gSlow.lastInsertRowid, wgInbound.id);

  const cRes = db
    .prepare(
      `INSERT INTO clients (name, owner_id, fixed_ip, enabled, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES (?, 1, ?, 1, ?, 'priv', 'pub-speed-1', 'secret', ?)`,
    )
    .run('speed-tester', '192.168.55.55', 'tok-speed-1', now);
  const cid = Number(cRes.lastInsertRowid);
  db.prepare('INSERT INTO client_groups (client_id, group_id) VALUES (?, ?)').run(cid, gFast.lastInsertRowid);
  db.prepare('INSERT INTO client_groups (client_id, group_id) VALUES (?, ?)').run(cid, gSlow.lastInsertRowid);

  const peers = getEligiblePeersForInbound(wgInbound.id, wgInbound.subnet);
  const target = peers.find((p) => p.clientId === cid);
  assert.ok(target);
  assert.equal(target.downloadMbps, 15);
  assert.equal(target.uploadMbps, 10);

  // Client profile tunnel IP must match server-side peer allocation even when fixed_ip is out-of-subnet
  const profileIp = resolveClientTunnelIp(wgInbound.id, wgInbound.subnet, cid, '192.168.55.55');
  assert.equal(profileIp, target.tunnelIp);

  // Disabled client with direct grant must not appear
  const cNo = db
    .prepare(
      `INSERT INTO clients (name, owner_id, enabled, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES ('disabled-user', 1, 0, 'tok-dis-1', 'priv2', 'pub-dis-1', 'secret', ?)`,
    )
    .run(now);
  db.prepare('INSERT INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cNo.lastInsertRowid, wgInbound.id);
  const afterDisabled = getEligiblePeersForInbound(wgInbound.id, wgInbound.subnet);
  assert.equal(afterDisabled.some((p) => p.clientId === Number(cNo.lastInsertRowid)), false);
});

test('Config rendering sanitizes CRLF/quotes across OpenConnect, IKEv2, L2TP, and OpenVPN', () => {
  const ocCfg = renderInboundServerConfig(
    {
      id: 201,
      node_id: 1,
      protocol: 'ocserv',
      name: 'oc443',
      transport: 'tcp',
      port: 443,
      subnet: '10.67.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: JSON.stringify({
        dtls: false,
        camouflage: true,
        camouflageSecret: 'sec"\ninject=true',
        camouflageRealm: 'Corp"Portal',
      }),
    },
    [],
  );
  assert.equal(ocCfg.content.includes('udp-port'), false);
  assert.match(ocCfg.content, /camouflage = true/);
  assert.equal(ocCfg.content.includes('\ninject=true'), false);

  const ikeCfg = renderInboundServerConfig(
    {
      id: 202,
      node_id: 1,
      protocol: 'ikev2',
      name: 'ikev2500',
      transport: 'udp',
      port: 500,
      subnet: '10.68.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: JSON.stringify({ serverId: 'vpn.example.com\nfake_opt=1' }),
    },
    [{ clientId: 7, name: 'alice', wgPublicKey: '', vpnPassword: 'p"w\n#break', tunnelIp: '10.68.0.7' }],
  );
  assert.equal(ikeCfg.content.includes('\nfake_opt=1'), false);
  assert.equal(ikeCfg.content.includes('\n#break'), false);
  assert.match(ikeCfg.content, /secret = "p\\"w #break"/);

  const l2tpFiles = renderInboundExtraFiles(
    {
      id: 203,
      node_id: 1,
      protocol: 'l2tp',
      name: 'l2tp500',
      transport: 'udp',
      port: 500,
      subnet: '10.69.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: JSON.stringify({ psk: 'my"psk\nrm', pppMtu: 1390 }),
    },
    [],
  );
  const pppOpts = l2tpFiles.find((f) => f.path.includes('options.xl2tpd.l2tp500'));
  assert.ok(pppOpts);
  assert.match(pppOpts.content, /mtu 1390/);
  assert.match(pppOpts.content, /ipparam l2tp500/);
  assert.match(pppOpts.content, /noipv6/);
  assert.match(pppOpts.content, /lcp-echo-interval 10/);

  const l2tpSwan = l2tpFiles.find((f) => f.path.includes('l2tp-l2tp500.conf'));
  assert.ok(l2tpSwan);
  assert.match(l2tpSwan.content, /unique = no/);
  assert.match(l2tpSwan.content, /dpd_action = clear/);

  const xl2tpdCfg = renderInboundServerConfig(
    {
      id: 204,
      node_id: 1,
      protocol: 'l2tp',
      name: 'l2tp23',
      transport: 'udp',
      port: 1701,
      subnet: '10.90.0.0/23',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(xl2tpdCfg.content, /force userspace = yes/);
  assert.match(xl2tpdCfg.content, /ip range = 10\.90\.0\.2-10\.90\.1\.253/);

  const ocLiteCfg = renderInboundServerConfig(
    {
      id: 205,
      node_id: 1,
      protocol: 'openconnect',
      name: 'oc443',
      transport: 'tcp',
      port: 443,
      subnet: '10.91.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(ocLiteCfg.content, /device = vc205-/);
  assert.match(ocLiteCfg.content, /max-ban-score = 0/);
  assert.match(ocLiteCfg.content, /max-same-clients = 0/);
  assert.match(ocLiteCfg.content, /try-mtu-discovery = false/);

  const ovpnLiteCfg = renderInboundServerConfig(
    {
      id: 206,
      node_id: 1,
      protocol: 'openvpn',
      name: 'ovpn1194',
      transport: 'udp',
      port: 1194,
      subnet: '10.92.0.0/24',
      auth_mode: 'password',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(ovpnLiteCfg.content, /duplicate-cn/);
  assert.match(ovpnLiteCfg.content, /status-version 3/);
  assert.match(ovpnLiteCfg.content, /push "block-ipv6"/);

  const wgProfile = generateClientProfile({
    clientName: 'alice',
    vpnPassword: 'pw',
    wgPrivateKey: 'privkey',
    fixedIp: '192.168.10.10',
    clientIndex: 1,
    inbound: {
      id: 1,
      node_id: 1,
      protocol: 'wireguard',
      name: 'wg51820',
      transport: 'udp',
      port: 51820,
      subnet: '10.66.0.0/24',
      auth_mode: 'device_keys',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: 'SRV_PUB',
      server_private_key: '',
      settings_json: JSON.stringify({ filenameTemplate: '../../{client}-{kind}' }),
    },
    endpointHost: '1.2.3.4',
    nodeName: 'Node1',
  });
  assert.equal(wgProfile.filename.includes('..') || wgProfile.filename.includes('/'), false);
  assert.match(wgProfile.filename, /^[^/\\]*alice-wg\.conf$/);
  assert.match(wgProfile.content, /Address = 10\.66\.0\.\d+\/32/);

  // IPv4-only inbound with empty dns array must fall back to public DNS and omit ::/0 blackhole route
  const wgIpv4Only = generateClientProfile({
    client: { id: 1, name: 'alice', wg_public_key: 'PUB', wg_private_key: 'PRIV', vpn_password: '' },
    inbound: {
      id: 2,
      node_id: 1,
      protocol: 'wireguard',
      name: 'wg-v4',
      transport: 'udp',
      port: 51822,
      subnet: '10.67.0.0/24',
      auth_mode: 'device_keys',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: 'SRV_PUB',
      server_private_key: '',
      settings_json: JSON.stringify({ dns: [], ipv6: false }),
    },
    endpointHost: '1.2.3.4',
    nodeName: 'Node1',
  });
  assert.match(wgIpv4Only.content, /DNS = 1\.1\.1\.1, 8\.8\.8\.8/);
  assert.match(wgIpv4Only.content, /AllowedIPs = 0\.0\.0\.0\/0\r?\n/);
  assert.equal(wgIpv4Only.content.includes('::/0'), false);
});

test('OpenVPN salted scrypt auth verifier enforces credentials and cross-protocol device_limit', async () => {
  const scriptPath = syncOpenVpnAuthScript('ovpn-test', [
    { clientId: 1, name: 'alice', wgPublicKey: '', vpnPassword: 'Strong#Pass!99', tunnelIp: '10.8.0.2', deviceLimit: 1 },
    { clientId: 2, name: 'bob', wgPublicKey: '', vpnPassword: 'Bob#Pass!22', tunnelIp: '10.8.0.3', deviceLimit: 2 },
  ]);

  const validCred = path.join(tempDir, 'cred-ok.txt');
  const bobCred = path.join(tempDir, 'cred-bob.txt');
  const badCred = path.join(tempDir, 'cred-bad.txt');
  fs.writeFileSync(validCred, 'alice\nStrong#Pass!99\n');
  fs.writeFileSync(bobCred, 'bob\nBob#Pass!22\n');
  fs.writeFileSync(badCred, 'alice\nwrong-password\n');

  writeLiveClientCounts({ alice: 0, bob: 1 });
  await execFileAsync(process.execPath, [scriptPath, validCred]);
  await execFileAsync(process.execPath, [scriptPath, bobCred]);
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, badCred]));
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, path.join(tempDir, 'missing.txt')]));

  // Single-user client already active on another protocol must be rejected at OpenVPN login
  writeLiveClientCounts({ alice: 1, bob: 1 });
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, validCred]));
  await execFileAsync(process.execPath, [scriptPath, bobCred]);
});

test('Multi-protocol device_limit enforcement keeps both WG + OpenVPN on limit=2 and isolates single-user', () => {
  const now = 1_000_000;

  // 1) Single-user (limit=1): active OpenVPN blocks concurrent second WireGuard session
  const singleRes = selectSessionsWithinLimit(
    [
      { id: 'ovpn-2-cid1', isWireGuard: false, connectedAtMs: now - 20_000, lastActiveMs: now - 1_000 },
      { id: 'wg-1-pubkey', isWireGuard: true, connectedAtMs: now - 2_000, lastActiveMs: now - 1_000 },
    ],
    1,
    now,
  );
  assert.deepEqual([...singleRes.keepIds], ['ovpn-2-cid1']);
  assert.deepEqual(singleRes.evictIds, ['wg-1-pubkey']);

  // 2) Single-user (limit=1): stale disconnected WireGuard (>45s silent) yields to new OpenVPN session
  const handoffRes = selectSessionsWithinLimit(
    [
      { id: 'wg-1-pubkey', isWireGuard: true, connectedAtMs: now - 120_000, lastActiveMs: now - 60_000 },
      { id: 'ovpn-2-cid2', isWireGuard: false, connectedAtMs: now - 2_000, lastActiveMs: now - 1_000 },
    ],
    1,
    now,
  );
  assert.deepEqual([...handoffRes.keepIds], ['ovpn-2-cid2']);
  assert.deepEqual(handoffRes.evictIds, ['wg-1-pubkey']);

  // 3) Dual-user (limit=2): WireGuard + OpenVPN both stay active, 3rd L2TP is evicted
  const dualRes = selectSessionsWithinLimit(
    [
      { id: 'wg-1-pubkey', isWireGuard: true, connectedAtMs: now - 30_000, lastActiveMs: now - 2_000 },
      { id: 'ovpn-2-cid3', isWireGuard: false, connectedAtMs: now - 15_000, lastActiveMs: now - 1_000 },
      { id: 'l2tp-ppp-3-ppp0', isWireGuard: false, connectedAtMs: now - 1_000, lastActiveMs: now - 500 },
    ],
    2,
    now,
  );
  assert.equal(dualRes.keepIds.has('wg-1-pubkey'), true);
  assert.equal(dualRes.keepIds.has('ovpn-2-cid3'), true);
  assert.deepEqual(dualRes.evictIds, ['l2tp-ppp-3-ppp0']);
});

test('Updater filters out already-installed commit/semver from cached update state', async () => {
  const { setSetting } = await import('../src/db/database.js');
  const curSha = await getCurrentCommit();
  assert.ok(curSha.length > 0, 'Expected current git commit SHA to resolve');

  setSetting('updates_meta', {
    checkedAt: new Date().toISOString(),
    source: 'github',
    checkError: null,
    lastError: null,
    latest: {
      tag: `main@${curSha}`,
      name: 'Current commit',
      prerelease: false,
      published: new Date().toISOString(),
      notes: '',
      url: 'https://github.com/PouryaDe/XProtocol',
    },
    newer: [
      {
        tag: `main@${curSha}`,
        name: 'Current commit',
        prerelease: false,
        published: new Date().toISOString(),
        notes: '',
        url: 'https://github.com/PouryaDe/XProtocol',
      },
    ],
    recent: [],
  });

  const state = await getUpdateState();
  assert.equal(state.latest, null);
  assert.equal(state.newer.length, 0);
});

test('OpenVPN renegotiation (trusted_ip set) does not self-kick single-user clients', async () => {
  const scriptPath = syncOpenVpnAuthScript('ovpn-reneg', [
    { clientId: 1, name: 'alice', wgPublicKey: '', vpnPassword: 'Strong#Pass!99', tunnelIp: '10.8.0.2', deviceLimit: 1 },
  ]);
  const cred = path.join(tempDir, 'reneg-cred.txt');
  fs.writeFileSync(cred, 'alice\nStrong#Pass!99\n');
  writeLiveClientCounts({ alice: 1 });

  // Initial login (no trusted_ip) is blocked at limit=1, while renegotiation (trusted_ip set) succeeds
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, cred]));
  await execFileAsync(process.execPath, [scriptPath, cred], {
    env: { ...process.env, trusted_ip: '198.51.100.42', trusted_port: '44312' },
  });
});

test('SessionGate enforces cross-protocol device_limit, expiry, quota, and inbound grants atomically', async () => {
  const db = getDb();
  const now = new Date().toISOString();
  const wgInbound = db.prepare("SELECT * FROM inbounds WHERE protocol = 'wireguard' LIMIT 1").get() as { id: number; name: string };

  const cSingle = db
    .prepare(
      `INSERT INTO clients (name, owner_id, enabled, device_limit, download_mbps, upload_mbps, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES ('gate-single', 1, 1, 1, 12, 6, 'tok-gate-1', 'gp1', 'gpub1', 'gpass1', ?)`,
    )
    .run(now);
  const cSingleId = Number(cSingle.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cSingleId, wgInbound.id);

  // Also add an OpenVPN inbound and grant it
  const ovpnRes = db
    .prepare(
      `INSERT INTO inbounds (node_id, protocol, name, transport, port, subnet, auth_mode, enabled, running, created_at)
       VALUES (1, 'openvpn', 'ovpn-gate', 'udp', 1195, '10.71.0.0/24', 'cert', 1, 1, ?)`,
    )
    .run(now);
  const ovpnId = Number(ovpnRes.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cSingleId, ovpnId);

  syncGateStateFromDb();
  ensureDaemonGateHooks('ovpn-gate');

  // 1st session admitted with speed limits
  const adm1 = admitGateSession({
    clientName: 'gate-single',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'ovpn-hook-ovpn-gate-1.1.1.1:1000',
  });
  assert.equal(adm1.ok, true);
  assert.equal(adm1.downloadMbps, 12);
  assert.equal(adm1.uploadMbps, 6);

  // 2nd concurrent session on another protocol/inbound must be rejected immediately
  const adm2 = admitGateSession({
    clientName: 'gate-single',
    inboundName: wgInbound.name,
    protocol: 'l2tp',
    sessionId: 'l2tp-hook-ppp0',
  });
  assert.equal(adm2.ok, false);
  assert.equal(adm2.reason, 'device_limit');

  // Un-granted inbound rejected even after release
  releaseGateSession('ovpn-hook-ovpn-gate-1.1.1.1:1000');
  const admWrongIb = admitGateSession({
    clientName: 'gate-single',
    inboundName: 'ungranted-l2tp',
    protocol: 'l2tp',
    sessionId: 'l2tp-hook-ppp1',
  });
  assert.equal(admWrongIb.ok, false);
  assert.equal(admWrongIb.reason, 'inbound_not_granted');

  // Re-admit succeeds once slot is released
  const adm3 = admitGateSession({
    clientName: 'gate-single',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'ovpn-hook-ovpn-gate-2.2.2.2:2000',
  });
  assert.equal(adm3.ok, true);
  releaseGateSession('ovpn-hook-ovpn-gate-2.2.2.2:2000');
});

test('WireGuard multi-device (device_limit=2) allocates distinct key slots & tunnel IPs without shifting slot 1', () => {
  const db = getDb();
  const now = new Date().toISOString();
  const wgInbound = db.prepare("SELECT * FROM inbounds WHERE protocol = 'wireguard' LIMIT 1").get() as {
    id: number;
    name: string;
    port: number;
    subnet: string;
    node_id: number;
    transport: string;
    auth_mode: string;
    description: string;
    public_address_override: string;
    enabled: number;
    running: number;
    cert_id: number | null;
    server_public_key: string;
    server_private_key: string;
    settings_json: string;
  };

  const cDual = db
    .prepare(
      `INSERT INTO clients (name, owner_id, enabled, device_limit, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES ('wg-dual', 1, 1, 2, 'tok-wg-dual', 'priv-slot1', 'pub-slot1', 'pass', ?)`,
    )
    .run(now);
  const cid = Number(cDual.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cid, wgInbound.id);

  const slots = ensureClientDeviceSlots(cid, 2);
  assert.equal(slots.length, 2);
  assert.notEqual(slots[0].wgPublicKey, slots[1].wgPublicKey);

  const peers = getEligiblePeersForInbound(wgInbound.id, wgInbound.subnet).filter((p) => p.clientId === cid);
  assert.equal(peers.length, 2);
  assert.notEqual(peers[0].tunnelIp, peers[1].tunnelIp);
  assert.notEqual(peers[0].wgPublicKey, peers[1].wgPublicKey);

  const prof1 = generateClientProfile({
    clientName: 'wg-dual',
    vpnPassword: 'pass',
    wgPrivateKey: slots[0].wgPrivateKey,
    fixedIp: '',
    clientIndex: cid,
    slotIndex: 1,
    inbound: wgInbound,
    endpointHost: 'vpn.example.com',
    nodeName: 'Node1',
  });
  const prof2 = generateClientProfile({
    clientName: 'wg-dual',
    vpnPassword: 'pass',
    wgPrivateKey: slots[1].wgPrivateKey,
    fixedIp: '',
    clientIndex: cid,
    slotIndex: 2,
    inbound: wgInbound,
    endpointHost: 'vpn.example.com',
    nodeName: 'Node1',
  });
  assert.ok(prof1.content.includes(`Address = ${peers[0].tunnelIp}/32`));
  assert.ok(prof2.content.includes(`Address = ${peers[1].tunnelIp}/32`));
  assert.notEqual(prof1.filename, prof2.filename);
});

test('IKEv2 multi-SA parser uses uniqueid & EAP identity and avoids collisions on device_limit=2', () => {
  const swanOut = [
    'ikev2: #12, ESTABLISHED, IKEv2, abc123:def456',
    "  local  'vpn.example.com' @ 10.0.0.1[4500]",
    "  remote '192.168.1.50' @ 198.51.100.10[4500] EAP: 'alice'",
    '  remote virtual IP: 10.68.0.2',
    '  net: #21, reqid 1, INSTALLED, TUNNEL, ESP:AES_CBC-256/HMAC_SHA2_256_128',
    '    in  c1111111,   1024 bytes, 10 packets',
    '    out c2222222,   2048 bytes, 20 packets',
    'ikev2: #15, ESTABLISHED, IKEv2, 999888:777666',
    "  local  'vpn.example.com' @ 10.0.0.1[4500]",
    "  remote '172.20.10.2' @ 203.0.113.20[4500] EAP: 'alice'",
    '  remote virtual IP: 10.68.0.3',
    '  net: #22, reqid 2, INSTALLED, TUNNEL, ESP:AES_CBC-256/HMAC_SHA2_256_128',
    '    in  c3333333,   4096 bytes, 30 packets',
    '    out c4444444,   8192 bytes, 40 packets',
  ].join('\n');

  const parsed = parseSwanctlSasOutput(swanOut, 5);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'ikev2-5-12');
  assert.equal(parsed[1].id, 'ikev2-5-15');
  assert.equal(parsed[0].clientName, 'alice');
  assert.equal(parsed[1].clientName, 'alice');
  assert.equal(parsed[0].tunnelIp, '10.68.0.2');
  assert.equal(parsed[1].tunnelIp, '10.68.0.3');
  assert.equal(parsed[0].bytesIn, 1024);
  assert.equal(parsed[1].bytesOut, 8192);
});

test('Xray access.log parser extracts per-inbound multi-device IPs within active window', () => {
  const now = new Date(2026, 10, 19, 14, 0, 30).getTime();
  const log = [
    '2026/11/19 13:55:00.000000 from 198.51.100.99:1111 accepted tcp:1.1.1.1:443 [xr-vless-1 -> direct] email: alice',
    '2026/11/19 14:00:10.123456 from 203.0.113.10:54321 accepted tcp:1.1.1.1:443 [xr-vless-2 -> direct] email: alice',
    '2026/11/19 14:00:25.654321 from tcp:203.0.113.11:54322 accepted tcp:8.8.8.8:443 [xr-vless-2 -> direct] email: alice',
  ].join('\n');

  const res = parseXrayAccessLogContent(log, now, 45_000);
  assert.equal(res.has('vless-1::alice'), false);
  const ent = res.get('vless-2::alice');
  assert.ok(ent);
  assert.deepEqual(ent.ips, ['203.0.113.10', '203.0.113.11']);
  assert.equal(ent.lastIp, '203.0.113.11');
});

test('Daemon server configs render duplicate-cn, gate hooks, and IKEv2 XFRM interface IDs', () => {
  const ovpnCertCfg = renderInboundServerConfig(
    {
      id: 301,
      node_id: 1,
      protocol: 'openvpn',
      name: 'ovpn-cert',
      transport: 'udp',
      port: 1194,
      subnet: '10.8.0.0/24',
      auth_mode: 'cert',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(ovpnCertCfg.content, /duplicate-cn/);
  assert.match(ovpnCertCfg.content, /client-connect /);
  assert.match(ovpnCertCfg.content, /client-disconnect /);

  const ocCfg = renderInboundServerConfig(
    {
      id: 302,
      node_id: 1,
      protocol: 'openconnect',
      name: 'oc-hook',
      transport: 'tcp',
      port: 4443,
      subnet: '10.67.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(ocCfg.content, /connect-script = /);
  assert.match(ocCfg.content, /disconnect-script = /);

  const ikeCfg = renderInboundServerConfig(
    {
      id: 303,
      node_id: 1,
      protocol: 'ikev2',
      name: 'ike-xfrm',
      transport: 'udp',
      port: 500,
      subnet: '10.68.0.0/24',
      auth_mode: 'userpass',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: '',
      server_private_key: '',
      settings_json: '{}',
    },
    [],
  );
  assert.match(ikeCfg.content, /if_id_in = 1303/);
  assert.match(ikeCfg.content, /if_id_out = 1303/);
  assert.match(ikeCfg.content, /updown = /);
});

test('SessionGate edge cases: reservation pairing prevents double-counting, prototype safety, expiry/quota blocks, and xp-gate CLI', async () => {
  const db = getDb();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const ovpnRow = db.prepare("SELECT id, name FROM inbounds WHERE name = 'ovpn-gate'").get() as { id: number; name: string };

  // Dual-user client: reserve 1 hook slot, then simulate collector confirming it in connections_live
  const cDual = db
    .prepare(
      `INSERT INTO clients (name, owner_id, enabled, device_limit, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
       VALUES ('gate-dual', 1, 1, 2, 'tok-gate-dual', 'gp2', 'gpub2', 'gpass2', ?)`,
    )
    .run(nowIso);
  const cDualId = Number(cDual.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(cDualId, ovpnRow.id);

  // Expired client & quota-exhausted client
  db.prepare(
    `INSERT INTO clients (name, owner_id, enabled, expires_at, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
     VALUES ('gate-expired', 1, 1, '2020-01-01T00:00:00.000Z', 'tok-gate-exp', 'gp3', 'gpub3', 'gpass3', ?)`,
  ).run(nowIso);
  db.prepare(
    `INSERT INTO clients (name, owner_id, enabled, traffic_limit_bytes, traffic_used_bytes, sub_token, wg_private_key, wg_public_key, vpn_password, created_at)
     VALUES ('gate-usedup', 1, 1, 1000, 1000, 'tok-gate-used', 'gp4', 'gpub4', 'gpass4', ?)`,
  ).run(nowIso);

  syncGateStateFromDb(nowMs);
  const hooks = ensureDaemonGateHooks('ovpn-gate');

  // Prototype-property username must be rejected safely without throwing
  const protoAttempt = admitGateSession({
    clientName: 'constructor',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'proto-1',
    nowMs,
  });
  assert.equal(protoAttempt.ok, false);
  assert.equal(protoAttempt.reason, 'unknown_client');

  // Expired & quota-exhausted must be rejected even in cert mode
  const expAttempt = admitGateSession({
    clientName: 'gate-expired',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'exp-1',
    nowMs,
  });
  assert.equal(expAttempt.ok, false);
  assert.equal(expAttempt.reason, 'expired');

  const usedAttempt = admitGateSession({
    clientName: 'gate-usedup',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'used-1',
    nowMs,
  });
  assert.equal(usedAttempt.ok, false);
  assert.equal(usedAttempt.reason, 'quota_exhausted');

  // Device 1 admitted via hook reservation
  const d1 = admitGateSession({
    clientName: 'gate-dual',
    inboundName: 'ovpn-gate',
    protocol: 'openvpn',
    sessionId: 'ovpn-hook-ovpn-gate-1.1.1.1:1001',
    nowMs,
  });
  assert.equal(d1.ok, true);

  // Collector confirms Device 1 in connections_live 2s later -> must pair (count stays 1, NOT 2)
  db.prepare(
    `INSERT INTO connections_live (id, client_id, inbound_id, node_id, remote_ip, tunnel_ip, device, connected_at, bytes_in, bytes_out)
     VALUES (?, ?, ?, 1, '1.1.1.1', '10.71.0.2', 'OpenVPN', ?, 100, 200)`,
  ).run(`ovpn-${ovpnRow.id}-cid1`, cDualId, ovpnRow.id, new Date(nowMs + 2000).toISOString());

  syncGateStateFromDb(nowMs + 2000);
  const stAfterPair = readGateState();
  const dualSessions = Object.values(stAfterPair.liveSessions).filter((s) => s.clientId === cDualId);
  assert.equal(dualSessions.length, 1, 'Hook reservation must pair with collector live row instead of double-counting');

  // Device 2 must now succeed via the standalone xp-gate.mjs CLI (slot 2 of 2)
  const cleanEnv = (user: string, extra: Record<string, string>) => {
    const e: Record<string, string | undefined> = { ...process.env, ...extra };
    delete e.USERNAME;
    e.username = user;
    e.common_name = user;
    return e as NodeJS.ProcessEnv;
  };
  await execFileAsync(process.execPath, [hooks.gateScriptPath, 'openvpn-connect', 'ovpn-gate'], {
    env: cleanEnv('gate-dual', { untrusted_ip: '2.2.2.2', untrusted_port: '2002' }),
  });

  // Device 3 via xp-gate.mjs CLI must be rejected (2/2 occupied)
  await assert.rejects(() =>
    execFileAsync(process.execPath, [hooks.gateScriptPath, 'openvpn-connect', 'ovpn-gate'], {
      env: cleanEnv('gate-dual', { untrusted_ip: '3.3.3.3', untrusted_port: '3003' }),
    }),
  );

  // Disconnect Device 1 using fallback match (since collector replaced hook id with cid1) -> slot frees immediately
  await execFileAsync(process.execPath, [hooks.gateScriptPath, 'openvpn-disconnect', 'ovpn-gate'], {
    env: cleanEnv('gate-dual', { untrusted_ip: '1.1.1.1', untrusted_port: '1001' }),
  });

  // Device 3 can now connect immediately
  await execFileAsync(process.execPath, [hooks.gateScriptPath, 'openvpn-connect', 'ovpn-gate'], {
    env: cleanEnv('gate-dual', { untrusted_ip: '3.3.3.3', untrusted_port: '3003' }),
  });

  db.prepare('DELETE FROM connections_live WHERE client_id = ?').run(cDualId);
  syncGateStateFromDb(nowMs + 5000);
});
