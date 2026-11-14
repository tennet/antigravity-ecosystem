# 🧩 Catalogo Skill Operative — Antigravity Ecosystem (v4.1.0)

Questo catalogo centralizza le **14 Skill reali** emerse dall'evoluzione dei progetti (`antigravity-ecosystem`, `fenice confpd`, `osservatorio-francescon`, `visability`) per evitare di sovraccaricare il contesto globale degli agenti.

## 1. Architettura a 3 Livelli

1. **Global Core Skills**: solo le skill trasversali sempre utili (`sviluppo-completo`, `automated-tdd-workflow`, `security-and-code-review`, `docker-ops`, `github-workflow`, `accidental-data-loss-prevention`, `managing-python-dependencies`).
2. **Tech Skill Packs On-Demand** *(questa directory)*: caricate dal contesto quando il progetto utilizza il relativo stack.
3. **Pack Opzionali Archiviati (`gcp-data-pack`)**: le ~18 skill Google Cloud Data Platform (`bigquery-*`, `gcp-spark*`, `gcp-dataflow`, `dbt-bigquery`, `dataform-bigquery`, `notebook-guidance`, ecc.) vanno spostate in `~/.gemini/config/skills-packs/gcp-data-pack/` per liberare token nei progetti locali non-GCP.

## 2. Mappa delle 14 Skill

| Skill | Dominio | Quando attivarla |
| :--- | :--- | :--- |
| [`creative-ui-art-direction`](creative-ui-art-direction/SKILL.md) | UI/UX & Art Direction | `@steve`, direzione artistica multi-stile, tipografia, OKLCH, SVG/Motion, `image-generator` & `browser` |
| [`laravel-boost-and-best-practices`](laravel-boost-and-best-practices/SKILL.md) | Backend Laravel | Laravel 11–13, PHP 8.4, Postgres 16 / SQLite WAL, Boost MCP (`boost.json`) |
| [`laravel-blade-tailwind-v4`](laravel-blade-tailwind-v4/SKILL.md) | Frontend Blade | Blade + Tailwind v4 (`@tailwindcss/vite`), Vite 8, Light/Dark, PWA, `@media print` |
| [`laravel-testing-standards`](laravel-testing-standards/SKILL.md) | QA & Testing | PHPUnit/Pest (`preventStrayRequests`), `node:test` SSE, `unittest`/`pytest` |
| [`laravel-cloud-ops`](laravel-cloud-ops/SKILL.md) | Cloud PaaS | Deploy su Laravel Cloud, filesystem effimero, dual-bucket Cloudflare R2 |
| [`ai-llm-integration-evals-and-security`](ai-llm-integration-evals-and-security/SKILL.md) | AI / LLM | Adapter multi-provider, code asincrone, fallback espliciti, evals & OWASP LLM |
| [`dirty-data-etl-and-scraping`](dirty-data-etl-and-scraping/SKILL.md) | ETL & Scraping | CSV/XLSX `cp1252`, `Decimal`, `source_hash`, scraping anti-SSRF & code `flock` |
| [`proxmox-caddy-vm`](proxmox-caddy-vm/SKILL.md) | Infra VM | Proxmox KVM Debian 12 dual-disk UUID, `ufw`/`fail2ban`, Caddy 2 HTTP/3 |
| [`stackcp-shared-hosting`](stackcp-shared-hosting/SKILL.md) | Hosting Condiviso | StackCP Apache `.htaccess` SEC-01, `/usr/bin/php84`, 1-SSH, SCP con rollback |
| [`zero-trust-edge-auth`](zero-trust-edge-auth/SKILL.md) | Edge Security | Cloudflare Access JWT/JWKS, Origin Pulls, middleware fail-closed |
| [`standalone-interactive-html`](standalone-interactive-html/SKILL.md) | UI Standalone | HTML single-file 2.5D/showcase offline, CSP SHA-256, `data-action`, plain-language |
| [`nodejs-zero-dep-server`](nodejs-zero-dep-server/SKILL.md) | Node Runtime | Server ESM `.mjs` zero-dipendenze, SSE cap/heartbeat, `timingSafeEqual` |
| [`docs-doctest-and-context-sync`](docs-doctest-and-context-sync/SKILL.md) | Documentazione | Doctest runner, sync `AGENTS.md` ↔ `CLAUDE.md`, ADR 2-livelli, `unify_memory.py` |
| [`gdpr-evidence-compliance`](gdpr-evidence-compliance/SKILL.md) | Legal / GDPR | DPIA operativa, retention, minimizzazione, livelli probatori eIDAS/CAD E0–E3 |
