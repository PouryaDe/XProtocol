# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- Corpus is ~45,346 words - fits in a single context window. You may not need a graph.

## Summary
- 382 nodes · 1162 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
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
9. `recordAudit()` - 18 edges
10. `PanelRoot()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `getDb()` --calls--> `getDbPath()`  [EXTRACTED]
  server/src/db/database.ts → server/src/config.ts
- `applyPendingRestore()` --calls--> `getDbPath()`  [EXTRACTED]
  server/src/index.ts → server/src/config.ts

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "React Frontend Pages & Components"
Cohesion: 0.10
Nodes (71): lucide-react, react, PanelRoot(), DonutChart(), Segment, Drawer(), DrawerProps, CurrentAccount (+63 more)

### Community 1 - "Express API Routes & SQLite DB"
Cohesion: 0.10
Nodes (58): express, DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, GeneralSettings, getDb(), getSetting(), initDatabase(), SubPageProtocolConfig (+50 more)

### Community 2 - "Linux VPN Engines & Collectors"
Cohesion: 0.09
Nodes (29): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), issueLetsEncryptCert(), LiveTunnelSample, openFirewallPort() (+21 more)

### Community 3 - "Frontend Build & Tailwind Config"
Cohesion: 0.06
Nodes (32): qrcode, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+24 more)

### Community 4 - "API Integration Test Suite"
Cohesion: 0.14
Nodes (20): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+12 more)

### Community 5 - "Server Dependencies & Manifest"
Cohesion: 0.09
Nodes (21): tsx, @types/express, @types/node, dependencies, express, devDependencies, tsx, @types/express (+13 more)

### Community 6 - "Web TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 7 - "UI Theme & i18n Context"
Cohesion: 0.17
Nodes (11): react-dom, App(), ACCENT_PALETTES, Lang, ThemeMode, UiContext, UiContextValue, UiProvider() (+3 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "Ovira Server Management CLI"
Cohesion: 0.62
Nodes (9): cmd_backup(), cmd_logs(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), require_root(), ovira-cli.sh script (+1 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

## Knowledge Gaps
- **141 isolated node(s):** `install.sh script`, `DEBIAN_FRONTEND`, `node.sh script`, `DEBIAN_FRONTEND`, `name` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 152 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Express API Routes & SQLite DB` to `Linux VPN Engines & Collectors`, `API Integration Test Suite`, `Server Dependencies & Manifest`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `install.sh script`, `DEBIAN_FRONTEND`, `node.sh script` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React Frontend Pages & Components` be split into smaller, more focused modules?**
  _Cohesion score 0.09837565774422329 - nodes in this community are weakly interconnected._
- **Why does `react` connect `React Frontend Pages & Components` to `Frontend Build & Tailwind Config`, `UI Theme & i18n Context`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `Express API Routes & SQLite DB` be split into smaller, more focused modules?**
  _Cohesion score 0.1008991008991009 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `React Frontend Pages & Components` to `Frontend Build & Tailwind Config`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Linux VPN Engines & Collectors` be split into smaller, more focused modules?**
  _Cohesion score 0.09268292682926829 - nodes in this community are weakly interconnected._