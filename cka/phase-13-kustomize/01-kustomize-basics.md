# Bài 1: Kustomize — Manifest customization mà không template

## Vì sao có Kustomize?

Helm dùng Go template → YAML có `{{ ... }}` → khó đọc, dễ sai syntax.

```yaml
# Helm template
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
```

Kustomize: **YAML thuần** + **overlay** để customize.

```yaml
# base/deployment.yaml — YAML thuần
spec:
  replicas: 1
  template:
    spec:
      containers:
        - image: nginx:1.25

# overlays/prod/kustomization.yaml — patch
replicas:
  - name: nginx
    count: 5
images:
  - name: nginx
    newTag: 1.26
```

→ K8s "native". Không cần template language.

CKA 2025+ test Kustomize basics.

## Kustomize built-in vs CLI

```bash
# Built-in kubectl (1.14+)
kubectl apply -k ./my-app/

# Standalone CLI
brew install kustomize
kustomize build ./my-app/ | kubectl apply -f -
```

→ Built-in `-k` thường dùng. CLI có version mới hơn.

## Cấu trúc cơ bản

```text
my-app/
├── kustomization.yaml          ← config Kustomize
├── deployment.yaml
├── service.yaml
└── configmap.yaml
```

### kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:                       # list YAML file include
  - deployment.yaml
  - service.yaml
  - configmap.yaml

namespace: dev                   # set namespace cho mọi resource

namePrefix: dev-                 # prefix name (vd nginx → dev-nginx)
nameSuffix: -v1                  # suffix

commonLabels:                    # add label cho mọi resource
  app: my-app
  env: dev

commonAnnotations:
  owner: devops-team
```

Build:
```bash
kustomize build ./my-app/
# Output: full YAML đã apply transform

kubectl apply -k ./my-app/
```

→ Kết quả: mọi resource có namespace `dev`, name `dev-X-v1`, label `app=my-app, env=dev`.

## Bases + Overlays — Pattern chính

Use case: dev/staging/prod chia sẻ base manifest, mỗi env có patch riêng.

```text
my-app/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── replica-patch.yaml
    ├── staging/
    │   └── kustomization.yaml
    └── prod/
        ├── kustomization.yaml
        └── prod-patch.yaml
```

### base/kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml
```

### overlays/prod/kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: prod
namePrefix: prod-

resources:
  - ../../base                  # inherit base

replicas:
  - name: nginx
    count: 10                   # prod cần nhiều replica

images:
  - name: nginx
    newTag: 1.26-stable

patches:                        # áp dụng patch
  - path: prod-patch.yaml
    target:
      kind: Deployment
      name: nginx
```

### overlays/prod/prod-patch.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  template:
    spec:
      containers:
        - name: nginx
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1
              memory: 1Gi
```

Deploy:
```bash
kubectl apply -k overlays/prod/
# Apply prod variant
```

