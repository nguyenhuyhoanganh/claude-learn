# Bài 4: Chọn workload nào — bảng quyết định và tổng kết Phase 17

Kubernetes có sáu loại workload. Phase 12 đã dạy hai loại, ba bài vừa rồi thêm ba loại nữa. Bài này ghép tất cả thành một cây quyết định, rồi nói về loại thứ sáu mà ít người biết.

---

## Cây quyết định

```text
   BẮT ĐẦU: bạn cần chạy cái gì?
        │
        ├─ Tác vụ có ĐIỂM KẾT THÚC?
        │       │
        │       ├─ Chạy theo LỊCH?  ─────────────────────► CronJob
        │       └─ Chạy một lần?    ─────────────────────► Job
        │
        └─ Chạy MÃI MÃI?
                │
                ├─ Cần một bản trên MỖI NODE? ───────────► DaemonSet
                │
                ├─ Mỗi bản cần DANH TÍNH + Ổ ĐĨA riêng? ─► StatefulSet
                │
                ├─ Chỉ cần đúng MỘT bản, không scale? ───► ReplicaSet trực tiếp
                │                                          (hiếm — xem bên dưới)
                │
                └─ Mọi bản GIỐNG NHAU, thay thế được ────► Deployment
                                                            (90% trường hợp)
```

---

## Bảng đối chiếu đầy đủ

| | Deployment | StatefulSet | DaemonSet | Job | CronJob |
|---|---|---|---|---|---|
| Pod chạy mãi | Có | Có | Có | **Không** | **Không** |
| Số Pod do ai quyết | `replicas` | `replicas` | **số node** | `completions` | `completions` |
| Tên Pod | ngẫu nhiên | **cố định `-0`,`-1`** | ngẫu nhiên | ngẫu nhiên | ngẫu nhiên |
| Ổ đĩa riêng mỗi Pod | Không | **Có** (`volumeClaimTemplates`) | thường `hostPath` | Không | Không |
| Thứ tự khởi động | Không | **Có** | Không | Không | Không |
| `restartPolicy` | `Always` | `Always` | `Always` | **`OnFailure`/`Never`** | **`OnFailure`/`Never`** |
| Thêm node mới | không ảnh hưởng | không ảnh hưởng | **tự tạo Pod** | không | không |
| Nâng cấp | tạo mới → xoá cũ | ngược thứ tự, có `partition` | **xoá cũ → tạo mới** | không áp dụng | không áp dụng |
| Quay lui được | **Có** (`rollout undo`) | Có | Có | Không | Không |
| Có HPA được | **Có** | Có | **Không** | Không | Không |

Hai dòng cuối đáng chú ý:

**DaemonSet không dùng HorizontalPodAutoscaler được** — vì số Pod đã do số node quyết định. Muốn "scale" DaemonSet thì phải scale **cụm**, tức là Cluster Autoscaler.

**Job và CronJob không quay lui được.** Không có `rollout undo`. Job đã chạy là đã chạy — đây là lý do nguyên tắc **idempotent** ở [bài 3](03-job-va-cronjob.md) quan trọng đến vậy.

---

## ReplicaSet — loại thứ sáu, và vì sao đừng dùng trực tiếp

Nhiều người ngạc nhiên khi biết **Deployment không tự quản Pod**. Nó quản ReplicaSet, và ReplicaSet mới quản Pod.

```text
   Deployment  ──quản──►  ReplicaSet  ──quản──►  Pod
       │                       │
       │                       └─ đảm bảo đúng N Pod đang chạy
       │
       └─ quản LỊCH SỬ các ReplicaSet → đó là thứ cho phép QUAY LUI
```

```bash
kubectl get replicaset
```

```text
NAME                  DESIRED   CURRENT   READY   AGE
myapp-7d4b9c8f6d      3         3         3       10m    ← phiên bản hiện tại
myapp-5c8f7d9b4a      0         0         0       2h     ← phiên bản cũ, giữ để quay lui
myapp-9f2a1b3c5e      0         0         0       1d     ← cũ hơn
```

Khi bạn `kubectl rollout undo`, Deployment chỉ đơn giản **tăng `replicas` của ReplicaSet cũ lên và hạ cái mới xuống 0**. Không có gì huyền bí.

