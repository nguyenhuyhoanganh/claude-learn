# Bài 2: Kubernetes workload types deep — Deployment, StatefulSet, DaemonSet, Job

Bài 1 đã overview K8s. Bài này **đào sâu các workload controller** với production pattern.

## Deployment — workload stateless

### Anatomy đầy đủ (production manifest)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vprofile-app
  namespace: vprofile
  labels:
    app: vprofile
    tier: app
    version: v1.0.0
spec:
  replicas: 3
  revisionHistoryLimit: 10
  progressDeadlineSeconds: 600
  selector:
    matchLabels:
      app: vprofile
      tier: app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: vprofile
        tier: app
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
    spec:
      serviceAccountName: vprofile
      terminationGracePeriodSeconds: 60
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - {key: app, operator: In, values: [vprofile]}
                topologyKey: kubernetes.io/hostname
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: vprofile
      initContainers:
        - name: wait-for-db
          image: busybox:1.36
          command: ['sh', '-c', 'until nc -z db 3306; do sleep 2; done']
      containers:
        - name: tomcat
          image: ghcr.io/acme/vprofile:v1.0.0
          imagePullPolicy: IfNotPresent
          ports:
            - {name: http, containerPort: 8080, protocol: TCP}
          env:
            - {name: DB_HOST, value: vprofile-db}
            - {name: DB_USER, value: admin}
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: vprofile-secrets
                  key: db-password
          envFrom:
            - configMapRef:
                name: vprofile-config
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          startupProbe:
            httpGet: {path: /, port: 8080}
            failureThreshold: 30
            periodSeconds: 10
          livenessProbe:
            httpGet: {path: /, port: 8080}
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet: {path: /, port: 8080}
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 15 && /usr/local/tomcat/bin/shutdown.sh"]
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: false
            capabilities:
              drop: [ALL]
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /usr/local/tomcat/work
            - name: config
              mountPath: /usr/local/tomcat/conf/application.properties
              subPath: application.properties
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
        - name: config
          configMap:
            name: vprofile-config
            items:
              - key: application.properties
                path: application.properties
      imagePullSecrets:
        - name: ghcr-credentials
```

Đây là manifest production đầy đủ — gồm mọi best practice (security context, probe, affinity, resource limit, secret ref).

### Update strategies (Chiến lược update)

```yaml
strategy:
  type: RollingUpdate              # Mặc định
  rollingUpdate:
    maxSurge: 1                    # Số pod EXTRA được phép tạo thêm trong lúc update
    maxUnavailable: 0              # Số pod được phép unavailable
```

`maxSurge` + `maxUnavailable` ảnh hưởng đến cách update tiến hành:
- `maxSurge=1, maxUnavailable=0` → zero-downtime (khuyến nghị).
- `maxSurge=0, maxUnavailable=1` → không tạo thêm pod (khi resource giới hạn).
- `maxSurge=25%, maxUnavailable=25%` → dạng phần trăm.

`type: Recreate` → kill toàn bộ pod cũ trước, rồi tạo pod mới. Có downtime. Dùng trong trường hợp hiếm (vd: legacy app không hỗ trợ 2 version cùng chạy).

### Rolling update workflow

```bash
# Update image
kubectl set image deployment/vprofile-app tomcat=ghcr.io/acme/vprofile:v1.1.0 -n vprofile

# Theo dõi quá trình rollout
kubectl rollout status deployment/vprofile-app -n vprofile

# Pause / resume — dùng khi muốn thay đổi nhiều thứ trước khi rollout
kubectl rollout pause deployment/vprofile-app -n vprofile
# Make multiple changes...
kubectl rollout resume deployment/vprofile-app -n vprofile

# Lịch sử các revision
kubectl rollout history deployment/vprofile-app -n vprofile

# Rollback
kubectl rollout undo deployment/vprofile-app -n vprofile
kubectl rollout undo deployment/vprofile-app -n vprofile --to-revision=3
```

### Probes deep dive (Đào sâu về probe)

```yaml
# Startup probe — cho app khởi động chậm (vd Tomcat mất ~60s warm up)
startupProbe:
  httpGet: {path: /, port: 8080}
  failureThreshold: 30       # 30 × 10s = tối đa 5 phút để boot
  periodSeconds: 10

# Liveness probe — restart pod khi không healthy
livenessProbe:
  httpGet: {path: /, port: 8080}
  initialDelaySeconds: 60    # Bắt đầu check sau khi startup xong
  periodSeconds: 30
  failureThreshold: 3        # Fail 3 lần liên tiếp → restart pod

# Readiness probe — gỡ pod khỏi Service endpoint khi không ready
readinessProbe:
  httpGet: {path: /, port: 8080}
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

