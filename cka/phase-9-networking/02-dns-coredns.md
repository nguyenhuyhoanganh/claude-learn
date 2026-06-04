# Bài 2: DNS trong Kubernetes — CoreDNS

## Vì sao Pod cần DNS?

Pod IP đổi liên tục. Pod nginx gọi backend → không thể hardcode `10.244.1.7`. Phải dùng **tên**:

```text
[Pod nginx]
   curl http://backend                ← gọi qua tên
        │
        ▼ resolve "backend" → 10.96.30.50 (Service IP)
        │
        ▼ traffic đến Service
        │
        ▼ iptables DNAT về Pod thật
```

→ Cần DNS server trong cluster. K8s ship **CoreDNS** mặc định.

## CoreDNS

> **CoreDNS** = DNS server mặc định của K8s từ 1.13+ (thay kube-dns cũ).

```bash
# CoreDNS chạy như Deployment trong kube-system
kubectl get pods -n kube-system | grep coredns
# coredns-abc12   1/1   Running   0   30d
# coredns-def34   1/1   Running   0   30d (HA — 2 replica default)

# Service
kubectl get svc -n kube-system | grep dns
# kube-dns   ClusterIP   10.96.0.10   <none>   53/UDP,53/TCP,9153/TCP   30d
                          ─────────
                          Cluster DNS IP
```

→ CoreDNS expose qua Service tên `kube-dns` (legacy name từ thời kube-dns). IP `10.96.0.10` là **default DNS server** mọi Pod dùng.

## Cách Pod resolve DNS

```bash
# Vào Pod
kubectl exec my-pod -- cat /etc/resolv.conf
# search default.svc.cluster.local svc.cluster.local cluster.local
# nameserver 10.96.0.10
# options ndots:5
```

Phân tích:
- `nameserver 10.96.0.10`: DNS server = CoreDNS Service.
- `search`: domains tự thêm khi resolve tên không đầy đủ.
- `ndots:5`: nếu tên có < 5 dot → thử với search domains trước.

## DNS hierarchy cho Service

```text
Full DNS name:
<service-name>.<namespace>.svc.<cluster-domain>
              │           │   └── default: cluster.local
              │           └────── "svc" cho Service (vs "pod")
              └───────────────── namespace của Service

Ví dụ:
backend.default.svc.cluster.local
```

### Search domains

Trong Pod `default` namespace:
- `curl backend` → thử `backend.default.svc.cluster.local` (qua search)
- `curl backend.dev` → thử `backend.dev.svc.cluster.local`
- `curl backend.dev.svc.cluster.local` → resolve trực tiếp (full name)

→ Pod cùng namespace gọi tên ngắn. Cross-namespace cần thêm namespace.

## Test DNS resolution

```bash
# Pod debug
kubectl run debug --image=busybox:1.28 --rm -it -- sh
# Trong Pod:

nslookup backend
# Server:    10.96.0.10
# Address:   10.96.0.10:53
# Name:      backend.default.svc.cluster.local
# Address:   10.96.30.50

# Cross-namespace
nslookup backend.dev
# Name: backend.dev.svc.cluster.local
# Address: 10.96.40.20

# Full FQDN
nslookup backend.default.svc.cluster.local
```

## DNS cho Pod (per-Pod DNS — hiếm)

Pod cũng có DNS:
```text
<pod-ip-with-dashes>.<namespace>.pod.<cluster-domain>
              │                  │
              └ Pod IP với dash  └ "pod" thay vì "svc"

Ví dụ:
10-244-0-5.default.pod.cluster.local       (= Pod IP 10.244.0.5)
```

→ Hiếm dùng. Pod chỉ có DNS nếu là **subdomain Service** hoặc StatefulSet.

## Headless Service — Trả về Pod IP

Service bình thường: DNS resolve về **Service IP** (virtual). Headless Service (no ClusterIP) trả về **Pod IP**:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-db
spec:
  clusterIP: None              # ← Headless
  selector:
    app: db
  ports:
    - port: 5432
```

```bash
nslookup my-db
# Name: my-db.default.svc.cluster.local
# Address: 10.244.0.5         ← Pod 1
# Address: 10.244.1.7         ← Pod 2
# Address: 10.244.2.3         ← Pod 3
```

→ Trả về **list IP các Pod**. Client tự load balance (vd: round-robin).

Use case:
- **StatefulSet** (DB cluster, Kafka).
- Client lib biết handle multiple endpoint.

## StatefulSet DNS

StatefulSet + Headless Service = mỗi Pod có **stable hostname**:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless    # link với headless Service
  replicas: 3
  ...
```

Pod được tạo với hostname stable:
- `postgres-0`, `postgres-1`, `postgres-2`.

DNS resolve:
```text
postgres-0.postgres-headless.default.svc.cluster.local   → Pod 0 IP
postgres-1.postgres-headless.default.svc.cluster.local   → Pod 1 IP
postgres-2.postgres-headless.default.svc.cluster.local   → Pod 2 IP
```

