---
name: stackcp-shared-hosting
description: Operatività e hardening per Shared Hosting Apache StackCP: profilo SEC-01 Anti-PHP2Shell (.htaccess), quarantena upload, CLI /usr/bin/php84, limite 1 sessione SSH e deploy SCP con backup e rollback.
---

# StackCP Shared Hosting (Apache + PHP 8.4 + SCP)

## 1. Profilo di Sicurezza SEC-01 (Anti-PHP2Shell)
1. **`.htaccess` Hardening**: blocca richieste HTTP dirette a `.php`, `.phtml`, `.phar`, `.cgi`, `.py`, `.sh` (eccetto `/index.php`) con `HTTP 403 Forbidden`, più blocco dotfiles (`.env`, `.git`).
2. **Quarantena Upload**: salva qualsiasi file caricato **fuori dalla webroot** (`storage/app/...`), rinominato via hash SHA-256 (senza estensione eseguibile), con permessi `0600` (`chmod -x`) e validazione **MIME/magic-bytes (`finfo`)** oltre ai limiti anti zip-bomb per `.docx`.

## 2. Vincoli Runtime & SSH StackCP
- Specifica in `.htaccess`: `AddHandler x-httpd-php84 .php`.
- In CLI, cron e script remoti invoca **sempre `/usr/bin/php84`** (mai `/usr/bin/php` generico o vecchio `php83`).
- Rispetta il limite di **1 sola sessione SSH concorrente** inserendo pause (`sleep 2-3`) tra chiamate SSH/SCP sequenziali ed evitando flag `StrictHostKeyChecking=accept-new` non verificati in produzione.

## 3. Deploy Sicuro con Backup & Verifica Fail-Fast
- Prima di estrarre il tarball in `public_html`, crea sempre un backup remoto della release precedente (`tar -czf backup_<ts>.tar.gz ...`) per consentire rollback immediato.
- Verifica l'endpoint `/salute` con `curl -fsS --max-time 10` **senza `|| true`**: in caso di HTTP != 200 o mismatch, fallisci rumorosamente e ripristina il backup.
