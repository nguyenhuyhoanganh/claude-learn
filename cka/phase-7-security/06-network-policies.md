# Bài 6: Network Policies

## Default: Pod nói chuyện được với MỌI Pod

```text
[Pod frontend]                       [Pod backend]
   IP: 10.244.0.5  ◄───────────────► IP: 10.244.1.7
                                     
[Pod attacker]  ◄────────────────►   [Pod database]
   IP: 10.244.2.3                     IP: 10.244.0.9
                                       chứa password
```

→ Default K8s: **flat network**. Mọi Pod gọi được mọi Pod, mọi namespace.

→ Pod attacker (vd: compromised) có thể connect direct database. Cần lớp firewall.

**Network Policy** = firewall cho K8s. Định nghĩa "Pod nào được nói chuyện với Pod nào".

## Yêu cầu: CNI plugin hỗ trợ

Network Policy là **specification**. Cần **CNI plugin** implement:

| CNI plugin | Hỗ trợ NetworkPolicy |
|---|---|
| **Calico** | ✓ (recommend) |
| **Cilium** | ✓ |
| **Weave Net** | ✓ |
| **Flannel** | ✗ (cần thêm Calico-felix) |
| AWS VPC CNI | ✓ (limited) |
| Antrea | ✓ |

→ Nếu CNI không support → NetworkPolicy YAML tạo được nhưng **không có effect**. Cảnh báo trong exam.

## YAML cơ bản — Deny All

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: prod
spec:
  podSelector: {}                   # match TẤT CẢ Pod
  policyTypes:
    - Ingress
    - Egress
  # Không có ingress/egress rules → deny all
```

→ Áp dụng namespace `prod`: deny mọi ingress + egress. Pod **không nhận, không gửi** packet nào.

## Cấu trúc NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: my-policy
  namespace: prod
spec:
  podSelector:                      # Pod nào áp dụng policy
    matchLabels:
      app: backend
  policyTypes:                      # Loại policy
    - Ingress
    - Egress
  ingress:                          # Allow incoming từ
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 8080
  egress:                           # Allow outgoing đến
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 5432
```

→ Pod `app=backend` trong `prod`:
- **Ingress**: chỉ accept TCP/8080 từ Pod `app=frontend`.
- **Egress**: chỉ gửi TCP/5432 đến Pod `app=database`.
- Mọi kết nối khác → DENY.

## podSelector — Match Pod

```yaml
spec:
  podSelector:
    matchLabels:
      app: backend
      tier: api
```

→ Match Pod có cả 2 label: `app=backend` AND `tier=api`.

`podSelector: {}` → match **mọi Pod trong namespace**.

→ Pod không bị NetworkPolicy nào match → **default allow** (giữ behavior cũ).
→ Pod bị **ít nhất 1** NetworkPolicy match → **default deny**, chỉ cho phép theo rule.

## Pattern: Allow specific traffic

### Allow ingress từ frontend

```yaml
spec:
  podSelector:
    matchLabels: { app: backend }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: frontend }
      ports:
        - protocol: TCP
          port: 8080
```

→ Backend accept TCP/8080 chỉ từ frontend. Egress vẫn open (không có Egress trong policyTypes).

### Allow từ namespace cụ thể

```yaml
ingress:
  - from:
      - namespaceSelector:
          matchLabels:
            env: prod                 # mọi Pod từ namespace có label env=prod
    ports:
      - port: 8080
```

→ Cần label namespace trước:
```bash
kubectl label namespace prod env=prod
```

### Allow từ namespace + Pod selector

```yaml
ingress:
  - from:
      - namespaceSelector:
          matchLabels:
            env: prod
        podSelector:
          matchLabels:
            app: frontend
    ports:
      - port: 8080
```

→ Chỉ Pod `app=frontend` **trong namespace có env=prod**. Khác với 2 entry rời.

**Quan trọng**: 2 selector cùng item (không có `-` riêng) = AND. 2 item rời = OR.

```yaml
# OR
from:
  - podSelector: { matchLabels: { app: A } }
  - podSelector: { matchLabels: { app: B } }

# AND
from:
  - podSelector: { matchLabels: { app: A } }
    namespaceSelector: { matchLabels: { env: prod } }
```

### Allow từ IP block

```yaml
ingress:
  - from:
      - ipBlock:
          cidr: 192.168.1.0/24
          except:
            - 192.168.1.5/32          # ngoại trừ IP này
    ports:
      - port: 80
```

→ Allow từ subnet 192.168.1.0/24, trừ 192.168.1.5. Dùng cho traffic ngoài cluster.

## Egress policies

