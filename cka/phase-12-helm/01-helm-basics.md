# Bài 1: Helm — Package Manager cho K8s

## Vì sao Helm tồn tại?

Bạn deploy app phức tạp (vd nginx-ingress, Prometheus stack) → cần manage:
- 5+ Deployment.
- 3 Service.
- ConfigMap, Secret.
- ServiceAccount + RBAC.
- HPA, PDB, NetworkPolicy.

Quản lý 20-30 YAML file tay → khó:
- Update 1 lần phải sửa nhiều file.
- Multiple env (dev/staging/prod) cần variant.
- Share giữa team khó.

→ **Helm** = "apt-get for Kubernetes". Package nhiều K8s manifest thành **Chart**, deploy 1 lệnh.

CKA 2025+ test Helm basics.

## 3 khái niệm Helm

```text
[Chart]                          [Release]                       [Repository]
Template manifest packaged       Instance đã install của Chart   Nơi lưu Chart
   (YAML + Go template)             (như Docker container         (giống Docker Hub)
                                     vs image)
   bitnami/nginx                    my-nginx-prod                  charts.bitnami.com
```

Analogy:
- Chart = recipe.
- Release = bữa ăn cooked từ recipe.
- Repository = sách công thức.

## Cài Helm

```bash
# Linux/Mac
brew install helm
# hoặc
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

helm version
# version.BuildInfo{Version:"v3.14.0", ...}
```

## Add repository

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# List
helm repo list

# Search
helm search repo nginx
# NAME                    CHART VERSION   APP VERSION   DESCRIPTION
# bitnami/nginx           18.0.1          1.27.0        nginx web server
# ingress-nginx/ingress-nginx  4.10.0     1.10.0        Ingress controller
```

## Install Chart

```bash
# Basic install
helm install my-nginx bitnami/nginx
                ▲                   ▲
                Release name        Chart name

# Output:
# NAME: my-nginx
# LAST DEPLOYED: ...
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1
```

→ Helm tạo Pod, Service, ConfigMap, ... cho nginx.

```bash
# List releases
helm list
# NAME       NAMESPACE   REVISION   STATUS     CHART          APP VERSION
# my-nginx   default     1          deployed   nginx-18.0.1   1.27.0

# Resources do release tạo
kubectl get all -l app.kubernetes.io/instance=my-nginx
```

## Customize qua Values

Chart có **values.yaml** (default values). Override:

```bash
# Inspect default values
helm show values bitnami/nginx
```

```yaml
# values.yaml (rút gọn)
replicaCount: 1
image:
  repository: nginx
  tag: 1.27.0
service:
  type: ClusterIP
  port: 80
```

### Cách 1: --set flag

```bash
helm install my-nginx bitnami/nginx \
  --set replicaCount=3 \
  --set service.type=LoadBalancer
```

### Cách 2: Custom values file

```yaml
# my-values.yaml
replicaCount: 5
image:
  tag: 1.27.0
service:
  type: LoadBalancer
  port: 8080
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

```bash
helm install my-nginx bitnami/nginx -f my-values.yaml
```

→ Production preferred. File commit Git.

## Upgrade

```bash
# Đổi config
helm upgrade my-nginx bitnami/nginx \
  --set replicaCount=5

# Hoặc upgrade chart version
helm upgrade my-nginx bitnami/nginx --version 18.0.5
```

Helm so sánh release hiện tại với spec mới → calculate diff → apply.

## Rollback

```bash
# Xem revision
helm history my-nginx
# REVISION  STATUS      CHART          APP VERSION  DESCRIPTION
# 1         superseded  nginx-18.0.1   1.27.0       Install complete
# 2         superseded  nginx-18.0.1   1.27.0       Upgrade complete
# 3         deployed    nginx-18.0.5   1.27.1       Upgrade complete

# Rollback về revision 2
helm rollback my-nginx 2
```

→ Helm restore manifest của revision đó.

## Uninstall

```bash
helm uninstall my-nginx
# release "my-nginx" uninstalled
```

→ Xoá mọi resource Chart tạo.

## Inspect Chart (không install)

```bash
# Show README
helm show readme bitnami/nginx

# Show all info
helm show all bitnami/nginx

# Show values
helm show values bitnami/nginx

# Render template với values (dry-run)
helm template my-nginx bitnami/nginx --values values.yaml
# Output: full YAML, có thể save vào file
```

→ Hữu ích để debug hoặc convert Helm chart → plain YAML.

## Tạo Chart tự code

```bash
helm create my-app
# Creates folder my-app/ với template skeleton
```

```text
my-app/
├── Chart.yaml              ← metadata
├── values.yaml             ← default values
├── charts/                 ← dependencies (sub-charts)
└── templates/              ← K8s manifests với Go template
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── _helpers.tpl        ← reusable functions
    └── tests/
```

