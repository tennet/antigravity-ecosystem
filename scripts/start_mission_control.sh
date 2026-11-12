#!/usr/bin/env bash
# ==============================================================================
# start_mission_control.sh — Launcher Live Web Server (macOS / Linux)
# Espone Antigravity Mission Control su localhost e LAN aziendale (porta 8787)
# con feed read-only sanitizzato dai log reali di Antigravity.
# ==============================================================================

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
SERVER_JS="${REPO_ROOT}/server/mission_control_server.mjs"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8787}"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js non trovato nel PATH. Installa Node.js >= 20 (es. brew install node)." >&2
  exit 1
fi

if [[ ! "${PORT}" =~ ^[0-9]+$ ]] || [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
  echo "[ERROR] PORT non valida: '${PORT}' (atteso numero 1..65535)." >&2
  exit 1
fi

if [ ! -f "${SERVER_JS}" ]; then
  echo "[ERROR] Server non trovato in ${SERVER_JS}" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[ERROR] La porta TCP ${PORT} e' gia' occupata da un altro processo:" >&2
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >&2 || true
    echo "        Imposta PORT=<altra_porta> (es. PORT=8788 ./scripts/start_mission_control.sh) o ferma il processo esistente." >&2
    exit 1
  fi
elif command -v ss >/dev/null 2>&1; then
  if ss -ltn | awk '{print $4}' | grep -qE "[:.]${PORT}$"; then
    echo "[ERROR] La porta TCP ${PORT} e' gia' in ascolto (rilevato tramite ss)." >&2
    exit 1
  fi
fi

detect_lan_ip() {
  local iface ip os_name
  os_name="$(uname -s 2>/dev/null || echo unknown)"
  if [ "${os_name}" = "Darwin" ] && command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
    if [ -n "${iface}" ]; then
      ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
      if [ -n "${ip}" ]; then
        printf '%s' "${ip}"
        return 0
      fi
    fi
    for candidate in en0 en1; do
      ip="$(ipconfig getifaddr "${candidate}" 2>/dev/null || true)"
      if [ -n "${ip}" ]; then
        printf '%s' "${ip}"
        return 0
      fi
    done
  fi
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
    if [ -n "${ip}" ]; then
      printf '%s' "${ip}"
      return 0
    fi
  fi
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [ -n "${ip}" ]; then
      printf '%s' "${ip}"
      return 0
    fi
  fi
  return 1
}

LAN_IP="$(detect_lan_ip || true)"
if [ -n "${LAN_IP}" ] && [ "${HOST}" = "0.0.0.0" ]; then
  echo "[INFO] Interfaccia LAN rilevata: ${LAN_IP} (apri http://${LAN_IP}:${PORT} dai colleghi sulla stessa rete Wi-Fi)"
fi
if [ "$(uname -s 2>/dev/null || echo '')" = "Darwin" ]; then
  echo "[INFO] Nota macOS: se compare il popup del firewall macOS per 'node', consenti le connessioni in entrata per l'accesso LAN."
fi

export HOST PORT
exec node "${SERVER_JS}"
