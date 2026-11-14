---
name: docs-doctest-and-context-sync
description: Verifica automatica della documentazione (Doctest Gate), allineamento Single Source tra AGENTS.md e CLAUDE.md, ADR/DECISION_LOG a due livelli e gestione memoria persistente cross-device (unify_memory.py e MCP memory).
---

# Docs Doctest & Project Context Sync

## 1. Doctest & Integrity Gate
1. Esegui `python3 scripts/doctest_docs.py` (o equivalente di repo) prima di chiudere Fase 5:
   - Verifica che tutti i link relativi, `file://` locali e riferimenti `@...` puntino a file realmente esistenti.
   - Esegui syntax check dei blocchi fenced (`bash -n`, `json.loads`, `python3 -m py_compile` / `ast.parse`, `php -l` se disponibile).
   - Verifica parità di versione e stack tra `README.md`, `VADEMECUM.md`, `AGENTS.md`, `plugin.json`, `composer.json` e `package.json`.

## 2. Single Source `AGENTS.md` ↔ `CLAUDE.md`
- Mantieni `AGENTS.md` come riferimento canonico del progetto.
- Se il repo usa tool che scrivono `CLAUDE.md` (es. Laravel Boost), preserva le sezioni generate (`<laravel-boost-guidelines>`) e sincronizza `AGENTS.md` eliminando istruzioni bootstrap obsolete.
- Non citare mai file di regole non verificati (es. `@.ai/rules/index.md` se assente).

## 3. ADR a 2 Livelli & Confine Memoria
- Usa `DECISION_LOG.md` come indice tabellare compatto + schede ADR (contesto, alternative valutate, motivazione) per decisioni permanenti/bloccanti.
- Mantieni in Git i vincoli tecnici di progetto; usa `unify_memory.py` (con `ANTIGRAVITY_NODE_ID` e `--project` opzionale) e MCP `memory` per preferenze utente trasversali.
