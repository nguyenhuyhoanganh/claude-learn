# Bài 1: Monitor Cluster Components

## Vì sao monitoring quan trọng cho CKA?

Trong exam, bạn sẽ:
- Check node nào CPU/RAM cao (chọn node để place workload).
- Debug Pod fail (resource issue?).
- Verify cluster health sau khi sửa.

→ Phải biết **kubectl top** và stack monitoring cơ bản.

## Cần monitor gì?

### Node-level
- Số node, bao nhiêu Ready.
- CPU/memory/network/disk usage mỗi node.

### Pod-level
- Số Pod, status.
- CPU/memory mỗi Pod.

## K8s không có monitoring built-in

Khác AWS CloudWatch, K8s **không tự thu thập metric**. Cần component bên ngoài:

| Giải pháp | Use case |
|---|---|
| **Metrics Server** | Built-in cho `kubectl top`, HPA. **Phải biết** cho CKA. |
| **Prometheus + Grafana** | Production observability — chuẩn de-facto |
| **Elastic Stack** (ELK) | Log + metric |
| **Datadog, Dynatrace** | Commercial all-in-one |

## Metrics Server — Phải biết cho exam

### Lịch sử

- Trước: **Heapster** — deprecated.
- Hiện tại: **Metrics Server** — phiên bản gọn nhẹ.

### Cách hoạt động

```text
[Mỗi node]
└── Kubelet
    └── cAdvisor (Container Advisor)
        └── Thu thập CPU/RAM/network từ container
        └── Expose qua Kubelet API (/stats/summary, /metrics/resource)
                            │
                            ▼
        [Metrics Server (Pod trong cluster)]
        - Scrape Kubelet mỗi 60s
        - Aggregate metric mọi node/Pod
        - LƯU IN-MEMORY (không persist)
                            │
                            ▼
        [Expose qua API K8s: metrics.k8s.io]
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        kubectl top    HPA          Custom apps
```

### Cài Metrics Server

#### Minikube

```bash
minikube addons enable metrics-server
```

#### Cluster thật (kubeadm)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

Đợi 1-2 phút collect data:
```bash
kubectl get deployment metrics-server -n kube-system
# NAME             READY   UP-TO-DATE   AVAILABLE   AGE
# metrics-server   1/1     1            1           2m
```

#### Lab cluster

Self-signed TLS giữa apiserver và kubelet thường gặp lỗi cài. Workaround:

```bash
# Edit deployment, thêm --kubelet-insecure-tls
kubectl edit deployment metrics-server -n kube-system

# Thêm vào args:
args:
  - --cert-dir=/tmp
  - --secure-port=4443
  - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
  - --kubelet-use-node-status-port
  - --metric-resolution=15s
  - --kubelet-insecure-tls          # ← thêm dòng này cho lab
```

→ Trong production, đừng dùng `--kubelet-insecure-tls`.

## kubectl top — Lệnh cốt lõi

### Top node

```bash
kubectl top node
# NAME       CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# master     166m         8%     1230Mi          32%
# worker-1   45m          2%     510Mi           13%
# worker-2   80m          4%     720Mi           18%
```

- `CPU(cores)`: số millicpu đang dùng.
- `CPU%`: % CPU node.
- `MEMORY`: bytes đang dùng.

### Top pod

```bash
kubectl top pod
# NAME                READY   CPU(cores)   MEMORY(bytes)
# nginx-deploy-abc12  1/1     2m           5Mi
# api-server-def34    1/1     15m          30Mi

# Mọi namespace
kubectl top pod -A

# Specific namespace
kubectl top pod -n monitoring

# Sort theo CPU
kubectl top pod --sort-by=cpu
kubectl top pod --sort-by=memory

# Pod container level
kubectl top pod my-pod --containers
```

### Lỗi thường gặp khi `kubectl top`

```bash
kubectl top node
# error: Metrics API not available
```

Nguyên nhân:
- Metrics Server chưa cài.
- Metrics Server chưa thu thập đủ data (đợi 60-120s).
- Cert/TLS issue (thử `--kubelet-insecure-tls`).

Debug:
```bash
kubectl get apiservice v1beta1.metrics.k8s.io
# NAME                     SERVICE                      AVAILABLE
# v1beta1.metrics.k8s.io   kube-system/metrics-server   True

# Nếu False → check log
kubectl logs -n kube-system deployment/metrics-server
```

## Hạn chế Metrics Server

| Hạn chế | Hệ quả |
|---|---|
| **In-memory only** | Restart Pod = mất history |
| **Không persist** | Không xem được metric quá khứ |
| **Resolution 60s** | Không thấy spike ngắn |
| **Chỉ CPU + RAM** | Không có network, disk, custom metric |

→ Production cần **Prometheus** để có historical + custom metric.

## Prometheus + Grafana (overview)

Stack chuẩn production:

```text
[Pod] ──► /metrics endpoint
            (container expose Prometheus format)
                  │
                  ▼
        [Prometheus Server]
        - Scrape mọi target mỗi 15s
        - Lưu time-series database
        - PromQL query language
                  │
                  ▼
        [Grafana]
        - Dashboard từ Prometheus data
        - Alert rules
                  │
                  ▼
        [Alertmanager]
        - Send alert ra Slack, email, PagerDuty
```

Stack phổ biến cài qua **kube-prometheus-stack** Helm chart:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace
```

→ Cài 1 lệnh, có sẵn:
- Prometheus + Alertmanager.
- Grafana + dashboard mẫu.
- Node Exporter (metric host).
- Kube-state-metrics (metric K8s objects).
- ServiceMonitor CRD (auto-discover scrape).

CKA không test sâu Prometheus. Chỉ cần biết tồn tại.

## Logging — Quản lý log

### Container logs

Container ghi stdout/stderr → kubelet capture → file trên node.

```bash
# Xem log Pod
kubectl logs my-pod

