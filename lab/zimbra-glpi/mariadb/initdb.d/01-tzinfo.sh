#!/bin/sh
set -e
echo "==> [MariaDB INIT] Caricamento tabelle Timezone per GLPI..."
mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root -p"${MARIADB_ROOT_PASSWORD}" mysql || true
echo "==> [MariaDB INIT] Tabelle Timezone caricate con successo."
