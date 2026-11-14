---
name: laravel-cloud-ops
description: Deploy e operatività su Laravel Cloud (PaaS): filesystem effimero, Object Storage dual-bucket su Cloudflare R2, Managed Queues, Secrets Manager e CLI cloud non interattiva.
---

# Laravel Cloud Operations (PaaS & Cloudflare R2)

## 1. Regole del Filesystem Effimero
- Su Laravel Cloud ogni replica ha filesystem locale effimero e non condiviso tra deploy/worker:
  - **Vietato** scrivere upload permanenti, SQLite di produzione o cache locali su `storage/app`.
  - **Vietato** inserire `php artisan storage:link`, `optimize:clear` o `queue:restart` nei build/deploy commands.
  - Per le migrazioni sicure in deploy usa `php artisan migrate --isolated --force`.

## 2. Object Storage su Cloudflare R2 (Dual-Bucket)
- Configura **due bucket separati**:
  - `default` (privato, per documenti/fatture/export tramite URL firmati temporanei);
  - `public` (asset pubblici serviti via CDN/custom domain).
- R2 non supporta ACL per singolo oggetto (`visibility` per file): usa bucket distinti.

## 3. CLI Non-Interattiva & Risorse Managed
- Usa sempre `./vendor/bin/cloud` (o `cloud`) con flag `-n` (`--no-interaction`) e `--json` per automazioni verificabili (`cloud deploy:monitor -n`).
- Usa Managed Queues (`aws/aws-sdk-php` per SQS gestito) e configura le chiavi AI/Cloudflare esclusivamente nel Secrets Manager cifrato di Laravel Cloud (mai nei file `.env` committati).
