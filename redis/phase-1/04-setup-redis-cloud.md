# Bài 4: Setup Redis Cloud từ A đến Z

Đây là hướng dẫn từng bước tạo một Redis instance miễn phí trên Redis Cloud — đủ dùng cho toàn bộ khoá học. Quy trình mất khoảng **5 phút**.

> Nếu bạn đã quen Docker và muốn chạy hoàn toàn local, có thể bỏ qua bài này và xem cách Docker ở [Bài 3 — mục 2](03-cac-loai-deployment.md#lựa-chọn-2--docker-khuyến-nghị-cho-dev-local). Tuy nhiên, dùng cloud có lợi: khỏi cài Docker, kết nối từ bất kỳ máy nào, có dashboard quan sát.

## Bước 1 — Đăng ký tài khoản

1. Mở trình duyệt → vào [https://redis.io/cloud/](https://redis.io/cloud/) (tên cũ là `redis.com`/`redislabs.com`, đều dẫn về đây).
2. Nhấn **Try Free** (góc phải trên cùng).
3. Đăng ký bằng **Google**, **GitHub**, hoặc **email**. Khuyến nghị Google/GitHub để khỏi xác thực email.
4. Hoàn tất các bước onboarding (chấp nhận TOS, vai trò là Developer / Student...).

Sau khi đăng nhập, bạn vào dashboard Redis Cloud Console.

## Bước 2 — Hiểu mô hình Subscription & Database

Trước khi bấm nút, cần hiểu 2 khái niệm chính trong Redis Cloud:

```text
+--- Subscription -----------------------------------+
|  - Plan thanh toán (Free / Fixed / Flexible / ...) |
|  - Cloud provider + Region                         |
|  - Memory size, HA option                          |
|                                                    |
|  +--- Database 1 ----+   +--- Database 2 ----+     |
|  | endpoint, port    |   | endpoint, port    |     |
|  | password, modules |   | password, modules |     |
|  +-------------------+   +-------------------+     |
+----------------------------------------------------+
```

- **Subscription** = "tài khoản con" cho một plan + region cụ thể.
- **Database** = instance Redis logic. Mỗi database có endpoint + port + password **riêng**.
- Một subscription có thể chứa nhiều database (bị giới hạn theo plan).

**Free plan**: 1 subscription, 1 database, 30 MB memory, không backup, không SLA — đủ để học toàn bộ khoá này.

## Bước 3 — Tạo Subscription

Sau khi đăng nhập, bạn sẽ thấy màn hình "No active subscriptions". Hoặc một welcome screen với nút **+ New subscription**.

1. Nhấn **New subscription**.
2. Chọn **Fixed plans** (hoặc trên UI mới có thể là **Essentials**) → có nhãn **Free 30MB**.
3. Chọn **Cloud vendor**: AWS / GCP / Azure. Chọn cái gần location của bạn nhất.
   - Ở Việt Nam, thường chọn **AWS, region `ap-southeast-1` (Singapore)** để latency thấp.
4. Đặt tên subscription, ví dụ `free-sub`.
5. Nhấn **Create subscription**.

> **Lưu ý**: free plan đôi khi không có sẵn ở mọi region. Nếu không thấy free option ở region mong muốn, đổi sang region khác.

## Bước 4 — Tạo Database

Sau khi subscription tạo xong:

1. Chọn subscription vừa tạo → nhấn **+ New database** (hoặc **Add database**).
2. Đặt tên database, ví dụ `learn-redis-db`.
3. Có thể bỏ qua hầu hết tuỳ chọn nâng cao (modules, eviction policy...) — để mặc định cho free tier.
4. Nhấn **Activate database** (góc trên phải).

Database trạng thái sẽ là "Pending" với icon vàng. Đợi ~30 giây đến vài phút để chuyển sang "Active" (icon xanh).

## Bước 5 — Lấy thông tin kết nối

Khi database đã Active, click vào tên nó để mở trang chi tiết. Bạn cần **4 thông tin**:

| Thông tin | Tìm ở | Ví dụ |
|---|---|---|
| **Public endpoint** | Tab Configuration → mục Public endpoint | `redis-12345.c14.us-east-1-2.ec2.cloud.redislabs.com:12345` |
| **Host** | Phần trước dấu `:` của endpoint | `redis-12345.c14.us-east-1-2.ec2.cloud.redislabs.com` |
| **Port** | Phần sau dấu `:` | `12345` |
| **Password** | Tab Configuration → Security → Default user password (nhấn show/copy) | `aB3xYz...` (chuỗi 32+ ký tự) |
| Username | Mặc định trống hoặc `default` | (có thể bỏ trống) |

**Quan trọng**:
- Lưu password vào nơi an toàn (password manager). Nó hiển thị một lần dạng masked, có thể regenerate nếu mất.
- Endpoint khác nhau cho mỗi database — không phải `localhost:6379`.

## Bước 6 — Test kết nối đầu tiên

Cách nhanh nhất: dùng `redis-cli` (có sẵn nếu bạn đã cài Redis local hoặc qua Docker).

### Test bằng redis-cli

```bash
redis-cli -h redis-12345.c14.us-east-1-2.ec2.cloud.redislabs.com \
          -p 12345 \
          -a 'aB3xYz...'

# Sau khi connect, gõ:
PING
# → PONG

SET hello "world"
# → OK

GET hello
# → "world"

INFO server
# → in nhiều dòng info về server
```

Nếu bạn không có `redis-cli`, tạm dùng Docker:

```bash
docker run -it --rm redis:7-alpine \
  redis-cli -h <host> -p <port> -a '<password>'
```

### Test bằng RedisInsight (GUI chính chủ)

1. Tải [RedisInsight](https://redis.io/insight/) — bản desktop hoặc Docker.
2. Mở app → **Add Redis Database** → **Connect to a Redis Database**.
3. Nhập:
   - **Host**: endpoint không có port
   - **Port**: số port
   - **Username**: trống hoặc `default`
   - **Password**: password vừa lấy
   - **Database alias**: tên hiển thị (vd "Redis Cloud Learn")
4. Nhấn **Test Connection** → thấy success → **Add Redis Database**.

RedisInsight cho phép:
- Browser keys (xem mọi key, type, TTL, value).
- Workbench (gõ lệnh + xem help).
- Profiler (monitor lệnh real-time).
- Memory Analysis.
- Slow Log.

### Test bằng Bock Cloud Notebook (option theo transcript)

Khoá Stephen Greiner giới thiệu công cụ web **Bock Cloud Notebook**: trình duyệt-based notebook giống Jupyter để gõ lệnh Redis. Phần này không phổ biến ngoài khoá đó nên không bắt buộc — RedisInsight hoặc redis-cli là đủ.

## Bước 7 — Xác minh ta thấy gì trong dashboard

Trong Redis Cloud Console, mở database → tab **Metrics**:

- Ops/sec
- Total memory used
- Connected clients
- Network in/out

Chạy vài lệnh `SET`/`GET` từ máy local → trong dashboard sẽ thấy ops/sec nhảy lên. Đây là cách xác nhận lệnh thực sự đi tới cloud.

## Bảo mật cho database cloud

Mặc dù free tier hơi đơn giản, vẫn nên tập quen với:

1. **Đừng paste password vào chat/Slack công khai** — coi như AWS keys.
2. **IP allowlist** (có ở plan trả phí): chỉ cho phép kết nối từ IP cụ thể.
3. **TLS / SSL**: bật khi có (plan trả phí cho phép); free tier có thể dùng plain TCP.
4. **Regenerate password** ngay khi nghi ngờ lộ.

## Sự cố hay gặp

| Lỗi | Nguyên nhân thường gặp | Khắc phục |
|---|---|---|
| `Connection refused` | Sai port hoặc firewall chặn | Kiểm tra lại endpoint:port, thử `telnet host port` |
| `WRONGPASS invalid username-password pair` | Password sai hoặc thừa khoảng trắng khi paste | Copy password lại, paste vào trình text editor để loại space/newline |
| `MOVED` hoặc `ASK` redirect | Database là Cluster mode nhưng client không hỗ trợ | Dùng client có cluster support, hoặc tạo database mode standalone |
| `OOM command not allowed` | Database đầy 30 MB | Xoá bớt key, hoặc nâng plan |
| Timeout cao bất thường | Region xa | Chọn lại region gần hơn khi tạo mới |
| `NOAUTH Authentication required` | Quên gửi AUTH | Thêm `-a 'password'` vào redis-cli, hoặc cấu hình password trong client library |

## Tóm tắt bài 4

- Quy trình: Đăng ký → tạo Subscription (free) → tạo Database → lấy host/port/password → test connect.
- Mất ~5 phút, không cần card tín dụng cho free tier.
- Có 30 MB miễn phí, đủ học và làm exercise.
- Dùng `redis-cli` hoặc RedisInsight để thao tác với database.
- Lưu password an toàn, không commit lên git.

**Bài kế tiếp** → [Bài 5: Các công cụ tương tác với Redis (CLI, RedisInsight, client lib)](05-cong-cu-tuong-tac.md)
