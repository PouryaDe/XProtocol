# XProtocol — Open-Core Multi-Protocol VPN Panel

Clean-room, open-core VPN management panel targeting **Ubuntu 22.04+ Linux** with full UI/UX parity (interactive ambient backdrop, 8 accent palettes, dark/light themes, EN/LTR + FA/RTL localization, tunnel login screen, live odometer telemetry, and 6 subscription page themes).

---

## One-Line Linux Installation (Ubuntu 22.04+)

Run on a fresh Ubuntu 22.04+ / Debian server to launch the interactive 4-step TUI installer:

```bash
curl -fsSL https://raw.githubusercontent.com/PouryaDe/XProtocol/main/deploy/install.sh | sudo bash
```

Or install unattended with flags:

```bash
curl -fsSL https://raw.githubusercontent.com/PouryaDe/XProtocol/main/deploy/install.sh | sudo bash -s -- \
  --port 2053 \
  --user admin \
  --local-node \
  --yes
```

### Installer Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--port N` | Panel listen port | `2053` |
| `--sub-port N` | Dedicated port for subscription links | Same as panel |
| `--secret-path PATH` | Secret URL prefix (randomised in wizard if left blank) | `/` or random |
| `--sub-path PATH` | Subscription URL prefix | `sub` |
| `--user NAME` | Initial owner username | `admin` |
| `--password PASS` | Initial owner password (auto-generated if omitted) | Random 16-char |
| `--local-node` / `--no-local-node` | Provision this server as a local VPN node or panel-only | `--local-node` |
| `--ssl domain\|none` | Automatic Let's Encrypt HTTPS or plain HTTP | `none` |
| `--domain DOMAIN` | Domain name for Let's Encrypt certificate | — |
| `--email EMAIL` | Optional email for Let's Encrypt notices | — |
| `--fresh` | Wipe any existing SQLite database before installing | Off |
| `-y, --yes` | Non-interactive installation using defaults/flags | Off |

### Remote VPN Node Provisioner

On additional worker servers (remote nodes), provision WireGuard, OpenVPN, OpenConnect, strongSwan, and xl2tpd with:

```bash
curl -fsSL https://raw.githubusercontent.com/PouryaDe/XProtocol/main/deploy/node.sh | sudo bash -s -- --port 62060 --name eu-node-01
```

---

## Management CLI (`xprotocol`)

After installation, run `sudo xprotocol` anywhere for the interactive control menu or invoke subcommands directly:

```bash
sudo xprotocol status       # Systemd service & runtime config status
sudo xprotocol password     # Reset admin/account password directly in SQLite
sudo xprotocol ssl          # Issue Let's Encrypt certificate or switch to HTTP
sudo xprotocol logs         # Follow live systemd journal logs
```

---

## Features

- **Overview & Telemetry**: Live online tunnels, active clients, 24h & 30d traffic charts, running-out alerts with one-click `+30d` extend, inbound status strip, heaviest users, local CPU/RAM/Disk/Uptime telemetry, and reseller quota widget.
- **Clients & Client Groups**: Traffic & expiry limits, connect-countdown (`expire after first connect`), max concurrent devices/IPs, periodic traffic auto-reset, fixed client IPs, bulk creation (`2..50` numbered accounts), bulk enable/disable/extend/reset/delete, QR codes, and client config exports (`.ovpn`, WireGuard, AmneziaWG, OpenConnect).
- **Inbounds & Multi-Node Orchestration**: `WireGuard`, `AmneziaWG`, `OpenVPN`, `OpenConnect`, `IKEv2`, and `L2TP/IPsec` engines, live config rendering & service logs, remote nodes with traffic multipliers and custom relay/connect addresses.
- **Live Connections**: Active session inspection, grouped **By client** account-sharing monitor, connection history, and remote disconnect.
- **Outbound Routing**: VLESS, VMess, Trojan, Shadowsocks, Hysteria2, WireGuard, SOCKS, and HTTP outbounds, URI share-link parser, 1-click **WARP** & **NordVPN** presets, live TCP latency check, per-node domain/IP routing rules, and Xray JSON export.
- **Certificates**: Internal CA and Let's Encrypt certificate tracking, renewal, and attachment guards.
- **Accounts, Roles & Resellers**: Owner, Admin, Reseller, and custom roles with granular permission matrix, reseller traffic pools, expiry dates, and client count caps.
- **Subscription Page Builder**: Custom shop branding, Telegram support & channel links, per-protocol quick setup guides, App Store / Google Play / GitHub app download links, and 6 distinct card looks (`Night shift`, `Aurora`, `Pop`, `Ticket`, `Orbit`, `Mono`).
- **Security, API & Backups**: TOTP Two-Factor Authentication with recovery codes, active session revocation, scoped API bearer tokens + built-in OpenAPI 3.0 spec, SQLite WAL backup download/restore, Telegram scheduled backups, and Activity audit logs.

---

## Tech Stack & Repository Layout

- **`server/`**: Node.js 24+ (`node:sqlite` WAL), Express 5, TypeScript (`tsx --test` integration tests).
- **`web/`**: React 19, Vite 6, Tailwind CSS v4, Lucide icons, `qrcode`.
- **`deploy/`**: Ubuntu 22.04+ installer (`install.sh`), remote node installer (`node.sh`), TUI helper (`xprotocol-tui.sh`), management CLI (`xprotocol-cli.sh`), and systemd unit (`xprotocol.service`).

---

## Local Development

Requires **Node.js 22+** (Node.js 24 recommended).

```bash
# Install dependencies
npm install
npm --prefix server install
npm --prefix web install

# Typecheck, build production bundle, and run integration tests
npm run typecheck
npm run build
npm test

# Run backend + frontend dev servers with hot reload
npm run dev

# Start production server (default port 2053, login: admin / admin123456)
npm start
```
