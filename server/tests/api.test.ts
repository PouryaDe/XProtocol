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
    const resCookie = resLogin.headers.get('set-cookie')!.split(';')[0];
    const resClients = await fetch(`${baseUrl}/api/clients`, { headers: { Cookie: resCookie } }).then((r) => r.json());
    assert.equal(resClients.clients.length, 0);

    // Reseller cannot access owner-only /api/accounts
    const forbidden = await fetch(`${baseUrl}/api/accounts`, { headers: { Cookie: resCookie } });
    assert.equal(forbidden.status, 403);

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
  } finally {
    server.close();
  }
});
