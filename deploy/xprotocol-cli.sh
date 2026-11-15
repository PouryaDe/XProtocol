#!/usr/bin/env bash
# XProtocol Open-Core Management CLI (/usr/local/bin/xprotocol)
set -euo pipefail

SERVICE="xprotocol.service"
DATA_DIR="${XPROTOCOL_DATA_DIR:-/var/lib/xprotocol}"
INSTALL_DIR="${XPROTOCOL_INSTALL_DIR:-/opt/xprotocol}"

# shellcheck source=/opt/xprotocol/deploy/xprotocol-tui.sh
if [[ -f "$INSTALL_DIR/deploy/xprotocol-tui.sh" ]]; then
  source "$INSTALL_DIR/deploy/xprotocol-tui.sh"
elif [[ -f "$(dirname "${BASH_SOURCE[0]:-$0}")/xprotocol-tui.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]:-$0}")/xprotocol-tui.sh"
fi
ui_init
trap ui_restore_terminal EXIT

require_root() { [[ $EUID -eq 0 ]] || die "Run as root: sudo xprotocol $*"; }

cmd_status() {
  ui_header "" "Service Status"
  section "SYSTEMD & RUNTIME"
  if systemctl is-active --quiet "$SERVICE"; then
    ok "$SERVICE is running"
  else
    warn "$SERVICE is stopped"
  fi
  systemctl status "$SERVICE" --no-pager -n 10 || true
  if [[ -f "$DATA_DIR/config.json" ]]; then
    section "CONFIGURATION ($DATA_DIR/config.json)"
    cat "$DATA_DIR/config.json"
  fi
}

cmd_password() {
  require_root "$@"
  ui_header "" "Admin Password"
  local user="${1:-admin}" new_pass="${2:-}"
  if [[ -z "$new_pass" ]]; then
    read -r -s -p "  New password for '${user}' (min 8 chars): " new_pass <&"${UI_FD:-0}"
    echo ""
  fi
  (( ${#new_pass} >= 8 )) || die "Password must be at least 8 characters."
  XPROTOCOL_TARGET_USER="$user" XPROTOCOL_NEW_PASS="$new_pass" XPROTOCOL_DATA_DIR="$DATA_DIR" node --input-type=module -e '
    import crypto from "node:crypto";
    import path from "node:path";
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(path.join(process.env.XPROTOCOL_DATA_DIR, "xprotocol.db"));
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(process.env.XPROTOCOL_NEW_PASS, salt, 64).toString("hex");
    const stored = `scrypt$${salt}$${hash}`;
    const info = db.prepare("UPDATE accounts SET password_hash = ? WHERE username = ? OR is_owner = 1").run(stored, process.env.XPROTOCOL_TARGET_USER);
    db.close();
    console.log("  Updated account rows:", info.changes);
  '
  ok "Password updated for ${user}."
}

cmd_ssl() {
  require_root "$@"
  ui_header "" "HTTPS Certificate"
  local sub="${1:-}" domain="${2:-}"
  if [[ -z "$sub" ]] && ui_has_input; then
    local pick=0
    ui_choose pick 0 "Issue Let's Encrypt certificate for a domain" "Turn HTTPS off (plain HTTP)" "Back" || return 0
    case "$pick" in 0) sub="domain" ;; 1) sub="off" ;; *) return 0 ;; esac
  fi
  case "$sub" in
    off)
      XPROTOCOL_DATA_DIR="$DATA_DIR" node --input-type=module -e '
        import fs from "node:fs"; import path from "node:path";
        const p = path.join(process.env.XPROTOCOL_DATA_DIR, "config.json");
        const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
        cfg.tlsCertFile = ""; cfg.tlsKeyFile = "";
        fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
      '
      systemctl restart "$SERVICE"
      ok "HTTPS turned off and service restarted."
      ;;
    domain)
      if [[ -z "$domain" ]]; then ask domain "Domain pointing to this server (e.g. panel.example.com)" ""; fi
      [[ -n "$domain" ]] || die "Domain is required."
      certbot certonly --standalone -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email
      XPROTOCOL_CERT="/etc/letsencrypt/live/${domain}/fullchain.pem"
      XPROTOCOL_KEY="/etc/letsencrypt/live/${domain}/privkey.pem"
      XPROTOCOL_DATA_DIR="$DATA_DIR" node --input-type=module -e '
        import fs from "node:fs"; import path from "node:path";
        const p = path.join(process.env.XPROTOCOL_DATA_DIR, "config.json");
        const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
        cfg.tlsCertFile = process.env.XPROTOCOL_CERT; cfg.tlsKeyFile = process.env.XPROTOCOL_KEY;
        fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
      '
      systemctl restart "$SERVICE"
      ok "HTTPS enabled for $domain."
      ;;
    *) echo "Usage: xprotocol ssl [domain <host> | off]" ;;
  esac
}

