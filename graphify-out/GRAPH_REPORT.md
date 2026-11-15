# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 72 files · ~59,127 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 465 nodes · 1524 edges · 26 communities (25 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5e98dab0`
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
- ConnectionsPage.tsx
- clientRoutes.ts
- context.tsx
- context.ts
- index.ts
- updater.ts
- database.ts
- linuxEngine.ts
- settingsRoutes.ts
- xprotocol-cli.sh
- DonutChart.tsx
- UpdatesPage.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 43 edges
2. `useUi()` - 35 edges
3. `apiFetch()` - 31 edges
4. `Button()` - 29 edges
5. `StatusPill()` - 27 edges
6. `PanelRoot()` - 26 edges
7. `react` - 26 edges
8. `PageHead()` - 25 edges
9. `ClientsPage()` - 24 edges
10. `ClientDetailPage()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `applyPendingRestore()` --calls--> `getDbPath()`  [EXTRACTED]
  server/src/index.ts → server/src/config.ts

## Import Cycles
- None detected.

## Communities (26 total, 1 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.24
Nodes (16): QrCode(), Sample, TrafficChart(), Odometer(), formatBytes(), formatDaysLeft(), formatDuration(), formatSpeed() (+8 more)

### Community 1 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 2 - "runtime.ts"
Cohesion: 0.22
Nodes (14): initDatabase(), updateXrayGeoAssets(), applyInboundRuntime(), HostStats, testTcpLatency(), PeerEntry, renderInboundServerConfig(), renderXrayRoutingConfig() (+6 more)

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
Cohesion: 0.17
Nodes (17): PanelRoot(), resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey, Ambient() (+9 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "ClientDetailPage.tsx"
Cohesion: 0.23
Nodes (10): lucide-react, DrawerProps, getApiBase(), getSubPath(), GroupSummary, HistSession, InboundSummary, LiveSession (+2 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.13
Nodes (13): DEBIAN_FRONTEND, NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel, npm_config_update_notifier, run_q() (+5 more)

### Community 13 - "useUi"
Cohesion: 0.23
Nodes (28): Drawer(), Modal(), ModalProps, Button(), EmptySonar(), Input(), PageHead(), Select() (+20 more)

### Community 14 - "ConnectionsPage.tsx"
Cohesion: 0.21
Nodes (18): Card(), Tabs(), getBasePath(), getRelativePath(), inferBasePath(), KNOWN_SEGMENTS, navigate(), toPanelUrl() (+10 more)

### Community 15 - "clientRoutes.ts"
Cohesion: 0.32
Nodes (12): DEFAULT_GENERAL_SETTINGS, getSetting(), InboundRow, ClientProfileParams, computeClientIp(), generateClientProfile(), createClientRouter(), resolveClientInbounds() (+4 more)

### Community 16 - "context.tsx"
Cohesion: 0.15
Nodes (13): react, ACCENT_PALETTES, AccentName, Lang, UiContext, GEOIP_PRESETS, GEOSITE_PRESETS, NodeOption (+5 more)

### Community 17 - "context.ts"
Cohesion: 0.19
Nodes (19): createAuthRouter(), AuthContext, extractClientIp(), loadAccountById(), parseCookies(), requireAuth(), hashPassword(), randomToken() (+11 more)

### Community 18 - "index.ts"
Cohesion: 0.30
Nodes (14): express, getDb(), issueLetsEncryptCert(), detectDriverMode(), createApp(), __dirname, createAccountRouter(), createCertRouter() (+6 more)

### Community 19 - "updater.ts"
Cohesion: 0.16
Nodes (24): setSetting(), createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync (+16 more)

### Community 20 - "database.ts"
Cohesion: 0.17
Nodes (14): DEFAULT_SUB_SETTINGS, GeneralSettings, SubPageProtocolConfig, SubscriptionPageSettings, getHostStats(), createDashboardRouter(), ADMIN_PERMISSIONS, getAccountStatus() (+6 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.15
Nodes (15): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+7 more)

### Community 22 - "settingsRoutes.ts"
Cohesion: 0.15
Nodes (18): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+10 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

### Community 25 - "UpdatesPage.tsx"
Cohesion: 0.36
Nodes (7): EqLoader(), formatDateTime(), formatCheckedAgo(), ReleaseEntry, UpdateSettings, UpdatesPage(), UpdateState

## Knowledge Gaps
- **169 isolated node(s):** `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `NEEDRESTART_SUSPEND`, `npm_config_loglevel`, `npm_config_update_notifier` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `index.ts` to `runtime.ts`, `Server Dependencies & Manifest`, `clientRoutes.ts`, `context.ts`, `updater.ts`, `database.ts`, `settingsRoutes.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `NEEDRESTART_SUSPEND` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `react` connect `context.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `ConnectionsPage.tsx`, `UpdatesPage.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `ClientDetailPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `useUi`, `ConnectionsPage.tsx`, `context.tsx`, `UpdatesPage.tsx`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `Web TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._