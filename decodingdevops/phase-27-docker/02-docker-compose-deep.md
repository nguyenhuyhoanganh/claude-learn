# Bài 2: Docker Compose deep — networking, volumes, profiles

Phase 28 cover Compose cơ bản. Bài này deep-dive **production patterns**: network, volume, secret, profile, healthcheck.

## docker-compose.yml v3.9 syntax

```yaml
version: '3.9'                    # Optional in modern Compose

name: vprofile                    # Project name (override directory)

x-common-env: &common-env         # YAML anchor (reuse)
  TZ: UTC
  LOG_LEVEL: INFO

services:
  db:
    image: mariadb:11
    environment:
      <<: *common-env             # Merge anchor
      MYSQL_DATABASE: accounts
```

## Networking

### Default network

Mỗi project → 1 bridge network. Services reach nhau bằng tên.

```yaml
services:
  web:
    image: nginx
    depends_on: [api]

  api:
    image: my-api
    depends_on: [db]

  db:
    image: mariadb
```

`web` → reach `api:8080` (port internal).
`api` → reach `db:3306`.

### Custom networks

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true               # No external access
  monitoring:
    external: true                # Pre-existing network

services:
  web:
    networks: [frontend]

  api:
    networks: [frontend, backend]   # Bridge tier

  db:
    networks: [backend]              # Backend only

  prometheus:
    networks: [monitoring, backend]
```

`db` chỉ trong `backend` (internal) → web không reach trực tiếp → security.

### Network alias

```yaml
services:
  db-primary:
    image: mariadb
    networks:
      backend:
        aliases: [db, db-master]
```

App connect `db:3306` → resolve to db-primary. Easy swap implementation.

### Static IP

```yaml
networks:
  backend:
    ipam:
      config:
        - subnet: 172.20.0.0/24

services:
  db:
    networks:
      backend:
        ipv4_address: 172.20.0.10
```

Rarely needed; prefer DNS by service name.

## Volumes

### Named volume (managed by Docker)

```yaml
volumes:
  db-data:
    driver: local
  redis-data:
    driver: local
    driver_opts:
      type: tmpfs
      device: tmpfs

services:
  db:
    volumes:
      - db-data:/var/lib/mysql

  redis:
    volumes:
      - redis-data:/data
```

```bash
# List
docker volume ls

# Inspect
docker volume inspect vprofile_db-data

# Backup
docker run --rm -v vprofile_db-data:/data \
    -v $(pwd):/backup alpine \
    tar -czf /backup/db-$(date +%F).tar.gz /data

# Restore
docker run --rm -v vprofile_db-data:/data \
    -v $(pwd):/backup alpine \
    tar -xzf /backup/db-2026-05-31.tar.gz -C /
```

### Bind mount

```yaml
services:
  app:
    volumes:
      # Source code (dev)
      - ./src:/app:cached

      # Config read-only
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro

      # Host log
      - /var/log/vprofile:/app/logs

      # Cache (writable)
      - ./.cache:/root/.cache:delegated
```

Mount options:
- `ro`: read-only.
- `cached`: better perf macOS (host wins).
- `delegated`: better perf macOS (container wins).
- `consistent`: strong consistency (slow).

### tmpfs

```yaml
services:
  app:
    tmpfs:
      - /tmp
      - /run:size=100M,mode=1770,uid=1000
```

RAM-backed, fast, ephemeral.

### Volume from external

```yaml
volumes:
  shared:
    external: true
    name: legacy-app-data
```

Reuse existing volume từ other project.

## Healthcheck + depends_on

```yaml
services:
  db:
    image: mariadb
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  api:
    image: my-api
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
      migrate:
        condition: service_completed_successfully
```

Conditions:
- `service_started` (default): container start.
- `service_healthy`: healthcheck pass.
- `service_completed_successfully`: exit 0 (for init container pattern).

## Profiles — selective start

```yaml
services:
  db:
    image: mariadb
    # No profile = always start

  cache:
    image: redis
    profiles: [full]

  monitoring:
    image: prom/prometheus
    profiles: [monitoring]

  debug:
    image: nicolaka/netshoot
    profiles: [debug]
```

```bash
docker compose up -d              # Only db (no profile)
docker compose --profile full up -d   # db + cache
docker compose --profile monitoring up -d
docker compose --profile full --profile monitoring up -d
```

Use case: dev minimal, full stack, debug tools.

## Environment + secrets

### .env file

```text
# .env (not committed)
DB_PASSWORD=Secret123
API_KEY=sk-xxx
```

```yaml
services:
  db:
    environment:
      MYSQL_PASSWORD: ${DB_PASSWORD}    # Variable substitution
```

### env_file

```yaml
services:
  api:
    env_file:
      - .env.common
      - .env.${ENV}              # .env.production or .env.dev
```

### Secrets

```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    external: true               # From Swarm/external

services:
  db:
    secrets:
      - db_password
    environment:
      MYSQL_PASSWORD_FILE: /run/secrets/db_password
