#!/usr/bin/env bash
# Ovira Open-Core Panel — Ubuntu 22.04+ Interactive & Scriptable Installer
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd -- "$HERE/.." && pwd)"

if [[ "${1:-}" == "node" ]]; then
  shift
  exec bash "$HERE/node.sh" "$@"
fi

PORT="${OVIRA_PORT:-2053}"
SUB_PORT="${OVIRA_SUB_PORT:-}"
SECRET_PATH="${OVIRA_SECRET_PATH:-}"
SUB_PATH="${OVIRA_SUB_PATH:-sub}"
ADMIN_USER="${OVIRA_ADMIN_USER:-admin}"
ADMIN_PASS="${OVIRA_ADMIN_PASS:-}"
LOCAL_NODE=1
SSL_MODE="none"
DOMAIN=""
EMAIL=""
YES=0
FRESH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --sub-port) SUB_PORT="$2"; shift 2 ;;
    --secret-path) SECRET_PATH="$2"; shift 2 ;;
    --sub-path) SUB_PATH="$2"; shift 2 ;;
    --user) ADMIN_USER="$2"; shift 2 ;;
    --password) ADMIN_PASS="$2"; shift 2 ;;
    --local-node|--with-openvpn) LOCAL_NODE=1; shift ;;
    --no-local-node|--panel-only) LOCAL_NODE=0; shift ;;
    --ssl) SSL_MODE="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    -y|--yes) YES=1; shift ;;
    -h|--help)
      echo "Usage: sudo bash deploy/install.sh [options]"
      echo "  --port N             Panel port (default 2053)"
      echo "  --sub-port N         Optional separate port for subscription links"
      echo "  --secret-path PATH   Secret URL prefix (randomised by default if blank in wizard)"
      echo "  --sub-path PATH      Subscription prefix (default: sub)"
      echo "  --user NAME          Owner username (default: admin)"
      echo "  --password PASS      Owner password (auto-generated if omitted)"
      echo "  --local-node         Use this server as a VPN node too (default)"
      echo "  --no-local-node      Panel only (control remote nodes)"
      echo "  --ssl domain|none    Configure Let's Encrypt HTTPS or plain HTTP"
      echo "  --domain DOMAIN      Domain for Let's Encrypt"
      echo "  --email EMAIL        Optional Let's Encrypt email"
      echo "  --fresh              Wipe previous database before installing"
      echo "  -y, --yes            Non-interactive mode using flags/defaults"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/install.sh" >&2; exit 1; }
[[ -r /etc/os-release ]] && . /etc/os-release || true
[[ "${ID:-}" == "ubuntu" || "${ID_LIKE:-}" == *"debian"* ]] || echo "Warning: Tested on Ubuntu 22.04+."

# shellcheck source=deploy/ovira-tui.sh
source "$HERE/ovira-tui.sh"
ui_init
trap ui_restore_terminal EXIT

INSTALL_DIR="/opt/ovira-open"
DATA_DIR="/var/lib/ovira-open"
SERVICE_NAME="ovira-open.service"

ui_header big "Ubuntu 22.04+ Panel Setup"

# 4-Step Interactive Wizard when input is available
if ui_has_input; then
  step 1 4 "This server's role"
  if pick_yesno "Also use this server as a VPN node (inbounds can run locally)?" y; then
    LOCAL_NODE=1
  else
    LOCAL_NODE=0
  fi

  step 2 4 "Panel address & access"
  ask PORT "Panel port" "$PORT"
  ask SUB_PORT "Separate subscription port (optional, blank = same as panel)" "$SUB_PORT"
  if [[ -z "$SECRET_PATH" ]]; then
    SECRET_PATH="/$(tr -dc 'a-z0-9' </dev/urandom | head -c 10 || echo 'ovira')"
  fi
  ask SECRET_PATH "Secret panel path (blank for root /)" "$SECRET_PATH"
  ask ADMIN_USER "First admin username" "$ADMIN_USER"

  step 3 4 "HTTPS certificate"
  ssl_idx=1
  ui_choose ssl_idx 1 "HTTPS via Let's Encrypt (domain pointing to this server)" "Plain HTTP (for testing or behind Caddy/Nginx)" || true
  if (( ssl_idx == 0 )); then
    SSL_MODE="domain"
    while [[ -z "$DOMAIN" ]]; do
      ask DOMAIN "Domain for panel (e.g. panel.example.com)" ""
    done
    ask EMAIL "Email for Let's Encrypt notices (optional)" ""
  else
    SSL_MODE="none"
  fi

  step 4 4 "Review"
  card_top "SUMMARY"
  card_kv "Panel port" "$PORT/tcp"
  card_kv "Subscription port" "${SUB_PORT:-same as panel}"
  card_kv "Secret path" "${SECRET_PATH:-/}"
  card_kv "Admin user" "$ADMIN_USER"
  card_kv "Local node" "$( (( LOCAL_NODE )) && echo yes || echo no )"
  card_kv "HTTPS" "$( [[ "$SSL_MODE" == domain ]] && echo "Let's Encrypt ($DOMAIN)" || echo "off (plain HTTP)" )"
  card_end
  pick_yesno "Start installation?" y || { info "Cancelled."; exit 0; }