```yaml
spec:
  revisionHistoryLimit: 10      # giữ 10 ReplicaSet cũ (mặc định)
```

> **Đừng tạo ReplicaSet trực tiếp.** Nó không có lịch sử, không quay lui được, không có chiến lược nâng cấp. Deployment cho bạn tất cả những thứ đó mà không tốn gì thêm. ReplicaSet chỉ tồn tại như một chi tiết cài đặt.

---

## Bốn tình huống thật và lựa chọn đúng

### Tình huống 1 — API Node.js, 3 bản sao, không lưu gì

```text
   → DEPLOYMENT.  Không phải suy nghĩ.
```

Nếu API có ghi file tạm, dùng `emptyDir` — nó sống cùng Pod và mất khi Pod chết, đúng ý muốn.

### Tình huống 2 — Redis làm cache

```text
   Mất dữ liệu có sao không?  KHÔNG (cache dựng lại được)
   → DEPLOYMENT, replicas=1, không cần PVC

   Mất dữ liệu có sao không?  CÓ (dùng làm kho session, hàng đợi)
   → STATETULSET + PVC
```

Đây là ví dụ điển hình cho thấy **cùng một phần mềm có thể cần workload khác nhau tuỳ mục đích sử dụng**. Câu hỏi quyết định luôn là *"mất dữ liệu có sao không?"*.

### Tình huống 3 — migration database khi deploy

```text
   SAI:  nhét migration vào initContainer của Deployment
         → MỌI Pod đều chạy migration
         → 3 Pod chạy cùng lúc → tranh chấp, hỏng schema

   ĐÚNG: Job riêng, chạy TRƯỚC khi cập nhật Deployment
```

Với Helm, dùng hook:

```yaml
metadata:
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
```

Với ArgoCD thì tương đương là `argocd.argoproj.io/hook: PreSync`.

### Tình huống 4 — worker xử lý hàng đợi

```text
   Hàng đợi LUÔN CÓ việc, worker chạy liên tục
   → DEPLOYMENT + HPA theo độ dài hàng đợi (KEDA)

   Hàng đợi chỉ có việc vài lần mỗi ngày
   → CRONJOB, hoặc KEDA scale từ 0
```

`Deployment` chạy 24/7 cho một hàng đợi mỗi ngày chỉ có việc 10 phút là lãng phí. **KEDA** (Kubernetes Event-Driven Autoscaling) cho phép scale từ 0 lên N theo độ dài hàng đợi thật — thứ mà HPA gốc không làm được.

---

## Ba sai lầm chọn workload hay gặp nhất

### 1. Dùng StatefulSet vì "ứng dụng của tôi có trạng thái"

Câu hỏi đúng không phải *"có trạng thái không"* mà là:

```text
   "Trạng thái đó có nằm TRONG Pod không?"

   Trạng thái ở database bên ngoài (RDS, Cloud SQL) → DEPLOYMENT
   Trạng thái ở Redis/S3 bên ngoài                  → DEPLOYMENT
   Trạng thái ở ổ đĩa CỦA CHÍNH POD                 → STATEFULSET
```

Phần lớn ứng dụng "có trạng thái" thật ra lưu trạng thái ở nơi khác → Deployment là đúng.

### 2. Dùng Deployment cho tác vụ có điểm kết thúc

Triệu chứng nhận biết ngay: `CrashLoopBackOff` với `RESTARTS` tăng đều trong khi log cho thấy tác vụ **chạy đúng và xong**.

### 3. Dùng DaemonSet cho ứng dụng thường

```text
   "Tôi muốn app chạy trên mọi node cho nhanh" → SAI

   Vấn đề:
     • Không kiểm soát được số bản sao
     • Không dùng được HPA
     • Thêm node = thêm một bản app không cần thiết
     • Cụm 50 node = 50 bản, dù chỉ cần 5

   → Dùng Deployment + podAntiAffinity để trải đều là đúng hơn
```

```yaml
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                topologyKey: kubernetes.io/hostname
                labelSelector:
                  matchLabels:
                    app: myapp
```

