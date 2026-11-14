---
name: laravel-testing-standards
description: Standard operativi per suite di test multi-runtime: PHPUnit/Pest con isolamento rete (Http::preventStrayRequests), Node.js node:test su socket HTTP/SSE reali, Python unittest/pytest per ingestion sporca e benchmark gate.
---

# Multi-Runtime Testing Standards (Laravel, Node, Python)

## 1. Laravel (PHPUnit / Pest)
1. **Zero-Network Rule**: imposta `Http::preventStrayRequests()` nel `setUp()` o in `TestCase` per tutti i test che toccano provider AI, webhook o API esterne. Usa `Http::fake()` con Golden JSON Fixtures.
2. **Tabelle di Decisione Deterministiche**: per motori di regole (bandi, scaglioni fiscali, compatibilità) usa `#[DataProvider]` coprendo tutti i casi `idoneo`, `attenzione`, `bloccante` e casi limite.
3. **Asserzioni & Sicurezza**: preferisci `assertSame` / `assertExactJson`; testa sempre isolamento cross-tenant (`403`/`404` su ID di altro tenant), rate limit (`429`) e validazione (`422`).
4. **Warning DB**: se i test usano SQLite `:memory:` ma la produzione usa PostgreSQL o MySQL, aggiungi test dedicati sui driver reali in CI per vincoli unici, lock e tipi JSON.

## 2. Node.js ESM (`node:test`)
- Affianca ai test in-memory (`dispatchRequest`) test reali su socket TCP effimero (`server.listen(0, '127.0.0.1')`):
  - verifica `MAX_SSE_GLOBAL` (`503`), `MAX_SSE_PER_IP` (`429`) e rilascio contatore alla chiusura socket;
  - verifica `Last-Event-ID`, frame `:ping` heartbeat e rate limiter.

## 3. Python (`unittest` / `pytest`) & Benchmark Gate
- Testa sempre CSV/XLSX corrotti, encoding misto `cp1252` **dopo** i primi 128 KB di file, decimali ambigui (`1.234,56`, `10,50-`, `N/D`), file 0-byte e note di credito.
- Gli script di benchmark devono verificare soglie esplicite (tempo, picco memoria RSS) ed uscire con `sys.exit(1)` in caso di regressione.
