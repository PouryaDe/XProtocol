import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xprotocol-test-'));
process.env.XPROTOCOL_DATA_DIR = tempDir;
process.env.XPROTOCOL_ADMIN_PASS = 'test-pass-1234';
process.env.XPROTOCOL_SKIP_NET_FETCH = '1';

const { loadRuntimeConfig } = await import('../src/config.ts');
const { initDatabase, closeDb } = await import('../src/db/database.ts');
const { createApp } = await import('../src/index.ts');
const { computeTotp, generateTotpSecret } = await import('../src/security/totp.ts');

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Full panel API workflow: auth, 2FA, clients, subscription, RBAC, routing', async () => {
  const cfg = loadRuntimeConfig();
  initDatabase();
  const app = createApp(cfg);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Health check
    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    // 2. Login as owner
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-pass-1234' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0];
    const loginJson = (await loginRes.json()) as { csrfToken: string; account: { isOwner: boolean } };
    assert.equal(loginJson.account.isOwner, true);
    const csrf = loginJson.csrfToken;

    // 3. CSRF guard rejects POST without token
    const noCsrf = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad_req' }),
    });
    assert.equal(noCsrf.status, 403);

    // 4. Create client & check subscription page data
    const createClient = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'testuser1',
        trafficGb: 25,
        expiryMode: 'days',
        expiryDays: 30,
        deviceLimit: 2,
        groupIds: [1],
      }),
    });
    assert.equal(createClient.status, 201);

    const clientsList = await fetch(`${baseUrl}/api/clients`, { headers: { Cookie: cookie } }).then((r) => r.json());
    const created = clientsList.clients.find((c: { name: string }) => c.name === 'testuser1');
    assert.ok(created);

    const subData = await fetch(`${baseUrl}/sub/${created.subToken}/data`).then((r) => r.json());
    assert.equal(subData.client.name, 'testuser1');
    assert.ok(subData.protocolTabs.length >= 1);

    // 5. TOTP helper verification
    const secret = generateTotpSecret();
    const code = computeTotp(secret);
    assert.match(code, /^\d{6}$/);

    // 6. Create reseller & verify RBAC isolation
    const createReseller = await fetch(`${baseUrl}/api/accounts`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reseller1',
        password: 'reseller-pass-1234',
        roleId: 'reseller',
        trafficPoolGb: 100,
        allowedGroupIds: [1],
      }),
    });
    assert.equal(createReseller.status, 201);

    const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reseller1', password: 'reseller-pass-1234' }),
    });
    const resLoginJson = (await resLogin.json()) as { csrfToken: string };
    const resCookie = resLogin.headers.get('set-cookie')!.split(';')[0];
    const resClients = await fetch(`${baseUrl}/api/clients`, { headers: { Cookie: resCookie } }).then((r) => r.json());
    assert.equal(resClients.clients.length, 0);

    // Reseller cannot access owner-only /api/accounts or manage inbound preflight
    const forbidden = await fetch(`${baseUrl}/api/accounts`, { headers: { Cookie: resCookie } });
    assert.equal(forbidden.status, 403);
    const forbiddenPreflight = await fetch(`${baseUrl}/api/inbounds/preflight`, {
      method: 'POST',
      headers: { Cookie: resCookie, 'X-CSRF-Token': resLoginJson.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeIds: [1], port: 51821 }),
    });
    assert.equal(forbiddenPreflight.status, 403);

    // 7. Bulk client create with startNumber
    const bulkRes = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: 'vip',
        startNumber: 5,
        count: 3,
        trafficGb: 50,
        expiryMode: 'first_connect',
        expiryDays: 30,
      }),
    });
    assert.equal(bulkRes.status, 201);
    const bulkList = await fetch(`${baseUrl}/api/clients`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(bulkList.clients.some((c: { name: string }) => c.name === 'vip-05'));
    assert.ok(bulkList.clients.some((c: { name: string }) => c.name === 'vip-07'));

    // 8. Dashboard overview includes statusBreakdown & daily7
    const overview = await fetch(`${baseUrl}/api/dashboard/overview`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );
    assert.ok(overview.statusBreakdown);
    assert.equal(typeof overview.statusBreakdown.active, 'number');
    assert.equal(typeof overview.statusBreakdown.not_started, 'number');
    assert.ok(Array.isArray(overview.charts.daily7));

    // 9. Node protocols detection endpoint
    const protos = await fetch(`${baseUrl}/api/nodes/1/protocols`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );
    assert.ok(Array.isArray(protos.protocols));
    assert.ok(protos.protocols.some((p: { protocol: string }) => p.protocol === 'wireguard'));

    // 10. Multi-node & draft inbound creation
    const draftInbound = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'amneziawg',
        name: 'awg-draft',
        transport: 'udp',
        port: 51829,
        subnet: '10.99.0.0/24',
        nodeIds: [],
        settings: { jc: 4, jmin: 40, jmax: 70 },
      }),
    });
    assert.equal(draftInbound.status, 201);
    const draftJson = (await draftInbound.json()) as { id: number };
    const badPortPatch = await fetch(`${baseUrl}/api/inbounds/${draftJson.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: 99999 }),
    });
    assert.equal(badPortPatch.status, 400);

    // Long displayName slug must stay <= 15 chars for Linux IFNAMSIZ limit
    const longWgRes = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'wireguard',
        displayName: 'WireGuard Primary Production Tunnel',
        transport: 'udp',
        port: 51835,
        subnet: '10.97.0.0/24',
        nodeIds: [],
      }),
    });
    assert.equal(longWgRes.status, 201);
    const longWgJson = (await longWgRes.json()) as { id: number };
    const inboundList = (await fetch(`${baseUrl}/api/inbounds`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    )) as { inbounds: Array<{ id: number; name: string }> };
    const longWgInbound = inboundList.inbounds.find((i) => i.id === longWgJson.id);
    assert.ok(longWgInbound, 'Created long displayName inbound should be listed');
    assert.ok(
      longWgInbound.name.length > 0 && longWgInbound.name.length <= 15,
      `Expected Linux-safe interface slug <= 15 chars, got ${longWgInbound.name}`,
    );

    // 11. Routing Psiphon preset & geo-update
    const psiphonRes = await fetch(`${baseUrl}/api/routing/outbounds`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: 'psiphon' }),
    });
    assert.equal(psiphonRes.status, 201);

    const geoRes = await fetch(`${baseUrl}/api/routing/geo-update`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
    }).then((r) => r.json());
    assert.equal(typeof geoRes.ok, 'boolean');

    // 12. Telegram backup settings get/put
    const tgGet = await fetch(`${baseUrl}/api/settings/telegram-backup`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );
    assert.equal(tgGet.telegram.enabled, false);
    const tgPut = await fetch(`${baseUrl}/api/settings/telegram-backup`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, chatId: '-100123456', intervalHours: 12 }),
    });
    assert.equal(tgPut.status, 200);
    const tgAfter = await fetch(`${baseUrl}/api/settings/telegram-backup`, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );
    assert.equal(tgAfter.telegram.enabled, true);
    assert.equal(tgAfter.telegram.chatId, '-100123456');
    assert.equal(tgAfter.telegram.intervalHours, 12);

    // 13. Static assets under /sub/assets/* must never return HTML fallback
    const missingAsset = await fetch(`${baseUrl}/sub/assets/does-not-exist.js`);
    if (missingAsset.status === 200) {
      // web/dist absent fallback returns JSON root only when webDist does not exist
      const ct = missingAsset.headers.get('content-type') || '';
      assert.ok(!ct.includes('text/html'), 'Missing asset under /sub/assets must not serve text/html');
    } else {
      assert.equal(missingAsset.status, 404);
    }
    const subHtmlRes = await fetch(`${baseUrl}/sub/test-token`);
    const subHtmlText = await subHtmlRes.text();
    const jsMatch = subHtmlText.match(/assets\/(index-[^"']+\.js)/);
    if (jsMatch) {
      const subAssetRes = await fetch(`${baseUrl}/sub/assets/${jsMatch[1]}`);
      assert.equal(subAssetRes.status, 200);
      assert.match(subAssetRes.headers.get('content-type') || '', /javascript/);
    }
  } finally {
    server.close();
  }
});

test('VPN backend engine: peer eligibility, NAT/AmneziaWG config, OpenVPN static key, speed limits, periodic reset', async () => {
  const { getDb } = await import('../src/db/database.js');
  const { getEligiblePeersForInbound } = await import('../src/services/peerResolver.js');
  const { renderInboundServerConfig, renderInboundExtraFiles } = await import('../src/generators/configs.js');
  const { generateClientProfile } = await import('../src/generators/profiles.js');
  const { ensureOpenVpnPki } = await import('../src/drivers/pki.js');
  const { runPeriodicResets } = await import('../src/services/collector.js');

  const db = getDb();
  const wgRow = db.prepare("SELECT * FROM inbounds WHERE protocol = 'wireguard' LIMIT 1").get() as Record<string, unknown>;
  assert.ok(wgRow);

  // Mark one client as used_up and verify exclusion from eligible peers
  const vip5 = db.prepare("SELECT id FROM clients WHERE name = 'vip-05'").get() as { id: number };
  const vip6 = db.prepare("SELECT id FROM clients WHERE name = 'vip-06'").get() as { id: number };
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(vip5.id, wgRow.id);
  db.prepare('INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id) VALUES (?, ?)').run(vip6.id, wgRow.id);
  db.prepare('UPDATE clients SET traffic_limit_bytes = 1000, traffic_used_bytes = 1500 WHERE id = ?').run(vip5.id);
  db.prepare('UPDATE clients SET download_mbps = 25, upload_mbps = 10 WHERE id = ?').run(vip6.id);

  const peers = getEligiblePeersForInbound(Number(wgRow.id), String(wgRow.subnet));
  assert.equal(peers.some((p) => p.clientId === vip5.id), false, 'Used-up client must be excluded from server peers');
  const vip6Peer = peers.find((p) => p.clientId === vip6.id);
  assert.ok(vip6Peer);
  assert.equal(vip6Peer.downloadMbps, 25);
  assert.equal(vip6Peer.uploadMbps, 10);

  // Verify periodic reset clears used_up client once next_reset_at elapses
  db.prepare("UPDATE clients SET reset_period = 'daily', next_reset_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(
    vip5.id,
  );
  const reactivated = await runPeriodicResets();
  assert.equal(reactivated, true);
  const afterReset = db.prepare('SELECT traffic_used_bytes FROM clients WHERE id = ?').get(vip5.id) as {
    traffic_used_bytes: number;
  };
  assert.equal(afterReset.traffic_used_bytes, 0);

  // Verify WireGuard + AmneziaWG nested settings + NAT PostUp rendering
  const awgRendered = renderInboundServerConfig(
    {
      id: 99,
      node_id: 1,
      protocol: 'wireguard',
      name: 'awg-test',
      transport: 'udp',
      port: 51830,
      subnet: '10.88.0.0/23',
      auth_mode: 'device_keys',
      description: '',
      public_address_override: '',
      enabled: 1,
      running: 1,
      cert_id: null,
      server_public_key: 'PUBKEY',
      server_private_key: 'PRIVKEY',
      settings_json: JSON.stringify({
        obfuscation: 'amnezia',
        nat: true,
        amnezia: { Jc: 7, Jmin: 55, Jmax: 110, S1: 22, S2: 33, H1: 101, H2: 102, H3: 103, H4: 104 },
      }),
    },
    peers,
  );
  assert.match(awgRendered.path, /\/etc\/amnezia\/amneziawg\/awg-test\.conf/);
  assert.match(awgRendered.content, /Address = 10\.88\.0\.1\/23/);
  assert.match(awgRendered.content, /PostUp = .*MASQUERADE/);
  assert.match(awgRendered.content, /TCPMSS --set-mss 1240/);
  assert.match(awgRendered.content, /Jc = 7/);

  // Verify OpenVPN PKI static ta.key + management socket + L2TP extra files
  await ensureOpenVpnPki();
  const ovpnRow = db.prepare("SELECT * FROM inbounds WHERE protocol = 'openvpn' LIMIT 1").get() as Record<string, unknown>;
  assert.ok(ovpnRow);
  const ovpnCfg = renderInboundServerConfig(ovpnRow as never, peers);
  assert.match(ovpnCfg.content, /management \/var\/run\/xprotocol-/);
  const ovpnProf = generateClientProfile({
    clientName: 'vip-06',
    vpnPassword: 'pass',
    wgPrivateKey: 'k',
    fixedIp: '',
    clientIndex: vip6.id,
    inbound: ovpnRow as never,
    endpointHost: '1.2.3.4',
    nodeName: 'This server',
  });
  assert.match(ovpnProf.content, /<tls-crypt>/);

  const l2tpExtra = renderInboundExtraFiles(
    {
      ...(wgRow as never),
      protocol: 'l2tp',
      name: 'l2tp500',
      settings_json: JSON.stringify({ psk: 'secret123', pppMtu: 1400 }),
    },
    peers,
  );
  assert.ok(l2tpExtra.some((f) => f.path.includes('/etc/ppp/options.xl2tpd.l2tp500')));
  assert.ok(l2tpExtra.some((f) => f.content.includes('secret = "secret123"')));
});
