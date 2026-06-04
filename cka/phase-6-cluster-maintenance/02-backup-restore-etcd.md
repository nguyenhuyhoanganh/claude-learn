# Bài 2: Backup & Restore ETCD

## Vì sao backup quan trọng?

etcd lưu **mọi state** của cluster. Mất etcd = mất:
- Mọi resource (Pod, Service, ConfigMap, Secret).
- RBAC (Role, Binding).
- Cluster config (node info, ...).
- Custom Resource (CRD).

→ etcd hỏng + không backup = **build cluster lại từ đầu**.

CKA test rất kỹ phần này — bài thi 100% có task backup/restore etcd.

## 2 cách backup K8s

### Cách 1: Backup resource qua kubectl

```bash
# Lấy tất cả resource quan trọng
kubectl get all --all-namespaces -o yaml > all-resources.yaml

# Hoặc per resource type
for resource in pods services deployments configmaps secrets; do
  kubectl get $resource --all-namespaces -o yaml > backup/$resource.yaml
done
```

**Ưu điểm**:
- Đơn giản.
- Hoạt động cả với managed K8s (EKS, GKE) không access etcd.
- Restore = `kubectl apply -f backup/`.

**Nhược điểm**:
- Không bắt được resource đang tạo dở.
- Phải maintain script.
- Không lấy được "ngữ cảnh hoàn chỉnh" (vd: token nội bộ).

### Cách 2: Backup etcd (recommended cho self-hosted)

Snapshot etcd → có **point-in-time** đầy đủ cluster state.

**Ưu điểm**: Restore = mọi thứ y như cũ.
**Nhược điểm**: Không dùng được với managed K8s.

CKA focus cách 2 → bài này deep-dive.

## Velero — Tool production

Heptio Velero (cũ tên Ark):
- Backup K8s resource + PV data.
- Schedule định kỳ.
- Upload S3/GCS/Azure Blob.
- Restore selective (namespace, label).

```bash
# Install
velero install --provider aws --bucket my-backup --secret-file ./creds

# Backup
velero backup create my-backup --include-namespaces=default,kube-system

# Restore
velero restore create --from-backup my-backup
```

CKA không test Velero deep — biết tên là đủ.

## etcdctl — Tool chính thức

### Cài đặt

```bash
sudo apt update && sudo apt install -y etcd-client

etcdctl version
# etcdctl version: 3.5.x
# API version: 3.5
```

→ Cần API v3 (mặc định trong K8s mới). Set:
```bash
export ETCDCTL_API=3
```

## Endpoint + Auth setup

etcd dùng **mutual TLS**. Cần 3 cert:

| Cert | Mục đích |
|---|---|
| `ca.crt` | CA root |
| `server.crt` | Client cert |
| `server.key` | Client private key |

Trong cluster kubeadm:
```bash
ls /etc/kubernetes/pki/etcd/
# ca.crt
# ca.key
# server.crt
# server.key
# peer.crt
# peer.key
# healthcheck-client.crt
# healthcheck-client.key
```

Lệnh etcdctl đầy đủ:
```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  <command>
```

Tạo alias để gõ ngắn:
```bash
alias etcd-ctl='ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key'
```

## Snapshot Backup

```bash
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-snapshot-$(date +%F).db

# Output:
# Snapshot saved at /backup/etcd-snapshot-2025-01-15.db
```

### Verify backup

```bash
ETCDCTL_API=3 etcdctl --write-out=table snapshot status /backup/etcd-snapshot-2025-01-15.db
# +----------+----------+------------+------------+
# |   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
# +----------+----------+------------+------------+
# | abc123de |   12345  |        523 |     2.5 MB |
# +----------+----------+------------+------------+
```

→ Cho biết số key, size. Verify backup OK.

### Automation

Cron daily backup:
```bash
# /etc/cron.daily/etcd-backup.sh
#!/bin/bash
BACKUP_DIR=/backup/etcd
mkdir -p $BACKUP_DIR
DATE=$(date +%F-%H%M%S)

ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save $BACKUP_DIR/etcd-$DATE.db

# Cleanup: keep last 7 days
find $BACKUP_DIR -name 'etcd-*.db' -mtime +7 -delete
```

Schedule:
```bash
sudo chmod +x /etc/cron.daily/etcd-backup.sh
```

Production: upload lên S3:
```bash
aws s3 cp $BACKUP_DIR/etcd-$DATE.db s3://my-bucket/etcd-backup/
```

## Restore

Đây là kỹ năng **bắt buộc** cho CKA. Practice nhiều lần.

### Step 1: Stop kube-apiserver

apiserver phụ thuộc etcd. Nếu restore mà apiserver vẫn write → conflict.

**Cách stop trong cluster kubeadm**:

```bash
# Apiserver chạy static Pod. Tạm move manifest ra để kubelet dừng nó.
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# Kubelet thấy file gone → xoá Pod
# Verify
sudo crictl ps | grep apiserver        # không còn

# kubectl bây giờ fail (apiserver down)
kubectl get pods
# error: connection refused
```

### Step 2: Restore snapshot

```bash
sudo ETCDCTL_API=3 etcdctl snapshot restore \
  /backup/etcd-snapshot-2025-01-15.db \
  --data-dir=/var/lib/etcd-from-backup
```

→ Tạo folder mới `/var/lib/etcd-from-backup` chứa data restored.

