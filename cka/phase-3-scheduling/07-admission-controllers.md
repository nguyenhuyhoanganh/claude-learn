# Bài 7: Admission Controllers — Validate/Mutate request

## Vì sao cần Admission Controllers?

Bạn đã học **Authentication** (anh là ai) và **Authorization** (RBAC — anh được phép làm gì). Đủ chưa?

```text
[Yêu cầu thực tế]
- Cấm dùng image từ Docker Hub public, chỉ cho internal registry
- Cấm tag "latest" — bắt buộc pin version
- Mọi container phải chạy non-root
- Pod phải có label "owner"
- Auto thêm sidecar (vd Istio sidecar) vào mọi Pod
- Reject Pod nếu vi phạm policy security
```

RBAC chỉ check "user X được create Pod Y" — **không check nội dung Pod**. Cần lớp khác xử lý này.

→ **Admission Controllers** chạy **sau Auth/Authz**, **trước khi lưu vào etcd**.

## Workflow đầy đủ khi tạo Pod

```text
User: kubectl apply -f pod.yaml
        │
        ▼
[1. AUTHENTICATION]                     "Bạn là ai?"
   Cert / token / kubeconfig
        │
        ▼
[2. AUTHORIZATION (RBAC)]               "Bạn được phép create Pod?"
        │
        ▼
[3. MUTATING ADMISSION CONTROLLERS]    "Sửa request: thêm/xoá field"
   - DefaultStorageClass (thêm SC default cho PVC)
   - DefaultIngressClass
   - ServiceAccount (gán default SA)
   - Mutating Webhook (custom)
        │
        ▼
[4. SCHEMA VALIDATION]                  "Spec đúng schema YAML?"
        │
        ▼
[5. VALIDATING ADMISSION CONTROLLERS]   "Có vi phạm policy không?"
   - NamespaceLifecycle (namespace tồn tại?)
   - LimitRanger (resource match LimitRange?)
   - ResourceQuota (không vượt quota?)
   - PodSecurity (security policy?)
   - Validating Webhook (custom)
        │
        ▼
[6. PERSIST TO ETCD]                    Lưu vào etcd
```

→ Mutating chạy trước Validating. Bất kỳ ai reject → request fail.

## 2 loại Admission Controller

| | Mutating | Validating |
|---|---|---|
| Mục đích | **Sửa** request (thêm/xoá field) | **Validate** (chấp nhận/từ chối) |
| Có thể đổi request? | ✓ | ✗ |
| Chạy lúc nào | Trước Validating | Sau Mutating |
| Ví dụ | DefaultStorageClass, ServiceAccount | NamespaceExists, PodSecurity |

→ 1 admission controller có thể vừa mutate vừa validate.

## Built-in Admission Controllers

K8s ship sẵn nhiều admission controllers. Một số quan trọng:

### Enabled by default

| Controller | Mục đích |
|---|---|
| `NamespaceLifecycle` | Reject Pod nếu namespace không tồn tại. Cấm xoá `default`, `kube-system`, `kube-public` |
| `LimitRanger` | Check resource Pod match LimitRange namespace |
| `ServiceAccount` | Gán default ServiceAccount nếu Pod không khai |
| `DefaultStorageClass` | Thêm storage class default cho PVC không có |
| `ResourceQuota` | Check Pod không vượt ResourceQuota |
| `PodSecurity` | Enforce Pod Security Standards |
| `NodeRestriction` | Giới hạn kubelet chỉ chỉnh được Pod/Node của mình |
| `MutatingAdmissionWebhook` | Cho custom mutating webhook |
| `ValidatingAdmissionWebhook` | Cho custom validating webhook |

### Disabled by default (có thể bật)

| Controller | Mục đích |
|---|---|
| `AlwaysPullImages` | Force pull image mọi lần create Pod |
| `EventRateLimit` | Giới hạn rate API |
| `NamespaceAutoProvision` | Auto tạo namespace nếu không tồn tại (DEPRECATED) |

## Xem admission controller đang enabled

### Cluster kubeadm

```bash
# Cách 1: từ Pod apiserver
kubectl exec kube-apiserver-master -n kube-system -- \
  kube-apiserver -h | grep enable-admission-plugins

# Cách 2: xem manifest
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep admission
# - --enable-admission-plugins=NodeRestriction
```

### Cluster scratch

```bash
ps -ef | grep kube-apiserver | grep enable-admission
```

## Bật/tắt admission controller

Sửa flag trong manifest apiserver:

