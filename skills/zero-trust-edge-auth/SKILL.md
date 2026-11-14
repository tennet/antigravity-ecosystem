---
name: zero-trust-edge-auth
description: Implementazione e verifica sicura di Cloudflare Access Zero Trust e reverse proxy auth: validazione crittografica JWT/JWKS (RS256, aud, iss, exp), Origin Pulls, divieto secret in query string e fail-closed.
---

# Zero Trust Edge Auth (Cloudflare Access & Proxy)

## 1. Regole Obbligatorie di Verifica
1. **Mai fidarsi del solo header email**: `Cf-Access-Authenticated-User-Email` o `X-Forwarded-User` possono essere spoofati se l'origin è raggiungibile direttamente.
2. **Verifica Crittografica JWT/JWKS**:
   - Leggi `Cf-Access-Jwt-Assertion` (o cookie `CF_Authorization`).
   - Scarica e metti in cache le chiavi pubbliche JWKS del team (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`).
   - Verifica firma RS256, `iss` (team domain atteso), `aud` (Application Audience Tag atteso), `exp` e `nbf`.
3. **Origin Protection**: abbina Cloudflare Authenticated Origin Pulls (mTLS) o firewall/Cloudflare Tunnel per bloccare traffico diretto verso l'IP origin.

## 2. Divieti Assoluti (Fail-Closed)
- **Zero token in Query String**: mai accettare `?cf_key=` o `?token=` nell'URL (leak in log accessi, browser history e `Referer`).
- **Fail-Closed per Configurazione**: se `CLOUDFLARE_ACCESS_STRICT` o `CLOUDFLARE_ACCESS_AUD` / `SECRET` mancano fuori da `local`/`testing`, restituisci **HTTP 403/500** — **mai** entrare in `development_bypass`.
- Se `$allowedDomains` / `$allowedEmails` è vuoto, nega di default (non autorizzare tutti i domini).
