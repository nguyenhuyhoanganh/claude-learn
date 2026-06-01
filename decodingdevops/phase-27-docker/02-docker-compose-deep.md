# Bài 2: Docker Compose deep — networking, volumes, profiles

Phase 28 đã cover Compose cơ bản. Bài này deep-dive **production pattern**: network, volume, secret, profile, healthcheck.

## docker-compose.yml v3.9 syntax

```yaml
version: '3.9'                    # Optional ở Compose hiện đại

name: vprofile                    # Tên project (override tên directory)

x-common-env: &common-env         # YAML anchor (để reuse)
  TZ: UTC
  LOG_LEVEL: INFO

services:
  db:
    image: mariadb:11
    environment:
      <<: *common-env             # Merge anchor vào đây
      MYSQL_DATABASE: accounts
```

## Networking

### Network mặc định

Mỗi project Compose → 1 bridge network mặc định. Các service gọi nhau qua tên service.

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

`web` → gọi được `api:8080` (port internal).
`api` → gọi được `db:3306`.

### Custom networks (Tách network riêng)

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true               # Không có external access (không ra Internet)
  monitoring:
    external: true                # Network đã tồn tại sẵn

services:
  web:
    networks: [frontend]

  api:
    networks: [frontend, backend]   # Service "cầu nối" giữa 2 tier

  db:
    networks: [backend]              # Chỉ backend (cô lập)

  prometheus:
    networks: [monitoring, backend]
```

`db` chỉ ở trong `backend` (internal: true) → web không gọi trực tiếp tới db được → tăng tính bảo mật.

### Network alias

```yaml
services:
  db-primary:
    image: mariadb
    networks:
      backend:
        aliases: [db, db-master]
```

App connect `db:3306` → resolve về db-primary. Dễ dàng swap implementation mà không cần đổi code app.

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

Hiếm khi cần; ưu tiên dùng DNS qua tên service.

## Volumes

### Named volume (Do Docker quản lý)

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
# Liệt kê
docker volume ls

# Inspect chi tiết
docker volume inspect vprofile_db-data

# Backup volume
docker run --rm -v vprofile_db-data:/data \
    -v $(pwd):/backup alpine \
    tar -czf /backup/db-$(date +%F).tar.gz /data

# Restore
docker run --rm -v vprofile_db-data:/data \
    -v $(pwd):/backup alpine \
    tar -xzf /backup/db-2026-05-31.tar.gz -C /
```

### Bind mount (Mount thư mục từ host)

```yaml
services:
  app:
    volumes:
      # Source code (dev)
      - ./src:/app:cached

      # Config read-only
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro

      # Log ra host
      - /var/log/vprofile:/app/logs

      # Cache (cho phép write)
      - ./.cache:/root/.cache:delegated
```

Mount options:
- `ro`: read-only.
- `cached`: tối ưu cho macOS (host wins — host là source of truth).
- `delegated`: tối ưu cho macOS (container wins).
- `consistent`: consistency mạnh (chậm hơn).

### tmpfs (Volume trong RAM)

```yaml
services:
  app:
    tmpfs:
      - /tmp
      - /run:size=100M,mode=1770,uid=1000
```

RAM-backed → cực nhanh, ephemeral (mất khi container restart).

### Reuse volume external

```yaml
volumes:
  shared:
    external: true
    name: legacy-app-data
```

Dùng lại volume đã tồn tại từ project khác.

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

Các condition:
- `service_started` (mặc định): container đã start.
- `service_healthy`: healthcheck đã pass.
- `service_completed_successfully`: container exit code 0 (cho init container pattern).

## Profiles — Khởi động chọn lọc

```yaml
services:
  db:
    image: mariadb
    # Không có profile = luôn start

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
docker compose up -d              # Chỉ db (không có profile)
docker compose --profile full up -d   # db + cache
docker compose --profile monitoring up -d
docker compose --profile full --profile monitoring up -d
```

Use case: dev minimal, full stack, debug tool — kích hoạt khi cần.

## Environment + secrets

### File .env

```text
# .env (KHÔNG commit lên Git)
DB_PASSWORD=Secret123
API_KEY=sk-xxx
```

```yaml
services:
  db:
    environment:
      MYSQL_PASSWORD: ${DB_PASSWORD}    # Substitute từ env
```

### env_file (Đa file env)

```yaml
services:
  api:
    env_file:
      - .env.common
      - .env.${ENV}              # .env.production hoặc .env.dev
```

### Secrets

```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    external: true               # Lấy từ Swarm/external store

services:
  db:
    secrets:
      - db_password
    environment:
      MYSQL_PASSWORD_FILE: /run/secrets/db_password
```

Secret được mount thành file `/run/secrets/<name>`. App đọc file → tránh được secret xuất hiện trong env (giảm rủi ro lộ qua `docker inspect`).

## Multiple compose files (Compose nhiều file)

```bash
docker-compose.yml              # File base
docker-compose.override.yml      # Auto-load (thường cho dev)
docker-compose.prod.yml          # Override cho production
docker-compose.test.yml          # Override cho test
```

```bash
docker compose up               # base + override (dev)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

Pattern: file base bất biến, file override cho từng environment cụ thể.

### override.yml ví dụ

```yaml
# docker-compose.override.yml (dev)
services:
  api:
    build:
      target: dev          # Multi-stage Dockerfile target dev
    volumes:
      - ./src:/app/src     # Live reload code
    environment:
      DEBUG: true
    ports:
      - "5005:5005"        # Debugger port
```

### prod.yml ví dụ

```yaml
services:
  api:
    image: ${REGISTRY}/vprofile:${VERSION}    # Image đã build sẵn (không build tại chỗ)
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

## Resource constraints (Giới hạn tài nguyên)

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

    # Giới hạn Block I/O
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

Các driver khác: `syslog`, `journald`, `gelf`, `fluentd`, `awslogs`, `gcplogs`, `loki`.

Loki driver (gửi log thẳng vào Loki):

```yaml
logging:
  driver: loki
  options:
    loki-url: "http://loki:3100/loki/api/v1/push"
    loki-retries: "5"
    loki-batch-size: "400"
```

## Init container pattern

Chạy task 1 lần trước khi service chính start:

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

`migrate` chạy 1 lần, exit thành công, sau đó `app` mới start.

## Scaling

```bash
docker compose up -d --scale api=3
```

3 instance của `api`. Frontend (nginx) load balance qua DNS:

```nginx
upstream api {
    server api:8080 max_fails=3 fail_timeout=10s;
    # Compose tự resolve tên "api" → tất cả 3 IP của 3 instance
}
```

Production scale = K8s, không phải Compose. Scale qua Compose OK cho dev/test.

## Production vProfile compose (đầy đủ)

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

Đây là deployment production-ready cho single-host.

## Tóm tắt bài 2

- **Custom networks** (internal: true) cho cô lập tier.
- **Healthcheck + depends_on condition** cho ordered startup.
- **Profiles** selective start cho dev / full / monitoring.
- **Secrets** mount qua file, tránh hardcode env.
- **Override files** theo pattern dev / prod / test.
- **Logging driver** Loki / Fluentd cho production aggregation.
- **Init container** pattern với `service_completed_successfully`.
- **Resource limits** + **ulimits** = production constraint.

**Bài kế tiếp** → [Bài 3: Docker Swarm, Buildx, security scanning](03-docker-swarm-buildx.md)
