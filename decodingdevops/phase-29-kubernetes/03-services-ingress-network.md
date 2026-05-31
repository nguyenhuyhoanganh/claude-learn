# Bài 3: Services, Ingress, Network Policy

Networking là phần phức tạp nhất K8s. Bài này dạy đầy đủ Service types, Ingress, NetworkPolicy.

## Service types

### ClusterIP (default)

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

Internal only. DNS: `vprofile-app.vprofile.svc.cluster.local`.

### NodePort

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080      # 30000-32767 range
```

Expose port trên **mọi node** (ANY node IP:30080 → service).

Use case: dev/test, on-prem without LoadBalancer.

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

Cloud-provisioned LB:
- AWS: NLB (default) or ALB (with AWS Load Balancer Controller).
- GCP: Cloud Load Balancer.
- Azure: Load Balancer.

`loadBalancerSourceRanges` whitelist IP range.

### ExternalName

```yaml
spec:
  type: ExternalName
  externalName: my-db.acme.com
```

DNS CNAME alias. No proxy, just DNS resolution.

### Headless Service

```yaml
spec:
  clusterIP: None
  selector:
    app: db
  ports: [...]
```

Return individual pod IPs (not VIP). Use cho StatefulSet, custom load balancing in app.

## Service discovery

Pod resolve service:

```bash
# Same namespace
vprofile-app
vprofile-app:80

# Different namespace
vprofile-app.vprofile

# Fully qualified
vprofile-app.vprofile.svc.cluster.local
```

Env variables auto-injected (legacy):

```bash
VPROFILE_APP_SERVICE_HOST=10.0.0.5
VPROFILE_APP_SERVICE_PORT=80
```

DNS preferred over env.

## Endpoints

Service select pod → create Endpoints object:

```bash
kubectl get endpoints vprofile-app
# NAME           ENDPOINTS                                AGE
# vprofile-app   10.244.0.5:8080,10.244.1.7:8080,...     5d
```

If endpoints empty → selector wrong hoặc pod not ready.

## Ingress

Single entry point cho multiple services with HTTP routing.

### Install Ingress Controller (nginx)

```bash
helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.service.type=LoadBalancer
```

Other options: Traefik, HAProxy, AWS Load Balancer Controller, Istio Gateway.

### Basic Ingress

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

`pathType`:
- `Exact`: exact match.
- `Prefix`: path begins with.
- `ImplementationSpecific`: leave to controller.

### Cert-manager + Let's Encrypt

Install cert-manager:

```bash
helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --set installCRDs=true
```

ClusterIssuer:

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

Ingress annotation `cert-manager.io/cluster-issuer: letsencrypt-prod` → auto issue + renew cert.

### Advanced annotations

```yaml
metadata:
  annotations:
    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "100"

    # Body size
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"

    # Timeout
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://vprofile.acme.com"

    # Auth (basic)
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: vprofile-basic-auth
    nginx.ingress.kubernetes.io/auth-realm: "Admin Area"

    # Whitelist IP
    nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8,1.2.3.0/24"

    # Canary
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
```

### Gateway API (modern)

Successor of Ingress, more expressive:

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

Better separation: Gateway (admin) + HTTPRoute (app team).

## NetworkPolicy

Default: pod-to-pod traffic **unrestricted**. NetworkPolicy = K8s firewall.

### Default deny

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: vprofile
spec:
  podSelector: {}                    # All pods
  policyTypes: [Ingress, Egress]
```

All traffic denied. Then allow what's needed.

### Allow specific traffic

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

Only web tier can reach app tier:8080.

### Comprehensive policy

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

  # Inbound
  ingress:
    # From web tier
    - from:
        - podSelector:
            matchLabels:
              tier: web
      ports:
        - {protocol: TCP, port: 8080}

    # From Prometheus
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
          podSelector:
            matchLabels:
              app: prometheus
      ports:
        - {protocol: TCP, port: 8080}

  # Outbound
  egress:
    # DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - {protocol: UDP, port: 53}

    # DB
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

    # External (HTTPS to internet)
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

Zero-trust networking: explicit allow only.

### CNI requirement

NetworkPolicy enforcement requires CNI plugin support:
- **Calico**: ✓ (default many distros).
- **Cilium**: ✓ (eBPF, modern).
- **Weave Net**: ✓.
- **Flannel**: ✗ (no enforcement, ignored).

EKS default `vpc-cni` không enforce NetworkPolicy → enable Calico/Cilium addon.

## Service Mesh — Istio brief

Beyond Ingress: mTLS, traffic splitting, observability built-in.

```yaml
# Sidecar inject auto
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

Istio Envoy sidecar injected → handle mTLS + traffic policy.

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

Header-based + weighted canary in 1 config.

Alternative: **Linkerd** (simpler), **Cilium Service Mesh** (eBPF-based).

## DNS

CoreDNS deployment in `kube-system` resolve cluster DNS.

```bash
# Test from pod
kubectl run -it --rm test --image=busybox --restart=Never -- sh
nslookup vprofile-app
nslookup vprofile-app.vprofile.svc.cluster.local
```

Custom DNS:

```yaml
spec:
  dnsPolicy: ClusterFirst       # Default
  # Or: Default, ClusterFirstWithHostNet, None
  dnsConfig:
    nameservers:
      - 8.8.8.8
    searches:
      - acme.com
```

## ExternalDNS

Auto-create DNS record from Ingress:

```bash
helm install external-dns external-dns/external-dns \
    --namespace external-dns --create-namespace \
    --set provider=aws \
    --set aws.region=us-east-1 \
    --set policy=sync \
    --set txtOwnerId=vprofile-cluster
```

Ingress with annotation → ExternalDNS create Route 53 record:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: vprofile.acme.com
```

No manual Route 53 update.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Service selector không match | No endpoints | Verify labels |
| NodePort production-facing | Security risk | Use Ingress + LB |
| No NetworkPolicy | Lateral movement | Default deny + explicit allow |
| Cert-manager rate limit | Cert fail | Use staging issuer trước, then prod |
| Ingress no class | Multiple controller | Specify `ingressClassName` |
| Flannel + NetworkPolicy | Silent no enforcement | Use Calico/Cilium |
| Service mesh complexity | Hard to debug | Start without, add if needed |

## Tóm tắt bài 3

- **Service types**: ClusterIP, NodePort, LoadBalancer, ExternalName, Headless.
- DNS service discovery: `service.namespace.svc.cluster.local`.
- **Ingress** + Ingress Controller (nginx/Traefik) cho HTTP routing.
- **cert-manager** + Let's Encrypt = auto HTTPS.
- **Gateway API** = modern successor to Ingress.
- **NetworkPolicy** zero-trust, requires CNI support (Calico/Cilium).
- **Istio/Linkerd** service mesh cho mTLS + advanced traffic.
- **ExternalDNS** auto manage Route 53 records.

**Bài kế tiếp** → [Bài 4: ConfigMap, Secret, RBAC, Pod Security](04-config-secret-rbac.md)
