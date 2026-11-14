# Guida Operativa di Produzione: Antigravity Mission Control

> **Canone di Documentazione & Manutenibilità (v4.1.0)**  
> Architettura zero-dipendenze, monitoraggio real-time Server-Sent Events (SSE), telemetria sanitizzata e deployment multi-piattaforma (Docker, Linux Systemd, macOS Launchd, Nginx & Caddy).

---

## 1. Panoramica dell'Architettura di Produzione

Antigravity Mission Control è il centro di osservabilità e comando dell'ecosistema ingegneristico Antigravity. È progettato secondo i principi di **zero dipendenze esterne** (solo moduli core `node:*`), **fail-closed security** e **isolamento a privilegi minimi**.

```
                           +-------------------------------------------------+
                           |        Client Web / Browser Operatore          |
                           |   (Desktop 1440x900, Tablet, Mobile PWA)        |
                           +-------------------------------------------------+
                                                   |
                                            HTTPS / WSS (opz.)
                                                   v
                           +-------------------------------------------------+
                           |     Reverse Proxy (Nginx / Caddy 2 con TLS)     |
                           |      - Proxy buffering disabilitato (SSE)       |
                           |      - Hardened Headers (CSP, HSTS, nosniff)    |
                           +-------------------------------------------------+
                                                   |
                                            HTTP Loopback / LAN
                                                   v
+-----------------------------------------------------------------------------------------------+
| Container Docker / Servizio Systemd / Demone Launchd (Porta 8787)                             |
|                                                                                               |
|  [ mission_control_server.mjs ]                                                              |
|   ├── GET /          -> docs/mission_control.html (CSP SHA-256 inlined, zero-CDN, offline)   |
|   ├── GET /healthz   -> RFC 200 OK Probe (uptime, memory_rss, active_sse, brain_readable)   |
|   ├── GET /api/stream-> SSE Stream unbuffered (push automatico 450ms o su fs.watch)          |
|   └── POST /api/auth-cookie -> Scambio Bearer -> HttpOnly SameSite=Strict cookie              |
|                                                                                               |
|  [ antigravity_reader.mjs ]                                                                   |
|   └── Lettura Read-Only & Sanitizzata -> ~/.gemini/antigravity/brain                          |
|        (Redazione automatica Bearer, Token, JWT, percorsi utente, PII)                       |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Modalità di Messa in Produzione

### Modalità A: Container Docker Multi-Arch (Consigliata)

Mission Control include un `Dockerfile.mission-control` multi-stage basato su `node:22-alpine` con utente non-root dedicato (`UID 10001:10001`) e filesystem di root in sola lettura (`read_only: true`).

#### 1. Avvio Standalone
```bash
# Imposta il token di autenticazione LAN prima del lancio
export MISSION_CONTROL_TOKEN="TuoTokenSicuroAlmeno16Caratteri_12345"

# Avvia il container in background
docker compose -f infrastructure/docker-compose.mission-control.yml up -d --build
```

#### 2. Avvio Combinato con lo Stack di Produzione (MySQL + PHP + Nginx)
Se nel server è presente anche lo stack applicativo:
```bash
docker compose \
  -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.mission-control.yml \
  up -d mission-control
```

#### 3. Verifica Stato e Log del Container
```bash
docker compose -f infrastructure/docker-compose.mission-control.yml ps
docker compose -f infrastructure/docker-compose.mission-control.yml logs -f mission-control
```

---

### Modalità B: Servizio Systemd su Linux (Debian, Ubuntu, RHEL)

Per server fisici o macchine virtuali Linux dedicate (es. Proxmox, AWS EC2, Hetzner):

#### 1. Installazione e Permessi
```bash
# Crea l'utente di sistema a privilegi minimi
sudo useradd -r -s /bin/false -d /opt/antigravity-ecosystem antigravity

