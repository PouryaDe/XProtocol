# Xray Engine & Linux Tunnel Drivers Reference

## Xray Combos & Presets (`server/src/drivers/xrayEngine.ts`)
- **7 Presets (`XRAY_PRESETS`)**: `direct` (VLESS+Raw+Reality+Vision), `cdn` (VLESS+WS+TLS behind CDN), `relay` (VLESS+Raw+Reality+PROXY v1), `vmess-classic` (VMess+Raw HTTP+None), `trojan` (Trojan+gRPC+TLS), `shadowsocks` (SS 2022-blake3-aes-128-gcm), `manual`.
- **Combo Enforcement (`XRAY_COMBOS`, `validateXraySettings`)**:
  - `reality` is allowed ONLY with `vless` + `raw|xhttp|grpc` (rejected on `ws|httpupgrade|kcp` and on `vmess|trojan|shadowsocks`).
  - `shadowsocks` uses `raw|ws|grpc` with `none|tls` and SS methods (`2022-blake3-aes-128-gcm`, `2022-blake3-aes-256-gcm`, `2022-blake3-chacha20-poly1305`, `aes-256-gcm`, `chacha20-ietf-poly1305`).
- **Unified Runtime Config (`/usr/local/lib/xprotocol/xray/config.json`)**:
  - `buildUnifiedXrayConfig()` pulls all running enabled local Xray inbounds (`xr-${ib.name}`) + routing policies (`routing_policies` & `outbounds`) + `StatsService` & `HandlerService` API inbound on `127.0.0.1:10085`.
  - Synced via `syncAndApplyXrayEngine()`: uses hot `xray api rmu` / `adu` when only users changed (zero downtime), restarting `xprotocol-xray` only on structural/routing changes.
  - Telemetry & device limits: `collectXrayLiveStats()` pairs `statsquery -reset` with `xray-access.log` (`parseXrayAccessLogContent`, including `X-Forwarded-For`/`CF-Connecting-IP` & `PROXY protocol`) to resolve inbound tags and per-device IPs; `kickXrayClient()` uses `rmu`, `kickXrayDeviceIp()` drops a single excess direct device via `ss -K` + temporary `iptables`, and `kickXrayProxiedWithCooldown()` evicts proxied (CDN/relay) users safely without blocking shared edge/relay IPs.
  - Speed limits: `applyXraySpeedLimits()` shapes direct `(remoteIp, port)` pairs via `tc` HTB + ingress (`device` or `client` `speedMode`) and proxied CDN/Relay users via `sockopt.mark` (`out-cap-c<id>`) + `fw`/`CONNMARK`.
- **Client Share Links (`buildClientXrayServerViews`)**:
  - Returns `XrayServerView[]` where each entry exposes `.links: string[]` (`vless://`, `vmess://` base64 JSON, `trojan://`, `ss://`), `.params`, `.protocol`, `.transport`, `.security`, `.port`, `.host`.
  - Server private keys stay exclusively in `inbounds.server_private_key` / `settings._realityPrivateKey` (stripped by `sanitizeXraySettingsForClient`).

## Linux VPN Drivers (`server/src/drivers/linuxEngine.ts` + `pki.ts` + `configs.ts`)
- **WireGuard / AmneziaWG**: `wg-quick` / `awg-quick`, live peer sync (`wg set ...`), single keypair per client (multi-device works across protocols or separate WG inbounds, surfaced in UI hints), Awg obfuscation (`Jc/Jmin/Jmax/S1/S2/H1..H4`).
- **OpenVPN**: `pki.ts` manages CA/server/client certs, `ta.key`, `duplicate-cn`, salted scrypt `ovpn-auth` (skips `device_limit` when `trusted_ip` is set during `reneg-sec`), and `client-connect`/`client-disconnect` via `xp-gate.mjs`.
- **OpenConnect (`ocserv`)**, **strongSwan IKEv2 (`swanctl` + `xfrm-*` requiring Ubuntu 22.04+ `xfrm_interface`)**, **L2TP/IPsec (`xl2tpd` + `pppd` `ip-pre-up`/`ip-up` + `swanctl`)**: Rendered in `configs.ts` with CRLF/quote sanitization and `xp-gate.mjs` admission hooks; `checkIkev2XfrmSupport()` surfaces warnings/errors if `xfrm_interface` is missing.
- **Traffic Shaping (`tc`) & Firewall (`ufw`)**: Incremental HTB/ingress per-client speed enforcement (`download_mbps` / `upload_mbps`) across `wg*`, `tun-*`, `xfrm-*`, `pppN`, `vcN`, and WAN Xray; UFW port opening for inbound ports.
- **Collector (`server/src/services/collector.ts`) & SessionGate (`server/src/services/sessionGate.ts`)**: 5s tick polls live sessions across all drivers (`ikev2` keyed by SA `uniqueid` + `EAP`), increments `traffic_used_bytes` / `upload_bytes` / `download_bytes`, evicts exhausted/expired/over-device-limit sessions via `syncService.ts`, syncs `gate-state.json`, executes `resetSchedule.ts` cycles, and records 5-min `nodeHealth` samples.
