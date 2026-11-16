FROM php:8.2-apache-bookworm

LABEL maintainer="Antigravity DevOps <linus@antigravity.team>"
LABEL description="GLPI 10 con estensioni IMAP/LDAP, Apache Hardened Webroot (public/) e Cron Mailgate"

ENV DEBIAN_FRONTEND=noninteractive
ENV GLPI_VERSION=10.0.17

# 1. Installazione dipendenze di sistema e librerie PHP
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    cron \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    libxml2-dev \
    libldap2-dev \
    libc-client-dev \
    libkrb5-dev \
    libbz2-dev \
    libicu-dev \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# 2. Configurazione e compilazione estensioni PHP (inclusa IMAP con SSL/Kerberos e LDAP)
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-configure ldap --with-libdir=lib/x86_64-linux-gnu/ \
    && docker-php-ext-configure imap --with-kerberos --with-imap-ssl \
    && docker-php-ext-install -j$(nproc) \
        gd \
        zip \
        xml \
        intl \
        mysqli \
        bz2 \
        opcache \
        ldap \
        imap \
        exif \
        soap

# 3. Tuning Opcache & PHP per GLPI
RUN { \
        echo 'opcache.memory_consumption=128'; \
        echo 'opcache.interned_strings_buffer=16'; \
        echo 'opcache.max_accelerated_files=10000'; \
        echo 'opcache.revalidate_freq=2'; \
        echo 'opcache.fast_shutdown=1'; \
        echo 'memory_limit=512M'; \
        echo 'max_execution_time=300'; \
        echo 'upload_max_filesize=64M'; \
        echo 'post_max_size=64M'; \
        echo 'date.timezone=UTC'; \
        echo 'session.cookie_httponly=1'; \
    } > /usr/local/etc/php/conf.d/glpi-custom.ini

# 4. Hardening Apache Webroot GLPI 10 (Directory /var/www/html/glpi/public)
COPY vhost.conf /etc/apache2/sites-available/000-default.conf
RUN a2enmod rewrite

# 5. Download e setup GLPI
WORKDIR /var/www/html
RUN curl -sSL "https://github.com/glpi-project/glpi/releases/download/${GLPI_VERSION}/glpi-${GLPI_VERSION}.tgz" -o glpi.tgz \
    && tar -xzf glpi.tgz \
    && rm glpi.tgz \
    && chown -R www-data:www-data /var/www/html/glpi

# 6. Entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["apache2-foreground"]
