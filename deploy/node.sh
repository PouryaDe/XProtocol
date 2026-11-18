#!/usr/bin/env bash
# XProtocol Open-Core — Remote Ubuntu 22.04+ VPN Node Provisioner
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "$SCRIPT_PATH" && -f "$SCRIPT_PATH" ]]; then
  HERE="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
else
  HERE=""
fi
NODE_PORT=62060
NODE_NAME="$(hostname -s)"
PANEL_IP=""
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) NODE_PORT="$2"; shift 2 ;;
    --name) NODE_NAME="$2"; shift 2 ;;
    --panel-ip) PANEL_IP="$2"; shift 2 ;;
    -y|--yes) YES=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/node.sh" >&2; exit 1; }

if [[ -n "$HERE" && -f "$HERE/xprotocol-tui.sh" ]]; then
  source "$HERE/xprotocol-tui.sh"
  ui_init
  trap ui_restore_terminal EXIT
  ui_header big "Remote VPN Node Setup"
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
echo "  Installing WireGuard, OpenVPN, OpenConnect, strongSwan, xl2tpd, Xray..."
apt-get update -qq >/dev/null 2>&1
apt-get install -y -qq wireguard wireguard-tools openvpn ocserv strongswan strongswan-swanctl strongswan-pki libcharon-extra-plugins xl2tpd ppp iptables ufw curl unzip >/dev/null 2>&1
if ! command -v xray >/dev/null 2>&1; then
  bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install >/dev/null 2>&1 || true
fi
systemctl stop ocserv.socket ocserv.service xl2tpd.service >/dev/null 2>&1 || true
systemctl disable ocserv.socket ocserv.service xl2tpd.service >/dev/null 2>&1 || true

cat >/etc/sysctl.d/99-xprotocol-node.conf <<'EOF'
net.ipv4.ip_forward = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl --system >/dev/null 2>&1 || true

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  if [[ -n "$PANEL_IP" ]]; then
    ufw allow from "$PANEL_IP" to any port "${NODE_PORT}" proto tcp >/dev/null || true
  else
    ufw allow "${NODE_PORT}/tcp" >/dev/null || true
  fi
fi

PUBLIC_IP="$(curl -fsSL --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "  Node '$NODE_NAME' (${PUBLIC_IP}) is provisioned for XProtocol VPN engines."
echo "  Add ${PUBLIC_IP}:${NODE_PORT} under Nodes -> Connect a node in your panel."
