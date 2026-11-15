# XProtocol Open-Core VPN Panel — Agent Workspace Instructions

This repository contains the clean-room, open-core **XProtocol** VPN control panel (reverse-engineered parity copy of Ovira) targeting **Ubuntu 22.04+ Linux** (`server/` backend + `web/` frontend + `deploy/` Ubuntu installers and `xprotocol` CLI).

## Tech Stack
- **Backend (`server/`)**: Node.js 24+ (`node:sqlite` WAL), Express 5, TypeScript (`tsx --test` test runner).
- **Frontend (`web/`)**: React 19, Vite 6, Tailwind CSS v4, Lucide icons, `qrcode`.
- **Deployment (`deploy/`)**: Ubuntu 22.04+ bash installer (`install.sh`), remote node installer (`node.sh`), interactive management CLI (`xprotocol-cli.sh`), TUI helper (`xprotocol-tui.sh`), systemd unit (`xprotocol.service`).

## Codebase Navigation (Graphify First)
- A persistent knowledge graph exists in `graphify-out/graph.json` (`GRAPH_REPORT.md`, `graph.html`).
- Prefer querying the graph (`graphify query "..."`, `graphify path ...`, `graphify explain ...`) before broad codebase sweeps.
- Run `npm run typecheck && npm run build && npm test` (or PowerShell semicolon equivalents) after edits.
