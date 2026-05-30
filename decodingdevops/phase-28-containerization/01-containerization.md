# Bài 1: Containerization — Docker Compose cho vProfile

Bài này containerize toàn bộ vProfile stack với Docker Compose, networking và volume strategy.

## vProfile containerize

5 service phase 8 → 5 container:

```yaml
# docker-compose.yml
version: '3.9'

networks:
  vprofile:
    driver: bridge

volumes:
  db-data:
  rmq-data:

services:
  # === Database ===
  db:
    image: mariadb:11
    container_name: vprofile-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:-admin123}
      MYSQL_DATABASE: accounts
      MYSQL_USER: admin
      MYSQL_PASSWORD: ${DB_PASSWORD:-admin123}
    volumes:
      - db-data:/var/lib/mysql
      - ./db/init:/docker-entrypoint-initdb.d:ro
    networks:
      - vprofile
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  # === Cache ===
  cache:
    image: memcached:1.6-alpine
    container_name: vprofile-cache
    restart: unless-stopped
    networks:
      - vprofile

  # === Message Queue ===
  queue:
    image: rabbitmq:3.12-management-alpine
    container_name: vprofile-queue
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${MQ_USER:-test}
      RABBITMQ_DEFAULT_PASS: ${MQ_PASSWORD:-test}
    ports:
      - "15672:15672"     # Management UI
    volumes:
      - rmq-data:/var/lib/rabbitmq
    networks:
      - vprofile

  # === App (Tomcat) ===
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: vprofile:latest
    container_name: vprofile-app
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
      queue:
        condition: service_started
    environment:
      DB_HOST: db
      DB_USER: admin
      DB_PASSWORD: ${DB_PASSWORD:-admin123}
      CACHE_HOST: cache
      MQ_HOST: queue
      MQ_USER: ${MQ_USER:-test}
      MQ_PASSWORD: ${MQ_PASSWORD:-test}
    networks:
      - vprofile

  # === Web (nginx reverse proxy) ===
  web:
    image: nginx:1.25-alpine
    container_name: vprofile-web
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
    volumes:
      - ./nginx/vprofile.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - vprofile
```

## nginx config

`nginx/vprofile.conf`:

```nginx
upstream vprofile_backend {
    server app:8080;
}

server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://vprofile_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## .env file

`.env` (không commit Git):

```text
DB_ROOT_PASSWORD=strong_root_pass
DB_PASSWORD=app_pass
MQ_USER=appuser
MQ_PASSWORD=app_mq_pass
```

`.gitignore`:

```text
.env
```

## Database init scripts

`db/init/01-schema.sql`:

```sql
USE accounts;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, password) VALUES
    ('admin_vp', '$2a$10$...'),         -- bcrypt hash
    ('user_vp', '$2a$10$...');
```

MariaDB auto-execute file trong `/docker-entrypoint-initdb.d/` lần đầu init volume.

## Lệnh

```bash
# Up tất cả
docker compose up -d

# Build + up (force rebuild app image)
docker compose up -d --build

# Status
docker compose ps

# Logs
docker compose logs -f app
docker compose logs --tail 100 db

# Restart 1 service
docker compose restart app

# Stop nhưng giữ container + volume
docker compose stop

# Down (remove container, giữ volume)
docker compose down

# Down + xoá volume (mất data)
docker compose down -v

# Exec
docker compose exec db mysql -u root -p

# Scale
docker compose up -d --scale app=3
```

## Networking

Mặc định `docker compose up` tạo network `<projectname>_default`. Service reach nhau bằng tên:

```text
app → db:3306         ← Service name = DNS hostname
app → cache:11211
app → queue:5672
web → app:8080
```

Không cần expose port cho internal communication (chỉ expose web:80).

### Multiple networks

```yaml
networks:
  frontend:
  backend:

services:
  web:
    networks: [frontend]

  app:
    networks: [frontend, backend]   # 2 network

  db:
    networks: [backend]              # Chỉ backend, không reachable từ web
```

Isolation pattern: web không reach db trực tiếp.

## Volume strategies

### Named volume

```yaml
volumes:
  - db-data:/var/lib/mysql

volumes:
  db-data:
```

Docker manage. Backup:

```bash
docker run --rm -v vprofile_db-data:/data -v $(pwd):/backup \
    alpine tar -czf /backup/db-backup-$(date +%F).tar.gz /data
```

### Bind mount

```yaml
volumes:
  - ./code:/app:ro      # Read-only
  - ./logs:/var/log/app
