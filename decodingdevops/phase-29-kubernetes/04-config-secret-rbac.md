# Bài 4: ConfigMap, Secret, RBAC, Pod Security

Bài cuối phase 29 (deep). Config + Secret management + access control + security context.

## ConfigMap

### Create

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vprofile-config
  namespace: vprofile
data:
  # Plain key-value
  DB_HOST: "vprofile-db"
  DB_PORT: "3306"
  LOG_LEVEL: "INFO"

  # Multi-line file content
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

Or from file:

```bash
kubectl create configmap vprofile-config \
    --from-file=application.properties \
    --from-file=nginx.conf \
    --from-literal=DB_HOST=vprofile-db
```

### Mount as env

```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef:
            name: vprofile-config

      # Or specific keys
      env:
        - name: DB_URL
          valueFrom:
            configMapKeyRef:
              name: vprofile-config
              key: DB_HOST
```

### Mount as volume

```yaml
spec:
  containers:
    - name: app
      volumeMounts:
        - name: config
          mountPath: /app/config
        - name: nginx-conf
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf       # Only mount 1 key as file
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

`subPath` mount single file (vs whole directory) → preserve other files in target.

### Auto-reload

ConfigMap update → volume-mounted files update (60s delay). Env variables **NOT** updated (need pod restart).

Trigger restart on ConfigMap change:

```yaml
spec:
  template:
    metadata:
      annotations:
        checksum/config: "{{ include (print $.Template.BasePath \"/configmap.yaml\") . | sha256sum }}"
```

Helm pattern: checksum annotation change → rolling update.

Or use **Reloader** tool: auto-restart Deployment khi ConfigMap/Secret change.

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vprofile-secrets
type: Opaque
stringData:                 # Plain, auto-encode
  db-password: SuperSecret123!
  api-key: sk-xxx

data:                       # Pre-base64-encoded
  jwt-secret: cmVhbHN1cGVyc2VjcmV0
```

```bash
echo -n 'SuperSecret123!' | base64
# U3VwZXJTZWNyZXQxMjMh
```

### Secret types

| Type | Mục đích |
|---|---|
| `Opaque` | Generic |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/tls` | TLS cert + key |
| `kubernetes.io/service-account-token` | SA token |
| `kubernetes.io/basic-auth` | Username + password |
| `kubernetes.io/ssh-auth` | SSH key |

### Docker registry secret

```bash
kubectl create secret docker-registry ghcr-credentials \
    --docker-server=ghcr.io \
    --docker-username=$GITHUB_USER \
    --docker-password=$GITHUB_TOKEN

# Use in pod
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

### Use Secret

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

Default Secret = **base64**, **NOT encrypted**. Stored plain in etcd.

### Encryption at rest

```yaml
# kube-apiserver config
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

Encrypt Secret before storing in etcd.

### External Secrets Operator

Pull secret từ external vault:

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

Pull AWS Secrets Manager → create K8s Secret → auto-rotate.

### Sealed Secrets (Bitnami)

Encrypt Secret → commit to Git safely:

```bash
# Encrypt
kubeseal --controller-namespace=kube-system --controller-name=sealed-secrets \
    -o yaml < secret.yaml > sealed-secret.yaml

# Commit sealed-secret.yaml to Git
# Cluster controller decrypts → creates Secret
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

Pod mount → CSI fetch from Vault → mount as file. No K8s Secret at all.

## RBAC

### Role + RoleBinding (namespace-scoped)

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

### ClusterRole + ClusterRoleBinding (cluster-wide)

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

### ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vprofile-app
  namespace: vprofile
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123:role/vprofile-app   # IRSA
```

Used by pod:

```yaml
spec:
  serviceAccountName: vprofile-app
```

Pod auto-mount SA token at `/var/run/secrets/kubernetes.io/serviceaccount/token` cho API calls.

### Built-in roles

```bash
# View
kubectl get clusterroles | grep -v ^system:

# Built-in
cluster-admin       # Full access (use sparingly)
admin               # Full to namespace (no cluster resource)
edit                # Modify resources
view                # Read-only
```

Don't extend `cluster-admin` to user. Create custom Role.

### IRSA — IAM for ServiceAccount (AWS)

```bash
eksctl create iamserviceaccount \
    --cluster vprofile-prod \
    --namespace vprofile \
    --name vprofile-app \
    --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
    --approve
```

Pod with SA → AWS SDK auto-fetch role credentials → S3 access without keys.

### Workload Identity (GCP)

Equivalent on GKE. K8s SA bind to GCP SA.

## Pod Security

### SecurityContext

```yaml
spec:
  securityContext:           # Pod-level
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
      securityContext:        # Container-level (override pod-level)
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
          add: [NET_BIND_SERVICE]   # If need bind <1024
        runAsUser: 1000
```

### Pod Security Standards

3 levels:
- **Privileged**: anything (default).
- **Baseline**: minimal restrictions.
- **Restricted**: hardened, recommended for app.

Enforce per namespace:

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

Pod violating standard → rejected (enforce) or logged (audit/warn).

### OPA Gatekeeper / Kyverno

Custom policy engine. Example: require all images from approved registry.

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

## Resource quotas + limits

### ResourceQuota — namespace-level

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

Tổng resource trong namespace không vượt quá.

### LimitRange — default per pod

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: vprofile-limits
  namespace: vprofile
spec:
  limits:
    - type: Container
      default:                # Default if not set
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

Pod without resource spec → use defaults. Pod exceed max → rejected.

## Tổng kết phase 29

4 bài cover:
1. K8s architecture + core objects.
2. Workload types: Deployment, StatefulSet, DaemonSet, Job/CronJob, HPA/VPA.
3. Networking: Service, Ingress, NetworkPolicy.
4. Config + Secret + RBAC + Pod Security.

Skills:
- Deploy app trên K8s production-grade.
- Network architecture multi-tier.
- Security: RBAC + NetworkPolicy + Pod Security + external secrets.

## Tóm tắt bài 4

- **ConfigMap** for non-secret config; **Secret** for sensitive (base64, encrypt at rest).
- **External Secrets Operator** + **Sealed Secrets** + **Vault CSI** modern patterns.
- **RBAC**: Role + RoleBinding (namespace), ClusterRole + ClusterRoleBinding (cluster).
- **ServiceAccount** + **IRSA** (AWS) / **Workload Identity** (GCP) cho cloud credential.
- **SecurityContext** + **Pod Security Standards** restricted level.
- **OPA Gatekeeper / Kyverno** custom policy.
- **ResourceQuota** + **LimitRange** namespace governance.

**Phase kế tiếp** → [Phase 30 — App on K8s](../phase-30-app-on-k8s/01-deploy-vprofile-k8s.md)