# Copia i file di progetto nella directory di destinazione
sudo mkdir -p /opt/antigravity-ecosystem /etc/antigravity /var/lib/antigravity/brain
sudo cp -r server docs scripts /opt/antigravity-ecosystem/
sudo chown -R antigravity:antigravity /opt/antigravity-ecosystem /var/lib/antigravity
```

#### 2. Configurazione Environment File
Crea `/etc/antigravity/mission-control.env` con permessi ristretti (`600`):
```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
ANTIGRAVITY_BRAIN_DIR=/var/lib/antigravity/brain
MISSION_CONTROL_TOKEN=TuoTokenSicuroAlmeno16Caratteri_12345
```
```bash
sudo chmod 600 /etc/antigravity/mission-control.env
```

#### 3. Abilitazione e Avvio del Servizio Systemd
```bash
sudo cp infrastructure/systemd/antigravity-mission-control.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now antigravity-mission-control
sudo systemctl status antigravity-mission-control
```

---

### Modalità C: Demone Launchd su macOS

Per eseguire Mission Control costantemente in background su una workstation macOS aziendale:

#### 1. Configurazione del file Launchd
```bash
cp infrastructure/launchd/com.antigravity.mission-control.plist ~/Library/LaunchAgents/
```

#### 2. Caricamento del Servizio
```bash
launchctl load ~/Library/LaunchAgents/com.antigravity.mission-control.plist
launchctl start com.antigravity.mission-control
```

#### 3. Ispezione dei Log
```bash
tail -f /tmp/antigravity_mission_control.stdout.log
tail -f /tmp/antigravity_mission_control.stderr.log
```

---

## 3. Reverse Proxy Hardening & SSL/TLS

Per esporre Mission Control su dominio aziendale con certificato HTTPS, è **fondamentale** disabilitare il buffering del reverse proxy per consentire il corretto passaggio degli eventi Server-Sent Events (SSE).

### Configurazione Nginx
Utilizza il template presente in `infrastructure/nginx/mission-control.conf.example`:

```nginx
server {
    listen 443 ssl http2;
    server_name monitor.tuodominio.it;

    ssl_certificate     /etc/ssl/certs/monitor.crt;
    ssl_certificate_key /etc/ssl/private/monitor.key;

    # Intestazioni di Sicurezza OWASP
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;

        # FONDAMENTALE PER SERVER-SENT EVENTS (SSE):
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }
}
```

### Configurazione Caddy 2
Utilizza il template presente in `infrastructure/caddy/Caddyfile.mission-control`:

```caddy
monitor.tuodominio.it {
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }

    reverse_proxy 127.0.0.1:8787 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # Streaming istantaneo senza buffer
        flush_interval -1
    }
}
```

---

## 4. Variabili d'Ambiente e Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `HOST` | `0.0.0.0` | Indirizzo IP di bind (`127.0.0.1` per loopback, `0.0.0.0` per LAN/Docker). |
| `PORT` | `8787` | Porta TCP di ascolto del servizio. |
| `NODE_ENV` | `development` | In `production`, richiede esplicitamente `MISSION_CONTROL_TOKEN` su LAN. |
| `ANTIGRAVITY_BRAIN_DIR` | `~/.gemini/antigravity/brain` | Percorso della cartella contenente i log e le sessioni di Antigravity. |
| `MISSION_CONTROL_TOKEN` | *(auto-generato)* | Token segreto di accesso (minimo 16 caratteri) richiesto per bind non-loopback. |

---

## 5. Health Check, Diagnostica e Alerting

Il server espone l'endpoint pubblico `/healthz` conforme alle best practice IETF:

```bash
# Esecuzione del probe di diagnostica automatico
./scripts/check_mission_control.sh 127.0.0.1 8787
```

Risposta tipo (`application/json`):
```json
{
  "status": "ok",
  "health": "pass",
  "version": "v4.1.0",
  "uptime_s": 43200,
  "auth_required": true,
  "authRequired": true,
  "sse_clients": 2,
  "memory_rss_mb": 42,
  "brain_readable": true
}
```

- **In caso di monitoraggio Kubernetes/Uptime Kuma**: configurare HTTP GET su `/healthz` con codice atteso `200`.
- **In caso di disconnessione o restart**: il frontend `docs/mission_control.html` include riconnessione automatica con backoff e watchdog.

---

## 6. Sicurezza, Privacy e Conformità GDPR

1. **Nessun Child Process**: il server non invoca shell o sottoprocessi di sistema; impossibile sfruttare Remote Code Execution (RCE).
2. **Protezione Symlink**: traversal di directory bloccato su ogni segmento tramite `resolveSafeSubdir` e `fs.lstatSync`.
3. **Minimizzazione Dati & Sanitizzazione**: le informazioni inviate via SSE contengono esclusivamente metadati sanitizzati (alias agente, stato di avanzamento, tag fase, sintesi task troncata). Token Bearer, password, chiavi API e percorsi privati sono sempre sostituiti da placeholder `[REDACTED]`.
4. **Content Security Policy (CSP)**: `default-src 'none'`, stili e script vincolati ad hash SHA-256 univoco, zero inclusioni da CDN di terze parti.
