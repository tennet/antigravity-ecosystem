#!/usr/bin/env bash
# ==============================================================================
# bundle_team.sh - Export & Package Antigravity Engineering Team into Portable Bundle
# Creates standalone tar.gz and zip bundles for instant multi-device deployment.
# Author: Manuele Francescon (@tennet) - Suite v3.1.0
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   📦 Antigravity Engineering Team - Packager Portabile Privato  ${NC}"
echo -e "${CYAN}================================================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
PLUGIN_SRC="${SCRIPT_DIR}/engineering-team"
if [ ! -d "${PLUGIN_SRC}/agents" ]; then
    PLUGIN_SRC="${REPO_ROOT}/plugin"
fi
SKILLS_SRC="${REPO_ROOT}/skills"
DIST_DIR="${SCRIPT_DIR}/dist"

if [ ! -d "${PLUGIN_SRC}/agents" ]; then
    echo -e "${YELLOW}[ERRORE] Cartella sorgente plugin non trovata in: ${PLUGIN_SRC}${NC}"
    exit 1
fi

mkdir -p "${DIST_DIR}"

echo -e "\n${BLUE}[1/3] Creazione directory temporanea per il bundle pulito...${NC}"
TMP_STAGING="${DIST_DIR}/engineering-team"
rm -rf "${TMP_STAGING}" 2>/dev/null || true
mkdir -p "${TMP_STAGING}"

# Copy only production assets (excluding git history and cache)
cp -a "${PLUGIN_SRC}/agents" "${TMP_STAGING}/"
cp -a "${PLUGIN_SRC}/references" "${TMP_STAGING}/"
cp -a "${PLUGIN_SRC}/plugin.json" "${TMP_STAGING}/"
cp -a "${PLUGIN_SRC}/README.md" "${TMP_STAGING}/"
cp -a "${PLUGIN_SRC}/VADEMECUM.md" "${TMP_STAGING}/"
if [ -d "${SKILLS_SRC}" ]; then
    cp -a "${SKILLS_SRC}" "${DIST_DIR}/skills"
fi

# Include installer scripts alongside the bundle
cp "${SCRIPT_DIR}/install_team.sh" "${DIST_DIR}/"
cp "${SCRIPT_DIR}/install_team.ps1" "${DIST_DIR}/"

echo -e "\n${BLUE}[2/3] Compressione bundle portabili...${NC}"

# Create tar.gz for macOS / Linux
tar -czf "${DIST_DIR}/antigravity_team_bundle.tar.gz" -C "${DIST_DIR}" engineering-team
echo -e "  ${GREEN}✓${NC} Bundle macOS/Linux: ${DIST_DIR}/antigravity_team_bundle.tar.gz"

# Create zip for Windows 11
(cd "${DIST_DIR}" && zip -rq "antigravity_team_bundle.zip" engineering-team)
echo -e "  ${GREEN}✓${NC} Bundle Windows 11: ${DIST_DIR}/antigravity_team_bundle.zip"

# Copy archive next to installers for single-folder distribution
cp "${DIST_DIR}/antigravity_team_bundle.tar.gz" "${SCRIPT_DIR}/" 2>/dev/null || true
cp "${DIST_DIR}/antigravity_team_bundle.zip" "${SCRIPT_DIR}/" 2>/dev/null || true

# 3. Synchronize to Google Drive Brain (if available)
echo -e "\n${BLUE}[3/3] Sincronizzazione automatica con Google Drive Brain...${NC}"
GDRIVE_FOUND=false

for gdrive in ${HOME}/Library/CloudStorage/GoogleDrive-*; do
    TARGET_BRAIN="${gdrive}/Il mio Drive/Antigravity_Brain/private_suite/engineering-team"
    TARGET_PARENT="${gdrive}/Il mio Drive/Antigravity_Brain/private_suite"
    if [ -d "${gdrive}/Il mio Drive/Antigravity_Brain" ]; then
        mkdir -p "${TARGET_PARENT}"
        rm -rf "${TARGET_BRAIN}" 2>/dev/null || true
        cp -a "${TMP_STAGING}" "${TARGET_BRAIN}"
        cp "${SCRIPT_DIR}/install_team.sh" "${TARGET_PARENT}/"
        cp "${SCRIPT_DIR}/install_team.ps1" "${TARGET_PARENT}/"
        echo -e "  ${GREEN}✓${NC} Suite sincronizzata su Google Drive: ${TARGET_BRAIN}"
        GDRIVE_FOUND=true
        break
    fi
done

if [ "$GDRIVE_FOUND" = false ]; then
    echo -e "  ${YELLOW}!${NC} Google Drive CloudStorage non rilevato localmente (nessun problema, i bundle in dist/ sono pronti)."
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}   ✨ BUNDLE PORTABILE CREATO CON SUCCESSO!                     ${NC}"
echo -e "   File generati in: ${SCRIPT_DIR}/dist/                        "
echo -e "   - antigravity_team_bundle.tar.gz (per Mac/Linux)              "
echo -e "   - antigravity_team_bundle.zip    (per Windows 11)             "
echo -e "   - install_team.sh                (installer 1-click Mac)      "
echo -e "   - install_team.ps1               (installer 1-click Windows)  "
echo -e "${GREEN}================================================================${NC}"
