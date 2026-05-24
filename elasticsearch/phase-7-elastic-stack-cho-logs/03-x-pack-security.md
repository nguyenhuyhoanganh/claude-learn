# Bài 3: X-Pack Security

Khoá học tới giờ tắt security (`xpack.security.enabled: false`). Production = bắt buộc bật. Bài này: setup authentication, users, roles, TLS.

## Vì sao security?

ES default open API:
- Anyone qua network → query, modify, delete.
- 2023 có vụ ES public exposing data 1B+ records.

→ Production **luôn** bật security.

## X-Pack Security features

| Feature                  | Tier              |
|--------------------------|-------------------|
| Authentication           | **Basic (free)**  |
| Role-based access        | **Basic (free)**  |
| TLS encryption           | **Basic (free)**  |
| LDAP/SAML/OAuth          | Gold (paid)       |
| Document/field-level     | Gold              |
| Audit logs               | Gold              |

→ **Basic free từ ES 6.8+**. Đủ cho 80% production.

## Enable security

Trong `elasticsearch.yml`:

```yaml
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: certificate
xpack.security.transport.ssl.keystore.path: certs/elastic-certificates.p12
xpack.security.transport.ssl.truststore.path: certs/elastic-certificates.p12
```

Restart ES → security on.

Default user `elastic` (superuser) — set password:

```bash
bin/elasticsearch-setup-passwords interactive
```

Hoặc auto-generate:

```bash
bin/elasticsearch-setup-passwords auto
```

→ ES print passwords cho `elastic`, `kibana_system`, `logstash_system`, `beats_system`, ... → lưu password manager.

## Authentication

Sau bật security, mọi request cần auth:

```bash
curl -u elastic:password http://localhost:9200/
```

```text
GET /_cluster/health
Authorization: Basic <base64(user:pass)>
```

→ HTTP Basic Auth.

Hoặc API key (better cho service):

```text
POST /_security/api_key
{
    "name": "filebeat-key",
    "role_descriptors": {
        "filebeat_role": {
            "indices": [
                {
                    "names": ["logs-*"],
                    "privileges": ["write", "create_index"]
                }
            ]
        }
    }
}
```

Response chứa `id` + `api_key`. Encode base64:

```bash
echo -n "id:api_key" | base64
```

Use:

```text
Authorization: ApiKey <base64>
```

→ Revocable không impact user password.

## Users management

Built-in users (system):
- `elastic` — superuser.
- `kibana_system` — Kibana process.
- `logstash_system` — Logstash process.
- `beats_system` — Beats process.

Tạo user custom:

```text
POST /_security/user/alice
{
    "password": "secretP@ss",
    "roles": ["editor"],
    "full_name": "Alice Smith",
    "email": "alice@example.com"
}
```

Update password:

```text
POST /_security/user/alice/_password
{ "password": "newpass" }
```

Delete:

```text
DELETE /_security/user/alice
```

## Roles & privileges

Role = set permissions:

```text
POST /_security/role/editor
{
    "cluster": ["monitor"],
    "indices": [
        {
            "names": ["logs-*"],
            "privileges": ["read", "view_index_metadata"]
        },
        {
            "names": ["app-data-*"],
            "privileges": ["read", "write", "create", "delete"]
        }
    ]
}
```

Cluster privileges (`monitor`, `manage`, `all`, ...).
Index privileges (`read`, `write`, `create_index`, `delete_index`, `all`, ...).

→ Assign multiple roles cho user → effective = union.

### Built-in roles

| Role                  | Purpose                              |
|-----------------------|--------------------------------------|
| `superuser`           | God mode (chỉ root user)             |
| `kibana_admin`        | Manage Kibana                        |
| `kibana_user`         | Read Kibana                          |
| `viewer`              | Read mọi data                        |
| `editor`              | Read + edit                          |
| `logstash_admin`      | Manage Logstash                      |
| `beats_admin`         | Manage Beats                         |

→ Combine với custom roles cho fine-grained access.

## Configure Kibana with security

Kibana cần credential ES:

```yaml
elasticsearch.hosts: ["https://es:9200"]
elasticsearch.username: "kibana_system"
elasticsearch.password: "${KIBANA_PASSWORD}"
elasticsearch.ssl.certificateAuthorities: ["/path/to/ca.crt"]
```

User dev Kibana login với account riêng (vd `alice`) — Kibana validate qua ES.

## TLS / HTTPS

3 levels:

### 1. Transport (node-to-node)

ES nodes giao tiếp với nhau qua port 9300:

```yaml
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.keystore.path: ...
```

→ Mã hoá nội bộ cluster.

### 2. HTTP (client-to-cluster)

REST API port 9200:

```yaml
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.keystore.path: ...
```

→ Client (Kibana, Logstash, app) connect qua HTTPS.

### 3. Logstash/Beats output SSL

Phase 7 bài 2 đã setup.

## Generate certs

ES có tool helper:

```bash
bin/elasticsearch-certutil ca                       # Tạo CA
bin/elasticsearch-certutil cert --ca elastic-stack-ca.p12 \
    --dns es-node-1 --ip 192.168.1.10
```

→ Generate cert per node.

Production: dùng cert thật (Let's Encrypt, internal CA).

## Audit logging (paid)

Log mọi access:

```yaml
xpack.security.audit.enabled: true
```

→ File `logs/audit.json` chứa mọi authenticate, query, modify với user identifier. Forensic + compliance.

## Best practices

### 1. Bật security ngày 1

Đừng deploy "tạm tắt security, sau bật". Migration đau đớn. Bật từ đầu.

### 2. Role least-privilege

User Kibana không cần `all` cluster perm. Cấp đúng scope.

### 3. API key cho service

Service account = API key. Không dùng `elastic` superuser.

### 4. Rotate password

Quarterly rotate, đặc biệt sau staff turnover.

### 5. Don't ship `elastic` password trong config

Dùng env var, secret manager (Vault, AWS Secrets Manager).

### 6. Monitor failed login

Anomaly detection: spike fail login → potential brute force.

## Pitfall

### 1. Quên config Kibana / Logstash / Beats

Bật security trong ES → mọi component khác cần update config với credential. Quên = component fail connect.

### 2. Cert expire

Cert thường 1-2 year. Quên renew → cluster down.

→ Set calendar reminder + monitoring.

### 3. Network policy

Bật security không thay thế network firewall. ES port 9200/9300 vẫn nên trong private network, không expose public.

## Tóm tắt

- ES default open — production **bắt buộc** bật `xpack.security.enabled`.
- **Basic tier free** cho authentication + RBAC + TLS.
- 3 levels TLS: transport (node-to-node), HTTP (client), output (Beats/Logstash).
- Users + roles + privileges (cluster + index).
- **API key** > username/password cho service account.
- Built-in roles: superuser, kibana_admin, editor, viewer, ...
- Best practice: least-privilege, rotate, env var, monitor.

---

→ [Bài tiếp theo: Log analysis Kibana](04-log-analysis-kibana.md)
