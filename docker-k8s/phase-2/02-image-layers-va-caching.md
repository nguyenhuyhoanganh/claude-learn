# Bài 2: Image Layers & Caching

## Images là "Layer Stack"

Mỗi instruction trong Dockerfile tạo ra một **layer** riêng biệt. Image là tập hợp nhiều layers xếp chồng lên nhau.

```text
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

```text
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

```text
COPY package.json .   → cache ✓ (không đổi)
RUN npm install       → cache ✓ (không đổi)
COPY . .              → rebuild (code thay đổi)
CMD [...]             → rebuild
```

---

## Container Layer

Khi bạn start container từ image, Docker thêm một **thin writable layer** lên trên tất cả image layers:

```text
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

### Sửa một file có sẵn trong image thì chuyện gì xảy ra

Câu hỏi hay: image layer là **chỉ đọc**, vậy tại sao trong container tôi vẫn `vi` sửa được file của image?

Câu trả lời là cơ chế **sao chép khi ghi** (copy-on-write):

```text
   BAN ĐẦU — file config.json nằm ở layer 4 (chỉ đọc)

   ┌─ Container layer (ghi được) ──────────────┐
   │  (rỗng)                                    │
   ├─ Layer 4 ─────────────────────────────────┤
   │  /app/config.json   {"env":"production"}   │  ← bạn ĐỌC được file này
   └────────────────────────────────────────────┘


   BẠN GHI:  echo '{"env":"dev"}' > /app/config.json

   BƯỚC 1 — Docker CHÉP file từ layer chỉ đọc lên container layer
   BƯỚC 2 — ghi đè lên BẢN CHÉP, không đụng bản gốc

   ┌─ Container layer (ghi được) ──────────────┐
   │  /app/config.json   {"env":"dev"}          │  ← bản chép, ĐÈ lên bản dưới
   ├─ Layer 4 ─────────────────────────────────┤
   │  /app/config.json   {"env":"production"}   │  ← VẪN NGUYÊN, bị che khuất
   └────────────────────────────────────────────┘
```

Kiểm chứng bằng hai container từ **cùng một image**:

```bash
docker run -d --name c1 alpine sleep 300
docker run -d --name c2 alpine sleep 300

docker exec c1 sh -c "echo 'c1 da sua' > /etc/hostname-note"
docker exec c1 cat /etc/hostname-note
```

```text
c1 da sua
```

```bash
# Container thứ hai KHÔNG hề thấy thay đổi
docker exec c2 cat /etc/hostname-note
```

```text
cat: can't open '/etc/hostname-note': No such file or directory
```

```bash
docker rm -f c1 c2
```

Ba hệ quả thực tế:

| Hệ quả | Ý nghĩa |
|---|---|
| Ghi file lớn trong container **chậm hơn** ghi ở máy thật | Vì lần ghi đầu phải chép cả file lên container layer. Với file vài GB thì rất rõ |
| Xoá file của image **không giảm dung lượng** | Nó chỉ được đánh dấu "đã xoá" ở container layer; bản gốc vẫn nằm ở image |
| Nhiều container dùng chung image **không nhân đôi dung lượng** | Image layer được chia sẻ; mỗi container chỉ tốn phần nó ghi thêm |

Dòng cuối là lý do chạy 50 container từ cùng một image 300 MB **không tốn 15 GB** — nó tốn khoảng 300 MB cộng phần ghi thêm của từng container.

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

Xem gọn hơn:

```bash
docker image inspect myapp --format '{{range .RootFS.Layers}}{{println .}}{{end}}'
```

```text
sha256:5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef
sha256:8f4c1e8a5b7c4d2e9f3a1b6c8d7e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e
sha256:a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2
```

### Layer được chia sẻ giữa các image — điều làm Docker tiết kiệm

Đây là lý do tải image thứ hai luôn nhanh hơn image đầu tiên:

```bash
docker pull node:18-alpine
docker pull nginx:alpine
```

```text
Lần 1 (node:18-alpine):
  3f4a2b1c: Pull complete       ← lớp nền alpine, 3.4 MB
  8e7d6c5b: Pull complete       ← node runtime, 45 MB

Lần 2 (nginx:alpine):
  3f4a2b1c: Already exists      ← DÙNG LẠI, không tải lại
  9a8b7c6d: Pull complete       ← nginx, 2.1 MB
