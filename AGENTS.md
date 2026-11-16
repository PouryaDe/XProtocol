# XProtocol Open-Core VPN Panel — Agent Workspace Instructions

This repository contains the clean-room, open-core **XProtocol** VPN control panel (reverse-engineered parity copy of Ovira) targeting **Ubuntu 22.04+ Linux** (`server/` backend + `web/` frontend + `deploy/` Ubuntu installers and `xprotocol` CLI).

## Tech Stack
- **Backend (`server/`)**: Node.js 24+ (`node:sqlite` WAL), Express 5, TypeScript (`tsx --test` test runner).
  - `drivers/`: `linuxEngine.ts` (WireGuard/AmneziaWG, OpenVPN, ocserv, strongSwan IKEv2/L2TP, Xray systemd routing, `tc` HTB/IFB shaping, multi-protocol live collectors), `pki.ts` (OpenVPN CA/server/client certs, `ta.key`, salted scrypt `ovpn-auth`, TLS certs), `runtime.ts`.
  - `services/`: `peerResolver.ts` (CIDR math, collision-free IP allocation, quota/expiry/group eligibility, bandwidth limit resolution), `syncService.ts` (non-disruptive live peer sync & real session kicks), `collector.ts` (5s live telemetry, quota/expiry/device-limit eviction, periodic reset scheduler).
  - `generators/`: `configs.ts` (protocol daemon configs with CRLF/quote sanitization + Xray routing), `profiles.ts` (client `.conf` / `.ovpn` downloads).
- **Frontend (`web/`)**: React 19, Vite 6, Tailwind CSS v4, Lucide icons, `qrcode`.
  - Brand mark: geometric interlocking **X** SVG in `UiPrimitives.tsx` (`BrandMark`), `web/public/xprotocol-logo.svg`, and `web/index.html`.
  - Inbounds: list (`/inbounds`), 3-step wizard (`/inbounds/new`), deployment & protocol editor (`/inbounds/:id` via `InboundDetailPage.tsx` + `InboundSubforms.tsx`).
- **Deployment (`deploy/`)**: Ubuntu 22.04+ bash installer (`install.sh`), remote node installer (`node.sh`), interactive management CLI (`xprotocol-cli.sh`), TUI helper (`xprotocol-tui.sh`), systemd unit (`xprotocol.service`).

## Codebase Navigation (Graphify First)
- A persistent knowledge graph exists in `graphify-out/graph.json` (`GRAPH_REPORT.md`, `graph.html`).
- Prefer querying the graph (`graphify query "..."`, `graphify path ...`, `graphify explain ...`) before broad codebase sweeps.
- Run `npm run typecheck && npm run build && npm test` (or PowerShell `;` equivalents) after edits.
