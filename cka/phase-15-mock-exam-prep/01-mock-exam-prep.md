# Bài 1: Mock Exam Prep & Tips cho ngày thi

## Tổng quan kỳ thi CKA

```text
Format:      Hands-on, performance-based (làm thật trên cluster)
Thời gian:    120 phút (rút từ 3h xuống từ 2023)
Số task:      15-20 task
Pass score:   66%
Cluster:      6 cluster ảo cho 6 task khác nhau
Browser:      PSI Secure Browser
Allowed:      kubernetes.io docs, blog, github (3 nguồn)
Retake:       1 lần miễn phí trong 12 tháng
Chi phí:      $395 USD (giảm khi sale)
```

## Domain weights (CKA 1.32)

| Domain | Weight |
|---|---|
| **Storage** | 10% |
| **Troubleshooting** | **30%** ← lớn nhất |
| **Workloads & Scheduling** | 15% |
| **Cluster Architecture, Installation & Configuration** | 25% |
| **Services & Networking** | 20% |

→ **Troubleshooting + Cluster admin = 55%**. Tập trung kỹ phần này.

## Time management

```text
20 task / 120 phút = 6 phút/task

Strategy:
- Task ngắn (1-3 phút): làm trước, lấy điểm dễ.
- Task dài (8-10 phút): làm sau khi đã có "đệm".
- Skip task khó, quay lại sau.
- Để 10 phút cuối review.

Flag system: mark task khó để quay lại
```

## Setup ngày thi

### Trước thi 1 tuần

```text
[Môi trường]
- Phòng đóng cửa, không người khác.
- Bàn dọn sạch (không giấy, sách, điện thoại).
- Chỉ 1 monitor (đa monitor không được).
- Webcam + microphone test trước.

[Internet]
- Speed test (>5 Mbps upload).
- Wifi cable nếu được (tránh disconnect).
- Backup mobile hotspot.

[System]
- Browser PSI Secure Browser cài trước.
- Đóng tất cả app khác lúc thi.
- Disable antivirus tạm.
```

### Trước thi 1 ngày

```text
- Đăng ký lịch trên CNCF portal.
- Read Candidate Handbook lại.
- Setup môi trường lab killer.sh nếu chưa.
- Ngủ đủ giấc.
```

### Ngày thi

```text
- Đăng nhập 30 phút trước.
- ID check (passport hoặc government ID).
- Webcam scan phòng.
- Proctor verify môi trường OK → start exam.
```

## Bash setup ngay khi bắt đầu

Mỗi cluster start, bạn có 1-2 phút setup trước khi đọc task. Setup ngay:

```bash
# Alias
alias k=kubectl
export do="--dry-run=client -o yaml"
export now="--force --grace-period=0"

# Autocomplete
source <(kubectl completion bash)
complete -F __start_kubectl k

# Vim
cat > ~/.vimrc <<EOF
set tabstop=2
set expandtab
set shiftwidth=2
set autoindent
set smartindent
set paste
EOF
```

→ Gõ `k get po` thay `kubectl get pods` = tiết kiệm 2-3 giây/lệnh × 200 lệnh = 10 phút.

## Lệnh imperative phải nhớ

```bash
# Pod
k run nginx --image=nginx
k run nginx --image=nginx --port=80
k run nginx --image=nginx -- sleep 5000          # command
k run nginx --image=nginx --command -- sleep 5000  # override entrypoint
k run nginx --image=nginx $do > pod.yaml          # gen YAML

# Deployment
k create deployment nginx --image=nginx --replicas=3
k create deployment nginx --image=nginx $do > deploy.yaml

# Service
k expose deployment nginx --port=80 --target-port=8080
k expose deployment nginx --port=80 --type=NodePort
k create service clusterip nginx --tcp=80:8080
k create service nodeport nginx --tcp=80:8080 --node-port=30080

# ConfigMap / Secret
k create cm app-config --from-literal=KEY=value
k create cm app-config --from-file=config.txt
k create secret generic app-secret --from-literal=PASS=admin
k create secret tls my-tls --cert=cert.crt --key=cert.key
k create secret docker-registry reg --docker-server=... --docker-username=...

# Job / CronJob
k create job hello --image=busybox -- echo hello
k create cronjob backup --image=busybox --schedule="*/5 * * * *" -- /backup.sh

# Namespace
k create ns dev

# ServiceAccount
k create sa my-sa

# Role / RoleBinding
k create role pod-reader --verb=get,list --resource=pods
k create rolebinding alice-binding --role=pod-reader --user=alice
k create clusterrole node-reader --verb=get,list --resource=nodes
k create clusterrolebinding alice-cluster --clusterrole=node-reader --user=alice
```

## Generate YAML mẫu — Kỹ năng VÀNG

