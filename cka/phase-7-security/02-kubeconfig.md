# Bài 2: KubeConfig — Quản lý connection đến cluster

## Vì sao kubeconfig quan trọng?

Mỗi lần bạn gõ `kubectl get pods`, kubectl đọc **kubeconfig** để biết:
- Connect đến cluster nào (URL + cert CA).
- Auth as ai (cert/token/credentials).
- Default namespace nào.

CKA exam dùng kubeconfig nhiều — switch context giữa nhiều cluster, debug khi `kubectl` báo connection refused.

## File kubeconfig mặc định

```bash
# Location
ls ~/.kube/
# config

cat ~/.kube/config
```

```yaml
apiVersion: v1
kind: Config

clusters:                          # Cluster nào (URL + CA)
  - name: kubernetes
    cluster:
      server: https://192.168.1.10:6443
      certificate-authority-data: <base64-encoded-ca.crt>

users:                             # User nào (cred)
  - name: kubernetes-admin
    user:
      client-certificate-data: <base64-cert>
      client-key-data: <base64-key>

contexts:                          # Combo cluster + user + namespace
  - name: kubernetes-admin@kubernetes
    context:
      cluster: kubernetes
      user: kubernetes-admin
      namespace: default

current-context: kubernetes-admin@kubernetes
```

→ 3 phần chính: `clusters`, `users`, `contexts`. `current-context` chỉ context đang active.

## 3 khái niệm trong kubeconfig

### Cluster

Định nghĩa cluster K8s:
```yaml
clusters:
  - name: prod-cluster
    cluster:
      server: https://prod.example.com:6443
      certificate-authority: /path/to/ca.crt
      # hoặc inline:
      certificate-authority-data: <base64>
      insecure-skip-tls-verify: false        # skip TLS verify (cẩn thận)
```

### User

Định nghĩa credential:
```yaml
users:
  - name: alice
    user:
      # Cert-based
      client-certificate: /path/to/alice.crt
      client-key: /path/to/alice.key
      
      # Hoặc token-based
      token: abc123...
      
      # Hoặc exec plugin (cho cloud auth)
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: aws
        args: ["eks", "get-token", "--cluster-name", "prod"]
```

### Context

Kết hợp cluster + user + namespace:
```yaml
contexts:
  - name: alice-prod
    context:
      cluster: prod-cluster
      user: alice
      namespace: dev-namespace
```

→ Switch context = switch combo (3 thứ đổi cùng).

## Quản lý kubeconfig với kubectl

### Xem config hiện tại

```bash
kubectl config view
# Hiển thị config, ẩn cert/key (replaced với "REDACTED")

# Đầy đủ
kubectl config view --raw

# Chỉ current context
kubectl config view --minify
```

### List

```bash
# Cluster
kubectl config get-clusters

# User
kubectl config get-users

# Context
kubectl config get-contexts
# CURRENT   NAME                          CLUSTER      AUTHINFO            NAMESPACE
# *         kubernetes-admin@kubernetes   kubernetes   kubernetes-admin    default
```

### Switch context

```bash
kubectl config use-context alice-prod
# Switched to context "alice-prod"

# Verify
kubectl config current-context
# alice-prod
```

### Thêm cluster

```bash
kubectl config set-cluster prod-cluster \
  --server=https://prod.example.com:6443 \
  --certificate-authority=/path/to/ca.crt
```

### Thêm user

```bash
# Cert-based
kubectl config set-credentials alice \
  --client-certificate=alice.crt \
  --client-key=alice.key

# Token-based
kubectl config set-credentials bob --token=abc123
```

### Thêm context

```bash
kubectl config set-context alice-prod \
  --cluster=prod-cluster \
  --user=alice \
  --namespace=dev
```

### Đổi namespace mặc định

```bash
# Cho current context
kubectl config set-context --current --namespace=monitoring

# Bây giờ kubectl get pods → namespace=monitoring
```

→ Phổ biến trong exam khi làm nhiều với 1 namespace.

### Xoá

```bash
kubectl config delete-context alice-prod
kubectl config delete-cluster prod-cluster
kubectl config delete-user alice
```

## Quản lý nhiều cluster

Production thường có nhiều cluster: dev, staging, prod.

### Cách 1: Một file kubeconfig

```yaml
clusters:
  - name: dev
    cluster: { server: https://dev:6443 }
  - name: prod
    cluster: { server: https://prod:6443 }

users:
  - name: admin
    user: { client-certificate-data: ... }

contexts:
  - name: dev-ctx
    context: { cluster: dev, user: admin }
  - name: prod-ctx
    context: { cluster: prod, user: admin }
```

Switch:
```bash
kubectl config use-context dev-ctx
kubectl config use-context prod-ctx
```

### Cách 2: Nhiều file

```bash
ls ~/.kube/
# config       (default)
# dev.config
# prod.config

# Specify file
kubectl --kubeconfig=~/.kube/prod.config get pods

# Hoặc env
export KUBECONFIG=~/.kube/prod.config
kubectl get pods

# Merge nhiều file
export KUBECONFIG=~/.kube/dev.config:~/.kube/prod.config
kubectl config get-contexts        # thấy contexts từ cả 2 file
```

→ Cách 2 phổ biến khi mỗi cluster có team riêng.

## Tools để switch nhanh

### kubectx + kubens

