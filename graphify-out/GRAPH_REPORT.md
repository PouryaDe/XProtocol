# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- 69 files · ~55,995 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 435 nodes · 1418 edges · 25 communities (24 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43947b70`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ClientDetailPage.tsx
- en.ts
- linuxEngine.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- App.tsx
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- ClientsPage.tsx
- Project Documentation & Architecture
- install.sh
- NodesPage.tsx
- useUi
- clientRoutes.ts
- SettingsPage.tsx
- authRoutes.ts
- index.ts
- getDb
- database.ts
- collector.ts
- settingsRoutes.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 41 edges
2. `useUi()` - 33 edges
3. `apiFetch()` - 30 edges
4. `Button()` - 27 edges
5. `PanelRoot()` - 25 edges
6. `StatusPill()` - 25 edges
7. `PageHead()` - 25 edges
8. `react` - 25 edges
9. `ClientsPage()` - 24 edges
10. `Input()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `ClientProfileParams` --references--> `InboundRow`  [EXTRACTED]
  server/src/generators/profiles.ts → server/src/generators/configs.ts
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `applyPendingRestore()` --calls--> `getDbPath()`  [EXTRACTED]
  server/src/index.ts → server/src/config.ts

## Import Cycles
- None detected.

## Communities (25 total, 1 thin omitted)

### Community 0 - "ClientDetailPage.tsx"
Cohesion: 0.17
Nodes (23): react, QrCode(), Sample, TrafficChart(), EqLoader(), Odometer(), formatBytes(), formatDaysLeft() (+15 more)

### Community 1 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 2 - "linuxEngine.ts"
Cohesion: 0.13
Nodes (26): applyLinuxInbound(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES, ProtocolName (+18 more)

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
Cohesion: 0.19
Nodes (17): lucide-react, PanelRoot(), resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey (+9 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "ClientsPage.tsx"
Cohesion: 0.23
Nodes (14): ApiError, apiFetch(), getApiBase(), getBasePath(), getRelativePath(), getSubPath(), inferBasePath(), KNOWN_SEGMENTS (+6 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.13
Nodes (13): DEBIAN_FRONTEND, NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel, npm_config_update_notifier, run_q() (+5 more)

### Community 13 - "NodesPage.tsx"
Cohesion: 0.18
Nodes (19): Drawer(), DrawerProps, Modal(), ModalProps, Button(), EmptySonar(), Input(), ClientsPage() (+11 more)

### Community 14 - "useUi"
Cohesion: 0.22
Nodes (24): Card(), PageHead(), Select(), StatusPill(), Tabs(), useUi(), formatDateTime(), updateSearchParams() (+16 more)

### Community 15 - "clientRoutes.ts"
Cohesion: 0.29
Nodes (14): express, DEFAULT_GENERAL_SETTINGS, getSetting(), getHostStats(), ClientProfileParams, computeClientIp(), generateClientProfile(), createClientRouter() (+6 more)

### Community 16 - "SettingsPage.tsx"
Cohesion: 0.20
Nodes (10): ACCENT_PALETTES, AccentName, Lang, UiContext, ACCENTS, LOOKS, PARAM_TO_TAB, SettingsTab (+2 more)

### Community 17 - "authRoutes.ts"
Cohesion: 0.28
Nodes (12): initDatabase(), createAuthRouter(), extractClientIp(), hashPassword(), randomToken(), verifyPassword(), buildTotpUri(), computeTotp() (+4 more)

### Community 18 - "index.ts"
Cohesion: 0.27
Nodes (10): issueLetsEncryptCert(), detectDriverMode(), createApp(), __dirname, createAccountRouter(), createCertRouter(), loadAccountById(), parseCookies() (+2 more)

### Community 19 - "getDb"
Cohesion: 0.61
Nodes (5): getDb(), createConnectionRouter(), AuthedRequest, createGroupRouter(), recordAudit()

### Community 20 - "database.ts"
Cohesion: 0.17
Nodes (16): DEFAULT_SUB_SETTINGS, GeneralSettings, SubPageProtocolConfig, SubscriptionPageSettings, AuthContext, ensureAccountOperational(), AccountRecord, ADMIN_PERMISSIONS (+8 more)

### Community 21 - "collector.ts"
Cohesion: 0.47
Nodes (4): collectLinuxLiveTunnels(), lastTunnelBytes, runCollectorTick(), startCollectorLoop()

### Community 22 - "settingsRoutes.ts"
Cohesion: 0.14
Nodes (20): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+12 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.58
Nodes (10): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), require_root() (+2 more)

## Knowledge Gaps
- **161 isolated node(s):** `__dirname`, `LayoutProps`, `DIGIT_SETS`, `TabItem`, `XpGlobals` (+156 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 175 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `ClientDetailPage.tsx` to `web/package.json`, `App.tsx`, `ClientsPage.tsx`, `NodesPage.tsx`, `useUi`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `__dirname`, `LayoutProps`, `DIGIT_SETS` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `linuxEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12698412698412698 - nodes in this community are weakly interconnected._
- **Why does `express` connect `clientRoutes.ts` to `linuxEngine.ts`, `Server Dependencies & Manifest`, `authRoutes.ts`, `index.ts`, `getDb`, `database.ts`, `settingsRoutes.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `ClientDetailPage.tsx`, `web/package.json`, `ClientsPage.tsx`, `NodesPage.tsx`, `useUi`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._