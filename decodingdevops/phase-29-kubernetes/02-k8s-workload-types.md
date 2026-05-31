# Bài 2: Kubernetes workload types deep — Deployment, StatefulSet, DaemonSet, Job

Bài 1 overview. Bài này **đào sâu workload controllers** với production patterns.

## Deployment — stateless workload

### Anatomy

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

Comprehensive production manifest.

### Update strategies

```yaml
strategy:
  type: RollingUpdate              # Default
  rollingUpdate:
    maxSurge: 1                    # Extra pod during update
    maxUnavailable: 0              # No downtime
```

`maxSurge` + `maxUnavailable`:
- `maxSurge=1, maxUnavailable=0` → zero-downtime (recommended).
- `maxSurge=0, maxUnavailable=1` → no extra pod (limited resource).
- `maxSurge=25%, maxUnavailable=25%` → percentage.

`type: Recreate` → kill all, then create new. Downtime. Use rare cases.

### Rolling update workflow

```bash
# Update image
kubectl set image deployment/vprofile-app tomcat=ghcr.io/acme/vprofile:v1.1.0 -n vprofile

# Watch rollout
kubectl rollout status deployment/vprofile-app -n vprofile

# Pause/resume
kubectl rollout pause deployment/vprofile-app -n vprofile
# Make multiple changes...
kubectl rollout resume deployment/vprofile-app -n vprofile

# History
kubectl rollout history deployment/vprofile-app -n vprofile

# Rollback
kubectl rollout undo deployment/vprofile-app -n vprofile
kubectl rollout undo deployment/vprofile-app -n vprofile --to-revision=3
```

### Probes deep

```yaml
# Startup probe — slow boot apps (Tomcat 60s)
startupProbe:
  httpGet: {path: /, port: 8080}
  failureThreshold: 30       # 30 × 10s = 5 phút max
  periodSeconds: 10

# Liveness probe — restart unhealthy pod
livenessProbe:
  httpGet: {path: /, port: 8080}
  initialDelaySeconds: 60    # After startup
  periodSeconds: 30
  failureThreshold: 3        # 3 fail → restart

# Readiness probe — remove from Service endpoints
readinessProbe:
  httpGet: {path: /, port: 8080}
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

3 probe distinction:
- **Startup**: until first successful, disable liveness/readiness.
- **Liveness**: fail → kill + restart pod.
- **Readiness**: fail → remove from Service (no kill).

### Probe types

```yaml
# HTTP
httpGet:
  path: /health
  port: 8080
  scheme: HTTP
  httpHeaders:
    - {name: Custom-Header, value: Bearer xxx}

# TCP
tcpSocket:
  port: 3306

# exec
exec:
  command: [mysqladmin, ping, -h, localhost]

# gRPC (1.27+)
grpc:
  port: 9000
  service: ""
```

### Anti-affinity — spread pods

```yaml
affinity:
  podAntiAffinity:
    # Soft: prefer spread
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: vprofile
          topologyKey: kubernetes.io/hostname
    # Hard: must spread
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: vprofile
        topologyKey: topology.kubernetes.io/zone
```

Pods spread across nodes → 1 node fail không kill all pods.

### Topology spread constraint

Modern simpler:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: vprofile
```

Spread evenly across zones, allow uneven if necessary.

## StatefulSet — stateful workload

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: vprofile-db
spec:
  serviceName: vprofile-db
  replicas: 3
  podManagementPolicy: OrderedReady    # Or Parallel
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0                      # Update all
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

Features:
- Pod name stable: `vprofile-db-0`, `vprofile-db-1`, `vprofile-db-2`.
- Each pod own PVC: `data-vprofile-db-0`.
- Ordered start (0, 1, 2) + ordered stop (reverse).
- DNS per pod: `vprofile-db-0.vprofile-db.namespace.svc`.

### Use case

- Databases (cluster với master/replica).
- Message broker (Kafka, RabbitMQ).
- Stateful cache (Redis cluster).
- Anything với stable identity + persistent storage.

### Headless service

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

DNS query → return individual pod IPs (not VIP).

## DaemonSet — pod per node

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
        - operator: Exists      # Run on master + tainted nodes
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

Use case:
- Log collector (Fluentd, Promtail).
- Metric exporter (node_exporter).
- Network plugin (Calico, Cilium).
- Storage CSI driver.

## Job + CronJob

### Job — run to completion

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 4                    # Retry 4 lần
  activeDeadlineSeconds: 600         # Max 10 phút
  ttlSecondsAfterFinished: 86400     # Auto-delete sau 1 ngày
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
- `parallelism=5, completions=10` → 5 parallel pods, total 10 success needed.
- `parallelism=1, completions=N/A` → unbounded queue work.

Use case:
- Database migration.
- Batch processing.
- Backup task.
- One-time setup.

### CronJob — scheduled

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"              # Daily 2am
  timeZone: "America/New_York"
  concurrencyPolicy: Forbid          # Or Allow, Replace
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
- `Allow`: multiple instances run.
- `Forbid`: skip new if previous still running.
- `Replace`: kill previous, start new.

## ReplicaSet — usually managed by Deployment

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

Rarely use directly. Deployment manages ReplicaSet for you.

## Pod Disruption Budget (PDB)

Prevent too many pods down during voluntary disruption (node drain):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: vprofile-pdb
spec:
  minAvailable: 2          # Or maxUnavailable: 1
  selector:
    matchLabels:
      app: vprofile
```

Kubectl drain node → respect PDB → can't evict if would violate.

## Horizontal Pod Autoscaler (HPA)

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

Need **metrics-server** + custom metrics for non-resource scaling.

## VPA — Vertical Pod Autoscaler

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
    updateMode: "Auto"       # Or Off, Initial, Recreate
  resourcePolicy:
    containerPolicies:
      - containerName: tomcat
        minAllowed: {cpu: 100m, memory: 256Mi}
        maxAllowed: {cpu: 2, memory: 4Gi}
```

VPA recommend (or auto-apply) right-size CPU/memory based on history.

**Don't use HPA + VPA on cùng resource** — conflict. HPA for CPU, VPA for memory OK.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| No resource request | Scheduler chọn node sai | Always set request |
| No liveness/readiness | Traffic to broken pod | Define both |
| Liveness too aggressive | Restart loop | Tune threshold |
| No PDB | Evict break service | Set PDB |
| StatefulSet for stateless | Identity overhead | Use Deployment |
| DaemonSet without toleration | Skip tainted nodes | `tolerations: Exists` |
| No anti-affinity | All pod on 1 node | Add anti-affinity |
| HPA without metrics-server | Stuck at desired | Install metrics-server |

## Tóm tắt bài 2

- **Deployment** stateless với rolling update + probes + anti-affinity.
- **Startup/liveness/readiness probes** distinct purpose.
- **StatefulSet** stable identity + PVC per pod cho stateful.
- **DaemonSet** 1 pod per node cho log/metric collector.
- **Job/CronJob** run-to-completion + scheduled.
- **PDB** protect during voluntary disruption.
- **HPA** scale horizontal theo CPU/memory/custom.
- **VPA** scale vertical (right-size resource).
- **Topology spread** + **anti-affinity** = HA across zones/nodes.

**Bài kế tiếp** → [Bài 3: Services, Ingress, Network Policy](03-services-ingress-network.md)
