# Bài 2: Image Layers & Caching

## Images là "Layer Stack"

Mỗi instruction trong Dockerfile tạo ra một **layer** riêng biệt. Image là tập hợp nhiều layers xếp chồng lên nhau.

```
Layer 6: CMD ["node", "server.js"]        ← instruction của bạn
Layer 5: COPY . .                          ← instruction của bạn
Layer 4: RUN npm install                   ← instruction của bạn
Layer 3: COPY package.json .               ← instruction của bạn
Layer 2: WORKDIR /app                      ← instruction của bạn
Layer 1: FROM node:14                      ← layers từ node image
Layer 0: (Alpine Linux OS layer)           ← layers từ node image
```

---

## Docker Build Cache — Tốc độ build thần kỳ

Khi build image, Docker **cache kết quả của mỗi layer**. Lần build tiếp theo, nếu một layer không thay đổi, Docker **tái sử dụng từ cache** thay vì chạy lại.

```bash
# Lần 1: build từ đầu
docker build -t myapp .
# Output:
# Step 1/6 : FROM node:14        → Downloading...
# Step 2/6 : WORKDIR /app        → Running...
# Step 3/6 : COPY package.json . → Running...
# Step 4/6 : RUN npm install     → Running... (chậm)
# Step 5/6 : COPY . .            → Running...
# Step 6/6 : CMD ["node",...]    → Running...

# Lần 2: không thay đổi gì
docker build -t myapp .
# Output:
# Step 1/6 : FROM node:14        → Using cache
# Step 2/6 : WORKDIR /app        → Using cache
# Step 3/6 : COPY package.json . → Using cache
# Step 4/6 : RUN npm install     → Using cache
# Step 5/6 : COPY . .            → Using cache
# Step 6/6 : CMD ["node",...]    → Using cache
# Finished in 0.3 seconds!
```

### Quy tắc cache invalidation

**Khi một layer thay đổi → tất cả layers sau đó bị rebuild**

```
Layer 3: COPY package.json .    → Không đổi  ✓ cache
Layer 4: RUN npm install        → Không đổi  ✓ cache
Layer 5: COPY . .               → FILE THAY ĐỔI → rebuild này và tất cả sau
Layer 6: CMD ["node",...]       → Bắt buộc rebuild (vì layer trên rebuild)
```

---

## Tối ưu thứ tự layers

### Vấn đề: Dockerfile kém hiệu quả

```dockerfile
FROM node:14
WORKDIR /app
COPY . .               # ← copy TẤT CẢ (bao gồm source code)
RUN npm install        # ← npm install sau khi copy source
EXPOSE 80
CMD ["node", "server.js"]
```

**Vấn đề:** Mỗi lần code thay đổi (dù nhỏ), COPY layer bị invalidate → npm install chạy lại dù `package.json` không đổi.

### Giải pháp: Tách COPY thành 2 bước

```dockerfile
FROM node:14
WORKDIR /app

# Bước 1: Copy CHỈ package.json trước
COPY package.json .

# Bước 2: npm install (layer này chỉ rebuild khi package.json thay đổi)
RUN npm install

# Bước 3: Copy source code (layer này rebuild mỗi khi code thay đổi)
COPY . .

EXPOSE 80
CMD ["node", "server.js"]
```

**Kết quả:** Khi bạn thay đổi `server.js`, chỉ `COPY . .` và `CMD` bị rebuild. `npm install` vẫn được dùng từ cache → **nhanh hơn nhiều**.

```
COPY package.json .   → cache ✓ (không đổi)
RUN npm install       → cache ✓ (không đổi)
COPY . .              → rebuild (code thay đổi)
CMD [...]             → rebuild
```

---

## Container Layer

Khi bạn start container từ image, Docker thêm một **thin writable layer** lên trên tất cả image layers:

```
┌─────────────────────────────────┐
│  Container Layer (writable)     │  ← files được tạo/sửa trong container
├─────────────────────────────────┤
│  Image Layer 6: CMD             │  ← read-only
│  Image Layer 5: COPY . .        │  ← read-only
│  Image Layer 4: RUN npm install │  ← read-only
│  Image Layer 3: COPY package.json│ ← read-only
│  Image Layer 2: WORKDIR /app    │  ← read-only
│  Image Layer 1: node:14 base    │  ← read-only
└─────────────────────────────────┘
```

- **Image layers**: Read-only, được chia sẻ bởi nhiều containers
- **Container layer**: Write-only, chỉ tồn tại khi container đang chạy

Khi container bị xóa → container layer biến mất → mọi file được tạo trong container mất theo. Đây là lý do cần **Volumes** (sẽ học ở phase-3).

---

## Images là Read-Only — Hệ quả quan trọng

```bash
# 1. Build image với code hiện tại
docker build -t myapp .

# 2. Sửa server.js — thêm feature mới

# 3. Run container → KHÔNG thấy thay đổi!
docker run -p 3000:80 myapp
# Vì code trong image đã được "đóng băng" khi build
```

**Bắt buộc phải rebuild image để cập nhật code:**

```bash
docker build -t myapp .          # Build lại image mới
docker run -p 3000:80 myapp      # Chạy container với image mới
```

> **Giải pháp tốt hơn cho dev:** Dùng **Bind Mounts** (phase-3) để mount code từ host vào container, code thay đổi tức thì mà không cần rebuild.

---

## Kiểm tra layers của Image

```bash
# Xem thông tin chi tiết về image (bao gồm layers)
docker image inspect myapp

# Output JSON chứa: config, layers, OS, tạo lúc nào, v.v.
# Trường "RootFS.Layers" liệt kê tất cả layer hashes
```

---

## Tóm tắt

| Khái niệm | Chi tiết |
|---|---|
| Image layer | Mỗi instruction trong Dockerfile = 1 layer |
| Layer cache | Docker cache kết quả mỗi layer, tái sử dụng khi rebuild |
| Cache invalidation | Một layer thay đổi → tất cả layers sau rebuild |
| Tối ưu thứ tự | Đặt layers hay thay đổi xuống cuối, layers ít thay đổi lên đầu |
| Container layer | Layer ghi được mỏng, tồn tại khi container chạy |
| Image read-only | Phải rebuild image để cập nhật code |

**Rule of thumb cho Dockerfile:**
1. `FROM` — base image
2. `WORKDIR` — ít thay đổi nhất, đặt sớm
3. `COPY` chỉ file config (package.json) — thay đổi ít
4. `RUN` install dependencies — tận dụng cache từ bước 3
5. `COPY` source code — thay đổi thường xuyên
6. `EXPOSE` và `CMD` — cuối cùng

---

**Tiếp theo:** Quản lý Containers — stop, start, logs, interactive mode →
