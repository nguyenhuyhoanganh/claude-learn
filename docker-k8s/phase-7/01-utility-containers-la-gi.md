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

```
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

```
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

```
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

```
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

```
Project folder/
├── Dockerfile          ← Custom utility image (có ENTRYPOINT)
├── docker-compose.yml  ← Config utility container
└── (project files)     ← Được tạo bởi utility container qua bind mount
```

Bind mount là chìa khóa: commands chạy trong container nhưng tác động lên host machine folder.

---

**Tiếp theo:** Các cách chạy lệnh trong containers →
