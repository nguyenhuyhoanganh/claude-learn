# Bài 3: Troubleshoot Networking

## Tổng quan layer networking

```text
[Layer 1] Pod-to-Pod cùng node
[Layer 2] Pod-to-Pod khác node (CNI)
[Layer 3] Pod-to-Service (kube-proxy + iptables)
[Layer 4] DNS resolve (CoreDNS)
[Layer 5] Ingress (HTTP routing)
[Layer 6] External / Internet (NAT + firewall)
```

Debug từ tầng dưới lên.

## Test Pod-to-Pod connectivity

```bash
# Tạo 2 debug Pod
kubectl run pod-a --image=busybox -- sleep 3600
kubectl run pod-b --image=nicolaka/netshoot -- sleep 3600

# Test
kubectl exec pod-a -- ping <pod-b-IP>
kubectl exec pod-a -- nc -zv <pod-b-IP> 80
```

Nếu fail:
1. CNI plugin lỗi.
2. NetworkPolicy chặn.
3. Firewall trên node.

## CNI plugin issues

```bash
# Check CNI Pod
kubectl get pods -n kube-system | grep -E 'calico|flannel|weave|cilium'
# tất cả Running?

# Log
kubectl logs -n kube-system calico-node-xxx

# CNI binary trên node
ls /opt/cni/bin/
# bridge calico flannel host-local ipvlan ...

# CNI config
ls /etc/cni/net.d/
cat /etc/cni/net.d/10-calico.conflist
```

Common CNI errors:
- `cni plugin not initialized` → CNI Pod chưa Ready hoặc binary missing.
- `failed to allocate IP` → IP pool exhausted.
- `no route to host` → BGP/route issue.

Fix:
```bash
# Restart CNI agent trên node
kubectl delete pod -n kube-system calico-node-xxx
# DaemonSet sẽ tạo lại
```

## NetworkPolicy chặn

```bash
# List NetworkPolicy
kubectl get networkpolicies -A

# Test với debug Pod
kubectl run test --image=nicolaka/netshoot --rm -it -- bash
# Inside:
curl http://my-service
nc -zv pod-ip 80
```

Nếu deny: tạm xoá NP để confirm:
```bash
kubectl get netpol -A
kubectl delete netpol <name> -n <ns>
# Test lại
# Nếu OK → NP issue. Recreate với rule đúng
```

## Service không reach Pod

### 1. Check Service exists

```bash
kubectl get svc my-svc -n <ns>
# CLUSTER-IP   PORT(S)
```

### 2. Check Endpoints

```bash
kubectl get endpoints my-svc -n <ns>
# ENDPOINTS               AGE
# 10.244.0.5:8080         5m

# Hoặc EndpointSlice (K8s 1.21+)
kubectl get endpointslice -l kubernetes.io/service-name=my-svc -n <ns>
```

Empty endpoint → selector không match Pod:
```bash
kubectl get pods --show-labels
kubectl get svc my-svc -o yaml | grep -A 3 selector
```

### 3. Check kube-proxy

```bash
kubectl get pods -n kube-system | grep kube-proxy
# kube-proxy-aaaaa   1/1   Running   ← 1 Pod mỗi node

kubectl logs -n kube-system kube-proxy-aaaaa
```

### 4. Check iptables

SSH node:
```bash
sudo iptables -t nat -L KUBE-SERVICES -n | grep <service-ip>
# Có rule không?

sudo iptables -t nat -L KUBE-SVC-XXX -n
# Endpoint random?
```

Nếu iptables thiếu rule:
```bash
# Restart kube-proxy Pod
kubectl delete pod -n kube-system kube-proxy-aaaaa
```

### 5. Test với port-forward

```bash
# Skip Service, trỏ thẳng Pod
kubectl port-forward pod/my-pod 8080:8080
curl http://localhost:8080
# Hoạt động → Pod OK, Service issue
# Không hoạt động → Pod issue
```

## DNS issues

### Test DNS resolve

```bash
kubectl run test --image=busybox:1.28 --rm -it -- nslookup kubernetes
# Server: 10.96.0.10
# Name: kubernetes.default.svc.cluster.local
# Address: 10.96.0.1
```

OK = DNS hoạt động.

### CoreDNS down

```bash
kubectl get pods -n kube-system | grep coredns
# coredns-aaa   1/1   Running

kubectl logs -n kube-system coredns-aaa
```

Common errors:
- `connection refused` → upstream DNS không reach.
- `loop detected` → forward loop, sửa Corefile.

### Pod DNS config

```bash
kubectl exec my-pod -- cat /etc/resolv.conf
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5
```

Verify nameserver = CoreDNS Service IP.

### Slow DNS

`ndots:5` cao → mỗi lookup thử với nhiều search domain → slow.

Workaround per Pod:
```yaml
spec:
  dnsConfig:
    options:
      - { name: ndots, value: "2" }
```

## Ingress not working

### 1. Ingress Controller chạy không?

```bash
kubectl get pods -n ingress-nginx
# ingress-nginx-controller-xxx   1/1   Running

kubectl logs -n ingress-nginx ingress-nginx-controller-xxx
```

### 2. Ingress resource có rules đúng?

```bash
kubectl describe ingress my-ingress
# Rules:
#   Host             Path  Backends
#   ----             ----  --------
#   app.example.com  /     frontend:80 (10.244.0.5:80)
```

→ Address column rỗng = controller chưa pick up.

### 3. LoadBalancer IP

```bash
kubectl get svc -n ingress-nginx
# ingress-nginx-controller   LoadBalancer   10.96.X.X   <pending>   80,443

# <pending> → cloud chưa cấp LB, hoặc on-prem không có cloud controller
```

