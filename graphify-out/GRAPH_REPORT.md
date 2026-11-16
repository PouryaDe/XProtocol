# Graph Report - Ovira  (2026-11-16)

## Corpus Check
- 72 files · ~62,085 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 474 nodes · 1563 edges · 22 communities (21 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0c2d5416`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- en.ts
- AccountsPage.tsx
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
- UpdatesPage.tsx
- SettingsPage.tsx
- index.ts
- updater.ts
- linuxEngine.ts
- xprotocol-cli.sh
- DonutChart.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 43 edges
2. `useUi()` - 37 edges
3. `apiFetch()` - 33 edges
4. `Button()` - 29 edges
5. `PageHead()` - 29 edges
6. `PanelRoot()` - 26 edges
7. `react` - 26 edges
8. `StatusPill()` - 25 edges
9. `ClientsPage()` - 24 edges
10. `Input()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createUpdateRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/updateRoutes.ts → server/src/routes/context.ts
- `PanelRoot()` --calls--> `Layout()`  [EXTRACTED]
  web/src/App.tsx → web/src/components/Layout.tsx
- `Layout()` --calls--> `useUi()`  [EXTRACTED]
  web/src/components/Layout.tsx → web/src/i18n/context.tsx
- `Layout()` --calls--> `apiFetch()`  [EXTRACTED]
  web/src/components/Layout.tsx → web/src/lib/api.ts

## Import Cycles
- None detected.

## Communities (22 total, 1 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.29
Nodes (14): niceScale(), TrafficChart(), TrafficSample, Odometer(), Segmented(), formatBytes(), formatBytesParts(), formatDaysLeft() (+6 more)

### Community 1 - "en.ts"
Cohesion: 0.40
Nodes (4): UiContextValue, en, TranslationDict, fa

### Community 2 - "AccountsPage.tsx"
Cohesion: 0.16
Nodes (11): Modal(), ModalProps, AccountItem, RoleItem, GroupItem, InboundOption, GEOIP_PRESETS, GEOSITE_PRESETS (+3 more)

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
Cohesion: 0.13
Nodes (23): App(), resolveRoute(), CurrentAccount, Layout(), LayoutProps, NAV_PATHS, NavKey, Ambient() (+15 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "ClientDetailPage.tsx"
Cohesion: 0.19
Nodes (15): Lamps(), getApiBase(), getBasePath(), getRelativePath(), getSubPath(), inferBasePath(), KNOWN_SEGMENTS, XpGlobals (+7 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "useUi"
Cohesion: 0.35
Nodes (27): PanelRoot(), Button(), EmptySonar(), Input(), PageHead(), Select(), StatusPill(), Tabs() (+19 more)

### Community 14 - "NodesPage.tsx"
Cohesion: 0.21
Nodes (10): lucide-react, Drawer(), DrawerProps, CertItem, InboundItem, NodeOption, PROTOCOL_CARDS, NodeItem (+2 more)

### Community 15 - "UpdatesPage.tsx"
Cohesion: 0.36
Nodes (7): EqLoader(), formatDateTime(), formatCheckedAgo(), ReleaseEntry, UpdateSettings, UpdatesPage(), UpdateState

### Community 16 - "SettingsPage.tsx"
Cohesion: 0.19
Nodes (11): react, QrCode(), ACCENTS, LOOKS, SettingsTab, SUB_SWATCHES, SubBuilderTab, CARD_STYLES (+3 more)

### Community 17 - "index.ts"
Cohesion: 0.07
Nodes (86): express, CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath() (+78 more)

### Community 19 - "updater.ts"
Cohesion: 0.16
Nodes (24): setSetting(), createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync (+16 more)

### Community 21 - "linuxEngine.ts"
Cohesion: 0.11
Nodes (20): applyLinuxInbound(), collectLinuxLiveTunnels(), execFileAsync, LiveTunnelSample, openFirewallPort(), PROTOCOL_BINARIES, ProtocolName, ProtocolStatus (+12 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

## Knowledge Gaps
- **170 isolated node(s):** `LayoutProps`, `TrafficSample`, `DIGIT_SETS`, `OverviewResponse`, `PreviewSettingsOverride` (+165 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `index.ts` to `updater.ts`, `Server Dependencies & Manifest`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `LayoutProps`, `TrafficSample`, `DIGIT_SETS` to the rest of the system?**
  _170 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.057057057057057055 - nodes in this community are weakly interconnected._
- **Why does `react` connect `SettingsPage.tsx` to `OverviewPage.tsx`, `AccountsPage.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `NodesPage.tsx`, `UpdatesPage.tsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `Server Dependencies & Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `NodesPage.tsx` to `OverviewPage.tsx`, `AccountsPage.tsx`, `web/package.json`, `App.tsx`, `ClientDetailPage.tsx`, `useUi`, `UpdatesPage.tsx`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `Web TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._