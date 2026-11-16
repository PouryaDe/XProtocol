# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 77 files · ~89,884 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 621 nodes · 2042 edges · 22 communities (21 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a176985c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RoutingPage.tsx
- InboundDetailPage.tsx
- index.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- updater.ts
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- en.ts
- Project Documentation & Architecture
- install.sh
- App.tsx
- context.ts
- routingRoutes.ts
- SubscriptionPage.tsx
- recordAudit
- database.ts
- linuxEngine.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 48 edges
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
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `ClientProfileParams` --references--> `InboundRow`  [EXTRACTED]
  server/src/generators/profiles.ts → server/src/generators/configs.ts
- `createAccountRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/accountRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts

## Import Cycles
- None detected.

## Communities (22 total, 1 thin omitted)

### Community 0 - "RoutingPage.tsx"
Cohesion: 0.14
Nodes (36): Modal(), defaultPortForProto(), NORD_COUNTRIES, NordVpnModal(), OutboundModal(), PROTO_LABELS, PROTOCOLS, PsiphonModal() (+28 more)

### Community 1 - "InboundDetailPage.tsx"
Cohesion: 0.15
Nodes (34): CertOption, DeploymentNodesPanel(), ESP_PROPOSALS, FoldSection(), IKE_PROPOSALS, IpsecSection(), L(), NodePickerGrid() (+26 more)

### Community 2 - "index.ts"
Cohesion: 0.16
Nodes (22): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+14 more)

### Community 3 - "web/package.json"
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

### Community 7 - "updater.ts"
Cohesion: 0.17
Nodes (23): createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync, getCurrentCommit() (+15 more)

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
Cohesion: 0.07
Nodes (103): lucide-react, react, react-dom, App(), PanelRoot(), resolveRoute(), Drawer(), DrawerProps (+95 more)

### Community 14 - "context.ts"
Cohesion: 0.20
Nodes (18): createAccountRouter(), createAuthRouter(), AuthContext, extractClientIp(), loadAccountById(), parseCookies(), requireAuth(), hashPassword() (+10 more)

### Community 15 - "routingRoutes.ts"
Cohesion: 0.13
Nodes (21): issueLetsEncryptCert(), updateXrayGeoAssets(), InboundRouteOverride, renderXrayRoutingConfig(), RoutingRule, createCertRouter(), requireOwner(), collectUsedByMap() (+13 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.08
Nodes (68): niceScale(), TrafficChart(), TrafficSample, BrandMark(), Odometer(), formatBytes(), formatBytesParts(), ACCENT_CSS_VARS (+60 more)

### Community 17 - "recordAudit"
Cohesion: 0.28
Nodes (11): express, detectDriverMode(), testTcpLatency(), createApp(), createConnectionRouter(), AuthedRequest, createGroupRouter(), ensureGroupSpeedColumns() (+3 more)

### Community 19 - "database.ts"
Cohesion: 0.12
Nodes (28): DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, GeneralSettings, initDatabase(), SubPageProtocolConfig, SubscriptionPageSettings, getHostStats(), ClientProfileParams (+20 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.11
Nodes (25): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+17 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **185 isolated node(s):** `IKE_PROPOSALS`, `ESP_PROPOSALS`, `InboundKind`, `CidrInfo`, `GroupOption` (+180 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 198 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `RoutingPage.tsx`, `InboundDetailPage.tsx`, `web/package.json`, `SubscriptionPage.tsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `IKE_PROPOSALS`, `ESP_PROPOSALS`, `InboundKind` to the rest of the system?**
  _185 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RoutingPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13900134952766532 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `RoutingPage.tsx`, `InboundDetailPage.tsx`, `web/package.json`, `SubscriptionPage.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.062388591800356503 - nodes in this community are weakly interconnected._
- **Why does `express` connect `recordAudit` to `index.ts`, `Server Dependencies & Manifest`, `updater.ts`, `context.ts`, `routingRoutes.ts`, `database.ts`, `linuxEngine.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._