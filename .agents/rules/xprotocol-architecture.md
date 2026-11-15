# XProtocol Engineering & Platform Rules

1. **Project Identity & Parity**: Project name is **XProtocol**, built as a clean-room reverse-engineered copy of the Ovira panel architecture, features, protocols, and UI/UX animations/theme system.
2. **Target OS**: Real runtime drivers (`server/src/drivers/linuxEngine.ts`, `deploy/*.sh`) target **Ubuntu 22.04+ Linux** (`wg`/`awg`, `openvpn`, `ocserv`, `strongswan`, `xl2tpd`, `ufw`, `certbot`, `systemd`). Windows is used only as a dev editor host (with PowerShell `;` command chaining).
3. **Database**: Uses Node 24 built-in `node:sqlite` (`DatabaseSync`) with WAL mode in `server/src/db/database.ts` (`xprotocol.db`).
4. **Security & Auth**: Cookie-based HMAC sessions (`xprotocol_session`, `HttpOnly`, `SameSite=Lax`), `X-CSRF-Token` enforcement on state-changing routes, scrypt password hashing, TOTP 2FA with recovery codes, scoped API tokens, and strict owner/reseller RBAC isolation.
5. **UI/UX**: Bilingual English (LTR) + Persian (RTL), `system`/`dark`/`light` themes (`mint` obsidian-emerald dark & warm stone light), 8 accent presets, slide-over drawers, cursor-tracking `.xp-card` spotlight effects, and staggered entrance animations.
6. **Verification**: Never mark work complete without running `npm run typecheck`, `npm run build`, and `npm test` after the final edit.
