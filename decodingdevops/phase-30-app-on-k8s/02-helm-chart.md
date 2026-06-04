# Bài 2: Helm chart cho vProfile — package manager K8s

20+ YAML files cho vProfile = nightmare. **Helm** = npm/apt cho K8s — package, template, version, share.

## Khái niệm Helm

```text
Chart                 = package (thư mục chứa các template)
Release               = một chart đã cài đặt (instance)
Repository            = chart registry (giống Docker Hub cho image)
Values                = config để override default
```

## Setup

```bash
brew install helm

# Thêm repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Search
helm search repo nginx
helm search hub wordpress    # Search trên Artifact Hub

# Install
helm install my-nginx bitnami/nginx --namespace web --create-namespace

# Liệt kê release
helm list -A

# Upgrade
helm upgrade my-nginx bitnami/nginx --set replicaCount=3

# Rollback
helm rollback my-nginx 1

# Uninstall
helm uninstall my-nginx -n web
```

## Chart structure (Cấu trúc chart)

```text
vprofile/
├── Chart.yaml                  # Metadata
├── values.yaml                 # Default values
├── values.schema.json          # JSON Schema validation
├── README.md
├── templates/
│   ├── _helpers.tpl            # Template snippet tái sử dụng
│   ├── NOTES.txt               # Message hiển thị sau install
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   ├── serviceaccount.yaml
│   └── tests/
│       └── test-connection.yaml
├── charts/                     # Sub-charts
└── crds/                       # CRDs
```

## Chart.yaml

```yaml
apiVersion: v2
name: vprofile
description: vProfile Java web application
type: application
version: 1.0.0                  # Chart version
appVersion: "1.0.0"             # App version
home: https://github.com/acme/vprofile
sources:
  - https://github.com/acme/vprofile
maintainers:
  - name: DevOps Team
    email: devops@acme.com
keywords:
  - java
  - tomcat
  - web
dependencies:
  - name: mariadb
    version: 16.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: mariadb.enabled
  - name: memcached
    version: 7.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: memcached.enabled
  - name: rabbitmq
    version: 13.0.0
    repository: https://charts.bitnami.com/bitnami
    condition: rabbitmq.enabled
```

```bash
# Cài dependency
helm dependency update vprofile/
```

## values.yaml

```yaml
# Default values cho vProfile

replicaCount: 3

image:
  repository: ghcr.io/acme/vprofile
  tag: ""                       # Default to .Chart.AppVersion
  pullPolicy: IfNotPresent

imagePullSecrets:
  - name: ghcr-credentials

nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: vprofile.acme.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: vprofile-tls
      hosts:
        - vprofile.acme.com

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

pdb:
  enabled: true
  minAvailable: 2

env:
  LOG_LEVEL: INFO
  JAVA_OPTS: "-Xms512m -Xmx1024m"

secrets:
  dbPassword: ""                # Required, set via --set or CI
  mqPassword: ""

# Sub-chart values
mariadb:
  enabled: true
  auth:
    rootPassword: ""
    database: accounts
    username: admin
    password: ""
  primary:
    persistence:
      size: 20Gi

memcached:
  enabled: true
  resources:
    requests: {memory: 128Mi}

rabbitmq:
  enabled: true
  auth:
    username: vprofileuser
    password: ""
```

## Templates

### `_helpers.tpl` (Template snippet tái sử dụng)

```yaml
{{/*
Common labels (label dùng chung)
*/}}
{{- define "vprofile.labels" -}}
helm.sh/chart: {{ include "vprofile.chart" . }}
app.kubernetes.io/name: {{ include "vprofile.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "vprofile.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vprofile.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Full name
*/}}
{{- define "vprofile.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
```

### `templates/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "vprofile.fullname" . }}
  labels:
    {{- include "vprofile.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "vprofile.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
      {{- end }}
      labels:
        {{- include "vprofile.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "vprofile.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          envFrom:
            - configMapRef:
                name: {{ include "vprofile.fullname" . }}-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "vprofile.fullname" . }}-secret
                  key: db-password
            - name: MQ_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "vprofile.fullname" . }}-secret
                  key: mq-password
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 60
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

### Các template khác theo pattern tương tự

`configmap.yaml`, `secret.yaml`, `service.yaml`, `ingress.yaml`, `hpa.yaml`, `pdb.yaml`, ...

### Template functions (Các hàm template hay dùng)

```yaml
{{ .Values.image.tag | default .Chart.AppVersion }}      # Default value
{{ .Values.name | upper }}                                # Function chuyển đổi
{{ .Values.name | quote }}                                # Quote string
{{ toYaml .Values.resources | nindent 12 }}               # Convert + indent
{{ tpl .Values.message . }}                               # Render template
{{ include "vprofile.labels" . | nindent 4 }}             # Include named template
{{ b64enc "hello" }}                                       # Encode base64
{{ sha256sum "data" }}                                     # Hash
{{ randAlphaNum 16 }}                                      # Random string

{{ if .Values.enabled }}...{{ end }}                       # Conditional
{{ range .Values.hosts }}- {{ . }}{{ end }}                # Loop
{{ with .Values.service }}{{ .port }}{{ end }}              # Đổi scope
{{ required "DB password required" .Values.dbPassword }}   # Bắt buộc phải có
```

## Install + manage