→ Client app biết `postgres-0` là master, `postgres-1`, `2` là replica.

## CoreDNS config

```bash
kubectl get configmap -n kube-system coredns -o yaml
```

```yaml
data:
  Corefile: |
    .:53 {
        errors
        health {
            lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
            ttl 30
        }
        prometheus :9153
        forward . /etc/resolv.conf {
            max_concurrent 1000
        }
        cache 30
        loop
        reload
        loadbalance
    }
```

Plugins:
- `kubernetes`: query K8s API cho Service/Pod DNS.
- `forward`: forward query khác (vd `google.com`) ra DNS server upstream.
- `cache`: cache 30s.
- `prometheus`: expose metrics.

## Custom DNS

### Custom Pod DNS

Pod-specific override:
```yaml
spec:
  dnsPolicy: "None"
  dnsConfig:
    nameservers:
      - 1.1.1.1
    searches:
      - example.com
    options:
      - { name: ndots, value: "2" }
```

→ Pod dùng DNS Cloudflare thay CoreDNS.

### Default policies

| `dnsPolicy` | Behavior |
|---|---|
| `Default` | Inherit node DNS |
| `ClusterFirst` (default) | CoreDNS + fallback node DNS |
| `ClusterFirstWithHostNet` | Như ClusterFirst nhưng cho hostNetwork Pod |
| `None` | Phải kèm `dnsConfig` |

## DNS cho External Service

Cho phép Pod resolve service external (ngoài cluster):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.example.com         # DNS bên ngoài
```

```bash
nslookup external-db
# external-db.default.svc.cluster.local
# canonical name = db.example.com
```

→ CoreDNS return CNAME → app resolve qua external DNS → lấy real IP.

Use case: gọi managed DB (RDS) như tên K8s service. Migration giai đoạn.

## Troubleshoot DNS

### 1. CoreDNS chạy không?

```bash
kubectl get pods -n kube-system | grep coredns
# 2/2 Running

# Log
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### 2. CoreDNS Service có endpoint?

```bash
kubectl get endpoints -n kube-system kube-dns
# ENDPOINTS               AGE
# 10.244.0.5:53,10.244.1.7:53  ...
```

### 3. Pod resolve được không?

```bash
kubectl run dnstest --image=busybox:1.28 --rm -it -- nslookup kubernetes
# Server: 10.96.0.10
# Address: kubernetes.default.svc.cluster.local
# Address: 10.96.0.1
```

→ Resolve `kubernetes` Service OK = DNS hoạt động.

### 4. Pod-specific resolv.conf

```bash
kubectl exec my-pod -- cat /etc/resolv.conf
# Verify nameserver = 10.96.0.10
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Service không có endpoint | DNS resolve OK nhưng Pod fail connect | Check label selector |
| Quên namespace khi cross-namespace | Pod resolve sai | `backend.dev` hoặc full FQDN |
| CoreDNS down | Mọi DNS query fail | Check Pod + restart |
| `ndots:5` quá cao → many lookups | Slow DNS | Decrease `ndots` |
| Headless Service không có Pod | DNS empty | Verify Pod label match |
| StatefulSet Pod hostname dài | Khó nhớ | Đúng pattern <name>-N |
| DNS cache stale | Pod thấy IP cũ | TTL ngắn (30s default OK) |

## Quick reference

```bash
# Resolve DNS từ Pod
kubectl run debug --image=busybox:1.28 --rm -it -- nslookup <service>

# CoreDNS
kubectl get pods -n kube-system | grep coredns
kubectl logs -n kube-system -l k8s-app=kube-dns
kubectl get cm -n kube-system coredns -o yaml

# Pod DNS config
kubectl exec my-pod -- cat /etc/resolv.conf
```

```yaml
# Headless Service
spec:
  clusterIP: None
  selector: { app: db }

# External Service alias
spec:
  type: ExternalName
  externalName: db.example.com

# Custom Pod DNS
spec:
  dnsPolicy: None
  dnsConfig:
    nameservers: [1.1.1.1]
    searches: [example.com]
```

## Tóm tắt bài 2

- **CoreDNS** = DNS server cluster (default từ K8s 1.13).
- Pod tự config DNS = CoreDNS Service IP (`10.96.0.10`).
- DNS format: `<service>.<namespace>.svc.<cluster-domain>`.
- Search domain cho phép tên ngắn trong namespace.
- **Headless Service** (`clusterIP: None`) → return Pod IP list.
- **StatefulSet** + headless = stable hostname per Pod.
- **ExternalName** Service = DNS alias cho external host.
- Custom DNS qua `dnsPolicy: None` + `dnsConfig`.

**Bài kế tiếp** → [Bài 3: Service Networking deep dive](03-service-networking.md)
