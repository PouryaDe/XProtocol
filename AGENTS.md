# XProtocol Open-Core VPN Panel — Agent Workspace Instructions

This repository contains the clean-room, open-core **XProtocol** VPN control panel (Ovira `2.0.0-beta.3` parity) targeting **Ubuntu 22.04+ Linux** (`server/` backend + `web/` frontend + `deploy/` Ubuntu installers and `xprotocol` CLI).

## Tech Stack & Modules
- **Backend (`server/`)**: Node.js 24+ (`node:sqlite` WAL), Express 5, TypeScript (`tsx --test`).
  - `drivers/`: `xrayEngine.ts` (VLESS/VMess/Trojan/SS2022, Reality X25519, SNI probe/scan, unified `config.json` + `127.0.0.1:10085` `StatsService`/`HandlerService` hot-sync `adu`/`rmu`, access-log multi-IP/`X-Forwarded-For`, WAN `tc` + `sockopt.mark` CDN/relay shaping), `linuxEngine.ts` (WireGuard/AmneziaWG, OpenVPN, ocserv, strongSwan IKEv2 `xfrm-*` Ubuntu 22.04+ check/L2TP, Xray routing, incremental `tc` HTB/ingress), `pki.ts`, `runtime.ts`.
  - `services/`: `peerResolver.ts` (single keypair per WG client + UI multi-device note), `sessionGate.ts` (atomic `xp-gate.mjs` connect/disconnect gate + WG suppression), `syncService.ts`, `collector.ts` (5s live telemetry, quota/expiry/device eviction), `resetSchedule.ts` (Gregorian, `every_n_days`, Jalali `Asia/Tehran`), `subOrigins.ts`, `events.ts` (bell, Telegram, HMAC webhooks), `nodeHealth.ts`, `offsiteBackup.ts` (S3 SigV4, SFTP, `.ovbk` AES-256-GCM).
  - `security/`: `auth.ts` (scrypt, Reality/SS keygen), `loginGuard.ts` (CIDR allowlist + escalating bans), `rbac.ts`, `totp.ts`.
  - `generators/`: `configs.ts`, `profiles.ts`.
- **Frontend (`web/`)**: React 19, Vite 6, Tailwind CSS v4, Lucide icons, `qrcode`.
  - Shell: `BrandMark` geometric X, `CommandPalette.tsx` (`Ctrl+K`), `NotificationsDrawer.tsx`, `MfaConfirmModal.tsx` (auto `403 mfa_confirm_required` retry via `api.ts`).
  - Pages & Wizards: `InboundsPage`/`InboundDetailPage` (`XrayWizard`, `XrayInboundEditor`), `ClientsPage`/`ClientDetailPage` (bulk actions, Xray share links), `TemplatesPage`, `NodesPage` (90d uptime, health charts, allow-from/rotate-key), `SubscriptionPage` (V2Ray + Happ), modular `SettingsPage` + `Settings*` tabs.
- **Deployment (`deploy/`)**: `install.sh`, `node.sh` (`--panel-ip` + Xray), `xprotocol-cli.sh`, `xprotocol-tui.sh`, `xprotocol.service`.

## Token-Saving Navigation & Verification
- Read `.agents/rules/xprotocol-architecture.md` and load ONLY the matching skill in `.agents/skills/` (`xprotocol-backend-db`, `xprotocol-xray-drivers`, `xprotocol-frontend-ui`, `xprotocol-security-ops-sub`, `xprotocol-deploy-verify`, or `graphify`).
- Query `graphify-out/graph.json` or use `.agents/skills/xprotocol-deploy-verify/scripts/locate.ps1` (`Select-String`; `rg` is not installed on Windows).
- Always finish with `.agents/skills/xprotocol-deploy-verify/scripts/verify.ps1` (`npm run typecheck; npm run build; npm test`).