Cài:
```bash
brew install kubectx       # macOS
# hoặc git clone https://github.com/ahmetb/kubectx /opt/kubectx
```

Sử dụng:
```bash
# kubectx — switch context
kubectx                    # list
kubectx dev-ctx            # switch
kubectx -                  # về context trước

# kubens — switch namespace
kubens                     # list namespace
kubens kube-system         # switch
```

→ Save **rất nhiều** thời gian. Khuyên dùng cho exam.

## Imperative tạo kubeconfig từ scratch

CKA scenario: "Tạo kubeconfig cho user alice với cert alice.crt + key alice.key".

```bash
# Build file mới
kubectl config set-cluster prod \
  --server=https://prod:6443 \
  --certificate-authority=/path/to/ca.crt \
  --embed-certs=true \                            # embed CA vào file (không trỏ path)
  --kubeconfig=alice.kubeconfig

kubectl config set-credentials alice \
  --client-certificate=alice.crt \
  --client-key=alice.key \
  --embed-certs=true \
  --kubeconfig=alice.kubeconfig

kubectl config set-context alice-ctx \
  --cluster=prod --user=alice \
  --kubeconfig=alice.kubeconfig

kubectl config use-context alice-ctx \
  --kubeconfig=alice.kubeconfig

# Test
kubectl --kubeconfig=alice.kubeconfig get pods
```

→ File `alice.kubeconfig` chuẩn để share cho alice.

## Cấu trúc cluster kubeadm

Sau khi cài kubeadm:
```bash
ls /etc/kubernetes/
# admin.conf                  ← kubeconfig cho admin
# kubelet.conf                ← cho kubelet
# scheduler.conf              ← cho scheduler
# controller-manager.conf     ← cho controller-manager
```

Mỗi component có kubeconfig riêng để connect apiserver:
```bash
sudo cat /etc/kubernetes/scheduler.conf
# Là kubeconfig file
# Cluster + user (scheduler) + context
```

→ Đây là cách K8s component authenticate với apiserver.

User admin dùng file:
```bash
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

→ Sau `kubeadm init`, copy `admin.conf` → `~/.kube/config` để dùng kubectl.

## Common patterns

### View cluster name từ context

```bash
kubectl config current-context
# alice-prod

# Cluster name của context
kubectl config view -o jsonpath='{.contexts[?(@.name == "alice-prod")].context.cluster}'
# prod-cluster
```

### Switch giữa cluster + user

```bash
# Tạm dùng context khác cho 1 lệnh
kubectl --context=prod-ctx get pods
kubectl --context=dev-ctx apply -f deploy.yaml

# Hoặc per-resource
kubectl get pods --context=prod-ctx --namespace=app
```

### Skip TLS verify (lab only)

```bash
# Khi cert không trusted (CA self-signed)
kubectl config set-cluster lab \
  --server=https://lab:6443 \
  --insecure-skip-tls-verify=true
```

→ **KHÔNG dùng production**. Chỉ debug.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Forget switch context | Thao tác trên cluster sai | `kubectl config current-context` trước mỗi action critical |
| KUBECONFIG env override file mặc định | Lệnh không như mong | `unset KUBECONFIG` để reset |
| Cert path tương đối | File invalid khi di chuyển | `--embed-certs=true` |
| Share kubeconfig có private key | Lộ credential | Tạo cred riêng cho mỗi user |
| Mix namespace mặc định | Pod ở namespace lạ | `set-context --current --namespace=X` |
| Quên `~/.kube/config` permission | "permission denied" | `chmod 600 ~/.kube/config` |
| Nhiều cluster cùng tên | Conflict trong merged config | Đặt tên unique |

## Quick reference

```bash
# View
kubectl config view
kubectl config view --minify              # only current
kubectl config current-context

# List
kubectl config get-clusters
kubectl config get-users
kubectl config get-contexts

# Switch
kubectl config use-context <name>

# Modify
kubectl config set-cluster X --server=... --certificate-authority=...
kubectl config set-credentials Y --client-certificate=... --client-key=...
kubectl config set-context Z --cluster=X --user=Y --namespace=N
kubectl config set-context --current --namespace=N

# Delete
kubectl config delete-context X
kubectl config delete-cluster X
kubectl config delete-user X

# Use file khác
kubectl --kubeconfig=file get pods
export KUBECONFIG=file1:file2

# Tools
kubectx                   # list contexts
kubectx <name>            # switch
kubens                    # list namespaces
kubens <name>             # switch
```

## Tóm tắt bài 2

- **Kubeconfig** = file YAML định nghĩa cluster + user + context.
- Default location: `~/.kube/config`. Override với `KUBECONFIG` env hoặc `--kubeconfig`.
- **Cluster**: URL + CA cert. **User**: credential. **Context**: combo.
- Switch nhanh: `kubectl config use-context <name>` hoặc `kubectx`.
- Đổi namespace mặc định: `kubectl config set-context --current --namespace=X`.
- Component K8s (kubelet, scheduler, controller) đều dùng kubeconfig riêng.
- Production: nhiều cluster → merge KUBECONFIG nhiều file.
- `kubectx` + `kubens` = phải có cho CKA exam (tiết kiệm thời gian).

**Bài kế tiếp** → [Bài 3: Authentication + Authorization + RBAC](03-rbac-authorization.md)
