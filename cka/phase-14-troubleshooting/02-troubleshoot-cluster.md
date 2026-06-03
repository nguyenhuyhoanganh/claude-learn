# Bài 2: Troubleshoot Control Plane & Worker Node

## Workflow troubleshoot cluster

```text
[1. Tất cả node Ready?]
   kubectl get nodes
   
[2. Control plane Pod running?]
   kubectl get pods -n kube-system
   
[3. Kubelet trên node hoạt động?]
   ssh <node>
   sudo systemctl status kubelet
   sudo journalctl -u kubelet
   
[4. Container runtime?]
   sudo systemctl status containerd
   sudo crictl ps
   
[5. Network/DNS?]
   kubectl get pods -n kube-system | grep -E 'coredns|calico'
```

## Node NotReady

```bash
kubectl get nodes
# NAME       STATUS     ROLES           AGE   VERSION
# worker-1   NotReady   <none>          1d    v1.30.0

kubectl describe node worker-1
# Conditions:
#   Type             Status   Reason
#   MemoryPressure   False    KubeletHasSufficientMemory
#   DiskPressure     False    KubeletHasSufficientDisk
#   PIDPressure      False    KubeletHasSufficientPID
#   Ready            False    KubeletNotReady           ← here
#     Message: container runtime network not ready:
#              NetworkReady=false
#              reason:NetworkPluginNotReady
#              message:Network plugin returns error:
#              cni plugin not initialized
```

→ CNI vấn đề. SSH node, debug.

### Debug kubelet

```bash
# SSH worker-1
ssh worker-1

# Status kubelet
sudo systemctl status kubelet
# active (running) | failed | activating

# Logs
sudo journalctl -u kubelet -n 100 --no-pager
sudo journalctl -u kubelet --since '10 minutes ago'

# Restart
sudo systemctl restart kubelet
```

Common kubelet errors:

#### `failed to load Kubelet config file`

```bash
sudo cat /var/lib/kubelet/config.yaml
# Verify file exists + syntax OK
```

#### `swap is on`

```bash
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab
sudo systemctl restart kubelet
```

#### `failed to connect to apiserver`

```bash
sudo cat /etc/kubernetes/kubelet.conf
# Check apiserver URL
# Check cert valid

# Test connect
curl -k https://master-ip:6443/healthz
```

#### `Cgroup driver mismatch`

```bash
# Kubelet config
sudo cat /var/lib/kubelet/config.yaml | grep cgroupDriver
# cgroupDriver: systemd

# Containerd config
sudo cat /etc/containerd/config.toml | grep SystemdCgroup
# SystemdCgroup = true

# Phải match: cả 2 = systemd hoặc cả 2 = cgroupfs
```

### Debug container runtime

```bash
# Status
sudo systemctl status containerd

# Logs
sudo journalctl -u containerd -n 100

# Restart
sudo systemctl restart containerd
sudo systemctl restart kubelet

# Check containers
sudo crictl ps
sudo crictl pods
sudo crictl images
```

## Control Plane Pod fail

```bash
kubectl get pods -n kube-system
# NAME                             READY   STATUS             AGE
# etcd-master                      0/1     CrashLoopBackOff   5m
# kube-apiserver-master            0/1     CrashLoopBackOff   5m
# kube-controller-manager-master   1/1     Running            5m
# kube-scheduler-master            1/1     Running            5m
```

### apiserver crash

```bash
# Log
kubectl logs -n kube-system kube-apiserver-master
# Hoặc nếu apiserver down → check trực tiếp container
sudo crictl ps -a | grep apiserver
sudo crictl logs <container-id>
```

Common errors:
- `unable to start etcd` → etcd down.
- `bad certificate` → cert expired hoặc sai SAN.
- `unable to load admission plugin` → manifest sai flag.

### Sửa manifest static Pod

Static Pod ở `/etc/kubernetes/manifests/`. Sửa → kubelet auto-restart Pod:

```bash
sudo vim /etc/kubernetes/manifests/kube-apiserver.yaml
# Sửa flag
# Save

# Kubelet sẽ kill Pod cũ + tạo Pod mới
sudo crictl ps | grep apiserver
# Verify Pod mới có Pod ID khác
```

→ **Backup trước khi sửa**: `sudo cp file file.bak`. Nếu sửa sai, restore + reset.

### etcd issues

```bash
# Log
kubectl logs -n kube-system etcd-master
sudo crictl logs <etcd-container-id>
```

Common etcd errors:
- `mvcc: database space exceeded` → etcd full. Compact + defragment.
- `cluster is unhealthy` → etcd member down.
- `permission denied` → cert/auth issue.

### Compact + defrag etcd

```bash
# Get current revision
ETCD_REV=$(sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint status --write-out=fields | grep Revision | awk '{print $2}')

# Compact
sudo ETCDCTL_API=3 etcdctl ... compact $ETCD_REV

# Defrag
sudo ETCDCTL_API=3 etcdctl ... defrag --cluster
```

### controller-manager crash

```bash
kubectl logs -n kube-system kube-controller-manager-master
# error: error initializing client cert auth: ...
```

→ Cert / kubeconfig issue. Check `/etc/kubernetes/controller-manager.conf`.

