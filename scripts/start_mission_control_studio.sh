#!/usr/bin/env bash
# ==============================================================================
# start_mission_control_studio.sh — Launcher Live Studio Cockpit (macOS / Linux)
# Espone Antigravity Live Studio (v4.2.0-studio) in parallelo su porta 8788
# con monitor live, gestione interattiva skill e console direttive per gli agenti.
# ==============================================================================

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
SERVER_JS="${REPO_ROOT}/server/mission_control_studio_server.mjs"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8788}"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js non trovato nel PATH. Installa Node.js >= 20." >&2
  exit 1
fi

if [[ ! "${PORT}" =~ ^[0-9]+$ ]] || [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
  echo "[ERROR] PORT non valida: '${PORT}' (atteso numero 1..65535)." >&2
  exit 1
fi

if [ ! -f "${SERVER_JS}" ]; then
  echo "[ERROR] Server Studio non trovato in ${SERVER_JS}" >&2
  exit 1
fi

FORCE_KILL=0
for arg in "$@"; do
  if [ "${arg}" = "--force" ] || [ "${arg}" = "-f" ]; then
    FORCE_KILL=1
  fi
done

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    OCCUPIED_PID="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t | head -n 1 || true)"
    if [ "${FORCE_KILL}" = "1" ] && [ -n "${OCCUPIED_PID}" ]; then
      echo "[INFO] Chiusura del processo precedente sulla porta ${PORT} (PID ${OCCUPIED_PID})..."
      kill -9 "${OCCUPIED_PID}" 2>/dev/null || true
      sleep 1
    else
      echo "[AVVISO] La porta TCP ${PORT} e' occupata dal processo PID ${OCCUPIED_PID:-sconosciuto}." >&2
      echo "         Per liberarla e riavviare : ./scripts/start_mission_control_studio.sh --force" >&2
      echo "         Oppure chiudilo con       : kill -9 ${OCCUPIED_PID}" >&2
      echo "         Oppure usa un'altra porta : PORT=8789 ./scripts/start_mission_control_studio.sh" >&2
      exit 1
    fi
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
  return 1
}

LAN_IP="$(detect_lan_ip || true)"

echo "=================================================================="
echo " 🚀 Antigravity Live Studio & Cockpit — Avvio Launcher Parallelo"
echo "=================================================================="
echo " Directory Base : ${REPO_ROOT}"
echo " Server Script  : server/mission_control_studio_server.mjs"
echo " Porta Studio   : ${PORT} (Porta parallela per non interferire con 8787)"
echo " Localhost URL  : http://127.0.0.1:${PORT}"
if [ -n "${LAN_IP}" ] && [ "${HOST}" = "0.0.0.0" ]; then
  echo " Wi-Fi / LAN IP : http://${LAN_IP}:${PORT}"
fi
echo " Funzionalità   : Monitor Live · Skill Studio · Directives Console"
echo "=================================================================="

exec node "${SERVER_JS}"
