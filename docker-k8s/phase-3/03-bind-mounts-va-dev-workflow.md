# Bài 3: Bind Mounts & Development Workflow

## Bind Mount là gì?

Bind Mount **map một thư mục cụ thể trên host** vào bên trong container. Thay đổi ở host ngay lập tức có mặt trong container và ngược lại.

```text
Host: /home/user/myapp/src/   ←──── hai chiều ────→  Container: /app/src/
     (bạn edit ở đây)                                  (container đọc từ đây)
```

---

## Tại sao Bind Mount là game-changer cho Development?

**Vấn đề với workflow không dùng Bind Mount:**

```text
Sửa code → docker build → docker run → Test → Sửa code → docker build → ...
           (30-60 giây)                                   (30-60 giây)
```

**Với Bind Mount:**

```text
docker run (1 lần) → Sửa code → Test ngay (0 giây delay) → Sửa code → Test ngay → ...
```

Code thay đổi được phản ánh ngay trong container vì container đọc trực tiếp từ host filesystem.

---

## Cú pháp Bind Mount

```bash
# -v <absolute_host_path>:<container_path>
docker run -v /absolute/path/on/host:/container/path myapp

# macOS/Linux — dùng $(pwd) để lấy thư mục hiện tại
docker run -v $(pwd):/app myapp

# Windows PowerShell
docker run -v ${PWD}:/app myapp

# Windows Command Prompt
docker run -v %cd%:/app myapp
```

### Ba quy tắc cú pháp hay làm người mới vấp

**Một — đường dẫn máy thật phải là đường dẫn tuyệt đối.**

```bash
docker run -v ./src:/app myapp        # ✗ Docker HIỂU NHẦM "./src" là TÊN VOLUME
docker run -v $(pwd)/src:/app myapp   # ✓
```

Đây là bẫy khó chịu vì Docker **không báo lỗi**. Nó lặng lẽ tạo một named volume tên `./src` (hoặc từ chối vì tên không hợp lệ, tuỳ phiên bản), và bạn ngồi thắc mắc sao thư mục trong container rỗng.

> Riêng trong `docker-compose.yml` thì **đường dẫn tương đối lại hợp lệ** — Compose tự đổi thành tuyệt đối dựa trên vị trí file YAML. Chính sự khác nhau này làm nhiều người nhầm khi chuyển từ Compose sang `docker run`.

**Hai — cú pháp `--mount` rõ ràng hơn `-v`.**

```bash
# -v: ngắn, nhưng ba thứ khác nhau viết gần giống nhau
-v /host/path:/app      # bind mount
-v myvolume:/app        # named volume
-v /app                 # anonymous volume

# --mount: dài hơn nhưng KHÔNG THỂ nhầm
--mount type=bind,source="$(pwd)",target=/app
--mount type=volume,source=myvolume,target=/app
```

Khác biệt quan trọng về hành vi: nếu đường dẫn máy thật **không tồn tại**, `-v` sẽ **tự tạo một thư mục rỗng**, còn `--mount` **báo lỗi ngay**. Với dev thì `-v` tiện; với script tự động thì `--mount` an toàn hơn nhiều vì lỗi lộ ra sớm.

**Ba — trên Linux có vấn đề quyền sở hữu file.**

```bash
docker run -v $(pwd):/app node:18 sh -c "touch /app/file-moi.txt"
ls -la file-moi.txt
```

```text
-rw-r--r-- 1 root root 0 Aug  9 10:23 file-moi.txt
              ▲▲▲▲
     File do container tạo thuộc về ROOT
     → user thường trên máy bạn KHÔNG sửa/xoá được
```

Cách chữa: chạy container bằng đúng user của bạn.

```bash
docker run -u $(id -u):$(id -g) -v $(pwd):/app node:18 sh -c "touch /app/file-moi.txt"
```

Vấn đề này **không xảy ra trên macOS/Windows** vì lớp chia sẻ file của Docker Desktop tự ánh xạ quyền. Đó là lý do một dự án chạy êm trên máy Mac của bạn lại sinh ra hàng loạt file thuộc root trên máy Linux của đồng nghiệp.

---

## Ví dụ thực tế: Node.js Development Setup

### Dockerfile (không thay đổi so với production)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Chạy container với Bind Mount

```bash
docker run -d \
  -p 3000:80 \
  --name myapp-dev \
  -v $(pwd):/app \                    # Bind mount source code
  -v /app/node_modules \              # Protect node_modules bằng anonymous volume
  myapp
```

**Giải thích:**
- `-v $(pwd):/app`: Mount thư mục project vào `/app` trong container
- `-v /app/node_modules`: Anonymous volume "bảo vệ" node_modules khỏi bị override

### Thứ tự ưu tiên (longer path wins)

```text
/app           → từ bind mount (host directory)
/app/node_modules → từ anonymous volume (được bảo vệ)

Docker ưu tiên path dài hơn (specific hơn)
→ /app/node_modules không bị ghi đè bởi bind mount
```

---

## Nodemon — Hot Reload cho Node.js

Dù code thay đổi tức thì có mặt trong container, Node.js server vẫn phải restart để đọc code mới.

**Giải pháp: Nodemon** — tự động restart Node.js khi file thay đổi.

```bash
npm install nodemon --save-dev
```

### package.json

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

### Dockerfile cho Development

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install            # Cài cả devDependencies (nodemon)
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]  # Dùng nodemon cho dev
```

```bash
# Chạy dev container
docker run -d \
  -p 3000:80 \
  --name myapp-dev \
  -v $(pwd):/app \
  -v /app/node_modules \
  myapp-dev

