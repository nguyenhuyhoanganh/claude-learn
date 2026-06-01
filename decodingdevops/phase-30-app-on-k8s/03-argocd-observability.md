# Bài 3: GitOps với ArgoCD + observability cho Kubernetes

Bài cuối của toàn khoá. **GitOps** = trạng thái cluster được declare (khai báo) trong Git, controller tự sync về cluster. Kết hợp với observability stack đầy đủ cho K8s production.

## GitOps principles (Nguyên tắc GitOps)

1. **Declarative** (khai báo): Mọi state được mô tả bằng YAML.
2. **Versioned** (có version): Git là source of truth (nguồn sự thật).
3. **Automated** (tự động): Controller pull state → áp dụng vào cluster.
4. **Continuous reconciliation** (đối chiếu liên tục): Detect drift (lệch state) + tự sửa.

Các tool phổ biến: **ArgoCD** (phổ biến nhất), **Flux** (CNCF graduated — đã trưởng thành), **Fleet** (của Rancher).

## ArgoCD setup

```bash
# Cài đặt
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Cài CLI
brew install argocd

# Truy cập UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Mở: https://localhost:8080

# Lấy admin password mặc định
kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" | base64 -d
```

Hoặc cài qua Helm chart:

```bash
helm install argocd argo/argo-cd --namespace argocd --create-namespace
```

## Application — Khái niệm cơ bản

`Application` là CRD chính của ArgoCD — mô tả 1 ứng dụng cần sync:

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
      prune: true              # Xoá resource đã bị xoá khỏi Git
      selfHeal: true           # Tự sửa khi có thay đổi thủ công
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

ArgoCD liên tục watch Git → tự apply manifest vào cluster.

## App of Apps pattern (Mẫu "App của App")

Quản lý nhiều app với 1 root application duy nhất — dạng cây phân cấp:

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
    path: apps/                 # Folder chứa các Application manifest con
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
```

Trong folder `apps/`: `vprofile.yaml`, `monitoring.yaml`, `ingress.yaml` — mỗi file là 1 Application con.

Khi root sync → child app sync → cluster manifest sync. Phân cấp gọn gàng.

## ApplicationSet — Nhiều app sinh ra từ template

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-addons
spec:
  generators:
    - clusters: {}              # Tất cả cluster đã đăng ký
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

Tự động tạo 1 Application cho mỗi cluster đã đăng ký — không cần copy paste thủ công.

## Helm + ArgoCD

ArgoCD hỗ trợ render Helm chart:

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

Tương tự với Kustomize:

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

## Sync waves + hooks (Sóng sync và hook)

Điều khiển thứ tự apply resource:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"      # Thứ tự
```

Resource có wave thấp được apply trước. Use case thực tế:
- **Wave -1**: Namespace, CRD (Custom Resource Definition) — cần có trước nhất.
- **Wave 0**: ConfigMap, Secret.
- **Wave 1**: Deployment.
- **Wave 2**: Service, Ingress (đặt sau cùng để traffic chỉ chuyển khi Deployment đã sẵn sàng).

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

Các loại hook: `PreSync` (trước sync), `Sync` (trong sync), `PostSync` (sau sync), `SyncFail` (khi sync thất bại).

## Progressive Delivery — Argo Rollouts

Thay thế Deployment thường bằng Rollout để có chiến lược triển khai cao cấp (canary, blue/green):

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
        - setWeight: 10                          # 10% traffic vào version mới
        - pause: {duration: 5m}                  # Chờ 5 phút quan sát
        - analysis:                              # Phân tích metric tự động
            templates:
              - {templateName: success-rate}
            args:
              - {name: service-name, value: vprofile}
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
        - setWeight: 100                          # 100% chuyển sang version mới
      canaryService: vprofile-canary
      stableService: vprofile-stable
      trafficRouting:
        nginx:
          stableIngress: vprofile-stable
