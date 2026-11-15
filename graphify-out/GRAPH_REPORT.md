# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- 66 files · ~49,881 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 388 nodes · 1171 edges · 25 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8422fea3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- database.ts
- linuxEngine.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- App.tsx
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- config.ts
- Project Documentation & Architecture
- install.sh
- ClientsPage.tsx
- Button
- apiFetch
- SettingsPage.tsx
- en.ts
- index.ts
- getDb
- clientRoutes.ts
- authRoutes.ts
- settingsRoutes.ts
- xprotocol-cli.sh
- context.ts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 41 edges
2. `useUi()` - 29 edges
3. `apiFetch()` - 26 edges
4. `Button()` - 23 edges
5. `Card()` - 23 edges
6. `react` - 22 edges
7. `StatusPill()` - 21 edges
8. `Input()` - 19 edges
9. `recordAudit()` - 18 edges
10. `PanelRoot()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createAccountRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/accountRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `applyPendingRestore()` --calls--> `getDbPath()`  [EXTRACTED]
  server/src/index.ts → server/src/config.ts
- `ClientProfileParams` --references--> `InboundRow`  [EXTRACTED]
  server/src/generators/profiles.ts → server/src/generators/configs.ts

## Import Cycles
- None detected.

## Communities (25 total, 0 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.19
Nodes (18): DonutChart(), Segment, Sample, TrafficChart(), formatBytes(), formatDateTime(), formatDaysLeft(), formatDuration() (+10 more)

### Community 1 - "database.ts"
Cohesion: 0.15
Nodes (14): DEFAULT_SUB_SETTINGS, GeneralSettings, initDatabase(), setSetting(), SubPageProtocolConfig, SubscriptionPageSettings, ADMIN_PERMISSIONS, OWNER_PERMISSIONS (+6 more)

### Community 2 - "linuxEngine.ts"
Cohesion: 0.11
Nodes (22): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), issueLetsEncryptCert(), LiveTunnelSample, openFirewallPort() (+14 more)

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
Cohesion: 0.27
Nodes (14): PanelRoot(), CurrentAccount, Layout(), LayoutProps, NavKey, ACCENT_PALETTES, AccentName, Lang (+6 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "config.ts"
Cohesion: 0.14
Nodes (12): CONFIG_PATH, DATA_DIR, formatMachineId(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath(), RuntimeConfig, saveRuntimeConfig() (+4 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.29
Nodes (4): DEBIAN_FRONTEND, install.sh script, DEBIAN_FRONTEND, node.sh script

### Community 13 - "ClientsPage.tsx"
Cohesion: 0.18
Nodes (14): lucide-react, react, Drawer(), DrawerProps, ModalProps, CertItem, ClientItem, GroupOption (+6 more)

### Community 14 - "Button"
Cohesion: 0.34
Nodes (17): Modal(), Button(), Card(), Input(), Select(), StatusPill(), AccountItem, AccountsPage() (+9 more)

### Community 15 - "apiFetch"
Cohesion: 0.24
Nodes (8): ApiError, apiFetch(), getApiBase(), GEOIP_PRESETS, GEOSITE_PRESETS, NodeOption, OutboundItem, RoutingRule

### Community 16 - "SettingsPage.tsx"
Cohesion: 0.40
Nodes (4): QrCode(), ACCENTS, LOOKS, SettingsTab

### Community 17 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 18 - "index.ts"
Cohesion: 0.21
Nodes (12): updateXrayGeoAssets(), detectDriverMode(), HostStats, testTcpLatency(), renderXrayRoutingConfig(), applyPendingRestore(), createApp(), __dirname (+4 more)

### Community 19 - "getDb"
Cohesion: 0.35
Nodes (11): express, getDb(), applyInboundRuntime(), createConnectionRouter(), AuthedRequest, createGroupRouter(), createInboundRouter(), getInboundPeers() (+3 more)

### Community 20 - "clientRoutes.ts"
Cohesion: 0.33
Nodes (13): DEFAULT_GENERAL_SETTINGS, getSetting(), getHostStats(), generateClientProfile(), createClientRouter(), resolveClientInbounds(), computeClientState(), ensureAccountOperational() (+5 more)

### Community 21 - "authRoutes.ts"
Cohesion: 0.35
Nodes (9): createAccountRouter(), createAuthRouter(), loadAccountById(), hashPassword(), randomToken(), verifyPassword(), buildTotpUri(), generateRecoveryCodes() (+1 more)

### Community 22 - "settingsRoutes.ts"
Cohesion: 0.38
Nodes (8): getDataDir(), getDbPath(), createSettingsRouter(), DEFAULT_TELEGRAM_BACKUP, findTelegramChatId(), sendTelegramBackupNow(), startTelegramBackupScheduler(), TelegramBackupSettings

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.58
Nodes (10): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), require_root() (+2 more)

### Community 24 - "context.ts"
Cohesion: 0.48
Nodes (6): AuthContext, extractClientIp(), parseCookies(), requireAuth(), sha256Hex(), AccountRecord

## Knowledge Gaps
- **143 isolated node(s):** `install.sh script`, `DEBIAN_FRONTEND`, `node.sh script`, `DEBIAN_FRONTEND`, `Segment` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 155 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `getDb` to `Server Dependencies & Manifest`, `index.ts`, `clientRoutes.ts`, `authRoutes.ts`, `settingsRoutes.ts`, `context.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `install.sh script`, `DEBIAN_FRONTEND`, `node.sh script` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `linuxEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `Button`, `apiFetch`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `Button`, `apiFetch`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._