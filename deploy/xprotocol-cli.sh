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

cmd_update() {
  require_root "$@"
  local check_only=0 yes=0 no_restart=0
  local repo_url="${XPROTOCOL_REPO_URL:-https://github.com/PouryaDe/XProtocol.git}"
  local repo_branch="${XPROTOCOL_BRANCH:-main}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check) check_only=1; shift ;;
      -y|--yes) yes=1; shift ;;
      --no-restart) no_restart=1; shift ;;
      *) shift ;;
    esac
  done

  ui_header "" "Check & Install Update"
  local cur_ver="unknown" cur_commit=""
  if [[ -f "$INSTALL_DIR/package.json" ]]; then
    cur_ver="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$INSTALL_DIR/package.json','utf8')).version)}catch{console.log('unknown')}" 2>/dev/null || echo "unknown")"
  fi
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    cur_commit="$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || true)"
  elif [[ -f "$INSTALL_DIR/.xprotocol-commit" ]]; then
    cur_commit="$(tr -d '[:space:]' <"$INSTALL_DIR/.xprotocol-commit" 2>/dev/null || true)"
  fi

  info "Installed version: v${cur_ver}${cur_commit:+ (${cur_commit})}"
  info "Checking remote repository (${repo_branch})..."
  local remote_sha
  remote_sha="$(git ls-remote "$repo_url" "refs/heads/${repo_branch}" 2>/dev/null | awk '{print substr($1,1,7)}' || true)"
  [[ -n "$remote_sha" ]] || die "Unable to reach ${repo_url}"

  if [[ -n "$cur_commit" && "$cur_commit" == "$remote_sha" ]]; then
    ok "XProtocol is already up to date (${cur_commit})."
    (( check_only )) && return 0
    if (( yes == 0 )) && ui_has_input; then
      pick_yesno "Reinstall / rebuild anyway?" n || return 0
    else
      return 0
    fi
  else
    ok "New build available on GitHub: ${remote_sha}"
  fi

  if (( check_only )); then
    return 0
  fi

  if (( yes == 0 )) && ui_has_input; then
    pick_yesno "Download, build, and apply update now?" y || { info "Cancelled."; return 0; }
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  info "Downloading source from GitHub..."
  if ! git clone -q --depth 1 --branch "$repo_branch" "$repo_url" "$tmp_dir/src"; then
    rm -rf "$tmp_dir"
    die "Failed to clone ${repo_url}"
  fi

  info "Copying updated files into ${INSTALL_DIR}..."
  cd /tmp
  mkdir -p "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/server" "$INSTALL_DIR/web" "$INSTALL_DIR/deploy" "$INSTALL_DIR/.git"
  cp -r "$tmp_dir/src/package.json" "$tmp_dir/src/server" "$tmp_dir/src/web" "$tmp_dir/src/deploy" "$tmp_dir/src/.git" "$INSTALL_DIR/"
  rm -rf "$tmp_dir"
  echo "$remote_sha" >"$INSTALL_DIR/.xprotocol-commit"

  info "Installing dependencies and building..."
  export npm_config_loglevel=error
  export npm_config_update_notifier=false
  export npm_config_fund=false
  export npm_config_audit=false
  local update_log="/var/log/xprotocol-update.log"
  : >"$update_log"
  cd "$INSTALL_DIR"
  if ! npm install --prefix server --loglevel=error --no-audit --no-fund >>"$update_log" 2>&1 || \
     ! npm install --prefix web --loglevel=error --no-audit --no-fund >>"$update_log" 2>&1 || \
     ! npm run build --prefix server --loglevel=error >>"$update_log" 2>&1 || \
     ! npm run build --prefix web --loglevel=error >>"$update_log" 2>&1; then
    warn "Build failed (last 20 lines of $update_log):"
    tail -n 20 "$update_log" >&2 || true
    return 1
  fi

  install -m 0755 "$INSTALL_DIR/deploy/xprotocol-cli.sh" /usr/local/bin/xprotocol
  chmod +x "$INSTALL_DIR/deploy/xprotocol-tui.sh" "$INSTALL_DIR/deploy/node.sh" 2>/dev/null || true
  UPDATED_CLI=1

  local new_ver
  new_ver="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$INSTALL_DIR/package.json','utf8')).version)}catch{console.log('unknown')}" 2>/dev/null || echo "unknown")"
  ok "Updated to XProtocol v${new_ver} (${remote_sha})"

  if (( no_restart == 0 )); then
    systemctl restart "$SERVICE"
    ok "Restarted $SERVICE"
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
      "Update XProtocol from GitHub" \
      "Restart panel service" \
      "Stop panel service" \
      "Uninstall XProtocol" \
      "Exit" || break

    MENU_ACTIVE=0
    UPDATED_CLI=0
    echo ""
    case "$choice" in
      0) cmd_status ;;
      1) cmd_password ;;
      2) cmd_ssl ;;
      3) cmd_ocserv ;;
      4) cmd_backup ;;
      5) cmd_logs -f || true ;;
      6) cmd_update ;;
      7) require_root; systemctl restart "$SERVICE" && ok "Restarted $SERVICE" ;;
      8) require_root; systemctl stop "$SERVICE" && warn "Stopped $SERVICE" ;;
      9) cmd_uninstall; break ;;
      10) break ;;
    esac
    echo ""
    read -r -p "  Press Enter to return to menu..." _ <&"$UI_FD" || break
    if (( UPDATED_CLI )) && [[ -x /usr/local/bin/xprotocol ]]; then
      ui_restore_terminal
      exec /usr/local/bin/xprotocol
    fi
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
  update) shift; cmd_update "$@" ;;
  start|stop|restart) require_root "$@"; systemctl "$1" "$SERVICE"; ok "$SERVICE: $1" ;;
  uninstall) shift; cmd_uninstall "$@" ;;
  "") show_menu ;;
  *)
    echo "Usage: xprotocol {status|password|ssl|ocserv|backup|logs [-f]|update [--check|-y]|start|stop|restart|uninstall [--purge]}"
    exit 1
    ;;
esac
