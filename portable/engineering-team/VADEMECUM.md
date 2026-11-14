# 🧭 Guida Semplice ad Antigravity (Vademecum Pratico v5.0.0)

> **Autore:** [Manuele Francescon](https://github.com/tennet)  
> **Versione:** 5.0.0 (Suite a 12 Specialisti Core + Master Blueprint v5.0 Token Economics & Context Caching)  
> Questa guida spiega **senza tecnicismi superflui** chi fa cosa nel tuo team Antigravity e cosa scrivere in chat per attivare subito la persona giusta.

---

## 👥 La Tua Squadra di 12 Specialisti (Nomi Canonici & Alias Rapidi)

| Alias Rapido | Ruolo Canonico | Quando chiamarlo | Esempio in chat |
| :---: | :--- | :--- | :--- |
| **`@turing`** | `project-orchestrator` | Per coordinare un nuovo progetto o una funzione complessa end-to-end. | `@turing coordina lo sviluppo del nuovo modulo` |
| **`@werner`** | `software-architect` | Per decidere l'architettura, i contratti API, i flussi dati e le scelte tecniche. | `@werner disegna l'architettura per questa funzione` |
| **`@taylor`** | `polyglot-backend-sage` | Per backend Laravel 13, PostgreSQL, MySQL, SQLite WAL, Python o server Node `.mjs`. | `@taylor implementa l'Action backend senza N+1` |
| **`@steve`** | `ui-ux-designer` | Per dashboard Dark Bento o portali Light chiari e stampabili (`@media print`, Tailwind v4). | `@steve progetta la dashboard Light accessibile` |
| **`@linus`** | `devops-infra-sage` | Per Docker, Proxmox/Caddy, hosting StackCP, Laravel Cloud e script Mac/Windows. | `@linus prepara il deploy sicuro con backup e rollback` |
| **`@mitnick`** | `ethical-hacker-redteam` | Con `@linus` e `@geohot`: cerca vulnerabilità reali su porte, webroot, script e login da ethical hacker. | `@mitnick controlla con @linus se ci sono porte o file esposti` |
| **`@andrej`** / **`@karpathy`** | `ai-systems-engineer` | Per integrare l'ecosistema Gemini (Argon, Pro, Flash, Deep Research, NotebookLM, Antigravity, Jules), evitare chiamate sincrone lente e misurare la qualità con eval. | `@andrej orchestra la pipeline Gemini con Deep Research ed eval` |
| **`@dpo`** | `privacy-compliance-counsel` | Prima di usare dati reali: GDPR, DPIA, testi legali e valore probatorio (`E0`–`E3`). | `@dpo verifica compliance GDPR e livello probatorio` |
| **`@carmack`** | `qa-engineer` | Per TDD, test su CSV sporchi, isolation guard HTTP e test di regressione. | `@carmack scrivi test boundary e blocca chiamate reali` |
| **`@rauch`** | `integration-tester` | Per testare flussi E2E, SSE in tempo reale, retry su LLM e scraping sicuro. | `@rauch collauda il flusso SSE e i retry su 429` |
| **`@geohot`** | `security-auditor` | Per audit spietato anti-vulnerabilità (JWKS Cloudflare, XSS LLM, SSRF, segreti). | `@geohot fai un audit avversariale prima del rilascio` |
| **`@guido`** | `documentation-engineer` | Per README, `AGENTS.md`, `DECISION_LOG.md`, changelog e controllo link/comandi (Doctest). | `@guido allinea AGENTS.md ed esegui il doctest` |

> [!TIP]
> **Specialisti di Dominio Locali (es. Il Tridente di Fenice)**:  
> Nei progetti verticali come `fenice confpd`, al team base si affiancano in locale **`@pacioli`** (contabilità/OIC), **`@biagi`** (lavoro/CCNL) e **`@munari`** (linguaggio semplice per clienti) senza appesantire gli altri progetti.

---

## 🧩 Come Funzionano le Skill On-Demand

Per non sprecare memoria di contesto:
- Le skill trasversali restano sempre pronte (es. workflow a 5 fasi, TDD, security review, Docker, Git).
- Le skill specialistiche vengono attivate **solo quando servono al progetto**: Laravel Boost/Cloud, Tailwind v4 + Blade, AI/LLM integration & security, ETL dati sporchi & scraping, Proxmox/Caddy, StackCP Apache, Cloudflare Zero Trust, Node.js zero-dipendenze, HTML standalone CSP, Doctest & GDPR.
- Le skill Google Cloud Data/BigQuery/Spark restano archiviate nel pack opzionale `gcp-data-pack`.

---

## 🚦 Come si Chiude Ogni Lavoro

1. Nessun agente dichiara "tutto ok" senza test eseguiti.
2. `@geohot`, `@carmack`, `@rauch` e (quando ci sono dati reali) `@dpo` emettono un verdetto esplicito (`[APPROVATO]`, `[APPROVATO CON RISERVA]`, `[APPROVATO SOLO PER AMBIENTE SINTETICO]` o `[RESPINTO]`).
3. Nessun `git commit` o `git push` viene eseguito senza il tuo consenso esplicito.
