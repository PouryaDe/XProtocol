# XProtocol Frontend Components, Routes & Exact Prop Contracts

## Routes (`web/src/App.tsx` + `web/src/lib/router.ts`)
| Path | NavKey | Component |
| :--- | :----- | :-------- |
| `/` | `overview` | `OverviewPage` |
| `/clients`, `/clients/:id` | `clients` | `ClientsPage`, `ClientDetailPage` |
| `/templates` | `templates` | `TemplatesPage` (`isOwner`) |
| `/groups` | `groups` | `GroupsPage` |
| `/inbounds`, `/inbounds/new`, `/inbounds/:id` | `inbounds` | `InboundsPage`, `InboundDetailPage` (`XrayWizard` / `XrayInboundEditor`) |
| `/nodes` | `nodes` | `NodesPage` (90d uptime bars, Health SVG charts, Security allowlist + rotate key) |
| `/connections` | `connections` | `ConnectionsPage` |
| `/routing` | `routing` | `RoutingPage` |
| `/certificates` | `certificates` | `CertificatesPage` |
| `/accounts` | `accounts` | `AccountsPage` (templatesOnly + reseller SubOrigin modal) |
| `/updates` | `updates` | `UpdatesPage` |
| `/settings` | `settings` | `SettingsPage` |
| `/:subPath/:token` | — | `SubscriptionPage` (public V2Ray + VPN tabs + QR + Happ button) |

## Exact Component Props (Do NOT Guess)
- **`PageHead` (`UiPrimitives.tsx`)**: `{ title: ReactNode, sub?: ReactNode, actions?: ReactNode, docTitle?: string }` -> use `sub=`, NEVER `subtitle=`.
- **`StatusPill` (`UiPrimitives.tsx`)**: `{ tone: 'green'|'good'|'lime'|'amber'|'warn'|'red'|'bad'|'gray'|'neutral'|'blue', label?: ReactNode, children?: ReactNode }`.
- **`Button` (`UiPrimitives.tsx`)**: `{ variant?: 'primary'|'secondary'|'danger'|'ghost', size?: 'sm'|'md', ... }`.
- **`Modal` (`Modal.tsx`)**: `{ open: boolean, onClose: () => void, title: string, subtitle?: string, maxWidth?: string, size?: 'sm'|'md'|'lg'|'xl', children: ReactNode }`.
- **`Tabs<T>` (`UiPrimitives.tsx`)**: `{ items: { id: T, label: ReactNode, count?: number }[], value: T, onChange: (id: T) => void }`.

## Settings Tab Architecture (`SettingsPage.tsx`)
- `general`: Brand/public address, `panelUrl`, searchable IANA `timezone`, warning thresholds, `eventRetainDays`, `nodeSampleRawDays`, `nodeSampleKeepDays`, `metricsRoot` toggle + Prometheus `scrape_configs` snippet.
- `subscription`: `look`, `shop`, `proto` (includes `xray` V2Ray), plus modular `<SettingsSubAppsSection />` (`apps`) and `<SettingsSubOriginsSection />` (`domains`)—also available to resellers with `ownSubOrigins`.
- `panelAccess`: Panel/sub ports, `secretPath`, `subPath`, TLS paths, `trustProxy`.
- `myAccount`: Password, 2FA setup/enable, active sessions, `<SettingsAccountTelegramNotifications />`, owner-only `<SettingsSignInProtection />` (CIDRs + lockdown + active bans table).
- `webhooks`: `<SettingsWebhooksTab />` (22 event checkboxes, HMAC secret modal, test delivery, delivery history).
- `api`: Scoped bearer tokens + OpenAPI `/api/settings/openapi.json`.
- `backup`: Sub-tabs `telegram` (`.db` download/restore + Telegram), `s3` & `sftp` via `<SettingsBackupDestinations />` (`.ovbk` AES-256, schedule, retention, hostkey, file restore).
- `audit`: Recent admin actions.