**Quan trọng**: Restore vào **folder MỚI**, không overwrite folder hiện tại `/var/lib/etcd`.

Vì sao? etcd snapshot restore tạo cluster member ID mới → nếu overwrite, etcd nhầm là member cũ → fail.

### Step 3: Trỏ etcd vào folder mới

Sửa etcd static Pod manifest:
```bash
sudo vim /etc/kubernetes/manifests/etcd.yaml
```

Tìm:
```yaml
volumes:
  - hostPath:
      path: /var/lib/etcd         # ← path cũ
      type: DirectoryOrCreate
    name: etcd-data
```

Đổi thành:
```yaml
volumes:
  - hostPath:
      path: /var/lib/etcd-from-backup   # ← path mới
      type: DirectoryOrCreate
    name: etcd-data
```

→ Save. Kubelet thấy file đổi → recreate etcd Pod với volume mới.

### Step 4: Re-enable apiserver

Move manifest trở lại:
```bash
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/
```

Kubelet tạo apiserver Pod lại.

### Step 5: Verify

```bash
# Đợi 1-2 phút
kubectl get nodes
kubectl get pods --all-namespaces
```

→ Resource có y như lúc backup. Restore thành công.

## Alternative: Restore không đổi path

Phức tạp hơn vì cần force etcd accept ID member khác:

```bash
sudo ETCDCTL_API=3 etcdctl snapshot restore \
  /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restored \
  --name=master \
  --initial-cluster=master=https://127.0.0.1:2380 \
  --initial-cluster-token=etcd-cluster-1 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380

# Stop etcd
sudo systemctl stop etcd

# Replace data
sudo rm -rf /var/lib/etcd/*
sudo cp -r /var/lib/etcd-restored/* /var/lib/etcd/

# Start
sudo systemctl start etcd
```

→ Phức tạp. **Cách đổi path** dễ hơn cho exam.

## HA etcd cluster restore

Nếu có 3 etcd node:
- Stop apiserver trên **mọi master**.
- Restore snapshot trên **mỗi node** (cùng snapshot file).
- Mỗi node phải set `--initial-cluster` chứa cả 3 node.
- Bring up etcd cluster lại.

→ Phức tạp. Lab kubeadm thường 1 node etcd — đơn giản hơn.

## Backup cert + config

etcd backup **không backup TLS cert**. Phải backup riêng:

```bash
sudo tar czf /backup/kubernetes-pki.tar.gz \
  /etc/kubernetes/pki \
  /etc/kubernetes/manifests
```

Khi restore cert hỏng:
```bash
sudo tar xzf /backup/kubernetes-pki.tar.gz -C /
```

Best practice production: backup **etcd + cert + kubeconfig** mỗi đêm.

## Test restore — Critical

**Backup không test = không có backup**. Periodically:
1. Restore vào cluster test.
2. Verify resource đầy đủ.
3. Document quy trình.

## Exam tips

CKA scenario phổ biến:
1. **Backup**: "Lưu snapshot etcd tại `/opt/backup.db`".
2. **Restore**: "Restore từ `/opt/backup.db`, data-dir `/var/lib/etcd-restored`".
3. **Identify version etcd**: `kubectl describe pod -n kube-system etcd-master | grep Image`.

Practice:
```bash
# Quick reference
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/backup.db

ETCDCTL_API=3 etcdctl snapshot restore /opt/backup.db \
  --data-dir=/var/lib/etcd-restored

# Sửa etcd.yaml volume path → /var/lib/etcd-restored
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `ETCDCTL_API=3` | unknown command "snapshot" | Set env hoặc `--api-version=3` |
| Restore overwrite `/var/lib/etcd` | etcd fail (ID mismatch) | Restore vào folder mới |
| Quên stop apiserver trước restore | Race condition, corruption | Move manifest ra `/tmp/` |
| Quên update volume path trong etcd.yaml | etcd vẫn dùng data cũ | Verify volume hostPath đổi |
| Backup không có cert | Restore Pod nhưng apiserver fail TLS | Backup cả `/etc/kubernetes/pki` |
| Không test restore | Khi disaster mới biết backup hỏng | Practice định kỳ |
| Cron backup nhưng disk full | Backup fail silent | Monitor disk + cleanup old backup |

## Quick reference

```bash
# Backup
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd.db

# Verify
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd.db --write-out=table

# Restore
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/    # stop apiserver
sudo ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd.db \
  --data-dir=/var/lib/etcd-restored

sudo vim /etc/kubernetes/manifests/etcd.yaml                    # update volume path
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/    # resume apiserver

kubectl get nodes                                                # verify
```

## Tóm tắt bài 2

- **etcd backup** = duy nhất giữ state cluster cho self-hosted K8s.
- 2 cách backup K8s: query kubectl (managed) vs snapshot etcd (self-hosted).
- `ETCDCTL_API=3 etcdctl snapshot save`: snapshot file.
- Restore: stop apiserver → restore snapshot vào folder MỚI → update volume path trong etcd.yaml → resume apiserver.
- Backup cert + `/etc/kubernetes/pki` riêng — etcd snapshot không gồm.
- **Test restore** định kỳ — backup không test = không có backup.
- Production: cron daily + upload S3 + retention 7-30 days.

**Bài kế tiếp** → [Phase 7 - Bài 1: TLS Certificates trong K8s](../phase-7-security/01-tls-certificates.md)
