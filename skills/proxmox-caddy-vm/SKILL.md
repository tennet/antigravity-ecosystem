---
name: proxmox-caddy-vm
description: Provisioning e hardening di VM Debian 12 su Proxmox VE KVM con doppio disco OS/Dati via UUID, UFW, fail2ban, Docker data-root su /mnt/data e reverse proxy Caddy 2 con HTTP/3.
---

# Proxmox Debian 12 VM & Caddy 2

## 1. Provisioning VM & Storage
1. Verifica i device a blocchi reali prima di partizionare (nessun fallback distruttivo hardcoded su `/dev/sdb` se il probe fallisce).
2. Separa il disco OS dal disco Dati (`ext4` GPT montato in `/mnt/data` tramite `UUID=` in `/etc/fstab` con opzioni `noatime`).
3. Installa `qemu-guest-agent`, attiva `unattended-upgrades`, configura `ufw` (solo porte necessarie: 22/80/443 TCP+UDP) e `fail2ban` su SSH.
4. Configura Docker (`/etc/docker/daemon.json`) con `"data-root": "/mnt/data/docker"` e log rotation (`max-size`, `max-file`).

## 2. Caddy 2 & Compose Produzione
- In `compose.prod.yaml` per Caddy:
  - Esponi **sempre** `"443:443/tcp"` **e** `"443:443/udp"` (HTTP/3 QUIC).
  - Definisci `healthcheck` sia su `caddy` sia su tutti i container applicativi.
  - Non usare password di fallback `:-...` (usa `${VAR:?Error}`).
- Nel `Caddyfile`: imposta security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS solo se TLS attivo) e `encode zstd gzip`.