```

Host folder. Dev workflow: edit on host, reflect in container.

### tmpfs (RAM)

```yaml
volumes:
  - type: tmpfs
    target: /tmp
```

Performance cao, data mất khi container stop.

## Compose for dev / staging / prod

Multiple file:

```bash
# Base
docker-compose.yml

# Dev overrides (mount code, debug)
docker-compose.override.yml         # Auto-load

# Prod
docker-compose.prod.yml
```

Auto-load:

```bash
docker compose up -d
# = docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

Explicit prod:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`docker-compose.override.yml` cho dev:

```yaml
services:
  app:
    build:
      target: dev
    volumes:
      - ./src:/app/src     # Live reload
    environment:
      DEBUG: true
    ports:
      - "5005:5005"        # Debug port
```

## Healthcheck + depends_on

Without healthcheck:

```yaml
depends_on:
  - db                     # Wait container START, not READY
```

App start → DB chưa accept connection → app fail.

With healthcheck:

```yaml
db:
  healthcheck:
    test: ["CMD", "mysqladmin", "ping"]
    interval: 10s
    retries: 5

app:
  depends_on:
    db:
      condition: service_healthy    # Wait until DB healthy
```

App đợi DB sẵn sàng accept connection.

## Resource limit

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          memory: 256M
```

Production: limit để tránh 1 container ăn hết host.

## Logging

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Mặc định Docker log vào `/var/lib/docker/containers/.../json.log` — không cap = đầy disk.

Set rotate: max 10 MB × 3 file = 30 MB max.

Alternative driver: `syslog`, `fluentd`, `awslogs`, `gelf`.

## Secret management

❌ Hardcode trong compose:

```yaml
environment:
  DB_PASSWORD: admin123      # Lộ
```

✓ .env file (dev):

```yaml
environment:
  DB_PASSWORD: ${DB_PASSWORD}
```

✓ Docker secret (swarm):

```yaml
services:
  app:
    secrets:
      - db_password

secrets:
  db_password:
    external: true
```

✓ Production: AWS Secrets Manager, Vault, K8s Secret.

## Production limitations

Docker Compose tốt cho:
- Dev local.
- CI/CD test environment.
- Small staging.

**Không** đủ cho production scale:
- Single host.
- Manual failover.
- No rolling deploy.
- Manual scaling.

→ **Kubernetes** (phase 29-30) cho production.

## Compose to K8s

Tool `kompose`:

```bash
kompose convert -f docker-compose.yml
# Generated:
# db-deployment.yaml
# db-service.yaml
# app-deployment.yaml
# app-service.yaml
# ...
```

Output K8s manifests gần production-ready. Cần tune.

## Lab — vProfile end-to-end

```bash
# Clone project
git clone https://github.com/acme/vprofile.git
cd vprofile

# Setup .env
cp .env.example .env
# Edit secrets

# Up
docker compose up -d --build

# Wait ~30s for healthchecks
docker compose ps
# All "healthy"

# Test
curl http://localhost
# vProfile login page

# Login admin_vp / admin_vp

# Open RabbitMQ UI
# http://localhost:15672 → test/test

# Logs
docker compose logs -f app

# Cleanup
docker compose down -v
```

5 service running, 1 command. So với phase 8 (15 phút setup Vagrant): **30 giây**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Port conflict | "address already in use" | Đổi port host hoặc kill process |
| Volume permission | App không write được | `chown` trong Dockerfile |
| Networking reach by IP | Container restart đổi IP | Reach by service name |
| .env commit Git | Secret lộ | `.gitignore` strict |
| Quên `depends_on healthcheck` | App start trước DB | Use condition |
| Single volume cho mọi env | Dev contaminate prod | Volume per environment |
| Log không cap | Disk đầy | `logging.options.max-size` |
| Compose for prod scale | Limitations | K8s |

## Tóm tắt bài 1

- **Docker Compose** quản multi-container stack với YAML.
- Service reach nhau bằng **tên** trong cùng network.
- **Healthcheck + `depends_on condition`** = ordered startup.
- **Named volume** persist data, **bind mount** dev workflow.
- **Multi-file** cho dev/staging/prod (override pattern).
- **Resource limit** + **log rotation** mandatory production.
- **`.env` + Docker secret** thay hardcode credential.
- **Tốt cho dev local, không cho production scale** — chuyển K8s.
- `kompose` convert sang K8s.

**Phase kế tiếp** → [Phase 29 — Bài 1: Kubernetes architecture](../phase-29-kubernetes/01-k8s-basics.md)
