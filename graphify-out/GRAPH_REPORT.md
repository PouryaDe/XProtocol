# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 72 files · ~61,542 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 470 nodes · 1549 edges · 24 communities (23 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `52926301`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- en.ts
- runtime.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- App.tsx
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- ClientDetailPage.tsx
- Project Documentation & Architecture
- install.sh
- useUi
- ClientsPage.tsx
- clientRoutes.ts
- SettingsPage.tsx
- database.ts
- getDb
- updater.ts
- linuxEngine.ts
- index.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 43 edges
2. `useUi()` - 37 edges
3. `apiFetch()` - 31 edges
4. `Button()` - 29 edges
5. `PageHead()` - 29 edges
6. `StatusPill()` - 27 edges
7. `PanelRoot()` - 26 edges
8. `react` - 26 edges
9. `ClientsPage()` - 24 edges
10. `Input()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createAccountRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/accountRoutes.ts → server/src/routes/context.ts
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts

## Import Cycles
- None detected.

## Communities (24 total, 1 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.25
Nodes (14): Sample, TrafficChart(), Odometer(), formatBytes(), formatDaysLeft(), formatDuration(), formatSpeed(), OverviewPage() (+6 more)

### Community 1 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 2 - "runtime.ts"
Cohesion: 0.19
Nodes (16): updateXrayGeoAssets(), applyInboundRuntime(), detectDriverMode(), HostStats, testTcpLatency(), InboundRow, PeerEntry, renderInboundServerConfig() (+8 more)

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

### Community 7 - "App.tsx"
Cohesion: 0.13
Nodes (24): resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey, Ambient(), BrandMark() (+16 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "ClientDetailPage.tsx"
Cohesion: 0.12
Nodes (18): ApiError, getApiBase(), getBasePath(), getRelativePath(), getSubPath(), inferBasePath(), KNOWN_SEGMENTS, XpGlobals (+10 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "useUi"
Cohesion: 0.26
Nodes (34): PanelRoot(), Button(), EqLoader(), Input(), Lamps(), PageHead(), Select(), StatusPill() (+26 more)

### Community 14 - "ClientsPage.tsx"
Cohesion: 0.18
Nodes (16): lucide-react, react, Drawer(), DrawerProps, Modal(), ModalProps, EmptySonar(), AccountItem (+8 more)

### Community 15 - "clientRoutes.ts"
Cohesion: 0.25
Nodes (16): DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, getSetting(), getHostStats(), computeClientIp(), generateClientProfile(), createApp(), createClientRouter() (+8 more)

### Community 16 - "SettingsPage.tsx"
Cohesion: 0.29
Nodes (6): QrCode(), ACCENTS, LOOKS, SettingsTab, SUB_SWATCHES, SubBuilderTab

### Community 17 - "database.ts"
Cohesion: 0.13
Nodes (29): GeneralSettings, SubPageProtocolConfig, SubscriptionPageSettings, createAccountRouter(), createAuthRouter(), AuthContext, extractClientIp(), loadAccountById() (+21 more)

### Community 18 - "getDb"
Cohesion: 0.49
Nodes (7): express, getDb(), createConnectionRouter(), AuthedRequest, createGroupRouter(), createNodeRouter(), recordAudit()

### Community 19 - "updater.ts"
Cohesion: 0.17
Nodes (23): createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync, getCurrentCommit() (+15 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.13
Nodes (18): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), issueLetsEncryptCert(), LiveTunnelSample, openFirewallPort() (+10 more)

### Community 22 - "index.ts"
Cohesion: 0.14
Nodes (21): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+13 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **170 isolated node(s):** `SettingsTab`, `SubBuilderTab`, `ACCENTS`, `SUB_SWATCHES`, `LOOKS` (+165 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `getDb` to `runtime.ts`, `Server Dependencies & Manifest`, `clientRoutes.ts`, `database.ts`, `updater.ts`, `linuxEngine.ts`, `index.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `SettingsTab`, `SubBuilderTab`, `ACCENTS` to the rest of the system?**
  _170 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `Web TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._