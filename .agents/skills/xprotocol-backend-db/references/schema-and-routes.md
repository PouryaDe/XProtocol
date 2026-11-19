# XProtocol SQLite Schema & API Mount Map

## API Mounts (`server/src/index.ts`)
| Prefix | Router File | Key Notes |
| :----- | :---------- | :-------- |
| `/api/auth` | `authRoutes.ts` | `/login`, `/logout`, `/me`, `/me/password`, `/me/2fa/{setup,enable,confirm}`, `/me/sessions/:id` |
| `/api/dashboard` | `dashboardRoutes.ts` | Live overview KPIs, traffic timeseries, protocol counts |
| `/api/clients` | `clientRoutes.ts` | `GET /:id`, `POST` -> `{ids, items}`; `POST /:id/{enable,disable,extend,replace-certificate,reset-traffic,regenerate-sub}`; `GET /:id/{usage,wireguard}`; `POST /bulk` or `/bulk-action`; export `.txt` |
| `/api/client-templates` | `templateRoutes.ts` | Owner CRUD -> returns flat `TemplateRow` `{id, name, settings, sort, enabled}` |
| `/api/groups` | `groupRoutes.ts` | Client groups & bandwidth defaults |
| `/api/inbounds`, `/api/instances` | `inboundRoutes.ts` | `POST` -> `{id, ids}`; `/defaults?kind=xray`, `/preflight`, `/:id/xray/{reality-keys,sni/replace,certificate,proxy-check}` |
| `/api/xray` | `xrayRoutes.ts` | `/presets` (`{items}`), `/combos`, `/sni`, `/sni/test`, `/sni/scan`, `/sni/jobs/:id` |
| `/api/nodes` | `nodeRoutes.ts` | CRUD, `/:id/health?range=`, `PUT /:id/allow-from`, `POST /:id/rotate-key` |
| `/api/connections` | `connectionRoutes.ts` | Live + history sessions, kick |
| `/api/routing` | `routingRoutes.ts` | Outbounds + routing rules per node |
| `/api/certificates` | `certRoutes.ts` | TLS certs & certbot |
| `/api/accounts` | `accountRoutes.ts` | Roles, reseller limits/overrides, `/:id/sub-origins`, `/:id/sub-apps` (`sub_apps_json`) |
| `/api/backup/destinations` | `backupRoutes.ts` | S3/SFTP CRUD, `/test`, `/accept-hostkey` (`{hostKey,fingerprint}`), `/send`, `/files`, `/restore` (`{name\|fileName}`) |
| `/api/metrics` & optional `/metrics` | `metricsRoutes.ts` | Prometheus text exposition (`metricsRoot`) |
| `/api/` (events, hooks, notif, reseller sub) | `eventsRoutes.ts` | `/events` (array), `/events/unread`, `/events/seen`, `/webhooks/*`, `/account/{notifications,telegram/*,sub-origins,sub-apps}` |
| `/api/settings` | `settingsRoutes.ts` | `/general`, `/sub-apps`, `/sub-origins`, `/security/bans`, `/subscription-page`, `/panel-access`, `/api-tokens`, `/openapi.json`, `/audit-log`, `/backup/{download,restore}`, `/telegram-backup/*` |
| `/api/updates` | `updateRoutes.ts` | Version check + upgrade |
| `/:subPath/:token` | `subRoutes.ts` | Public portal HTML/JSON + Proxy app Base64/raw feed |

## Exact SQLite Tables & Columns (`server/src/db/database.ts`)
- `settings(key, value)` — keys: `general`, `subscription_page`, `proxy_apps`, `panel_access`, `telegram_backup`
- `roles(id, name, built_in, is_owner, permissions_json, limits_json, created_at)`
- `accounts(id, username, password_hash, role_id, active, totp_secret, totp_enabled, recovery_codes_json, traffic_pool_bytes, traffic_used_bytes, expires_at, allowed_group_ids_json, allowed_inbound_ids_json, override_allowed_templates_json, override_client_limit, override_require_group, override_max_traffic_gb, override_max_lifetime_days, override_max_devices, override_allow_unlimited, override_templates_only, telegram_chat_id, telegram_chat_name, telegram_link_token, notification_prefs_json, sub_apps_json, note, created_at)`
  - *Note*: NO `email`, `sub_app_title`, or `sub_app_support_url` columns; use `sub_apps_json`.
