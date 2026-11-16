# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 73 files · ~70,139 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 534 nodes · 1764 edges · 26 communities (25 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d0d99b6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- UiPrimitives.tsx
- context.tsx
- index.ts
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
- NodesPage.tsx
- context.ts
- SubscriptionPage.tsx
- database.ts
- clientRoutes.ts
- updater.ts
- getDb
- linuxEngine.ts
- AccountsPage.tsx
- xprotocol-cli.sh
- DonutChart.tsx
- authRoutes.ts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 43 edges
2. `useUi()` - 39 edges
3. `apiFetch()` - 33 edges
4. `Button()` - 29 edges
5. `PageHead()` - 29 edges
6. `formatBytes()` - 26 edges
7. `PanelRoot()` - 26 edges
8. `react` - 26 edges
9. `ClientsPage()` - 24 edges
10. `Input()` - 23 edges

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

## Communities (26 total, 1 thin omitted)

### Community 0 - "UiPrimitives.tsx"
Cohesion: 0.23
Nodes (12): ActionMenuItem, DIGIT_SETS, Segmented(), SplitHeading(), useSlidingIndicator(), formatDuration(), formatSpeed(), formatSpeedParts() (+4 more)

### Community 1 - "context.tsx"
Cohesion: 0.16
Nodes (14): TabItem, ACCENT_PALETTES, AccentName, Lang, UiContext, UiContextValue, en, TranslationDict (+6 more)

### Community 2 - "index.ts"
Cohesion: 0.16
Nodes (19): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+11 more)

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

### Community 7 - "App.tsx"
Cohesion: 0.20
Nodes (17): App(), PanelRoot(), resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey (+9 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "ClientDetailPage.tsx"
Cohesion: 0.25
Nodes (17): Drawer(), QrCode(), ActionMenu(), Lamps(), getApiBase(), formatDaysLeft(), getSubPath(), navigate() (+9 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "useUi"
Cohesion: 0.21
Nodes (26): Modal(), Button(), EmptySonar(), Input(), PageHead(), Select(), StatusPill(), useUi() (+18 more)

### Community 14 - "NodesPage.tsx"
Cohesion: 0.17
Nodes (12): lucide-react, react, DrawerProps, ModalProps, NodeItem, ProtocolRow, UnattachedInbound, GEOIP_PRESETS (+4 more)

### Community 15 - "context.ts"
Cohesion: 0.29
Nodes (10): express, issueLetsEncryptCert(), createCertRouter(), AuthContext, extractClientIp(), parseCookies(), requireAuth(), requireOwner() (+2 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.08
Nodes (68): niceScale(), TrafficChart(), TrafficSample, BrandMark(), Odometer(), formatBytes(), formatBytesParts(), ACCENT_CSS_VARS (+60 more)

### Community 17 - "database.ts"
Cohesion: 0.15
Nodes (18): DEFAULT_SUB_SETTINGS, GeneralSettings, initDatabase(), SubPageProtocolConfig, SubscriptionPageSettings, createAccountRouter(), loadAccountById(), generateWireGuardKeypair() (+10 more)

### Community 18 - "clientRoutes.ts"
Cohesion: 0.26
Nodes (16): DEFAULT_GENERAL_SETTINGS, getSetting(), getHostStats(), InboundRow, ClientProfileParams, computeClientIp(), generateClientProfile(), createClientRouter() (+8 more)

### Community 19 - "updater.ts"
Cohesion: 0.16
Nodes (24): setSetting(), createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync (+16 more)

### Community 20 - "getDb"
Cohesion: 0.40
Nodes (9): getDb(), applyInboundRuntime(), renderInboundServerConfig(), createConnectionRouter(), AuthedRequest, createGroupRouter(), createInboundRouter(), getInboundPeers() (+1 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.10
Nodes (26): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES (+18 more)

### Community 22 - "AccountsPage.tsx"
Cohesion: 0.20
Nodes (14): Card(), Tabs(), ApiError, getBasePath(), getRelativePath(), inferBasePath(), KNOWN_SEGMENTS, updateSearchParams() (+6 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

### Community 25 - "authRoutes.ts"
Cohesion: 0.44
Nodes (8): createAuthRouter(), verifyPassword(), buildTotpUri(), computeTotp(), decodeBase32(), generateRecoveryCodes(), generateTotpSecret(), verifyTotp()

## Knowledge Gaps
- **175 isolated node(s):** `DIGIT_SETS`, `ActionMenuItem`, `GroupOption`, `OverviewResponse`, `Lang` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 187 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `NodesPage.tsx` to `UiPrimitives.tsx`, `context.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `SubscriptionPage.tsx`, `AccountsPage.tsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `DIGIT_SETS`, `ActionMenuItem`, `GroupOption` to the rest of the system?**
  _175 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06050420168067227 - nodes in this community are weakly interconnected._
- **Why does `express` connect `context.ts` to `index.ts`, `Server Dependencies & Manifest`, `database.ts`, `clientRoutes.ts`, `updater.ts`, `getDb`, `linuxEngine.ts`, `authRoutes.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `NodesPage.tsx` to `UiPrimitives.tsx`, `context.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `SubscriptionPage.tsx`, `AccountsPage.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Web TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._