# Bài 1: Utility Containers là gì và Tại sao Cần?

## Application Containers vs Utility Containers

**Application Containers** (những gì ta đã học):
- Chứa app + environment
- Chạy app khi start: node server, React dev server, MongoDB...
- Chạy liên tục cho đến khi bị stop

**Utility Containers** (khái niệm mới):
- Chỉ chứa **environment** (Node, PHP, Composer...)
- **Không** start app khi run
- Chạy một **lệnh cụ thể** do người dùng chỉ định, xong thì dừng

```text
Application Container:
  docker run node-app
  → Chạy server → Tiếp tục chạy đến khi stop

Utility Container:
  docker run node-util npm init
  → Chạy "npm init" → Xong → Dừng
```

---

## Vấn đề Utility Containers Giải Quyết

### Ví dụ: Tạo Node.js project mới

Để tạo project mới, cần chạy `npm init`. Nhưng `npm` chỉ có nếu cài Node.js.

```text
❌ Cách truyền thống:
   1. Vào nodejs.org
   2. Download và cài Node.js
   3. npm init
   4. Bắt đầu code

✅ Với Utility Container:
   docker run -it -v $(pwd):/app node npm init
   → Chạy npm init TRONG container
   → Kết quả xuất hiện trên host machine (via bind mount)
   → Không cần cài Node.js trên máy!
```

### Ví dụ thực tế hơn: Laravel/PHP

Để setup Laravel cần cài: PHP, Composer, nhiều PHP extensions, MySQL client...
Với Docker: chỉ cần container có Composer, chạy `composer create-project laravel/laravel`.

---

## Utility Containers = Không Install Tools trên Host Machine

Đây là triết lý cốt lõi:

```text
Truyền thống:                    Với Docker:
┌─────────────────────┐          ┌─────────────────────┐
│  Host Machine       │          │  Host Machine       │
│  ├── Node.js        │          │  ├── Docker only    │
│  ├── npm            │          │  └── Your code      │
│  ├── PHP            │          └─────────────────────┘
│  ├── Composer       │
│  ├── Python         │          ┌─────────────────────┐
│  ├── pip            │          │  Containers         │
│  └── Your code      │          │  ├── node-util      │
└─────────────────────┘          │  ├── php-util       │
                                  │  └── python-util    │
Mỗi project khác version         └─────────────────────┘
→ Xung đột, khó quản lý          Mỗi container isolated
```

---

## Khi nào dùng Utility Containers?

```text
1. Khởi tạo project (npm init, composer create-project)
   → Cần tools nhưng chưa có project

2. Cài dependencies (npm install, pip install)
   → Có thể dùng container để chạy lệnh

3. Chạy migrations/scripts (artisan migrate, rails db:migrate)
   → Cần environment nhưng không cần app chạy liên tục

4. Một lần dùng tools (convert file, generate code...)
   → Không muốn cài tool mãi mãi trên máy
```

---

## Cấu trúc cơ bản

```text
Project folder/
├── Dockerfile          ← Custom utility image (có ENTRYPOINT)
├── docker-compose.yml  ← Config utility container
└── (project files)     ← Được tạo bởi utility container qua bind mount
```

Bind mount là chìa khóa: commands chạy trong container nhưng tác động lên host machine folder.

---

## Khi nào utility container ĐÁNG dùng, khi nào không

Kỹ thuật này nghe hay nhưng không phải lúc nào cũng đáng. Bảng dưới đây giúp quyết định:

| Tình huống | Đáng dùng? | Vì sao |
|---|---|---|
| Cần **một phiên bản cụ thể** của công cụ mà máy đang có bản khác | **Rất đáng** | Không phải cài đè, không phá môi trường đang có |
| Nhiều dự án cần **nhiều phiên bản khác nhau** của cùng công cụ | **Rất đáng** | Node 14 cho dự án cũ, Node 22 cho dự án mới, không xung đột |
| Chạy trong **CI/CD** | **Rất đáng** | Máy chạy CI không cần cài gì ngoài Docker |
| Onboard người mới vào dự án | **Đáng** | `git clone` rồi chạy, không cần danh sách cài đặt dài |
| Công cụ dùng **hằng ngày, mọi dự án** (git, ripgrep) | **Không** | Cài thẳng nhanh hơn nhiều, gõ ít hơn |
| Công cụ cần **rất nhanh**, chạy hàng trăm lần một ngày | **Không** | Mỗi lần khởi động container tốn vài trăm mili giây |
| Công cụ cần truy cập nhiều thứ trên máy (SSH key, cấu hình cá nhân) | **Cân nhắc** | Phải gắn thêm nhiều thứ, mất dần lợi ích |

