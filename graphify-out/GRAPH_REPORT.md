# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- 66 files · ~47,841 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 418 nodes · 1231 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- React Frontend Pages & Components
- Express API Routes & SQLite DB
- Linux VPN Engines & Collectors
- Frontend Build & Tailwind Config
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- UI Theme & i18n Context
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- Ovira Server Management CLI
- Project Documentation & Architecture
- Ubuntu Panel Installer Script
- Remote Node Provisioner Script

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 41 edges
2. `useUi()` - 29 edges
3. `apiFetch()` - 26 edges
4. `Card()` - 23 edges
5. `Button()` - 23 edges
6. `react` - 22 edges
7. `StatusPill()` - 21 edges
8. `Input()` - 19 edges
9. `install.sh script` - 18 edges
10. `recordAudit()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `install.sh script` --calls--> `ask()`  [EXTRACTED]
  deploy/install.sh → deploy/ovira-tui.sh
- `install.sh script` --calls--> `card_copy()`  [EXTRACTED]
  deploy/install.sh → deploy/ovira-tui.sh
- `install.sh script` --calls--> `card_end()`  [EXTRACTED]
  deploy/install.sh → deploy/ovira-tui.sh

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "React Frontend Pages & Components"
Cohesion: 0.10
Nodes (70): lucide-react, react, PanelRoot(), DonutChart(), Segment, Drawer(), DrawerProps, CurrentAccount (+62 more)

### Community 1 - "Express API Routes & SQLite DB"
Cohesion: 0.07
Nodes (74): express, CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath() (+66 more)

### Community 2 - "Linux VPN Engines & Collectors"
Cohesion: 0.09
Nodes (33): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+25 more)

### Community 3 - "Frontend Build & Tailwind Config"
Cohesion: 0.06
Nodes (32): qrcode, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+24 more)

### Community 4 - "API Integration Test Suite"
Cohesion: 0.50
Nodes (3): Codebase Navigation (Graphify First), Ovira Open-Core VPN Panel — Agent Workspace Instructions, Tech Stack

### Community 5 - "Server Dependencies & Manifest"
Cohesion: 0.09
Nodes (21): tsx, @types/express, @types/node, dependencies, express, devDependencies, tsx, @types/express (+13 more)

### Community 6 - "Web TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 7 - "UI Theme & i18n Context"
Cohesion: 0.16
Nodes (12): react-dom, App(), ACCENT_PALETTES, AccentName, Lang, ThemeMode, UiContext, UiContextValue (+4 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "Ovira Server Management CLI"
Cohesion: 0.58
Nodes (10): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), require_root() (+2 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "Ubuntu Panel Installer Script"
Cohesion: 0.11
Nodes (30): DEBIAN_FRONTEND, install.sh script, DEBIAN_FRONTEND, node.sh script, ask(), card_copy(), card_end(), card_kv() (+22 more)

## Knowledge Gaps
- **143 isolated node(s):** `DEBIAN_FRONTEND`, `DEBIAN_FRONTEND`, `ovira-tui.sh script`, `name`, `version` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 158 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Express API Routes & SQLite DB` to `Linux VPN Engines & Collectors`, `Server Dependencies & Manifest`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `DEBIAN_FRONTEND`, `DEBIAN_FRONTEND`, `ovira-tui.sh script` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React Frontend Pages & Components` be split into smaller, more focused modules?**
  _Cohesion score 0.10004675081813932 - nodes in this community are weakly interconnected._
- **Why does `react` connect `React Frontend Pages & Components` to `Frontend Build & Tailwind Config`, `UI Theme & i18n Context`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `Express API Routes & SQLite DB` be split into smaller, more focused modules?**
  _Cohesion score 0.07377208309066201 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `React Frontend Pages & Components` to `Frontend Build & Tailwind Config`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Linux VPN Engines & Collectors` be split into smaller, more focused modules?**
  _Cohesion score 0.09250693802035152 - nodes in this community are weakly interconnected._