```

Secret mount as `/run/secrets/<name>` file. App read file.

## Multiple compose files

```bash
docker-compose.yml              # Base
docker-compose.override.yml      # Auto-load (usually dev)
docker-compose.prod.yml          # Production override
docker-compose.test.yml          # Test override
```

```bash
docker compose up               # base + override (dev)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

Pattern: base immutable, environment-specific override.

### override.yml example

```yaml
# docker-compose.override.yml (dev)
services:
  api:
    build:
      target: dev          # Multi-stage Dockerfile dev target
    volumes:
      - ./src:/app/src     # Live reload code
    environment:
      DEBUG: true
    ports:
      - "5005:5005"        # Debugger port
```

### prod.yml

```yaml
services:
  api:
    image: ${REGISTRY}/vprofile:${VERSION}    # Pre-built
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
      replicas: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

## Resource constraints

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
          pids: 100
        reservations:
          cpus: '0.5'
          memory: 512M

    ulimits:
      nproc: 65535
      nofile:
        soft: 65535
        hard: 65535

    # Block I/O
    blkio_config:
      weight: 500
      device_read_bps:
        - path: /dev/sda
          rate: '10mb'
```

## Logging

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        labels: "service,environment"
        tag: "{{.Name}}/{{.ID}}"
```

Other drivers: `syslog`, `journald`, `gelf`, `fluentd`, `awslogs`, `gcplogs`, `loki`.

Loki driver:

```yaml
logging:
  driver: loki
  options:
    loki-url: "http://loki:3100/loki/api/v1/push"
    loki-retries: "5"
    loki-batch-size: "400"
```

## Init container pattern

Run task once before main start:

```yaml
services:
  app:
    image: my-app
    depends_on:
      migrate:
        condition: service_completed_successfully

  migrate:
    image: my-migrate
    command: ["./run-migrations.sh"]
    depends_on:
      db:
        condition: service_healthy
    restart: "no"
```

`migrate` run once, exit, then `app` start.

## Scaling

```bash
docker compose up -d --scale api=3
```

3 instance of api. Frontend (nginx) load balance via DNS:

```nginx
upstream api {
    server api:8080 max_fails=3 fail_timeout=10s;
    # Compose resolve api → all 3 IPs
}
```

Production scale = K8s, not Compose. Compose scale OK for dev/test.

## Production vProfile compose

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
    image: mariadb:11
    <<: *restart
    <<: *logging
    environment:
      MYSQL_DATABASE: accounts
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/db_root_password
      MYSQL_USER: admin
      MYSQL_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db-data:/var/lib/mysql
    networks:
      - backend
    secrets:
      - db_root_password
      - db_password
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: {memory: 1G}

  cache:
    image: memcached:1.6-alpine
    <<: *restart
    <<: *logging
    command: ["-m", "256"]
    networks: [backend]
    deploy:
      resources:
        limits: {memory: 512M}

  queue:
    image: rabbitmq:3.12-management-alpine
    <<: *restart
    <<: *logging
    environment:
      RABBITMQ_DEFAULT_USER_FILE: /run/secrets/mq_user
      RABBITMQ_DEFAULT_PASS_FILE: /run/secrets/mq_password
    volumes:
      - mq-data:/var/lib/rabbitmq
    networks: [backend]
    secrets:
      - mq_user
      - mq_password
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 30s
      retries: 5

  app:
    image: ${REGISTRY}/vprofile:${VERSION:-latest}
    <<: *restart
    <<: *logging
    depends_on:
      db: {condition: service_healthy}
      cache: {condition: service_started}
      queue: {condition: service_healthy}
    environment:
      DB_HOST: db
      DB_USER: admin
      CACHE_HOST: cache
      MQ_HOST: queue
    networks: [frontend, backend]
    secrets:
      - db_password
      - mq_password
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      replicas: 3
      resources:
        limits: {cpus: '1', memory: 1G}

  web:
    image: nginx:1.25-alpine
    <<: *restart
    <<: *logging
    depends_on:
      app: {condition: service_healthy}
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./tls:/etc/nginx/tls:ro
    ports:
      - "80:80"
      - "443:443"
    networks: [frontend]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true

volumes:
  db-data:
  mq-data:

secrets:
  db_root_password:
    file: ./secrets/db_root_password.txt
  db_password:
    file: ./secrets/db_password.txt
  mq_user:
    file: ./secrets/mq_user.txt
  mq_password:
    file: ./secrets/mq_password.txt
```

Production-ready single-host deployment.

## Tóm tắt bài 2

- **Custom networks** (internal: true) cho tier isolation.
- **Healthcheck + depends_on condition** ordered startup.
- **Profiles** selective start cho dev/full/monitoring.
- **Secrets** file mount thay env hardcode.
- **Override files** dev/prod/test pattern.
- **Logging driver** Loki/Fluentd cho production aggregation.
- **Init container** pattern với `service_completed_successfully`.
- **Resource limits** + **ulimits** production constraints.

**Bài kế tiếp** → [Bài 3: Docker Swarm, Buildx, security scanning](03-docker-swarm-buildx.md)
