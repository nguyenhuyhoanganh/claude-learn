# Bài 3: Container Orchestration với Kubernetes — OS cho microservices

500 containers across 50 hosts. Manual `docker run` mỗi cái? Impossible. Container crash mid-night → ai restart? Spike traffic → ai spin thêm?

**Container orchestrator** = control plane that manages entire container lifecycle. **Kubernetes** = de facto standard.

## Container orchestrator là gì

> **Container orchestrator** = system tự động hóa **deployment, scaling, networking, health, configuration** của containers across hosts.

Analogy: orchestrator là **operating system cho microservices**. OS manage processes trong 1 máy. Orchestrator manage containers trong N máy.

### Responsibilities

| Responsibility | What it does |
|---|---|
| **Scheduling** | Decide which host runs which container |
| **Bin packing** | Pack containers efficiently into hosts (CPU/mem aware) |
| **Health monitoring** | Probe containers, detect failure |
| **Self-healing** | Restart crashed containers, replace dead hosts |
| **Auto-scaling** | Add/remove containers based on load |
| **Load balancing** | Distribute traffic across container instances |
| **Service discovery** | Containers find each other by name |
| **Rolling updates** | Deploy new versions without downtime |
| **Config management** | Inject env vars, secrets, config files |
| **Storage orchestration** | Mount persistent volumes |
| **Network management** | Container-to-container networking, ingress |

Without orchestrator, you'd build all this yourself. Kubernetes does it.

## Kubernetes (k8s) — overview

OSS từ Google (descendant của internal Borg). CNCF graduated. De facto standard.

### Cluster architecture

```text
                +─────────────────────────────────────────+
                │ CONTROL PLANE (1+ controller nodes)     │
                │                                          │
                │  - API Server (you talk to this)         │
                │  - etcd (key-value DB, cluster state)    │
                │  - Scheduler (place pods on nodes)       │
                │  - Controller Manager (reconcile state)  │
                │  - Cloud Controller (LB, volumes)        │
                +─────────────────────────────────────────+
                              │
                              │ commands via API
                              │
        ┌─────────────────────┼──────────────────────────┐
        │                     │                          │
        ▼                     ▼                          ▼
+────────────────+   +────────────────+   +────────────────+
│ Worker Node 1  │   │ Worker Node 2  │   │ Worker Node 3  │
│ ┌────────────┐ │   │ ┌────────────┐ │   │ ┌────────────┐ │
│ │ kubelet    │ │   │ │ kubelet    │ │   │ │ kubelet    │ │
│ │ kube-proxy │ │   │ │ kube-proxy │ │   │ │ kube-proxy │ │
│ │ container  │ │   │ │ container  │ │   │ │ container  │ │
│ │ runtime    │ │   │ │ runtime    │ │   │ │ runtime    │ │
│ └────────────┘ │   │ └────────────┘ │   │ └────────────┘ │
│ Pods: A, B     │   │ Pods: A, C     │   │ Pods: B, C     │
+────────────────+   +────────────────+   +────────────────+
```

### Control plane components

| Component | Role |
|---|---|
| **kube-apiserver** | REST API to manipulate cluster state. Everything goes through it. |
| **etcd** | Key-value store. Source of truth for cluster state (configs, secrets, pod assignments). |
| **kube-scheduler** | Assigns pods to nodes based on resource availability + constraints. |
| **kube-controller-manager** | Reconcile loops: if desired state ≠ actual, fix it. |
| **cloud-controller-manager** | Cloud-specific: provision LB, attach volumes, manage node lifecycle. |

### Worker node components

| Component | Role |
|---|---|
| **kubelet** | Agent on each node. Talks to API server. Starts/stops containers as told. |
| **kube-proxy** | Network proxy. Routes traffic to containers based on rules. |
| **Container runtime** | containerd, CRI-O, Docker. Actually runs containers. |

## Core concepts

### Pod — smallest unit

> **Pod** = wrapper around 1+ containers that share network + storage.

Why pod not container? Sometimes need sidecar:
- App container + log shipper container.
- App container + service mesh proxy (Envoy sidecar).
- App container + secrets fetcher.

These share network (localhost) + volumes.

99% of pods = 1 main container + 0-1 sidecar.

```yaml
# Simplest pod
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
    - name: app
      image: registry.acme.com/my-service:v1.0
      ports:
        - containerPort: 8080
      resources:
        requests: {cpu: "100m", memory: "128Mi"}
        limits: {cpu: "500m", memory: "256Mi"}
```

### Deployment — manage pod replicas

Pod alone = pet. If it dies, gone. We want **cattle** — replaceable, scalable.

