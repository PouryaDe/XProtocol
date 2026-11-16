# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 75 files · ~81,800 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 583 nodes · 1917 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0032982f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RoutingPage.tsx
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- en.ts
- Project Documentation & Architecture
- install.sh
- App.tsx
- SubscriptionPage.tsx
- index.ts
- routingRoutes.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 46 edges
2. `useUi()` - 39 edges
3. `apiFetch()` - 38 edges
4. `Button()` - 37 edges
5. `PageHead()` - 29 edges
6. `RoutingPage()` - 28 edges
7. `react` - 27 edges
8. `PanelRoot()` - 26 edges
9. `formatBytes()` - 26 edges
10. `ClientsPage()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `PanelRoot()` --calls--> `RoutingPage()`  [EXTRACTED]
  web/src/App.tsx → web/src/pages/RoutingPage.tsx
- `PanelRoot()` --calls--> `SubscriptionPage()`  [EXTRACTED]
  web/src/App.tsx → web/src/pages/SubscriptionPage.tsx
- `RoutingPage()` --calls--> `useUi()`  [EXTRACTED]
  web/src/pages/RoutingPage.tsx → web/src/i18n/context.tsx

## Import Cycles
- None detected.

## Communities (16 total, 1 thin omitted)

### Community 0 - "RoutingPage.tsx"
Cohesion: 0.14
Nodes (36): Modal(), defaultPortForProto(), NORD_COUNTRIES, NordVpnModal(), OutboundModal(), PROTO_LABELS, PROTOCOLS, PsiphonModal() (+28 more)

### Community 3 - "web/package.json"
Cohesion: 0.06
Nodes (33): qrcode, react-dom, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite (+25 more)

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

### Community 10 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "App.tsx"
Cohesion: 0.08
Nodes (108): lucide-react, react, App(), PanelRoot(), resolveRoute(), Drawer(), DrawerProps, CurrentAccount (+100 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.09
Nodes (64): TrafficSample, BrandMark(), Odometer(), ACCENT_CSS_VARS, applySubTheme(), computeSubAccentTokens(), ContactKind, contrast() (+56 more)

### Community 19 - "index.ts"
Cohesion: 0.05
Nodes (107): express, CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath() (+99 more)

### Community 21 - "routingRoutes.ts"
Cohesion: 0.07
Nodes (38): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+30 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **181 isolated node(s):** `Lang`, `PaletteMode`, `UiContext`, `DrawerProps`, `LayoutProps` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 193 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `RoutingPage.tsx`, `SubscriptionPage.tsx`, `web/package.json`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `Lang`, `PaletteMode`, `UiContext` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RoutingPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13900134952766532 - nodes in this community are weakly interconnected._
- **Why does `express` connect `index.ts` to `routingRoutes.ts`, `Server Dependencies & Manifest`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.057057057057057055 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `RoutingPage.tsx`, `SubscriptionPage.tsx`, `web/package.json`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._