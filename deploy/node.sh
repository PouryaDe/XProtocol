#!/usr/bin/env bash
# XProtocol Open-Core — Remote Ubuntu 22.04+ VPN Node Provisioner
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_PORT=62060
NODE_NAME="$(hostname -s)"
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) NODE_PORT="$2"; shift 2 ;;
    --name) NODE_NAME="$2"; shift 2 ;;
    -y|--yes) YES=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/node.sh" >&2; exit 1; }

if [[ -f "$HERE/xprotocol-tui.sh" ]]; then
  source "$HERE/xprotocol-tui.sh"
  ui_init
  trap ui_restore_terminal EXIT
  ui_header big "Remote VPN Node Setup"
fi

export DEBIAN_FRONTEND=noninteractive
echo "  Installing WireGuard, OpenVPN, OpenConnect, strongSwan, xl2tpd..."
apt-get update -qq
apt-get install -y -qq wireguard wireguard-tools openvpn ocserv strongswan strongswan-pki xl2tpd iptables ufw curl >/dev/null

cat >/etc/sysctl.d/99-xprotocol-node.conf <<'EOF'
net.ipv4.ip_forward = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl --system >/dev/null 2>&1 || true

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${NODE_PORT}/tcp" >/dev/null || true
fi

PUBLIC_IP="$(curl -fsSL --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "  Node '$NODE_NAME' (${PUBLIC_IP}) is provisioned for XProtocol VPN engines."
echo "  Add ${PUBLIC_IP}:${NODE_PORT} under Nodes -> Connect a node in your panel."
