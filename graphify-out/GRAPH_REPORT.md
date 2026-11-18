# Graph Report - Ovira  (2026-11-18)

## Corpus Check
- 115 files · ~152,626 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .css 2, .service 1)

## Summary
- 940 nodes · 3374 edges · 39 communities (34 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `edff8322`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RoutingPage.tsx
- InboundDetailPage.tsx
- linuxEngine.ts
- web/package.json
- offsiteBackup.ts
- Server Dependencies & Manifest
- Web TypeScript Configuration
- updater.ts
- Workspace Monorepo Scripts
- Server TypeScript Configuration
- getSetting
- Project Documentation & Architecture
- install.sh
- useUi
- configs.ts
- xrayEngine.ts
- SubscriptionPage.tsx
- routingRoutes.ts
- clientRoutes.ts
- context.ts
- authRoutes.ts
- getDb
- inboundRoutes.ts
- xprotocol-cli.sh
- DonutChart.tsx
- database.ts
- index.ts
- collector.ts
- peerResolver.ts
- XProtocol Backend, DB Schema & Routes
- resetSchedule.ts
- XProtocol Frontend Components, Routes & Exact Prop Contracts
- XProtocol Xray & Linux VPN Drivers
- renderInboundServerConfig
- XProtocol Deployment & Verification Runbook
- XProtocol Open-Core VPN Panel — Agent Workspace Instructions
- XProtocol Core Workspace Rules

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 98 edges
2. `useUi()` - 70 edges
3. `Button()` - 64 edges
4. `apiFetch()` - 62 edges
5. `getSetting()` - 45 edges
6. `react` - 38 edges
7. `Modal()` - 37 edges
8. `PageHead()` - 35 edges
9. `Input()` - 34 edges
10. `InboundDetailPage()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Checklist Before Editing Backend` --references--> `requireOwner()`  [INFERRED]
  .agents/skills/xprotocol-backend-db/SKILL.md → server/src/routes/context.ts
- `Security Controls (`loginGuard.ts`, `authRoutes.ts`, `context.ts`, `nodeRoutes.ts`)` --references--> `requireFreshMfa()`  [INFERRED]
  .agents/skills/xprotocol-security-ops-sub/references/ops-and-security.md → server/src/routes/context.ts
- `Hard Invariants (Zero-Tolerance Precision)` --references--> `initDatabase()`  [INFERRED]
  .agents/rules/xprotocol-architecture.md → server/src/db/database.ts
- `Key Architecture Facts` --references--> `initDatabase()`  [INFERRED]
  .agents/skills/xprotocol-backend-db/SKILL.md → server/src/db/database.ts
- `Key UI Surfaces & Conventions` --references--> `BrandMark()`  [INFERRED]
  .agents/skills/xprotocol-frontend-ui/SKILL.md → web/src/components/UiPrimitives.tsx

## Import Cycles
- None detected.

## Communities (39 total, 5 thin omitted)

### Community 0 - "RoutingPage.tsx"
Cohesion: 0.14
Nodes (35): defaultPortForProto(), NORD_COUNTRIES, NordVpnModal(), OutboundModal(), PROTO_LABELS, PROTOCOLS, PsiphonModal(), REGION_NAMES (+27 more)

### Community 1 - "InboundDetailPage.tsx"
Cohesion: 0.15
Nodes (32): CertOption, DeploymentNodesPanel(), ESP_PROPOSALS, FoldSection(), IKE_PROPOSALS, IpsecSection(), L(), NodePickerGrid() (+24 more)

### Community 2 - "linuxEngine.ts"
Cohesion: 0.14
Nodes (29): applyLinuxInbound(), collectLinuxLiveTunnels(), disconnectLinuxPeer(), ensurePppSessionHooks(), ensureSubnetNat(), ensureSystemdTemplateUnits(), escapeSecretField(), execFileAsync (+21 more)

### Community 3 - "web/package.json"
Cohesion: 0.06
Nodes (32): qrcode, tailwindcss, @tailwindcss/vite, @types/qrcode, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+24 more)

### Community 4 - "offsiteBackup.ts"
Cohesion: 0.10
Nodes (37): Events & Webhooks (`server/src/services/events.ts`), Off-site Encrypted Backups (`.ovbk`) (`server/src/services/offsiteBackup.ts`), Proxy App Subscription Headers (`server/src/routes/subRoutes.ts`), Security Controls (`loginGuard.ts`, `authRoutes.ts`, `context.ts`, `nodeRoutes.ts`), Subscriptions, Security, Events, Backups & Metrics Reference, Fast Reference, Subsystems & Exact Rules, XProtocol Subscriptions, Security & Ops (+29 more)