```

→ Tự động tăng dần traffic sang version mới, kèm phân tích metric — nếu lỗi thì rollback.

### AnalysisTemplate — kiểm tra metric tự động

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
      successCondition: result[0] > 0.95            # Success rate > 95%
      failureLimit: 3                               # Cho phép 3 lần fail trước khi abort
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service-name}}", status!~"5.."}[5m]))
              / sum(rate(http_requests_total{service="{{args.service-name}}"}[5m]))
```

Logic: Query Prometheus → nếu success rate < 95% → abort canary + rollback. Tự động hoá hoàn toàn việc kiểm tra.

## Observability stack cho K8s

### kube-prometheus-stack (Bộ monitoring tích hợp)

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

Stack này bao gồm:
- **Prometheus** — metrics store + query engine.
- **Alertmanager** — gửi alert.
- **Grafana** — UI cho dashboard.
- **node-exporter** (DaemonSet — chạy trên mọi node) — thu thập metric host.
- **kube-state-metrics** — metric về state K8s object (deployment, pod, ...).
- **Pre-built dashboards** sẵn cho K8s.
- **Pre-built ServiceMonitors** cho component K8s.

### ServiceMonitor — Auto-discover scrape target

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

Prometheus tự discover và scrape các service có label phù hợp — không cần update Prometheus config khi thêm service mới.

### PrometheusRule — Định nghĩa alert bằng YAML

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

Quản lý alert as code — version control đầy đủ.

## Logging — Loki

```bash
helm install loki grafana/loki-stack \
    --namespace monitoring \
    --set grafana.enabled=false \
    --set promtail.enabled=true
```

Cách hoạt động: Promtail (DaemonSet) chạy trên mọi node → ship log từ tất cả pod → Loki lưu trữ.

Query log trong Grafana với ngôn ngữ LogQL:

```logql
{namespace="vprofile", app="vprofile"} |= "ERROR"
```

So với ELK, Loki rẻ hơn nhiều vì chỉ index label, không index full text.

## Tracing — Tempo + OpenTelemetry

```bash
helm install tempo grafana/tempo \
    --namespace monitoring
```

Instrument (gắn telemetry) app với OpenTelemetry SDK hoặc auto-instrumentation:

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

Pod muốn auto-instrument chỉ cần thêm annotation:

```yaml
metadata:
  annotations:
    instrumentation.opentelemetry.io/inject-java: "true"
```

OpenTelemetry Operator tự inject Java agent → instrument app → gửi trace lên Tempo.

## Cluster autoscaling — Karpenter

Karpenter là cluster autoscaler thế hệ mới — nhanh hơn và linh hoạt hơn Cluster Autoscaler truyền thống:

```bash
helm install karpenter oci://public.ecr.aws/karpenter/karpenter \
    --version v0.32.0 \
    --namespace karpenter --create-namespace
```

NodePool — định nghĩa loại node Karpenter được phép tạo:

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

Cách hoạt động: Karpenter watch pod chưa được schedule → tự provision instance đúng loại cần thiết (size, instance family, spot/on-demand). Nhanh hơn Cluster Autoscaler vì không phụ thuộc ASG.

## Backup — Velero

```bash
helm install velero vmware-tanzu/velero \
    --namespace velero --create-namespace \
    --set configuration.provider=aws \
    --set configuration.backupStorageLocation.bucket=acme-velero-backups \
    --set configuration.backupStorageLocation.config.region=us-east-1
```

Tạo backup:

```bash
velero backup create vprofile-prod-2026-05-31 \
    --include-namespaces vprofile \
    --ttl 720h

velero schedule create daily-backup \
    --schedule="0 2 * * *" \
    --include-namespaces vprofile
```

Restore khi cần:

```bash
velero restore create --from-backup vprofile-prod-2026-05-31
```

Velero backup cả K8s resource (YAML) và Persistent Volume (data). Essential cho disaster recovery ở production.

## Security — Falco runtime detection

```bash
helm install falco falcosecurity/falco \
    --namespace falco --create-namespace \
    --set falcosidekick.enabled=true \
    --set falcosidekick.webui.enabled=true
```

Falco detect các threat (mối đe doạ) runtime:
- Privileged container spawn (container chạy với quyền cao).
- Shell trong container (có người đang exec vào).
- Sensitive file access (truy cập file nhạy cảm).
- Network anomaly (bất thường về mạng).