→ Base + overlay = "DRY" (Don't Repeat Yourself). Mỗi env chỉ patch khác biệt.

## Patches — 2 loại

### 1. Strategic Merge Patch (default)

```yaml
# patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 5                   # chỉ field cần đổi
  template:
    spec:
      containers:
        - name: nginx           # match container theo name
          resources:
            limits:
              memory: 1Gi
```

→ Merge với base. Kustomize hiểu cấu trúc K8s.

### 2. JSON 6902 Patch

```yaml
# kustomization.yaml
patches:
  - target:
      kind: Deployment
      name: nginx
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 10
      - op: add
        path: /spec/template/spec/containers/0/env
        value:
          - name: ENV
            value: prod
```

→ Precise — chỉ field cụ thể. Phức tạp hơn nhưng power.

## ConfigMapGenerator + SecretGenerator

```yaml
# kustomization.yaml
configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=info
      - APP_NAME=myapp
    files:
      - application.properties

secretGenerator:
  - name: app-secret
    literals:
      - PASSWORD=admin
    files:
      - api-key.txt
```

→ Tự tạo ConfigMap + Secret từ literals + files.

Generated names có **hash suffix** (vd `app-config-abc123`):
```bash
kustomize build .
# kind: ConfigMap
# metadata:
#   name: app-config-2k7t6t6dgd       # hash from content
```

Hash thay đổi khi content đổi → trigger rolling update Pod tự động.

Disable hash:
```yaml
generatorOptions:
  disableNameSuffixHash: true
```

## Images transform

```yaml
images:
  - name: nginx                    # match container image: nginx
    newName: my-registry/nginx     # đổi registry
    newTag: 1.26                   # đổi tag
  
  - name: backend
    digest: sha256:abc123...       # pin digest
```

→ Tiện cho deploy multi-env hoặc rollout image mới.

## Replicas + Namespace transform

```yaml
replicas:
  - name: nginx
    count: 5
  - name: backend
    count: 3

namespace: prod-namespace
```

## Components (Kustomize 4+)

Reusable patches:

```text
my-app/
├── base/
└── components/
    ├── monitoring/        ← Component bật Prometheus annotation
    └── tls/               ← Component thêm Cert-Manager Issuer
```

```yaml
# components/monitoring/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
patches:
  - patch: |-
      - op: add
        path: /metadata/annotations
        value:
          prometheus.io/scrape: "true"
    target:
      kind: Deployment
```

Sử dụng:
```yaml
# overlays/prod/kustomization.yaml
resources:
  - ../../base
components:
  - ../../components/monitoring
  - ../../components/tls
```

→ Modular config.

## Helm vs Kustomize

| | Helm | Kustomize |
|---|---|---|
| Approach | Template + variable | Overlay + patch |
| Language | Go template syntax | YAML thuần |
| Package | Chart (.tgz) | Folder structure |
| Repo | Helm repo | Git |
| Versioning | Chart version | Git tag |
| Built-in K8s | ✗ | ✓ (kubectl `-k`) |
| Learning curve | Cao (Go template) | Thấp (YAML) |
| Customization | Values.yaml | Overlay/patch |
| Hooks | ✓ | ✗ |
| Best for | App phức tạp, distribute public | Internal app, multi-env |

→ Helm cho public chart (nginx-ingress, Prometheus). Kustomize cho internal app multi-env.

Có thể **combine**:
```bash
helm template my-app chart/ | kustomize build -
```

## Test + Debug

```bash
# Build và preview
kustomize build ./my-app/

# So sánh 2 overlay
diff <(kustomize build overlays/dev/) <(kustomize build overlays/prod/)

# Apply dry-run
kubectl apply -k ./my-app/ --dry-run=client -o yaml
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Patch target không match resource | Patch bị ignore | Verify name/kind trong patch |
| Strategic merge cho list không có patch merge key | Replace cả list | Dùng JSON 6902 cho list |
| Generator hash đổi nhưng quên Pod tự rolling | Config cũ vẫn dùng | Verify trigger update |
| Multiple overlay same name | Conflict | Đặt `namePrefix` rõ ràng |
| Quên `resources` trong kustomization.yaml | Resource không include | Always list resources |
| Patch field không tồn tại | Add silent | Verify field path |
| Image transform name không match | Image không đổi | Check `image:` trong container |

## Quick reference

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:                       # YAML files / dirs
  - deployment.yaml
  - ../../base

namespace: prod
namePrefix: prod-
nameSuffix: -v1

commonLabels:
  app: my-app
commonAnnotations:
  owner: team

images:
  - name: nginx
    newTag: 1.26

replicas:
  - name: nginx
    count: 5

configMapGenerator:
  - name: app-config
    literals: [KEY=value]
    files: [config.properties]

secretGenerator:
  - name: app-secret
    literals: [PASS=admin]

patches:
  - path: patch.yaml
    target: { kind: Deployment, name: nginx }
  
  - target: { kind: Deployment, name: nginx }
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 10
```

```bash
# Build
kustomize build .
kubectl apply -k .

# Compare envs
diff <(kustomize build dev/) <(kustomize build prod/)
```

## Tóm tắt bài 1

- **Kustomize** = customize K8s manifest **không template language**. YAML thuần + overlay/patch.
- Built-in `kubectl apply -k`.
- 3 concept: `resources`, transform (namespace/prefix/labels), patches.
- **Bases + Overlays**: base có YAML thuần, overlay patch cho dev/staging/prod.
- Patches: Strategic Merge (default, hiểu K8s structure) vs JSON 6902 (precise).
- **Generator** cho ConfigMap/Secret + hash suffix → trigger update tự động.
- Helm vs Kustomize: Helm = public chart phức tạp. Kustomize = internal multi-env.
- Có thể combine: `helm template | kustomize build`.

**Bài kế tiếp** → [Phase 14 - Bài 1: Troubleshooting Pod issues](../phase-14-troubleshooting/01-troubleshoot-pods.md)
