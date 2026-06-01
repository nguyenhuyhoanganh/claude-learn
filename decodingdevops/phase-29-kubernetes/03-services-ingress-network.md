# Bài 3: Services, Ingress, Network Policy

Networking là phần phức tạp nhất của K8s. Bài này đi đầy đủ qua các loại Service, Ingress, và NetworkPolicy.

## Service types (Các loại Service)

### ClusterIP (mặc định)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: vprofile-app
spec:
  type: ClusterIP
  selector:
    app: vprofile
    tier: app
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
```

Chỉ truy cập được **từ bên trong cluster**. DNS: `vprofile-app.vprofile.svc.cluster.local`.

### NodePort

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080      # Trong range 30000-32767
```

Expose port trên **mọi node** trong cluster (truy cập qua bất kỳ node IP:30080 → service).

Use case: dev/test, on-prem khi không có cloud LoadBalancer.

### LoadBalancer

```yaml
spec:
  type: LoadBalancer
  selector:
    app: vprofile
  ports:
    - port: 80
      targetPort: 8080
  loadBalancerSourceRanges:
    - 1.2.3.0/24
```

K8s yêu cầu cloud provider provision một Load Balancer thật:
- **AWS**: NLB (mặc định) hoặc ALB (cần AWS Load Balancer Controller).
- **GCP**: Cloud Load Balancer.
- **Azure**: Azure Load Balancer.

`loadBalancerSourceRanges` whitelist IP nào được phép kết nối.

### ExternalName

```yaml
spec:
  type: ExternalName
  externalName: my-db.acme.com
```

DNS CNAME alias — pod query service này sẽ được redirect tới `my-db.acme.com`. Không proxy traffic, chỉ resolve DNS.

Use case: trỏ tới external service (vd: managed DB ngoài cluster) qua tên service nội bộ.

### Headless Service

```yaml
spec:
  clusterIP: None
  selector:
    app: db
  ports: [...]
```

Trả về **IP của từng pod** thay vì 1 VIP (Virtual IP). Dùng cho StatefulSet, hoặc khi muốn load balancing tự xử lý ở app layer.

## Service discovery (Khám phá service)

Pod resolve service qua DNS:

```bash
# Cùng namespace
vprofile-app
vprofile-app:80

# Khác namespace
vprofile-app.vprofile

# Fully qualified domain name (FQDN)
vprofile-app.vprofile.svc.cluster.local
```

Env variables cũng được auto-inject (legacy method):

```bash
VPROFILE_APP_SERVICE_HOST=10.0.0.5
VPROFILE_APP_SERVICE_PORT=80
```

→ DNS được khuyến nghị hơn env variable (linh hoạt hơn, không cần restart pod khi service đổi).

## Endpoints (Danh sách pod thực sự đứng sau Service)

Khi Service select pod → K8s tạo Endpoints object liệt kê pod đang serve:

```bash
kubectl get endpoints vprofile-app
# NAME           ENDPOINTS                                AGE
# vprofile-app   10.244.0.5:8080,10.244.1.7:8080,...     5d
```

→ Nếu endpoints empty → selector sai hoặc pod chưa Ready. Đây là chỗ debug đầu tiên khi service không hoạt động.

## Ingress — Entry point duy nhất cho HTTP routing

Cho phép định tuyến HTTP từ 1 entry point đến nhiều service.

### Install Ingress Controller (nginx)

Ingress object chỉ là khai báo; cần Ingress Controller thực thi:

```bash
helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.service.type=LoadBalancer
```

Các option khác: Traefik, HAProxy, AWS Load Balancer Controller, Istio Gateway.

### Ingress cơ bản

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vprofile-ingress
  namespace: vprofile
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  rules:
    - host: vprofile.acme.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vprofile-web
                port: {number: 80}
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: vprofile-api
                port: {number: 8080}
    - host: admin.vprofile.acme.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vprofile-admin
                port: {number: 80}
  tls:
    - hosts:
        - vprofile.acme.com
        - admin.vprofile.acme.com
      secretName: vprofile-tls
