# XProtocol Open-Core VPN Panel

Clean-room, extensible multi-protocol VPN management panel (Ovira-compatible architecture) built with TypeScript, Node.js (`node:sqlite` WAL), React, Vite, and Tailwind CSS.

## Quick Start (Development & Production)

```bash
# Install dependencies (already installed if built)
npm install
npm --prefix server install
npm --prefix web install

# Build frontend + backend
npm run build

# Start panel (default port 2053, login: admin / admin123456)
npm start
```

Or run backend + frontend dev servers concurrently with hot reload:

```bash
npm run dev
```

## Features Included

- **Overview Dashboard**: Live online tunnels, active clients, 24h & 30d traffic charts, running-out alerts with quick extend, inbound statuses, heaviest users, server CPU/RAM/Disk/Uptime telemetry, and reseller account widget.
- **Clients & Groups**: Traffic/expiry/first-connect-days/device limits, periodic reset, fixed IPs, bulk creation, bulk actions, subscription links & QR codes, `.ovpn` / WireGuard / AmneziaWG / OpenConnect profile generation.
- **Inbounds & Nodes**: Multi-protocol management (`WireGuard`, `AmneziaWG`, `OpenVPN`, `OpenConnect`, `IKEv2`, `L2TP/IPsec`), server config file rendering & logs, multi-node support with traffic multipliers and relay connect addresses.
- **Connections**: Live sessions vs By-client view (detecting account sharing / over-limit IPs), connection history, disconnect action.
- **Outbound Routing**: VLESS/VMess/Trojan/Shadowsocks/Hysteria2/WireGuard/SOCKS/HTTP outbounds, share-link parser, 1-click WARP & NordVPN outbound presets, TCP latency test, node routing rules & Xray JSON generator.
- **Certificates**: Internal CA & Let's Encrypt certificate tracking, renewal, and deletion guards.
- **Panel Accounts & Roles (Resellers)**: Owner, Admin, Reseller, and custom roles with granular permission matrix, reseller traffic pools, expiry, and per-client limits.
- **Settings**: General branding & 8 panel accent colors, dark/light themes, English (LTR) & Persian (RTL), Subscription Page builder with 6 Looks (`Night shift`, `Aurora`, `Pop`, `Ticket`, `Orbit`, `Mono`), Secret path guard, Scoped API tokens + OpenAPI 3.0 spec, TOTP 2FA + recovery codes + session management, SQLite backup download/restore, and Activity log.
- **Ubuntu 22.04+ Deployment**: See `deploy/install.sh` and `deploy/xprotocol.service`.