Đoạn này nói *"cố gắng đừng đặt hai Pod cùng app lên một node"* — cho bạn sự trải đều mà vẫn giữ quyền kiểm soát số lượng.

---

## Danh sách kiểm tra trước khi đưa workload lên production

| Mục | Áp dụng cho | Vì sao |
|---|---|---|
| `resources.requests` và `limits` | **Mọi** workload | Không có thì scheduler đặt bừa, và Pod có thể làm OOM cả node |
| `readinessProbe` | Deployment, StatefulSet | Không có thì traffic vào Pod chưa sẵn sàng |
| `livenessProbe` | Deployment, StatefulSet | Phát hiện treo, nhưng **cẩn thận** — xem Phase 18 |
| `podDisruptionBudget` | Deployment, StatefulSet | Chặn việc bảo trì node giết hết bản sao cùng lúc |
| `ttlSecondsAfterFinished` | Job, CronJob | Chặn Job rác phình etcd |
| `concurrencyPolicy: Forbid` | CronJob | Chặn job chồng nhau |
| `tolerations` | DaemonSet | Chạy được cả trên node có taint |
| `serviceName` + Headless Service | StatefulSet | DNS ổn định cho từng Pod |
| `revisionHistoryLimit` | Deployment | Giới hạn số ReplicaSet cũ giữ lại |
| `terminationGracePeriodSeconds` | Workload có trạng thái | Đủ thời gian đóng sạch |

Trong đó **`podDisruptionBudget`** là thứ hay bị bỏ quên nhất:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 2          # hoặc maxUnavailable: 1
  selector:
    matchLabels:
      app: myapp
```

Không có nó, một lệnh `kubectl drain` để bảo trì node có thể **xoá cả 3 bản sao cùng lúc** nếu chúng tình cờ nằm chung node — gây gián đoạn dịch vụ giữa lúc bảo trì có kế hoạch.

---

## Tóm tắt Phase 17

- **Sáu loại workload**, nhưng thực tế chỉ dùng năm: Deployment (90% trường hợp), StatefulSet, DaemonSet, Job, CronJob. **ReplicaSet là chi tiết cài đặt** của Deployment — đừng tạo trực tiếp.
- **StatefulSet** ([bài 1](01-statefulset.md)) cho **danh tính ổn định** (`-0`, `-1`) và **PVC riêng mỗi Pod** qua `volumeClaimTemplates`, cộng thứ tự khởi động/tắt. Bắt buộc có **Headless Service**. Nhưng nó **không lo sao lưu hay failover** — đó là việc của Operator.
- **DaemonSet** ([bài 2](02-daemonset.md)) **không có `replicas`**; số Pod bằng số node và tự điều chỉnh. Cần **toleration** để chạy trên node có taint, và thường cần `hostPath`/`hostNetwork` — nên **image phải rất đáng tin**.
- **Job và CronJob** ([bài 3](03-job-va-cronjob.md)) là loại duy nhất cho `restartPolicy` khác `Always`. Bốn thứ phải đặt: `activeDeadlineSeconds`, `ttlSecondsAfterFinished`, **`concurrencyPolicy: Forbid`**, và `timeZone` (CronJob mặc định chạy theo **UTC**).
- Câu hỏi chọn StatefulSet không phải *"có trạng thái không"* mà là **"trạng thái có nằm trong Pod không"**. Đa số ứng dụng lưu trạng thái ở database bên ngoài → **Deployment là đúng**.
- **DaemonSet không dùng được HPA**; **Job/CronJob không quay lui được** — nên Job phải **idempotent**.
- Migration database phải là **Job riêng chạy trước khi cập nhật Deployment**, không phải `initContainer` (mọi Pod sẽ cùng chạy → tranh chấp schema).
- Muốn trải đều Pod ra nhiều node thì dùng **Deployment + `podAntiAffinity`**, không phải DaemonSet.
- Thứ hay bị bỏ quên nhất trước production: **PodDisruptionBudget** — không có nó, một lệnh `kubectl drain` có thể giết hết bản sao cùng lúc.

**Phase kế tiếp** → [Bài 1: Requests, Limits và QoS — vì sao Pod bị OOMKilled](../phase-18/01-requests-limits-va-qos.md)