Nói thẳng: **utility container không phải để thay thế mọi công cụ trên máy bạn.** Nó giải đúng một bài toán — *"tôi cần chạy công cụ X phiên bản Y mà không muốn nó dính vào máy tôi"*. Ngoài phạm vi đó thì cài thẳng thường hợp lý hơn.

### Cái giá phải trả

```text
   1. GÕ NHIỀU HƠN
      npm init                                    (3 từ)
      docker run -it -v $(pwd):/app node-util npm init    (9 từ)
      → chữa bằng alias hoặc docker compose run

   2. CHẬM HƠN
      Mỗi lệnh phải khởi động container: +200-500 ms
      → không đáng kể với npm install, rất khó chịu với lệnh chạy liên tục

   3. VẤN ĐỀ QUYỀN FILE (chỉ trên Linux)
      File do container tạo thuộc về root → bạn không sửa được
      → xem phần dưới

   4. MẤT NGỮ CẢNH CỦA MÁY
      Container không có SSH key, không có cấu hình git của bạn
      → lệnh cần chúng sẽ hỏng
```

### Vấn đề quyền file trên Linux — và cách chữa

Đây là vấn đề lớn nhất khi dùng utility container trên Linux:

```bash
docker run -it -v $(pwd):/app -w /app node:18 npm init -y
ls -la package.json
```

```text
-rw-r--r-- 1 root root 234 Aug  9 10:15 package.json
              ▲▲▲▲
   File thuộc về root — trình soạn thảo của bạn không lưu được
```

Cách chữa: chạy container bằng đúng user của bạn.

```bash
docker run -it -u $(id -u):$(id -g) -v $(pwd):/app -w /app node:18 npm init -y
ls -la package.json
```

```text
-rw-r--r-- 1 hoanganh hoanganh 234 Aug  9 10:16 package.json
              ▲▲▲▲▲▲▲▲
                  Đúng chủ sở hữu
```

Trong `docker-compose.yml`:

```yaml
services:
  npm:
    build: .
    user: "${UID:-1000}:${GID:-1000}"
    volumes:
      - ./:/app
```

```bash
# Cần export trước khi chạy, vì UID/GID không tự có trong môi trường shell
export UID=$(id -u) GID=$(id -g)
docker compose run --rm npm install
```

Vấn đề này **không xảy ra trên macOS/Windows** — lớp chia sẻ file của Docker Desktop tự ánh xạ quyền. Đó là lý do bạn có thể không gặp nó cho tới khi đồng nghiệp dùng Linux báo lỗi.

---

## Tóm tắt bài 1

- **Application container** chạy ứng dụng liên tục; **utility container** chạy một lệnh rồi thoát.
- Nó giải đúng một bài toán: **"chạy công cụ X phiên bản Y mà không cài lên máy"**. Ngoài phạm vi đó thì cài thẳng thường hợp lý hơn.
- Đáng dùng nhất cho: **nhiều phiên bản công cụ song song**, **CI/CD**, và **onboard người mới**.
- Bốn cái giá: **gõ nhiều hơn**, **chậm hơn ~200–500 ms mỗi lệnh**, **vấn đề quyền file trên Linux**, và **mất ngữ cảnh máy** (SSH key, cấu hình git).
- Trên Linux, file do container tạo **thuộc về root**. Chữa bằng **`-u $(id -u):$(id -g)`**. Lỗi này không xuất hiện trên macOS nên rất dễ bỏ sót.
- **Bind mount là chìa khoá** — lệnh chạy trong container nhưng kết quả nằm trên máy bạn.

---

**Bài kế tiếp** → [Bài 2: Các Cách Chạy Lệnh trong Containers](02-chay-lenh-trong-containers.md)
