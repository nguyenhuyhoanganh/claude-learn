# Bài 3: GitOps với ArgoCD + observability cho Kubernetes

Bài cuối khoá. **GitOps** = state cluster declared trong Git, controller sync. Cùng monitoring + logging cho K8s production.

## GitOps principles

1. **Declarative**: state described declaratively (YAML).
2. **Versioned**: source of truth in Git.
3. **Automated**: controller pull state → cluster.
4. **Continuous reconciliation**: detect drift + correct.

Tools: **ArgoCD** (most popular), **Flux** (CNCF graduated), **Fleet** (Rancher).

## ArgoCD setup

```bash
# Install
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# CLI
brew install argocd

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# https://localhost:8080

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" | base64 -d
```

Or via Helm:

```bash
helm install argocd argo/argo-cd --namespace argocd --create-namespace
```

## Application — basic

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: vprofile
  namespace: argocd
spec:
  project: default

  source:
    repoURL: https://github.com/acme/k8s-manifests
    path: vprofile/production
    targetRevision: HEAD

  destination:
    server: https://kubernetes.default.svc
    namespace: vprofile

  syncPolicy:
    automated:
      prune: true              # Delete resources removed from Git
      selfHeal: true           # Auto-correct manual change
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

ArgoCD continuous watch Git → apply manifests to cluster.

## App of Apps pattern

Manage multiple apps with single root:

```yaml
# apps/root.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/acme/k8s-manifests
    path: apps/                 # Folder of Application manifests
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
```

`apps/vprofile.yaml`, `apps/monitoring.yaml`, `apps/ingress.yaml` each define Application.

Root sync → child apps sync → cluster manifests sync. Hierarchical.

## ApplicationSet — many apps from template

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-addons
spec:
  generators:
    - clusters: {}              # All registered clusters
  template:
    metadata:
      name: '{{name}}-addons'
    spec:
      source:
        repoURL: https://github.com/acme/addons
        targetRevision: HEAD
        path: '{{name}}'
      destination:
        server: '{{server}}'
        namespace: addons
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

Auto-create Application per registered cluster.

## Helm + ArgoCD

```yaml
spec:
  source:
    repoURL: https://github.com/acme/charts
    path: vprofile
    targetRevision: main
    helm:
      releaseName: vprofile
      valueFiles:
        - values.yaml
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: "v1.2.3"
      fileParameters:
        - name: certs.crt
          path: certs/tls.crt
```

## Kustomize + ArgoCD

```yaml
spec:
  source:
    repoURL: https://github.com/acme/k8s
    path: overlays/production
    targetRevision: main
    kustomize:
      images:
        - ghcr.io/acme/vprofile:v1.2.3
      commonLabels:
        environment: production
```

## Sync waves + hooks

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"      # Order
```

Sync order: lower waves first. Use case:
- Wave -1: Namespace, CRD.
- Wave 0: ConfigMap, Secret.
- Wave 1: Deployment.
- Wave 2: Service, Ingress.

### Pre/Post sync hooks

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/acme/vprofile-migrate:v1.2.3
          command: [./migrate.sh]
```

Hooks: `PreSync`, `Sync`, `PostSync`, `SyncFail`.

## Progressive Delivery — Argo Rollouts

Replace Deployment với Rollout for advanced strategies:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: vprofile
spec:
  replicas: 5
  selector:
    matchLabels: {app: vprofile}
  template:
    metadata: {labels: {app: vprofile}}
    spec:
      containers:
        - name: tomcat
          image: ghcr.io/acme/vprofile:v1.0.0

  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: {duration: 5m}
        - analysis:
            templates:
              - {templateName: success-rate}
            args:
              - {name: service-name, value: vprofile}
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
        - setWeight: 100
      canaryService: vprofile-canary
      stableService: vprofile-stable
      trafficRouting:
        nginx:
          stableIngress: vprofile-stable
```

Auto-progress canary deploy with metric analysis.

### AnalysisTemplate

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
    - name: service-name
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] > 0.95
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service-name}}", status!~"5.."}[5m]))
              / sum(rate(http_requests_total{service="{{args.service-name}}"}[5m]))
```