**Phân biệt 3 loại probe:**
- **Startup**: chạy cho đến lần thành công đầu tiên, sau đó disable liveness/readiness — tránh restart oan trong giai đoạn startup chậm.
- **Liveness**: fail → kill pod + restart.
- **Readiness**: fail → gỡ pod khỏi Service endpoint (không kill — chỉ tạm dừng nhận traffic).

### Probe types (Các loại probe)

```yaml
# HTTP
httpGet:
  path: /health
  port: 8080
  scheme: HTTP
  httpHeaders:
    - {name: Custom-Header, value: Bearer xxx}

# TCP — chỉ check kết nối TCP có mở không
tcpSocket:
  port: 3306

# exec — chạy lệnh trong container, exit 0 = healthy
exec:
  command: [mysqladmin, ping, -h, localhost]

# gRPC (từ K8s 1.27+)
grpc:
  port: 9000
  service: ""
```

### Anti-affinity — Phân bố pod ra nhiều node

```yaml
affinity:
  podAntiAffinity:
    # Soft: ưu tiên spread (nhưng vẫn schedule nếu không thể)
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: vprofile
          topologyKey: kubernetes.io/hostname
    # Hard: bắt buộc spread (không schedule nếu không thoả)
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: vprofile
        topologyKey: topology.kubernetes.io/zone
```

→ Pod được phân bố trên nhiều node → khi 1 node fail, không kill toàn bộ pod cùng lúc.

### Topology spread constraint (Phiên bản hiện đại đơn giản hơn)

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: vprofile
```

Spread đều pod giữa các zone, cho phép skew tối đa 1 (chênh nhau 1 pod), nếu không thoả → vẫn schedule.

## StatefulSet — workload stateful

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: vprofile-db
spec:
  serviceName: vprofile-db
  replicas: 3
  podManagementPolicy: OrderedReady    # Hoặc Parallel
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0                      # Update toàn bộ
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: mariadb
          image: mariadb:11
          ports: [{containerPort: 3306}]
          env:
            - {name: MYSQL_ROOT_PASSWORD, valueFrom: {secretKeyRef: {name: db-secrets, key: root-password}}}
          volumeMounts:
            - {name: data, mountPath: /var/lib/mysql}
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: gp3
        resources:
          requests:
            storage: 50Gi
```

Tính năng đặc biệt của StatefulSet:
- Tên pod **ổn định**: `vprofile-db-0`, `vprofile-db-1`, `vprofile-db-2` (không random hash như Deployment).
- Mỗi pod có **PVC riêng**: `data-vprofile-db-0` (volume riêng cho từng pod).
- Start theo thứ tự (0, 1, 2) + stop theo thứ tự ngược lại.
- DNS riêng cho từng pod: `vprofile-db-0.vprofile-db.namespace.svc`.

### Use case của StatefulSet

- **Database** (cluster với master/replica — primary cần ID ổn định).
- **Message broker** (Kafka, RabbitMQ — broker ID phải nhất quán).
- **Stateful cache** (Redis cluster — sharding theo node ID).
- Bất kỳ thứ gì cần **stable identity** + **persistent storage** riêng cho từng instance.

### Headless service cho StatefulSet

```yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-db
spec:
  clusterIP: None              # Headless
  selector:
    app: db
  ports:
    - {port: 3306}
```

DNS query trả về IP của từng pod riêng (không phải VIP). Cần thiết để client connect tới pod cụ thể.

## DaemonSet — 1 pod trên mỗi node

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      tolerations:
        - operator: Exists      # Chạy trên cả master node + node có taint
      containers:
        - name: exporter
          image: prom/node-exporter:v1.7.0
          args:
            - --path.procfs=/host/proc
            - --path.sysfs=/host/sys
          volumeMounts:
            - {name: proc, mountPath: /host/proc, readOnly: true}
            - {name: sys, mountPath: /host/sys, readOnly: true}
      volumes:
        - {name: proc, hostPath: {path: /proc}}
        - {name: sys, hostPath: {path: /sys}}
```

Use case của DaemonSet:
- **Log collector** (Fluentd, Promtail) — đọc log của mọi pod trên node.
- **Metric exporter** (node_exporter) — expose metric của host.
- **Network plugin** (Calico, Cilium).
- **Storage CSI driver**.

→ Mỗi node trong cluster sẽ có **đúng 1 pod** của DaemonSet này.

## Job + CronJob — Workload chạy hữu hạn

### Job — chạy đến khi hoàn thành (run to completion)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 4                    # Retry tối đa 4 lần
  activeDeadlineSeconds: 600         # Max 10 phút
  ttlSecondsAfterFinished: 86400     # Tự delete sau 1 ngày
  parallelism: 1
  completions: 1
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: ghcr.io/acme/vprofile-migrate:v1.0
          command: ["./migrate.sh"]
          env:
            - {name: DB_URL, valueFrom: {secretKeyRef: {name: db-secrets, key: url}}}
```

