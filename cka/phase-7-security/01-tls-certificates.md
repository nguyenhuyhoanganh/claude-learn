# Bài 1: TLS Certificates trong K8s

## Vì sao bài này quan trọng?

K8s **chạy hoàn toàn trên TLS**. Mọi component giao tiếp đều qua HTTPS với cert. Cert hỏng/hết hạn = cluster down. Đây cũng là **phần khó nhất** cho người mới — vì có **hàng chục cert** trong cluster.

CKA test phần này không quá deep (chủ yếu Phase 7 sau về RBAC), nhưng debug cert là kỹ năng cần.

## TLS basics — Recap nhanh

### Symmetric vs Asymmetric

```text
[Symmetric encryption]
A → B: cùng 1 key encrypt + decrypt
Vấn đề: trao key qua mạng cách nào?

[Asymmetric encryption]
Public key + Private key:
- Public encrypt → chỉ Private decrypt được
- Private sign → Public verify được
```

### TLS Handshake (đơn giản hoá)

```text
[Client]                                     [Server]
   │ ─── Hello ──────────────────────────►     │
   │ ◄── Server cert (public key) ──────       │
   │                                            │
   │ Verify cert do CA tin cậy ký               │
   │                                            │
   │ Generate symmetric key                     │
   │ Encrypt với Server public key              │
   │ ─── Encrypted symmetric key ──────────►   │
   │                                            │
   │                       Server decrypt với   │
   │                       Server private key   │
   │ ◄── Encrypted với symmetric key ──────    │
   │                                            │
   │   Tất cả traffic sau đó dùng symmetric    │
```

→ TLS combine: asymmetric (trao key an toàn) + symmetric (encrypt traffic nhanh).

### CA (Certificate Authority)

```text
[Browser/Client] tin tưởng các CA root:
   - DigiCert
   - Let's Encrypt
   - GeoTrust
   - ...

Server có cert do CA ký:
   - Client verify cert qua public key của CA
   - Nếu CA trusted → cert valid
```

K8s **dùng CA riêng** (self-signed). CA này được tạo lúc init cluster.

## TLS trong K8s — Bức tranh tổng quát

```text
┌─────────────────────────────────────────────────────────┐
│                  K8s Cluster                            │
│                                                         │
│  Kubernetes CA (tự tạo lúc kubeadm init)               │
│  - Sign mọi cert trong cluster                          │
│                                                         │
│  ETCD CA (riêng, hoặc cùng K8s CA)                     │
│  - Sign cert cho etcd cluster                           │
└─────────────────────────────────────────────────────────┘

Các loại cert:
┌──────────────────┬─────────────────────────────────┐
│ Component        │ Cert mục đích                   │
├──────────────────┼─────────────────────────────────┤
│ kube-apiserver   │ Server cert (https://6443)      │
│ etcd             │ Server cert + Peer cert         │
│ kube-controller  │ Client cert connect apiserver   │
│ kube-scheduler   │ Client cert connect apiserver   │
│ kubelet          │ Server cert + Client cert       │
│ kube-proxy       │ Client cert connect apiserver   │
│ apiserver→kubelet│ Apiserver client cert           │
│ apiserver→etcd   │ Apiserver client cert           │
│ kubectl users    │ Client cert (admin.conf)        │
│ ServiceAccount   │ JWT token (signed by SA key)    │
└──────────────────┴─────────────────────────────────┘
```

→ Hàng chục cert. May mà kubeadm tự tạo + manage.

## Vị trí cert trong cluster kubeadm

```bash
ls /etc/kubernetes/pki/
# ca.crt                    ← K8s CA
# ca.key
# apiserver.crt              ← apiserver server cert
# apiserver.key
# apiserver-kubelet-client.crt   ← apiserver → kubelet client cert
# apiserver-kubelet-client.key
# apiserver-etcd-client.crt      ← apiserver → etcd client cert
# apiserver-etcd-client.key
# front-proxy-ca.crt
# front-proxy-ca.key
# front-proxy-client.crt
# front-proxy-client.key
# sa.key                     ← ServiceAccount signing key
# sa.pub

# Etcd certs
ls /etc/kubernetes/pki/etcd/
# ca.crt                     ← Etcd CA (riêng K8s CA)
# ca.key
# server.crt                 ← Etcd server cert
# server.key
# peer.crt                   ← Etcd peer-to-peer cert
# peer.key
# healthcheck-client.crt
# healthcheck-client.key
```

