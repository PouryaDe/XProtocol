import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xprotocol-ovira20-test-'));
process.env.XPROTOCOL_DATA_DIR = tempDir;
process.env.XPROTOCOL_ADMIN_PASS = 'ovira20-owner-pass';
process.env.XPROTOCOL_SKIP_NET_FETCH = '1';

const { loadRuntimeConfig } = await import('../src/config.js');
const { initDatabase, closeDb, getDb } = await import('../src/db/database.js');
const { createApp } = await import('../src/index.js');
const { computeNextResetIso } = await import('../src/services/resetSchedule.js');
const {
  buildXrayPresetDefaults,
  validateXraySettings,
  buildUnifiedXrayConfig,
  buildClientXrayServerViews,
} = await import('../src/drivers/xrayEngine.js');
const { encryptBackupBuffer, decryptBackupBuffer, extractSqliteBackup } = await import('../src/services/offsiteBackup.js');
const { recordNodeHealthSample, buildNodeUptimeSummary, getNodeHealthSeries } = await import('../src/services/nodeHealth.js');
const { validateWebhookUrl } = await import('../src/services/events.js');
const { computeTotp, generateTotpSecret } = await import('../src/security/totp.js');

initDatabase();

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Reset schedule supports yearly, every_n_days, jalali_monthly, and jalali_yearly in Asia/Tehran', () => {
  const fromMs = Date.parse('2026-06-10T10:00:00.000Z'); // Khordad 20, 1405 SH

  const yearly = computeNextResetIso('yearly', { fromMs, timeZone: 'UTC', resetAnchor: 0 });
  assert.equal(yearly, '2027-01-01T00:00:00.000Z');

  const anchorStartMs = Date.parse('2026-06-05T00:00:00.000Z');
  const every10 = computeNextResetIso('every_n_days', { fromMs, resetEveryDays: 10, anchorStartMs, timeZone: 'UTC' });
  assert.equal(every10, '2026-06-15T00:00:00.000Z');

  const jalaliMonth = computeNextResetIso('jalali_monthly', { fromMs, timeZone: 'Asia/Tehran' });
  assert.ok(jalaliMonth);
  const jmParts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(jalaliMonth!));
  assert.match(jmParts, /^4\/1(?:\/|$)/); // Tir 1 (month 4 day 1)

  const jalaliYear = computeNextResetIso('jalali_yearly', { fromMs, timeZone: 'Asia/Tehran' });
  assert.ok(jalaliYear);
  const jyParts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(jalaliYear!));
  assert.match(jyParts, /^1\/1(?:\/|$)/); // Farvardin 1 (Nowruz)
});

