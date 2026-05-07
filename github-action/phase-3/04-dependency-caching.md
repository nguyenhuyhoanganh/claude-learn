# Bài 4: Dependency Caching — Tăng tốc Workflow

## Vấn đề: Mỗi lần chạy đều phải `npm install` lại

Trong workflow điển hình với 3 jobs (lint → test → deploy), mỗi job đều phải:
1. Checkout code (~1 giây)
2. `npm ci` — tải dependencies (~10-15 giây)
3. Chạy task thực sự

`npm ci` chiếm phần lớn thời gian. Vì mỗi job chạy trên máy mới hoàn toàn, dependencies phải tải lại từ đầu mỗi lần.

**Giải pháp:** Cache thư mục npm để tái sử dụng.

---

## Cache hoạt động thế nào?

Lần đầu chạy:
1. `cache` action kiểm tra — không tìm thấy cache
2. `npm ci` chạy bình thường, tải dependencies
3. Sau khi job xong, `cache` action tự động lưu thư mục npm vào GitHub Storage

Lần sau chạy:
1. `cache` action kiểm tra — **tìm thấy cache**
2. Restore cache về runner (nhanh hơn nhiều)
3. `npm ci` chạy nhưng dùng file từ cache → không tải lại

---

## Cache key — Tên dùng để lưu và tìm cache

```yaml
key: deps-node-${{ hashFiles('**/package-lock.json') }}
```

`hashFiles()` là hàm của GitHub Actions, sinh ra hash dựa trên nội dung file. Khi `package-lock.json` thay đổi (thêm/xoá/update package) → hash thay đổi → cache key mới → cache cũ bị bỏ → `npm ci` tải lại.

**Logic đơn giản:**
- Dependencies không đổi → cache key giống nhau → dùng lại cache
- Dependencies có đổi → cache key khác → tải lại, tạo cache mới

---

## Thêm caching vào workflow

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Cache dependencies        # ← thêm bước này TRƯỚC npm ci
        uses: actions/cache@v3
        with:
          path: ~/.npm                  # thư mục npm cache trên Linux
          key: deps-node-${{ hashFiles('**/package-lock.json') }}

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

### Giải thích `path: ~/.npm`

Khi `npm ci` chạy, nó tải packages về thư mục cache của npm (`~/.npm` trên Linux). `cache` action sẽ lưu và restore chính thư mục này.

`npm ci` sẽ tự dùng thư mục đó nếu nó tồn tại → nhanh hơn nhiều so với tải từ registry.

---

## Workflow đầy đủ với caching

```yaml
name: Deploy Website

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: ~/.npm
          key: deps-node-${{ hashFiles('**/package-lock.json') }}

      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Cache dependencies        # ← lặp lại ở mỗi job
        uses: actions/cache@v3
        with:
          path: ~/.npm
          key: deps-node-${{ hashFiles('**/package-lock.json') }}

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-artifact@v3
        with:
          name: dist-files
          path: dist
```

---

## Vì sao phải thêm cache ở mỗi job?

Cache được lưu **tập trung** ở GitHub Storage — một nơi duy nhất. Cả hai jobs đều trỏ đến cùng cache key. Nhưng mỗi job phải tự restore cache về máy của nó (vì mỗi máy là riêng biệt).

Sau lần đầu job `test` chạy và lưu cache → job `build` sẽ tìm thấy cache đó và dùng ngay.

---

## Xem kết quả caching trong log

Khi cache **được tìm thấy**:
```
Cache restored from key: deps-node-abc123
```

Khi cache **không tìm thấy** (lần đầu hoặc key thay đổi):
```
Cache not found for key: deps-node-xyz789
```

Sau job, GitHub tự động cập nhật cache:
```
Post job cleanup: Cache saved with key: deps-node-xyz789
```

---

## Bảng so sánh thời gian

| Bước | Không cache | Có cache |
|---|---|---|
| Install dependencies | ~12 giây | ~3 giây |
| Tổng workflow (3 jobs) | ~60 giây | ~30 giây |

---

## Tóm tắt Phase 3

✅ **Artifact**: Lưu và chia sẻ file giữa jobs hoặc để tải thủ công  
✅ **upload-artifact**: Upload file từ runner lên GitHub với `name` và `path`  
✅ **download-artifact**: Download file đã upload về runner, dùng cùng `name`  
✅ **Job Output**: Chia sẻ giá trị text giữa jobs qua `$GITHUB_OUTPUT`  
✅ **Cache**: Tăng tốc bằng cách tái dùng thư mục dependencies qua `actions/cache`  

---

## Tổng kết 3 Phase

| Phase | Chủ đề | Học được gì |
|---|---|---|
| 1 | Nền tảng | Workflow, Jobs, Steps, Actions, YAML, CI cơ bản |
| 2 | Events | Trigger chi tiết, Activity Types, Filters, Skip CI |
| 3 | Dữ liệu | Artifacts, Outputs, Caching |

Sau 3 phase này bạn đã đủ nền tảng để viết workflow GitHub Actions thực tế cho hầu hết dự án.
