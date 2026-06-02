# Bài 3: Environment Variables & ConfigMaps

## Vì sao bài này quan trọng?

Container của bạn cần config:
- Database URL.
- API endpoint.
- Feature flag.
- Log level.

Hardcode trong image → mỗi env (dev/staging/prod) phải build image riêng → khổ.

→ Pass config qua **environment variable**. Lưu config tập trung trong **ConfigMap**.

## Cách 1: Plain env trong Pod spec

```yaml
spec:
  containers:
    - name: app
      image: my-app
      env:
        - name: DATABASE_URL
          value: "postgres://localhost:5432/mydb"
        - name: LOG_LEVEL
          value: "info"
        - name: FEATURE_X
          value: "true"
```

→ Đơn giản. Nhược điểm: config nằm trong YAML Pod — sửa cần rolling update.

## Khi nào cần ConfigMap?

```text
[10 Pod cùng config DATABASE_URL]

Cách plain env:
- 10 file YAML có DATABASE_URL hardcode
- Đổi URL → sửa 10 file → apply 10 file
- Mất sync dễ

Cách ConfigMap:
- 1 ConfigMap chứa DATABASE_URL
- 10 Pod reference ConfigMap đó
- Đổi URL → sửa 1 ConfigMap
```

→ Centralize config.

## Tạo ConfigMap

### Cách 1: Imperative `--from-literal`

```bash
kubectl create configmap app-config \
  --from-literal=DATABASE_URL=postgres://localhost:5432/mydb \
  --from-literal=LOG_LEVEL=info
```

### Cách 2: Imperative `--from-file`

```bash
# File config.properties
DATABASE_URL=postgres://localhost:5432/mydb
LOG_LEVEL=info

kubectl create configmap app-config --from-file=config.properties
```

→ Key = tên file (`config.properties`), value = nội dung file.

Đa file:
```bash
kubectl create configmap app-config \
  --from-file=app.properties \
  --from-file=db.properties
```

Hoặc cả folder:
```bash
kubectl create configmap app-config --from-file=./config-dir/
```

### Cách 3: Declarative YAML

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_URL: postgres://localhost:5432/mydb
  LOG_LEVEL: info
  # value đa dòng:
  nginx.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://backend;
      }
    }
```

```bash
kubectl apply -f configmap.yaml
```

## Xem ConfigMap

```bash
# List
kubectl get configmaps        # alias: cm

# Chi tiết
kubectl describe cm app-config
# Data
# ====
# DATABASE_URL:
# ----
# postgres://localhost:5432/mydb
# LOG_LEVEL:
# ----
# info

# YAML
kubectl get cm app-config -o yaml
```

## Inject ConfigMap vào Pod

### Cách 1: Tất cả key thành env (envFrom)

```yaml
spec:
  containers:
    - name: app
      image: my-app
      envFrom:
        - configMapRef:
            name: app-config
```

→ Tất cả key trong ConfigMap thành env. Trong container:
```bash
echo $DATABASE_URL    # postgres://localhost:5432/mydb
echo $LOG_LEVEL       # info
```

### Cách 2: Chọn key cụ thể

```yaml
spec:
  containers:
    - name: app
      image: my-app
      env:
        - name: DB_URL                    # tên env trong container
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DATABASE_URL           # key trong ConfigMap
```

→ Đổi tên env, chọn key. Flexibility cao.

### Cách 3: Mount như volume

```yaml
spec:
  containers:
    - name: app
      image: my-app
      volumeMounts:
        - name: config
          mountPath: /etc/config
  volumes:
    - name: config
      configMap:
        name: app-config
```

Trong container:
```bash
ls /etc/config/
# DATABASE_URL  LOG_LEVEL  nginx.conf

