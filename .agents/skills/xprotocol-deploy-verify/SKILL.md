---
name: xprotocol-deploy-verify
description: >-
  Ubuntu 22.04+ deployment scripts (install.sh, node.sh with --panel-ip and
  Xray installation, xprotocol-cli.sh, xprotocol.service) and Windows PowerShell
  build, typecheck, targeted test, and code-search runbooks. Load when editing
  deploy/, running builds/tests, or searching symbols on Windows.
---

# XProtocol Deployment & Verification Runbook

## Windows Dev Host Rules (PowerShell)
- **Command Chaining**: Use `;` (or `if ($LASTEXITCODE -eq 0) { ... }`), NEVER `&&` in older PowerShell expectations—always write PowerShell-compatible commands.
- **Text Search**: `rg` is NOT installed on this host. Use PowerShell `Select-String` or `graphify` (`graphify query|path|explain`):
  - Run [locate.ps1](./scripts/locate.ps1) or:
    `Select-String -Path server/src/**/*.ts -Pattern "MySymbol" | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }`
- **Verification**:
  - Quick full verify script: [verify.ps1](./scripts/verify.ps1) (runs `typecheck`, `build`, and `test` fail-fast).
  - Single test file (fast inner loop): `npm --prefix server run typecheck; npx --prefix server tsx --test tests/ovira20.test.ts`
  - Full pre-completion gate: `npm run typecheck; if ($LASTEXITCODE -eq 0) { npm run build }; if ($LASTEXITCODE -eq 0) { npm test }`

## Ubuntu 22.04+ Deployment Scripts (`deploy/`)
- `deploy/install.sh`: Full panel host bootstrap (Node 24+, `openvpn`, `wireguard-tools`, `amneziawg`, `ocserv`, `strongswan`, `xl2tpd`, `xray`, `certbot`, UFW, systemd service `xprotocol.service`).
- `deploy/node.sh`: Remote worker node installer; supports `--panel-ip` to pin allowed panel management IP, `--panel`, `--name`, `--key`, `--port`, and installs/enables `xray` + tunnel daemons.
- `deploy/xprotocol-cli.sh` & `deploy/xprotocol-tui.sh`: Interactive host CLI/TUI for status, logs, restart, password reset, port/path recovery.
- `deploy/xprotocol.service`: Systemd unit running built `server/dist/index.js`.