```yaml
spec:
  podSelector:
    matchLabels: { app: backend }
  policyTypes: [Egress]
  egress:
    - to:
        - podSelector:
            matchLabels: { app: database }
      ports:
        - protocol: TCP
          port: 5432
    - to:                              # Allow DNS
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

→ Backend chỉ gọi được DB + DNS.

**Lưu ý**: Nếu restrict Egress, **PHẢI allow DNS** (port 53/UDP) → app resolve được Service name. Quên = DNS fail.

## Default Deny All Ingress + Egress

Pattern phổ biến: tạo policy "deny all" cho mọi Pod trong namespace, sau đó add policy allow specific:

```yaml
# Step 1: Deny everything
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: prod
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
# Step 2: Allow DNS (mọi Pod đều cần)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: prod
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels: { k8s-app: kube-dns }
      ports:
        - { protocol: UDP, port: 53 }

---
# Step 3: Allow specific app
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-from-frontend
  namespace: prod
spec:
  podSelector: { matchLabels: { app: backend } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { app: frontend } }
      ports:
        - { protocol: TCP, port: 8080 }
```

→ Default deny + selective allow. **Zero-trust** model.

## Sample architecture: 3-tier

```text
[Frontend Pod]    →   [Backend Pod]    →   [Database Pod]
   :80                    :8080                :5432

Mỗi tier chỉ accept từ tier trước, gọi tier sau.
```

```yaml
# Frontend
spec:
  podSelector: { matchLabels: { tier: frontend } }
  policyTypes: [Ingress, Egress]
  ingress:
    - {}                              # accept từ mọi nguồn (Internet qua LB)
  egress:
    - to:
        - podSelector: { matchLabels: { tier: backend } }
      ports:
        - { port: 8080 }

# Backend
spec:
  podSelector: { matchLabels: { tier: backend } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector: { matchLabels: { tier: frontend } }
  egress:
    - to:
        - podSelector: { matchLabels: { tier: db } }
      ports:
        - { port: 5432 }

# Database
spec:
  podSelector: { matchLabels: { tier: db } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { tier: backend } }
      ports:
        - { port: 5432 }
  # Egress: không có → DB không gọi ra ngoài
```

→ Mỗi Pod compromise vẫn chỉ access được tier liên quan, không lateral movement.

## Test NetworkPolicy

```bash
# Tạo 2 Pod test
kubectl run client --image=alpine --rm -it -- sh
# Trong client Pod:
wget -O- http://backend:8080         # test connectivity

# Kiểm tra Pod nào có policy
kubectl get networkpolicy -n prod
kubectl describe networkpolicy backend-from-frontend -n prod
```

## Limitations

NetworkPolicy **không** support:
- Logging traffic (cần CNI extension như Calico GlobalNetworkPolicy).
- L7 filter (HTTP path) — chỉ L3/L4 (IP + port).
- Encryption — phải có service mesh (Istio).
- Rate limiting — phải có Istio/Envoy.

→ NetworkPolicy = firewall L3/L4 cơ bản. Cần L7 → service mesh.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| CNI không support NetworkPolicy | YAML tạo nhưng không có effect | Verify CNI: Calico/Cilium |
| Restrict Egress quên allow DNS | App fail resolve Service name | Add port 53/UDP rule |
| `from:` empty `[]` | Deny ALL ingress | `from: [ - {} ]` cho allow all |
| Tưởng Pod không match policy = deny | Thực ra default allow | Tạo "default deny" policy explicit |
| Mix AND/OR sai trong from | Cho phép Pod không mong muốn | Hiểu syntax 2 selector cùng item = AND |
| Quên label namespace | namespaceSelector không match | `kubectl label ns prod env=prod` |
| Egress restrict Internet (external API) | App fail call API | Allow ipBlock cho IP range external |

## Quick reference

```yaml
# Deny all
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]

# Allow from specific Pod
ingress:
  - from:
      - podSelector: { matchLabels: { app: X } }
    ports:
      - { protocol: TCP, port: 8080 }

# Allow from namespace
ingress:
  - from:
      - namespaceSelector: { matchLabels: { env: prod } }

# Allow DNS (egress)
egress:
  - to:
      - namespaceSelector: {}
        podSelector: { matchLabels: { k8s-app: kube-dns } }
    ports:
      - { protocol: UDP, port: 53 }

# IP block
ingress:
  - from:
      - ipBlock:
          cidr: 192.168.0.0/16
          except: ["192.168.1.0/24"]
```

## Tóm tắt bài 6

- Default K8s: **Pod nói chuyện với mọi Pod**. NetworkPolicy = firewall.
- Cần **CNI hỗ trợ** (Calico, Cilium). Flannel default không support.
- 4 selector: `podSelector`, `namespaceSelector`, `ipBlock`, kết hợp.
- 2 selector **cùng item** = AND. 2 item **rời** = OR.
- Default deny + selective allow = **zero-trust** pattern.
- **Phải allow DNS** (port 53/UDP) khi restrict Egress.
- Pod không bị policy match → default allow. Bị match → default deny.
- L3/L4 only. L7 (HTTP path), encryption, rate limit → service mesh.

**Bài kế tiếp** → [Bài 7: Custom Resources & Operators](07-crd-operators.md)