# Multi-container Pod → phải chỉ định container
kubectl logs my-pod -c nginx

# Stream realtime (như tail -f)
kubectl logs -f my-pod

# Log của Pod trước đó (sau crash)
kubectl logs my-pod --previous

# Log N dòng cuối
kubectl logs my-pod --tail=100

# Log trong khoảng thời gian
kubectl logs my-pod --since=10m
kubectl logs my-pod --since-time=2025-01-15T10:00:00Z

# Log mọi Pod của label
kubectl logs -l app=nginx --tail=50
```

### Log lưu ở đâu trên node?

```bash
# Trên worker node
ls /var/log/pods/
# default_nginx_abc12-...
# kube-system_etcd-master_xxx

# Log thực tế là symlink đến /var/log/containers/
ls /var/log/containers/
# nginx_default_nginx-abc-def.log
```

→ Khi Pod xoá, log cũ vẫn còn trong file. Nhưng `kubectl logs` chỉ truy được Pod hiện tại.

### Log rotation

Kubelet auto-rotate log container (config trong kubelet):

```yaml
# /var/lib/kubelet/config.yaml
containerLogMaxSize: 10Mi      # rotate khi file đạt 10MB
containerLogMaxFiles: 5         # giữ 5 file rotated
```

### Multi-container Pod logs

```yaml
spec:
  containers:
    - name: app
      image: nginx
    - name: log-shipper
      image: fluentd
```

```bash
kubectl logs my-pod -c app
kubectl logs my-pod -c log-shipper
```

Không chỉ định `-c` → error.

### Init container logs

```bash
kubectl logs my-pod -c init-db        # init container theo tên
```

Init container chỉ chạy 1 lần, log không refresh.

## Production logging stack

K8s **không** có log aggregation built-in. Production cần:

| Stack | Components |
|---|---|
| **EFK** | Elasticsearch + Fluentd + Kibana |
| **PLG** | Promtail + Loki + Grafana (Loki rẻ hơn ES) |
| **Cloud** | AWS CloudWatch, GCP Logging, Azure Monitor |

Pattern: **Fluentd/Promtail/Filebeat** chạy như **DaemonSet** trên mỗi node:
- Đọc `/var/log/containers/*.log`.
- Parse + enrich (thêm pod name, namespace).
- Forward đến Elasticsearch/Loki.

```text
[Pod log] → /var/log/containers/
                    │
                    ▼
        [DaemonSet log shipper]
                    │
                    ▼
        [Elasticsearch / Loki]
                    │
                    ▼
        [Kibana / Grafana]
        Search + visualize
```

CKA không deep-dive vào setup này.

## Debug pattern

### Pod stuck Pending

```bash
kubectl describe pod my-pod
# Events: FailedScheduling: Insufficient cpu

kubectl top node                # check node usage
# Có node nào còn slot không?
```

### Pod CrashLoopBackOff

```bash
kubectl describe pod my-pod
# Last State: Terminated, Reason: Error, Exit Code: 1

kubectl logs my-pod              # log container chính
kubectl logs my-pod --previous   # log lần chạy trước (lúc fail)
```

### Pod OOMKilled

```bash
kubectl describe pod my-pod
# Last State: Terminated, Reason: OOMKilled

kubectl top pod my-pod           # so sánh với limit
```

### Node NotReady

```bash
kubectl describe node node-1
# Conditions: ...
# Events: ...

# SSH node
sudo systemctl status kubelet
sudo journalctl -u kubelet --since '10 minutes ago'
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `kubectl top` báo "Metrics API not available" | Không xem được usage | Cài Metrics Server, đợi 1-2 phút |
| Tưởng Metrics Server lưu historical | Không có history | Dùng Prometheus cho history |
| Quên `-c` cho multi-container Pod | `kubectl logs` báo lỗi | Chỉ định container name |
| Pod xoá rồi không xem được log | Log mất | Setup central logging (Fluentd) |
| Log file phình trên node | Disk full | Set `containerLogMaxSize` |
| Cài Metrics Server lab nhưng TLS lỗi | Service unavailable | Thêm `--kubelet-insecure-tls` |

## Quick reference

```bash
# Metrics Server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# kubectl top
kubectl top node
kubectl top pod -A --sort-by=memory
kubectl top pod my-pod --containers

# Logs
kubectl logs my-pod
kubectl logs my-pod -c container-name
kubectl logs -f my-pod                  # follow
kubectl logs my-pod --previous          # lần trước
kubectl logs my-pod --tail=50
kubectl logs my-pod --since=10m
kubectl logs -l app=nginx               # theo label

# Debug Pod
kubectl describe pod my-pod
kubectl get events --sort-by='.lastTimestamp'
```

## Tóm tắt bài 1

- K8s không có monitoring built-in. Cài **Metrics Server** cho `kubectl top` + HPA.
- Metrics Server: **in-memory**, không persist, chỉ CPU + RAM, resolution 60s.
- **Prometheus + Grafana**: stack production cho historical + custom metric.
- `kubectl top node`, `kubectl top pod` — kỹ năng cốt lõi.
- `kubectl logs` cho container log. Multi-container: `-c`. Crash trước: `--previous`.
- Log file thực tế ở `/var/log/containers/` trên node.
- Production logging: **EFK** hoặc **PLG** stack qua DaemonSet log shipper.
- Debug pattern: `describe` xem Events, `logs` xem container output, `top` xem resource.

**Bài kế tiếp** → [Phase 5 - Bài 1: Rolling Updates & Rollbacks](../phase-5-app-lifecycle/01-rolling-updates-rollback.md)
