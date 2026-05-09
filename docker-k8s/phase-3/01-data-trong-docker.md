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

```
Đặc điểm:
- Source code, node_modules, compiled files
- Được COPY vào image khi build
- Read-only, bất biến trong image

Giải pháp: Lưu trong Image layers (mặc định)
```

### Loại 2: Temporary Data

```
Đặc điểm:
- Data sinh ra khi app chạy (cache, session tạm thời)
- Không cần persist khi container stop
- Không cần share với host

Giải pháp: Container layer (mặc định) — tự mất khi container xóa
```

### Loại 3: Permanent Data

```
Đặc điểm:
- User uploads, database files, log files
- PHẢI persist khi container stop/restart/remove
- Có thể cần share giữa containers

Giải pháp: Volumes (Named) hoặc Bind Mounts
```

---

## Minh họa vấn đề thực tế

Ứng dụng Node.js cho phép user submit "goals" — mỗi goal được lưu vào file JSON:

```
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

---

## Sơ đồ tổng quan giải pháp

```
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

---

**Tiếp theo:** Anonymous Volumes và Named Volumes — cách dùng và khi nào dùng →