### Chart.yaml

```yaml
apiVersion: v2
name: my-app
description: My Application
type: application
version: 0.1.0               # Chart version
appVersion: "1.0.0"          # App version
```

### templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "my-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "my-app.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - containerPort: {{ .Values.service.targetPort }}
```

→ Go template syntax: `{{ ... }}`. Variables từ `values.yaml` qua `.Values`.

### Test rendering

```bash
helm template my-release ./my-app --values custom.yaml
# Print YAML rendered
```

### Install local chart

```bash
helm install my-release ./my-app
```

### Package chart

```bash
helm package ./my-app
# my-app-0.1.0.tgz

# Push lên repo
helm push my-app-0.1.0.tgz my-repo
```

## Dependencies (sub-charts)

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: 15.0.0
    repository: https://charts.bitnami.com/bitnami
```

```bash
helm dependency update
# Tải sub-chart vào charts/
```

→ Chart A depend chart B → install A = install A + B.

## Values precedence

```text
1. helm install --set key=value (highest)
2. helm install -f custom.yaml
3. Chart's values.yaml (default)
```

Right-side override left-side.

## Common charts

| Chart | Use |
|---|---|
| `bitnami/nginx` | nginx web server |
| `bitnami/postgresql` | PostgreSQL DB |
| `ingress-nginx/ingress-nginx` | nginx Ingress Controller |
| `prometheus-community/kube-prometheus-stack` | Prometheus + Grafana + Alertmanager |
| `jetstack/cert-manager` | TLS cert management |
| `argo/argo-cd` | GitOps |
| `external-secrets/external-secrets` | External secret manager |

## Hooks

Helm support hooks (pre-install, post-install, ...):

```yaml
# templates/post-install-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: post-install
  annotations:
    "helm.sh/hook": post-install
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: setup
          image: busybox
          command: ['sh', '-c', 'echo Setup tasks']
```

→ Job chạy sau install. Migration DB, seed data, ...

## Helm 2 vs Helm 3

| | Helm 2 | Helm 3 (current) |
|---|---|---|
| Tiller (server) | ✓ (in-cluster) | ✗ (client-only) |
| Release storage | ConfigMap | Secret |
| Namespace | Cluster-scoped | Namespace-scoped |
| 3-way merge | ✗ | ✓ |
| OCI registry | ✗ | ✓ |
| Security | Lower | Higher |

→ **Helm 3 dùng phổ biến từ 2020**. Bỏ qua Helm 2.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `helm install` cùng release name | Conflict | Đổi name hoặc upgrade |
| Forget `helm repo update` | Cài version cũ | Update repo trước |
| Override values sai key | Setting không có effect | `helm show values` để biết key |
| Chart version vs App version confusion | Sai version deploy | Phân biệt 2 trong Chart.yaml |
| Helm install không namespace | Vào default | `-n <ns>` flag |
| Quên `--create-namespace` | Fail nếu namespace chưa có | Add flag |
| Rollback về revision đã purge | Fail | `helm history` xem revision còn |

## Quick reference

```bash
# Repo
helm repo add <name> <url>
helm repo update
helm repo list
helm search repo <keyword>

# Install
helm install <release> <chart>
helm install <release> <chart> -f values.yaml
helm install <release> <chart> --set key=value
helm install <release> <chart> -n <namespace> --create-namespace

# Manage
helm list
helm list -A                              # all namespace
helm status <release>
helm history <release>

# Upgrade
helm upgrade <release> <chart>
helm upgrade --install <release> <chart>  # install if not exist

# Rollback
helm rollback <release> <revision>

# Uninstall
helm uninstall <release>

# Inspect
helm show values <chart>
helm show readme <chart>
helm template <release> <chart>           # render without install

# Local chart
helm create my-chart
helm package ./my-chart
helm install <release> ./my-chart
helm lint ./my-chart                      # validate
```

## Tóm tắt bài 1

- **Helm** = package manager K8s. Chart = template, Release = installed instance.
- 3 khái niệm: Chart, Release, Repository.
- Install: `helm install <release> <chart>`. Override qua `--set` hoặc `-f values.yaml`.
- Upgrade + rollback dễ — Helm track revision.
- Tạo Chart: `helm create` → edit template/values → `helm install ./chart`.
- Go template syntax `{{ .Values.X }}`.
- Dependencies trong Chart.yaml → sub-charts.
- Common: nginx-ingress, kube-prometheus-stack, cert-manager.
- Helm 3 thay Helm 2 từ 2020 (client-only, no Tiller).

**Bài kế tiếp** → [Phase 13 - Bài 1: Kustomize Basics](../phase-13-kustomize/01-kustomize-basics.md)
