# Bài 3: Job và CronJob — công việc có điểm kết thúc

Deployment, StatefulSet, DaemonSet đều có chung một giả định: **Pod phải chạy mãi mãi**. Pod thoát ra là bất thường, và Kubernetes sẽ khởi động lại nó.

Nhưng rất nhiều việc thật lại **có điểm kết thúc**: chạy migration database, xuất báo cáo tháng, sao lưu, dọn dữ liệu cũ, gửi email hàng loạt. Với những việc này, Pod thoát ra với mã 0 là **thành công**, không phải sự cố.

---

## Vì sao không dùng Deployment

```yaml
# Deployment chạy một tác vụ có điểm kết thúc
spec:
  containers:
    - name: migrate
      command: ["./migrate.sh"]
```

```text
   Pod chạy migrate.sh → xong → thoát với mã 0
        │
        ▼
   Kubernetes: "Pod chết rồi! Phải khởi động lại!"
        │
        ▼
   Chạy migrate.sh LẦN NỮA → xong → thoát
        │
        ▼
   Khởi động lại... VÔ TẬN

   kubectl get pods
   NAME              READY  STATUS             RESTARTS
   migrate-xxx       0/1    CrashLoopBackOff   47
```

`CrashLoopBackOff` ở đây gây hiểu nhầm: Pod **không hề crash**, nó chạy đúng và thoát thành công. Vấn đề là bạn dùng sai loại workload.

Gốc rễ nằm ở `restartPolicy`:

| Workload | `restartPolicy` cho phép | Nghĩa |
|---|---|---|
| Deployment / StatefulSet / DaemonSet | **Chỉ `Always`** | Pod thoát là khởi động lại, bất kể mã thoát |
| **Job / CronJob** | `OnFailure` hoặc `Never` | Thoát mã 0 = **xong việc**, không khởi động lại |

---

## Job — chạy tới khi thành công

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 4               # thử lại tối đa 4 lần nếu thất bại
  activeDeadlineSeconds: 600    # quá 10 phút thì huỷ, dù đang chạy
  ttlSecondsAfterFinished: 3600 # tự xoá Job sau 1 giờ kể từ khi xong
  template:
    spec:
      restartPolicy: OnFailure  # BẮT BUỘC — mặc định Always sẽ bị từ chối
      containers:
        - name: migrate
          image: myapp/migrate:v2.1
          command: ["./migrate.sh"]
          env:
            - name: DB_HOST
              value: postgres.default.svc.cluster.local
```

```bash
kubectl apply -f job.yaml
kubectl get jobs
```

```text
NAME           STATUS     COMPLETIONS   DURATION   AGE
db-migration   Complete   1/1           23s        2m
```

### Bốn tham số quyết định hành vi

| Tham số | Mặc định | Ý nghĩa | Vì sao quan trọng |
|---|---|---|---|
| `backoffLimit` | **6** | Số lần thử lại trước khi bỏ cuộc | Không đặt → thử 6 lần, mỗi lần chờ lâu hơn (10s, 20s, 40s… tối đa 6 phút) |
| `activeDeadlineSeconds` | không có | Trần thời gian **tuyệt đối** | **Không đặt → Job treo có thể chạy vĩnh viễn**, đốt tài nguyên |
| `ttlSecondsAfterFinished` | không có | Tự dọn Job đã xong | **Không đặt → Job tích tụ mãi mãi** trong cụm |
| `completions` / `parallelism` | 1 / 1 | Chạy song song nhiều Pod | Xem phần dưới |

Hai dòng in đậm là hai bẫy vận hành phổ biến nhất. Cụm chạy vài tháng mà không đặt `ttlSecondsAfterFinished` sẽ có hàng nghìn Job `Complete` nằm trong etcd — làm `kubectl get pods` chậm và làm etcd phình.

### `restartPolicy: OnFailure` khác `Never` thế nào

```text
   OnFailure
   ═════════
   Container thất bại → KHỞI ĐỘNG LẠI container TRONG CÙNG Pod
   → Pod giữ nguyên, chỉ container chạy lại
   → Ít Pod rác hơn
   → NHƯNG mất log của lần chạy trước (trừ khi dùng --previous)

   Never
   ═════
   Container thất bại → tạo POD MỚI HOÀN TOÀN
   → Pod cũ ở lại trạng thái Error, GIỮ NGUYÊN LOG
   → Dễ điều tra hơn, nhưng nhiều Pod rác
