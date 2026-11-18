# XProtocol Core Workspace Rules

Clean-room open-core **XProtocol** VPN panel (Ovira `2.0.0-beta.3` parity): `server/` (Express 5 + Node 24 `node:sqlite` WAL + Linux VPN/Xray drivers), `web/` (React 19 + Vite 6 + Tailwind v4, EN LTR + FA RTL), `deploy/` (Ubuntu 22.04+ bash installers & CLI).

## Token-Efficiency & Navigation Protocol
1. **Do NOT sweep directories or read whole files**:
   - Load ONLY the matching skill from `.agents/skills/` below before touching a subsystem (progressive disclosure).
   - Check structural relationships with `graphify query|path|explain` (`graphify-out/graph.json`) or targeted `Select-String` (`rg` is not installed on Windows).
   - Read <=150-line slices (`StartLine`/`EndLine`) around located symbols.
2. **Skill Router (load on demand)**:
   - DB tables/columns, Express routes, RBAC, Jalali/periodic resets -> `.agents/skills/xprotocol-backend-db/SKILL.md`
   - Xray presets/combos/SNI/stats, WG/AWG/OVPN/ocserv/IKEv2/L2TP, `tc`, telemetry -> `.agents/skills/xprotocol-xray-drivers/SKILL.md`
   - React pages, `UiPrimitives`/`Modal` props, `api.ts`, `XrayWizard`, `Settings*`, EN/FA -> `.agents/skills/xprotocol-frontend-ui/SKILL.md`
   - Proxy-app subscriptions (`Happ`/headers), Webhooks/Telegram, S3/SFTP `.ovbk`, Prometheus `/metrics`, login bans/2FA -> `.agents/skills/xprotocol-security-ops-sub/SKILL.md`
   - Ubuntu `deploy/*.sh`, Windows verification, single-test & locate helpers -> `.agents/skills/xprotocol-deploy-verify/SKILL.md`

## Hard Invariants (Zero-Tolerance Precision)
- **OS & Daemon Safety**: Linux binaries (`wg`, `awg`, `openvpn`, `ocserv`, `swanctl`, `tc`, `ufw`, `xray`, `sftp`) MUST run via `execFile` arg arrays (no `bash -c` interpolation), sanitize CRLF/quotes in rendered configs, and degrade safely on non-Linux hosts (`XPROTOCOL_SKIP_NET_FETCH=1` in tests).
- **Eligibility & Key Secrecy**: Resolve active clients ONLY via `peerResolver.ts`. Never emit disabled, expired, quota-exhausted, or ungranted clients into configs, and never expose `_realityPrivateKey` / `server_private_key` in API client views or subscription links.
- **Database**: All SQLite schema changes MUST be idempotent (`CREATE TABLE IF NOT EXISTS` / `ensureCol`) inside `initDatabase()`.
- **Auth & RBAC**: Cookie sessions (`xprotocol_session`) + `X-CSRF-Token`, scrypt passwords, TOTP 2FA + `requireFreshMfa` (`403 mfa_confirm_required`), escalating login bans (`loginGuard.ts`), owner/reseller isolation (`templatesOnly`, `allowedTemplateIds`, `ownSubOrigins`).
- **Verification**: Finish every code change by running `npm run typecheck; npm run build; npm test` (PowerShell) and confirming 0 failures / 0 skipped tests.