Query Prometheus → if success rate < 95%, abort canary + rollback.

## Observability stack for K8s

### kube-prometheus-stack

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
    --namespace monitoring --create-namespace \
    --values monitoring-values.yaml
```

`monitoring-values.yaml`:

```yaml
prometheus:
  prometheusSpec:
    retention: 30d
    retentionSize: "50GB"
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: [ReadWriteOnce]
          resources: {requests: {storage: 100Gi}}
          storageClassName: gp3
    resources:
      requests: {cpu: 500m, memory: 2Gi}
      limits: {memory: 4Gi}

grafana:
  adminPassword: "changeme"
  persistence:
    enabled: true
    size: 10Gi
  ingress:
    enabled: true
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    hosts:
      - grafana.acme.com
    tls:
      - secretName: grafana-tls
        hosts: [grafana.acme.com]
  additionalDataSources:
    - name: Loki
      type: loki
      url: http://loki.monitoring:3100

alertmanager:
  config:
    route:
      receiver: slack
    receivers:
      - name: slack
        slack_configs:
          - api_url: ${SLACK_WEBHOOK}
            channel: '#alerts'
```

Includes:
- Prometheus.
- Alertmanager.
- Grafana.
- node-exporter (DaemonSet).
- kube-state-metrics.
- Pre-built dashboards.
- Pre-built ServiceMonitors for K8s components.

### ServiceMonitor — auto-discover

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: vprofile
  namespace: vprofile
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: vprofile
  endpoints:
    - port: http
      path: /actuator/prometheus
      interval: 30s
```

Prometheus auto-scrape services with matching labels.

### PrometheusRule

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: vprofile-alerts
  labels:
    release: monitoring
spec:
  groups:
    - name: vprofile
      rules:
        - alert: VprofileHighLatency
          expr: |
            histogram_quantile(0.99,
              sum by (le) (rate(http_request_duration_seconds_bucket{app="vprofile"}[5m]))
            ) > 1
          for: 5m
          labels: {severity: warning}
          annotations:
            summary: "P99 latency > 1s"
```

## Logging — Loki

```bash
helm install loki grafana/loki-stack \
    --namespace monitoring \
    --set grafana.enabled=false \
    --set promtail.enabled=true
```

Promtail DaemonSet → ship logs from all pods → Loki.

Query in Grafana:

```logql
{namespace="vprofile", app="vprofile"} |= "ERROR"
```

## Tracing — Tempo + OpenTelemetry

```bash
helm install tempo grafana/tempo \
    --namespace monitoring
```

Instrument app với OpenTelemetry SDK or auto-instrumentation:

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: java-instrumentation
spec:
  java:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-java:latest
  exporter:
    endpoint: http://tempo:4317
```

Pod annotation:

```yaml
metadata:
  annotations:
    instrumentation.opentelemetry.io/inject-java: "true"
```

Auto-inject Java agent → instrument app → send traces.

## Cluster autoscaling — Karpenter

```bash
helm install karpenter oci://public.ecr.aws/karpenter/karpenter \
    --version v0.32.0 \
    --namespace karpenter --create-namespace
```

NodePool:

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - {key: kubernetes.io/arch, operator: In, values: [amd64]}
        - {key: karpenter.k8s.aws/instance-category, operator: In, values: [m, c]}
        - {key: karpenter.sh/capacity-type, operator: In, values: [spot]}
      nodeClassRef: {name: default}
  limits: {cpu: 1000}
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 168h
```

Karpenter watch unscheduled pods → provision exact instance type needed. Faster than Cluster Autoscaler.

## Backup — Velero

```bash
helm install velero vmware-tanzu/velero \
    --namespace velero --create-namespace \
    --set configuration.provider=aws \
    --set configuration.backupStorageLocation.bucket=acme-velero-backups \
    --set configuration.backupStorageLocation.config.region=us-east-1
```

Backup:

```bash
velero backup create vprofile-prod-2026-05-31 \
    --include-namespaces vprofile \
    --ttl 720h

velero schedule create daily-backup \
    --schedule="0 2 * * *" \
    --include-namespaces vprofile
