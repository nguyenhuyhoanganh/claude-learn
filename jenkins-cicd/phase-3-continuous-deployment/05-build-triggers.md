# Bài 5: Build triggers — Pipeline tự động chạy

Pipeline đã hoàn chỉnh — nhưng vẫn phải **click "Build Now"** mỗi lần. Bài này tự động hoá: pipeline trigger khi có code mới, hoặc theo lịch.

## Các loại trigger trong Jenkins

Vào job → **Configure** → cuộn xuống section **Build Triggers**:

```text
☐  Trigger builds remotely (e.g., from scripts)
☐  Build after other projects are built
☐  Build periodically                ← Bài này
☐  GitHub hook trigger for GITScm polling
☐  Poll SCM                          ← Bài này
```

5 loại chính:

| Trigger                | Cách hoạt động                                            | Phù hợp khi              |
|------------------------|-----------------------------------------------------------|--------------------------|
| Build periodically     | Theo lịch cron (1h/lần, mỗi đêm…)                         | Job định kỳ độc lập       |
| Poll SCM               | Định kỳ Jenkins **hỏi Git**: có commit mới không?         | Repo private, không webhook |
| GitHub hook trigger    | Git **push webhook** đến Jenkins ngay khi commit          | Repo public + Jenkins public |
| Trigger remotely       | Job khác gọi API trigger                                   | Pipeline phụ thuộc job khác |
| Build after other      | Tự chạy sau khi job upstream done                          | Pipeline tầng              |

Trong khoá học, ta dùng **Poll SCM** (vì Jenkins local không tiếp cận được từ GitHub).

## Lựa chọn 1: Build Periodically (lịch cron)

### Cú pháp Jenkins cron

Jenkins dùng định dạng cron 5 trường:

```text
MINUTE  HOUR  DAY-OF-MONTH  MONTH  DAY-OF-WEEK
  0-59   0-23      1-31      1-12     0-7
                                      (0,7 = Sunday)
```

Ví dụ:

```text
0 3 * * *           → 3:00 AM mỗi ngày
H 3 * * 1-5         → 3:0X AM thứ 2 đến thứ 6 (X random theo job)
H/15 * * * *        → mỗi 15 phút
H * * * *           → mỗi giờ (phút ngẫu nhiên)
H H 1,15 * *        → ngày 1 và 15 mỗi tháng, giờ/phút random
```

**Ký tự `H`** — duy nhất Jenkins có, không phải standard cron. Ý nghĩa: **Hash** — Jenkins tự pick giá trị **dựa trên hash tên job**, đảm bảo các job có schedule giống nhau **không** chạy cùng lúc.

Ví dụ: `H 3 * * *` cho job A có thể chạy 3:17, job B chạy 3:42 → spread load. Nếu dùng `0 3 * * *` cứng, 50 job cùng chạy 3:00 → Jenkins quá tải.

→ **Luôn dùng `H`** thay vì số cố định trừ khi thật sự cần thời điểm chính xác.

### Khi nào dùng "Build periodically"?

- **Job dài hạn**: build C++ project mất 3 giờ → schedule mỗi đêm 1 lần.
- **Maintenance check**: pipeline test "infrastructure còn ok không" mỗi giờ.
- **Periodic data sync**: pull data feed mỗi 6 giờ.

**Không phù hợp**: pipeline phản ứng theo commit. Tại sao? Vì:
- Nếu lịch 1h/lần → mất ~30 phút trung bình để biết commit fail. Quá lâu.
- Nếu không commit gì trong giờ → vẫn build → tốn resource.

→ Đa số pipeline CI dùng **SCM polling** hoặc **webhook** thay vì periodic.

### Setup Build periodically (chỉ để học)

1. Configure job → tick **Build periodically**.
2. **Schedule**: `H/15 * * * *` (mỗi 15 phút).
3. Save.

Trong vài giờ, vào build history → có entries tự sinh ra. Disable lại sau khi xong demo.

## Lựa chọn 2: Poll SCM (Git polling)

**Poll SCM** = Jenkins định kỳ **`git fetch`** để check repo có commit mới không. Nếu có → trigger pipeline.

### Setup

1. Configure → tick **Poll SCM**.
2. **Schedule**: `* * * * *` (mỗi phút).

```text
                                 ┌────────────────┐
   Jenkins (mỗi phút)  ────────► │  git fetch     │
                                 │  origin/main   │
                                 └────────┬───────┘
                                          │
                                  Commit mới?
                                          │
                              ┌───────────┴───────────┐
                              │ Yes                   │ No
                              ▼                       ▼
                       Trigger pipeline       (Không làm gì)
```

> **Lưu ý cú pháp Jenkins**: `* * * * *` = mỗi phút. Nếu bạn viết `H/1 * * * *` (tưởng là mỗi phút) — sai, sẽ thành **mỗi giờ** (do quirk). Dùng `* * * * *` cho mỗi phút.

3. Save.

### Kiểm tra polling đang chạy

Sau 1-2 phút, refresh trang job → menu trái xuất hiện link **Git Polling Log**:

```text
┌─ Polling Log ──────────────────────────────────────┐
│ Started on Jan 5, 2026 10:00:00 AM                 │
│ Using strategy: Default                            │
│ [poll] Last Built Revision: Revision abc123 (origin/main)│
│ > git fetch --tags --force --progress -- ...       │
│ > git rev-parse main^{commit}                      │
│ Done. Took 0.5 sec                                 │
│ No changes                                         │
└────────────────────────────────────────────────────┘
```

→ Không có commit mới → "No changes" → không trigger.

### Test trigger

Trong project local:

