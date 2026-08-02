# Bài 3: Ingress + Gateway API

## Vì sao cần Ingress?

Bạn có nhiều Service expose ra Internet:
- `app.example.com` → frontend Service.
- `api.example.com` → backend Service.
- `admin.example.com` → admin Service.

Cách 1: Mỗi Service 1 LoadBalancer.
- Mỗi LB tốn $20-30/tháng.
- 10 service = 10 LB = $300/tháng.

Cách 2: 1 LoadBalancer trỏ vào **Ingress Controller** — Controller route theo host/path.

```text
                  [Cloud LoadBalancer]
                          │
                          ▼
                  [Ingress Controller Pod]
                  (nginx, traefik, ...)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Host: app          Host: api         Host: admin
        ▼                 ▼                 ▼
   [Service frontend] [Service backend] [Service admin]
        │                 │                 │
   [Pod nginx]       [Pod api]         [Pod admin]
```

→ 1 LB, route nhiều domain. **Tiết kiệm + dễ manage**.

## Ingress = Spec + Controller

```text
Ingress YAML       = rules định nghĩa "host X → service Y"
Ingress Controller = Pod thực hiện rules (real proxy)
```

Phải có cả 2:
1. **Cài Ingress Controller** (nginx-ingress, Traefik, HAProxy, ALB Controller, ...).
2. **Tạo Ingress resource** (YAML rules).

## Ingress Controllers phổ biến

