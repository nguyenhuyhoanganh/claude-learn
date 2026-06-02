# Bài 2: Kubernetes Trilogy và lộ trình học

## Vì sao có 3 course Kubernetes thay vì 1?

Kubernetes là **vũ trụ rộng lớn** — không thể đóng gói vào 1 course. Các tổ chức training (KodeKloud, Linux Foundation, ...) chia thành **3 course chuyên biệt**, mỗi cái target một đối tượng:

```text
                  Kubernetes for Absolute Beginners
                            (KK trilogy course 1)
                              │
                              ▼
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
   Certified Kubernetes              Certified Kubernetes
   Administrators (CKA)              Application Developer (CKAD)
   (course 2)                        (course 3)
            │                                   │
            ▼                                   ▼
   DevOps / SRE / Platform           Backend / Cloud-native dev
   Engineer roles                    roles
```

Course bạn đang học là **CKA** (course 2). Cùng với course 1 và 3 hợp thành **Kubernetes Trilogy**.

## Course 1: Kubernetes for the Absolute Beginners

**Target**: Người **chưa biết gì** về container, K8s, hoặc cloud-native. Bao gồm cả **non-technical PM, BA** muốn hiểu high-level.

**Phạm vi nội dung**:
- Container vs VM (khác nhau gì).
- Docker basic (chạy container, build image).
- Set up cluster đơn giản (Minikube).
- Pod, ReplicaSet, Deployment, Service — overview.
- YAML basic (đọc + viết được file đơn giản).

**Đặc điểm**: **Không deep-dive** vào technical detail. Tập trung kể chuyện + ví dụ. Pace chậm, dành cho người tiếp xúc lần đầu.

**Sau khi xong**: Bạn có thể tham gia discussion về K8s mà không bị lạc, đọc K8s YAML hiểu sơ bộ. Nhưng **chưa đủ để vận hành cluster production**.

## Course 2: Certified Kubernetes Administrator (CKA) — Course này

**Target**: **DevOps / SRE / Platform Engineer** chịu trách nhiệm vận hành K8s cluster production.

**Phạm vi nội dung** (sâu hơn course 1 nhiều):

```text
1. Kiến trúc cluster (etcd, API server, controller, scheduler, kubelet)
2. Scheduling chi tiết (taints, tolerations, affinity, priority)
3. Logging + monitoring (kubectl logs, metrics-server, dashboard)
4. Application lifecycle (rollout, rollback, ConfigMap, Secret)
5. Cluster maintenance (drain node, upgrade K8s version, backup ETCD)
6. Security (RBAC, ServiceAccount, NetworkPolicy, certificate)
7. Storage (PV, PVC, StorageClass, dynamic provisioning)
8. Networking (Service types, Ingress, CNI, DNS)
9. Install cluster bằng kubeadm từ đầu
10. Troubleshooting (node NotReady, pod fail, network issue)
```

**Đặc điểm**:
- Hands-on lab cho mọi topic.
- Học về **vận hành** chứ không phải **dev application**.
- Chuẩn bị để đậu kỳ thi CKA (xem bài 1).

**Sau khi xong**: Bạn có thể được tin tưởng quản lý K8s cluster production của công ty — provision, monitor, upgrade, fix.

## Course 3: Certified Kubernetes Application Developer (CKAD)

**Target**: **Backend developer** viết application chạy trên K8s. Khác CKA — không quản cluster, chỉ deploy app lên cluster đã có.

**Phạm vi nội dung**:

```text
1. Pod design (multi-container, init container, sidecar)
2. ConfigMap + Secret + ServiceAccount cho app
3. Probes (readiness, liveness, startup)
4. Logging + monitoring app
5. Job + CronJob
6. Service + networking từ góc nhìn app
7. State persistence (PVC từ góc nhìn app)
```

**Đặc điểm**:
- Không cover install cluster, không cover RBAC admin, không cover ETCD backup.
- Tập trung "tôi viết app, deploy lên K8s, app cần gì để chạy ngon".
- Dễ hơn CKA một chút (theo phản hồi học viên).

**Sau khi xong**: Bạn có thể viết K8s manifest cho microservice, debug app issue trong cluster, optimize resource cho app.

## Có cần học cả 3 không?

Không bắt buộc — phụ thuộc vào vai trò mục tiêu:

| Role | Course gợi ý | Cert mục tiêu |
|---|---|---|
| **Beginner / non-tech** | Course 1 (Beginners) | Không cần cert |
| **Backend developer** | Course 1 + Course 3 (CKAD) | CKAD |
| **DevOps / SRE / Platform** | Course 1 + Course 2 (CKA) | **CKA** |
| **K8s Security Engineer** | Course 1 + Course 2 + CKS course | CKS (cao cấp hơn CKA) |
| **Full mastery** | Cả 3 + CKS | CKA + CKAD + CKS |

Nếu bạn nhắm CKA (như khoá này) và **đã biết Docker / cloud cơ bản** → có thể **bỏ qua course 1**, vào thẳng CKA. Course này có recap các topic cần thiết.

## Lộ trình học course CKA này

Sau khi xong các bài "intro" này, course chia thành các **section/phase** theo syllabus của kỳ thi:

```text
Phase 1 — Mở đầu CKA (bài này)
        │
Phase 2 — Core Concepts
        │  Kiến trúc + Pod/ReplicaSet/Deployment/Service/Namespace
        │
Phase 3 — Scheduling
        │  Taints, tolerations, affinity, resource, DaemonSet, Static Pod
        │
Phase 4 — Logging & Monitoring
        │
Phase 5 — Application Lifecycle Management
        │  Rollout, rollback, ConfigMap, Secret
        │
Phase 6 — Cluster Maintenance
        │  Drain, upgrade, backup ETCD
        │
Phase 7 — Security
        │  Auth, RBAC, ServiceAccount, NetworkPolicy, TLS
        │
Phase 8 — Storage
        │  PV, PVC, StorageClass
        │
Phase 9 — Networking
        │  Service deep, Ingress, CNI, DNS, NetworkPolicy
        │
Phase 10 — Design & Install cluster (high-level)
        │
Phase 11 — Install cluster bằng kubeadm (hands-on)
        │
Phase 12-13 — Helm + Kustomize basics
        │
Phase 14 — Troubleshooting (rất quan trọng — 30% điểm)
        │
Phase 15 — Other Topics (bổ sung)
        │
Phase 16 — Mock Exams (3-5 đề mock thật)
        │
Phase 17 — Bonus (optional)
```

## Cách học hiệu quả nhất

**1. Đừng skip lab**

Mỗi bài lý thuyết có **practice lab** kèm theo. Bạn sẽ thấy có vẻ giống nhau (vd: tạo Pod, tạo Service) nhưng mỗi lab tăng dần độ khó. **Skip = không pass nổi exam**.

**2. Gõ lệnh thay vì copy-paste**

Trong exam bạn phải gõ. Nếu mọi lệnh đều copy-paste lúc học → ngày thi sẽ gõ chậm, không nhớ flag, ngỡ ngàng.

**3. Mở `kubectl --help` thường xuyên**

Tập thói quen tra cứu help trong CLI thay vì search Google. Trong exam, mở terminal + `kubectl explain` nhanh hơn mở docs.

**4. Học vim trước khi vào exam**

Editor mặc định trong exam terminal là vim. Nếu không biết vim → mất hàng phút mỗi lần edit. Học các shortcut cơ bản:
- `i` insert, `Esc` về normal.
- `dd` xoá dòng, `yy` copy, `p` paste.
- `:w` save, `:q` quit, `:wq` save + quit.
- `:set paste` trước khi paste YAML (tránh auto-indent phá format).

**5. Setup alias kubectl**

```bash
alias k=kubectl
source <(kubectl completion bash)
complete -F __start_kubectl k
```

Gõ `k get po` thay vì `kubectl get pods` — tiết kiệm hàng giây mỗi lần. Trong 2 giờ exam, tiết kiệm 10-20 phút.

**6. Một số topic overlap giữa 3 course**

Course này có **recap** các topic cơ bản (Pod, Deployment, Service) ở Phase 2 cho người chưa học course 1. Đừng skip — recap rất nhanh và cần thiết để bài sau hiểu.

## Tại sao không học K8s qua tutorial blog?

Nhiều người tự học qua blog/YouTube. Vấn đề:

| Tự học blog | Course CKA bài bản |
|---|---|
| Random topic, không follow syllabus exam | Cover **100% syllabus** v1.32 |
| Không có lab, chỉ đọc | Hundreds of hands-on labs trong browser |
| Cú pháp K8s thay đổi nhanh | Course update mỗi quý theo exam changes |
| Không biết mình thiếu cái gì | Mock exam đo level chính xác |
| Tốn thời gian gom thông tin | Đã được KodeKloud + Mumshad chắt lọc |

→ Course này tiết kiệm **6-12 tháng** so với tự gom thông tin lẻ tẻ.

## Cảnh báo: Đừng học vẹt

CKA hands-on → không thể học vẹt:

❌ "Nhớ port của etcd là 2379"
❌ "Nhớ cú pháp `kubectl run nginx --image=nginx --port=80`"
❌ "Nhớ cấu trúc YAML của Deployment"

Tất cả **có sẵn trong docs**. Việc của bạn là:

✅ Hiểu **vì sao** kiến trúc K8s có etcd, scheduler, controller — biết role từng cái.
✅ Biết **tìm nhanh** trong docs khi quên cú pháp.
✅ **Vận hành thuần thục** kubectl, vim, bash.
✅ **Debug có hệ thống** khi gặp lỗi.

→ CKA test **năng lực vận hành**, không phải trí nhớ.

## Tóm tắt bài 2

- **3 course** trong Kubernetes Trilogy: Beginners → CKA hoặc CKAD → CKS (cho security).
- CKA = quản trị cluster (cho DevOps/SRE), CKAD = deploy app (cho dev), CKS = security advanced.
- Course này (CKA) chia thành **16 phase**, cover toàn bộ syllabus exam.
- Học hiệu quả: gõ lệnh thay vì copy-paste, làm hết lab, học vim, set alias kubectl.
- **Đừng học vẹt** — exam test năng lực vận hành, không phải trí nhớ. Mở docs thoải mái khi thi.

Đã xong phase intro. Bài kế tiếp đi sâu vào **kiến trúc cluster Kubernetes** — phần nền tảng quan trọng nhất, ảnh hưởng đến mọi thứ về sau.

**Bài kế tiếp** → [Phase 2 - Bài 1: Kiến trúc cluster Kubernetes](../phase-2-core-concepts/01-kien-truc-cluster.md)
