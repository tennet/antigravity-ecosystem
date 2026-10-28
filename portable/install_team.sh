#!/usr/bin/env bash
# ==============================================================================
# install_team.sh - Standalone 1-Click Installer for Antigravity Engineering Team
# Supported OS: macOS (Apple Silicon & Intel) / Linux
# Author: Manuele Francescon (@tennet) - Suite v3.1.0
# ==============================================================================

set -euo pipefail

# Visual Palettes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   🚀 Antigravity Engineering Team - Private Portable Installer  ${NC}"
echo -e "${CYAN}   Suite a 9 Specialisti con Canone Ingegneristico v3.1.0        ${NC}"
echo -e "${CYAN}================================================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
GEMINI_HOME="${HOME}/.gemini"
PLUGIN_TARGET_DIR="${GEMINI_HOME}/config/plugins/engineering-team"
GDRIVE_BRAIN="${HOME}/Library/CloudStorage/GoogleDrive-*/Il mio Drive/Antigravity_Brain"

# 1. Check Antigravity / Gemini root
mkdir -p "${GEMINI_HOME}/config/plugins"
chmod 700 "${GEMINI_HOME}"

echo -e "\n${BLUE}[1/4] Rilevamento sorgente del team...${NC}"

SOURCE_DIR=""

# Check if running inside workspace next to plugin/
if [ -d "${SCRIPT_DIR}/../plugin/agents" ]; then
    SOURCE_DIR="$(cd "${SCRIPT_DIR}/../plugin" && pwd -P)"
    echo -e "  ${GREEN}✓${NC} Sorgente trovata nel workspace locale: ${SOURCE_DIR}"
# Check if running next to an unpacked bundle
elif [ -d "${SCRIPT_DIR}/engineering-team/agents" ]; then
    SOURCE_DIR="${SCRIPT_DIR}/engineering-team"
    echo -e "  ${GREEN}✓${NC} Sorgente trovata nel bundle locale: ${SOURCE_DIR}"
# Check if a bundle archive exists in directory
elif [ -f "${SCRIPT_DIR}/antigravity_team_bundle.tar.gz" ]; then
    echo -e "  ${BLUE}ℹ${NC} Estraggo archivio antigravity_team_bundle.tar.gz..."
    tar -xzf "${SCRIPT_DIR}/antigravity_team_bundle.tar.gz" -C "${SCRIPT_DIR}"
    SOURCE_DIR="${SCRIPT_DIR}/engineering-team"
    echo -e "  ${GREEN}✓${NC} Bundle estratto con successo: ${SOURCE_DIR}"
fi

# Fallback: Check Google Drive Brain if local bundle not found
if [ -z "${SOURCE_DIR}" ] || [ ! -d "${SOURCE_DIR}/agents" ]; then
    for gdrive in ${HOME}/Library/CloudStorage/GoogleDrive-*; do
        CANDIDATE="${gdrive}/Il mio Drive/Antigravity_Brain/private_suite/engineering-team"
        if [ -d "${CANDIDATE}/agents" ]; then
            SOURCE_DIR="${CANDIDATE}"
            echo -e "  ${GREEN}✓${NC} Sorgente trovata su Google Drive: ${SOURCE_DIR}"
            break
        fi
        CANDIDATE_EN="${gdrive}/My Drive/Antigravity_Brain/private_suite/engineering-team"
        if [ -d "${CANDIDATE_EN}/agents" ]; then
            SOURCE_DIR="${CANDIDATE_EN}"
            echo -e "  ${GREEN}✓${NC} Sorgente trovata su Google Drive: ${SOURCE_DIR}"
            break
        fi
    done
fi

if [ -z "${SOURCE_DIR}" ] || [ ! -d "${SOURCE_DIR}/agents" ]; then
    echo -e "${RED}[ERROR] Impossibile trovare la suite del team!${NC}"
    echo -e "Assicurati di posizionare 'antigravity_team_bundle.tar.gz' o la cartella 'engineering-team' accanto a questo script."
    exit 1
fi

# 2. Preventative Backup of existing installation
echo -e "\n${BLUE}[2/4] Verifica e backup installazione preesistente...${NC}"
if [ -d "${PLUGIN_TARGET_DIR}" ] || [ -L "${PLUGIN_TARGET_DIR}" ]; then
    BACKUP_PATH="${GEMINI_HOME}/config/plugins/engineering-team_backup_$(date +%s)"
    echo -e "  ${YELLOW}!${NC} Installazione esistente rilevata. Archiviazione in: ${BACKUP_PATH}"
    mv "${PLUGIN_TARGET_DIR}" "${BACKUP_PATH}"
fi

# 3. Installation (Copy or Safe Symlink)
echo -e "\n${BLUE}[3/4] Installazione dei 9 Specialisti e del Canone...${NC}"

# If installing from Google Drive or remote bundle, perform recursive safe copy
if [[ "${SOURCE_DIR}" == *"GoogleDrive"* ]] || [ "${1:-}" == "--copy" ]; then
    mkdir -p "${PLUGIN_TARGET_DIR}"
    cp -a "${SOURCE_DIR}/." "${PLUGIN_TARGET_DIR}/"
    echo -e "  ${GREEN}✓${NC} Suite copiata integralmente in: ${PLUGIN_TARGET_DIR}"
else
    # Install via safe symlink to maintain two-way sync
    ln -sfn "${SOURCE_DIR}" "${PLUGIN_TARGET_DIR}"
    echo -e "  ${GREEN}✓${NC} Symlink simmetrico creato: ${PLUGIN_TARGET_DIR} ➔ ${SOURCE_DIR}"
fi

# Set non-world-writable permissions
chmod -R u=rwX,go=rX "${PLUGIN_TARGET_DIR}" 2>/dev/null || true

# 4. Verification of the 9 Specialists
echo -e "\n${BLUE}[4/4] Validazione integrità squadra...${NC}"
AGENTS=(turing werner taylor linus steve carmack rauch geohot guido)
ALL_OK=true

for AGENT in "${AGENTS[@]}"; do
    if [ -f "${PLUGIN_TARGET_DIR}/agents/${AGENT}.md" ]; then
        echo -e "  ${GREEN}✓${NC} Specialista @${AGENT} pronto."
    else
        echo -e "  ${RED}✗${NC} Specialista @${AGENT} MANCANTE!"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = true ]; then
    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${GREEN}   ✨ INSTALLAZIONE COMPLETATA CON SUCCESSO SU QUESTO MAC!      ${NC}"
    echo -e "${GREEN}   Tutti i 9 Specialisti sono immediatamente pronti in chat:    ${NC}"
    echo -e "   @turing, @werner, @taylor, @linus, @steve,                   "
    echo -e "   @carmack, @rauch, @geohot, @guido                            "
    echo -e "${GREEN}================================================================${NC}"
else
    echo -e "\n${YELLOW}[ATTENZIONE] Alcuni agenti non sono stati trovati. Verifica l'integrità del bundle.${NC}"
fi