```bash
# Install với custom values
helm install vprofile ./vprofile \
    --namespace vprofile --create-namespace \
    --values values-prod.yaml \
    --set image.tag=v1.2.3 \
    --set secrets.dbPassword=SuperSecret

# Dry run (preview, không thực sự apply)
helm install vprofile ./vprofile --dry-run --debug

# Upgrade
helm upgrade vprofile ./vprofile \
    --values values-prod.yaml \
    --set image.tag=v1.2.4 \
    --reuse-values \                # Giữ lại --set values trước đó
    --atomic \                       # Rollback nếu fail
    --timeout 10m

# Xem diff trước khi upgrade
helm plugin install https://github.com/databus23/helm-diff
helm diff upgrade vprofile ./vprofile

# Lịch sử
helm history vprofile

# Rollback
helm rollback vprofile 1

# Uninstall
helm uninstall vprofile
```

## Multi-environment values (Values cho nhiều môi trường)

```text
charts/vprofile/
├── values.yaml          # Mặc định (chung)
├── values-dev.yaml      # Override cho dev
├── values-staging.yaml
└── values-prod.yaml
```

`values-prod.yaml`:

```yaml
replicaCount: 5
image:
  tag: v1.0.0
resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: 2
    memory: 2Gi
mariadb:
  primary:
    persistence:
      size: 100Gi
```

Install:

```bash
helm install vprofile ./vprofile -f values.yaml -f values-prod.yaml
```

File sau override file trước.

## Publish chart (Phân phối chart)

### Push lên OCI registry

```bash
# Package
helm package ./vprofile
# vprofile-1.0.0.tgz

# Push lên OCI (ECR, GHCR đều hỗ trợ OCI)
helm push vprofile-1.0.0.tgz oci://ghcr.io/acme/charts

# Cách dùng
helm install vprofile oci://ghcr.io/acme/charts/vprofile --version 1.0.0
```

### Push lên ChartMuseum

```bash
helm push vprofile ./vprofile https://charts.acme.com/
```

### Dùng GitHub Pages làm chart repo

```bash
# Generate index
helm repo index .

# Push lên branch gh-pages
git checkout gh-pages
cp ../vprofile-1.0.0.tgz .
helm repo index .
git add . && git commit -m "Release 1.0.0" && git push

# Người dùng khác:
helm repo add acme https://acme.github.io/charts
helm install vprofile acme/vprofile
```

## Test chart

```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "vprofile.fullname" . }}-test-connection"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: wget
      image: busybox
      command: ["wget"]
      args: ["{{ include "vprofile.fullname" . }}:{{ .Values.service.port }}"]
  restartPolicy: Never
```

```bash
helm test vprofile
```

## Lint + validate

```bash
helm lint ./vprofile
# Check syntax + best practices

helm template vprofile ./vprofile > rendered.yaml
# Render template ở local để review

helm install vprofile ./vprofile --dry-run --debug
# Validate trên cluster (nhưng không thực sự apply)
```

## Helmfile — manage multiple releases

```yaml
# helmfile.yaml
releases:
  - name: ingress-nginx
    namespace: ingress-nginx
    chart: ingress-nginx/ingress-nginx
    version: 4.9.0

  - name: cert-manager
    namespace: cert-manager
    chart: jetstack/cert-manager
    version: v1.13.3
    set:
      - {name: installCRDs, value: true}

  - name: prometheus
    namespace: monitoring
    chart: prometheus-community/kube-prometheus-stack
    version: 56.6.0
    values:
      - prometheus-values.yaml

  - name: vprofile
    namespace: vprofile
    chart: ./vprofile
    values:
      - values-{{ .Environment.Name }}.yaml

environments:
  staging: {}
  production: {}
```

```bash
helmfile -e production sync
```

Declarative tất cả release của cluster trong 1 file.

## ArgoCD — GitOps cho Helm

`Application` manifest:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: vprofile
spec:
  project: default
  source:
    repoURL: https://github.com/acme/charts
    path: vprofile
    targetRevision: main
    helm:
      releaseName: vprofile
      valueFiles:
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: "v1.2.3"
  destination:
    server: https://kubernetes.default.svc
    namespace: vprofile
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

ArgoCD liên tục sync Git → cluster. Đây là pattern GitOps deployment.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Hardcode value trong template | Cứng nhắc, không linh hoạt | Luôn dùng Values |
| Không validate required field | Silent fail | Dùng `{{ required }}` cho field bắt buộc |
| Indent sai trong template | YAML invalid | Dùng `nindent` nhất quán |
| Chart version khác app version | Gây confusion | Bump chart khi template thay đổi |
| Quên checksum annotation | ConfigMap đổi mà pod không restart | Thêm checksum annotation |
| `--reuse-values` bỏ qua defaults mới | Values lỗi thời | Kết hợp với `--reset-values` cẩn thận |

## Tóm tắt bài 2

- **Helm** = package manager cho K8s.
- **Chart** = package chứa template; **Release** = instance đã cài đặt.
- **values.yaml** chứa default; override với `-f` hoặc `--set`.
- **Templates** + **`_helpers.tpl`** chứa snippet tái sử dụng.
- **Dependencies** cho phép dùng sub-chart (mariadb, memcached).
- **OCI registry** = cách phân phối chart hiện đại.
- **`helm test`**, `lint`, `template`, `--dry-run` để validate.
- **Helmfile** + **ArgoCD** quản lý nhiều release + GitOps.

**Bài kế tiếp** → [Bài 3: GitOps với ArgoCD và observability cho K8s](03-argocd-observability.md)
