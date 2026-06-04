# Bài 4: ConfigMap, Secret, RBAC, Pod Security

Bài cuối phase 29 (deep). Tổng hợp về quản lý config + secret + access control + security context cho pod.

## ConfigMap

### Tạo ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vprofile-config
  namespace: vprofile
data:
  # Cặp key-value đơn giản
  DB_HOST: "vprofile-db"
  DB_PORT: "3306"
  LOG_LEVEL: "INFO"

  # Nội dung file nhiều dòng
  application.properties: |
    server.port=8080
    logging.level.root=INFO
    spring.datasource.url=jdbc:mysql://${DB_HOST}:${DB_PORT}/accounts

  nginx.conf: |
    upstream backend {
        server vprofile-app:8080;
    }
    server {
        listen 80;
        location / { proxy_pass http://backend; }
    }
```

Hoặc tạo từ file có sẵn:

```bash
kubectl create configmap vprofile-config \
    --from-file=application.properties \
    --from-file=nginx.conf \
    --from-literal=DB_HOST=vprofile-db
```

### Mount như env variable

```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef:
            name: vprofile-config

      # Hoặc inject từng key cụ thể
      env:
        - name: DB_URL
          valueFrom:
            configMapKeyRef:
              name: vprofile-config
              key: DB_HOST
```

### Mount như volume

```yaml
spec:
  containers:
    - name: app
      volumeMounts:
        - name: config
          mountPath: /app/config
        - name: nginx-conf
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf       # Chỉ mount 1 key thành file riêng
  volumes:
    - name: config
      configMap:
        name: vprofile-config
        items:
          - {key: application.properties, path: application.properties}
    - name: nginx-conf
      configMap:
        name: vprofile-config
```

`subPath` mount **1 file duy nhất** (thay vì cả directory) → giữ nguyên các file khác trong target directory.

### Auto-reload (Tự cập nhật khi ConfigMap thay đổi)

ConfigMap update → file mount qua volume tự cập nhật (delay 60s). **Env variable KHÔNG cập nhật** — phải restart pod.

Trigger restart pod khi ConfigMap thay đổi:

```yaml
spec:
  template:
    metadata:
      annotations:
        checksum/config: "{{ include (print $.Template.BasePath \"/configmap.yaml\") . | sha256sum }}"
```

Pattern này phổ biến trong Helm: checksum annotation thay đổi → trigger rolling update.

Hoặc dùng tool **Reloader**: tự động restart Deployment khi ConfigMap/Secret thay đổi.

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vprofile-secrets
type: Opaque
stringData:                 # Giá trị plain, K8s tự encode base64
  db-password: SuperSecret123!
  api-key: sk-xxx

data:                       # Giá trị đã base64 sẵn
  jwt-secret: cmVhbHN1cGVyc2VjcmV0
```

```bash
echo -n 'SuperSecret123!' | base64
# U3VwZXJTZWNyZXQxMjMh
```

### Các loại Secret

| Type | Mục đích |
|---|---|
| `Opaque` | Secret thông thường (mặc định) |
| `kubernetes.io/dockerconfigjson` | Credential cho Docker registry |
| `kubernetes.io/tls` | TLS cert + key |
| `kubernetes.io/service-account-token` | Token cho ServiceAccount |
| `kubernetes.io/basic-auth` | Username + password |
| `kubernetes.io/ssh-auth` | SSH key |

### Docker registry secret

```bash
kubectl create secret docker-registry ghcr-credentials \
    --docker-server=ghcr.io \
    --docker-username=$GITHUB_USER \
    --docker-password=$GITHUB_TOKEN

# Dùng trong pod
spec:
  imagePullSecrets:
    - {name: ghcr-credentials}
```

### TLS secret

```bash
kubectl create secret tls vprofile-tls \
    --cert=tls.crt \
    --key=tls.key
```

### Cách dùng Secret trong pod

```yaml
spec:
  containers:
    - name: app
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: vprofile-secrets
              key: db-password
      volumeMounts:
        - name: secrets
          mountPath: /run/secrets
          readOnly: true
  volumes:
    - name: secrets
      secret:
        secretName: vprofile-secrets
        defaultMode: 0400
```

## Secret management — Production

Secret mặc định = **base64 encode**, **KHÔNG phải encrypt**. Lưu plain trong etcd → bất kỳ ai có quyền đọc etcd đều thấy được.

### Encryption at rest (Mã hoá khi lưu)

```yaml
# Cấu hình của kube-apiserver
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources: [secrets]
    providers:
      - aescbc:
          keys:
            - {name: key1, secret: BASE64_AES_KEY}
      - identity: {}
```

Cấu hình này encrypt Secret trước khi lưu vào etcd.

### External Secrets Operator (Lấy secret từ external store)

Pull secret từ kho secret bên ngoài (vd: AWS Secrets Manager, Vault):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: vprofile-db
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: vprofile-db-secret
  data:
    - secretKey: password
      remoteRef:
        key: prod/vprofile/db
        property: password
```

Cách hoạt động: External Secrets Operator pull secret từ AWS Secrets Manager → tạo K8s Secret tương ứng → tự rotate khi source thay đổi.

### Sealed Secrets (Bitnami)

Encrypt Secret → có thể commit thẳng lên Git mà vẫn an toàn:

```bash
# Encrypt
kubeseal --controller-namespace=kube-system --controller-name=sealed-secrets \
    -o yaml < secret.yaml > sealed-secret.yaml

# Commit file sealed-secret.yaml lên Git
# Controller trong cluster sẽ decrypt → tạo Secret thật
```

### HashiCorp Vault + CSI

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: vprofile-vault
spec:
  provider: vault
  parameters:
    vaultAddress: https://vault.acme.com
    roleName: vprofile
    objects: |
      - objectName: "db-password"
        secretPath: "secret/data/vprofile/db"
        secretKey: "password"
```

Pod mount → CSI driver fetch từ Vault → mount thành file. **Không hề tạo K8s Secret** → secret không bao giờ chạm etcd.

## RBAC (Role-Based Access Control)

### Role + RoleBinding (Phạm vi namespace)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: vprofile-reader
  namespace: vprofile
rules:
  - apiGroups: [""]
    resources: [pods, services, configmaps]
    verbs: [get, list, watch]
  - apiGroups: [apps]
    resources: [deployments]
    verbs: [get, list, watch]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: vprofile-reader
  namespace: vprofile
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
  - kind: Group
    name: developers
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: vprofile-app
    namespace: vprofile
roleRef:
  kind: Role
  name: vprofile-reader
  apiGroup: rbac.authorization.k8s.io
```

### ClusterRole + ClusterRoleBinding (Phạm vi toàn cluster)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: nodes-reader
rules:
  - apiGroups: [""]
    resources: [nodes]
    verbs: [get, list, watch]
```

### ServiceAccount (Identity cho pod)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vprofile-app
  namespace: vprofile
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123:role/vprofile-app   # IRSA cho AWS
```

Dùng trong pod:

```yaml
spec:
  serviceAccountName: vprofile-app
```

Pod tự động mount SA token tại `/var/run/secrets/kubernetes.io/serviceaccount/token` → dùng cho API call vào K8s API server.

### Built-in roles (Role có sẵn)

```bash
# Xem các ClusterRole built-in (loại trừ system role)
kubectl get clusterroles | grep -v ^system:

# Các role chuẩn:
cluster-admin       # Full access toàn cluster (dùng cực kỳ hạn chế)
admin               # Full quyền trong namespace (không có quyền cluster-level)
edit                # Chỉnh sửa được resource
view                # Chỉ đọc
```

**Không nên** gán `cluster-admin` cho user thường. Tạo custom Role với quyền tối thiểu cần thiết.

### IRSA — IAM Roles for ServiceAccount (Trên AWS)

```bash
eksctl create iamserviceaccount \
    --cluster vprofile-prod \
    --namespace vprofile \
    --name vprofile-app \
    --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
    --approve
```

Pod gắn SA này → AWS SDK trong pod tự fetch IAM role credential → access S3 mà không cần lưu access key.

### Workload Identity (Trên GCP)

Tương đương IRSA trên GKE — bind K8s ServiceAccount với GCP ServiceAccount.

## Pod Security

### SecurityContext (Bảo mật ở cấp pod / container)

```yaml
spec:
  securityContext:           # Cấp pod (áp dụng cho mọi container)
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    fsGroupChangePolicy: OnRootMismatch
    seccompProfile:
      type: RuntimeDefault
    sysctls:
      - {name: net.ipv4.ip_local_port_range, value: "1024 65535"}

  containers:
    - name: app
      securityContext:        # Cấp container (override cấp pod)
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
          add: [NET_BIND_SERVICE]   # Nếu cần bind port < 1024
        runAsUser: 1000
```

### Pod Security Standards (Chuẩn bảo mật pod)

3 mức:
- **Privileged**: cho phép mọi thứ (mặc định, không hardening).
- **Baseline**: hạn chế tối thiểu.
- **Restricted**: hardened nghiêm ngặt, khuyến nghị cho app production.

Áp dụng theo namespace:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vprofile
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Pod vi phạm chuẩn → bị reject (chế độ enforce) hoặc chỉ log lại (chế độ audit/warn).

### OPA Gatekeeper / Kyverno

Custom policy engine — viết policy tuỳ chỉnh. Ví dụ: bắt buộc mọi image phải từ registry đã được approve.

Kyverno:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-trusted-registry
spec:
  validationFailureAction: enforce
  rules:
    - name: validate-registry
      match:
        any:
          - resources: {kinds: [Pod]}
      validate:
        message: "Images must come from ghcr.io/acme or ECR"
        pattern:
          spec:
            containers:
              - image: "ghcr.io/acme/* | *.dkr.ecr.*.amazonaws.com/*"
```

## Resource quotas + limits (Hạn ngạch tài nguyên)

### ResourceQuota — Hạn ngạch cấp namespace

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: vprofile-quota
  namespace: vprofile
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
    pods: "50"
```

Tổng tài nguyên trong namespace không được vượt quá các giá trị trên.

### LimitRange — Mặc định cho từng pod

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: vprofile-limits
  namespace: vprofile
spec:
  limits:
    - type: Container
      default:                # Mặc định nếu pod không set
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 250m
        memory: 256Mi
      max:
        cpu: 2
        memory: 4Gi
      min:
        cpu: 50m
        memory: 64Mi
```

Pod không khai báo resource → dùng default. Pod vượt max → bị reject.

## Tổng kết phase 29

4 bài đã cover:
1. K8s architecture + các object cốt lõi.
2. Workload types: Deployment, StatefulSet, DaemonSet, Job/CronJob, HPA/VPA.
3. Networking: Service, Ingress, NetworkPolicy.
4. Config + Secret + RBAC + Pod Security.

Skill đạt được:
- Deploy app trên K8s production-grade.
- Network architecture multi-tier.
- Security đa lớp: RBAC + NetworkPolicy + Pod Security + external secrets.

## Tóm tắt bài 4

- **ConfigMap** cho config không nhạy cảm; **Secret** cho dữ liệu nhạy cảm (base64, cần encrypt at rest).
- **External Secrets Operator** + **Sealed Secrets** + **Vault CSI** là các pattern hiện đại để quản secret production.
- **RBAC**: Role + RoleBinding (cấp namespace), ClusterRole + ClusterRoleBinding (cấp cluster).
- **ServiceAccount** + **IRSA** (AWS) / **Workload Identity** (GCP) cho phép pod dùng cloud credential mà không cần lưu key.
- **SecurityContext** + **Pod Security Standards** mức restricted = hardening nghiêm ngặt.
- **OPA Gatekeeper / Kyverno** cho phép viết custom policy tuỳ chỉnh.
- **ResourceQuota** + **LimitRange** quản trị tài nguyên theo namespace.

**Phase kế tiếp** → [Phase 30 — App on K8s](../phase-30-app-on-k8s/01-deploy-vprofile-k8s.md)
