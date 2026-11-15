# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- 66 files · ~49,898 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 397 nodes · 1182 edges · 18 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c6e7da08`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- App.tsx
- linuxEngine.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- Project Documentation & Architecture
- install.sh
- NodesPage.tsx
- ClientsPage.tsx
- apiFetch
- context.tsx
- index.ts
- settingsRoutes.ts
- xprotocol-cli.sh

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 41 edges
2. `useUi()` - 29 edges
3. `apiFetch()` - 26 edges
4. `Button()` - 23 edges
5. `Card()` - 23 edges
6. `react` - 22 edges
7. `StatusPill()` - 21 edges
8. `Input()` - 19 edges
9. `PanelRoot()` - 18 edges
10. `recordAudit()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `ClientProfileParams` --references--> `InboundRow`  [EXTRACTED]
  server/src/generators/profiles.ts → server/src/generators/configs.ts
- `ClientsPage()` --calls--> `QrCode()`  [EXTRACTED]
  web/src/pages/ClientsPage.tsx → web/src/components/QrCode.tsx

## Import Cycles
- None detected.

## Communities (18 total, 0 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.18
Nodes (18): react, DonutChart(), Segment, QrCode(), Sample, TrafficChart(), formatBytes(), formatDaysLeft() (+10 more)

### Community 1 - "App.tsx"
Cohesion: 0.40
Nodes (10): PanelRoot(), CurrentAccount, Layout(), LayoutProps, NavKey, ThemeMode, useUi(), setCsrfToken() (+2 more)

### Community 2 - "linuxEngine.ts"
Cohesion: 0.11
Nodes (24): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+16 more)

### Community 3 - "web/package.json"
Cohesion: 0.05
Nodes (35): qrcode, react-dom, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite (+27 more)

### Community 4 - "API Integration Test Suite"
Cohesion: 0.50
Nodes (3): Codebase Navigation (Graphify First), Ovira Open-Core VPN Panel — Agent Workspace Instructions, Tech Stack

### Community 5 - "Server Dependencies & Manifest"
Cohesion: 0.09
Nodes (21): tsx, @types/express, @types/node, dependencies, express, devDependencies, tsx, @types/express (+13 more)

### Community 6 - "Web TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.13
Nodes (13): DEBIAN_FRONTEND, NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel, npm_config_update_notifier, run_q() (+5 more)

### Community 13 - "NodesPage.tsx"
Cohesion: 0.21
Nodes (8): lucide-react, DrawerProps, ModalProps, GroupItem, InboundOption, NodeItem, ProtocolRow, UnattachedInbound

### Community 14 - "ClientsPage.tsx"
Cohesion: 0.27
Nodes (22): Drawer(), Modal(), Button(), Card(), Input(), Select(), StatusPill(), formatDateTime() (+14 more)

### Community 15 - "apiFetch"
Cohesion: 0.19
Nodes (10): ApiError, apiFetch(), getApiBase(), AccountItem, RoleItem, GEOIP_PRESETS, GEOSITE_PRESETS, NodeOption (+2 more)

### Community 16 - "context.tsx"
Cohesion: 0.21
Nodes (11): ACCENT_PALETTES, AccentName, Lang, UiContext, UiContextValue, en, TranslationDict, fa (+3 more)

### Community 20 - "index.ts"
Cohesion: 0.09
Nodes (63): express, DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, GeneralSettings, getDb(), getSetting(), initDatabase(), SubPageProtocolConfig (+55 more)

### Community 22 - "settingsRoutes.ts"
Cohesion: 0.14
Nodes (20): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+12 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.58
Nodes (10): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), require_root() (+2 more)

## Knowledge Gaps
- **149 isolated node(s):** `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `NEEDRESTART_SUSPEND`, `npm_config_loglevel`, `npm_config_update_notifier` (+144 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 161 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `index.ts` to `linuxEngine.ts`, `Server Dependencies & Manifest`, `settingsRoutes.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `NEEDRESTART_SUSPEND` to the rest of the system?**
  _149 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `linuxEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._
- **Why does `react` connect `OverviewPage.tsx` to `App.tsx`, `web/package.json`, `NodesPage.tsx`, `ClientsPage.tsx`, `apiFetch`, `context.tsx`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `NodesPage.tsx` to `OverviewPage.tsx`, `App.tsx`, `web/package.json`, `ClientsPage.tsx`, `apiFetch`, `context.tsx`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._