### Community 5 - "Server Dependencies & Manifest"
Cohesion: 0.09
Nodes (21): tsx, @types/express, @types/node, dependencies, express, devDependencies, tsx, @types/express (+13 more)

### Community 6 - "Web TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 7 - "updater.ts"
Cohesion: 0.16
Nodes (27): createUpdateRouter(), checkForUpdates(), compareSemver(), DEFAULT_META, DEFAULT_UPDATE_SETTINGS, __dirname, execFileAsync, fetchGithubJson() (+19 more)

### Community 8 - "Workspace Monorepo Scripts"
Cohesion: 0.14
Nodes (13): description, devDependencies, concurrently, name, private, scripts, build, dev (+5 more)

### Community 9 - "Server TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+4 more)

### Community 10 - "getSetting"
Cohesion: 0.16
Nodes (28): getSetting(), createAccountRouter(), loadAccountById(), requireOwner(), createEventsRouter(), buildNotificationSettings(), createSettingsRouter(), runPeriodicResets() (+20 more)

### Community 11 - "Project Documentation & Architecture"
Cohesion: 0.33
Nodes (6): Multi-Protocol VPN Stack, Overview Dashboard Architecture, Ovira Open-Core VPN Panel, RBAC Reseller Quota Model, Ubuntu 22.04 Systemd Deployment, Inter JetBrains Mono Vazirmatn Typography

### Community 12 - "install.sh"
Cohesion: 0.14
Nodes (16): DEBIAN_FRONTEND, do_update_from_src(), launch_cli_menu(), NEEDRESTART_MODE, NEEDRESTART_SUSPEND, npm_config_audit, npm_config_fund, npm_config_loglevel (+8 more)

### Community 13 - "useUi"
Cohesion: 0.05
Nodes (158): Token-Efficiency & Navigation Protocol, Exact Component Props (Do NOT Guess), Routes (`web/src/App.tsx` + `web/src/lib/router.ts`), Exact Shared Component Contracts (Prevents TS Errors), Tech Stack & Modules, lucide-react, react, react-dom (+150 more)

### Community 14 - "configs.ts"
Cohesion: 0.10
Nodes (27): CONFIG_PATH, DATA_DIR, formatMachineId(), getDataDir(), loadRuntimeConfig(), normalizeSecretPath(), normalizeSubPath(), RuntimeConfig (+19 more)

### Community 15 - "xrayEngine.ts"
Cohesion: 0.12
Nodes (26): Core Modules & Responsibilities, collectXrayLiveStats(), execFileAsync, getSniJob(), getSniListForNode(), KCP_HEADERS, kickXrayClient(), probeRealitySni() (+18 more)

### Community 16 - "SubscriptionPage.tsx"
Cohesion: 0.08
Nodes (65): TrafficSample, BrandMark(), Odometer(), ACCENT_CSS_VARS, applySubTheme(), computeSubAccentTokens(), ContactKind, contrast() (+57 more)

### Community 17 - "routingRoutes.ts"
Cohesion: 0.13
Nodes (22): applyXrayRouting(), updateXrayGeoAssets(), buildUnifiedXrayConfig(), renderXrayInboundObject(), syncAndApplyXrayEngine(), InboundRouteOverride, renderXrayRoutingConfig(), RoutingRule (+14 more)

### Community 18 - "clientRoutes.ts"
Cohesion: 0.16
Nodes (24): express, ensureClientCertificate(), ensureOpenVpnPki(), getPkiDir(), buildClientXrayServerViews(), AuthedAccount, canMutateClient(), createClientRouter() (+16 more)

### Community 19 - "context.ts"
Cohesion: 0.16
Nodes (20): DEFAULT_GENERAL_SETTINGS, getHostStats(), AuthContext, AuthedRequest, ensureAccountOperational(), parseCookies(), requireAuth(), createDashboardRouter() (+12 more)

### Community 20 - "authRoutes.ts"
Cohesion: 0.20
Nodes (20): createAuthRouter(), extractClientIp(), hashPassword(), randomToken(), verifyPassword(), BAN_LADDER_SEC, checkLoginAllowed(), clearLoginFailures() (+12 more)

### Community 21 - "getDb"
Cohesion: 0.23
Nodes (17): Hard Invariants (Zero-Tolerance Precision), Key Architecture Facts, getDb(), detectInstalledProtocols(), installProtocolPackage(), ProtocolName, testTcpLatency(), createConnectionRouter() (+9 more)

### Community 22 - "inboundRoutes.ts"
Cohesion: 0.18
Nodes (19): Linux VPN Drivers (`server/src/drivers/linuxEngine.ts` + `pki.ts` + `configs.ts`), Xray Combos & Presets (`server/src/drivers/xrayEngine.ts`), Xray Engine & Linux Tunnel Drivers Reference, buildXrayPresetDefaults(), CURATED_SNI_DOMAINS, findXrayCombo(), sanitizeXraySettingsForClient(), validateXraySettings() (+11 more)