```yaml
# /etc/kubernetes/manifests/kube-apiserver.yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --enable-admission-plugins=NodeRestriction,AlwaysPullImages    # bật thêm
    - --disable-admission-plugins=ServiceAccount                      # tắt
```

Kubelet thấy file đổi → tự restart apiserver Pod. **Cẩn thận** sửa — apiserver chết = cluster down.

## Ví dụ: NamespaceAutoProvision (deprecated)

Workflow khi bật:

```text
User: kubectl run nginx --image=nginx -n blue
                                          ▲
                                          │ Namespace "blue" chưa tồn tại

Default (NamespaceLifecycle enabled):
- Auth ✓
- Authz ✓
- Validating: namespace "blue" không tồn tại → REJECT
- Error: "namespaces \"blue\" not found"

Nếu bật NamespaceAutoProvision (mutating):
- Auth ✓
- Authz ✓
- Mutating: namespace "blue" không tồn tại → TẠO TỰ ĐỘNG
- Validating: namespace "blue" có rồi → PASS
- Pod được tạo
```

→ Lưu ý: `NamespaceAutoProvision` và `NamespaceExists` đã bị **deprecated**, thay bằng `NamespaceLifecycle` (đã include cả 2 functionality).

## Ví dụ: DefaultStorageClass (mutating)

```text
User tạo PVC không khai storage class:
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
  # KHÔNG có storageClassName

Sau Mutating (DefaultStorageClass):
PVC được sửa thêm:
  storageClassName: standard      # default SC của cluster
```

→ User không cần biết SC name. Cluster admin set default. Tiện cho user, đỡ lỗi.

## Custom Admission Webhook

Khi built-in không đủ → viết webhook riêng:

### Workflow

```text
[User tạo Pod]
        │
        ▼
[apiserver]
        │ (sau built-in admission controllers)
        ▼
[MutatingAdmissionWebhook]
        │ HTTP call ra server
        ▼
[Webhook server của bạn]
        │ Logic: kiểm tra/sửa request
        ▼
[Response: allowed=true + patch (mutate)]
        │
        ▼
[ValidatingAdmissionWebhook]
        │ HTTP call ra server
        ▼
[Webhook server của bạn]
        │ Logic: validate
        ▼
[Response: allowed=true/false]
```

### Setup

#### 1. Deploy webhook server

Container chạy code Python/Go listen HTTPS, expose endpoint `/validate` và `/mutate`:

```python
# Ví dụ pseudo-code Python
@app.route('/validate', methods=['POST'])
def validate():
    request = json.loads(flask.request.data)
    pod = request['request']['object']
    
    # Logic: cấm image latest
    for container in pod['spec']['containers']:
        if container['image'].endswith(':latest'):
            return jsonify({
                'response': {
                    'allowed': False,
                    'status': {'message': 'image tag latest not allowed'}
                }
            })
    return jsonify({'response': {'allowed': True}})

@app.route('/mutate', methods=['POST'])
def mutate():
    request = json.loads(flask.request.data)
    pod = request['request']['object']
    
    # Logic: thêm label "owner" lấy từ username
    user = request['request']['userInfo']['username']
    patch = [{
        'op': 'add',
        'path': '/metadata/labels/owner',
        'value': user
    }]
    return jsonify({
        'response': {
            'allowed': True,
            'patch': base64.b64encode(json.dumps(patch).encode()).decode(),
            'patchType': 'JSONPatch'
        }
    })
```

Deploy như Deployment + Service trong cluster:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhook-server
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: webhook
          image: my-webhook:v1
          ports:
            - containerPort: 8443
---
apiVersion: v1
kind: Service
metadata:
  name: webhook-service
spec:
  selector:
    app: webhook
  ports:
    - port: 443
      targetPort: 8443
```

#### 2. Tạo Webhook Configuration

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: my-validator
webhooks:
  - name: example.com
    clientConfig:
      service:
        name: webhook-service
        namespace: default
        path: /validate
      caBundle: <CA cert base64>      # TLS bắt buộc
    rules:
      - operations: ["CREATE", "UPDATE"]
        apiGroups: [""]
        apiVersions: ["v1"]
        resources: ["pods"]
    admissionReviewVersions: ["v1"]
    sideEffects: None
    failurePolicy: Fail               # nếu webhook không phản hồi → reject
```

