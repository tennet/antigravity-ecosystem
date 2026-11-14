---
name: nodejs-zero-dep-server
description: Sviluppo e testing di server Node.js ESM (.mjs) zero-dipendenze con node:http, SSE live streaming, auth fail-closed, protezione symlink e suite node:test su socket reali.
---

# Node.js ESM Zero-Dependency Server & SSE

## 1. Server HTTP & Sicurezza
1. Usa solo moduli nativi (`node:http`, `node:fs`, `node:crypto`, `node:path`, `node:test`).
2. **Auth Fail-Closed**: confronto token con `crypto.timingSafeEqual`, cookie `HttpOnly; SameSite=Strict` (e `Secure` dietro TLS), zero token nei parametri URL.
3. **Filesystem Sicuro**: prima di leggere log o transcript, verifica `lstatSync` (anti-symlink) e `realpathSync` confinato alla directory consentita; applica tail-read limitato (es. 256 KB) e redazione segreti/token.
4. **Errori RFC 7807**: restituisci `application/problem+json` senza stack trace interni.

## 2. SSE Long-Lived & Proxy
- Imposta header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
- Implementa cap connessioni globali (`MAX_SSE_GLOBAL` -> `503`) e per IP (`MAX_SSE_PER_IP` -> `429`), cleanup garantito su eventi `close`/`error` del socket, heartbeat `:ping` periodico (es. 15s) e supporto `Last-Event-ID`.
- Attenzione a `server.requestTimeout`: non far terminare gli stream SSE attivi; gestisci shutdown pulito su `SIGINT`/`SIGTERM`.
- Dietro Nginx imposta sempre `proxy_buffering off;` e `proxy_read_timeout 3600s;`.

## 3. Testing con `node:test`
- Oltre ai test unitari su `dispatchRequest`, includi test su socket TCP reale (`server.listen(0, '127.0.0.1')`) per verificare cap SSE, cleanup `ssePerIp`, heartbeat e rate limiter.
