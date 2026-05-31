# Bài 2: Containerize vProfile từng service end-to-end

Bài 1 giới thiệu Compose. Bài này **viết Dockerfile cho mỗi service vProfile** + multi-stage build + production hardening.

## App tier — Tomcat + vProfile.war

### Multi-stage Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.6

# ===== Stage 1: Build .war =====
FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /build

# Cache deps
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -B

# Build
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -B

# ===== Stage 2: Runtime — Tomcat =====
FROM tomcat:10.1-jdk17-temurin-jammy

LABEL maintainer="devops@acme.com"
LABEL org.opencontainers.image.source="https://github.com/acme/vprofile"
LABEL org.opencontainers.image.description="vProfile app"

# Remove default apps
RUN rm -rf /usr/local/tomcat/webapps/* \
    && rm -rf /usr/local/tomcat/server/webapps/*

# Tomcat user
RUN groupadd -r tomcat && useradd -r -g tomcat -d /usr/local/tomcat tomcat

# Copy app
COPY --from=builder /build/target/vprofile-v2.war /usr/local/tomcat/webapps/ROOT.war

# Server config
COPY config/server.xml /usr/local/tomcat/conf/
COPY config/setenv.sh /usr/local/tomcat/bin/

# Ownership + permissions
RUN chown -R tomcat:tomcat /usr/local/tomcat \
    && chmod +x /usr/local/tomcat/bin/setenv.sh

USER tomcat

# Tomcat JVM tune via setenv.sh
ENV JAVA_OPTS="-Xms512m -Xmx1024m -XX:+UseG1GC -Djava.awt.headless=true"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD wget -q --spider http://localhost:8080/ || exit 1

CMD ["catalina.sh", "run"]
```

`config/server.xml` — Tomcat tuning:

```xml
<Server port="8005" shutdown="SHUTDOWN">
  <Service name="Catalina">
    <Connector port="8080"
               protocol="HTTP/1.1"
               connectionTimeout="20000"
               redirectPort="8443"
               maxThreads="200"
               minSpareThreads="10"
               acceptCount="100"
               compression="on"
               compressableMimeType="text/html,text/xml,text/plain,text/css,text/javascript,application/javascript,application/json" />

    <Engine name="Catalina" defaultHost="localhost">
      <Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="false">
        <Valve className="org.apache.catalina.valves.AccessLogValve"
               directory="logs"
               prefix="access" suffix=".log"
               pattern="%h %l %u %t &quot;%r&quot; %s %b %D" />
      </Host>
    </Engine>
  </Service>
</Server>
```

`config/setenv.sh`:

```bash
#!/bin/sh
JAVA_OPTS="$JAVA_OPTS -Dfile.encoding=UTF-8"
JAVA_OPTS="$JAVA_OPTS -Djava.security.egd=file:/dev/./urandom"
JAVA_OPTS="$JAVA_OPTS -Dnetworkaddress.cache.ttl=60"
```

### Build + verify

```bash
docker build -t vprofile:v1.0 .

# Verify size
docker images vprofile:v1.0
# vprofile  v1.0  abc123  100s  ~250MB

# Inspect layers
docker history vprofile:v1.0
```

### Configuration externalization

App config từ env (12-factor):

```properties
# application.properties (read from env)
jdbc.url=${DB_URL:jdbc:mysql://localhost:3306/accounts}
jdbc.username=${DB_USER:admin}
jdbc.password=${DB_PASSWORD}

memcached.active.host=${CACHE_HOST:cache}
memcached.active.port=${CACHE_PORT:11211}

rabbitmq.address=${MQ_HOST:queue}
rabbitmq.port=${MQ_PORT:5672}
rabbitmq.username=${MQ_USER:test}
rabbitmq.password=${MQ_PASSWORD}
```

App read `${ENV_VAR}` → no rebuild image per environment.

## Web tier — nginx reverse proxy

```dockerfile
FROM nginx:1.25-alpine

LABEL maintainer="devops@acme.com"

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Custom config
COPY nginx/vprofile.conf /etc/nginx/conf.d/

# Static asset (if any)
COPY static/ /usr/share/nginx/html/static/

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=3s \
    CMD wget -q --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

`nginx/vprofile.conf`:

```nginx
upstream tomcat {
    server app:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80 default_server;
    server_name _;

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Healthcheck
    location /health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # Static
    location ~* \.(css|js|jpg|png|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # App
    location / {
        proxy_pass http://tomcat;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }
}
```

## Data tier — pre-built images

MariaDB, Memcached, RabbitMQ — use official, configure via env + config file.

### MariaDB config

`db/Dockerfile`:

```dockerfile
FROM mariadb:11

# Custom server config
COPY my.cnf /etc/mysql/conf.d/

# Init scripts (run on first start)
COPY init/*.sql /docker-entrypoint-initdb.d/
```

`db/my.cnf`:

```ini
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default-time-zone = '+00:00'

# Performance
innodb_buffer_pool_size = 512M
innodb_log_file_size = 128M
max_connections = 200

# Logging
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Security
local_infile = 0
skip-symbolic-links
```

`db/init/01-schema.sql` — vProfile schema loaded on first init.

### RabbitMQ config

`mq/Dockerfile`:

```dockerfile
FROM rabbitmq:3.12-management-alpine

# Plugins
RUN rabbitmq-plugins enable --offline \
    rabbitmq_management \
    rabbitmq_prometheus

# Config
COPY rabbitmq.conf /etc/rabbitmq/rabbitmq.conf
COPY definitions.json /etc/rabbitmq/definitions.json

# Definitions = pre-create user, queue, exchange
ENV RABBITMQ_LOAD_DEFINITIONS=/etc/rabbitmq/definitions.json
```

`mq/definitions.json`:

```json
{
    "users": [{
        "name": "vprofileuser",
        "password_hash": "...",
        "tags": ["administrator"]
    }],
    "vhosts": [{"name": "/"}],
    "permissions": [{
        "user": "vprofileuser",
        "vhost": "/",
        "configure": ".*",
        "write": ".*",
        "read": ".*"
    }],
    "queues": [{
        "name": "order-events",
        "vhost": "/",
        "durable": true
    }],
    "exchanges": [{
        "name": "vprofile-exchange",
        "vhost": "/",
        "type": "topic",
        "durable": true
    }]
}
```

Pre-configured = no manual setup post-deploy.

## Final compose

`docker-compose.yml`:

```yaml
version: '3.9'

x-restart-policy: &restart
  restart: unless-stopped

x-logging: &logging
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "5"

services:
  db:
    build: ./db
    image: vprofile/db:v1
    <<: *restart
    <<: *logging
    environment:
      MYSQL_DATABASE: accounts
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/db_root_password
      MYSQL_USER: admin
      MYSQL_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db-data:/var/lib/mysql
      - db-logs:/var/log/mysql
    networks: [backend]
    secrets: [db_root_password, db_password]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  cache:
    image: memcached:1.6-alpine
    <<: *restart
    <<: *logging
    command: ["-m", "256"]
    networks: [backend]

  queue:
    build: ./mq
    image: vprofile/mq:v1
    <<: *restart
    <<: *logging
    volumes:
      - mq-data:/var/lib/rabbitmq
    networks: [backend]
    ports:
      - "15672:15672"   # Management UI

  app:
    build:
      context: .
      dockerfile: app/Dockerfile
      cache_from:
        - vprofile:cache
    image: vprofile:${VERSION:-latest}
    <<: *restart
    <<: *logging
    depends_on:
      db: {condition: service_healthy}
      cache: {condition: service_started}
      queue: {condition: service_started}
    environment:
      DB_URL: jdbc:mysql://db:3306/accounts?useSSL=false
      DB_USER: admin
      DB_PASSWORD_FILE: /run/secrets/db_password
      CACHE_HOST: cache
      CACHE_PORT: "11211"
      MQ_HOST: queue
      MQ_PORT: "5672"
      MQ_USER: vprofileuser
      MQ_PASSWORD_FILE: /run/secrets/mq_password
      JAVA_OPTS: "-Xms512m -Xmx1024m"
    networks: [frontend, backend]
    secrets: [db_password, mq_password]
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 90s

  web:
    build: ./web
    image: vprofile/web:v1
    <<: *restart
    <<: *logging
    depends_on:
      app: {condition: service_healthy}
    ports:
      - "80:80"
    networks: [frontend]
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost/health"]
      interval: 10s

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true

volumes:
  db-data:
  db-logs:
  mq-data:

secrets:
  db_root_password:
    file: ./secrets/db_root_password.txt
  db_password:
    file: ./secrets/db_password.txt
  mq_password:
    file: ./secrets/mq_password.txt
```

### Run

```bash
# Generate secrets
mkdir -p secrets
echo -n "$(openssl rand -base64 24)" > secrets/db_root_password.txt
echo -n "$(openssl rand -base64 24)" > secrets/db_password.txt
echo -n "$(openssl rand -base64 24)" > secrets/mq_password.txt

# Build + up
docker compose build
docker compose up -d

# Wait ~60s
docker compose ps
# All healthy

# Test
curl http://localhost/
```

## Push to registry

```bash
# Tag
docker tag vprofile:latest 123.dkr.ecr.us-east-1.amazonaws.com/vprofile:v1.0
docker tag vprofile:latest 123.dkr.ecr.us-east-1.amazonaws.com/vprofile:latest

# ECR login
aws ecr get-login-password | docker login --username AWS \
    --password-stdin 123.dkr.ecr.us-east-1.amazonaws.com

# Push
docker push 123.dkr.ecr.us-east-1.amazonaws.com/vprofile:v1.0
docker push 123.dkr.ecr.us-east-1.amazonaws.com/vprofile:latest
```

## Image size optimization

| Step | Size before | Size after |
|---|---|---|
| Single stage | 1.5 GB | - |
| Multi-stage | - | 250 MB |
| Alpine base | - | 180 MB |
| Distroless | - | 150 MB |

Distroless cho production:

```dockerfile
FROM gcr.io/distroless/java17-debian12

WORKDIR /app
COPY --from=builder /build/target/vprofile-v2.war app.war

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.war"]
```

No shell, no package manager, minimum attack surface.

## Tóm tắt bài 2

- **Multi-stage Dockerfile** mỗi service: builder + runtime.
- **Config externalization** = env variable + secret mount.
- Pre-built data services (MariaDB, RabbitMQ) với custom config + init script.
- **definitions.json** RabbitMQ pre-create user/queue.
- **Healthcheck + depends_on condition** ordered startup.
- **Frontend network** + **backend internal network** isolation.
- **Tag + push ECR** với version + latest.
- **Distroless** image cho minimum size + security.

**Bài kế tiếp** → [Bài 3: Container registry, image lifecycle, supply chain](03-registry-supply-chain.md)
