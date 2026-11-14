# 📚 Tomo della Saggezza Ingegneristica (Engineering Canon Index v4.1.0)

> **Plugin**: `engineering-team` (v4.1.0)  
> **Autore**: Manuele Francescon ([@tennet](https://github.com/tennet))  
> **Scopo**: Raccolta sistematica dei distillati operativi estratti dalla letteratura fondamentale e dall'esperienza sul campo dei progetti reali, integrata nei riflessi decisionali dei 12 subagenti Core Antigravity.

---

## 🏛️ I 12 Volumi del Canone Ingegneristico

| N. | Modulo di Riferimento | Subagente Custode | Ambito & Riferimenti Principali |
| :---: | :--- | :--- | :--- |
| **01** | [`01_software_architecture_canon.md`](01_software_architecture_canon.md) | `software-architect` (`@werner`) | Kleppmann, Richards, Hohpe + Edge Zero Trust, Dual-Stack, Raw Staging ETL, SSE/Streaming. |
| **02** | [`02_database_and_backend_canon.md`](02_database_and_backend_canon.md) | `polyglot-backend-sage` (`@taylor`) | Petrov, Botros, Stauffer, Evans + PostgreSQL 16, SQLite WAL, Laravel Boost, Node ESM & Python stdlib. |
| **03** | [`03_devops_and_reliability_canon.md`](03_devops_and_reliability_canon.md) | `devops-infra-sage` (`@linus`) | Google SRE, Poulton, Nygard + Proxmox/Caddy, Shared Hosting StackCP Apache, Laravel Cloud, Daemon Node.js. |
| **04** | [`04_ui_ux_design_canon.md`](04_ui_ux_design_canon.md) | `ui-ux-designer` (`@steve`) | Wathan & Schoger, Krug, Geist/Linear + Dual-Theme (Dark & Light PMI), Blade + Tailwind v4, Standalone HTML CSP & `@media print`. |
| **05** | [`05_qa_and_defect_prevention_canon.md`](05_qa_and_defect_prevention_canon.md) | `qa-engineer` (`@carmack`) | Feathers, Beck, Fowler + Data Ingestion QA, Zero-Network AI Mocking (`preventStrayRequests`), Benchmark Gates, `node:test` SSE. |
| **06** | [`06_integration_and_resilience_canon.md`](06_integration_and_resilience_canon.md) | `integration-tester` (`@rauch`) | Nygard, Newman, Fowler + Resilienza LLM, SSE Reverse Proxy, ETL `source_hash`, Scraping & Edge Auth. |
| **07** | [`07_adversarial_security_canon.md`](07_adversarial_security_canon.md) | `security-auditor` (`@geohot`) | Zalewski, Shostack, OWASP Web & LLM Top 10 + Cloudflare JWT/JWKS, SSRF IPv6, Upload Magic-Bytes, Anti-Stub Hooks. |
| **08** | [`08_technical_documentation_canon.md`](08_technical_documentation_canon.md) | `documentation-engineer` (`@guido`) | Bhatti, Procida (*Diátaxis*), Keep a Changelog + Single Source `AGENTS.md`/`CLAUDE.md`, ADR a 2 livelli, Doctest Gate. |
| **09** | [`09_engineering_orchestration_canon.md`](09_engineering_orchestration_canon.md) | `project-orchestrator` (`@turing`) | Forsgren (*Accelerate*), Skelton & Pais (*Team Topologies*) + Governance a 3 Livelli (Core, Skill Packs, Domain Packs). |
| **10** | [`10_ai_systems_and_evals_canon.md`](10_ai_systems_and_evals_canon.md) | `ai-systems-engineer` (`@andrej` / `@karpathy`) | Provider Factory AI/LLM, Ecosistema Google Gemini (Argon, Pro, Flash, Deep Research, NotebookLM, Antigravity, Jules), job asincroni, rilevazione schema drift & offline eval harness. |
| **11** | [`11_privacy_gdpr_and_evidence_canon.md`](11_privacy_gdpr_and_evidence_canon.md) | `privacy-compliance-counsel` (`@dpo`) | GDPR art. 5/6/28/35, separazione sintetico/reale, minimizzazione, eIDAS/CAD/AgID livelli probatori E0–E3. |
| **12** | [`12_red_team_and_ethical_hacking_canon.md`](12_red_team_and_ethical_hacking_canon.md) | `ethical-hacker-redteam` (`@mitnick`) | White-hat reconnaissance non distruttiva su porte, webroot, auth bypass, SSRF e social vectors con `@linus` e `@geohot`. |

---

## 🧭 Istruzioni per l'Uso & Context Economy

- I volumi del Canone **non vanno precaricati tutti in blocco**: ogni agente consulta il proprio volume di riferimento (e solo i volumi di interfaccia pertinenti al task) in Fase 2 e Fase 4.
- Le procedure operative dettagliate per stack specifici risiedono nelle **Skill on-demand** (`skills/`) caricate solo quando il repository target usa quello stack.
- I ruoli specialistici verticali di singolo cliente/settore (es. Il Tridente `@pacioli`, `@biagi`, `@munari` di `fenice confpd`) restano **Project Domain Packs locali** al workspace interessato.
