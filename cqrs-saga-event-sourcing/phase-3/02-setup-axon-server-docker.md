# Bài 2: Dựng Axon Server local bằng Docker

Axon Server là thành phần hạ tầng cung cấp event store + routing. Trước khi viết một dòng business logic, ta cần một Axon Server chạy local. Bài này dựng nó bằng Docker, cấu hình volume để **không mất data qua restart**, và làm quen dashboard. Trong dự án thật DevOps lo việc này; ở đây ta tự dựng để học.

> **Mẹo**: các bước setup Axon Server có thể đổi theo phiên bản. Trong khóa gốc, giảng viên ghi các bước trong README của repo (`section3`). Bài này tóm tắt phiên bản ổn định; nếu Axon ra bản mới, đối chiếu README chính thức.

## Bước 1: Tạo cấu trúc thư mục

Tạo một thư mục `axonserver` (khuyến nghị đặt ở Desktop) với **ba** thư mục con:

```text
axonserver/
├── config/   ← chứa file cấu hình axonserver.properties
├── data/     ← Axon Server lưu data nội bộ ở đây
└── events/   ← Axon Server lưu các EVENT (event store) ở đây
```

Ba thư mục này sẽ được **mount** vào container (bước 3) để data sống sót qua restart/xóa container.

## Bước 2: File cấu hình axonserver.properties

Trong `config/`, tạo file đúng tên `axonserver.properties` (Axon Server tìm đúng tên này) với 4 dòng:

```properties
server.port=8024
axoniq.axonserver.name=EazyBank Axon Server
axoniq.axonserver.hostname=localhost
axoniq.axonserver.devmode.enabled=true
```

| Property | Ý nghĩa |
|---|---|
| `server.port=8024` | Cổng HTTP của dashboard. Đây là property kiểu Spring Boot (vì Axon Server cũng xây trên Spring Boot) — nên **không** có prefix `axoniq` |
| `axoniq.axonserver.name` | Tên hiển thị cho server. Các property riêng của Axon luôn bắt đầu bằng prefix `axoniq` |
| `axoniq.axonserver.hostname=localhost` | Host — ta chạy local |
| `axoniq.axonserver.devmode.enabled=true` | **Bật dev mode** — bắt buộc khi học. Tắt thì server coi là môi trường production và đòi nhiều chuẩn setup production |

## Bước 3: Lệnh Docker khởi chạy

```bash
docker run -d --name axonserver \
  -p 8024:8024 \
  -p 8124:8124 \
  -v /path/to/axonserver/data:/axonserver/data \
  -v /path/to/axonserver/events:/axonserver/events \
  -v /path/to/axonserver/config:/axonserver/config \
  axoniq/axonserver
```

Giải thích từng phần:

| Phần | Ý nghĩa |
|---|---|
| `-d` | Chạy **detached** (nền), không chiếm terminal |
| `--name axonserver` | Đặt tên container |
| `-p 8024:8024` | **Port HTTP** — truy cập dashboard |
| `-p 8124:8124` | **Port gRPC** — Axon Framework trong các microservice dùng cổng này để giao tiếp với server |
| `-v ...data`, `-v ...events`, `-v ...config` | **Volume**: mount thư mục local vào container |
| `axoniq/axonserver` | Tên Docker image |

> **Vì sao cần volume?** Volume mount thư mục local vào container. Nhờ đó, **data/event server ghi vẫn nằm trên ổ cứng của bạn** — xóa hay restart container **không mất** gì; container mới đọc lại data từ thư mục local. Hai cổng vì Axon Server mở **8024 (HTTP, dashboard)** và **8124 (gRPC, cho ứng dụng kết nối)**.

```text
   Local máy bạn                         Docker container
   axonserver/data/   ◄──── volume ────►  /axonserver/data
   axonserver/events/ ◄──── volume ────►  /axonserver/events   (event store sống ở đây)
   axonserver/config/ ◄──── volume ────►  /axonserver/config   (axonserver.properties)
```

## Bước 4: Hoàn tất qua dashboard

Mở `http://localhost:8024` → dashboard Axon Server. Lần đầu, bạn phải:

1. Nhấn **Complete** (hoàn tất khởi tạo).
2. Chọn **Start standalone node** — chạy server như **một node đơn** trên local.

> Production có thể chạy **cluster nhiều node** (do DevOps lo). Local thì standalone node là đủ. **Bắt buộc** chọn standalone + Complete, nếu không microservice **không kết nối được** vào server.

Sau khi hoàn tất, dashboard hiện sẵn hai context `admin` và `default` (dùng nội bộ). Khi các microservice bắt đầu đăng ký, chúng cũng sẽ hiện ở đây.

## Tổng quan dashboard (sẽ dùng nhiều ở bài demo)

| Tab | Dùng để |
|---|---|
| **Overview** | Thấy các service đã kết nối (icon màu cam) |
| **Search** | Tra các event đã lưu trong event store (theo aggregate identifier, sequence number, payload) |
| **Commands** | Đếm/giám sát các command đã dispatch & xử lý |
| **Queries** | Đếm/giám sát các query đã chạy & số lỗi |
| **Monitoring** | Số liệu vận hành |

Ở các bài sau, sau khi gọi API, ta sẽ quay lại Search để **nhìn tận mắt** chuỗi event được lưu kiểu event sourcing.

## Bẫy thường gặp

| Bẫy | Hậu quả / cách tránh |
|---|---|
| Quên nhấn **Complete + standalone node** | Microservice không kết nối được server |
| Sai tên file `axonserver.properties` | Server bỏ qua config, không nhận cổng/tên bạn đặt |
| Quên mở **8124** | Service kết nối thất bại (8024 chỉ là dashboard) |
| Không mount volume | Mất sạch event mỗi lần restart/xóa container |
| Muốn reset sạch để test lại | Xóa container + xóa nội dung thư mục `data/` và `events/` (KHÔNG xóa `config/`) |

## Tóm tắt bài 2

- Tạo `axonserver/` với 3 thư mục con: `config`, `data`, `events`.
- `config/axonserver.properties`: 4 property (`server.port=8024`, name, hostname, `devmode.enabled=true`).
- `docker run` mở **8024 (HTTP/dashboard)** + **8124 (gRPC)**, mount 3 volume để giữ data qua restart.
- Mở `localhost:8024` → Complete → **Start standalone node**.
- Dashboard có Search/Commands/Queries — công cụ quan sát chính ở các bài demo.

**Bài kế tiếp** → [Bài 3: Thêm Axon dependencies và cấu hình microservice](03-them-axon-dependencies-cau-hinh.md)
