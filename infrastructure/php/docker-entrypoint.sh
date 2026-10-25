#!/bin/sh
# ==============================================================================
# docker-entrypoint.sh - Safe Non-Root Privilege Drop Initialization
# DevOps & Infrastructure Sage (v3.0.0)
# ==============================================================================
set -e

# Defaults if not provided in environment
APP_USER=${APP_USER:-appuser}

# Ensure storage and bootstrap cache directories exist
mkdir -p /var/www/html/storage/framework/cache/data \
         /var/www/html/storage/framework/sessions \
         /var/www/html/storage/framework/views \
         /var/www/html/storage/logs \
         /var/www/html/bootstrap/cache 2>/dev/null || true

# Harmonize ownership and permissions across mounted volumes
chown -R ${APP_USER}:${APP_USER} /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true

# Execute CMD passed by Dockerfile dropped down to unprivileged APP_USER
exec su-exec ${APP_USER} "$@"