| Controller | Đặc điểm |
|---|---|
| **nginx-ingress** (Kubernetes-maintained) | Phổ biến nhất, default cho nhiều cluster |
| **nginx-ingress** (NGINX Inc.) | Commercial version |
| **Traefik** | Easy config, auto cert (Let's Encrypt) |
| **HAProxy** | Performance cao |
| **Istio Gateway** | Service mesh |
| **AWS ALB Controller** | EKS native |
| **GCP Ingress** | GKE native |
| **Contour** | Envoy-based |

→ CKA lab thường dùng nginx-ingress.

### Cài nginx-ingress

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

# Verify
kubectl get pods -n ingress-nginx
# ingress-nginx-controller-xxx   Running

kubectl get svc -n ingress-nginx
# ingress-nginx-controller   LoadBalancer   10.96.X.X   <external-IP>   80,443
```

→ Controller expose qua LoadBalancer Service. Lấy external IP cho DNS.

## Ingress YAML

### Basic — Single host, single path

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
spec:
  ingressClassName: nginx          # ← controller nào lo
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

→ Request `http://app.example.com/` → forward Service `frontend:80`.

### Multi-host

```yaml
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: frontend, port: { number: 80 } }
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: backend, port: { number: 8080 } }
```

→ 2 host route 2 service.

### Multi-path

```yaml
spec:
  ingressClassName: nginx
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: frontend, port: { number: 80 } }
          - path: /api
            pathType: Prefix
            backend:
              service: { name: backend, port: { number: 8080 } }
          - path: /admin
            pathType: Prefix
            backend:
              service: { name: admin, port: { number: 9000 } }
```

→ 1 host, route nhiều path.

### pathType

| Type | Match |
|---|---|
| `Exact` | Match chính xác |
| `Prefix` | Match prefix path (`/api/v1` match `/api`) |
| `ImplementationSpecific` | Tuỳ controller |

→ Đa số dùng `Prefix`.

## TLS / HTTPS

```yaml
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls            # Secret type tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: frontend, port: { number: 80 } }
```

Secret type `kubernetes.io/tls`:
```bash
kubectl create secret tls app-tls --cert=cert.crt --key=cert.key
```

→ Ingress Controller terminate TLS. Backend Service vẫn HTTP.

### Auto TLS với Cert-Manager

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  tls:
    - hosts: [app.example.com]
      secretName: app-tls            # cert-manager tự tạo
```

→ Cert-Manager Operator detect annotation, request Let's Encrypt cert, lưu vào Secret. Auto renew.

## Annotations — Controller-specific

Mỗi Ingress Controller hỗ trợ annotation riêng cho config:

### nginx-ingress

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/rate-limit-rps: "100"
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: basic-auth
```

→ Hàng chục annotation. Đọc docs nginx-ingress.

### Traefik
```yaml
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: my-middleware@kubernetescrd
```

## Rewrite path

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /api(/|$)(.*)         # capture (.*)
            pathType: ImplementationSpecific
            backend:
              service: { name: backend, port: { number: 8080 } }
```

→ Request `/api/users/123` → Backend nhận `/users/123` (path `/api` bị strip).

## Default Backend

```yaml
spec:
  ingressClassName: nginx
  defaultBackend:
    service:
      name: not-found
      port: { number: 80 }
```

→ Request không match rule nào → forward đến `not-found` Service.

## Test Ingress

```bash
# Get external IP
kubectl get svc -n ingress-nginx
# ingress-nginx-controller   LoadBalancer   10.96.X.X   1.2.3.4   80,443

# Test với Host header
curl -H "Host: app.example.com" http://1.2.3.4/
# Forward đến frontend Service
```

Hoặc dùng DNS:
```bash
# /etc/hosts
1.2.3.4 app.example.com
1.2.3.4 api.example.com

curl http://app.example.com/
```

## IngressClass

K8s 1.18+: chính thức hoá `ingressClassName` (thay annotation cũ `kubernetes.io/ingress.class`):

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
spec:
  controller: k8s.io/ingress-nginx
```

→ Cluster có thể có nhiều IngressClass (nginx, traefik, alb).

Ingress chọn class:
```yaml
spec:
  ingressClassName: nginx
```

## Gateway API (2025 update)

Gateway API = **kế hoạch thay Ingress** trong tương lai.

### Vì sao thay Ingress?

Ingress có hạn chế:
- Chỉ HTTP/HTTPS. Không có TCP/UDP.
- Annotation portability thấp (mỗi controller khác).
- Không có advanced traffic management (canary, header-based routing).

Gateway API:
- Protocol-agnostic (HTTP, TCP, UDP, TLS, gRPC).
- Role-based config (cluster admin, app dev).
- Advanced features built-in.

### 3 resource chính

```text
┌────────────────────────────────────────────────┐
│  GatewayClass (cluster-scoped)                  │
│     Controller nào lo: nginx, istio, ...        │
└────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────┐
│  Gateway (namespace-scoped)                     │
│     Define listener: hostname, protocol, port   │
│     (Like Service LoadBalancer + Ingress)       │
└────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────┐
│  HTTPRoute (namespace-scoped)                   │
│     Rules: path → backend service               │
└────────────────────────────────────────────────┘
```

### Example

```yaml
# GatewayClass (admin tạo)
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: k8s.io/ingress-nginx

---
# Gateway
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: prod
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      hostname: "*.example.com"
      port: 80
      protocol: HTTP
    - name: https
      hostname: "*.example.com"
      port: 443
      protocol: HTTPS
      tls:
        certificateRefs:
          - name: my-tls-secret

---
# HTTPRoute
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: prod
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - app.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: frontend
          port: 80
          weight: 90
        - name: frontend-canary    # 10% traffic to canary
          port: 80
          weight: 10
```

→ Traffic splitting native (canary).

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Tạo Ingress nhưng không cài controller | Không có hiệu lực | Cài controller trước |
| Forget `ingressClassName` | Default class hoặc fail | Set explicit |
| TLS Secret namespace khác Ingress | TLS fail | Cùng namespace |
| DNS chưa point về LB IP | Curl `Host:` header OK, browser fail | Setup DNS |
| Multiple Ingress cùng host conflict | Unpredictable | Tránh overlap |
| Annotation sai chính tả | Config không có effect | Verify docs |
| Path không có `/` đầu | Match sai | Path start `/` |
| Service không có endpoint | 503 từ Ingress | Check Pod label |

## Quick reference

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: X
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  tls:
    - hosts: [example.com]
      secretName: tls-secret
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-svc
                port: { number: 80 }
```

```bash
# List
kubectl get ingress
kubectl describe ingress my-ingress

# IngressClass
kubectl get ingressclass

# Controller pods
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx ingress-nginx-controller-xxx
```

## Tóm tắt bài 3

- **Ingress** = HTTP routing layer cho cluster (host-based, path-based).
- 2 phần: **Ingress Controller** (Pod) + **Ingress resource** (YAML rules).
- Phổ biến: **nginx-ingress**, Traefik, HAProxy, ALB Controller.
- 1 LB → Ingress Controller → route nhiều Service. Tiết kiệm cost.
- TLS: Secret type `kubernetes.io/tls`. Auto cert qua **Cert-Manager**.
- `pathType`: `Exact`, `Prefix` (common), `ImplementationSpecific`.
- Annotations controller-specific (rewrite, rate limit, auth, ...).
- `IngressClass` để multi-controller trong cluster.
- **Gateway API** = future replacement: GatewayClass + Gateway + HTTPRoute. Protocol-agnostic, role-based.

Phase 9 hoàn thành! Bạn đã master CNI/Pod network, DNS, Service routing, Ingress, Gateway API.

**Bài kế tiếp** → [Phase 10 - Bài 1: Install Kubernetes (kubeadm)](../phase-10-install-design/01-design-install-cluster.md)
