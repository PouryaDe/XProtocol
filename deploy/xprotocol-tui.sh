#!/usr/bin/env bash
# Shared clean-room terminal UI library for XProtocol Open-Core Ubuntu scripts

UI_FD=""
UI_ROWS=24
UI_COLS=80
UI_KEY=""
UTF=0
COLOR=0

ui_init() {
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) UTF=1 ;; esac
  if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then COLOR=1; fi

  if (( COLOR )); then
    if [[ "${COLORTERM:-}" == *truecolor* || "${COLORTERM:-}" == *24bit* ]]; then
      ACC=$'\033[38;2;52;211;153m'
    else
      ACC=$'\033[38;5;78m'
    fi
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RST=$'\033[0m'
    GRN=$'\033[38;5;84m'; TEAL=$'\033[38;5;44m'; PURPLE=$'\033[38;5;141m'
    GRAY=$'\033[38;5;245m'; YEL=$'\033[38;5;220m'; RED=$'\033[38;5;203m'
    SEL_BG=$'\033[48;5;237m'
    LOGO_TINT=($'\033[38;5;154m' $'\033[38;5;118m' $'\033[38;5;84m' $'\033[38;5;79m' $'\033[38;5;44m')
  else
    ACC=""; BOLD=""; DIM=""; RST=""; GRN=""; TEAL=""; PURPLE=""; GRAY=""; YEL=""; RED=""; SEL_BG=""
    LOGO_TINT=("" "" "" "" "")
  fi

  if (( UTF )); then
    G_TL="╭"; G_TR="╮"; G_BL="╰"; G_BR="╯"; G_V="│"; G_H="─"; G_LT="├"; G_SEC="◆"
    G_OK="✓"; G_ERR="✗"; G_ON="●"; G_OFF="○"; G_HALF="◐"; G_ARR="›"; G_SEL="❯"; G_MID="·"
    G_UD="↑/↓"; G_FLOW="→"
  else
    G_TL="+"; G_TR="+"; G_BL="+"; G_BR="+"; G_V="|"; G_H="-"; G_LT="+"; G_SEC="*"
    G_OK="+"; G_ERR="x"; G_ON="*"; G_OFF="o"; G_HALF="~"; G_ARR=">"; G_SEL=">"; G_MID="-"
    G_UD="Up/Down"; G_FLOW="->"
  fi

  UI_FD=""
  if (( ${YES:-0} == 0 )); then
    if [[ -t 0 ]]; then
      UI_FD=0
    elif [[ -r /dev/tty && -w /dev/tty ]] && { : < /dev/tty; } 2>/dev/null; then
      exec 3< /dev/tty
      UI_FD=3
    fi
  fi
}

ui_restore_terminal() {
  if [[ -t 1 ]]; then printf '\033[?25h\033[?7h'; fi
  if [[ -n "$UI_FD" ]]; then stty echo icanon <&"$UI_FD" 2>/dev/null || true; fi
}

ui_has_input() { [[ -n "$UI_FD" ]]; }
ui_rich() { [[ -n "$UI_FD" && -t 1 ]]; }