test('Xray presets, combo validation, unified server config, and leak-free share URIs', () => {
  assert.equal(validateXraySettings({ protocol: 'vless', transport: 'ws', security: 'reality' }) !== null, true);
  assert.equal(validateXraySettings({ protocol: 'vless', transport: 'raw', security: 'reality' }), null);
  assert.equal(validateXraySettings({ protocol: 'trojan', transport: 'grpc', security: 'tls' }), null);
  assert.equal(validateXraySettings({ protocol: 'shadowsocks', transport: 'raw', security: 'none', method: '2022-blake3-aes-128-gcm' }), null);

  const preset = buildXrayPresetDefaults('direct', 1);
  assert.equal(preset.settings.protocol, 'vless');
  assert.equal(preset.settings.security, 'reality');
  const pbk = String(preset.settings.realityPublicKey || '');
  const priv = String(preset.settings._realityPrivateKey || '');
  assert.ok(pbk.length > 20);
  assert.ok(priv.length > 20);

  const db = getDb();
  const clientUuid = crypto.randomUUID();
  const ssPass = 'dGVzdC1zczIwMjItcGFzcw==';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clients (name, owner_id, sub_token, wg_private_key, wg_public_key, vpn_password, xray_uuid, ss_password, enabled, expires_at, created_at)
     VALUES ('xray-active', 1, 'tok-xray-active', 'wgpriv1', 'wgpub1', 'trpass1', ?, ?, 1, NULL, ?)`,
  ).run(clientUuid, ssPass, now);
  db.prepare(
    `INSERT INTO clients (name, owner_id, sub_token, wg_private_key, wg_public_key, vpn_password, xray_uuid, ss_password, enabled, expires_at, created_at)
     VALUES ('xray-disabled', 1, 'tok-xray-disabled', 'wgpriv2', 'wgpub2', 'trpass2', ?, ?, 0, NULL, ?)`,
  ).run(crypto.randomUUID(), ssPass, now);

  const ibRes = db
    .prepare(
      `INSERT INTO inbounds (node_id, protocol, name, transport, port, subnet, auth_mode, description, public_address_override, enabled, running, server_public_key, settings_json, created_at)
       VALUES (1, 'xray', 'vless-reality-test', 'tcp', 28443, '10.99.0.0/24', 'xray', '', 'vpn.example.com', 1, 1, ?, ?, ?)`,
    )
    .run(pbk, JSON.stringify({ ...preset.settings, displayName: 'Direct VLESS' }), now);
  const inboundId = Number(ibRes.lastInsertRowid);

  // Assign both clients to group 1 and grant group 1 to our Xray inbound
  const activeClient = db.prepare("SELECT * FROM clients WHERE name = 'xray-active'").get() as { id: number };
  const disabledClient = db.prepare("SELECT * FROM clients WHERE name = 'xray-disabled'").get() as { id: number };
  db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, 1)').run(activeClient.id);
  db.prepare('INSERT OR IGNORE INTO client_groups (client_id, group_id) VALUES (?, 1)').run(disabledClient.id);
  db.prepare('INSERT OR IGNORE INTO group_inbounds (group_id, inbound_id) VALUES (1, ?)').run(inboundId);

  const built = buildUnifiedXrayConfig();
  assert.equal(built.hasActiveXray, true);
  const parsed = JSON.parse(built.configJson) as {
    stats: Record<string, unknown>;
    api: { tag: string };
    inbounds: Array<{ tag: string; port?: number; settings?: { clients?: Array<{ id?: string; email?: string }> } }>;
  };
  assert.ok(parsed.stats);
  assert.equal(parsed.api.tag, 'api');
  const vlessIb = parsed.inbounds.find((i) => i.tag === 'xr-vless-reality-test');
  assert.ok(vlessIb);
  assert.equal(vlessIb.port, 28443);
  const emails = (vlessIb.settings?.clients || []).map((c) => c.email);
  assert.ok(emails.includes('xray-active'));
  assert.equal(emails.includes('xray-disabled'), false);

  // Share URIs must contain public key (pbk) & UUID, and NEVER leak the private key
  const row = db
    .prepare(
      `SELECT i.*, n.name as node_name, n.address as node_address, n.connect_addresses_json
       FROM inbounds i LEFT JOIN nodes n ON n.id = i.node_id WHERE i.id = ?`,
    )
    .get(inboundId) as {
    id: number;
    name: string;
    port: number;
    public_address_override: string;
    server_public_key: string;
    settings_json: string;
    node_name: string;
    node_address: string;
    connect_addresses_json: string;
  };
  const views = buildClientXrayServerViews(
    { id: activeClient.id, name: 'xray-active', xrayUuid: clientUuid, vpnPassword: 'trpass1', ssPassword: ssPass },
    [row],
    'vpn.example.com',
  );
  assert.equal(views.length, 1);
  assert.ok(views[0].links[0].startsWith(`vless://${clientUuid}@vpn.example.com:28443`));
  assert.ok(views[0].links[0].includes(`pbk=${encodeURIComponent(pbk)}`));
  assert.equal(views[0].links[0].includes(priv), false);
});

