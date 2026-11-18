# Subscriptions, Security, Events, Backups & Metrics Reference

## Proxy App Subscription Headers (`server/src/routes/subRoutes.ts`)
- Triggered when `User-Agent` matches proxy clients (`happ`, `v2rayng`, `v2rayn`, `hiddify`, `karing`, `clash`, `shadowrocket`, `sing-box`, `streisand`, `nekobox`, `loon`, `surge`, `quantumult`) or `?format=raw|base64`.
- Headers emitted:
  - `subscription-userinfo: upload=<u>; download=<d>; total=<limit>; expire=<unix>`
  - `profile-title: base64:<utf8_b64>`
  - `profile-update-interval: <hours>`
  - `support-url`, `profile-web-page-url`, `announce: base64:<utf8_b64>`, and `providerid` (Happ).
- Depleted/expired accounts optionally append an explanatory status node when `proxy_apps.expiredEntry` is true.

## Events & Webhooks (`server/src/services/events.ts`)
- Signed with `HMAC-SHA256(secret, "${ts}.${body}")`: sends both `X-XProtocol-Signature` and `X-Ovira-Signature` (`t=${ts},v1=${sig}`).
- Validates URLs against private/loopback/metadata IP ranges via DNS resolution unless `allowPrivate` is enabled by owner.
- Retries transient errors with backoff; HTTP `410` auto-disables webhook.

## Off-site Encrypted Backups (`.ovbk`) (`server/src/services/offsiteBackup.ts`)
- Format: `XPBK01\0\0` (8B) | `salt` (16B) | `iv` (12B) | `authTag` (16B) | `AES-256-GCM(gzip(sqliteBackup))`, key derived via `crypto.scryptSync(passphrase, salt, 32)`.
- Destinations stored in `backup_destinations` (`s3` SigV4 or `sftp` via `sshpass`/key + `KnownHosts` fingerprint check).
- Scheduled every 60s (`startOffsiteBackupScheduler()`), pruning old files by `retention.keepLast` and `retention.maxDays`.

## Security Controls (`loginGuard.ts`, `authRoutes.ts`, `context.ts`, `nodeRoutes.ts`)
- **Escalating Bans**: 5 failed logins within 10 minutes -> ban duration steps `10m -> 1h -> 24h -> 7d` (`security_bans`). Exempt IPs: `general.loginAllowCidrs`. Lockdown flag: `general.loginOnlyAllowCidrs` (validates caller IP first).
- **Fresh 2FA Confirmation**: `requireFreshMfa` requires `mfa_confirmed_at` within 300s when `totpEnabled`; returns `403 { code: 'mfa_confirm_required' }`.
- **Node Security**: `nodes.allow_from_json` restricts node agent callbacks; `POST /api/nodes/:id/rotate-key` regenerates node token cleanly.
- **Prometheus (`metricsRoutes.ts`)**: Exports `xprotocol_clients_total`, `xprotocol_clients_online`, `xprotocol_traffic_bytes_total`, `xprotocol_node_up`, `xprotocol_node_cpu_ratio`, etc.