> **Deployment** = manages N replicas of same pod. Auto-restart, rolling update.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-svc
spec:
  replicas: 5
  selector:
    matchLabels:
      app: checkout-svc
  template:
    metadata:
      labels:
        app: checkout-svc
    spec:
      containers:
        - name: app
          image: registry.acme.com/checkout-svc:v1.2.3
          resources:
            requests: {cpu: "200m", memory: "256Mi"}
```

Apply:
```bash
kubectl apply -f deployment.yaml
```

K8s creates 5 pods. If 1 dies → automatically spawn replacement.

### Service — stable network endpoint

Pods come and go. IPs change. How do other services find them?

> **Service** = stable virtual IP + DNS name fronting pods (selected by label).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: checkout-svc
spec:
  selector:
    app: checkout-svc
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

Now other pods do:
```text
GET http://checkout-svc/api/order
→ kube-proxy routes to any of the 5 pods.
→ load balanced.
```

DNS internal: `<service-name>.<namespace>.svc.cluster.local`.

#### Service types

- **ClusterIP**: internal only, default.
- **NodePort**: expose on each node's IP at static port.
- **LoadBalancer**: provision cloud LB (ELB, GLB) → external IP.
- **ExternalName**: alias to external DNS.

### Ingress — HTTP routing from outside

> **Ingress** = HTTP-aware reverse proxy for external traffic.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
spec:
  rules:
    - host: api.acme.com
      http:
        paths:
          - path: /checkout
            backend:
              service: {name: checkout-svc, port: {number: 80}}
          - path: /payment
            backend:
              service: {name: payment-svc, port: {number: 80}}
```

External `api.acme.com/checkout` → routed to checkout-svc.

Ingress controllers: NGINX, Traefik, Istio Gateway.

### ConfigMap + Secret — externalized config

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "INFO"
  FEATURE_FLAG_X: "true"

---
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
data:
  password: cGFzc3dvcmQ=  # base64
```

Inject into pod:
```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef: {name: app-config}
        - secretRef: {name: db-creds}
```

Don't bake config into image. Externalize.

### Namespace — logical isolation

```yaml
metadata:
  namespace: team-a-prod
```

Group resources. Use cho:
- Per-team isolation.
- Per-environment (dev, staging, prod).
- Resource quota enforcement.

### Persistent Volume (PV) + Persistent Volume Claim (PVC)

Containers ephemeral. Persistent data needs volume:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 100Gi
```

Mount in pod:
```yaml
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: db-data
containers:
  - name: db
    volumeMounts:
      - mountPath: /var/lib/postgres
        name: data
```

Cloud volumes auto-provisioned (EBS, GCE PD).

## Declarative configuration

K8s manifests describe **desired state**. Controllers reconcile **actual → desired**.

```text
desired: 5 replicas of checkout-svc:v1.2.3
actual:  3 replicas running (2 crashed)
→ controller spawns 2 more.

desired: 5 replicas of checkout-svc:v1.2.3
actual:  5 replicas of v1.2.2 running
→ controller does rolling update.
```

Store manifests in **Git** (GitOps). Tools (ArgoCD, FluxCD) sync Git → cluster.

```bash
# GitOps workflow
git commit -m "Bump checkout-svc to v1.2.4"
git push
# ArgoCD detects change → applies to cluster.
```

Auditable, reversible, reviewable.

## Rolling update

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # 1 extra pod during transition
    maxUnavailable: 0  # never reduce below desired
```

Process:
1. Spawn pod with new version.
2. Pass health check.
3. Add to LB rotation.
4. Remove 1 old pod.
5. Repeat until all replaced.

Zero downtime if app graceful shutdown + readiness probe correct.

### Readiness vs Liveness probe

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5

livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
```

- **Readiness**: ready to receive traffic? If fail → removed from LB but not killed.
- **Liveness**: still alive? If fail → killed + restart.

Critical distinction. Misconfigure → cascading failure.

## Auto-scaling

### HorizontalPodAutoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: checkout-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: checkout-svc
  minReplicas: 5
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

CPU > 70% → add pods. < 70% → remove. Range: 5-50.

Custom metrics (req/sec, queue depth) via metrics adapter.

### Cluster autoscaler

Pods need scheduling but no node has capacity → cloud provider provision new node.

Down: node underutilized → drain + remove.

Hands-off scaling at both levels.

## Multi-cluster / multi-region

High availability:

```text
+──────────────────────────────────+
│ Global Load Balancer (Cloudflare,│
│ AWS Route 53)                    │
+──────────────────────────────────+
       │
       ├──► Cluster A (us-east, primary)
       ├──► Cluster B (us-west, backup)
       └──► Cluster C (eu-west, region for EU users)

Route by: proximity, latency, health, weight.
```

