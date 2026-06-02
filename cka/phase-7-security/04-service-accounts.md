# Bài 4: ServiceAccounts — Identity cho Pod

## Vì sao cần ServiceAccount?

User (alice, bob) đại diện **con người**. Nhưng Pod cũng cần **identity** để gọi K8s API:
- Operator Pod tạo/xoá Pod khác.
- Deployment Pod đọc ConfigMap.
- Monitoring Pod list Pod metric.

→ **ServiceAccount** = identity cho Pod (và process internal).

```text
User authentication (cho human):
   - Cert / OIDC token / external auth
   - Lưu trong kubeconfig

ServiceAccount (cho Pod):
   - JWT token tự gen bởi K8s
   - Auto mount vào Pod
```

## Tạo ServiceAccount

```bash
kubectl create serviceaccount my-sa -n dev
```

Hoặc YAML:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
  namespace: dev
```

## Default ServiceAccount

Mỗi namespace có **default SA** tự tạo:

```bash
kubectl get sa
# NAME      SECRETS   AGE
# default   1         30d         ← tự tạo
# my-sa     1         5m
```

→ Pod không chỉ định SA → dùng `default`. Default SA **không có permission** ngoài "read-only public info" — đủ an toàn.

## Gắn SA cho Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: dev
spec:
  serviceAccountName: my-sa       # ← chỉ định
  containers:
    - name: app
      image: nginx
```

Pod mount token tự động:
```bash
kubectl exec my-pod -- ls /var/run/secrets/kubernetes.io/serviceaccount
# ca.crt
# namespace
# token
```

→ Pod đọc `/var/run/secrets/kubernetes.io/serviceaccount/token` → dùng làm Bearer token gọi apiserver.

## Token — Cách hoạt động

### Trước K8s 1.24

K8s tự tạo Secret chứa long-lived token cho mỗi SA:

```bash
kubectl get secret -n dev
# my-sa-token-abc12   kubernetes.io/service-account-token   3   5m

# Token JWT (sống mãi)
kubectl get secret my-sa-token-abc12 -o jsonpath='{.data.token}' | base64 -d
```

### Từ K8s 1.24+

Default behavior thay đổi:
- **Không tự tạo Secret token nữa** (security risk).
- Pod mount **projected volume** với token **short-lived** (1 giờ, auto-refresh).
- Token bind vào Pod cụ thể.

```bash
# Generate manual token
kubectl create token my-sa
# eyJhbGciOiJSUzI1NiIs...

kubectl create token my-sa --duration=24h
```

→ Nếu cần token lâu dài (CI/CD), tạo Secret manual:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-sa-token
  annotations:
    kubernetes.io/service-account.name: my-sa
type: kubernetes.io/service-account-token
```

```bash
kubectl apply -f secret.yaml

# Lấy token
kubectl get secret my-sa-token -o jsonpath='{.data.token}' | base64 -d
```

## Disable auto-mount

```yaml
spec:
  serviceAccountName: my-sa
  automountServiceAccountToken: false       # disable mount
  containers:
    - name: app
      image: nginx
```

→ Pod **không** có token mount. Dùng khi Pod không cần API call (vd: nginx static).

Hoặc disable cho **toàn ServiceAccount**:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
automountServiceAccountToken: false
```

Best practice: disable cho mọi Pod không cần.

## RBAC cho ServiceAccount

ServiceAccount **không có permission** mặc định. Phải gán RoleBinding:

```yaml
# Role: read Pod
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: dev
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]

---
# Bind SA
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-sa-can-read-pods
  namespace: dev
subjects:
  - kind: ServiceAccount
    name: my-sa
    namespace: dev                          # SA có namespace, khác User
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

→ Pod gắn SA `my-sa` → có thể `kubectl get pods` (qua client lib trong Pod).

## Username + Group format

ServiceAccount identify:
```text
Username: system:serviceaccount:<namespace>:<sa-name>
Groups:   system:serviceaccounts
          system:serviceaccounts:<namespace>
          system:authenticated
```

Ví dụ SA `my-sa` trong `dev`:
```text
Username: system:serviceaccount:dev:my-sa
Groups:   system:serviceaccounts
          system:serviceaccounts:dev
          system:authenticated
```

→ Có thể bind permission cho **mọi SA trong 1 namespace**:

```yaml
subjects:
  - kind: Group
    name: system:serviceaccounts:dev       # mọi SA trong dev
```

→ Hữu ích nhưng nguy hiểm (đừng dùng cho cluster-admin).

## Use case thực tế

### 1. Pod gọi K8s API

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-lister-sa
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: pod-lister
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["list"]
---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: pod-lister
subjects:
  - kind: ServiceAccount
    name: pod-lister-sa
roleRef:
  kind: Role
  name: pod-lister
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: pod-lister-sa
  containers:
    - name: app
      image: my-app                         # app dùng K8s client lib → list pods
```

