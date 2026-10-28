# 🚀 Guida Portabilità Privata del Team Antigravity (Multi-Device)

> **Suite**: `engineering-team` (v3.1.0)  
> **Autore**: [Manuele Francescon](https://github.com/tennet) (`@tennet`)  
> **Obiettivo**: Portare istantaneamente l'intera squadra dei 9 specialisti su qualsiasi nuovo Mac o PC Windows 11 mantenendo riservatezza, zero allucinazioni e configurazione pronta in 1 clic.

---

## 🧰 Cosa Contiene il Kit Portabile Privato (`portable/`)

La cartella `portable/` contiene tutto il necessario per impacchettare ed esportare il team ovunque:

```text
portable/
├── bundle_team.sh              # Script per generare i bundle compressi (tar.gz e zip)
├── install_team.sh             # Installer 1-click per macOS (Apple Silicon / Intel)
├── install_team.ps1            # Installer 1-click per Windows 11 (PowerShell 7+ Nativo)
└── dist/                       # I pacchetti generati pronti al trasferimento
    ├── antigravity_team_bundle.tar.gz
    └── antigravity_team_bundle.zip
```

---

## 💻 Metodo 1: Installazione su un Nuovo Mac (macOS)

1. **Trasferisci i file**:
   Copia la cartella `portable/` (oppure l'archivio `antigravity_team_bundle.tar.gz` insieme a `install_team.sh`) sul nuovo Mac (tramite AirDrop, USB, o Google Drive).
2. **Apri il Terminale ed esegui**:
   ```bash
   cd portable
   ./install_team.sh
   ```
3. **Cosa fa automaticamente**:
   - Crea `~/.gemini/config/plugins/engineering-team` con i permessi corretti (`0700` e non-world-writable).
   - Registra tutti i 9 subagenti (`@turing`, `@werner`, `@taylor`, `@linus`, `@steve`, `@carmack`, `@rauch`, `@geohot`, `@guido`).
   - Copia i 9 volumi del Canone Ingegneristico v3.1.0 (`references/`).
   - Riavvia/ricarica Antigravity: i 9 agenti sono subito disponibili digitando `@` in chat.

---

## 🪟 Metodo 2: Installazione su un Nuovo PC (Windows 11)

1. **Trasferisci i file**:
   Copia la cartella `portable/` (oppure `antigravity_team_bundle.zip` insieme a `install_team.ps1`) sul PC Windows 11.
2. **Apri PowerShell 7+ ed esegui** (nessuna elevazione ad Amministratore richiesta):
   ```powershell
   cd portable
   powershell -ExecutionPolicy Bypass -File .\install_team.ps1
   ```
3. **Cosa fa automaticamente**:
   - Crea la **Junction nativa** Win32 in `$HOME\.gemini\config\plugins\engineering-team` senza richiedere la Modalità Sviluppatore o permessi di root.
   - Normalizza i ritorni a capo per evitare bug CRLF.
   - Valida che tutti i 9 agenti siano operativi e pronti in Antigravity.

---

## ☁️ Metodo 3: Sincronizzazione Automatica tramite Google Drive

Se sui tuoi computer usi già Google Drive (come configurato per `unify_memory.py`):

1. Esegui `./portable/bundle_team.sh` sulla macchina principale.
2. Lo script deposita automaticamente la suite in:
   `Google Drive/Il mio Drive/Antigravity_Brain/private_suite/engineering-team`
3. Su qualsiasi altro Mac o PC collegato allo stesso account Google:
   - Su Mac basta lanciare:
     ```bash
     bash "$HOME/Library/CloudStorage/GoogleDrive-*/Il mio Drive/Antigravity_Brain/private_suite/install_team.sh"
     ```
   - Su Windows basta lanciare:
     ```powershell
     powershell -File "G:\Il mio Drive\Antigravity_Brain\private_suite\install_team.ps1"
     ```
   Il team si installerà all'istante prelevando i file direttamente dal Drive.

---

## 🔒 Sicurezza & Privacy

- **Nessun Token o Chiave Esposta**: Il bundle contiene esclusivamente le definizioni di sistema, i canoni ingegneristici e le istruzioni operative. Password, chiavi API o file `.env` personali rimangono strettamente confinati nel tuo gestore di credenziali locale.
- **Integrità Canone v3.1.0**: Ogni installazione include già le protezioni testate contro allucinazioni (Transactional Outbox, Tie-Breaking Quorum, Online DDL, SIGHUP secret reload e Testable Docs).
