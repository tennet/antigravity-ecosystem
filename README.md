# 🚀 Antigravity Ecosystem & Brain Hub (v3.0.0)

> **Autore**: [Manuele Francescon](https://github.com/tennet) (`@tennet`)  
> **Versione**: 3.0.0 (Suite a 9 Specialisti con Alias Rapidi)  
> **Repository Ufficiale Plugin**: [`tennet/antigravity-engineering-team`](https://github.com/tennet/antigravity-engineering-team)  
> **Workspace Path**: `/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem`

---

## 🌟 Panoramica del Progetto

Questo workspace unificato raccoglie e governa l'intero ecosistema di sviluppo, memoria e automazione per **Antigravity AI**, strutturato per essere continuamente esteso, manutenuto e sincronizzato tra **3 Mac** e **1 PC Windows 11**:

1. **`plugin/`**: La suite ufficiale dei **9 subagenti specializzati** con i rispettivi **9 alias rapidi** (`@turing`, `@werner`, `@taylor`, `@linus`, `@steve`, `@carmack`, `@rauch`, `@geohot`, `@guido`) e il **Tomo della Saggezza Ingegneristica** (`references/01-09`).
2. **`backend/`**: La pipeline del grafo di memoria multi-tenant in **PHP 8.4+ e Laravel 13** (con piena retrocompatibilità 11/12), dotata di Action atomiche, prevenzione dei Gap Lock InnoDB, retry esponenziale con jitter decorrelato e protezione BOLA multi-tenant.
3. **`infrastructure/`**: Lo stack **Docker multi-arch** (`linux/amd64` e `linux/arm64`) con MySQL 8.4 LTS, PHP 8.4-FPM non-root (`su-exec`) e Nginx webroot hardening.
4. **`scripts/`**: Gli strumenti di sincronizzazione simmetrica cross-platform (`sync.sh` per macOS, `sync.ps1` per Windows 11) e il motore di consolidamento della memoria Google Drive (`unify_memory.py`).
5. **`docs/`**: Tutti i report storici, i test avversariali "Tutti contro Tutti", i piani di unificazione multi-device e le scorecard di maturità tecnica.

---

## 📁 Struttura del Workspace

```text
antigravity-ecosystem/
├── README.md                      # Centro di comando e documentazione del workspace
├── plugin/                        # Collegamento alla suite ufficiale (tennet/antigravity-engineering-team)
│   ├── agents/                    # I 9 agenti canonici + i 9 alias rapidi
│   ├── references/                # I 9 volumi del Canone Ingegneristico (01-09 + INDEX)
│   ├── docs/                      # Guida tecnica dettagliata
│   ├── VADEMECUM.md               # Prontuario per l'uso quotidiano
│   └── plugin.json                # Manifesto v3.0.0
├── backend/                       # Pipeline di Memoria Multi-Tenant (Laravel/MySQL)
│   ├── app/
│   │   ├── Actions/               # UpsertMemoryNodeAction (anti-deadlock, atomico)
│   │   ├── Models/                # MemoryNode, MemoryRelation, Tenant
│   │   ├── Http/Requests/         # StoreMemoryNodeRequest (anti-DoS, anti-NaN)
│   │   └── Enums/                 # EntityType, RelationType
│   ├── database/migrations/       # Migrazioni DDL con indici coprenti e vincoli CHECK
│   └── tests/Feature/             # Suite di test automatizzati (Pest/PHPUnit)
├── infrastructure/                # Containerizzazione & Hosting di Produzione
│   ├── docker-compose.yml         # Stack MySQL 8.4 + PHP 8.4-FPM + Nginx
│   ├── nginx/conf.d/laravel.conf  # Hardening webroot (isolamento public/, anti-bypass)
│   ├── php/Dockerfile             # Multi-stage, multi-arch non-root con su-exec
│   └── mysql/my.cnf               # Configurazione InnoDB ad alta efficienza
├── scripts/                       # Sincronizzazione Multi-Piattaforma
│   ├── sync.sh                    # Script simmetrico macOS (POSIX / Zsh / Apple Silicon)
│   ├── sync.ps1                   # Script simmetrico Windows 11 (PowerShell 7+ / Mutex)
│   └── hooks/
│       ├── unify_memory.py        # Consolidatore determinista della memoria Google Drive
│       ├── resolve_python.py      # Risolutore polimorfico dell'interprete Python
│       └── security_linter.py     # Linter di sicurezza difensiva PreToolUse
└── docs/                          # Archivio Storico delle Decisioni & Audit
    ├── audit_antigravity_brain_multidevice.md
    ├── report_stress_test_v3.md
    ├── report_feedback_formazione_subagenti.md
    └── piano_unificazione_multidevice_v3.md
```

---

## 👥 La Squadra dei 9 Specialisti Pronta all'Uso

| Alias Rapido | Ruolo Canonico | Chi è e cosa governa |
| :---: | :--- | :--- |
| **`@turing`** | [`project-orchestrator`](plugin/agents/project-orchestrator.md) | **Alan Turing**: Tech Lead, governance del flusso a 5 fasi, matrice RACI e quality gate. |
| **`@werner`** | [`software-architect`](plugin/agents/software-architect.md) | **Werner Vogels**: System Architect, contratti tipizzati OpenAPI, resilienza cloud. |
| **`@taylor`** | [`polyglot-backend-sage`](plugin/agents/polyglot-backend-sage.md) | **Taylor Otwell**: Backend Sage, Laravel 13, zero N+1, Action pattern, anti Gap-Lock. |
| **`@linus`** | [`devops-infra-sage`](plugin/agents/devops-infra-sage.md) | **Linus Torvalds**: DevOps, Docker multi-arch, webroot hardening, script macOS/Windows. |
| **`@steve`** | [`ui-ux-designer`](plugin/agents/ui-ux-designer.md) | **Steve Jobs**: UI/UX Designer, layout Bento Grid dark Zinc 950/900, micro-interazioni. |
| **`@carmack`** | [`qa-engineer`](plugin/agents/qa-engineer.md) | **John Carmack**: Lead QA, TDD rigoroso, boundary testing estremo (NaN/INF, 10MB), anti-crash. |
| **`@rauch`** | [`integration-tester`](plugin/agents/integration-tester.md) | **Guillermo Rauch**: Integration Tester, Circuit Breakers, resilienza di rete, E2E. |
| **`@geohot`** | [`security-auditor`](plugin/agents/security-auditor.md) | **George Hotz**: Adversarial Security Auditor, STRIDE, anti-BOLA, Diritto di Veto. |
| **`@guido`** | [`documentation-engineer`](plugin/agents/documentation-engineer.md) | **Guido van Rossum**: Documentation Engineer, Docs-as-Code veritiero, Diátaxis 4 quadranti. |

---

## ⚡ Comandi Rapidi per il Lavoro Quotidiano

### 1. Sincronizzare la Memoria con Google Drive:
```bash
python3 scripts/hooks/unify_memory.py
```

### 2. Eseguire l'Allineamento della Postazione Locale:
- **Su macOS**: `./scripts/sync.sh`
- **Su Windows 11**: `powershell -ExecutionPolicy Bypass -File .\scripts\sync.ps1`

### 3. Avviare lo Stack Docker di Produzione:
```bash
cd infrastructure && docker compose up -d
```

---

## 💡 Come impostare questo Workspace in Antigravity

Per permettere ad Antigravity di avere sempre visibilità diretta su questo progetto:
1. In Antigravity, seleziona la cartella del progetto:
   `/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem`
2. Impostala come **Active Workspace** (o apri la cartella tramite *File ➔ Open Folder*).
3. Da quel momento, tutti gli strumenti, file di configurazione, backend e documentazione saranno nel tuo contesto immediato.
