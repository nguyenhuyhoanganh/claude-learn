# Bài 7: Custom Resources & Operators (2025 updates)

## Vì sao K8s "extensible"?

Built-in K8s có Pod, Service, Deployment. Nhưng bạn muốn manage:
- PostgreSQL cluster (master/replica/backup).
- Kafka cluster (broker/topic/ACL).
- Cert-Manager (cấp cert tự động).
- ArgoCD application (GitOps).

K8s không biết gì về "PostgreSQL cluster". Nhưng bạn có thể **mở rộng K8s** để hiểu khái niệm này. Đó là **Custom Resource** + **Operator**.

CKA test phần này không deep (chỉ overview). Hiểu khái niệm là đủ.

## Custom Resource Definition (CRD)

> **CRD** = cách tạo **resource mới** trong K8s, ngoài built-in.

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.stable.example.com    # phải có dạng <plural>.<group>
spec:
  group: stable.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                schedule:
                  type: string
                source:
                  type: string
                destination:
                  type: string
  scope: Namespaced                    # hoặc Cluster
  names:
    plural: backups
    singular: backup
    kind: Backup
    shortNames:
      - bk
```

→ Định nghĩa resource type mới: `Backup`.

### Tạo Custom Resource (CR)

Sau khi apply CRD, bạn có thể dùng `kind: Backup`:

```yaml
apiVersion: stable.example.com/v1
kind: Backup
metadata:
  name: nightly-backup
spec:
  schedule: "0 2 * * *"
  source: /data
  destination: s3://my-bucket/backups
```

```bash
kubectl apply -f backup.yaml

# Như resource thường
kubectl get backups
# NAME             AGE
# nightly-backup   1m

kubectl get bk                       # short name
kubectl describe backup nightly-backup
```

→ K8s API đã có Backup resource. Nhưng **không có gì xử lý** — vì chưa có controller.

## Controller vs Operator

```text
Custom Resource (CR) = dữ liệu (declarative spec)
Controller            = logic xử lý CR

K8s built-in:
- Deployment (CR) + Deployment Controller (logic)
- Service (CR) + Endpoint Controller (logic)

Custom:
- Backup (CR) + Backup Controller (logic)
```

→ Để Backup CR có nghĩa, cần viết **Controller** watch event và làm gì đó.

### Operator pattern

> **Operator** = Controller cho Custom Resource, automate **operational knowledge** của 1 app cụ thể.

Operator là người thay vận hành thủ công:
```text
[Người DBA]                    [Postgres Operator]
- Setup master/replica         - Watch PostgresCluster CR
- Backup periodic              - Tạo Pod master + replica
- Promote replica khi master   - Tự setup replication
  die                          - Backup theo schedule
- Scale                        - Failover khi master die
- Upgrade                      - Scale theo .spec.replicas
                               - Rolling upgrade
```

Operator = "DBA in a Pod".

## Operator examples

Popular operator trong K8s ecosystem:

| Operator | Manage |
|---|---|
| **Cert-Manager** | TLS certificate (Let's Encrypt, internal CA) |
| **Prometheus Operator** | Prometheus + Alertmanager + ServiceMonitor |
| **PostgreSQL Operator** (Zalando, Crunchy) | PostgreSQL cluster |
| **Elastic Cloud on Kubernetes** | Elasticsearch + Kibana |
| **Strimzi Kafka** | Kafka cluster |
| **ArgoCD** | GitOps application |
| **Istio** | Service mesh config |
| **Velero** | Backup/restore |

→ Cài 1 lần (Operator + CRD), dùng nhiều — declare CR là xong.

## Architecture

```text
[User] kubectl apply -f mybackup.yaml (CR)
        │
        ▼
[apiserver]
        │ validate CR theo CRD schema
        │ lưu vào etcd
        ▼
[Backup Operator Pod] (chạy trong cluster)
   - WATCH apiserver: event tạo/sửa/xoá Backup CR
   - Khi có event:
     - Đọc spec.source, spec.destination
     - Tạo Pod job để rsync
     - Update status.lastBackupTime
        │
        ▼
[Backup Pod chạy]
   - Mount source volume
   - rsync đến destination
   - Pod exit
        │
        ▼
[Operator update Status CR]
   status:
     lastBackupTime: 2025-01-15T02:00:00Z
     succeeded: true
```

→ Operator chạy reconciliation loop giống built-in controller.

## Cài Operator (workflow chuẩn)

### Cài CRD + Operator

```bash
# Vd: Cert-Manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml
```

Cài đặt:
- CRDs: `Certificate`, `Issuer`, `ClusterIssuer`, `CertificateRequest`, ...
- Operator Deployment trong namespace `cert-manager`.
- RBAC cho operator.

### Dùng

```yaml
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: letsencrypt
  namespace: default
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: me@example.com
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      - http01:
          ingress:
            class: nginx

---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: my-cert
spec:
  secretName: my-tls-secret
  issuerRef:
    name: letsencrypt
    kind: Issuer
  dnsNames:
    - example.com