cat /etc/config/DATABASE_URL
# postgres://localhost:5432/mydb
```

→ Mỗi key = 1 file. Hữu ích cho **config file** (vd: `nginx.conf`).

### Cách 4: Mount + chọn item

```yaml
spec:
  containers:
    - name: nginx
      image: nginx
      volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d
  volumes:
    - name: nginx-config
      configMap:
        name: app-config
        items:
          - key: nginx.conf
            path: default.conf       # file name khác trong mount
```

→ Mount `nginx.conf` thành `/etc/nginx/conf.d/default.conf`.

## ConfigMap update — Pod tự reload?

Tuỳ cách inject:

| Cách inject | Pod reload khi ConfigMap đổi? |
|---|---|
| **`env` / `envFrom`** | ✗ Không. Phải restart Pod để env mới có hiệu lực. |
| **Volume mount** | ✓ File update sau ~60s, nhưng app phải watch file để reload |

→ Best practice: app reload config khi file đổi (vd nginx `nginx -s reload`).

Hoặc trigger rollout sau khi update ConfigMap:
```bash
kubectl edit cm app-config
kubectl rollout restart deployment/my-app
```

## ConfigMap immutable

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
immutable: true                # K8s 1.21+
data:
  DATABASE_URL: ...
```

→ ConfigMap không thể sửa (chỉ xoá + tạo lại). Lợi:
- Tránh accidentally update.
- Performance better (apiserver không watch).

## Secret — Như ConfigMap nhưng cho dữ liệu nhạy cảm

```text
ConfigMap: plain text (DATABASE_URL, LOG_LEVEL)
Secret:    base64 encoded (password, API key, cert)
```

### Tạo Secret

#### Imperative

```bash
kubectl create secret generic app-secret \
  --from-literal=DB_PASSWORD=admin123 \
  --from-literal=API_KEY=sk-xxx
```

#### Declarative YAML

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
data:                          # value phải base64 encoded
  DB_PASSWORD: YWRtaW4xMjM=    # base64(admin123)
  API_KEY: c2steHh4            # base64(sk-xxx)
```

Encode trên Linux/Mac:
```bash
echo -n 'admin123' | base64
# YWRtaW4xMjM=

# Decode
echo -n 'YWRtaW4xMjM=' | base64 --decode
# admin123
```

→ `-n` cực kỳ quan trọng (không thêm newline).

### Hoặc dùng `stringData` (K8s tự encode)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
stringData:                    # plain text, K8s auto base64
  DB_PASSWORD: admin123
  API_KEY: sk-xxx
```

→ User-friendly hơn. K8s convert sang `data` khi lưu.

### Xem Secret

```bash
kubectl get secrets
# NAME           TYPE     DATA   AGE
# app-secret     Opaque   2      5s

kubectl describe secret app-secret
# Data
# ====
# API_KEY:      6 bytes
# DB_PASSWORD:  8 bytes           ← ẩn value

kubectl get secret app-secret -o yaml
# data:
#   API_KEY: c2steHh4              ← base64 (không an toàn)
#   DB_PASSWORD: YWRtaW4xMjM=

# Decode
kubectl get secret app-secret -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode
# admin123
```

### Inject Secret vào Pod

Giống ConfigMap, đổi `configMapRef` → `secretRef`:

```yaml
spec:
  containers:
    - name: app
      image: my-app
      envFrom:
        - secretRef:
            name: app-secret

      # Hoặc từng key
      env:
        - name: PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secret
              key: DB_PASSWORD

      # Hoặc mount volume
      volumeMounts:
        - name: secret-vol
          mountPath: /etc/secrets
          readOnly: true
  volumes:
    - name: secret-vol
      secret:
        secretName: app-secret
```

## Secret types

| Type | Use case |
|---|---|
| `Opaque` | Generic data (default) |
| `kubernetes.io/tls` | TLS cert + key |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/basic-auth` | Username + password |
| `kubernetes.io/ssh-auth` | SSH key |
| `kubernetes.io/service-account-token` | SA token |

### TLS Secret

```bash
kubectl create secret tls my-tls \
  --cert=path/to/cert.crt \
  --key=path/to/cert.key