If 1 cluster down → traffic shifts. No global outage.

## Managed Kubernetes services

Don't run control plane yourself (operational cost). Use managed:

| Service | Provider |
|---|---|
| **EKS** | AWS |
| **GKE** | Google |
| **AKS** | Azure |
| **DOKS** | DigitalOcean |
| **OKE** | Oracle |

Provider manages control plane (HA, upgrades). You manage worker nodes + workloads.

## Alternatives to Kubernetes

| Tool | Note |
|---|---|
| **Amazon ECS** | Simpler than K8s, AWS-only |
| **AWS Fargate** | Serverless containers (no node management) |
| **Google Cloud Run** | Serverless containers, scale to zero |
| **Nomad** (HashiCorp) | Simpler, supports more than containers |
| **Docker Swarm** | Built into Docker, less mature than K8s |
| **OpenShift** | Red Hat K8s distribution + extras |

K8s = most powerful + portable. Steeper learning curve. For < 20 services on AWS, ECS often easier.

## Ecosystem additions

K8s minimal. Production needs:

| Layer | Tools |
|---|---|
| Service mesh | Istio, Linkerd, Consul |
| Ingress controllers | NGINX, Traefik, Kong |
| GitOps | ArgoCD, FluxCD |
| Monitoring | Prometheus, Grafana |
| Logging | Loki, Fluentd, Elastic |
| Secrets management | Vault, Sealed Secrets, External Secrets Operator |
| Storage | Rook (Ceph), Longhorn, OpenEBS |
| Backup | Velero |
| CI/CD | Tekton, Jenkins X, GitHub Actions |
| Policy | OPA / Gatekeeper, Kyverno |
| Container security | Falco (runtime), Trivy (scan) |

CNCF landscape > 1500 projects. Choose carefully.

## Costs

| Item | Cost |
|---|---|
| Managed K8s control plane | $70-150/month per cluster |
| Worker nodes (VMs) | Standard EC2/GCE pricing |
| LB | $20-50/month per Service of type LoadBalancer |
| Persistent volumes | Cloud disk pricing |
| Egress | Cloud egress fees |

For small team (< 5 services): managed K8s often **overkill**. ECS, Cloud Run, or even VMs simpler.

For large team (20+ services): K8s investment pays back via standardization.

## Operational cost

K8s requires expertise:
- DevOps / Platform engineer (1+ FTE typically).
- On-call rotation (cluster issues happen).
- Upgrade cycle (K8s releases every 3 months, support 1 year).

Amortize cost across N teams. 1 platform team supports 50 product teams = good ratio.

## Anti-patterns

### Anti-pattern 1: K8s for 3 services

3 microservices + small team → K8s = 80% time on infra, 20% on product.

Use simpler: ECS Fargate, Cloud Run, Heroku, Render.

### Anti-pattern 2: 1 giant cluster for everything

Single cluster = single failure domain. Multiple clusters per env / team for isolation.

### Anti-pattern 3: No resource limits

Pod without `limits` → can consume all node RAM → other pods crash.

Always set resource requests + limits.

### Anti-pattern 4: Kubectl directly to prod

`kubectl apply -f deployment.yaml` directly = no audit trail.

GitOps: change YAML in Git → CI/CD applies.

### Anti-pattern 5: Stateful workload without StatefulSet

DBs need stable identity (pod-0, pod-1) + ordered startup. Use StatefulSet, not Deployment.

## Tóm tắt bài 3

- Container orchestrator = OS cho microservices. Manage lifecycle, networking, scaling, healing.
- **Kubernetes** = de facto OSS standard. CNCF. Borg-inspired.
- Architecture: **control plane** (API, etcd, scheduler, controller) + **worker nodes** (kubelet, kube-proxy, runtime).
- Core resources: **Pod** (1+ container unit), **Deployment** (replicas), **Service** (stable network), **Ingress** (HTTP routing), **ConfigMap/Secret** (externalized config), **PV/PVC** (storage).
- **Declarative**: describe desired state, controller reconcile.
- **GitOps** (ArgoCD, FluxCD): Git = source of truth.
- **Rolling update** + readiness/liveness probes = zero-downtime deploys.
- **HPA** + Cluster autoscaler = handsfree scale.
- Multi-cluster / multi-region for HA.
- **Managed K8s** (EKS, GKE, AKS) — let cloud manage control plane.
- Alternatives: ECS, Fargate, Cloud Run, Nomad for simpler needs.
- Anti-patterns: K8s for tiny teams, single giant cluster, no resource limits, kubectl-to-prod, Deployment for stateful workload.

**Bài kế tiếp** → [Bài 4: Tổng kết — Microservices + EDA production checklist](04-production-checklist.md)