ui_term_size() {
  local size=""
  [[ -n "$UI_FD" ]] && size=$(stty size <&"$UI_FD" 2>/dev/null || true)
  UI_ROWS=${size%% *}
  UI_COLS=${size##* }
  [[ "$UI_ROWS" =~ ^[0-9]+$ ]] && (( UI_ROWS > 0 )) || UI_ROWS=${LINES:-24}
  [[ "$UI_COLS" =~ ^[0-9]+$ ]] && (( UI_COLS > 0 )) || UI_COLS=${COLUMNS:-80}
}

ui_width() {
  local w=$(( UI_COLS - 4 ))
  (( w > 72 )) && w=72
  (( w < 44 )) && w=44
  printf '%d' "$w"
}

ui_line() {
  local line
  printf -v line '%*s' "$1" ''
  printf '%s' "${line// /${2:-$G_H}}"
}

ok()   { printf '  %s%s%s %s\n' "$GRN" "$G_OK" "$RST" "$*"; }
err()  { printf '  %s%s %s%s\n' "$RED" "$G_ERR" "$*" "$RST" >&2; }
warn() { printf '  %s!%s %s\n' "$YEL" "$RST" "$*"; }
info() { printf '  %s%s%s %s\n' "$TEAL" "$G_ARR" "$RST" "$*"; }
die()  { err "$*"; exit 1; }

ui_logo() {
  local -a art=(
    '__  __ ____  ____   ___  _____ ___   ____ ___  _     '
    '\ \/ /|  _ \|  _ \ / _ \|_   _/ _ \ / ___/ _ \| |    '
    ' \  / | |_) | |_) | | | | | || | | | |  | | | | |    '
    ' /  \ |  __/|  _ <| |_| | | || |_| | |__| |_| | |___ '
    '/_/\_\|_|   |_| \_\\___/  |_| \___/ \____\___/|_____|'
  )
  local i
  for i in "${!art[@]}"; do
    printf '  %s%s%s\n' "$BOLD${LOGO_TINT[i]}" "${art[i]}" "$RST"
  done
  printf '  %sXProtocol Open-Core VPN Control Panel%s  %s·  v1.0.4  ·  Ubuntu 22.04+%s\n' "$PURPLE" "$RST" "$GRAY" "$RST"
}

ui_title_bar() {
  local w inner title="XProtocol" tag="${1:-Open-Core Panel}" pad
  w=$(ui_width); inner=$(( w - 2 ))
  pad=$(( inner - 4 - ${#title} - 2 - ${#tag} - 8 ))
  (( pad < 1 )) && pad=1
  printf '  %s%s%s%s%s\n' "$DIM$TEAL" "$G_TL" "$(ui_line "$inner")" "$G_TR" "$RST"
  printf '  %s%s%s  %s%s %s%s  %s%s%s%*s%sv1.0.4%s  %s%s%s\n' \
    "$DIM$TEAL" "$G_V" "$RST" "$BOLD$ACC" "$G_SEC" "$title" "$RST" "$PURPLE" "$tag" "$RST" \
    "$pad" "" "$GRAY" "$RST" "$DIM$TEAL" "$G_V" "$RST"
  printf '  %s%s%s%s%s\n' "$DIM$TEAL" "$G_BL" "$(ui_line "$inner")" "$G_BR" "$RST"
}

ui_header() {
  ui_term_size
  if ui_rich && (( ${MENU_ACTIVE:-0} )); then
    printf '\033[H\033[2J\033[3J'
  fi
  if [[ "${1:-}" == "big" ]] && (( UI_ROWS >= 28 && UI_COLS >= 56 )); then
    echo; ui_logo
  else
    echo; ui_title_bar "${2:-Open-Core Panel}"
  fi
}

section() {
  printf '\n  %s%s %s%s\n' "$BOLD$PURPLE" "$G_SEC" "$1" "$RST"
  printf '  %s%s%s\n' "$DIM$TEAL" "$(ui_line "$(ui_width)")" "$RST"
}

step() {
  printf '\n  %s%s Step %s/%s %s %s%s\n' "$BOLD$PURPLE" "$G_SEC" "$1" "$2" "$G_MID" "$3" "$RST"
  printf '  %s%s%s\n' "$DIM$TEAL" "$(ui_line "$(ui_width)")" "$RST"
}

card_top()  { printf '\n  %s%s%s %s%s%s %s%s%s\n' "$DIM$TEAL" "$G_TL" "$G_H" "$BOLD$ACC" "$1" "$RST" "$DIM$TEAL" "$(ui_line $(( $(ui_width) - ${#1} - 4 )))" "$RST"; }
card_sep()  { printf '  %s%s%s %s %s%s\n' "$DIM$TEAL" "$G_LT" "$G_H" "$1" "$(ui_line $(( $(ui_width) - ${#1} - 4 )))" "$RST"; }
card_text() { printf '  %s%s%s  %s\n' "$DIM$TEAL" "$G_V" "$RST" "$1"; }
card_kv()   { printf '  %s%s%s  %s%-16s%s %s%s%s\n' "$DIM$TEAL" "$G_V" "$RST" "$GRAY" "$1" "$RST" "${3:-}" "$2" "$RST"; }
card_copy() { printf '\n  %s%s%s\n\n' "$BOLD$ACC" "$1" "$RST"; }
card_end()  { printf '  %s%s%s%s\n' "$DIM$TEAL" "$G_BL" "$(ui_line $(( $(ui_width) - 1 )))" "$RST"; }

ui_read_key() {
  local key="" rest="" status
  UI_KEY=""
  IFS= read -rsn1 -t 1 key <&"$UI_FD"
  status=$?
  (( status > 128 )) && return 2
  (( status == 0 )) || return 1
  case "$key" in
    "") UI_KEY="enter"; return 0 ;;
    $'\177'|$'\b') UI_KEY="backspace"; return 0 ;;
    $'\033') ;;
    *) UI_KEY="$key"; return 0 ;;
  esac
  IFS= read -rsn2 -t 0.05 rest <&"$UI_FD" || true
  case "$rest" in
    '[A'|'OA') UI_KEY="up" ;;
    '[B'|'OB') UI_KEY="down" ;;
    '[H'|'OH') UI_KEY="home" ;;
    '[F'|'OF') UI_KEY="end" ;;
    '') UI_KEY="esc" ;;
    *) UI_KEY="other"; IFS= read -rsn1 -t 0.05 _ <&"$UI_FD" || true ;;
  esac
  return 0
}