```

### Docker registry Secret

```bash
kubectl create secret docker-registry myregistry \
  --docker-server=myregistry.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=me@example.com
```

Pod dùng để pull private image:
```yaml
spec:
  imagePullSecrets:
    - name: myregistry
  containers:
    - image: myregistry.com/private-image
```

## Secret KHÔNG phải encryption!

```text
Default: Secret chỉ base64 encode = không secret thật

Trên etcd:
- ConfigMap: plain text
- Secret:    plain text (base64 trong DB, decode dễ)

Ai có quyền read etcd → đọc được Secret value
```

→ Default Secret **không an toàn**. Cần **encryption at rest** ở etcd (bài kế tiếp).

## Best practice với Secret

```text
✓ Encryption at rest cho etcd (xem demo bài sau)
✓ RBAC strict — chỉ Pod/ServiceAccount cần Secret được read
✓ Audit log — log mọi access tới Secret
✓ External secret manager (Vault, AWS Secrets Manager, Sealed Secrets)
✓ Rotation policy — định kỳ đổi password
✗ KHÔNG commit Secret YAML vào Git (base64 != encryption)
✗ KHÔNG log Secret value
✗ KHÔNG share Secret giữa namespace nếu không cần
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `-n` trong `echo` | Base64 sai (có newline) | `echo -n 'value' \| base64` |
| Commit secret.yaml vào Git | Lộ password | `.gitignore` hoặc Sealed Secret |
| ConfigMap đổi nhưng Pod env không refresh | Bug "config không có hiệu lực" | `kubectl rollout restart` |
| Mount Secret nhưng quên `readOnly` | Pod có thể ghi → risk | `readOnly: true` |
| Quên `imagePullSecrets` cho private image | ImagePullBackOff | Tạo docker-registry Secret + reference |
| Secret base64 = encryption | Lộ khi ai đó đọc etcd | Bật encryption at rest |
| ConfigMap data quá lớn (> 1MB) | Apply fail | Tách thành nhiều ConfigMap hoặc dùng volume |

## Quick reference

```bash
# ConfigMap
kubectl create cm app-config --from-literal=KEY=value
kubectl create cm app-config --from-file=config.txt
kubectl get cm
kubectl describe cm app-config
kubectl delete cm app-config

# Secret
kubectl create secret generic app-secret --from-literal=PASS=admin
kubectl create secret tls my-tls --cert=cert.crt --key=cert.key
kubectl create secret docker-registry myreg --docker-server=... --docker-username=...
kubectl get secrets
kubectl get secret app-secret -o jsonpath='{.data.PASS}' | base64 -d

# Pod inject
envFrom:
  - configMapRef: { name: app-config }
  - secretRef: { name: app-secret }

env:
  - name: DB_URL
    valueFrom:
      configMapKeyRef: { name: app-config, key: DATABASE_URL }
  - name: PASSWORD
    valueFrom:
      secretKeyRef: { name: app-secret, key: DB_PASSWORD }

volumes:
  - name: config
    configMap: { name: app-config }
  - name: secret
    secret: { secretName: app-secret }
```

## Tóm tắt bài 3

- **Env variable** trong Pod spec: nhanh, không reuse.
- **ConfigMap**: lưu config tập trung, plain text.
- **Secret**: lưu dữ liệu nhạy cảm, **base64 encoded** (KHÔNG phải encryption).
- 4 cách inject: `envFrom`, `env.valueFrom`, volume mount, items chọn.
- ConfigMap update qua `env` → Pod KHÔNG tự refresh. Qua volume → file update sau ~60s.
- Secret types: Opaque (default), tls, dockerconfigjson, basic-auth, ssh-auth.
- `imagePullSecrets` cho private registry image.
- Production: **encryption at rest** cho etcd + external secret manager.

**Bài kế tiếp** → [Bài 4: Encryption at Rest & Multi-Container Pods](04-encryption-multi-container.md)