```

Thực dụng: **`Never` cho việc cần điều tra** (migration, xử lý dữ liệu), **`OnFailure` cho việc đơn giản hay lỗi vặt** (gọi API có thể timeout).

---

## Chạy song song — ba chế độ

### Chế độ 1 — một lần, một Pod (mặc định)

```yaml
spec:
  completions: 1
  parallelism: 1
```

Dùng cho: migration, sao lưu, dọn dẹp.

### Chế độ 2 — số lượng cố định, chạy song song

```yaml
spec:
  completions: 100     # cần 100 Pod chạy thành công
  parallelism: 10      # nhưng mỗi lúc chỉ 10 Pod chạy
```

```text
   Kubernetes duy trì 10 Pod chạy đồng thời.
   Pod nào xong thì tạo Pod mới thay thế, tới khi đủ 100 lần thành công.

   Thời gian ≈ (100 / 10) × thời-gian-mỗi-Pod
```

Dùng cho: xử lý 100 phân đoạn dữ liệu độc lập.

Từ Kubernetes 1.21, mỗi Pod biết mình là phân đoạn số mấy:

```yaml
spec:
  completions: 100
  parallelism: 10
  completionMode: Indexed        # bật đánh chỉ số
  template:
    spec:
      containers:
        - name: worker
          env:
            - name: SHARD_INDEX
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['batch.kubernetes.io/job-completion-index']
```

Mỗi Pod nhận `SHARD_INDEX` từ 0 tới 99 → xử lý đúng phần dữ liệu của mình, không giẫm chân nhau.

### Chế độ 3 — hàng đợi công việc

```yaml
spec:
  parallelism: 5
  # KHÔNG đặt completions
```

```text
   5 Pod cùng chạy, mỗi Pod tự lấy việc từ hàng đợi bên ngoài
   (Redis, RabbitMQ, SQS...).

   Job coi là XONG khi BẤT KỲ Pod nào thoát mã 0
   → quy ước: Pod thấy hàng đợi rỗng thì thoát mã 0.
```

Dùng cho: xử lý hàng đợi có độ dài không biết trước.

---

## CronJob — Job chạy theo lịch

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-backup
spec:
  schedule: "0 2 * * *"              # 2 giờ sáng hằng ngày
  timeZone: "Asia/Ho_Chi_Minh"       # Kubernetes 1.27+
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: myapp/backup:v1
              command: ["./backup.sh"]
```

### Cú pháp lịch

```text
   ┌───────────── phút        (0-59)
   │ ┌─────────── giờ         (0-23)
   │ │ ┌───────── ngày tháng  (1-31)
   │ │ │ ┌─────── tháng       (1-12)
   │ │ │ │ ┌───── thứ         (0-6, 0 = Chủ nhật)
   │ │ │ │ │
   0 2 * * *     → 2:00 mỗi ngày
   */15 * * * *  → mỗi 15 phút
   0 */6 * * *   → mỗi 6 giờ
   0 3 * * 1     → 3:00 mỗi thứ Hai
   0 0 1 * *     → nửa đêm ngày 1 hằng tháng
```

> **Bẫy múi giờ nghiêm trọng**: trước Kubernetes 1.27, CronJob **luôn chạy theo giờ UTC của kube-controller-manager**, không phải giờ địa phương. `"0 2 * * *"` nghĩa là 2 giờ sáng **UTC** = **9 giờ sáng giờ Việt Nam** — giữa giờ cao điểm. Rất nhiều sự cố "sao backup chạy giữa ban ngày" đến từ đây.
>
> Từ 1.27 có trường `timeZone`. Nếu cụm cũ hơn, phải **tự quy đổi**: muốn 2 giờ sáng giờ Việt Nam (UTC+7) thì viết `"0 19 * * *"`.

### `concurrencyPolicy` — quyết định quan trọng nhất

```text
   Lịch: mỗi 5 phút. Nhưng job lần này chạy mất 8 phút.
   Chuyện gì xảy ra ở phút thứ 5?
```

| Giá trị | Hành vi | Dùng cho |
|---|---|---|
| `Allow` **(mặc định)** | Chạy chồng lên nhau | Việc **thật sự** độc lập |
| **`Forbid`** | **Bỏ qua** lần chạy mới nếu lần cũ chưa xong | **Backup, migration, gần như mọi thứ** |
| `Replace` | **Huỷ** lần cũ, chạy lần mới | Việc chỉ cần kết quả mới nhất (đồng bộ cache) |

Mặc định `Allow` là bẫy lớn nhất của CronJob:

