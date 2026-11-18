---
name: xprotocol-frontend-ui
description: >-
  React 19 + Vite 6 + Tailwind v4 web UI architecture, routes, bilingual EN/FA
  RTL theming, UiPrimitives/Modal exact prop contracts, CSRF + 2FA confirmation
  interceptor, XrayWizard/Editor, TemplatesPage, NodesPage health/security, and
  modular SettingsPage components. Load before editing any file under web/src/.
---

# XProtocol Frontend UI & Styling

## Fast Reference
Read [components-and-routes.md](./references/components-and-routes.md) for the exact `App.tsx` / `router.ts` routes, component tree, CSS classes, and Settings tab structure.

## Exact Shared Component Contracts (Prevents TS Errors)
- **`PageHead` (`web/src/components/UiPrimitives.tsx`)**: Props `{ title, sub?, actions?, docTitle? }`. Use `sub=`, NEVER `subtitle=`. Pass `undefined` (not `false`) for optional `actions`.
- **`StatusPill` (`UiPrimitives.tsx`)**: Props `{ tone: 'green'|'good'|'lime'|'amber'|'warn'|'red'|'bad'|'gray'|'neutral'|'blue', label?, children? }`.
- **`Modal` (`web/src/components/Modal.tsx`)**: Props `{ open, onClose, title, subtitle?, maxWidth?, size?: 'sm'|'md'|'lg'|'xl', children }`.
- **`apiFetch` (`web/src/lib/api.ts`)**: Automatically injects `X-CSRF-Token`, prefixes `toPanelUrl('/api' + path)`, and intercepts `403 { code: 'mfa_confirm_required' }` by invoking `MfaConfirmModal` (registered in `App.tsx`) and seamlessly retrying the request once confirmed.
- **API response alignment**: When calling `/auth/me` safely with `.catch(...)`, return `{ account: undefined }` rather than `{}` so optional chaining stays typed cleanly.

## Key UI Surfaces & Conventions
- **Navigation (`Layout.tsx` + `CommandPalette.tsx` + `NotificationsDrawer.tsx`)**: Global `Ctrl+K` / `Cmd+K` search palette, notification bell (`unread` count polling), `Templates` route (`/templates` -> `TemplatesPage`), `BrandMark` interlocking X SVG.
- **Inbounds**: `/inbounds/new?kind=xray` renders `XrayWizard.tsx`; `/inbounds/:id` renders `XrayInboundEditor.tsx` (presets, combos, SNI probe/scan, key rotation, PROXY check) + shared node/group subforms.
- **Clients & Templates**: `ClientsPage.tsx` handles `templatesOnly` resellers, `.txt` batch download, bulk action bar (`set_speed`, `set_devices`, `set_sub`, `apply_template`, `move_owner`, etc.); `ClientDetailPage.tsx` shows V2Ray share URIs + QR + rotate keys + speed/reset fields.
- **Settings (`SettingsPage.tsx`)**: Delegates heavy tabs to `SettingsWebhooksTab.tsx`, `SettingsBackupDestinations.tsx`, `SettingsSubDomainsAndApps.tsx`, and `SettingsSecurityAndNotifications.tsx`.
- **I18n**: Update BOTH `web/src/i18n/en.ts` and `web/src/i18n/fa.ts`; put `dir="ltr"` on URLs, CIDRs, tokens, hostnames, ports, and code snippets.