On-prem: dùng MetalLB.

### 4. DNS point về LB

```bash
nslookup app.example.com
# Should resolve to LB IP

# Test với Host header
curl -H "Host: app.example.com" http://<LB-IP>/
```

### 5. TLS issues

```bash
# Check Secret type tls
kubectl get secret app-tls -o yaml
# data:
#   tls.crt: ...
#   tls.key: ...

# Test SSL
openssl s_client -connect app.example.com:443
```

## External traffic không vào cluster

### NodePort không reach

```bash
kubectl get svc my-svc
# my-svc   NodePort   ...   80:30080/TCP

# Test
curl http://<node-IP>:30080
```

Fail → check:
- Firewall (cloud security group, iptables).
- kube-proxy chạy?
- Node IP đúng?

```bash
# Cloud SG: allow 30000-32767/TCP
# On-prem iptables:
sudo iptables -L -n | grep 30080
```

### LoadBalancer pending

```bash
kubectl get svc
# my-svc   LoadBalancer   ...   <pending>
```

Causes:
- Cloud provider không config (kubeadm bare-metal).
- IAM permission thiếu.
- Quota exceeded.

Fix on-prem: cài **MetalLB**:
```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.0/config/manifests/metallb-native.yaml
```

Setup IP pool:
```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.100-192.168.1.110
```

## Pod ra Internet được không?

```bash
kubectl exec my-pod -- curl http://google.com
# Connection timeout?
```

Possible:
- Node không có route ra Internet.
- Cloud NAT not configured.
- NetworkPolicy egress chặn.
- DNS không resolve external.

Debug:
```bash
# Test từ node
ssh worker-1
curl http://google.com         # node reach Internet?

# Test DNS từ Pod
kubectl exec my-pod -- nslookup google.com
```

## CNI Pod CIDR exhausted

```bash
kubectl describe pod stuck-pod
# Events:
#   Warning  FailedCreatePodSandBox  failed to allocate IP address: no IP available
```

Node hết IP cho Pod. Causes:
- CIDR /24 → 254 IP cho node, đã dùng hết.
- Old Pod IP chưa release.

Fix:
- Restart CNI agent trên node.
- Tăng Pod CIDR per node:
```yaml
# Calico
calico_node_cidr_block_size: 24    # tăng range cấp cho node
```

## NetworkPolicy permissive testing

Khi nghi NetworkPolicy chặn nhầm, tạo policy "allow all" tạm:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-all
  namespace: dev
spec:
  podSelector: {}
  ingress:
    - {}
  egress:
    - {}
  policyTypes: [Ingress, Egress]
```

→ Override mọi deny. Confirm fix → remove allow-all + tinh chỉnh policy thật.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Service selector mismatch | Endpoint empty | Verify label |
| Multiple CNI plugin | Conflict | Chỉ 1 CNI |
| Quên cài CNI sau kubeadm init | Node NotReady | Cài CNI ngay |
| Firewall chặn Pod CIDR | Cross-node Pod fail | Open Pod CIDR traffic |
| NetworkPolicy chặn DNS (port 53) | Mọi lookup fail | Allow DNS egress |
| Ingress controller không chạy | Ingress không có effect | Cài controller trước |
| MetalLB pool IP không trong subnet node | LB không announce | Đúng subnet |
| Pod CIDR overlap node network | Routing fail | Plan CIDR cẩn thận |

## Quick reference

```bash
# Pod connectivity
kubectl run test --image=nicolaka/netshoot --rm -it -- bash
# Inside:
ping <ip>
nslookup <name>
curl http://<service>
nc -zv <ip> <port>
traceroute <ip>

# Service debug
kubectl get svc <name>
kubectl get endpoints <name>
kubectl get endpointslice -l kubernetes.io/service-name=<svc>

# kube-proxy
kubectl get pods -n kube-system | grep kube-proxy
kubectl logs -n kube-system kube-proxy-xxx

# CoreDNS
kubectl get pods -n kube-system | grep coredns
kubectl logs -n kube-system coredns-xxx
kubectl get cm -n kube-system coredns -o yaml

# Ingress
kubectl get ingress
kubectl describe ingress <name>
kubectl logs -n ingress-nginx ingress-nginx-controller-xxx

# Iptables (trên node)
sudo iptables -t nat -L KUBE-SERVICES -n
sudo iptables -t nat -L KUBE-SVC-X -n
sudo iptables -L -n

# Port-forward debug
kubectl port-forward pod/X 8080:80
kubectl port-forward svc/X 8080:80
```

## Tóm tắt bài 3

- Debug từ tầng dưới lên: Pod-to-Pod → Service → DNS → Ingress.
- CNI issues: check CNI Pod log, `/opt/cni/bin/`, `/etc/cni/net.d/`.
- Service không reach Pod → check **endpoints** (label match).
- DNS issues → CoreDNS Pod + Pod `/etc/resolv.conf`.
- Ingress: controller chạy + LB IP + DNS + Secret TLS.
- On-prem LoadBalancer pending → MetalLB.
- NetworkPolicy chặn → tạm allow-all để test, refine sau.
- Pod CIDR exhausted → restart CNI agent, tăng range.

Phase 14 hoàn thành. Bạn đã có kỹ năng debug Pod/App, Cluster, và Networking — **30% điểm CKA**.

**Bài kế tiếp** → [Phase 15 - Bài 1: Mock Exam Prep & Tips](../phase-15-mock-exam-prep/01-mock-exam-prep.md)