```text
   Backup chạy mỗi giờ, nhưng dữ liệu lớn dần và giờ mất 90 phút.

   00:00  backup #1 bắt đầu
   01:00  backup #2 bắt đầu   ← #1 vẫn đang chạy
   01:30  backup #1 xong
   02:00  backup #3 bắt đầu   ← #2 vẫn đang chạy
   ...
   → Số job chồng nhau TĂNG DẦN
   → Đĩa I/O bão hoà, database chậm, cả hệ thống ốm theo
   → Và cả hai job cùng ghi vào MỘT file backup → hỏng file
```

> **Khuyến nghị**: đặt **`concurrencyPolicy: Forbid`** cho gần như mọi CronJob. Chỉ dùng `Allow` khi bạn chắc chắn các lần chạy hoàn toàn độc lập.

### `startingDeadlineSeconds` — và bẫy im lặng

```yaml
  startingDeadlineSeconds: 300     # trễ quá 5 phút thì bỏ qua lần đó
```

Dùng khi controller bị gián đoạn: nếu tới giờ mà không chạy được, quá 5 phút thì bỏ luôn thay vì chạy bù muộn.

> **Bẫy**: nếu **không đặt** trường này và CronJob controller ngừng hoạt động hơn 100 lần lịch, CronJob sẽ **dừng lập lịch vĩnh viễn** và ghi sự kiện `Cannot determine if job needs to be started: too many missed start times`. Cách chữa duy nhất là tạo lại CronJob. Đặt `startingDeadlineSeconds` tránh được tình huống này.

### Giữ lịch sử

```yaml
  successfulJobsHistoryLimit: 3    # giữ 3 Job thành công gần nhất
  failedJobsHistoryLimit: 5        # giữ 5 Job thất bại gần nhất
```

Mặc định là 3 và 1. Nên **tăng `failedJobsHistoryLimit`** — Job thất bại mới là thứ bạn cần đọc log.

---

## Vận hành

```bash
# Xem lịch và lần chạy gần nhất
kubectl get cronjob daily-backup
```

```text
NAME           SCHEDULE    TIMEZONE            SUSPEND   ACTIVE   LAST SCHEDULE   AGE
daily-backup   0 2 * * *   Asia/Ho_Chi_Minh    False     0        7h              30d
```

```bash
# Chạy thử ngay, không đợi lịch — thao tác cực kỳ hữu ích
kubectl create job --from=cronjob/daily-backup backup-thu-nghiem

# Tạm dừng lịch (khi bảo trì) mà không xoá CronJob
kubectl patch cronjob daily-backup -p '{"spec":{"suspend":true}}'

# Xem log của Job đã chạy
kubectl logs job/daily-backup-28934520

# Log của lần container chạy TRƯỚC khi khởi động lại
kubectl logs job/daily-backup-28934520 --previous
```

Lệnh `kubectl create job --from=cronjob/...` đáng nhớ nhất: nó cho phép **kiểm tra CronJob ngay lập tức** thay vì chờ tới 2 giờ sáng để biết mình viết sai lệnh.

---

## Bốn nguyên tắc viết Job an toàn

### 1. Phải idempotent (chạy lại cho cùng kết quả)

Job **sẽ** chạy lại — do `backoffLimit`, do node chết, do CronJob chạy chồng. Đây không phải khả năng lý thuyết.

```bash
# SAI — chạy lại là trừ tiền hai lần
UPDATE accounts SET balance = balance - 100 WHERE id = 42;

# ĐÚNG — ghi nhận đã xử lý, chạy lại thì bỏ qua
INSERT INTO processed_jobs (job_id) VALUES ('$JOB_NAME')
  ON CONFLICT DO NOTHING;
```

### 2. Phải trả đúng mã thoát

```bash
#!/bin/bash
set -euo pipefail        # DÒNG QUAN TRỌNG NHẤT

./migrate.sh
```

Không có `set -e`, script bash **vẫn thoát mã 0** dù lệnh giữa chừng thất bại → Kubernetes báo `Complete` trong khi migration hỏng. Đây là lỗi im lặng nguy hiểm nhất khi viết Job.

### 3. Phải xử lý tín hiệu dừng

```bash
trap 'echo "Nhận SIGTERM, dọn dẹp..."; cleanup; exit 143' TERM
```

`activeDeadlineSeconds` hết hạn hoặc node bị rút sẽ gửi `SIGTERM`. Không bắt tín hiệu thì Job bị `SIGKILL` sau 30 giây, để lại transaction dở dang.

### 4. Phải có giới hạn tài nguyên

```yaml
          resources:
            requests: {cpu: 500m, memory: 512Mi}
            limits:   {memory: 2Gi}
```