→ Khoảng **20 file cert** chỉ trong 1 master node. HA cluster (3 master, 3 etcd) → hàng trăm.

## Xem chi tiết cert

```bash
# Decode cert
openssl x509 -in /etc/kubernetes/pki/apiserver.crt -text -noout
```

Output đáng chú ý:
```text
Certificate:
    Data:
        Issuer: CN = kubernetes                ← do K8s CA ký
        Validity
            Not Before: Jan 15 10:00:00 2025
            Not After : Jan 15 10:00:00 2026   ← hết hạn (1 năm)
        Subject: CN = kube-apiserver
        X509v3 Subject Alternative Name:
            DNS:kubernetes
            DNS:kubernetes.default
            DNS:kubernetes.default.svc
            DNS:kubernetes.default.svc.cluster.local
            DNS:master
            IP Address:10.96.0.1
            IP Address:192.168.1.10            ← apiserver được access qua các IP/DNS này
```

→ Phải nhớ:
- `Issuer`: ai ký (CA).
- `Subject`: dành cho ai (apiserver).
- `Validity`: thời hạn.
- `Subject Alternative Name (SAN)`: IP/DNS valid cho cert.

## Cert expiry — Vấn đề lớn nhất

Mặc định kubeadm tạo cert **valid 1 năm**. Sau 1 năm → cert hết hạn → cluster báo lỗi:

```bash
kubectl get nodes
# Unable to connect to the server: x509: certificate has expired
```

→ Cluster gần như bất động cho đến khi renew cert.

### Check ngày hết hạn

```bash
sudo kubeadm certs check-expiration
# CERTIFICATE                EXPIRES                  RESIDUAL TIME
# admin.conf                 Mar 15, 2026 10:00 UTC   358d
# apiserver                  Mar 15, 2026 10:00 UTC   358d
# apiserver-etcd-client      Mar 15, 2026 10:00 UTC   358d
# apiserver-kubelet-client   Mar 15, 2026 10:00 UTC   358d
# controller-manager.conf    Mar 15, 2026 10:00 UTC   358d
# etcd-healthcheck-client    Mar 15, 2026 10:00 UTC   358d
# etcd-peer                  Mar 15, 2026 10:00 UTC   358d
# etcd-server                Mar 15, 2026 10:00 UTC   358d
# front-proxy-client         Mar 15, 2026 10:00 UTC   358d
# scheduler.conf             Mar 15, 2026 10:00 UTC   358d
#
# CERTIFICATE AUTHORITY    EXPIRES                  RESIDUAL TIME
# ca                       Mar 15, 2035 10:00 UTC   3645d       ← CA valid 10 năm
# etcd-ca                  Mar 15, 2035 10:00 UTC   3645d
# front-proxy-ca           Mar 15, 2035 10:00 UTC   3645d
```

→ CA valid 10 năm. Cert leaf valid 1 năm — renew thường xuyên.

### Renew cert

```bash
# Renew tất cả cert
sudo kubeadm certs renew all

# Hoặc cụ thể
sudo kubeadm certs renew apiserver
sudo kubeadm certs renew admin.conf

# Sau khi renew, restart control plane
sudo systemctl restart kubelet      # kubelet sẽ restart static Pod
```

→ Best practice: **set calendar alert 11 tháng** trước expiry.

### Auto-renew với kubelet

Kubelet hỗ trợ **certificate rotation** tự động:

```yaml
# /var/lib/kubelet/config.yaml
rotateCertificates: true
serverTLSBootstrap: true
```

→ Kubelet tự CSR (Certificate Signing Request) khi cert sắp hết. apiserver auto-approve nếu config đúng.

## Tạo cert tự tay (cho user mới)

Khi cần thêm user/cert (vd: cấp quyền dev access cluster):

### Step 1: Tạo private key

```bash
openssl genrsa -out alice.key 2048
```

### Step 2: Tạo CSR (Certificate Signing Request)

```bash
openssl req -new -key alice.key -out alice.csr \
  -subj "/CN=alice/O=dev-team"
```

- `CN` (Common Name) = username (K8s identify user qua đây).
- `O` (Organization) = group (cho RBAC).

### Step 3: Sign bằng K8s CA

```bash
sudo openssl x509 -req \
  -in alice.csr \
  -CA /etc/kubernetes/pki/ca.crt \
  -CAkey /etc/kubernetes/pki/ca.key \
  -CAcreateserial \
  -out alice.crt \
  -days 365
```

→ `alice.crt` = cert valid 1 năm cho user `alice`, thuộc group `dev-team`.

