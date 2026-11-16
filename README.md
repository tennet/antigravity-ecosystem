# 🚀 Antigravity Ecosystem & Brain Hub (v5.0.0)

> **Autore**: [Manuele Francescon](https://github.com/tennet) (`@tennet`)  
> **Versione**: 5.0.0 (Master Blueprint v5.0: Token Economics, Context Caching, Chaos Sync & 12 Specialisti Core)  
> **Repository Ufficiale Plugin**: [`tennet/antigravity-engineering-team`](https://github.com/tennet/antigravity-engineering-team)  
> **Workspace Path**: `/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem`

---

## 🌟 Panoramica del Progetto

Questo workspace unificato raccoglie e governa l'intero ecosistema di sviluppo, memoria e automazione per **Antigravity AI**, strutturato per essere continuamente esteso, manutenuto e sincronizzato tra **3 Mac** e **1 PC Windows 11**:

1. **`portable/engineering-team/` & `plugin/`**: La suite ufficiale dei **12 subagenti Core** con i rispettivi **12 alias rapidi** (`@turing`, `@werner`, `@taylor`, `@linus`, `@mitnick`, `@steve`, `@karpathy`, `@dpo`, `@carmack`, `@rauch`, `@geohot`, `@guido`) e il **Tomo della Saggezza Ingegneristica** (`references/01-12`).
2. **`skills/`**: Le **14 Skill operative on-demand** estratte dai progetti reali (Creative UI Art Direction per `@steve`, Laravel Boost/Cloud, Tailwind v4 + Blade, AI/LLM & Evals, ETL Dati Sporchi & Scraping, Proxmox/Caddy, StackCP Apache, Cloudflare Zero Trust, Node.js zero-dipendenze, HTML Standalone CSP, Doctest & GDPR E0–E3).
3. **`backend/`**: La pipeline del grafo di memoria multi-tenant in **PHP 8.4+ e Laravel 13** (con piena retrocompatibilità 11/12), dotata di Action atomiche, prevenzione dei Gap Lock InnoDB, retry esponenziale con jitter decorrelato e protezione BOLA multi-tenant.
4. **`infrastructure/`**: Lo stack **Docker multi-arch** (`linux/amd64` e `linux/arm64`) con MySQL 8.4 LTS, PHP 8.4-FPM non-root (`su-exec`) e Nginx webroot hardening.
5. **`scripts/`**: Gli strumenti di sincronizzazione simmetrica cross-platform (`sync.sh` per macOS, `sync.ps1` per Windows 11), il consolidatore memoria (`unify_memory.py`), il security linter reale (`security_linter.py`) e il **Doctest Gate** (`doctest_docs.py`).
6. **`lab/`**: Laboratori e collaudi architetturali isolati, tra cui `lab/zimbra-glpi/` (ambiente Docker Compose Dual-Profile per integrazione **ZCS / GreenMail + GLPI 10 Mailgate** con routing email-to-ticket, anti-loop e sincronizzazione LDAP).
7. **`docs/`**: Report storici, audit multi-device e Live Mission Control UI.

---

## 📁 Struttura del Workspace

```text
antigravity-ecosystem/
├── README.md                      # Centro di comando e documentazione del workspace
├── plugin/                        # Collegamento alla suite ufficiale (tennet/antigravity-engineering-team)
│   ├── agents/                    # I 12 agenti canonici + i 12 alias rapidi
│   ├── references/                # I 12 volumi del Canone Ingegneristico (01-12 + INDEX)
│   ├── docs/                      # Guida tecnica dettagliata
│   ├── VADEMECUM.md               # Prontuario per l'uso quotidiano
│   └── plugin.json                # Manifesto v5.0.0
├── server/                        # Live Mission Control Server (Node.js zero-dipendenze)
│   ├── mission_control_server.mjs # HTTP + SSE /api/live, /api/stream, /api/auth-cookie, auth LAN
│   ├── antigravity_reader.mjs     # Lettore read-only sanitizzato di .system_generated + trigger Fenice
│   └── server.test.mjs            # Suite test automatizzata (node:test)
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
│   ├── docker-compose.mission-control.yml # Servizio opt-in Mission Control Live non-root read-only
│   ├── nginx/conf.d/laravel.conf  # Hardening webroot (isolamento public/, anti-bypass)
│   ├── nginx/mission-control.conf.example # Reverse proxy SSE (proxy_buffering off) per porta 8787
│   ├── php/Dockerfile             # Multi-stage, multi-arch non-root con su-exec
│   └── mysql/my.cnf               # Configurazione InnoDB ad alta efficienza
├── scripts/                       # Sincronizzazione Multi-Piattaforma & Live Launcher
│   ├── sync.sh                    # Script simmetrico macOS (POSIX / Zsh / Apple Silicon)
│   ├── sync.ps1                   # Script simmetrico Windows 11 (PowerShell 7+ / Mutex)
│   ├── start_mission_control.sh   # Avvio web server Live macOS / Linux (0.0.0.0:8787 + token LAN)
│   ├── start_mission_control.ps1  # Avvio web server Live Windows 11 (Mutex + LAN IP detection)
│   └── hooks/
│       ├── unify_memory.py        # Consolidatore determinista della memoria Google Drive
│       ├── resolve_python.py      # Risolutore polimorfico dell'interprete Python
│       └── security_linter.py     # Linter di sicurezza difensiva PreToolUse
├── lab/                           # Laboratori e Proof of Concept isolati
│   └── zimbra-glpi/               # Laboratorio GLPI 10 + Zimbra / GreenMail (Email-to-Ticket Mailgate)
│       ├── docker-compose.yml     # Dual-Profile (mock / zimbra)
│       ├── glpi/                  # Dockerfile GLPI 10 + PHP 8.2 (imap/ldap) + Apache + Cron
│       ├── mariadb/               # MariaDB 10.11 con utf8mb4 e tzinfo
│       ├── dnsmasq/               # Risolutore DNS con MX per lab.local
│       ├── docs/                  # ARCHITECTURE_GLPI_ZIMBRA.md (ADR-001, anti-loop, LDAP)
│       └── scripts/               # send-test-email.py e setup.sh
└── docs/                          # Archivio Storico, Decisioni & Mission Control UI
    ├── mission_control.html       # Dashboard 2.5D Interattiva (Live SSE + Demo Offline + Stanza Fenice)
    ├── audit_antigravity_brain_multidevice.md
    ├── report_stress_test_v3.md
    ├── report_feedback_formazione_subagenti.md
    └── piano_unificazione_multidevice_v3.md
```

---

## 👥 La Squadra dei 12 Specialisti Pronta all'Uso

| Alias Rapido | Ruolo Canonico | Chi è e cosa governa |
| :---: | :--- | :--- |
| **`@turing`** | [`project-orchestrator`](portable/engineering-team/agents/project-orchestrator.md) | **Alan Turing**: Tech Lead, governance a 5 fasi, architettura a 3 livelli (Core/Skill/Domain), RACI & Quorum. |
| **`@werner`** | [`software-architect`](portable/engineering-team/agents/software-architect.md) | **Werner Vogels**: System Architect, contratti OpenAPI/RFC 7807, Edge Zero Trust, Dual-Stack & SSE. |
| **`@taylor`** | [`polyglot-backend-sage`](portable/engineering-team/agents/polyglot-backend-sage.md) | **Taylor Otwell**: Backend Sage, Laravel 11–13/Boost, Postgres 16, MySQL 8.4, SQLite WAL, Node ESM & Python stdlib. |
| **`@linus`** | [`devops-infra-sage`](portable/engineering-team/agents/devops-infra-sage.md) | **Linus Torvalds**: DevOps, Docker multi-arch, Proxmox/Caddy, StackCP Apache, Laravel Cloud, script Mac/Windows. |
| **`@mitnick`** | [`ethical-hacker-redteam`](portable/engineering-team/agents/ethical-hacker-redteam.md) | **Kevin Mitnick**: Ethical Hacker & Red Team; affianca `@linus` e `@geohot` per scovare falle su porte, webroot, auth e configurazioni. |
| **`@steve`** | [`ui-ux-designer`](portable/engineering-team/agents/ui-ux-designer.md) | **Steve Jobs**: UI/UX Designer, Dual-Theme (Dark Bento & Light PMI), Blade + Tailwind v4, Standalone HTML CSP & print. |
| **`@karpathy`** | [`ai-systems-engineer`](portable/engineering-team/agents/ai-systems-engineer.md) | **Andrej Karpathy**: AI/LLM Systems & Evals Architect, job asincroni, fallback trasparenti, anti-schema-drift. |
| **`@dpo`** | [`privacy-compliance-counsel`](portable/engineering-team/agents/privacy-compliance-counsel.md) | **DPO & Compliance**: GDPR art. 5/6/28/35, separazione sintetico/reale, retention, livelli probatori eIDAS/CAD E0–E3. |
| **`@carmack`** | [`qa-engineer`](portable/engineering-team/agents/qa-engineer.md) | **John Carmack**: Lead QA, TDD rigoroso, fuzzing ingestion CSV, `Http::preventStrayRequests()`, `node:test` SSE. |
| **`@rauch`** | [`integration-tester`](portable/engineering-team/agents/integration-tester.md) | **Guillermo Rauch**: Integration Tester, resilienza LLM, SSE proxy, ETL `source_hash`, scraping & Edge Auth. |
| **`@geohot`** | [`security-auditor`](portable/engineering-team/agents/security-auditor.md) | **George Hotz**: Adversarial Security Auditor, STRIDE, JWKS Cloudflare, OWASP LLM01/05/10, SSRF IPv6, **Diritto di Veto**. |
| **`@guido`** | [`documentation-engineer`](portable/engineering-team/agents/documentation-engineer.md) | **Guido van Rossum**: Documentation Engineer, Docs-as-Code, Single Source `AGENTS.md`/`CLAUDE.md`, Doctest Gate. |

---

## ⚡ Comandi Rapidi per il Lavoro Quotidiano (Unified CLI v5.0.0 / Master Blueprint v5.0)

L'ecosistema dispone ora della CLI universale `./ecosystem` (o `python3 scripts/ecosystem.py`):

### 1. Test Gate Completo (@carmack, @andrej & @rauch):
Esegue in un solo comando il Security Linter hardened, gli unit test Python con PII scrubbing, il Multi-Node Chaos Test, l'Offline Eval Runner deterministico, il Doctest Gate sui Markdown e i test su socket TCP reali di Mission Control:
```bash
./ecosystem test
```

### 2. Multi-Node Chaos Sync Test (@linus & @carmack):
Simula scritture concorrenti caotiche da 4 nodi (3 Mac + 1 PC Windows) verificando assenza di file duplici `(1).jsonl`, idempotenza SHA-256 e mascheramento PII in < 30ms:
```bash
./ecosystem chaos
```

### 2. Diagnostica Profonda d'Ambiente Doctor (@linus):
Verifica esaustiva dei requisiti di sistema su macOS e Windows 11 (Python 3.10+, Node.js 18+, Docker daemon, Git leaks, symlinks e memoria Google Drive):
```bash
./ecosystem doctor
```

### 3. Report Token Economics & Model Tiering (@andrej & @linus):
Visualizza la matrice dei 4 Tier, i preset di Thinking Budget (0 / 2k / 8k) e la quantificazione del risparmio Prompt Caching (-75% / -80% sui Canoni):
```bash
./ecosystem tokens
```

### 4. Offline Eval Runner Deterministico (@carmack & @andrej):
Esegue in ~5ms la validazione offline a zero token: Schema Compliance (100%), Grounding Recall (100%) e Attack Success Rate ASR (0.0%):
```bash
./ecosystem eval
```

### 5. Context Caching Manager per Google Gemini (@andrej):
Compila e governa il bundle immutabile `portable/system_context_v5.json` e genera il payload REST per `cachedContents.create`:
```bash
./ecosystem cache status
./ecosystem cache build
./ecosystem cache export-api
```

### 6. Diagnostica Rapida & Stato Server (@linus):
Verifica rapida dei runtime, stato Git e probe del server Mission Control sulla porta 8787:
```bash
./ecosystem status
```

### 7. Sincronizzare la Memoria con Google Drive & Scrubbing PII (@dpo & @taylor):
```bash
./ecosystem memory
```

### 8. Eseguire l'Allineamento della Postazione Locale (@linus):
- **Tramite CLI universale**: `./ecosystem sync`
- **Su macOS diretto**: `./scripts/sync.sh`
- **Su Windows 11 diretto**: `pwsh -File .\scripts\sync.ps1`

### 9. Avviare Mission Control Live Server (@mitnick & @steve):
- **Modalità sicura su Loopback (default 127.0.0.1)**: `./ecosystem start` (oppure `./scripts/start_mission_control.sh`)
- **Modalità LAN (Wi-Fi locale con token)**: `./ecosystem start --lan` (oppure `./scripts/start_mission_control.sh --lan`)
- **Health check & probe diagnostico**: `./scripts/check_mission_control.sh`
- **Guida Operativa di Produzione**: [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) (Docker, Systemd, Launchd, Nginx, Caddy, SSL/TLS)

### 4. Avviare lo Stack Docker di Produzione:
```bash
cd infrastructure && docker compose up -d
```
*(Per includere opzionalmente anche Mission Control in Docker senza alterare lo stack Laravel)*:
```bash
MISSION_CONTROL_TOKEN="scegli-un-token-sicuro" docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.mission-control.yml up -d mission-control
```

---

## 💡 Come impostare questo Workspace in Antigravity

Per permettere ad Antigravity di avere sempre visibilità diretta su questo progetto:
1. In Antigravity, seleziona la cartella del progetto:
   `/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem`
2. Impostala come **Active Workspace** (o apri la cartella tramite *File ➔ Open Folder*).
3. Da quel momento, tutti gli strumenti, file di configurazione, backend e documentazione saranno nel tuo contesto immediato.
