# Bài 5: Environment Variables & ConfigMaps

## Environment Variables Cơ Bản

Trong container spec, dùng `env` key:

```yaml
containers:
  - name: my-app
    image: my-image
    env:
      - name: STORY_FOLDER       # Tên env var
        value: story             # Giá trị

      - name: NODE_ENV
        value: production

      - name: PORT
        value: "3000"            # Strings cần dùng quotes
```

### Trong Code (Node.js)

```javascript
// Trước: hard-coded
const folder = 'story';

// Sau: dùng env var
const folder = process.env.STORY_FOLDER;
```

---

## Vấn Đề: Env Vars Hard-coded trong YAML

```
Vấn đề:
  → Nhiều Deployments dùng cùng env vars
  → Phải update nhiều files khi thay đổi
  → Khó quản lý, dễ sai sót

Giải pháp: ConfigMap
  → Tách env vars ra thành resource riêng
  → Nhiều Deployments có thể reference cùng 1 ConfigMap
  → Chỉ cần update 1 chỗ
```

---

## ConfigMap — Resource Quản Lý Config

### Tạo ConfigMap

```yaml
# environment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: data-store-env      # Tên ConfigMap

data:                        # Không dùng "spec", dùng "data"
  folder: story              # key: value
  database: my-db
  port: "3000"
```

```bash
kubectl apply -f environment.yaml
kubectl get configmap
kubectl describe configmap data-store-env
```

```
Name: data-store-env
Data
====
folder:  5 bytes
```

### Dùng ConfigMap trong Container

```yaml
containers:
  - name: my-app
    env:
      - name: STORY_FOLDER        # Tên env var trong container
        valueFrom:
          configMapKeyRef:
            name: data-store-env  # Tên ConfigMap
            key: folder           # Key trong ConfigMap data
```

---

## Toàn Bộ Flow

```
ConfigMap (data-store-env):
  data:
    folder: story

Deployment:
  env:
    - name: STORY_FOLDER
      valueFrom:
        configMapKeyRef:
          name: data-store-env
          key: folder

Container chạy với:
  STORY_FOLDER=story
```

---

## Nhiều Env Vars từ ConfigMap

```yaml
# Cách 1: Lấy từng key
env:
  - name: STORY_FOLDER
    valueFrom:
      configMapKeyRef:
        name: data-store-env
        key: folder

  - name: DB_NAME
    valueFrom:
      configMapKeyRef:
        name: data-store-env
        key: database

# Cách 2: Lấy tất cả keys từ ConfigMap (prefix optional)
envFrom:
  - configMapRef:
      name: data-store-env
    # Keys từ ConfigMap trở thành env vars với tên gốc
```

---

## ConfigMap vs Hard-coded env

| | Hard-coded value | ConfigMap |
|---|---|---|
| **Cú pháp** | `value: story` | `valueFrom: configMapKeyRef...` |
| **Reuse** | Không | Nhiều Deployments |
| **Update** | Phải edit nhiều files | Chỉ edit ConfigMap |
| **Git-friendly** | OK | Tốt hơn (tách config) |
| **Use case** | Đơn giản | Production, nhiều services |

---

## Secrets (Tương Tự ConfigMap)

Cho sensitive data (passwords, API keys):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
type: Opaque
data:
  password: dGVzdDEyMw==     # Base64 encoded
```

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: my-secret
        key: password
```

---

**Tiếp theo:** Tổng kết Phase 13 →
