# Bài 2: Tóm tắt Phase 16 — Kafka Security best practices

Phase 16 đã giới thiệu SASL/PLAIN và SASL/SSL. Bài này tổng kết best practices production và roadmap đến security topics khác chưa học.

## Quick reference matrix

| Use case | Protocol | Mechanism | Note |
|---|---|---|---|
| Local dev, single broker | PLAINTEXT | — | Default, không setup gì |
| Internal trusted network | SASL_PLAINTEXT | PLAIN | Auth nhưng không encrypt |
| Production over internet | SASL_SSL | PLAIN hoặc SCRAM | Bắt buộc encrypt |
| High-security (banking, gov) | SASL_SSL | GSSAPI (Kerberos) hoặc mTLS | Enterprise grade |
| Cloud-managed Kafka (Confluent, MSK) | SASL_SSL | PLAIN, SCRAM, hoặc OAUTHBEARER | Theo provider |
| OAuth2 / OIDC | SASL_SSL | OAUTHBEARER | Modern, federate với identity provider |

## SASL mechanisms — beyond PLAIN

PLAIN đơn giản nhất nhưng có nhược điểm: password gửi raw (trên SSL thì OK, trên PLAINTEXT thì lộ).

### SCRAM-SHA-256 / SCRAM-SHA-512

> SCRAM = **Salted Challenge Response Authentication Mechanism**

Cải tiến hơn PLAIN:
- Password KHÔNG gửi raw qua wire (kể cả trên PLAINTEXT).
- Hash + salt trên client side.
- Resistance to replay attack.

Setup:
```env
KAFKA_SASL_ENABLED_MECHANISMS=SCRAM-SHA-256
```

Client:
```yaml
sasl.mechanism: SCRAM-SHA-256
sasl.jaas.config: >
  org.apache.kafka.common.security.scram.ScramLoginModule required
  username="..."
  password="...";
```

User được tạo qua `kafka-configs.sh`:
```bash
./kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --add-config 'SCRAM-SHA-256=[password=secret123]' \
  --entity-type users --entity-name app-user
```

→ Recommend khi cần authentication trên network không tin tưởng.

### GSSAPI (Kerberos)

Enterprise standard. Setup phức tạp: cần KDC (Key Distribution Center), keytabs, principal.

Dùng khi:
- Tích hợp Active Directory.
- Multi-tenancy enterprise.
- Compliance yêu cầu cụ thể.

### OAUTHBEARER

Modern, integrate với OIDC / OAuth2 providers (Auth0, Okta, Azure AD, Keycloak).

Client lấy token từ identity provider → submit token → broker validate.

```yaml
sasl.mechanism: OAUTHBEARER
sasl.login.callback.handler.class: io.confluent.kafka.clients.plugins.auth.token.OAuthBearerTokenRefresher
```

Phù hợp với:
- Microservices architecture với centralized identity.
- Token rotation tự động.
- Federate identity across services.

## Authorization với ACL

Authentication = "anh là ai". Authorization = "anh được làm gì".

Authenticate xong, broker check **ACL (Access Control List)** xem user có quyền:
- READ / WRITE topic nào.
- Create / Delete topic.
- Join consumer group nào.

Setup ACL qua `kafka-acls.sh`:

```bash
# Allow app-user produce vào order-events
./kafka-acls.sh --bootstrap-server localhost:9092 \
  --add --allow-principal User:app-user \
  --operation Write --topic order-events

# Allow app-user consume từ order-events trong group payment-service
./kafka-acls.sh --bootstrap-server localhost:9092 \
  --add --allow-principal User:app-user \
  --operation Read --topic order-events \
  --group payment-service
```

Enable ACL ở broker:
```env
KAFKA_AUTHORIZER_CLASS_NAME=org.apache.kafka.metadata.authorizer.StandardAuthorizer
KAFKA_SUPER_USERS=User:admin
```

→ Principle of least privilege: chỉ grant đúng permission cần thiết.

## Secret management — production patterns

### Anti-pattern: hardcode trong YAML

```yaml
sasl.jaas.config: >
  ... password="secret123";        # ← KHÔNG BAO GIỜ
```

Risks:
- Commit vào Git → public Github → bots scan.
- Build artifact (JAR/Docker image) chứa password.
- Difficult to rotate.

### Pattern 1: Environment variables

```yaml
sasl.jaas.config: >
  ... password="${KAFKA_PASSWORD}";
```

```bash
# Kubernetes Secret
kubectl create secret generic kafka-creds \
  --from-literal=KAFKA_PASSWORD=secret123

# Mount as env var trong deployment
env:
  - name: KAFKA_PASSWORD
    valueFrom:
      secretKeyRef:
        name: kafka-creds
        key: KAFKA_PASSWORD
```

### Pattern 2: External secret store

| Tool | Use case |
|---|---|
| **HashiCorp Vault** | Multi-cloud, dynamic secrets, rotation |
| **AWS Secrets Manager** | AWS native, IAM-based access |
| **Azure Key Vault** | Azure native |
| **GCP Secret Manager** | GCP native |
| **Spring Cloud Config + Vault backend** | Spring native integration |

Integration với Spring:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-vault-config</artifactId>
</dependency>
```

```yaml
spring:
  config:
    import: vault://
  cloud:
    vault:
      uri: https://vault.acme.com
      authentication: KUBERNETES
      kubernetes:
        role: kafka-client
```

Spring auto fetch secrets từ Vault path → inject vào `${vault.kafka.password}`.

### Pattern 3: Cert-based auth (mTLS) — no password

mTLS authentication = client cert verify identity. **Không cần password**.

Cert có expiry → tự động rotate qua cert-manager (Kubernetes) hoặc AWS Private CA.

Đây là **gold standard** cho service-to-service trong cluster.

## TLS certificate management

### Cert chain

```text
Root CA (long-lived, offline)
   │
   ▼
