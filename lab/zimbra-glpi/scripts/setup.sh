#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Antigravity Lab: GLPI 10 + Zimbra / Mock Mailgate"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BASE_DIR"

if [ ! -f .env ]; then
    echo "==> Generazione file .env da .env.example..."
    cp .env.example .env
fi

echo "==> Verifica prerequisiti Docker..."
if ! docker info >/dev/null 2>&1; then
    echo "ERRORE: Docker daemon non è in esecuzione!" >&2
    exit 1
fi

echo "==> Permessi script configurati."
chmod +x glpi/entrypoint.sh mariadb/initdb.d/01-tzinfo.sh scripts/*.py || true

echo ""
echo "Ambiente pronto!"
echo "Per avviare la modalità veloce Mock Mail (RAM < 1.5 GB):"
echo "  docker compose --profile mock up -d --build"
echo ""
echo "Per avviare la modalità completa con Zimbra ZCS (RAM min 10-12 GB):"
echo "  docker compose --profile zimbra up -d --build"
echo "=========================================================="
