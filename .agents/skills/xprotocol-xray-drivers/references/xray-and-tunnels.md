# Xray Engine & Linux Tunnel Drivers Reference

## Xray Combos & Presets (`server/src/drivers/xrayEngine.ts`)
- **7 Presets (`XRAY_PRESETS`)**: `direct` (VLESS+Raw+Reality+Vision), `cdn` (VLESS+WS+TLS behind CDN), `relay` (VLESS+Raw+Reality+PROXY v1), `vmess-classic` (VMess+Raw HTTP+None), `trojan` (Trojan+gRPC+TLS), `shadowsocks` (SS 2022-blake3-aes-128-gcm), `manual`.
- **Combo Enforcement (`XRAY_COMBOS`, `validateXraySettings`)**:
  - `reality` is allowed ONLY with `vless` + `raw|xhttp|grpc` (rejected on `ws|httpupgrade|kcp` and on `vmess|trojan|shadowsocks`).
  - `shadowsocks` uses `raw|ws|grpc` with `none|tls` and SS methods (`2022-blake3-aes-128-gcm`, `2022-blake3-aes-256-gcm`, `2022-blake3-chacha20-poly1305`, `aes-256-gcm`, `chacha20-ietf-poly1305`).
- **Unified Runtime Config (`/etc/xray/config.json`)**:
  - `buildUnifiedXrayConfig()` pulls all running enabled local Xray inbounds (`xr-${ib.name}`) + routing policies (`routing_policies` & `outbounds`) + `StatsService` API inbound on `127.0.0.1:10085`.
  - Reloaded non-disruptively via `syncAndApplyXrayEngine()`; queried via `xray api statsquery --server=127.0.0.1:10085 -reset` in `collectXrayLiveStats()`.
  - Kicking an active Xray user runs `kickXrayClient(inboundName, clientName)`.
- **Client Share Links (`buildClientXrayServerViews`)**:
  - Returns `XrayServerView[]` where each entry exposes `.links: string[]` (`vless://`, `vmess://` base64 JSON, `trojan://`, `ss://`), `.params`, `.protocol`, `.transport`, `.security`, `.port`, `.host`.
  - Server private keys stay exclusively in `inbounds.server_private_key` / `settings._realityPrivateKey` (stripped by `sanitizeXraySettingsForClient`).

## Linux VPN Drivers (`server/src/drivers/linuxEngine.ts` + `pki.ts` + `configs.ts`)
- **WireGuard / AmneziaWG**: `wg-quick` / `awg-quick`, live peer sync (`wg set ...`), Awg obfuscation (`Jc/Jmin/Jmax/S1/S2/H1..H4`).
- **OpenVPN**: `pki.ts` manages CA/server/client certs, `ta.key`, salted scrypt `ovpn-auth`, client-connect/disconnect hooks for device limits.
- **OpenConnect (`ocserv`)**, **strongSwan IKEv2 (`swanctl`)**, **L2TP/IPsec (`xl2tpd` + `swanctl`)**: Rendered in `configs.ts` with CRLF/quote sanitization.
- **Traffic Shaping (`tc`) & Firewall (`ufw`)**: HTB/IFB per-client speed enforcement (`download_mbps` / `upload_mbps`), UFW port opening for inbound ports.
- **Collector (`server/src/services/collector.ts`)**: 5s tick polls live sessions across all drivers, increments `traffic_used_bytes` / `upload_bytes` / `download_bytes`, evicts exhausted/expired/over-device-limit sessions via `syncService.ts`, executes `resetSchedule.ts` cycles, and records 5-min `nodeHealth` samples.