Khi cần YAML phức tạp:
```bash
k run nginx --image=nginx $do > pod.yaml
vim pod.yaml
# Thêm volume, env, resources, probes, ...
k apply -f pod.yaml
```

Hoặc edit Deployment hiện tại:
```bash
k edit deployment X
# vim mở, sửa, save
```

## Vim commands phải thuộc

```text
i           insert mode
Esc         normal mode
:w          save
:q          quit
:wq         save + quit
:q!         quit không save
dd          xoá dòng
yy          copy dòng
p           paste
u           undo
Ctrl+r      redo
/keyword    search
:set paste  paste không lỗi indent
:%s/old/new/g  replace all
gg          đi đầu file
G           đi cuối file
:N          đi dòng N
```

`:set paste` **CỰC KỲ QUAN TRỌNG** khi paste YAML từ docs.

## kubectl explain — Tra cứu offline

Khi không nhớ field name:
```bash
k explain pod.spec
k explain pod.spec.containers
k explain pod --recursive | less
k explain deployment.spec.strategy.rollingUpdate
```

→ Nhanh hơn search docs web.

## kubectl docs links phải nhớ

Trong exam, dùng search docs nhanh hơn nhớ:

| Topic | Trang tìm |
|---|---|
| Pod YAML | "pod" → Pod Lifecycle |
| Deployment | "deployment" → Deployments |
| Service | "service" → Services |
| Ingress | "ingress" → Ingress |
| ConfigMap | "configmap" → ConfigMaps |
| Secret | "secret" → Secrets |
| NetworkPolicy | "network policies" |
| RBAC | "rbac" → Using RBAC Authorization |
| Taint/Toleration | "taint" → Taints and Tolerations |
| Affinity | "affinity" → Assigning Pods to Nodes |
| HPA | "horizontal pod" → HorizontalPodAutoscaler |
| PV/PVC | "persistent volumes" |
| StorageClass | "storage class" |
| etcd backup | "etcd backup" |
| kubeadm | "kubeadm" |
| Drain | "drain" → Safely Drain a Node |
| Cert renew | "kubeadm certs" |

→ Bookmark mental.

## Mock exam practice

### Killer.sh (kèm khi đăng ký)

```text
- 2 simulator sessions (mỗi 36 giờ)
- Difficulty HIGHER than real exam
- Pass killer.sh = pass CKA chắc chắn
- Practice 2-3 lần trước thi
```

### Practice tests trong khoá

KodeKloud labs mỗi bài. Làm hết, đặc biệt:
- Phase 14 (Troubleshooting): nhiều case.
- Mock Exam section.

### Self practice

Tạo cluster Kind local, tự ra task:
```bash
# Tạo cluster 3 node
kind create cluster --config kind-config.yaml

# Self practice
# Task: "Create a Pod with sidecar log shipper"
# Task: "Scale deployment to 5"
# Task: "Setup PVC with NFS"
```

## Common task patterns

### Pattern 1: "Create X with config Y"

```bash
# Generate YAML
k create X --dry-run=client -o yaml > x.yaml
# Sửa config
vim x.yaml
# Apply
k apply -f x.yaml
```

### Pattern 2: "Pod X is failing, fix it"

```bash
# Step 1: Diagnose
k get pods
k describe pod X
k logs X
k logs X --previous

# Step 2: Identify (image, resource, config, RBAC, ...)
# Step 3: Edit
k edit pod X       # nếu sửa được trực tiếp
# Hoặc:
k get pod X -o yaml > x.yaml
# Sửa
k delete pod X
k apply -f x.yaml
```

### Pattern 3: "Cluster upgrade từ vX → vY"

```bash
# Master
sudo apt-mark unhold kubeadm
sudo apt install -y kubeadm=1.31.0-00
sudo apt-mark hold kubeadm

sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.31.0

k drain master --ignore-daemonsets

sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=1.31.0-00 kubectl=1.31.0-00
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet

k uncordon master

# Worker (lặp cho mỗi worker)
k drain worker-1 --ignore-daemonsets
ssh worker-1
sudo apt-mark unhold kubeadm
sudo apt install -y kubeadm=1.31.0-00
sudo apt-mark hold kubeadm
sudo kubeadm upgrade node
sudo apt-mark unhold kubelet
sudo apt install -y kubelet=1.31.0-00 kubectl=1.31.0-00
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet
exit
k uncordon worker-1
```

### Pattern 4: "Backup etcd"

```bash
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/backup.db
```

### Pattern 5: "Restore etcd"

```bash
# 1. Stop apiserver
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# 2. Restore
sudo ETCDCTL_API=3 etcdctl snapshot restore /opt/backup.db \
  --data-dir=/var/lib/etcd-restored

# 3. Update etcd manifest volume path
sudo vim /etc/kubernetes/manifests/etcd.yaml
# Đổi /var/lib/etcd → /var/lib/etcd-restored

# 4. Resume apiserver
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# Verify
k get nodes
```

