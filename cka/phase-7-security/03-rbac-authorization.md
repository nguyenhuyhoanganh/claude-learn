# Bài 3: Authentication + Authorization + RBAC

## Workflow security trong K8s

```text
[User: kubectl get pods]
        │
        ▼
[apiserver receive request]
        │
        ▼
[1. AUTHENTICATION]              Anh là AI?
   - Cert
   - Token
   - Basic auth (deprecated)
   - Webhook
        │
        ▼
[2. AUTHORIZATION (RBAC)]        Anh được làm GÌ?
   - Node authorizer
   - RBAC                          ← phần chính
   - ABAC (legacy)
   - Webhook
        │
        ▼
[3. ADMISSION CONTROLLERS]
        │
        ▼
[Persist to etcd]
```

Bài này focus **Authentication** + **Authorization** (RBAC).

## Phần 1: Authentication

K8s không có concept "User" trong etcd. User được nhận diện qua **credential** xuất trình:

### 4 cách authenticate

| Cách | Use case |
|---|---|
| **Client cert** | User (admin, dev) — dùng kubeconfig |
| **Bearer token** | ServiceAccount, OIDC token, external tool |
| **Basic auth** | DEPRECATED, không dùng |
| **Webhook** | Tích hợp external (LDAP, AD) |

### Authentication qua Cert

```yaml
# kubeconfig
users:
  - name: alice
    user:
      client-certificate: alice.crt
      client-key: alice.key
```

apiserver verify cert:
1. Cert do K8s CA ký? (check `--client-ca-file=ca.crt` của apiserver)
2. Cert chưa hết hạn?
3. Lấy `CN` → username; `O` → group.

```text
Cert subject: CN=alice/O=dev-team/O=admin
            └─────────┴─────────────┘
              Username   Groups (multiple OK)
```

→ User `alice`, member của groups `dev-team` và `admin`.

### Authentication qua Token

ServiceAccount Pod:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
```

Token tự gen:
```bash
kubectl create token my-sa
# eyJhbGciOiJSUzI1NiIs...
```

Pod tự mount token tại `/var/run/secrets/kubernetes.io/serviceaccount/token`. Khi Pod call apiserver → token validate.

apiserver verify token:
- JWT signature do ServiceAccount signing key (`sa.key`).
- Audience match (`kubernetes.default.svc`).
- Chưa expire.

→ User: `system:serviceaccount:<namespace>:<sa-name>`. Group: `system:serviceaccounts`, `system:serviceaccounts:<namespace>`.

### Authentication qua Webhook (external)

Cho OIDC, LDAP, ...:
```yaml
# apiserver flag
--authentication-token-webhook-config-file=/etc/kubernetes/webhook-config
```

apiserver POST token tới webhook external → webhook trả `username`, `groups`.

→ Setup phức tạp. CKA không deep.

## Phần 2: Authorization

apiserver có **chain authorizer**. Request đi qua từng cái:

```bash
# Config trong /etc/kubernetes/manifests/kube-apiserver.yaml
- --authorization-mode=Node,RBAC
```

| Authorizer | Mục đích |
|---|---|
| **Node** | Kubelet truy cập API của node nó | 
| **RBAC** | Permission user/SA |
| **ABAC** | Attribute-based (legacy) |
| **Webhook** | External authz |
| **AlwaysAllow** | Cho mọi request (TEST ONLY) |
| **AlwaysDeny** | Deny mọi request (TEST ONLY) |

Chain: nếu **bất kỳ** authorizer cho phép → request pass. Nếu **tất cả** deny → reject.

Production: `Node,RBAC` (default).

## Phần 3: RBAC

> **RBAC** (Role-Based Access Control): quyết định **ai** được làm **gì** trên **resource nào**.

### 4 object RBAC

```text
┌─────────────────────────────────────────┐
│  Role + RoleBinding         Namespace-scoped
│                              (chỉ tác động 1 namespace)
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ClusterRole + ClusterRoleBinding   Cluster-scoped
│                                      (toàn cluster)
└─────────────────────────────────────────┘
```

- **Role/ClusterRole**: định nghĩa "được làm gì".
- **RoleBinding/ClusterRoleBinding**: gán Role cho user/group/SA.

## Role + RoleBinding (namespace-scoped)

### Role example

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: dev
rules:
  - apiGroups: [""]                # core API group
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]        # subresource
    verbs: ["get"]
```

→ Có thể `get`, `list`, `watch` Pod + đọc Pod log trong namespace `dev`.

### Verbs phổ biến

| Verb | Mô tả |
|---|---|
| `get` | Đọc 1 resource cụ thể |
| `list` | List nhiều resource |
| `watch` | Watch realtime change |
| `create` | Tạo resource |
| `update` | Update toàn bộ |
| `patch` | Update partial |
| `delete` | Xoá 1 |
| `deletecollection` | Xoá batch |
| `*` | Mọi verb (admin) |

### apiGroups

| API Group | Resource |
|---|---|
| `""` (core) | pods, services, configmaps, secrets, nodes, namespaces |
| `apps` | deployments, replicasets, daemonsets, statefulsets |
| `batch` | jobs, cronjobs |
| `networking.k8s.io` | ingresses, networkpolicies |
| `rbac.authorization.k8s.io` | roles, rolebindings |
| `storage.k8s.io` | storageclasses |
| `*` | Mọi group |

→ Xem `kubectl api-resources` để biết group nào.