### scheduler crash

```bash
kubectl logs -n kube-system kube-scheduler-master
```

→ Similar pattern.

## Master node down hoàn toàn

```bash
kubectl get nodes
# error: unable to connect to the server
```

apiserver không reach. SSH master:

```bash
ssh master

# Check static Pod manifests
ls /etc/kubernetes/manifests/

# Check kubelet
sudo systemctl status kubelet
sudo journalctl -u kubelet --since '5 minutes ago'

# Check etcd
sudo crictl ps | grep etcd
sudo crictl logs <etcd-id>

# Check apiserver
sudo crictl ps | grep apiserver
sudo crictl logs <apiserver-id>
```

Recovery steps:

1. **Kubelet không chạy** → start.
2. **Cert expired** → `kubeadm certs renew all`.
3. **Manifest sai** → restore backup.
4. **Etcd corrupt** → restore từ snapshot.
5. **Disk full** → clean up.

## Disk pressure

```bash
kubectl describe node worker-1 | grep -i pressure
# DiskPressure   True    KubeletHasDiskPressure
```

→ Node disk hết. Pod sẽ bị evict.

SSH node:
```bash
df -h
# /dev/sda1   100% full

# Common culprits
du -sh /var/lib/containerd/* | sort -h
du -sh /var/log/* | sort -h
sudo crictl rmi --prune          # xoá image không dùng

# Container log
sudo journalctl --vacuum-size=500M
```

## Memory pressure

```bash
kubectl describe node worker-1 | grep -i memory
# MemoryPressure  True   KubeletHasInsufficientMemory
```

→ Node OOM imminent. kubelet đẩy taint NoExecute → evict Pod (theo QoS class, BestEffort trước).

Fix:
- Add memory limit cho Pod.
- Scale workload xuống.
- Add node.

## kubectl không liên lạc được

```bash
kubectl get nodes
# Unable to connect to the server: dial tcp 192.168.1.10:6443: connection refused
```

Possible reasons:
1. **apiserver down** → SSH master, check.
2. **Network firewall** → check route, iptables.
3. **kubeconfig sai** → `kubectl config view`.
4. **Cert expired** → `kubeadm certs check-expiration`.

```bash
# Test direct
curl -k https://master-ip:6443/healthz

# Verify cert
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates
```

## Cluster upgrade fail

Khi `kubeadm upgrade apply` fail:

```bash
# Check log
sudo journalctl -u kubelet --since '10 minutes ago'

# Rollback manifest
sudo cp /etc/kubernetes/manifests/kube-apiserver.yaml.bak \
       /etc/kubernetes/manifests/kube-apiserver.yaml
```

Common upgrade failures:
- Image pull fail.
- Static Pod manifest invalid.
- etcd version skew.

## Node disk full → Pod stuck

```bash
kubectl get pods -A | grep Terminating
# Stuck Terminating
```

Force delete:
```bash
kubectl delete pod X --grace-period=0 --force
```

→ Pod object remove khỏi apiserver. Container có thể vẫn chạy node (clean tay).

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Sửa manifest static Pod sai syntax | Pod không restart | Backup trước |
| Force delete trước khi clean container | Container zombie | Clean trước force delete |
| Compact etcd quá thường | Slowdown | Schedule định kỳ, không real-time |
| Restart kubelet không xem log | Lặp lại lỗi cũ | Đọc log trước |
| Restore etcd vào folder cũ | Cluster ID conflict | Folder mới |
| Cert expire trong production | Cluster down | Monitor + renew trước hạn |
| Quên backup `/etc/kubernetes/pki` | Restore không hoàn chỉnh | Backup cả pki + etcd |

## Quick reference

```bash
# Node
kubectl get nodes
kubectl describe node <node>
kubectl top nodes

# Control plane
kubectl get pods -n kube-system
kubectl logs -n kube-system <pod>
kubectl describe pod -n kube-system <pod>

# SSH node
sudo systemctl status kubelet
sudo systemctl status containerd
sudo journalctl -u kubelet --since '10m'
sudo journalctl -u containerd --since '10m'

# CRI
sudo crictl ps
sudo crictl ps -a
sudo crictl logs <container-id>
sudo crictl images
sudo crictl pods

# Disk
df -h
du -sh /var/lib/containerd
sudo crictl rmi --prune

# Cert
sudo kubeadm certs check-expiration
sudo kubeadm certs renew all
sudo systemctl restart kubelet
```

## Tóm tắt bài 2

- Node NotReady → SSH node → check kubelet + container runtime.
- Cgroup driver phải match giữa kubelet và containerd.
- Static Pod (apiserver, etcd, ...) manage qua manifest `/etc/kubernetes/manifests/`.
- Sửa manifest → kubelet auto-restart Pod (backup trước).
- etcd issues: full → compact + defrag. Corrupt → restore snapshot.
- Disk pressure → cleanup image, log, container.
- Cert expired → `kubeadm certs renew all` + restart kubelet.
- Force delete Pod: `--grace-period=0 --force` (chỉ khi cần).

**Bài kế tiếp** → [Bài 3: Troubleshoot Networking](03-troubleshoot-networking.md)
