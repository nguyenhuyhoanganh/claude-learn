# Bài 2: Upload và Download Artifact thực tế

## Workflow đầy đủ: Build → Upload → Deploy (có Download)

```yaml
name: Deploy Website

on:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Get code
        uses: actions/checkout@v3

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build            # sinh ra thư mục dist/

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: dist-files            # tên định danh (tự đặt)
          path: dist                  # thư mục cần upload

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Get build artifact
        uses: actions/download-artifact@v3
        with:
          name: dist-files            # phải khớp với tên đã upload

      - name: List files (để verify)
        run: ls -la

      - name: Deploy
        run: echo "Deploying dist files..."
```

---

## Upload Artifact — Chi tiết

```yaml
- uses: actions/upload-artifact@v3
  with:
    name: dist-files       # tên để sau này dùng khi download
    path: dist             # đường dẫn file/thư mục cần lưu
```

### Upload nhiều path

Dùng ký tự `|` (pipe):

```yaml
- uses: actions/upload-artifact@v3
  with:
    name: my-artifact
    path: |
      dist
      package.json
      logs/test-results.txt
```

### Upload file theo pattern

```yaml
path: |
  dist/**
  !dist/**/*.map        # loại trừ source map files
```

---

## Download Artifact — Chi tiết

```yaml
- uses: actions/download-artifact@v3
  with:
    name: dist-files      # tên artifact đã upload
```

### Quan trọng: Cấu trúc sau khi download

Sau khi download, các file **không** nằm trong thư mục con mà **trực tiếp** trong thư mục làm việc hiện tại:

```
Upload:   dist/ → { index.html, assets/main.js, assets/style.css }

Download: thư mục làm việc sẽ có:
          index.html
          assets/
            main.js
            style.css
```

Thư mục `dist/` **không được tái tạo**. File bên trong nó được extract trực tiếp ra.

---

## Tải artifact thủ công

Sau khi workflow chạy xong, vào trang workflow run trên GitHub:
1. Cuộn xuống phần **Artifacts**
2. Click vào tên artifact để tải về dưới dạng `.zip`

Hữu ích để: kiểm tra kết quả build, lấy file để upload thủ công, debug.

---

## Điều kiện để download hoạt động

`download-artifact` phải chạy **sau** `upload-artifact`. Đảm bảo bằng `needs`:

```yaml
deploy:
  needs: build    # ← phải có dòng này, nếu không download sẽ fail
```

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| Artifact not found | Tên không khớp | Kiểm tra `name` ở upload và download phải giống nhau |
| File không tồn tại | Path sai hoặc build chưa sinh file | Kiểm tra lại step build |
| Download trước upload | Thiếu `needs` | Thêm `needs: build` vào job deploy |

---

**Tiếp theo:** Job Outputs — Truyền giá trị đơn giản giữa các jobs →
