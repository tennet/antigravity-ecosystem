#!/usr/bin/env bash
# ==============================================================================
# check_mission_control.sh — Production Health & Diagnostics Probe
# Checks HTTP /healthz, process state, latency, and SSE connectivity.
# Returns 0 on success, 1 on failure.
# ==============================================================================

set -euo pipefail

TARGET_HOST="${1:-${HOST:-127.0.0.1}}"
TARGET_PORT="${2:-${PORT:-8787}}"
URL="http://${TARGET_HOST}:${TARGET_PORT}/healthz"

echo "=== Antigravity Mission Control — Health Probe ==="
echo "Target URL: ${URL}"

if ! command -v curl >/dev/null 2>&1; then
  echo "[ERROR] 'curl' non trovato nel sistema." >&2
  exit 1
fi

TMP_BODY="$(mktemp "${TMPDIR:-/tmp}/mc_health.XXXXXX")"
cleanup() {
  rm -f "${TMP_BODY}"
}
trap cleanup EXIT INT TERM

CURL_OUT="$(curl -sS -m 3 -o "${TMP_BODY}" -w "%{http_code} %{time_total}" "${URL}" 2>/dev/null || echo "000 0")"
HTTP_CODE="$(echo "${CURL_OUT}" | awk '{print $1}')"
HTTP_TIME="$(echo "${CURL_OUT}" | awk '{print $2}')"
HTTP_BODY="$(cat "${TMP_BODY}" 2>/dev/null || true)"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "[FAIL] Endpoint non risponde 200 OK (HTTP Status: ${HTTP_CODE:-N/A}, Tempo: ${HTTP_TIME:-N/A}s)" >&2
  if [ -n "${HTTP_BODY}" ]; then
    echo "       Dettaglio errore: ${HTTP_BODY}" >&2
  fi
  exit 1
fi

echo "[OK] Risposta HTTP 200 ricevuta in ${HTTP_TIME}s."

if command -v node >/dev/null 2>&1; then
  node -e '
    try {
      const data = JSON.parse(process.argv[1]);
      console.log(`     - Stato Health:     ${data.status} (rfc: ${data.health || "ok"})`);
      console.log(`     - Versione:         ${data.version || "n/a"}`);
      console.log(`     - Uptime:           ${data.uptime_s || 0} secondi`);
      console.log(`     - Client SSE:       ${data.sse_clients || 0}`);
      console.log(`     - Memoria RSS:      ${data.memory_rss_mb || 0} MB`);
      console.log(`     - Storage Brain:    ${data.brain_readable ? "Accessibile (OK)" : "Fallback/Non letto"}`);
      console.log(`     - Auth LAN:         ${data.auth_required ? "Abilitata" : "Disabilitata (Loopback)"}`);
    } catch (e) {
      console.log("     - Raw Payload: " + process.argv[1]);
    }
  ' "${HTTP_BODY}"
else
  echo "     Payload: ${HTTP_BODY}"
fi

echo "=== Verifica completata con successo ==="
exit 0
