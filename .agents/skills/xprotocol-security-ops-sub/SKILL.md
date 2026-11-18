---
name: xprotocol-security-ops-sub
description: >-
  Proxy-app subscription headers and formats (Happ, v2rayNG, Hiddify), events
  bell, Telegram bot notifications, HMAC webhooks with SSRF protection, S3/SFTP
  off-site encrypted (.ovbk) backups, node health telemetry, Prometheus /metrics,
  escalating login bans, CIDR allowlists, and fresh 2FA confirmation.
---

# XProtocol Subscriptions, Security & Ops

## Fast Reference
Read [ops-and-security.md](./references/ops-and-security.md) for header formats, webhook event types, `.ovbk` crypto layout, and security thresholds.

## Subsystems & Exact Rules
- **Proxy App Subscriptions (`server/src/routes/subRoutes.ts`)**:
  - `GET /:subPath/:token` distinguishes browsers (HTML shell or `/data` JSON) from proxy clients (`User-Agent` matching Happ, v2rayNG, v2rayN, Hiddify, Karing, Clash, Shadowrocket, Sing-box, Streisand, Nekobox, etc., or `?format=raw|base64`).
  - Returns Base64 (or raw) share URIs from `buildClientXrayServerViews()` with response headers: `subscription-userinfo`, base64-encoded `profile-title`, `profile-update-interval`, `support-url`, `announce`, and `providerid` (Happ).
  - Applies per-reseller overrides from `accounts.sub_apps_json` and primary domain from `subOrigins.ts`.
- **Events, Telegram & Webhooks (`server/src/services/events.ts`, `eventsRoutes.ts`)**:
  - `emitEvent({ type, ownerId, subject, data })` inserts into `events`, pushes HTML alerts to linked `accounts.telegram_chat_id`, and enqueues webhook deliveries with `X-XProtocol-Signature` & `X-Ovira-Signature` (`t=<ts>,v1=<hmac_sha256>`), SSRF blocking (unless `allowPrivate` by owner), retries, and HTTP `410` auto-disable.
- **Off-site Backups (`server/src/services/offsiteBackup.ts`, `backupRoutes.ts`)**:
  - Supports S3 (SigV4) and SFTP (host-key fingerprint pinning via `accept-hostkey`), `.ovbk` AES-256-GCM encryption (`XPBK01\0\0` + 16B salt + 12B IV + 16B tag + scrypt key), 60s scheduler, and `keepLast` / `maxDays` retention pruning.
- **Node Health & Prometheus (`server/src/services/nodeHealth.ts`, `metricsRoutes.ts`)**:
  - 5-minute raw samples in `node_health_samples`, hourly rollup after `nodeSampleRawDays`, 90-day uptime buckets + `GET /api/nodes/:id/health?range=24h|7d|30d|90d`.
  - `GET /api/metrics` (authenticated) and optional `GET /metrics` (when `general.metricsRoot === true`).
- **Auth Hardening (`loginGuard.ts`, `routes/context.ts`, `nodeRoutes.ts`)**:
  - 5 failed logins in 10 minutes trigger escalating bans (`10m -> 1h -> 24h -> 7d`) in `security_bans`; `loginAllowCidrs` exempts trusted networks or locks down login (`loginOnlyAllowCidrs`).
  - Sensitive security edits require `requireFreshMfa` (5-min `mfa_confirmed_at` window when TOTP is enabled).
  - Remote nodes support IP allowlist (`PUT /api/nodes/:id/allow-from`) and key rotation (`POST /api/nodes/:id/rotate-key`).