Intermediate CA (1-5 năm)
   │
   ▼
Server/Client cert (3-12 tháng, auto rotate)
```

### Cert sources

- **Self-signed** (dev only): generate qua keytool, không trusted ngoài cluster.
- **Internal CA**: company-private CA (cfssl, OpenSSL, Vault PKI).
- **Public CA**: Let's Encrypt (free), AWS ACM, GCP Certificate Manager.
- **Cloud-managed**: Confluent Cloud, AWS MSK tự handle cert.

### Rotation strategy

Cert expire → app fail connection. Phải rotate trước khi expire.

- **Manual**: alert 30 ngày trước expire, ops update keystore.
- **Cert-manager** (K8s): auto rotate qua issuer.
- **Vault PKI**: cert ngắn hạn (24h-1week), auto rotate.

Best practice: cert càng ngắn càng tốt (giảm blast radius nếu cert leak). Combine với auto rotation.

## Security checklist — production

### Authentication
- [ ] Disable PLAINTEXT listener cho production.
- [ ] Dùng SASL_SSL (không SASL_PLAINTEXT).
- [ ] Mechanism preferred: SCRAM-SHA-256+ hoặc mTLS.
- [ ] Mỗi service có credential riêng (không share).
- [ ] Credential rotation policy (90 ngày max).

### Encryption
- [ ] SSL/TLS bắt buộc cho mọi external connection.
- [ ] Hostname verification enabled (`ssl.endpoint.identification.algorithm=https`).
- [ ] TLS version >= 1.2 (disable 1.0, 1.1).
- [ ] Cipher suite strong (AES-GCM, ChaCha20).
- [ ] Cert từ trusted CA.

### Authorization
- [ ] ACL enabled (Authorizer configured).
- [ ] Principle of least privilege (grant minimum).
- [ ] Audit log để track ACL changes.
- [ ] Super users restricted (chỉ admin team).

### Secret management
- [ ] KHÔNG hardcode secret trong code/YAML.
- [ ] External secret store (Vault, AWS SM, etc.).
- [ ] Secret rotation automated.
- [ ] Access to secret store logged + monitored.

### Network
- [ ] Broker không expose public internet (đặt sau VPN/private VPC).
- [ ] Firewall rules limit source IP.
- [ ] Separate listeners cho inter-broker vs external (Phase 9 đã học).
- [ ] DDoS protection ở load balancer/firewall layer.

### Monitoring
- [ ] Alert on failed authentication attempts (brute force detection).
- [ ] Alert on ACL violations.
- [ ] Cert expiry monitoring (alert 30 ngày trước).
- [ ] Audit log persisted + searchable.

## Common pitfalls

| Pitfall | Vấn đề | Sửa |
|---|---|---|
| Hardcode password trong YAML | Leak qua Git, Docker image | External secret store |
| Self-signed cert trong production | Browser/client distrust | Use CA-signed cert |
| Cert expire không monitor | App đột nhiên fail | Auto rotation + alert 30 ngày trước |
| Cùng password cho mọi service | Compromise 1 service = compromise toàn cluster | Per-service credential |
| Disable hostname verification ở production | MITM attack possible | Enable trừ khi có lý do rất tốt |
| Permissive ACL (allow `User:*`) | Privilege escalation | Explicit allow per principal |
| Plain text trên public network | Sniff password | SASL_SSL bắt buộc |
| Quên broker JAAS file | Server fail start | Mount + KAFKA_OPTS |
| Sai listener security protocol map | Mismatch broker vs client | Verify cùng protocol |

## Roadmap topics chưa cover

Phase 16 demo cơ bản. Production security còn:

| Topic | Description | Khi cần |
|---|---|---|
| **mTLS deep-dive** | Client cert authentication, cert rotation | Service-to-service in cluster |
| **SCRAM mechanisms** | Hashed password, more secure than PLAIN | Authentication on untrusted network |
| **Kerberos** | Enterprise auth, AD integration | Large enterprise |
| **OAuth2/OIDC** | Token-based, federate identity | Modern microservices |
| **ACL deep-dive** | Granular permission per topic/group | Multi-tenancy |
| **Confluent Cloud SSO** | Managed identity for cloud | Cloud Kafka |
| **Network policies** | Kubernetes NetworkPolicy, Istio | Service mesh |
| **Encryption at rest** | Encrypt disk where Kafka stores data | Compliance (PCI, HIPAA) |
| **Audit logging** | Track all auth + ACL events | Compliance |

## Tóm tắt bài 2 + Phase 16

- 4 protocol: PLAINTEXT (dev), SSL (encrypt-only), SASL_PLAINTEXT (auth, internal), SASL_SSL (production).
- SASL mechanisms beyond PLAIN: SCRAM (hashed), GSSAPI (Kerberos), OAUTHBEARER (modern OAuth2).
- Authentication ≠ Authorization. ACL cho phép control granular permission.
- Production: KHÔNG hardcode password. Dùng Vault, AWS SM, Kubernetes Secret.
- Cert management: shorter expiry + auto rotation > long-lived static cert.
- mTLS = gold standard cho service-to-service (no password, cert-based).
- Checklist 5 trụ cột: Authentication, Encryption, Authorization, Secret management, Monitoring.
- Phase 16 chỉ scratch the surface — full security architecture còn nhiều topic (Kerberos, OAuth2, ACL, encryption at rest, audit).

**Bài kế tiếp** → [Phase 17 - Netflux Final Project](../phase-17-netflux/01-project-overview.md)