```

`pathType` — cách match path:
- `Exact`: khớp chính xác.
- `Prefix`: path bắt đầu bằng giá trị.
- `ImplementationSpecific`: tuỳ vào controller xử lý.

### Cert-manager + Let's Encrypt (Tự động HTTPS)

Cài cert-manager:

```bash
helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --set installCRDs=true
```

ClusterIssuer (định nghĩa nguồn cert):

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@acme.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

Khi Ingress có annotation `cert-manager.io/cluster-issuer: letsencrypt-prod` → cert-manager tự issue cert + auto renew khi sắp hết hạn.

### Advanced annotations cho Ingress nginx

```yaml
metadata:
  annotations:
    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "100"

    # Giới hạn kích cỡ request body
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"

    # Timeout
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://vprofile.acme.com"

    # Basic auth
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: vprofile-basic-auth
    nginx.ingress.kubernetes.io/auth-realm: "Admin Area"

    # Whitelist IP — chỉ cho phép các range này truy cập
    nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8,1.2.3.0/24"

    # Canary deployment
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
```

### Gateway API (Phiên bản hiện đại của Ingress)

Successor của Ingress, expressive hơn rất nhiều:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: vprofile-gateway
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      port: 80
      protocol: HTTP
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        certificateRefs:
          - {name: vprofile-tls}

---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: vprofile-route
spec:
  parentRefs:
    - {name: vprofile-gateway}
  hostnames:
    - vprofile.acme.com
  rules:
    - matches:
        - path: {type: PathPrefix, value: /}
      backendRefs:
        - {name: vprofile-web, port: 80, weight: 90}
        - {name: vprofile-web-canary, port: 80, weight: 10}
```

Tách biệt rõ ràng: Gateway (do admin/platform team quản) + HTTPRoute (do app team quản). Đây là sự cải tiến lớn so với Ingress (gộp cả 2 vào 1 object).

## NetworkPolicy — Firewall trong K8s

Mặc định: traffic pod-to-pod **hoàn toàn không giới hạn** (mọi pod có thể nói chuyện với mọi pod khác). NetworkPolicy = K8s firewall — restrict traffic.

### Default deny — chặn hết, rồi mới allow

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: vprofile
spec:
  podSelector: {}                    # Áp dụng cho mọi pod trong namespace
  policyTypes: [Ingress, Egress]
```

Mọi traffic bị deny. Sau đó allow những gì cần.

### Allow traffic cụ thể

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-web-to-app
  namespace: vprofile
spec:
  podSelector:
    matchLabels:
      tier: app
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: web
      ports:
        - protocol: TCP
          port: 8080
```

Chỉ web tier được phép connect tới app tier port 8080.

### Policy đầy đủ (production)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: vprofile-app
spec:
  podSelector:
    matchLabels:
      app: vprofile
      tier: app
  policyTypes: [Ingress, Egress]

  # Inbound (vào)
  ingress:
    # Từ web tier
    - from:
        - podSelector:
            matchLabels:
              tier: web
      ports:
        - {protocol: TCP, port: 8080}

    # Từ Prometheus (cho scrape metrics)
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
          podSelector:
            matchLabels:
              app: prometheus
      ports:
        - {protocol: TCP, port: 8080}

  # Outbound (ra)
  egress:
    # DNS (cần thiết để resolve service)
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - {protocol: UDP, port: 53}

    # Database
    - to:
        - podSelector:
            matchLabels:
              app: db
      ports:
        - {protocol: TCP, port: 3306}

    # Cache
    - to:
        - podSelector:
            matchLabels:
              app: cache
      ports:
        - {protocol: TCP, port: 11211}

    # External HTTPS đến internet (loại trừ private IP)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - {protocol: TCP, port: 443}