Alert được gửi đến Slack / SIEM để team security xử lý.

## Cost monitoring — OpenCost / Kubecost

```bash
helm install kubecost kubecost/cost-analyzer \
    --namespace kubecost --create-namespace
```

Hiển thị chi phí phân bổ theo namespace / deployment / label — biết được team / service nào đang tốn tiền nhất.

## End-to-end flow (Toàn bộ pipeline DevOps)

```text
Developer push code → GitHub
                          │
                          ▼ Webhook
                  GitHub Actions
                          │
                          ▼ Build + push image
                       ECR/GHCR
                          │
                          ▼ Update manifest tag
                  GitHub k8s-manifests repo
                          │
                          ▼ ArgoCD watch + sync
                       ArgoCD
                          │
                          ▼ Apply manifest
                       Kubernetes cluster
                          │
                          ▼ Monitor
              Prometheus + Loki + Tempo
                          │
                          ▼ Alert khi có vấn đề
              Alertmanager → Slack/PagerDuty
                          │
                          ▼ Daily backup
                       Velero → S3
```

Đây là pipeline DevOps production-grade hoàn chỉnh.

## Tổng kết toàn khoá học

30 phase đã cover:

1. **Foundations** (1-5): DevOps culture, SDLC, CI/CD concept, setup tool.
2. **Infrastructure basics** (6-10): Vagrant, vProfile, networking, intro container.
3. **Programming** (11-12): Bash + AI scripting.
4. **AWS Cloud** (13-15, 24-26): IAM/EC2/VPC, lift-shift, refactor, dịch vụ nâng cao, GCP.
5. **CI/CD platforms** (16-19, 25): Maven, Jenkins, GitHub Actions, GitLab, AWS CodePipeline.
6. **Languages & IaC** (20-22): Python, Terraform, Ansible.
7. **Observability** (23): Prometheus / Grafana / Loki / Tempo.
8. **Container** (27-28): Docker deep, vProfile containerize.
9. **Kubernetes** (29-30): K8s architecture, vProfile trên K8s, GitOps.

**Bạn đã sẵn sàng làm DevOps Engineer production-grade.**

## Tóm tắt bài 3

- **GitOps**: declarative + versioned + automated + continuous reconciliation.
- **ArgoCD** sync Git → cluster qua Application + ApplicationSet.
- **Argo Rollouts** progressive delivery: canary + analysis.
- **kube-prometheus-stack** observability toàn diện.
- **ServiceMonitor + PrometheusRule** quản lý monitoring as code.
- **Loki + Promtail** logs giá rẻ.
- **Tempo + OpenTelemetry** distributed tracing.
- **Karpenter** cluster autoscaler hiện đại.
- **Velero** backup + disaster recovery.
- **Falco** runtime threat detection.

## Lời kết khoá học

Bạn đã đi qua hành trình từ **chưa biết DevOps** → **DevOps engineer production-grade**:

- Cài đặt tool, setup môi trường.
- Linux + Git + Bash + Python.
- Cloud (AWS + GCP).
- IaC (Terraform).
- Configuration management (Ansible).
- CI/CD (Jenkins + GitHub Actions + GitLab + AWS).
- Container (Docker + Compose).
- Orchestration (Kubernetes + Helm + ArgoCD).
- Observability (Prometheus + Grafana + Loki + Tempo).

**Bước tiếp theo cho sự nghiệp:**
- Apply project thực tế: deploy product cá nhân theo stack đã học.
- Certificate: AWS SAA → AWS DevOps Pro → CKA → CKAD → Terraform Associate.
- Contribute open source.
- Tham gia community: CNCF Slack, DevOps Vietnam.
- Apply DevOps Engineer / Platform Engineer / SRE jobs.

**Chúc bạn thành công trong sự nghiệp DevOps!**

(Phase tiếp theo — ngoài khoá này, tự khám phá: Service Mesh, eBPF, AI/MLOps, Platform Engineering.)