Job xử lý dữ liệu hay ngốn bộ nhớ bất thường. Không giới hạn thì nó có thể làm **OOM cả node**, giết luôn Pod ứng dụng đang chạy cùng chỗ.

---

## Bảng chọn workload — đầy đủ bốn loại

| Câu hỏi | Workload |
|---|---|
| Chạy mãi, mọi bản giống nhau | **Deployment** |
| Chạy mãi, mỗi bản có danh tính và ổ đĩa riêng | **StatefulSet** |
| Chạy mãi, một bản trên mỗi node | **DaemonSet** |
| Chạy một lần rồi xong | **Job** |
| Chạy theo lịch | **CronJob** |

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Dùng Deployment cho tác vụ có điểm kết thúc | `CrashLoopBackOff` vô tận dù tác vụ chạy đúng | Dùng Job |
| Quên `restartPolicy: OnFailure`/`Never` | Job bị từ chối lúc apply | Luôn khai báo |
| Không đặt `ttlSecondsAfterFinished` | **Hàng nghìn Job rác** làm phình etcd | Đặt 3600 hoặc ngắn hơn |
| Không đặt `activeDeadlineSeconds` | Job treo chạy **vĩnh viễn** | Luôn đặt trần |
| Để `concurrencyPolicy: Allow` mặc định | Job **chồng nhau tăng dần** → bão hoà I/O, hỏng file output | `Forbid` |
| Quên CronJob chạy theo **UTC** (trước 1.27) | Backup chạy giữa giờ cao điểm | Đặt `timeZone`, hoặc tự quy đổi |
| Không đặt `startingDeadlineSeconds` | Controller gián đoạn lâu → CronJob **dừng lập lịch vĩnh viễn** | Đặt 300 |
| Script bash không có `set -e` | Job báo **thành công** dù thất bại | `set -euo pipefail` |
| Job không idempotent | Chạy lại gây **trừ tiền hai lần** | Ghi nhận đã xử lý |
| `failedJobsHistoryLimit: 1` (mặc định) | Mất log của lần thất bại trước | Tăng lên 5 |
| Không giới hạn bộ nhớ | Job làm **OOM cả node** | Đặt `limits.memory` |
| Chờ tới 2 giờ sáng để biết lệnh cron viết sai | Mất một ngày mỗi lần thử | `kubectl create job --from=cronjob/...` |

---

## Tóm tắt bài 3

- Deployment/StatefulSet/DaemonSet chỉ cho `restartPolicy: Always` → Pod thoát mã 0 vẫn bị khởi động lại → **`CrashLoopBackOff` dù tác vụ chạy đúng**. Đó là dấu hiệu bạn cần **Job**.
- Bốn tham số Job quyết định hành vi: **`backoffLimit`** (mặc định 6), **`activeDeadlineSeconds`** (không đặt = chạy vĩnh viễn), **`ttlSecondsAfterFinished`** (không đặt = Job rác tích tụ trong etcd), `completions`/`parallelism`.
- `restartPolicy: Never` **giữ log** của Pod thất bại (dễ điều tra); `OnFailure` **ít Pod rác** hơn.
- Ba chế độ song song: một lần một Pod; **`completions` + `parallelism`** cố định (kèm `completionMode: Indexed` để mỗi Pod biết mình là phân đoạn nào); và **hàng đợi** (chỉ đặt `parallelism`).
- **Bẫy múi giờ**: trước Kubernetes 1.27, CronJob chạy theo **UTC**. `"0 2 * * *"` = 9 giờ sáng giờ Việt Nam. Dùng `timeZone` hoặc tự quy đổi.
- **`concurrencyPolicy` mặc định là `Allow`** — job chạy chồng nhau tăng dần khi thời gian chạy vượt chu kỳ. **Đặt `Forbid` cho gần như mọi CronJob.**
- Không đặt `startingDeadlineSeconds` mà controller gián đoạn quá 100 lịch → CronJob **dừng lập lịch vĩnh viễn**, phải tạo lại.
- Bốn nguyên tắc viết Job an toàn: **idempotent**, **`set -euo pipefail`** (không có thì Job báo thành công dù hỏng), **bắt `SIGTERM`**, và **giới hạn bộ nhớ**.
- Lệnh cần thuộc: **`kubectl create job --from=cronjob/<tên>`** để chạy thử ngay thay vì chờ tới giờ.

**Bài kế tiếp** → [Bài 4: Chọn workload nào — bảng quyết định và tổng kết Phase 17](04-chon-workload-va-tong-ket.md)
