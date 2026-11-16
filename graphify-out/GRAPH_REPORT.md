# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 81 files · ~98,598 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 677 nodes · 2313 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `529dd642`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RoutingPage.tsx
- InboundDetailPage.tsx
- web/package.json
- routingRoutes.ts
- Server Dependencies & Manifest
- Web TypeScript Configuration
- updater.ts
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- Project Documentation & Architecture
- install.sh
- App.tsx
- getDb
- SubscriptionPage.tsx
- linuxEngine.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 57 edges
2. `useUi()` - 47 edges
3. `Button()` - 42 edges
4. `apiFetch()` - 39 edges
5. `InboundDetailPage()` - 29 edges
6. `PageHead()` - 29 edges
7. `RoutingPage()` - 28 edges
8. `react` - 28 edges
9. `PanelRoot()` - 26 edges
10. `formatBytes()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `XProtocol Engineering & Platform Rules` --references--> `initDatabase()`  [INFERRED]
  .agents/rules/xprotocol-architecture.md → server/src/db/database.ts
- `Tech Stack` --references--> `BrandMark()`  [INFERRED]
  AGENTS.md → web/src/components/UiPrimitives.tsx
- `XProtocol Engineering & Platform Rules` --references--> `BrandMark()`  [INFERRED]
  .agents/rules/xprotocol-architecture.md → web/src/components/UiPrimitives.tsx
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts

## Import Cycles
- None detected.

## Communities (17 total, 1 thin omitted)

### Community 0 - "RoutingPage.tsx"
Cohesion: 0.14
Nodes (36): Modal(), defaultPortForProto(), NORD_COUNTRIES, NordVpnModal(), OutboundModal(), PROTO_LABELS, PROTOCOLS, PsiphonModal() (+28 more)

### Community 1 - "InboundDetailPage.tsx"
Cohesion: 0.15
Nodes (34): CertOption, DeploymentNodesPanel(), ESP_PROPOSALS, FoldSection(), IKE_PROPOSALS, IpsecSection(), L(), NodePickerGrid() (+26 more)

### Community 3 - "web/package.json"
Cohesion: 0.06
Nodes (32): qrcode, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+24 more)

### Community 4 - "routingRoutes.ts"
Cohesion: 0.15
Nodes (20): applyXrayRouting(), updateXrayGeoAssets(), testTcpLatency(), InboundRouteOverride, renderXrayRoutingConfig(), RoutingRule, collectUsedByMap(), createRoutingRouter() (+12 more)

### Community 5 - "Server Dependencies & Manifest"
Cohesion: 0.09
Nodes (21): tsx, @types/express, @types/node, dependencies, express, devDependencies, tsx, @types/express (+13 more)

### Community 6 - "Web TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 7 - "updater.ts"
Cohesion: 0.17
Nodes (25): setSetting(), createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync (+17 more)

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
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "App.tsx"
Cohesion: 0.07
Nodes (111): lucide-react, react, react-dom, App(), PanelRoot(), resolveRoute(), Drawer(), DrawerProps (+103 more)

### Community 14 - "getDb"
Cohesion: 0.08
Nodes (80): express, CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath() (+72 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.07
Nodes (68): Codebase Navigation (Graphify First), XProtocol Engineering & Platform Rules, Tech Stack, XProtocol Open-Core VPN Panel — Agent Workspace Instructions, TrafficSample, BrandMark(), Odometer(), ACCENT_CSS_VARS (+60 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.06
Nodes (75): closeDb(), applyInterfaceSpeedLimits(), applyLinuxInbound(), applyTcIpClasses(), collectLinuxLiveTunnels(), detectInstalledProtocols(), disconnectLinuxPeer(), ensurePppSessionHooks() (+67 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **188 isolated node(s):** `__dirname`, `PROJECT_ROOT`, `DEFAULT_UPDATE_SETTINGS`, `ReleaseEntry`, `UpdateStep` (+183 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 197 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BrandMark()` connect `SubscriptionPage.tsx` to `App.tsx`?**
  _High betweenness centrality (0.386) - this node is a cross-community bridge._
- **What connects `__dirname`, `PROJECT_ROOT`, `DEFAULT_UPDATE_SETTINGS` to the rest of the system?**
  _188 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RoutingPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13900134952766532 - nodes in this community are weakly interconnected._
- **Why does `XProtocol Engineering & Platform Rules` connect `SubscriptionPage.tsx` to `getDb`?**
  _High betweenness centrality (0.381) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.062388591800356503 - nodes in this community are weakly interconnected._
- **Why does `initDatabase()` connect `getDb` to `SubscriptionPage.tsx`, `linuxEngine.ts`, `updater.ts`?**
  _High betweenness centrality (0.380) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._