### RoleBinding example

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: alice-read-pods
  namespace: dev
subjects:
  - kind: User
    name: alice                   # tên đúng CN trong cert
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

→ User `alice` có permission `pod-reader` trong namespace `dev`.

### Subjects — Ai được gán?

```yaml
subjects:
  - kind: User
    name: alice
  - kind: Group
    name: dev-team
  - kind: ServiceAccount
    name: my-sa
    namespace: dev                # SA có namespace, User/Group không có
```

→ 1 RoleBinding gán nhiều subject.

### Apply + Verify

```bash
kubectl apply -f role.yaml
kubectl apply -f rolebinding.yaml

# Verify
kubectl get role -n dev
kubectl get rolebinding -n dev

# Test as alice
kubectl --kubeconfig=alice.kubeconfig get pods -n dev   # OK
kubectl --kubeconfig=alice.kubeconfig delete pod X -n dev   # forbidden
kubectl --kubeconfig=alice.kubeconfig get pods -n prod  # forbidden (chỉ dev)
```

## ClusterRole + ClusterRoleBinding (cluster-scoped)

Cùng cấu trúc, **không có** `namespace`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: alice-read-nodes
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: node-reader
  apiGroup: rbac.authorization.k8s.io
```

→ Alice có thể list nodes (cluster-scoped resource).

### Trick: ClusterRole + RoleBinding

```yaml
# Role bound to namespace, nhưng dùng ClusterRole
kind: RoleBinding
metadata:
  namespace: dev
subjects:
  - kind: User
    name: alice
roleRef:
  kind: ClusterRole         # ← reference ClusterRole
  name: pod-reader-cluster
```

→ Alice có permission của ClusterRole `pod-reader-cluster`, nhưng **chỉ trong namespace `dev`**. Cho phép reuse ClusterRole trong nhiều namespace.

## Built-in ClusterRoles

K8s ship sẵn vài ClusterRole:

```bash
kubectl get clusterroles | head
# admin                          ← full access trong namespace
# cluster-admin                  ← super admin
# edit                           ← read/write resource trong namespace
# view                           ← read-only trong namespace
# system:kube-scheduler          ← cho scheduler component
# system:kube-controller-manager
# ...
```

Use case phổ biến:
```yaml
# Cho group "dev-team" view-only trong namespace dev
kind: RoleBinding
metadata:
  namespace: dev
subjects:
  - kind: Group
    name: dev-team
roleRef:
  kind: ClusterRole
  name: view              # ← reuse built-in
```

## Check permission

```bash
# Hỏi: alice có thể list pods trong dev không?
kubectl auth can-i list pods -n dev --as=alice
# yes (hoặc no)

# Mọi quyền của alice trong dev
kubectl auth can-i --list -n dev --as=alice

# Verify SA
kubectl auth can-i create pods --as=system:serviceaccount:dev:my-sa
```

→ Tool cực hữu ích để debug RBAC.

## Best practice RBAC

```text
✓ Least privilege — chỉ cấp quyền tối thiểu cần
✓ Group người vào group → bind Group thay vì User
✓ Reuse built-in role (view, edit, admin)
✓ Tách Role per app/team
✓ Audit log để biết ai làm gì
✗ KHÔNG dùng cluster-admin trừ admin thật
✗ KHÔNG bind cluster-admin cho ServiceAccount
✗ KHÔNG để default SA có quyền cao
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `apiGroups: [""]` cho deployment | Apply fail | Deployment thuộc `apps`, không phải core |
| Verbs chỉ `get` cho admin | Không update được | Thêm `update`, `patch` |
| RoleBinding namespace khác | Permission không có effect | Match namespace |
| User name không khớp CN cert | Authorization fail dù cert OK | Check `CN` trong cert |
| Subject group không phải `system:serviceaccount` | SA token reject | Đúng prefix |
| Quên `apiGroup: rbac.authorization.k8s.io` | YAML invalid | Include cho subjects User/Group |
| Default SA permission rộng | Pod compromise = cluster compromise | Tạo SA riêng cho app |

## Quick reference

```yaml
# Role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: X, namespace: Y }
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]

# RoleBinding
kind: RoleBinding
metadata: { name: X, namespace: Y }
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

# Check
kubectl auth can-i list pods -n dev --as=alice
kubectl auth can-i --list --as=alice
```

```bash
# Imperative
kubectl create role pod-reader --verb=get,list --resource=pods -n dev
kubectl create rolebinding alice-binding --role=pod-reader --user=alice -n dev

kubectl create clusterrole node-reader --verb=get,list --resource=nodes
kubectl create clusterrolebinding alice-cluster-binding --clusterrole=node-reader --user=alice
```

## Tóm tắt bài 3

- **Authentication**: K8s không có User trong etcd. User = whoever xuất trình cert/token valid.
- **Authorization**: chain authorizer (Node, RBAC). Mặc định `Node,RBAC`.
- **Role** + **RoleBinding**: namespace-scoped.
- **ClusterRole** + **ClusterRoleBinding**: cluster-scoped.
- ClusterRole + RoleBinding = reuse role nhiều namespace.
- Built-in roles: `cluster-admin`, `admin`, `edit`, `view`.
- `kubectl auth can-i` để debug permission.
- Best practice: least privilege, group binding, audit log.

**Bài kế tiếp** → [Bài 4: ServiceAccounts — Identity cho Pod](04-service-accounts.md)
