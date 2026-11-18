---
name: xprotocol-xray-drivers
description: >-
  Xray multi-protocol engine (VLESS, VMess, Trojan, Shadowsocks presets/combos,
  Reality X25519 keys, SNI probing/scanning, StatsService 127.0.0.1:10085,
  share URI generation), Linux VPN drivers (WireGuard, AmneziaWG, OpenVPN,
  ocserv, strongSwan IKEv2/L2TP, tc HTB/IFB), peer resolution, live sync, and
  5s collector. Load before touching drivers/, generators/, peerResolver.ts,
  syncService.ts, or collector.ts.
---

# XProtocol Xray & Linux VPN Drivers

## Fast Reference
Read [xray-and-tunnels.md](./references/xray-and-tunnels.md) for valid `(protocol, transport, security)` combos, Xray config layout, daemon paths, and multi-protocol collector logic.

## Core Modules & Responsibilities
- **`server/src/drivers/xrayEngine.ts`**:
  - Presets: `direct`, `cdn`, `relay`, `vmess-classic`, `trojan`, `shadowsocks`, `manual` via `buildXrayPresetDefaults(preset, nodeId)`.
  - Validation: `validateXraySettings(settings)` enforces allowed combos & SS-2022 key formats.
  - Unified config: `buildUnifiedXrayConfig()` gathers `protocol = 'xray' AND running = 1 AND enabled = 1`, tags each inbound `xr-${ib.name}`, adds routing outbounds/rules + `api` (`StatsService`) on `127.0.0.1:10085`, and syncs via `syncAndApplyXrayEngine()`.
  - Client links: `buildClientXrayServerViews()` returns `.links[]` (`vless://`, `vmess://`, `trojan://`, `ss://`); ALWAYS sanitize via `sanitizeXraySettingsForClient()` before API responses (never leak `_realityPrivateKey` or `_ssServerKey`).
  - SNI tools: `probeRealitySni()`, `startSniTestJob()`, `startSniScanJob()`, persisted in `xray_sni_results`.
- **`server/src/drivers/linuxEngine.ts` & `pki.ts` & `generators/configs.ts`**:
  - Dispatches WG/AWG (`wg-quick`/`awg-quick`), OpenVPN (salted scrypt `ovpn-auth`, `ta.key`, CRL), `ocserv`, strongSwan `swanctl` (IKEv2/L2TP), `xray`, and `tc` HTB/IFB bandwidth shaping.
  - Strictly uses `execFile` arg arrays; sanitizes CRLF/quotes in generated daemon configs.
- **`server/src/services/peerResolver.ts`, `syncService.ts`, `collector.ts`**:
  - `getInboundPeers(inboundId, subnet)` filters active/unexpired/quota-ok granted clients and resolves tunnel IPs (`allocateTunnelIp`) & bandwidth (`downloadMbps`/`uploadMbps`).
  - `collector.ts` runs every 5s: polls Xray `-reset` user stats, WG/AWG/OVPN/ocserv/IPsec sessions, enforces quota/expiry/device-limit eviction, triggers periodic resets, and samples `nodeHealth`.

## Verification
Run `npx --prefix server tsx --test tests/engine.test.ts tests/ovira20.test.ts`.
