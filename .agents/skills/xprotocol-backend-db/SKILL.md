---
name: xprotocol-backend-db
description: >-
  Backend Express 5 routes, Node 24 node:sqlite database schema and migrations,
  RBAC permissions and reseller limits/overrides, client templates, reset schedules
  (including Jalali Asia/Tehran), and backend test conventions for XProtocol.
  Load before editing server/src/db/, server/src/routes/, server/src/security/rbac.ts,
  resetSchedule.ts, subOrigins.ts, or server/tests/.
---

# XProtocol Backend, DB Schema & Routes

## Fast Reference
Read [schema-and-routes.md](./references/schema-and-routes.md) when you need exact table columns, Express router mounts, or response shapes (prevents guessing column names like `email` or `sub_app_title`).

## Key Architecture Facts
- **Entry & Router Mount (`server/src/index.ts`)**: All panel APIs live under `/api` via `secretPath` guard; public subscription routes live under `/${subPath}/:token` (and `/sub/:token`); optional unauthenticated Prometheus at `/metrics` when `general.metricsRoot` is true.
- **SQLite (`server/src/db/database.ts`)**: Single WAL database initialized lazily via `getDb()` after `initDatabase()`. Always use `ensureCol(table, col, def)` for new columns on existing tables.
- **Payload Gotchas (verify before asserting)**:
  - `POST /api/clients` -> `201 { ids, items: [{ id, name, subToken }] }`
  - `POST /api/inbounds` -> `201 { id, ids }`
  - `POST /api/client-templates` -> `201 TemplateRow` (flat `{ id, name, settings, ... }`, NOT wrapped in `{ template }`)
  - `GET /api/events` -> `Event[]` array directly (NOT `{ items }`)
  - `POST /api/accounts` accepts flat `overrideTemplatesOnly`, `allowedTemplateIds`, `overrideClientLimit`, etc.; stores reseller proxy overrides in `accounts.sub_apps_json`.
  - `POST /api/inbounds/:id/xray/reality-keys` & `POST /api/inbounds/:id/xray/sni/replace` require `{ confirm: true }`.
- **Reset Schedules (`server/src/services/resetSchedule.ts`)**: Supports `never`/`none`, `daily`, `weekly`, `monthly`, `yearly`, `every_n_days`, `jalali_monthly`, `jalali_yearly` using `Intl.DateTimeFormat('en-US-u-ca-persian')`, `timeZone` (`Asia/Tehran`), and `resetAnchor` (`0`=calendar boundary, `1`=client start).

## Checklist Before Editing Backend
1. Locate route in `server/src/routes/` via `Select-String` -> read exact handler (<=120 lines).
2. Enforce RBAC (`requireOwner`, `acc.permissions.*`, `resolveEffectiveLimits`, `templatesOnly`).
3. Keep `emitEvent(...)` and `recordAudit(...)` aligned on state-changing routes.
4. Add/update assertions in `server/tests/ovira20.test.ts` with `XPROTOCOL_SKIP_NET_FETCH=1`.