- `sessions(id, account_id, csrf_token, ip, user_agent, created_at, last_seen_at, mfa_confirmed_at)`
- `api_tokens(id, account_id, name, prefix, token_hash, scopes_json, last_used_at, created_at)`
- `nodes(id, is_local, name, address, port, node_key, multiplier, connect_addresses_json, allow_from_json, note, enabled, status, last_seen_at, cpu_pct, mem_pct, disk_pct, uptime_sec, real_traffic_bytes, xprotocol_version, openvpn_version, wireguard_ready, openconnect_version, ikev2_ready, l2tp_ready)`
- `inbounds(id, node_id, protocol, name, transport, port, subnet, auth_mode, description, public_address_override, enabled, running, cert_id, server_public_key, server_private_key, settings_json, created_at)`
- `groups(id, name, note, all_inbounds, enabled, download_mbps, upload_mbps, created_at)` & `group_inbounds(group_id, inbound_id)`
- `clients(id, name, owner_id, traffic_limit_bytes, traffic_used_bytes, upload_bytes, download_bytes, total_upload_bytes, total_download_bytes, expires_at, first_connect_days, first_connected_at, device_limit, download_mbps, upload_mbps, reset_period, reset_every_days, reset_anchor, template_id, next_reset_at, fixed_ip, enabled, note, contact, sub_token, cert_serial, cert_expires_at, wg_private_key, wg_public_key, vpn_password, xray_uuid, ss_password, sub_update_hours, sub_announce, created_at, last_online_at)`
  - *Note*: NO `email` or `updated_at` columns; `name`, `owner_id`, `wg_private_key`, `wg_public_key`, `vpn_password`, `sub_token`, `created_at` are `NOT NULL`.
- `client_groups(client_id, group_id)`, `client_inbounds(client_id, inbound_id)`, `client_device_slots(id, client_id, slot_index, wg_private_key, wg_public_key, created_at)`
- `connections_live(id, client_id, inbound_id, node_id, remote_ip, tunnel_ip, device, connected_at, bytes_in, bytes_out, speed_in_bps, speed_out_bps)` & `connections_history(...)`
- `outbounds(id, name, type, config_json, last_test_json, created_at)` & `routing_policies(node_id, enabled, inbound_scope, inbound_ids_json, default_action, default_outbound_id, rules_json, inbound_routes_json, status, status_message, updated_at)`
- `client_templates(id, name, settings_json, sort, enabled, created_at, updated_at)`
- `sub_origins(id, admin_id, url, is_primary, note, behind_cdn, tls_status, added_at)` (`admin_id=0` = panel-wide)
- `events(id, type, at, owner_id, subject, data_json)` & `account_event_reads(account_id, last_seen_event_id)`
- `webhooks(id, owner_id, url, secret, events_json, include_sub_link, allow_private, enabled, created_at, updated_at)` & `webhook_deliveries(...)`
- `backup_destinations(id, kind, name, enabled, encrypt, config_json, secrets_json, schedule_json, retention_json, last_at, last_size, last_name, last_error, last_error_at, last_prune, next_at, running, created_at)`
- `node_health_samples(id, node_id, ts, granularity, online, cpu, mem_used, mem_total, disk_used, disk_total, upload, download, clients)`
- `xray_sni_results(id, node_id, domain, tag, grade, reasons_json, tcp_ms, tls_ms, checked_at)`
- `security_bans(key, kind, target, level, fail_count, fail_window_start, until, last_fail)`