`parallelism + completions`:
- `parallelism=5, completions=10` → 5 pod chạy song song, tổng cần 10 lần success.
- `parallelism=1, completions=N/A` → unbounded queue work.

Use case:
- **Database migration**.
- **Batch processing**.
- **Backup task**.
- **One-time setup**.

### CronJob — Job chạy theo lịch

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"              # Hàng ngày 2h sáng
  timeZone: "America/New_York"
  concurrencyPolicy: Forbid          # Hoặc Allow, Replace
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  startingDeadlineSeconds: 600
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: ghcr.io/acme/backup:v1
              command: ["./backup.sh"]
```

`concurrencyPolicy`:
- `Allow`: cho phép nhiều instance chạy đồng thời.
- `Forbid`: skip lần mới nếu lần trước vẫn đang chạy.
- `Replace`: kill lần trước, chạy lần mới.

## ReplicaSet — thường được quản qua Deployment

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: vprofile-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vprofile
  template:
    metadata: {labels: {app: vprofile}}
    spec:
      containers: [...]
```

Hiếm khi dùng trực tiếp. Deployment đã quản lý ReplicaSet hộ bạn — không cần tự tạo.

## Pod Disruption Budget (PDB) — Bảo vệ pod khi voluntary disruption

Ngăn không cho quá nhiều pod xuống cùng lúc khi có voluntary disruption (vd: drain node):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: vprofile-pdb
spec:
  minAvailable: 2          # Hoặc maxUnavailable: 1
  selector:
    matchLabels:
      app: vprofile
```

`kubectl drain node` sẽ tôn trọng PDB — không evict pod nếu vi phạm. Quan trọng cho production HA.

## Horizontal Pod Autoscaler (HPA) — Tự động scale theo metric

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vprofile-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vprofile-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {type: Utilization, averageUtilization: 70}
    - type: Resource
      resource:
        name: memory
        target: {type: Utilization, averageUtilization: 80}
    - type: Pods
      pods:
        metric: {name: http_requests_per_second}
        target: {type: AverageValue, averageValue: "1000"}
    - type: External
      external:
        metric:
          name: sqs_queue_length
          selector: {matchLabels: {queue: orders}}
        target: {type: Value, value: "100"}
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - {type: Percent, value: 100, periodSeconds: 60}
        - {type: Pods, value: 4, periodSeconds: 60}
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - {type: Percent, value: 50, periodSeconds: 60}
```

Cần **metrics-server** + custom metrics adapter cho việc scale dựa trên non-resource metric.

## VPA — Vertical Pod Autoscaler (Scale theo chiều dọc)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: vprofile-vpa
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: vprofile-app
  updatePolicy:
    updateMode: "Auto"       # Hoặc Off, Initial, Recreate
  resourcePolicy:
    containerPolicies:
      - containerName: tomcat
        minAllowed: {cpu: 100m, memory: 256Mi}
        maxAllowed: {cpu: 2, memory: 4Gi}
```

VPA gợi ý (hoặc auto-apply) CPU/memory phù hợp dựa trên lịch sử sử dụng — right-size resource.

**Không dùng HPA + VPA trên cùng resource** — sẽ conflict. Có thể dùng HPA cho CPU + VPA cho memory.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Không set resource request | Scheduler chọn node sai | Luôn set request |
| Không có liveness/readiness | Traffic vào pod broken | Define cả 2 |
| Liveness quá aggressive | Restart loop | Tinh chỉnh threshold |
| Không có PDB | Evict node làm down service | Set PDB cho mọi deployment quan trọng |
| Dùng StatefulSet cho app stateless | Identity overhead không cần | Dùng Deployment |
| DaemonSet không có toleration | Skip node có taint (vd master) | Thêm `tolerations: Exists` |
| Không có anti-affinity | Tất cả pod trên 1 node | Thêm anti-affinity |
| HPA không có metrics-server | Stuck ở desired count | Cài metrics-server |

## Tóm tắt bài 2

- **Deployment** cho workload stateless — rolling update + probe + anti-affinity.
- **Startup/liveness/readiness probe** mỗi loại có vai trò riêng biệt.
- **StatefulSet** cho workload stateful — stable identity + PVC riêng cho từng pod.
- **DaemonSet** chạy 1 pod trên mỗi node — cho log/metric collector.
- **Job/CronJob** workload chạy hữu hạn + theo lịch.
- **PDB** bảo vệ availability khi có voluntary disruption.
- **HPA** scale ngang theo CPU/memory/custom metric.
- **VPA** scale dọc (right-size resource).
- **Topology spread** + **anti-affinity** = HA across zone/node.

**Bài kế tiếp** → [Bài 3: Services, Ingress, Network Policy](03-services-ingress-network.md)