fi

if [[ -z "$ADMIN_PASS" ]]; then
  ADMIN_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 || echo 'OviraAdmin1234')"
fi

section "INSTALLING OVIRA OPEN-CORE"
export DEBIAN_FRONTEND=noninteractive

info "Installing base Ubuntu packages..."
apt-get update -qq
PKGS=(curl ca-certificates gnupg openssl ufw iptables certbot wireguard-tools)
if (( LOCAL_NODE )); then
  PKGS+=(openvpn ocserv strongswan xl2tpd)
fi
apt-get install -y -qq "${PKGS[@]}" >/dev/null
ok "System packages installed"

info "Configuring kernel IPv4 forwarding and BBR..."
cat >/etc/sysctl.d/99-ovira.conf <<'EOF'
net.ipv4.ip_forward = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl --system >/dev/null 2>&1 || true
ok "Kernel forwarding enabled"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  info "Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v) ready"

if (( FRESH )) && [[ -d "$DATA_DIR" ]]; then
  rm -rf "$DATA_DIR"
  warn "Previous data wiped (--fresh)"
fi

mkdir -p "$INSTALL_DIR" "$DATA_DIR"
chmod 711 "$DATA_DIR"

info "Copying source and building server + React dashboard..."
rm -rf "$INSTALL_DIR/server" "$INSTALL_DIR/web" "$INSTALL_DIR/deploy"
cp -r "$SRC_DIR/package.json" "$SRC_DIR/server" "$SRC_DIR/web" "$SRC_DIR/deploy" "$INSTALL_DIR/"
cd "$INSTALL_DIR"
npm install --prefix server >/dev/null
npm install --prefix web >/dev/null
npm run build --prefix server >/dev/null
npm run build --prefix web >/dev/null
ok "Build complete"

TLS_CERT=""
TLS_KEY=""
if [[ "$SSL_MODE" == "domain" && -n "$DOMAIN" ]]; then
  info "Issuing Let's Encrypt certificate for $DOMAIN..."
  EMAIL_FLAG="--register-unsafely-without-email"
  [[ -n "$EMAIL" ]] && EMAIL_FLAG="--email $EMAIL"
  certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos $EMAIL_FLAG || warn "Certbot failed; continuing on HTTP"
  if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    TLS_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    TLS_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
    ok "TLS certificate ready for $DOMAIN"
  fi
fi

cat >"$DATA_DIR/config.json" <<EOF
{
  "port": ${PORT},
  "bindAddress": "",
  "subPort": ${SUB_PORT:-null},
  "secretPath": "${SECRET_PATH}",
  "subPath": "${SUB_PATH}",
  "tlsCertFile": "${TLS_CERT}",
  "tlsKeyFile": "${TLS_KEY}",
  "trustProxy": false,
  "driverMode": "auto"
}
EOF

cat >"/etc/systemd/system/${SERVICE_NAME}" <<EOF
[Unit]
Description=Ovira Open-Core VPN Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/server
Environment=OVIRA_DATA_DIR=${DATA_DIR}
Environment=OVIRA_PORT=${PORT}
Environment=OVIRA_SECRET_PATH=${SECRET_PATH}
Environment=OVIRA_SUB_PATH=${SUB_PATH}
Environment=OVIRA_ADMIN_USER=${ADMIN_USER}
Environment=OVIRA_ADMIN_PASS=${ADMIN_PASS}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

install -m 0755 "$INSTALL_DIR/deploy/ovira-cli.sh" /usr/local/bin/ovira
chmod +x "$INSTALL_DIR/deploy/ovira-tui.sh" "$INSTALL_DIR/deploy/node.sh"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${PORT}/tcp" >/dev/null || true
  [[ -n "$SUB_PORT" ]] && ufw allow "${SUB_PORT}/tcp" >/dev/null || true
  ok "Opened UFW ports"
fi

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
ok "Started ${SERVICE_NAME}"

PUBLIC_IP="$(curl -fsSL --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
SCHEME="http"; [[ -n "$TLS_CERT" ]] && SCHEME="https"
HOST="${DOMAIN:-$PUBLIC_IP}"
CLEAN_SECRET="${SECRET_PATH#/}"; CLEAN_SECRET="${CLEAN_SECRET%/}"
PANEL_URL="${SCHEME}://${HOST}:${PORT}${CLEAN_SECRET:+/$CLEAN_SECRET}/"

card_top "READY · Ovira Open-Core v1.0.4"
card_kv "Username" "$ADMIN_USER" "$BOLD"
card_kv "Local node" "$( (( LOCAL_NODE )) && echo "enabled (create inbounds in Inbounds)" || echo "panel-only" )"
card_sep "Panel address (open in browser)"
card_copy "$PANEL_URL"
card_sep "Initial password (change inside Settings -> My account)"
card_copy "$ADMIN_PASS"
card_sep "Quick guide"
card_text "Run ${BOLD}ovira${RST} any time for the interactive menu (status, password, ssl, logs, backup)."
card_text "Turn on 2FA under Settings ${G_FLOW} My account."
card_end
