---
name: laravel-boost-and-best-practices
description: Guida operativa per applicazioni Laravel 11-13 su PHP 8.4 con PostgreSQL 16, MySQL 8.4 o SQLite WAL, inclusa integrazione Laravel Boost MCP (boost.json, search-docs, database-schema, pint --dirty). Attivare su qualsiasi progetto Laravel.
---

# Laravel Boost & Production Best Practices

## 1. Pre-Flight & Rilevamento
1. Verifica `composer.json` (anche in sottocartelle come `src_laravel/` o `backend/`), `.env.example` e `config/database.php` per identificare versione Laravel/PHP e driver reale (`mysql`, `pgsql`, `sqlite`).
2. Se è presente `boost.json`:
   - Usa gli strumenti MCP di Boost (`database-schema`, `database-query`, `search-docs`, `get-absolute-url`) prima di leggere file o lanciare query ad-hoc.
   - Verifica esistenza reale dei file di regole prima di citarli (es. non assumere `.ai/rules/index.md` se non esiste).

## 2. Standard PHP 8.4 & Architettura Laravel
- Usa `php artisan make:... --no-interaction`, `Model::casts()`, type hint espliciti, constructor property promotion e PHP 8.4 Property Hooks **solo su DTO/Value Objects** (mai direttamente su attributi di Model Eloquent).
- Isola logica di business complessa in `app/Actions/`, validazione in `FormRequest`, serializzazione in `JsonResource`.
- Evita `->get()` non paginati su tabelle ampie: usa `->chunkById()`, `->lazy()` o `cursorPaginate()` con colonna univoca di spareggio (`->orderBy('id')`).
- Imponi `Model::preventLazyLoading(!app()->isProduction())` in sviluppo/test.

## 3. Persistenza Multi-Engine
- **MySQL 8.4**: zero `lockForUpdate()` su record inesistenti (Gap Lock); usa upsert/catch SQLSTATE `23000` + backoff/jitter; online DDL con `lock_wait_timeout = 5`.
- **PostgreSQL 16**: usa `INSERT ... ON CONFLICT`; attenzione a non affidarsi ciecamente a test SQLite `:memory:` per vincoli/tipi specifici Postgres.
- **SQLite 3**: attiva `PRAGMA journal_mode=WAL`, `synchronous=NORMAL` e `busy_timeout >= 5000`.

## 4. Chiusura
- Formatta i file modificati con `./vendor/bin/pint --dirty` (se `laravel/pint` è presente) ed esegui la suite PHPUnit/Pest.