Phân tích:
- `service`: trỏ tới webhook service trong cluster.
- `caBundle`: cert CA để verify TLS (bắt buộc).
- `rules`: chỉ trigger khi CREATE/UPDATE Pod.
- `failurePolicy: Fail` = nếu webhook lỗi/timeout → reject. `Ignore` = allow nếu webhook lỗi.

Tương tự cho MutatingWebhookConfiguration:

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: my-mutator
webhooks:
  - name: example.com
    clientConfig:
      service:
        name: webhook-service
        namespace: default
        path: /mutate
      caBundle: <CA cert base64>
    rules:
      - operations: ["CREATE"]
        apiGroups: [""]
        apiVersions: ["v1"]
        resources: ["pods"]
    admissionReviewVersions: ["v1"]
    sideEffects: None
```

## Use case thực tế của Webhook

### 1. Inject sidecar (Istio)

Istio dùng MutatingWebhook để **auto inject Envoy sidecar** vào mọi Pod trong namespace `istio-injection=enabled`:

```text
User tạo Pod có 1 container nginx
    ↓
Istio MutatingWebhook
    ↓
Pod có 2 container: nginx + istio-proxy (Envoy)
```

User không phải biết Istio.

### 2. Policy enforcement (OPA Gatekeeper, Kyverno)

```text
Policy: mọi Pod phải có label "team"
    ↓
Pod create không có label "team"
    ↓
ValidatingWebhook (Gatekeeper) reject
    ↓
User phải sửa, thêm label
```

### 3. Image security

```text
Policy: cấm image từ public Docker Hub
    ↓
Pod create với image nginx:latest
    ↓
ValidatingWebhook check image registry
    ↓
Reject: "must use internal-registry.com"
```

## Kyverno / OPA Gatekeeper — Policy as Code

Viết policy bằng code thay vì gõ Python:

**Kyverno** (YAML-native):
```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-team-label
spec:
  rules:
    - name: check-team-label
      match:
        resources:
          kinds: [Pod]
      validate:
        message: "Pod phải có label 'team'"
        pattern:
          metadata:
            labels:
              team: "?*"
```

→ Kyverno tự install webhook + handle policy. Không cần code Python.

**OPA Gatekeeper** (Rego language) — power hơn nhưng phức tạp hơn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Webhook server chết | Mọi Pod tạo bị reject (failurePolicy=Fail) | Có HA, hoặc failurePolicy=Ignore cho non-critical |
| Webhook quá chậm | apiserver timeout, request fail | Optimize webhook, set timeout |
| Cert CA hết hạn | Webhook auth fail → reject | Monitor cert, auto-rotate |
| Webhook rule quá rộng | Mọi resource bị scan → chậm | Rule narrow chỉ resource cần |
| Mutating webhook lỗi → invalid YAML | Pod create fail | Test kỹ webhook |
| Disable critical admission controller | Security hole | Đọc kỹ default trước khi tắt |

## Quick reference

```bash
# Xem admission controllers enabled
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep admission

# Bật thêm
# Sửa file:
- --enable-admission-plugins=NodeRestriction,AlwaysPullImages

# Tắt
- --disable-admission-plugins=DefaultStorageClass

# Xem webhook đang chạy
kubectl get validatingwebhookconfiguration
kubectl get mutatingwebhookconfiguration

# Xem chi tiết
kubectl describe validatingwebhookconfiguration my-webhook
```

## Tóm tắt bài 7

- **Admission Controllers** chạy **giữa Authz và etcd**. Mutating trước, Validating sau.
- **Mutating**: sửa request (thêm SA default, default SC, inject sidecar).
- **Validating**: chấp nhận/từ chối (namespace tồn tại, quota OK, policy match).
- Built-in default: NamespaceLifecycle, ServiceAccount, ResourceQuota, PodSecurity, NodeRestriction, ...
- **Custom Webhook**: deploy webhook server + `ValidatingWebhookConfiguration` / `MutatingWebhookConfiguration`.
- Use case: Istio sidecar injection, policy enforcement (Kyverno/OPA), image security.
- `failurePolicy: Fail` (reject nếu webhook down) vs `Ignore` (allow). Cẩn thận với critical webhook.
- Bật/tắt admission controller qua flag `--enable-admission-plugins` của apiserver.

Phase 3 đã xong! Bạn đã master mọi cơ chế scheduling: manual, labels, taints, affinity, resource, DaemonSet/Static Pod, Priority, Multiple Scheduler, Admission Controllers.

**Bài kế tiếp** → [Phase 4 - Bài 1: Logging & Monitoring](../phase-4-logging-monitoring/01-monitor-cluster.md)