```

Cùng một `sha256` nghĩa là **cùng một lớp vật lý trên đĩa**, dùng chung. Kiểm tra bằng:

```bash
docker system df -v | head -20
```

Đây cũng là lý do khuyên **cả đội dùng chung một base image**: mười dịch vụ cùng `FROM node:18-alpine` chỉ tốn một bản lớp nền trên máy chủ, thay vì mười bản.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `COPY . .` đặt trước `RUN npm install` | Sửa một dấu chấm phẩy cũng làm cài lại toàn bộ thư viện | `COPY package.json` → `RUN install` → `COPY . .` |
| `RUN apt-get install ...` rồi `RUN rm -rf /var/lib/apt/lists/*` ở **hai lệnh RUN riêng** | **Image KHÔNG nhỏ đi** — file đã nằm ở lớp trước | Gộp vào **một** `RUN ... && rm -rf ...` |
| Tưởng xoá file ở lớp sau là xoá khỏi image | Dữ liệu (kể cả **bí mật**) vẫn nằm trong lớp cũ, `docker history` đọc ra được | Dùng multi-stage build, hoặc BuildKit secret mount |
| Ghi file lớn vào container rồi thắc mắc sao chậm | Cơ chế sao chép khi ghi phải chép cả file lên lớp mới | Dùng volume cho dữ liệu lớn |
| Sửa file trong container bằng `docker exec` rồi coi là xong | Xoá container là mất hết | Sửa vào Dockerfile |
| Đặt `ARG`/`ENV` hay đổi lên **đầu** Dockerfile | Đổi biến là **mất cache toàn bộ** phía sau | Đặt xuống càng thấp càng tốt |
| Chạy `docker build` mà quên `.dockerignore` | `node_modules` và `.git` bị gửi vào build context → build chậm, image phình | Luôn có `.dockerignore` |
| Dùng nhiều base image khác nhau cho các dịch vụ | Không chia sẻ được lớp nền, tốn đĩa và băng thông | Thống nhất một base image cho cả đội |

Bẫy thứ hai đáng xem tận mắt vì nó phản trực giác:

```dockerfile
# SAI — image vẫn to
RUN apt-get update && apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*        ← lớp MỚI, không xoá được lớp cũ

# ĐÚNG — gộp một lệnh, file tạm không bao giờ vào lớp nào
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
```

```bash
docker history sai-cach  | head -3    # thấy lớp RUN rm chiếm 0B, lớp install vẫn ~40MB
docker history dung-cach | head -3    # chỉ một lớp, đã trừ phần dọn
```

Quy tắc rút ra: **lớp chỉ cộng thêm, không bao giờ trừ đi.** Muốn thứ gì không có trong image thì nó phải **không bao giờ tồn tại trong lớp nào**, chứ không phải bị xoá sau.

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

## Tóm tắt bài 2

- **Mỗi instruction trong Dockerfile tạo một lớp**, và các lớp xếp chồng chỉ đọc. Xem bằng `docker history`.
- Docker **lưu đệm từng lớp**. Một lớp đổi thì **mọi lớp phía sau phải làm lại** — nên thứ hay đổi phải nằm càng dưới càng tốt.
- Container chỉ thêm **một lớp mỏng ghi được** lên trên. Xoá container là mất lớp đó.
- **Sao chép khi ghi**: sửa file của image thì Docker **chép file lên lớp container rồi mới sửa**. Bản gốc vẫn nguyên, và container khác không thấy thay đổi. Hệ quả: ghi file lớn thì chậm, nhưng nhiều container dùng chung image thì **không nhân đôi dung lượng**.
- **Lớp chỉ cộng thêm, không bao giờ trừ đi.** `RUN rm` ở lệnh sau **không làm image nhỏ đi**, và bí mật đã ghi vào lớp thì `docker history` đọc lại được. Phải gộp vào **một** lệnh `RUN`, hoặc dùng multi-stage build.
- **Lớp được chia sẻ giữa các image** theo `sha256`. Đó là lý do image thứ hai tải nhanh hơn, và là lý do cả đội nên dùng chung một base image.
- Image là **chỉ đọc**: sửa code sau khi build thì phải build lại. Muốn thấy ngay khi dev thì dùng bind mount ([Phase 3](../phase-3/03-bind-mounts-va-dev-workflow.md)).

---

**Bài kế tiếp** → [Bài 3: Quản lý Containers](03-quan-ly-containers.md)