```

→ Apply. Cert-Manager Operator tự:
- Tạo CSR.
- Solve ACME challenge.
- Lưu cert vào Secret `my-tls-secret`.
- Renew tự động trước hết hạn.

User chỉ khai báo `Certificate` CR. Toàn bộ ops automated.

## Operator Framework

Tools để build Operator:
- **Operator SDK** (RedHat): Go, Ansible, Helm-based.
- **Kubebuilder**: Go-based, scaffold project.
- **KUDO**: declarative operator (YAML-based).
- **Metacontroller**: lightweight, gọi webhook.

```bash
# Quick start với Operator SDK
operator-sdk init --domain example.com --repo github.com/me/my-operator
operator-sdk create api --group apps --version v1 --kind Database
# Code reconcile logic in Go
# Build + deploy
```

→ Build operator phức tạp. CKA không test.

## Aggregated API Server

Cách khác extend K8s: **API Aggregation**.

Thay vì CRD + Controller, deploy **API server tự viết**:

```text
[apiserver chính]
        │
        │ Aggregation layer
        │ forward request /apis/<group>/* → custom API server
        ▼
[Custom API server (Pod trong cluster)]
   - Implement full REST API cho resource mới
   - Tự lưu trữ data (không cần etcd của K8s)
```

Ví dụ: **Metrics Server** dùng aggregation.

Ưu điểm so với CRD:
- Full control schema, validation, conversion.
- Custom storage (không phải etcd).

Nhược điểm:
- Phức tạp, viết code Go.

→ Production hiếm dùng. CRD phổ biến hơn.

## Conditions, Status, Subresources

Custom Resource có thể có:

### Status subresource

```yaml
apiVersion: stable.example.com/v1
kind: Backup
metadata:
  name: nightly
spec:
  schedule: "0 2 * * *"
status:                            # cập nhật bởi operator
  lastBackupTime: 2025-01-15T02:00:00Z
  succeededCount: 30
  failedCount: 0
  conditions:
    - type: Ready
      status: "True"
      reason: BackupCompleted
      message: Backup completed successfully
```

→ Best practice: operator chỉ update `status`, không sửa `spec`.

### Scale subresource

```yaml
# Trong CRD
spec:
  versions:
    - name: v1
      subresources:
        status: {}
        scale:
          specReplicasPath: .spec.replicas
          statusReplicasPath: .status.replicas
```

→ `kubectl scale --replicas=5 backup/nightly` hoạt động trên CR.

## Validation Webhook + Conversion Webhook

CRD có thể có:

### Validation Webhook

```yaml
spec:
  versions:
    - schema:
        openAPIV3Schema:
          properties:
            spec:
              properties:
                replicas:
                  type: integer
                  minimum: 1                # validate qua schema
                  maximum: 10
```

Hoặc custom validation:
```yaml
validation:
  openAPIV3Schema: ...
  webhookValidation:
    url: https://my-webhook.com/validate
```

### Conversion Webhook

Khi có nhiều version CRD (v1, v2), convert giữa các version. Phức tạp, hiếm dùng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Cài CRD nhưng quên Operator | CR tạo OK nhưng không làm gì | Cài cả 2 |
| Update spec từ Operator | Loop reconcile | Chỉ update status |
| CRD scope sai (Namespaced vs Cluster) | Resource ở sai phạm vi | Hiểu use case |
| Cài Operator nhưng RBAC không đủ | Operator log "forbidden" | Check ClusterRoleBinding |
| Xoá CRD trước CR | CR stuck không xoá | Xoá CR trước, CRD sau |
| Update CRD schema breaking | CR cũ invalid | Versioning v1, v2 + conversion |
| Operator chạy nhiều replica | Race condition | Leader election trong Operator |

## Quick reference

```bash
# List CRDs
kubectl get crd

# Get instance
kubectl get backups
kubectl describe backup my-backup

# Discover API resource
kubectl api-resources | grep example.com
kubectl explain backup.spec
kubectl explain backup --recursive

# Apply CRD then CR
kubectl apply -f crd.yaml
kubectl apply -f cr.yaml
```

```yaml
# CRD minimal
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: <plural>.<group>
spec:
  group: <group>
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec: { type: object }
  scope: Namespaced | Cluster
  names:
    plural: ...
    singular: ...
    kind: ...
```

## Tóm tắt bài 7

- **CRD** = define resource type mới. **Custom Resource** = instance của CRD.
- CRD một mình chỉ lưu data. Cần **Controller/Operator** xử lý logic.
- **Operator** = Controller + operational knowledge của 1 app. "DBA/SRE in a Pod".
- Popular operators: Cert-Manager, Prometheus Operator, PostgreSQL Operator, ArgoCD.
- Build Operator: Operator SDK, Kubebuilder, KUDO.
- Aggregated API Server: alternative cho CRD, full control nhưng phức tạp.
- CR có `status` subresource (operator update), `scale` subresource (kubectl scale).
- Validation qua OpenAPI schema hoặc webhook.

Phase 7 (Security) hoàn thành! Bạn đã master TLS, kubeconfig, RBAC, ServiceAccount, image security, NetworkPolicy, CRD/Operator.

**Bài kế tiếp** → [Phase 8 - Bài 1: Volumes & Persistent Volumes](../phase-8-storage/01-volumes-pv-pvc.md)