```

Restore:

```bash
velero restore create --from-backup vprofile-prod-2026-05-31
```

Disaster recovery production essential.

## Security — Falco runtime

```bash
helm install falco falcosecurity/falco \
    --namespace falco --create-namespace \
    --set falcosidekick.enabled=true \
    --set falcosidekick.webui.enabled=true
```

Detect runtime threats:
- Privileged container spawn.
- Shell in container.
- Sensitive file access.
- Network anomaly.

Alert to Slack/SIEM.

## Cost — OpenCost / Kubecost

```bash
helm install kubecost kubecost/cost-analyzer \
    --namespace kubecost --create-namespace
```

Show cost per namespace/deployment/label.

## End-to-end flow

```text
Developer push code → GitHub
                          │
                          ▼ Webhook
                  GitHub Actions
                          │
                          ▼ Build + push
                       ECR/GHCR image
                          │
                          ▼ Update manifest
                  GitHub k8s-manifests repo
                          │
                          ▼ Watch by ArgoCD
                       ArgoCD sync
                          │
                          ▼ Apply
                       Kubernetes cluster
                          │
                          ▼ Monitor
              Prometheus + Loki + Tempo
                          │
                          ▼ Alert
              Alertmanager → Slack/PagerDuty
                          │
                          ▼ Daily backup
                       Velero → S3
```

Full DevOps pipeline production-grade.

## Tổng kết toàn khoá

30 phase đã cover:
1. **Foundations** (1-5): DevOps culture, SDLC, CI/CD concepts, tools setup.
2. **Infrastructure basics** (6-10): Vagrant, vProfile, networking, containers intro.
3. **Programming** (11-12): Bash + AI scripting.
4. **AWS Cloud** (13-15, 24-26): IAM/EC2/VPC, lift-shift, refactor, advanced services, GCP.
5. **CI/CD platforms** (16-19, 25): Maven, Jenkins, GitHub Actions, GitLab, AWS CodePipeline.
6. **Languages & IaC** (20-22): Python, Terraform, Ansible.
7. **Observability** (23): Prometheus/Grafana/Loki/Tempo.
8. **Container** (27-28): Docker deep, vProfile containerize.
9. **Kubernetes** (29-30): K8s architecture, vProfile on K8s, GitOps.

**You are now a production-ready DevOps Engineer**.

## Tóm tắt bài 3

- **GitOps**: declarative + versioned + automated + continuous reconciliation.
- **ArgoCD** sync Git → cluster với Application + ApplicationSet.
- **Argo Rollouts** progressive delivery: canary + analysis.
- **kube-prometheus-stack** comprehensive observability.
- **ServiceMonitor + PrometheusRule** declarative monitoring config.
- **Loki + Promtail** logs cheap.
- **Tempo + OpenTelemetry** distributed tracing.
- **Karpenter** modern cluster autoscaler.
- **Velero** backup + disaster recovery.
- **Falco** runtime threat detection.

## Lời kết khoá học

Bạn đã đi qua hành trình từ **chưa biết DevOps** → **production-grade DevOps engineer**:

- Cài đặt tool, setup môi trường.
- Linux + Git + Bash + Python.
- Cloud (AWS + GCP).
- IaC (Terraform).
- Configuration management (Ansible).
- CI/CD (Jenkins + GitHub Actions + GitLab + AWS).
- Container (Docker + Compose).
- Orchestration (Kubernetes + Helm + ArgoCD).
- Observability (Prometheus + Grafana + Loki + Tempo).

**Bước tiếp theo**:
- Apply project thực: deploy product cá nhân theo stack đã học.
- Certificate: AWS SAA → AWS DevOps Pro → CKA → CKAD → Terraform Associate.
- Contribute open source.
- Join community: CNCF Slack, DevOps Vietnam.
- Apply DevOps Engineer / Platform Engineer / SRE jobs.

**Chúc bạn thành công trong sự nghiệp DevOps! 🚀**

(Phase tiếp → ngoài khoá này, tự khám phá: Service Mesh, eBPF, AI/MLOps, Platform Engineering.)