ui_choose() {
  local -n __uc_out="$1"
  local __uc_sel="$2" __uc_i __uc_n __uc_drawn=0 __uc_w __uc_pad __uc_line __uc_frame __uc_ans __uc_status
  shift 2
  local -a __uc_opts=("$@")
  __uc_n=${#__uc_opts[@]}
  (( __uc_sel >= 0 && __uc_sel < __uc_n )) || __uc_sel=0
  if [[ -z "$UI_FD" ]]; then __uc_out=$__uc_sel; return 0; fi

  if ! ui_rich; then
    for __uc_i in "${!__uc_opts[@]}"; do printf '    [%d] %s\n' $(( __uc_i + 1 )) "${__uc_opts[__uc_i]}"; done
    while :; do
      printf '  Select 1-%d [%d]: ' "$__uc_n" $(( __uc_sel + 1 ))
      IFS= read -r __uc_ans <&"$UI_FD" || return 1
      __uc_ans=${__uc_ans:-$(( __uc_sel + 1 ))}
      if [[ "$__uc_ans" =~ ^[0-9]+$ ]] && (( __uc_ans >= 1 && __uc_ans <= __uc_n )); then break; fi
    done
    __uc_out=$(( __uc_ans - 1 ))
    return 0
  fi

  ui_term_size
  __uc_w=$(ui_width)
  for __uc_i in "${!__uc_opts[@]}"; do (( ${#__uc_opts[__uc_i]} + 8 > __uc_w )) && __uc_w=$(( ${#__uc_opts[__uc_i]} + 8 )); done
  (( __uc_w > UI_COLS - 3 )) && __uc_w=$(( UI_COLS - 3 ))
  printf '\033[?25l\033[?7l'
  stty -echo <&"$UI_FD" 2>/dev/null || true
  while :; do
    __uc_frame=""
    (( __uc_drawn )) && __uc_frame+=$'\033'"[${__uc_drawn}A"$'\r'
    for __uc_i in "${!__uc_opts[@]}"; do
      if (( __uc_i == __uc_sel )); then
        __uc_pad=$(( __uc_w - 8 - ${#__uc_opts[__uc_i]} ))
        (( __uc_pad < 1 )) && __uc_pad=1
        printf -v __uc_line '  %s%s%s %s %d  %s%*s%s' "$ACC" "$G_SEL" "$RST" "$SEL_BG$BOLD" \
          $(( __uc_i + 1 )) "${__uc_opts[__uc_i]}" "$__uc_pad" "" "$RST"
      else
        printf -v __uc_line '     %s%d%s  %s' "$GRAY" $(( __uc_i + 1 )) "$RST" "${__uc_opts[__uc_i]}"
      fi
      __uc_frame+="${__uc_line}"$'\033[K\n'
    done
    __uc_frame+="  ${DIM}${GRAY}${G_UD} move ${G_MID} Enter select ${G_MID} q back${RST}"$'\033[K\n'
    printf '%s' "$__uc_frame"
    __uc_drawn=$(( __uc_n + 1 ))

    __uc_status=0
    ui_read_key || __uc_status=$?
    case $__uc_status in
      1) UI_KEY="esc" ;;
      2) continue ;;
    esac
    case "$UI_KEY" in
      up|k) (( __uc_sel = (__uc_sel - 1 + __uc_n) % __uc_n )) ;;
      down|j|$'\t') (( __uc_sel = (__uc_sel + 1) % __uc_n )) ;;
      home) __uc_sel=0 ;;
      end) __uc_sel=$(( __uc_n - 1 )) ;;
      [1-9]) (( UI_KEY <= __uc_n )) && __uc_sel=$(( UI_KEY - 1 )) ;;
      enter) break ;;
      esc|q|Q)
        printf '\033[%dA\r\033[J\033[?7h\033[?25h' "$__uc_drawn"
        stty echo <&"$UI_FD" 2>/dev/null || true
        return 1
        ;;
    esac
  done
  printf '\033[%dA\r\033[J\033[?7h\033[?25h' "$__uc_drawn"
  stty echo <&"$UI_FD" 2>/dev/null || true
  printf '  %s%s%s %s\n' "$GRN" "$G_OK" "$RST" "${__uc_opts[__uc_sel]}"
  __uc_out="$__uc_sel"
  return 0
}

pick_yesno() {
  local a def=0 d=${2:-n}
  [[ "${d,,}" == y* ]] || def=1
  ui_has_input || { (( def == 0 )); return; }
  printf '\n  %s%s%s\n' "$BOLD" "$1" "$RST"
  ui_choose a "$def" "Yes" "No" || return 1
  (( a == 0 ))
}

ask() {
  local -n __ask_out="$1"
  local __ask_q="$2" __ask_def="${3-}" __ask_line="" __ask_p
  if [[ -z "$UI_FD" ]]; then __ask_out=$__ask_def; return 0; fi
  __ask_p="  ${BOLD}${ACC}?${RST} ${__ask_q}"
  [[ -n "$__ask_def" ]] && __ask_p+=" ${GRAY}[${__ask_def}]${RST}"
  read -e -r -p "${__ask_p}: " __ask_line <&"$UI_FD" || __ask_line=""
  __ask_out="${__ask_line:-$__ask_def}"
}
