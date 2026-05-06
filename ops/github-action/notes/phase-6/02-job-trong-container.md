# Bài 2: Chạy Job trong Container

## Thêm `container` key vào job

Để chạy tất cả steps của một job trong container, thêm key `container` vào job đó:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest      # ← vẫn cần runner để host container
    container:
      image: node:16            # ← tên image từ Docker Hub
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
```

Khi workflow chạy:
1. GitHub khởi động runner Ubuntu
2. Runner tải Docker image `node:16`
3. Runner tạo container từ image đó
4. Tất cả steps thực thi **bên trong container**

---

## Cú pháp ngắn vs đầy đủ

```yaml
# Cú pháp ngắn (chỉ tên image)
container: node:16

# Cú pháp đầy đủ (cần thêm cấu hình)
container:
  image: node:16
  env:
    SOME_VAR: value_for_image    # biến môi trường cho image (không phải cho steps)
```

`env` trong `container:` là dành cho cấu hình của **image**, không phải cho các steps. Biến môi trường cho steps vẫn dùng `env:` cấp job hoặc step như bình thường.

---

## Ví dụ thực tế: Test với Node.js cụ thể

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:18-alpine      # Alpine Linux nhẹ hơn, có Node.js 18
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
```

---

## Log khi job chạy trong container

Trong log của GitHub Actions, bạn sẽ thấy các bước khởi tạo container:

```
Initialize containers
  ✓ Pulling image: node:16
  ✓ Starting container
  ✓ Container started
Run tests
  ...
Post job cleanup
  ✓ Stopping containers
```

---

## Lưu ý

- `runs-on` vẫn cần thiết — đây là runner **host** container, không thể bỏ
- Có thể dùng image từ **Docker Hub** hoặc **bất kỳ registry nào** (AWS ECR, GitHub Container Registry...)
- Chỉ image chạy trên **Linux** mới được hỗ trợ (Windows containers chưa hỗ trợ trong GitHub Actions)
- GitHub Actions (`uses: ...`) vẫn hoạt động trong container — GitHub đảm bảo tương thích

---

**Tiếp theo:** Service Containers — Chạy database hoặc service phụ bên cạnh job →
