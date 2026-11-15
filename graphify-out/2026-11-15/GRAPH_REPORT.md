# Graph Report - Ovira  (2026-11-15)

## Corpus Check
- 66 files · ~49,832 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .service 1, .css 1)

## Summary
- 377 nodes · 1138 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0d43ce2c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- OverviewPage.tsx
- index.ts
- linuxEngine.ts
- web/package.json
- API Integration Test Suite
- Server Dependencies & Manifest
- Web TypeScript Configuration
- App.tsx
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- settingsRoutes.ts
- Project Documentation & Architecture
- install.sh
- ClientsPage.tsx
- Button
- apiFetch
- SettingsPage.tsx
- en.ts
- node.sh

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 41 edges
2. `useUi()` - 29 edges
3. `apiFetch()` - 26 edges
4. `Button()` - 23 edges
5. `Card()` - 23 edges
6. `react` - 22 edges
7. `StatusPill()` - 21 edges
8. `Input()` - 19 edges
9. `PanelRoot()` - 18 edges
10. `recordAudit()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Ovira Open-Core VPN Panel` --conceptually_related_to--> `Inter JetBrains Mono Vazirmatn Typography`  [INFERRED]
  README.md → web/index.html
- `createRoutingRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/routingRoutes.ts → server/src/routes/context.ts
- `createSettingsRouter()` --indirect_call--> `requireOwner()`  [INFERRED]
  server/src/routes/settingsRoutes.ts → server/src/routes/context.ts
- `ClientProfileParams` --references--> `InboundRow`  [EXTRACTED]
  server/src/generators/profiles.ts → server/src/generators/configs.ts
- `PanelRoot()` --calls--> `apiFetch()`  [EXTRACTED]
  web/src/App.tsx → web/src/lib/api.ts

## Import Cycles
- None detected.

## Communities (19 total, 2 thin omitted)

### Community 0 - "OverviewPage.tsx"
Cohesion: 0.19
Nodes (18): DonutChart(), Segment, Sample, TrafficChart(), formatBytes(), formatDateTime(), formatDaysLeft(), formatDuration() (+10 more)

### Community 1 - "index.ts"
Cohesion: 0.10
Nodes (58): express, DEFAULT_GENERAL_SETTINGS, DEFAULT_SUB_SETTINGS, GeneralSettings, getDb(), getSetting(), initDatabase(), setSetting() (+50 more)

### Community 2 - "linuxEngine.ts"
Cohesion: 0.10
Nodes (31): applyLinuxInbound(), collectLinuxLiveTunnels(), detectInstalledProtocols(), execFileAsync, installProtocolPackage(), issueLetsEncryptCert(), LiveTunnelSample, openFirewallPort() (+23 more)

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

### Community 10 - "settingsRoutes.ts"
Cohesion: 0.15
Nodes (18): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), getDbPath(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath() (+10 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

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

## Knowledge Gaps
- **143 isolated node(s):** `install.sh script`, `DEBIAN_FRONTEND`, `Segment`, `DrawerProps`, `LayoutProps` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 156 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `index.ts` to `linuxEngine.ts`, `settingsRoutes.ts`, `Server Dependencies & Manifest`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `install.sh script`, `DEBIAN_FRONTEND`, `Segment` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09657009657009658 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `Button`, `apiFetch`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `linuxEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09872241579558652 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `ClientsPage.tsx` to `OverviewPage.tsx`, `web/package.json`, `App.tsx`, `Button`, `apiFetch`, `SettingsPage.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._