```

→ **Zero-trust networking**: chỉ explicit allow, mặc định deny.

### Yêu cầu về CNI plugin

NetworkPolicy chỉ có hiệu lực khi CNI (Container Network Interface) plugin hỗ trợ:
- **Calico**: ✓ (mặc định ở nhiều distro K8s).
- **Cilium**: ✓ (modern, dựa trên eBPF).
- **Weave Net**: ✓.
- **Flannel**: ✗ (không enforce, NetworkPolicy bị ignore).

EKS mặc định dùng `vpc-cni` không enforce NetworkPolicy → cần enable Calico/Cilium addon.

## Service Mesh — giới thiệu Istio

Vượt qua Ingress: mTLS (mutual TLS) tự động, traffic splitting, observability tích hợp sẵn.

```yaml
# Sidecar tự động inject vào pod khi namespace có label
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vprofile-app
  namespace: vprofile-istio
  labels:
    istio-injection: enabled
spec:
  ...
```

Istio inject Envoy sidecar vào mọi pod → sidecar xử lý mTLS + traffic policy.

VirtualService — advanced routing:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: vprofile
spec:
  hosts: [vprofile.acme.com]
  http:
    - match:
        - headers:
            x-canary: {exact: "true"}
      route:
        - destination: {host: vprofile-canary, subset: v2}
    - route:
        - destination: {host: vprofile, subset: v1}
          weight: 90
        - destination: {host: vprofile, subset: v2}
          weight: 10
```

Header-based routing + weighted canary trong cùng 1 config.

Alternatives của Istio: **Linkerd** (đơn giản hơn nhiều), **Cilium Service Mesh** (dựa trên eBPF, không cần sidecar).

## DNS trong K8s

CoreDNS deployment chạy trong namespace `kube-system` đảm nhiệm resolve DNS cluster.

```bash
# Test từ pod
kubectl run -it --rm test --image=busybox --restart=Never -- sh
nslookup vprofile-app
nslookup vprofile-app.vprofile.svc.cluster.local
```

Custom DNS cho pod:

```yaml
spec:
  dnsPolicy: ClusterFirst       # Mặc định
  # Các option khác: Default, ClusterFirstWithHostNet, None
  dnsConfig:
    nameservers:
      - 8.8.8.8
    searches:
      - acme.com
```

## ExternalDNS — Tự động tạo Route 53 record

Tự động tạo DNS record bên ngoài (vd: Route 53) từ Ingress:

```bash
helm install external-dns external-dns/external-dns \
    --namespace external-dns --create-namespace \
    --set provider=aws \
    --set aws.region=us-east-1 \
    --set policy=sync \
    --set txtOwnerId=vprofile-cluster
```

Ingress có annotation → ExternalDNS tự tạo record:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: vprofile.acme.com
```

→ Không cần thao tác Route 53 thủ công nữa, mọi thứ declarative trong K8s YAML.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Service selector không match pod label | Endpoints empty | Verify label trong pod |
| NodePort hướng ra production | Rủi ro bảo mật | Dùng Ingress + LB |
| Không có NetworkPolicy | Attacker lateral movement dễ | Default deny + explicit allow |
| Cert-manager rate limit của Let's Encrypt | Issue cert fail | Dùng staging issuer trước, sau đó prod |
| Ingress không có ingressClassName | Nhiều controller xung đột | Specify `ingressClassName` |
| Dùng Flannel + NetworkPolicy | Policy không enforce silently | Đổi sang Calico/Cilium |
| Service mesh phức tạp | Khó debug | Bắt đầu không có service mesh, thêm khi cần |

## Tóm tắt bài 3

- **Service types**: ClusterIP, NodePort, LoadBalancer, ExternalName, Headless — mỗi loại cho use case riêng.
- DNS service discovery: `service.namespace.svc.cluster.local`.
- **Ingress** + Ingress Controller (nginx/Traefik) cho HTTP routing.
- **cert-manager** + Let's Encrypt = auto HTTPS, không cần thao tác thủ công.
- **Gateway API** = thế hệ mới thay thế Ingress, tách biệt admin/app concerns.
- **NetworkPolicy** = zero-trust networking, yêu cầu CNI hỗ trợ (Calico/Cilium).
- **Istio/Linkerd** service mesh cho mTLS + advanced traffic management.
- **ExternalDNS** tự động manage Route 53 record từ K8s.

**Bài kế tiếp** → [Bài 4: ConfigMap, Secret, RBAC, Pod Security](04-config-secret-rbac.md)
