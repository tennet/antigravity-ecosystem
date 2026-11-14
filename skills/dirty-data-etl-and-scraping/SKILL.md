---
name: dirty-data-etl-and-scraping
description: Pipeline di ingestion ETL su esportazioni sporche (CSV cp1252, XLSX, decimali italiani, duplicati) e web scraping difensivo (anti-SSRF IPv4/IPv6, TOCTOU, code flock su hosting condiviso).
---

# Dirty Data ETL & Defensive Scraping

## 1. Ingestion CSV/XLSX Sporchi (Esportazioni Gestionali)
1. **Rilevamento Encoding Full-Stream**: non fermare lo sniffing `utf-8-sig`/`cp1252` ai primi 128 KB; gestisci decode incrementale o fallback per riga registrato in diagnostica.
2. **Aritmetica Esatta**: converti tutti gli importi in `Decimal` passando da stringa normalizzata (mai `float` intermedi); gestisci segni contabili a destra (`10,50-`), parentesi `(1.234,56)`, spazi NBSP (`\u00a0`) e token nulli (`N/D`).
3. **Raw Staging & Idempotenza**: calcola `source_hash` (SHA-256 sul file grezzo), conserva le righe con errori in `ImportDiagnostics` (`invalid_amount_rows`, `incomplete_client_rows`) distinguendo warning da errori bloccanti (`has_blocking_errors`).
4. **Duplicati & Segni Contabili**: non deduplicare mai automaticamente righe identiche senza regola di dominio approvata; preserva il segno originale nei controlli di quadratura (attenzione a `abs()` su note di credito).

## 2. Web Scraping & Fonti Istituzionali
- **Anti-SSRF Completo**: risolvi record `A` **e `AAAA`** (bloccando `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`), disabilita i redirect automatici verso IP privati ed effettua socket pinning contro DNS rebinding (TOCTOU).
- **Code File-Based su Shared Hosting**: quando FPM blocca `execve` verso Python/scraper, accoda in JSON protetto da `flock(..., LOCK_EX)` per consumo da worker cron CLI.
- **Parser Resilienti**: preferisci parsing DOM strutturato rispetto a regex fragili su HTML.