cmd_ocserv() {
  require_root "$@"
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get update -qq >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get install -y -qq ocserv >/dev/null 2>&1
  ok "OpenConnect (ocserv) installed and ready."
}

cmd_backup() {
  require_root "$@"
  local out="${1:-/root/xprotocol-backup-$(date +%Y%m%d-%H%M%S).db}"
  XPROTOCOL_DATA_DIR="$DATA_DIR" XPROTOCOL_BACKUP_OUT="$out" node --input-type=module -e '
    import path from "node:path";
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(path.join(process.env.XPROTOCOL_DATA_DIR, "xprotocol.db"));
    const safe = process.env.XPROTOCOL_BACKUP_OUT.replace(/'\''/g, '\'''\''\'');
    db.exec(`VACUUM INTO '\''${safe}'\''`);
    db.close();
  '
  chmod 600 "$out"
  ok "Backup saved to: $out"
}

cmd_logs() {
  if [[ "${1:-}" == "-f" ]]; then
    journalctl -u "$SERVICE" -n 100 -f
  else
    journalctl -u "$SERVICE" -n 100 --no-pager
  fi
}

cmd_uninstall() {
  require_root "$@"
  local purge=0
  [[ "${1:-}" == "--purge" ]] && purge=1
  if ui_has_input; then
    pick_yesno "Remove $SERVICE and $INSTALL_DIR?" n || { info "Cancelled."; return 0; }
    if (( purge == 0 )) && pick_yesno "Also delete database and settings in $DATA_DIR?" n; then
      purge=1
    fi
  fi
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$SERVICE" /usr/local/bin/xprotocol
  systemctl daemon-reload
  rm -rf "$INSTALL_DIR"
  (( purge )) && rm -rf "$DATA_DIR"
  ok "XProtocol panel removed."
}

show_menu() {
  ui_has_input || { cmd_status; return 0; }
  MENU_ACTIVE=1
  local choice=0
  while :; do
    ui_header big "Management Menu"
    ui_choose choice 0 \
      "Status & configuration" \
      "Change admin password" \
      "HTTPS certificate (Let's Encrypt)" \
      "Install OpenConnect (ocserv)" \
      "Create SQLite database backup" \
      "View live logs (Ctrl+C exits logs)" \
      "Restart panel service" \
      "Stop panel service" \
      "Uninstall XProtocol" \
      "Exit" || break

    MENU_ACTIVE=0
    echo ""
    case "$choice" in
      0) cmd_status ;;
      1) cmd_password ;;
      2) cmd_ssl ;;
      3) cmd_ocserv ;;
      4) cmd_backup ;;
      5) cmd_logs -f || true ;;
      6) require_root; systemctl restart "$SERVICE" && ok "Restarted $SERVICE" ;;
      7) require_root; systemctl stop "$SERVICE" && warn "Stopped $SERVICE" ;;
      8) cmd_uninstall; break ;;
      9) break ;;
    esac
    echo ""
    read -r -p "  Press Enter to return to menu..." _ <&"$UI_FD" || break
    MENU_ACTIVE=1
  done
}

case "${1:-}" in
  status) shift; cmd_status "$@" ;;
  password) shift; cmd_password "$@" ;;
  ssl) shift; cmd_ssl "$@" ;;
  ocserv) shift; cmd_ocserv "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  logs) shift; cmd_logs "$@" ;;
  start|stop|restart) require_root "$@"; systemctl "$1" "$SERVICE"; ok "$SERVICE: $1" ;;
  uninstall) shift; cmd_uninstall "$@" ;;
  "") show_menu ;;
  *)
    echo "Usage: xprotocol {status|password|ssl|ocserv|backup|logs [-f]|start|stop|restart|uninstall [--purge]}"
    exit 1
    ;;
esac
