# ==============================================================================
# Dockerfile - Multi-Stage, Multi-Arch PHP 8.4-FPM Production Hardened Image
# Supported Platforms: linux/amd64, linux/arm64
# DevOps & Infrastructure Sage (v3.0.0)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Dependencies via Composer
# ------------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM composer:2.8 AS vendor-builder

WORKDIR /app

# Copy dependency definitions first to maximize layer caching
COPY composer.json composer.lock* ./

# If composer.json exists, install dependencies without dev packages
RUN if [ -f composer.json ]; then \
        composer install \
            --no-dev \
            --no-interaction \
            --prefer-dist \
            --optimize-autoloader \
            --no-scripts \
            --ignore-platform-reqs; \
    fi

# ------------------------------------------------------------------------------
# Stage 2: Production Hardened Runtime (Multi-Arch Alpine)
# ------------------------------------------------------------------------------
FROM php:8.4-fpm-alpine3.21 AS production

# Security & Multi-Arch: Use official mlocati extension installer
ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/

# Install essential Laravel PHP extensions and FCGI probe for healthchecks
RUN apk update && apk add --no-cache \
        fcgi \
        bash \
        tzdata \
        su-exec \
    && install-php-extensions \
        pdo_mysql \
        bcmath \
        opcache \
        pcntl \
        redis \
        zip \
        intl \
    && rm /usr/local/bin/install-php-extensions \
    && rm -rf /var/cache/apk/* /tmp/*

# Configure Non-Root System User (UID 10001, GID 10001)
# Bypasses standard UID 1000 to eliminate host namespace collision risks
ENV APP_USER=appuser \
    APP_UID=10001 \
    APP_GID=10001

RUN addgroup -g ${APP_GID} -S ${APP_USER} && \
    adduser -u ${APP_UID} -S -G ${APP_USER} -h /var/www/html -s /sbin/nologin ${APP_USER}

# Working directory
WORKDIR /var/www/html

# Copy hardened PHP configurations
COPY php.ini /usr/local/etc/php/conf.d/99-hardened.ini
COPY zz-docker.conf /usr/local/etc/php-fpm.d/zz-docker.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create application structure and assign ownership
RUN mkdir -p /var/www/html/public \
             /var/www/html/storage \
             /var/www/html/bootstrap/cache \
    && chown -R ${APP_USER}:${APP_USER} /var/www/html

# Expose PHP-FPM fastcgi port
EXPOSE 9000

# Container Healthcheck using FastCGI protocol probe
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD SCRIPT_NAME=/ping SCRIPT_FILENAME=/ping REQUEST_METHOD=GET cgi-fcgi -bind -connect 127.0.0.1:9000 || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["php-fpm"]