## Mental tricks

### "Read first, decide priority"

Đầu exam, lướt tất cả task 2 phút. Phân loại:
- Easy (2-3 phút): làm trước.
- Medium: làm sau.
- Hard: skip, quay lại.

### "Don't get stuck"

Task khó → flag và skip. **10 phút stuck = 2 task easy mất**.

### "Verify after"

Sau mỗi task, verify ngay:
```bash
k get X
k describe X
k logs X
```

Tránh "tưởng xong nhưng không xong".

### "Read carefully"

Task hỏi "Create a Pod in namespace dev with label app=nginx". Bạn tạo trong default → mất điểm. Read kỹ.

### "Use the right cluster"

Mỗi task có 1 cluster khác:
```bash
# Switch cluster
kubectl config use-context cluster-X
```

→ Verify context trước mỗi task: `k config current-context`.

## Cheat sheet phải in / nhớ

```text
[1. ALIAS]
alias k=kubectl
export do="--dry-run=client -o yaml"

[2. GENERATE YAML]
k run X --image=Y $do > X.yaml
k create deployment X --image=Y $do > X.yaml

[3. EDIT IN PLACE]
k edit X
k set image deployment/X X=image:tag

[4. EXPLAIN]
k explain pod.spec.containers --recursive

[5. ETCD BACKUP/RESTORE]
ETCDCTL_API=3 etcdctl --endpoints=... --cacert=... --cert=... --key=... \
  snapshot save /opt/backup.db
ETCDCTL_API=3 etcdctl snapshot restore /opt/backup.db --data-dir=/new

[6. UPGRADE]
sudo apt install kubeadm=X
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply vX
sudo kubeadm upgrade node    # cho worker
sudo apt install kubelet=X kubectl=X
sudo systemctl restart kubelet

[7. NODE MAINTENANCE]
k drain node --ignore-daemonsets --delete-emptydir-data
k uncordon node
k cordon node

[8. CERT]
sudo kubeadm certs check-expiration
sudo kubeadm certs renew all
sudo systemctl restart kubelet

[9. TROUBLESHOOT]
k describe pod X
k logs X --previous
k get events --sort-by='.lastTimestamp' -A
sudo journalctl -u kubelet
sudo crictl ps; sudo crictl logs <id>
```

## Cuối cùng

```text
✓ Practice killer.sh 2-3 lần
✓ Làm hết lab khoá học
✓ Học vim cơ bản
✓ Quen aliases + dry-run
✓ Đọc Candidate Handbook
✓ Test môi trường trước thi
✓ Ngủ đủ giấc đêm trước
✓ Tự tin — bạn đã prepare đủ
```

## Sau khi pass

```text
[Score email] trong 24h sau exam
[Certificate] có sau vài ngày
[Verify URL]: cert.linuxfoundation.org

[Career]
- Update LinkedIn: "Certified Kubernetes Administrator (CKA)"
- Update CV
- Cập nhật salary band

[Next cert]
- CKAD (Developer) — dễ hơn CKA
- CKS (Security) — khó hơn CKA, đòi hỏi CKA trước
- KCNA (entry-level, mới)
```

## Tóm tắt bài 1

- CKA: hands-on, 120 phút, pass 66%, 1 retake free.
- Domain: **Troubleshooting 30%**, Cluster Architecture 25%, Networking 20%, Workloads 15%, Storage 10%.
- Setup ngay khi start: `alias k=kubectl`, `export do=...`, vim config.
- Generate YAML: `k X --dry-run=client -o yaml`.
- 5 lệnh nhớ: backup etcd, restore etcd, upgrade cluster, drain node, renew cert.
- Killer.sh: practice 2-3 lần. Pass killer = pass CKA.
- Strategy: easy task trước, flag hard task, verify sau mỗi task.
- Ngày thi: phòng sạch, internet ổn, ngủ đủ. **Bạn đã sẵn sàng.**

Chúc bạn pass CKA với điểm cao! 🎓

→ **Hoàn thành toàn bộ CKA course**. Bạn đã đi qua:
- Phase 1-2: Foundation (intro + core concepts)
- Phase 3: Scheduling
- Phase 4: Logging & Monitoring
- Phase 5: Application Lifecycle
- Phase 6: Cluster Maintenance
- Phase 7: Security (TLS, RBAC, NetworkPolicy)
- Phase 8: Storage
- Phase 9: Networking
- Phase 10-11: Design & Install (kubeadm)
- Phase 12-13: Helm & Kustomize
- Phase 14: Troubleshooting
- Phase 15: Mock Exam Prep (bài này)

**Tổng 50+ bài** Vietnamese-first, production-grade. Sẵn sàng cho exam!