### Community 23 - "xprotocol-cli.sh"
Cohesion: 0.55
Nodes (11): cmd_backup(), cmd_logs(), cmd_ocserv(), cmd_password(), cmd_ssl(), cmd_status(), cmd_uninstall(), cmd_update() (+3 more)

### Community 25 - "database.ts"
Cohesion: 0.18
Nodes (14): DEFAULT_PROXY_APPS, DEFAULT_SUB_SETTINGS, GeneralSettings, ProxyAppsSettings, SubPageProtocolConfig, SubscriptionPageSettings, ADMIN_PERMISSIONS, OWNER_PERMISSIONS (+6 more)

### Community 26 - "index.ts"
Cohesion: 0.22
Nodes (13): getDbPath(), initDatabase(), setSetting(), detectDriverMode(), applyPendingRestore(), createApp(), detectHostIpv4(), __dirname (+5 more)

### Community 27 - "collector.ts"
Cohesion: 0.17
Nodes (14): applyDedicatedSessionLimits(), applyInterfaceSpeedLimits(), calcTcRateAndBurst(), LiveTunnelSample, minorOfIp(), appliedDedicatedShape, appliedSharedOvpnShape, lastActivityAt (+6 more)

### Community 28 - "peerResolver.ts"
Cohesion: 0.42
Nodes (9): allocateTunnelIp(), getEligiblePeersForInbound(), intToIp(), ipToInt(), isClientActiveQuota(), minPositive(), parseCidr(), ParsedCidr (+1 more)

### Community 29 - "XProtocol Backend, DB Schema & Routes"
Cohesion: 0.25
Nodes (6): API Mounts (`server/src/index.ts`), Exact SQLite Tables & Columns (`server/src/db/database.ts`), XProtocol SQLite Schema & API Mount Map, Checklist Before Editing Backend, Fast Reference, XProtocol Backend, DB Schema & Routes

### Community 30 - "resetSchedule.ts"
Cohesion: 0.50
Nodes (7): computeNextResetIso(), findNextCalendarBoundaryMs(), findStartOfLocalDayMs(), getZonedParts(), normalizeResetStrategy(), ResetStrategy, ZonedParts

### Community 31 - "XProtocol Frontend Components, Routes & Exact Prop Contracts"
Cohesion: 0.29
Nodes (5): Settings Tab Architecture (`SettingsPage.tsx`), XProtocol Frontend Components, Routes & Exact Prop Contracts, Fast Reference, Key UI Surfaces & Conventions, XProtocol Frontend UI & Styling

### Community 32 - "XProtocol Xray & Linux VPN Drivers"
Cohesion: 0.40
Nodes (3): Fast Reference, Verification, XProtocol Xray & Linux VPN Drivers

### Community 33 - "renderInboundServerConfig"
Cohesion: 0.80
Nodes (5): escapeQuoted(), parseListSetting(), renderInboundExtraFiles(), renderInboundServerConfig(), sanitizeLine()

### Community 34 - "XProtocol Deployment & Verification Runbook"
Cohesion: 0.50
Nodes (3): Ubuntu 22.04+ Deployment Scripts (`deploy/`), Windows Dev Host Rules (PowerShell), XProtocol Deployment & Verification Runbook

## Knowledge Gaps
- **254 isolated node(s):** `Fast Reference`, `API Mounts (`server/src/index.ts`)`, `Exact SQLite Tables & Columns (`server/src/db/database.ts`)`, `Windows Dev Host Rules (PowerShell)`, `Ubuntu 22.04+ Deployment Scripts (`deploy/`)` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 273 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `XProtocol Core Workspace Rules` connect `XProtocol Core Workspace Rules` to `useUi`, `getDb`?**
  _High betweenness centrality (0.405) - this node is a cross-community bridge._
- **What connects `Fast Reference`, `API Mounts (`server/src/index.ts`)`, `Exact SQLite Tables & Columns (`server/src/db/database.ts`)` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RoutingPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13655761024182078 - nodes in this community are weakly interconnected._
- **Why does `Hard Invariants (Zero-Tolerance Precision)` connect `getDb` to `index.ts`, `XProtocol Core Workspace Rules`?**
  _High betweenness centrality (0.405) - this node is a cross-community bridge._
- **Should `linuxEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1354723707664884 - nodes in this community are weakly interconnected._
- **Why does `Token-Efficiency & Navigation Protocol` connect `useUi` to `XProtocol Core Workspace Rules`?**
  _High betweenness centrality (0.404) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.062388591800356503 - nodes in this community are weakly interconnected._