Trong code (vd Python):
```python
from kubernetes import client, config

config.load_incluster_config()              # load token từ /var/run/secrets/
v1 = client.CoreV1Api()

pods = v1.list_namespaced_pod(namespace='default')
for pod in pods.items:
    print(pod.metadata.name)
```

### 2. Operator pattern

Operator (vd Prometheus Operator) chạy như Pod, manage CRD:
```yaml
spec:
  serviceAccountName: prometheus-operator
```

SA `prometheus-operator` cần quyền:
- `create/delete pods` cho exporter.
- `get/list/watch` ServiceMonitor (CRD).
- `update` status Prometheus instance.

### 3. CI/CD authenticate

CI/CD pipeline cần deploy vào cluster:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployer
  namespace: ci
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: deployer-can-deploy
subjects:
  - kind: ServiceAccount
    name: deployer
    namespace: ci
roleRef:
  kind: ClusterRole
  name: cluster-admin                       # broad — careful!
  apiGroup: rbac.authorization.k8s.io
```

Lấy token dùng trong CI:
```bash
TOKEN=$(kubectl create token deployer -n ci --duration=24h)
# Use trong CI script:
kubectl --token=$TOKEN --server=https://cluster:6443 apply -f deploy.yaml
```

## ImagePullSecrets — Pull private registry

SA có thể chứa `imagePullSecrets` — Pod dùng SA không cần khai lại:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
imagePullSecrets:
  - name: my-registry-secret
```

```yaml
# Pod
spec:
  serviceAccountName: my-sa
  containers:
    - image: private-registry.com/app:v1     # tự dùng creds từ SA
```

→ Tiện khi nhiều Pod cần cùng registry credential.

## Workload Identity (Cloud)

Production cloud (EKS, GKE) thay vì lưu cloud creds trong Secret:

### AWS — IRSA (IAM Roles for Service Accounts)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123:role/app-role
```

Pod gắn SA này → AWS SDK trong Pod tự assume role qua OIDC. Không cần `AWS_ACCESS_KEY_ID`.

### GCP — Workload Identity

```yaml
metadata:
  annotations:
    iam.gke.io/gcp-service-account: app@project.iam.gserviceaccount.com
```

→ Phase 7 advanced. CKA không test deep.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Pod không chỉ định SA | Dùng `default` SA (no permission) | Tạo SA riêng cho Pod |
| Default SA có cluster-admin | Pod compromise = cluster compromise | KHÔNG bind cluster-admin cho default |
| Token long-lived hardcode | Lộ → ai cũng dùng được | Token short-lived qua TokenRequest |
| SA có quá nhiều quyền | Pod compromise nguy hiểm | Least privilege |
| Quên `subjects.namespace` cho SA | Bind không có effect | SA cần `namespace` trong subjects |
| `automountServiceAccountToken: true` cho mọi Pod | Token mount không cần thiết | Disable nếu Pod không gọi API |
| K8s 1.24+ không thấy Secret SA | Default không tạo nữa | Tạo Secret manual hoặc dùng `kubectl create token` |

## Quick reference

```bash
# Tạo SA
kubectl create sa my-sa -n dev

# Generate token
kubectl create token my-sa --duration=24h

# Bind permission
kubectl create rolebinding my-sa-bind \
  --role=pod-reader \
  --serviceaccount=dev:my-sa \
  -n dev

# Verify
kubectl auth can-i list pods --as=system:serviceaccount:dev:my-sa -n dev
```

```yaml
# Pod gắn SA
spec:
  serviceAccountName: my-sa
  automountServiceAccountToken: true    # default

# SA với imagePullSecret
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
imagePullSecrets:
  - name: registry-creds

# SA bind RBAC
subjects:
  - kind: ServiceAccount
    name: my-sa
    namespace: dev                      # SA cần namespace
```

## Tóm tắt bài 4

- **ServiceAccount** = identity cho Pod / process internal.
- Mỗi namespace có **default SA** auto. Default không có permission đặc biệt.
- Token JWT auto mount tại `/var/run/secrets/kubernetes.io/serviceaccount/`.
- K8s 1.24+: token **short-lived** (1h, auto-refresh) via projected volume.
- Username SA: `system:serviceaccount:<ns>:<sa-name>`. Group: `system:serviceaccounts:<ns>`.
- Bind RBAC cho SA giống User, nhưng `subjects.kind: ServiceAccount` + `namespace`.
- `imagePullSecrets` trong SA → Pod dùng SA không cần khai.
- Production cloud: **Workload Identity** (IRSA AWS, GCP WI) thay cred hardcode.
- Disable `automountServiceAccountToken` cho Pod không cần API.

**Bài kế tiếp** → [Bài 5: Image Security + Security Context](05-image-security-context.md)