```bash
# Tạo commit giả
echo "// test polling" >> Jenkinsfile
git commit -am "Test polling trigger"
git push
```

Đợi tối đa 1 phút. Vào job dashboard → thấy build mới tự chạy:

```text
Build History
  #15  ▶ Running       Started by an SCM change      ← ← ← Tự động!
  #14  ✓ Success       Started by user valentin
  #13  ✓ Success       Started by user valentin
```

Note: dòng *"Started by an SCM change"* — khác với *"Started by user"* (manual). Đây là cách phân biệt build manual vs auto.

✓ Thành công.

### Nhược điểm Polling

- **Tốn resource**: mỗi phút Jenkins ping Git → hàng nghìn API call/ngày dù không có commit.
- **Trễ**: trung bình 30 giây mới biết có commit (poll interval / 2).
- **GitHub rate limit**: nếu polling quá nhiều job, có thể bị GitHub rate limit.

→ **Không ideal**. Lý tưởng là **webhook** (xem dưới).

## Lựa chọn 3: Webhook (production-grade)

**Webhook** = ngược lại Polling: **GitHub gọi Jenkins** khi có push. Real-time, không waste resource.

```text
                Push lên GitHub
                       │
                       ▼
            ┌─────────────────┐
            │     GitHub      │
            │  Webhook URL    │ ◄── đã đăng ký trước
            └────────┬────────┘
                     │ HTTP POST
                     ▼
            ┌─────────────────┐
            │     Jenkins     │
            │ /github-webhook/│
            └────────┬────────┘
                     │
                     ▼
              Trigger pipeline
```

### Setup webhook (tóm tắt)

1. Jenkins phải **public-accessible** trên internet (GitHub không reach localhost được).
   - Production: dùng Jenkins server có domain công khai.
   - Local: dùng **ngrok** / **cloudflared** tunnel.
2. Trong Jenkins job, tick **GitHub hook trigger for GITScm polling**.
3. Trong GitHub repo → **Settings → Webhooks → Add webhook**:
   - **Payload URL**: `https://your-jenkins.com/github-webhook/`
   - **Content type**: `application/json`
   - **Events**: Just the push event.
   - Save.
4. Test: push commit → GitHub fires webhook → Jenkins build trong **1-2 giây**.

### Vì sao khoá học không dùng?

- Jenkins chạy `localhost:8080`, không public → GitHub không reach.
- Setup ngrok mỗi lần học → phiền.
- Trong môi trường thật, security setup webhook phức tạp (whitelist IP GitHub, validate signature).

→ Khoá dùng Polling cho đơn giản. Khi triển khai thật, ưu tiên webhook.

## Polling interval: bao nhiêu là đủ?

| Interval        | Use case                                                |
|-----------------|---------------------------------------------------------|
| `* * * * *` (1m)| Demo / local; tốc độ feedback cao                       |
| `H/5 * * * *`   | Project nhỏ, ít commit                                  |
| `H/15 * * * *`  | Mặc định production reasonable                          |
| `H/30 * * * *`  | Big repo, server yếu                                    |
| `H * * * *` (1h)| Repo gần như tĩnh, chỉ check vài lần/ngày               |

Càng frequent → feedback nhanh nhưng tốn resource. Balance theo team size + commit frequency.

## Tránh trigger lặp: only on changed files

Đôi khi không muốn build mỗi commit. Ví dụ commit chỉ sửa `README.md` → tốn pipeline làm gì?

Plugin **"Generic Webhook Trigger"** hoặc trong Jenkinsfile thêm `when` clause:

```groovy
stage('Build') {
    when {
        changeset 'src/**'      // Chỉ chạy nếu file trong src/ thay đổi
    }
    steps { ... }
}
```

→ Skip stage thông minh hơn.

## Pitfall trigger thường gặp

### Pitfall 1: webhook bắn nhưng Jenkins không build

→ Check Jenkins log: `Manage Jenkins → System Log`. Tìm log của webhook plugin. Lỗi thường là:
- Branch trong webhook payload không match `Branch Specifier` (vd webhook gửi `master`, Jenkins config `main`).
- Authentication: nếu Jenkins yêu cầu auth, webhook không gửi → cần allow anonymous READ cho `/github-webhook/`.

### Pitfall 2: Polling trigger nhưng pipeline chạy không stop

→ Pipeline có sửa file commit trở lại Git (tag, version bump…) → tạo commit mới → Polling lại trigger → loop.

Fix: dùng `[ci skip]` trong commit message + plugin **Conditional BuildStep** hoặc filter cờ tag.

### Pitfall 3: Multiple webhook triggers cùng commit

→ Push 1 commit nhưng Jenkins build 3 lần. Nguyên nhân: webhook + polling + manual cùng trigger.

Fix: chọn **1** trigger duy nhất per job. Trong Jenkins: tick **Quiet period** (delay 30s gom triggers thành 1).

## Tóm tắt

- **Build periodically** (cron) — cho job định kỳ. Không nên dùng cho CI.
- **Poll SCM** — Jenkins định kỳ hỏi Git có commit mới không. Đơn giản, OK cho local/private.
- **Webhook** — GitHub bắn signal đến Jenkins ngay khi push. Real-time, production-grade. Cần Jenkins public.
- Jenkins cron có ký tự **`H`** (hash) → spread load, dùng thay vì số cố định.
- Polling interval cân bằng feedback speed vs resource cost. Mặc định OK `H/15 * * * *`.
- Tránh build vô ích: filter changeset, dùng `[ci skip]`, quiet period.

---

→ [Bài tiếp theo: Staging environment](06-staging-environment.md)
