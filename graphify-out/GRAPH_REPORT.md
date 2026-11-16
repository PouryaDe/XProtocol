# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 73 files · ~68,260 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 532 nodes · 1763 edges · 24 communities (23 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d6ad4fff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- context.tsx
- index.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- App.tsx
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- UiPrimitives.tsx
- Project Documentation & Architecture
- install.sh
- ConnectionsPage.tsx
- useUi
- runtime.ts
- SubscriptionPage.tsx
- database.ts
- clientRoutes.ts
- updater.ts
- getDb
- linuxEngine.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 43 edges
2. `useUi()` - 39 edges
3. `apiFetch()` - 33 edges
4. `Button()` - 29 edges
5. `PageHead()` - 29 edges
6. `formatBytes()` - 26 edges
7. `PanelRoot()` - 26 edges
8. `react` - 26 edges
9. `StatusPill()` - 25 edges
10. `ClientsPage()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createAccountRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/accountRoutes.ts → server/src/routes/context.ts
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts

## Import Cycles
- None detected.

## Communities (24 total, 1 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.34
Nodes (13): niceScale(), TrafficChart(), EqLoader(), Segmented(), formatBytes(), formatBytesParts(), formatDaysLeft(), formatDuration() (+5 more)

### Community 1 - "context.tsx"
Cohesion: 0.16
Nodes (14): TabItem, ACCENT_PALETTES, AccentName, Lang, UiContext, UiContextValue, en, TranslationDict (+6 more)

### Community 2 - "index.ts"
Cohesion: 0.14
Nodes (21): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+13 more)

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
Cohesion: 0.18
Nodes (20): PanelRoot(), resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey, Ambient() (+12 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "UiPrimitives.tsx"
Cohesion: 0.23
Nodes (11): react, QrCode(), DIGIT_SETS, Lamps(), SplitHeading(), GroupSummary, HistSession, InboundSummary (+3 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "ConnectionsPage.tsx"
Cohesion: 0.17
Nodes (25): Card(), Select(), Tabs(), getBasePath(), getRelativePath(), getSubPath(), inferBasePath(), KNOWN_SEGMENTS (+17 more)

### Community 14 - "useUi"
Cohesion: 0.18
Nodes (29): lucide-react, Drawer(), DrawerProps, Modal(), ModalProps, Button(), EmptySonar(), Input() (+21 more)

### Community 15 - "runtime.ts"
Cohesion: 0.19
Nodes (16): updateXrayGeoAssets(), applyInboundRuntime(), detectDriverMode(), HostStats, testTcpLatency(), InboundRow, PeerEntry, renderInboundServerConfig() (+8 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.09
Nodes (64): TrafficSample, BrandMark(), Odometer(), ACCENT_CSS_VARS, applySubTheme(), computeSubAccentTokens(), ContactKind, contrast() (+56 more)

### Community 17 - "database.ts"
Cohesion: 0.13
Nodes (29): GeneralSettings, SubPageProtocolConfig, SubscriptionPageSettings, createAccountRouter(), createAuthRouter(), AuthContext, extractClientIp(), loadAccountById() (+21 more)

### Community 18 - "clientRoutes.ts"
Cohesion: 0.25
Nodes (16): DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, getSetting(), getHostStats(), computeClientIp(), generateClientProfile(), createApp(), createClientRouter() (+8 more)

### Community 19 - "updater.ts"
Cohesion: 0.17
Nodes (23): createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync, getCurrentCommit() (+15 more)

### Community 20 - "getDb"
Cohesion: 0.49
Nodes (7): express, getDb(), createConnectionRouter(), AuthedRequest, createGroupRouter(), createNodeRouter(), recordAudit()

### Community 21 - "linuxEngine.ts"
Cohesion: 0.13
Nodes (18): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), issueLetsEncryptCert(), LiveTunnelSample, openFirewallPort() (+10 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **174 isolated node(s):** `LayoutProps`, `OverviewResponse`, `Lang`, `SettingsTab`, `SubBuilderTab` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 186 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `UiPrimitives.tsx` to `OverviewPage.tsx`, `context.tsx`, `web/package.json`, `App.tsx`, `ConnectionsPage.tsx`, `useUi`, `SubscriptionPage.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `LayoutProps`, `OverviewResponse`, `Lang` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14260249554367202 - nodes in this community are weakly interconnected._
- **Why does `express` connect `getDb` to `index.ts`, `Server Dependencies & Manifest`, `runtime.ts`, `database.ts`, `clientRoutes.ts`, `updater.ts`, `linuxEngine.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `useUi` to `OverviewPage.tsx`, `context.tsx`, `web/package.json`, `App.tsx`, `UiPrimitives.tsx`, `ConnectionsPage.tsx`, `SubscriptionPage.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._