test('.ovbk AES-256-GCM backup encryption/decryption and SQLite extraction roundtrip', () => {
  const sampleSqlite = Buffer.from('SQLite format 3\0dummy-database-payload-for-roundtrip');
  const gz = zlib.gzipSync(sampleSqlite);
  const enc = encryptBackupBuffer(gz, 'super-secret-ovbk');
  assert.equal(enc.subarray(0, 6).toString('binary'), 'XPBK01');
  const dec = decryptBackupBuffer(enc, 'super-secret-ovbk');
  assert.deepEqual(dec, gz);
  const extracted = extractSqliteBackup(enc, 'super-secret-ovbk');
  assert.deepEqual(extracted, sampleSqlite);
  assert.throws(() => extractSqliteBackup(enc, 'wrong-password'));
});

test('Node health sample recording, 90-day uptime summary, and chart series', () => {
  recordNodeHealthSample(true);
  const uptime = buildNodeUptimeSummary(1, 90);
  assert.equal(uptime.days.length, 90);
  assert.ok((uptime.pct30 ?? -1) >= 0 && (uptime.pct30 ?? -1) <= 100);
  const series = getNodeHealthSeries(1, '24h');
  assert.ok(Array.isArray(series.points));
  assert.ok(series.points.length >= 1);
});

