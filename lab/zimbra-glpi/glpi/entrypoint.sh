#!/bin/bash
set -euo pipefail

echo "==> [GLPI INIT] Controllo permessi su cartelle di configurazione e file..."
mkdir -p /var/www/html/glpi/config /var/www/html/glpi/files /var/www/html/glpi/marketplace
chown -R www-data:www-data /var/www/html/glpi/config /var/www/html/glpi/files /var/www/html/glpi/marketplace

# Configurazione del cron daemon per il Mailgate di GLPI (esecuzione automatica ogni 1 minuto)
echo "==> [GLPI INIT] Configurazione Cron CLI per GLPI Mailgate..."
echo "* * * * * www-data /usr/local/bin/php /var/www/html/glpi/front/cron.php --force=1 > /dev/null 2>&1" > /etc/cron.d/glpi-mailgate
chmod 0644 /etc/cron.d/glpi-mailgate
crontab /etc/cron.d/glpi-mailgate

echo "==> [GLPI INIT] Avvio del demone cron in background..."
cron

echo "==> [GLPI INIT] Avvio web server..."
exec "$@"
