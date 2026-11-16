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
const { parseCidr, allocateTunnelIp, isClientActiveQuota, getEligiblePeersForInbound, resolveClientTunnelIp } =
  await import('../src/services/peerResolver.js');
const { renderInboundServerConfig, renderInboundExtraFiles } = await import('../src/generators/configs.js');
const { generateClientProfile } = await import('../src/generators/profiles.js');
const { syncOpenVpnAuthScript } = await import('../src/drivers/pki.js');
const { getCurrentCommit, getUpdateState } = await import('../src/services/updater.js');

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
});

test('OpenVPN salted scrypt auth verifier accepts valid password and rejects invalid credentials', async () => {
  const scriptPath = syncOpenVpnAuthScript('ovpn-test', [
    { clientId: 1, name: 'alice', wgPublicKey: '', vpnPassword: 'Strong#Pass!99', tunnelIp: '10.8.0.2' },
  ]);

  const validCred = path.join(tempDir, 'cred-ok.txt');
  const badCred = path.join(tempDir, 'cred-bad.txt');
  fs.writeFileSync(validCred, 'alice\nStrong#Pass!99\n');
  fs.writeFileSync(badCred, 'alice\nwrong-password\n');

  await execFileAsync(process.execPath, [scriptPath, validCred]);
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, badCred]));
  await assert.rejects(() => execFileAsync(process.execPath, [scriptPath, path.join(tempDir, 'missing.txt')]));
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