test('Ovira 2.0 end-to-end API: templates, bulk actions, proxy app sub, events, webhooks, backups, metrics, node allowlist & 2FA/ban protection', async () => {
  const cfg = loadRuntimeConfig();
  const app = createApp(cfg);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Login as owner
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'ovira20-owner-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0];
    const loginJson = (await loginRes.json()) as { csrfToken: string };
    const headers = { Cookie: cookie, 'X-CSRF-Token': loginJson.csrfToken, 'Content-Type': 'application/json' };

    // 2. Xray route endpoints: presets, keygen, create Xray inbound, rotate keys
    const presetsRes = await fetch(`${baseUrl}/api/xray/presets`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(presetsRes.items.length >= 6);

    const newIbRes = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        protocol: 'xray',
        nodeId: 1,
        preset: 'cdn',
        port: 28444,
        cdnHost: 'cdn.example.com',
        groupIds: [1],
      }),
    });
    assert.equal(newIbRes.status, 201);
    const createdIb = (await newIbRes.json()) as { id: number; ids: number[] };
    assert.ok(createdIb.id > 0);

    const rotRes = await fetch(`${baseUrl}/api/inbounds/${createdIb.id}/xray/reality-keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(rotRes.status, 200);

    // 3. Client template creation & reseller templatesOnly enforcement
    const tplRes = await fetch(`${baseUrl}/api/client-templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Gold 50GB 30d',
        settings: {
          trafficLimit: 50,
          days: 30,
          maxDevices: 2,
          speedDown: 10,
          resetStrategy: 'jalali_monthly',
          groups: [1],
        },
      }),
    });
    assert.equal(tplRes.status, 201);
    const tplJson = (await tplRes.json()) as { id: number };

    // Create reseller restricted to templatesOnly = true & ownSubOrigins = true
    const createReseller = await fetch(`${baseUrl}/api/accounts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: 'reseller_tpl',
        password: 'reseller-tpl-pass-1',
        roleId: 'reseller',
        trafficPoolGb: 500,
        allowedGroupIds: [1],
        overrideTemplatesOnly: true,
        allowedTemplateIds: [tplJson.id],
      }),
    });
    assert.equal(createReseller.status, 201);

    const rLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reseller_tpl', password: 'reseller-tpl-pass-1' }),
    });
    const rCookie = rLogin.headers.get('set-cookie')!.split(';')[0];
    const rCsrf = ((await rLogin.json()) as { csrfToken: string }).csrfToken;
    const rHeaders = { Cookie: rCookie, 'X-CSRF-Token': rCsrf, 'Content-Type': 'application/json' };

    // Custom client without templateId must be rejected with 403
    const blockedCustom = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: rHeaders,
      body: JSON.stringify({ name: 'custom_attempt', trafficGb: 10, expiryMode: 'never' }),
    });
    assert.equal(blockedCustom.status, 403);

    // Creating using templateId must succeed
    const allowedFromTpl = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: rHeaders,
      body: JSON.stringify({ name: 'tpl_user_1', templateId: tplJson.id }),
    });
    assert.equal(allowedFromTpl.status, 201);
    const createdClient = (await allowedFromTpl.json()) as { ids: number[]; items: Array<{ id: number; subToken: string }> };
    const createdItem = createdClient.items[0];

    // 4. Proxy app subscription endpoint (Happ / v2rayNG)
    const subAppRes = await fetch(`${baseUrl}/sub/${createdItem.subToken}`, {
      headers: { 'User-Agent': 'Happ/2.1.0' },
    });
    assert.equal(subAppRes.status, 200);
    const subUserInfo = subAppRes.headers.get('subscription-userinfo');
    assert.ok(subUserInfo && subUserInfo.includes('total='));
    assert.ok(subAppRes.headers.get('profile-title'));
    const bodyText = await subAppRes.text();
    const decoded = Buffer.from(bodyText.trim(), 'base64').toString('utf8');
    assert.ok(decoded.includes('vless://'));

    // 5. Bulk actions by owner
    const bulkSpeed = await fetch(`${baseUrl}/api/clients/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'set_speed', ids: [createdItem.id], downloadMbps: 5 }),
    });
    assert.equal(bulkSpeed.status, 200);

    // 6. Events bell + Webhooks CRUD + test delivery
    const evList = await fetch(`${baseUrl}/api/events`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(Array.isArray(evList) && evList.length >= 1);

    const whCreate = await fetch(`${baseUrl}/api/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: 'https://hooks.example.com/ovira',
        events: ['client.created'],
        includeSubLink: true,
      }),
    });
    assert.equal(whCreate.status, 201);
    const whJson = (await whCreate.json()) as { item: { id: number }; secret: string };
    assert.ok(whJson.secret.startsWith('whsec_'));

    const whTest = await fetch(`${baseUrl}/api/webhooks/${whJson.item.id}/test`, { method: 'POST', headers });
    assert.equal(whTest.status, 200);
    const whTestJson = (await whTest.json()) as { ok: boolean };
    assert.equal(whTestJson.ok, true);

    // 7. Prometheus metrics & node allow-from / rotate-key / health
    const metricsRes = await fetch(`${baseUrl}/api/metrics`, { headers: { Cookie: cookie } });
    assert.equal(metricsRes.status, 200);
    const metricsTxt = await metricsRes.text();
    assert.ok(metricsTxt.includes('xprotocol_clients_total'));

    const allowRes = await fetch(`${baseUrl}/api/nodes/1/allow-from`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ allowFrom: ['10.0.0.0/8'] }),
    });
    assert.equal(allowRes.status, 200);

    const nodeHealthRes = await fetch(`${baseUrl}/api/nodes/1/health?range=24h`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(Array.isArray(nodeHealthRes.uptime?.days));

    // 8. Backup destination CRUD (S3)
    const bkRes = await fetch(`${baseUrl}/api/backup/destinations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 's3',
        name: 'MinIO Offsite',
        encrypt: true,
        s3: { endpoint: 'https://s3.example.com', bucket: 'backups', accessKey: 'AKIAEXAMPLE', region: 'us-east-1' },
        secrets: { secretKey: 'secret-key', passphrase: 'bk-passphrase' },
      }),
    });
    assert.equal(bkRes.status, 201);

    // 9. Fresh 2FA confirmation requirement & sign-in ban escalation
    const totpSecret = generateTotpSecret();
    const en2fa = await fetch(`${baseUrl}/api/auth/me/2fa/enable`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ secret: totpSecret, code: computeTotp(totpSecret) }),
    });
    assert.equal(en2fa.status, 200);

    // Changing metricsRoot with stale 2FA window must return 403 mfa_confirm_required
    const db = getDb();
    db.prepare("UPDATE sessions SET mfa_confirmed_at = '2000-01-01T00:00:00.000Z'").run();
    const blockedSec = await fetch(`${baseUrl}/api/settings/general`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ metricsRoot: true }),
    });
    assert.equal(blockedSec.status, 403);
    const blockedJson = (await blockedSec.json()) as { code?: string };
    assert.equal(blockedJson.code, 'mfa_confirm_required');

    // Confirm 2FA and retry -> succeeds
    const confirm2fa = await fetch(`${baseUrl}/api/auth/me/2fa/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: computeTotp(totpSecret) }),
    });
    assert.equal(confirm2fa.status, 200);

    const okSec = await fetch(`${baseUrl}/api/settings/general`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ metricsRoot: true }),
    });
    assert.equal(okSec.status, 200);

    // Trigger escalating ban via 5 wrong logins
    for (let i = 0; i < 6; i++) {
      await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ban_victim', password: 'wrong-password' }),
      });
    }
    const lockedTry = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ban_victim', password: 'wrong-password' }),
    });
    assert.equal(lockedTry.status, 429);
    const bansList = await fetch(`${baseUrl}/api/settings/security/bans`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(bansList.items.some((b: { target: string; active: boolean }) => b.target === 'ban_victim' && b.active));

    // 10. Edge-case & security boundary tests:
    // a) templatesOnly reseller cannot tamper quota via PATCH, but CAN update note
    const tamperPatch = await fetch(`${baseUrl}/api/clients/${createdItem.id}`, {
      method: 'PATCH',
      headers: rHeaders,
      body: JSON.stringify({ trafficGb: 999 }),
    });
    assert.equal(tamperPatch.status, 403);

    const safeNotePatch = await fetch(`${baseUrl}/api/clients/${createdItem.id}`, {
      method: 'PATCH',
      headers: rHeaders,
      body: JSON.stringify({ note: 'Customer #42' }),
    });
    assert.equal(safeNotePatch.status, 200);

    // b) non-owner cannot move_owner in bulk, nor bulk set_devices on templatesOnly role
    const badMove = await fetch(`${baseUrl}/api/clients/bulk`, {
      method: 'POST',
      headers: rHeaders,
      body: JSON.stringify({ action: 'move_owner', ids: [createdItem.id], ownerId: 1 }),
    });
    assert.equal(badMove.status, 403);

    const badBulkDev = await fetch(`${baseUrl}/api/clients/bulk`, {
      method: 'POST',
      headers: rHeaders,
      body: JSON.stringify({ action: 'set_devices', ids: [createdItem.id], maxDevices: 50 }),
    });
    const badBulkDevJson = (await badBulkDev.json()) as { done: number; failed: string[] };
    assert.equal(badBulkDevJson.done, 0);
    assert.ok(badBulkDevJson.failed.length === 1);

    // c) Reseller without ownSubOrigins gets 403; after assigning a role with ownSubOrigins: true it reads & writes sub_apps_json cleanly
    const deniedSubApps = await fetch(`${baseUrl}/api/account/sub-apps`, {
      method: 'PUT',
      headers: rHeaders,
      body: JSON.stringify({ title: 'Should Fail' }),
    });
    assert.equal(deniedSubApps.status, 403);

    const rolesRes = await fetch(`${baseUrl}/api/accounts/roles`, { headers: { Cookie: cookie } }).then((r) => r.json());
    const baseResellerRole = rolesRes.roles.find((r: { id: string }) => r.id === 'reseller');
    const customRoleRes = await fetch(`${baseUrl}/api/accounts/roles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Reseller SubDomain',
        permissions: { ...baseResellerRole.permissions, ownSubOrigins: true },
        limits: baseResellerRole.limits,
      }),
    });
    assert.equal(customRoleRes.status, 201);
    const customRoleJson = (await customRoleRes.json()) as { id: string };
    const rAcctId = (db.prepare("SELECT id FROM accounts WHERE username = 'reseller_tpl'").get() as { id: number }).id;
    await fetch(`${baseUrl}/api/accounts/${rAcctId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ roleId: customRoleJson.id }),
    });

    const rSubAppsPut = await fetch(`${baseUrl}/api/account/sub-apps`, {
      method: 'PUT',
      headers: rHeaders,
      body: JSON.stringify({ title: 'Reseller VPN', supportUrl: 'https://t.me/reseller_help' }),
    });
    assert.equal(rSubAppsPut.status, 200);
    const rSubAppsGet = await fetch(`${baseUrl}/api/account/sub-apps`, { headers: { Cookie: rCookie } }).then((r) => r.json());
    assert.equal(rSubAppsGet.title, 'Reseller VPN');

    // d) Path traversal rejected on backup restore, invalid domain rejected on SNI probe, loopback rejected on SSRF check
    const bkCreated = (await bkRes.json()) as { id: number };
    const badRestore = await fetch(`${baseUrl}/api/backup/destinations/${bkCreated.id}/restore`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileName: '../etc/passwd' }),
    });
    assert.equal(badRestore.status, 400);

    const badSni = await fetch(`${baseUrl}/api/xray/sni/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ node: 1, domains: ['not valid;cmd'] }),
    });
    assert.equal(badSni.status, 400);

    const ssrfRes = await validateWebhookUrl('http://127.0.0.1:8080/hook', false);
    assert.equal(ssrfRes.ok, false);

    // 9. Smart DNS + Telegram proxy + Xray custom remotes flow
    const dnsRes = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'smartdns',
        nodeId: 1,
        displayName: 'dns53',
        groupIds: [1],
        settings: { dnsCategories: ['games', 'ai'], maxAddressesPerClient: 2 },
      }),
    });
    assert.equal(dnsRes.status, 201);
    const dnsJson = (await dnsRes.json()) as { id: number };
    const dnsCfg = await fetch(`${baseUrl}/api/inbounds/${dnsJson.id}/config`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(String(dnsCfg.path).includes('/smartdns/'));
    assert.ok(String(dnsCfg.content).includes('"port": 53'));

    const tgRes = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'telegram',
        nodeId: 1,
        port: 8443,
        displayName: 'tg8443',
        groupIds: [1],
        settings: { tgFakeTls: true, fakeTlsDomain: 'www.cloudflare.com' },
      }),
    });
    assert.equal(tgRes.status, 201);
    const tgJson = (await tgRes.json()) as { id: number };
    const tgCfg = await fetch(`${baseUrl}/api/inbounds/${tgJson.id}/config`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(String(tgCfg.path).includes('/telegram/'));
    assert.ok(String(tgCfg.content).includes('"engine": "telemt"'));

    const xrayRemotesRes = await fetch(`${baseUrl}/api/inbounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'xray',
        preset: 'direct',
        nodeId: 1,
        port: 29443,
        groupIds: [1],
        settings: {
          remotes: [
            { flag: '🇩🇪', label: 'DE Relay', host: 'de.example.com', port: '8443', sni: 'www.microsoft.com' },
          ],
        },
      }),
    });
    assert.equal(xrayRemotesRes.status, 201);

    const clientsList = await fetch(`${baseUrl}/api/clients`, { headers: { Cookie: cookie } }).then((r) => r.json());
    const anyToken = String(clientsList.clients?.[0]?.subToken || '');
    if (anyToken) {
      const subData = await fetch(`${baseUrl}/sub/${anyToken}/data`).then((r) => r.json());
      const tabIds = (subData.protocolTabs as Array<{ id: string }>).map((t) => t.id);
      assert.ok(tabIds.includes('smartdns'));
      assert.ok(tabIds.includes('telegram'));
      const tgTab = (subData.protocolTabs as Array<{ id: string; profiles: Array<{ uri?: string }> }>).find((t) => t.id === 'telegram');
      assert.ok(String(tgTab?.profiles?.[0]?.uri || '').startsWith('tg://proxy?'));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