# Giờ sửa code → nodemon tự restart Node.js → thấy thay đổi ngay!
```

---

## Read-Only Bind Mounts

Đôi khi bạn muốn container chỉ đọc code, không ghi lại:

```bash
# Thêm :ro (read-only) vào cuối
docker run -v $(pwd):/app:ro myapp

# Nếu container cố ghi vào /app → permission error
```

**Kết hợp read-only bind mount với named volume:**

```bash
docker run \
  -v $(pwd):/app:ro \              # Code: read-only
  -v /app/node_modules \           # node_modules: anonymous volume (writable)
  -v feedback:/app/feedback \      # Data: named volume (writable)
  myapp
```

---

## Docker Compose cho Development (Preview)

Thay vì gõ lệnh dài dòng, dùng `docker-compose.yml`:

```yaml
# docker-compose.yml
version: "3"
services:
  app:
    build: .
    ports:
      - "3000:80"
    volumes:
      - ./:/app          # bind mount
      - /app/node_modules   # anonymous volume
    environment:
      - NODE_ENV=development
```

```bash
docker-compose up
```

(Docker Compose sẽ được học chi tiết ở phase-6)

---

## So sánh: Bind Mount vs Named Volume

| | Bind Mount | Named Volume |
|---|---|---|
| Quản lý bởi | Bạn (filesystem host) | Docker |
| Vị trí | Path bạn chỉ định | `/var/lib/docker/volumes/` |
| Truy cập trực tiếp | Có (mở bằng IDE, Explorer) | Khó (cần container hoặc inspect) |
| Sync hai chiều | Có | Không (chỉ container ghi) |
| Use case chính | **Development** (hot reload) | **Production** (persist data) |
| Performance | Hơi chậm hơn trên macOS | Nhanh hơn |

---

## Workflow thực tế: Dev vs Production

### Development

```bash
# Dockerfile.dev
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install          # Cài cả devDependencies
CMD ["npm", "run", "dev"]  # nodemon

# Run
docker run -v $(pwd):/app -v /app/node_modules myapp-dev
```

### Production

```bash
# Dockerfile (default)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]

# Run
docker run -v feedback:/app/feedback myapp
```

---

## Tóm tắt

```text
Bind Mount (-v /host/path:/container/path):
├── Host path → Container path (hai chiều)
├── Dùng $(pwd) để map thư mục project
├── Thêm :ro để read-only
├── Phải dùng anonymous volume để protect node_modules
└── IDEAL cho development, không dùng production

Kết hợp tối ưu cho dev:
docker run \
  -v $(pwd):/app \              # bind mount code
  -v /app/node_modules \        # protect node_modules
  -v feedback:/app/feedback \   # persist user data
  myapp
```

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng đường dẫn **tương đối** với `docker run -v` | Thư mục trong container rỗng, không báo lỗi | Dùng `$(pwd)/...`. (Trong Compose thì tương đối lại hợp lệ) |
| Quên anonymous volume cho `node_modules` | `Cannot find module 'express'` dù đã `npm install` lúc build | Thêm `-v /app/node_modules` |
| **Hot reload không chạy trên máy Windows/WSL** | Sửa file mà nodemon im lặng | Cơ chế theo dõi file không lan qua ranh giới hệ thống file. Thêm `--legacy-watching` (nodemon) hoặc `CHOKIDAR_USEPOLLING=true` |
| File do container tạo thuộc về `root` (trên Linux) | Không sửa/xoá được file trên máy mình | `docker run -u $(id -u):$(id -g)` |
| Bind mount **rất chậm trên macOS** | `npm install` mất vài phút thay vì vài giây | Bản chất của lớp chia sẻ file trong máy ảo. Dùng anonymous volume cho `node_modules`, hoặc thêm `:delegated` |
| Dùng bind mount ở **production** | Server phải có sẵn đúng thư mục code — mất hết ý nghĩa của image | `COPY` code vào image |
| Bind mount đè lên thư mục có sẵn của image | Thư mục đó **biến mất hoàn toàn** trong container | Đây là hành vi cố ý — dùng anonymous volume để che ngược lại |
| Quên `:ro` cho thư mục chỉ cần đọc | Container ghi bậy vào code trên máy bạn | Thêm `:ro` |
| Trên RHEL/CentOS có SELinux, bind mount báo `Permission denied` | Container không đọc được file dù quyền đúng | Thêm hậu tố `:z` (chia sẻ) hoặc `:Z` (riêng) |

Hai dòng đáng nói kỹ.

**Hot reload không chạy** là câu hỏi hay gặp nhất khi dev trên Windows. Nguyên nhân: nodemon dựa vào việc hệ điều hành **báo có file thay đổi**, nhưng thông báo đó không đi qua được ranh giới giữa Windows và máy ảo Linux. Cách chữa là bảo nó **tự hỏi lại theo chu kỳ** thay vì chờ được báo:

```json
{
  "scripts": {
    "dev": "nodemon --legacy-watch server.js"
  }
}
```

**Vì sao bind mount đè lên thư mục của image** — hiểu điều này thì hết thắc mắc về `node_modules`:

```text
   Image có:  /app/server.js, /app/package.json, /app/node_modules/  (đầy đủ)

   docker run -v $(pwd):/app
        │
        ▼
   Thư mục /app trong container giờ CHÍNH LÀ thư mục trên máy bạn.
   Máy bạn KHÔNG có node_modules (vì bị .gitignore, hoặc chưa cài).
        │
        ▼
   → /app/node_modules TRONG CONTAINER cũng KHÔNG CÓ
   → Cannot find module 'express'

   Thêm -v /app/node_modules (anonymous volume)
        │
        ▼
   Đường dẫn DÀI HƠN thắng → node_modules của image được giữ lại,
   không bị bind mount che.
```

---

**Bài kế tiếp** → [Bài 4: Environment Variables & Build Arguments](04-env-variables-va-build-args.md)
