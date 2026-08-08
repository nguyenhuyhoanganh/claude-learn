# Bài 1: Data trong Docker — Ba loại và vấn đề cần giải quyết

## Vấn đề cốt lõi: Container là ephemeral

Container **không lưu giữ state** bên trong mình — khi container bị xóa, mọi data bên trong cũng mất theo.

```bash
# Giả sử container của bạn ghi user uploads vào /app/uploads
docker run -d myapp

# User upload file → file lưu tại /app/uploads trong container
# ...

# Bạn stop và remove container
docker stop myapp && docker rm myapp

# Tạo lại container mới
docker run -d myapp
# ⚠ /app/uploads trống! Tất cả uploads đã mất!
```

Đây là behavior cố ý — container được thiết kế để stateless. Nhưng nhiều ứng dụng cần persist data. Docker giải quyết điều này qua **Volumes** và **Bind Mounts**.

---

## Ba loại Data trong Docker App

### Loại 1: Application Data (Code + Dependencies)

```text
Đặc điểm:
- Source code, node_modules, compiled files
- Được COPY vào image khi build
- Read-only, bất biến trong image

Giải pháp: Lưu trong Image layers (mặc định)
```

### Loại 2: Temporary Data

```text
Đặc điểm:
- Data sinh ra khi app chạy (cache, session tạm thời)
- Không cần persist khi container stop
- Không cần share với host

Giải pháp: Container layer (mặc định) — tự mất khi container xóa
```

### Loại 3: Permanent Data

```text
Đặc điểm:
- User uploads, database files, log files
- PHẢI persist khi container stop/restart/remove
- Có thể cần share giữa containers

Giải pháp: Volumes (Named) hoặc Bind Mounts
```

---

## Minh họa vấn đề thực tế

Ứng dụng Node.js cho phép user submit "goals" — mỗi goal được lưu vào file JSON:

```text
Container đang chạy:
├── /app/server.js        (code — từ image)
├── /app/node_modules/    (deps — từ image)
└── /app/feedback/        (user data — container layer)
    └── goal.txt          ← ĐÂY là data cần persist!
```

Khi container bị remove:
```bash
docker stop myapp && docker rm myapp

# /app/feedback/goal.txt → MẤT VĨNH VIỄN
```

Khi container mới được tạo:
```bash
docker run myapp
# /app/feedback/ → TRỐNG
```

### Tự tay chứng kiến dữ liệu biến mất

Ba mươi giây, và bạn sẽ không bao giờ quên bài học này.

```bash
# BƯỚC 1 — tạo container, ghi một file vào đó
docker run -d --name thu-mat-du-lieu alpine sleep 600
docker exec thu-mat-du-lieu sh -c "echo 'du lieu quan trong' > /data.txt"
docker exec thu-mat-du-lieu cat /data.txt
```

```text
du lieu quan trong
```

```bash
# BƯỚC 2 — DỪNG container. Dữ liệu có mất không?
docker stop thu-mat-du-lieu
docker start thu-mat-du-lieu
docker exec thu-mat-du-lieu cat /data.txt
```

```text
du lieu quan trong          ← VẪN CÒN
```

Đây là điểm mà nhiều người hiểu sai: **dừng container KHÔNG mất dữ liệu**. Lớp ghi vẫn nằm trên đĩa.

```bash
# BƯỚC 3 — XOÁ container rồi tạo lại từ CÙNG image
docker rm -f thu-mat-du-lieu
docker run -d --name thu-mat-du-lieu alpine sleep 600
docker exec thu-mat-du-lieu cat /data.txt
```

```text
cat: can't open '/data.txt': No such file or directory
                 ▲
        MẤT VĨNH VIỄN — không có cách nào lấy lại
```

```bash
docker rm -f thu-mat-du-lieu
```

Ranh giới chính xác cần nhớ:

```text
   docker stop / start / restart   →  DỮ LIỆU CÒN
                                       (lớp ghi của container vẫn tồn tại)

   docker rm                       →  DỮ LIỆU MẤT
                                       (lớp ghi bị xoá cùng container)
```

Và đây là lý do câu chuyện nghiêm trọng hơn bạn tưởng: ở production, **container bị xoá và tạo lại là chuyện hằng ngày** — mỗi lần deploy, mỗi lần scale, mỗi lần máy chủ khởi động lại, mỗi lần Kubernetes chuyển Pod sang node khác. Không phải "nếu", mà là "bao lâu một lần".

---

## Sơ đồ tổng quan giải pháp

```text
┌─────────────────────────────────────────────────────────┐
│                    Docker Storage                        │
│                                                          │
│  Volumes                     Bind Mounts                 │
│  ┌──────────────────┐        ┌──────────────────┐       │
│  │  Named Volume    │        │  Host Directory  │       │
│  │  Docker quản lý  │        │  Bạn quản lý     │       │
│  │  /var/lib/docker │◀──────▶│  ~/myproject/    │       │
│  │  /volumes/...    │        │  data/           │       │
│  └──────────────────┘        └──────────────────┘       │
│         ↕                             ↕                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Container                           │    │
│  │  /app/feedback ←→ Volume or Bind Mount           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Ba loại Mount trong Docker

| Loại | Quản lý bởi | Vị trí | Use case chính |
|---|---|---|---|
| **Named Volume** | Docker | `/var/lib/docker/volumes/` | Persist production data |
| **Anonymous Volume** | Docker | Auto-generated path | Protect container subdirs |
| **Bind Mount** | Bạn (người dùng) | Bất kỳ path nào trên host | Development (hot reload) |

---

## Tóm tắt

- Container **không persist data** theo mặc định → data mất khi container bị xóa
- Ba loại data: Application (image), Temporary (container layer), Permanent (cần giải pháp)
- Docker cung cấp **Volumes** (Docker quản lý) và **Bind Mounts** (bạn quản lý) để persist data
- Việc hiểu loại data nào cần gì là bước đầu tiên để thiết kế storage đúng
- Ranh giới chính xác: **`docker stop` KHÔNG mất dữ liệu, `docker rm` thì MẤT**. Ở production, việc xoá và tạo lại container là chuyện hằng ngày — mỗi lần deploy, mỗi lần scale.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Tưởng dừng container là mất dữ liệu | Lo lắng không cần thiết | `stop` giữ nguyên, `rm` mới mất |
| Tưởng dữ liệu tự an toàn vì container "vẫn chạy" | Deploy lần sau là mất sạch | Bất cứ thứ gì cần giữ đều phải nằm ngoài lớp container |
| Chạy database production **không có volume** | Mất toàn bộ dữ liệu khi container tạo lại | Named volume, hoặc database quản lý sẵn |
| Ghi log vào file bên trong container | Mất log đúng lúc cần điều tra nhất | Ghi ra stdout — xem [Phase 20 bài 1](../phase-20/01-log-va-event.md) |
| Dùng `docker commit` để "lưu" dữ liệu | Tạo image khổng lồ và không ai tái lập được | Dùng volume |
| Nhầm "dữ liệu ứng dụng" với "dữ liệu người dùng" | Đóng gói nhầm chỗ | Code vào **image**, dữ liệu người dùng vào **volume** |

---

**Bài kế tiếp** → [Bài 2: Volumes — Anonymous và Named](02-volumes-anonymous-va-named.md)