### Step 4: Add user vào kubeconfig

```bash
kubectl config set-credentials alice \
  --client-certificate=alice.crt \
  --client-key=alice.key

kubectl config set-context alice-context \
  --cluster=kubernetes \
  --user=alice

kubectl config use-context alice-context

# Test
kubectl get pods
# Error: pods is forbidden: User "alice" cannot list resource "pods"
```

→ Alice authenticated nhưng chưa có RBAC (sẽ học bài sau).

## Certificates API — Modern way

Thay vì sign cert tay, dùng K8s API:

```yaml
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: alice-csr
spec:
  request: <base64-encoded-csr-file>
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 86400         # 1 ngày
  usages:
    - client auth
```

```bash
# Encode CSR
cat alice.csr | base64 -w 0
# Paste vào request field

kubectl apply -f csr.yaml

# List CSR
kubectl get csr
# NAME        AGE   SIGNERNAME                              REQUESTOR       CONDITION
# alice-csr   30s   kubernetes.io/kube-apiserver-client     kubernetes-admin   Pending

# Approve
kubectl certificate approve alice-csr

# Get signed cert
kubectl get csr alice-csr -o jsonpath='{.status.certificate}' | base64 -d > alice.crt
```

→ Production preferred. Audit log đầy đủ ai approve cert.

### Deny CSR

```bash
kubectl certificate deny alice-csr
```

## ServiceAccount Token (khác user cert)

ServiceAccount dùng **JWT token**, không phải cert:

```bash
kubectl create serviceaccount my-sa

# K8s tạo Secret chứa token
kubectl get secret -n default

# Token dùng cho Pod connect apiserver
kubectl create token my-sa
```

→ Phase 7 sau sẽ deep-dive ServiceAccount.

## Front-Proxy

Một CA riêng `front-proxy-ca` cho **API aggregation**:
- Khi bạn deploy custom API server (vd Metrics Server).
- apiserver chính proxy request → API server custom.
- Verify qua `front-proxy` CA.

→ Hiếm khi phải đụng tay. kubeadm tự tạo.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Cert hết hạn → cluster down | "x509: certificate expired" | Monitor + renew trước hạn |
| Tạo CA mới → mọi cert cũ invalid | Cluster broken | Đừng chạm CA trừ khi necessary |
| Sign cert với CA sai | apiserver reject | Dùng K8s CA cho client cert |
| CSR pending lâu | Approver không có | `kubectl certificate approve` |
| Cert không có SAN | Connect fail | Add SAN với DNS + IP |
| Restart kubelet sau renew xong xong khẳng cập nhật | Pod cũ vẫn dùng cert cũ | Restart hoặc kubelet auto-rotate |
| Cert key bị lộ | Ai dùng key đó access cluster | Revoke + tạo lại |

## Quick reference

```bash
# Check expiry
sudo kubeadm certs check-expiration

# Renew
sudo kubeadm certs renew all
sudo systemctl restart kubelet

# View cert
openssl x509 -in cert.crt -text -noout

# Create user cert
openssl genrsa -out user.key 2048
openssl req -new -key user.key -out user.csr -subj "/CN=user/O=group"
sudo openssl x509 -req -in user.csr \
  -CA /etc/kubernetes/pki/ca.crt \
  -CAkey /etc/kubernetes/pki/ca.key \
  -CAcreateserial -out user.crt -days 365

# Add to kubeconfig
kubectl config set-credentials user --client-certificate=user.crt --client-key=user.key
kubectl config set-context user-ctx --cluster=kubernetes --user=user

# CSR via API
kubectl apply -f csr.yaml
kubectl get csr
kubectl certificate approve <csr-name>
```

## Tóm tắt bài 1

- K8s chạy hoàn toàn trên TLS. Mỗi component có cert riêng.
- **kubeadm tự tạo CA + sign mọi cert** lúc cluster init.
- Cert location: `/etc/kubernetes/pki/` (K8s + etcd).
- Default valid 1 năm → renew với `kubeadm certs renew all`.
- CA valid 10 năm (ít khi renew).
- `kubeadm certs check-expiration` xem ngày hết.
- Tạo user cert: `openssl genrsa → req → x509 sign by CA`.
- Modern: dùng **CertificateSigningRequest API** + `kubectl certificate approve`.
- Kubelet hỗ trợ **auto rotation** cert.
- Cert lộ = revoke + tạo lại, không cách khác.

**Bài kế tiếp** → [Bài 2: KubeConfig — Quản lý connection đến cluster](02-kubeconfig.md)
