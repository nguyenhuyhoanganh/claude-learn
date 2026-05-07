# Bài 3: Matrix Jobs — Chạy Job với Nhiều Cấu hình

## Matrix là gì?

Matrix cho phép bạn **chạy cùng một job nhiều lần** với các giá trị cấu hình khác nhau. GitHub Actions tự tạo ra tổ hợp và chạy chúng song song.

**Ví dụ thực tế:** Test ứng dụng trên nhiều phiên bản Node.js và nhiều hệ điều hành cùng lúc.

---

## Cú pháp cơ bản

```yaml
jobs:
  build:
    runs-on: ${{ matrix.operating-system }}     # ← dùng giá trị từ matrix
    strategy:
      matrix:
        node-version: [14, 16, 18]
        operating-system: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}    # ← dùng giá trị từ matrix
      - run: npm ci
      - run: npm run build
```

Với cấu hình trên, GitHub Actions tạo ra **6 jobs song song**:
- ubuntu + node 14
- ubuntu + node 16
- ubuntu + node 18
- windows + node 14
- windows + node 16
- windows + node 18

Key `matrix.operating-system` và `matrix.node-version` là tên do bạn tự đặt — có thể là bất kỳ chuỗi nào.

---

## `include` — Thêm tổ hợp đơn lẻ

`include` là key đặc biệt (không phải do bạn đặt) để thêm tổ hợp cụ thể mà không tạo ra các tổ hợp mới từ toàn bộ matrix:

```yaml
strategy:
  matrix:
    node-version: [14, 16]
    operating-system: [ubuntu-latest, windows-latest]
    include:
      - node-version: 18
        operating-system: ubuntu-latest    # chỉ thêm đúng 1 tổ hợp này
```

Nếu thêm `18` vào mảng `node-version`, bạn sẽ có thêm cả `windows + 18`. Với `include`, chỉ thêm đúng `ubuntu + 18`.

---

## `exclude` — Loại bỏ tổ hợp cụ thể

```yaml
strategy:
  matrix:
    node-version: [14, 16, 18]
    operating-system: [ubuntu-latest, windows-latest]
    exclude:
      - node-version: 14
        operating-system: windows-latest   # bỏ tổ hợp này
```

---

## Hành vi khi có job thất bại trong matrix

Mặc định: nếu **một job trong matrix fail**, GitHub Actions **hủy toàn bộ** các jobs còn lại trong matrix.

Để tiếp tục chạy các jobs khác dù có một vài thất bại:

```yaml
jobs:
  build:
    strategy:
      matrix:
        node-version: [12, 14, 16]
      fail-fast: false           # ← thêm dòng này để không hủy khi có fail
    ...
```

> `fail-fast: false` khác với `continue-on-error: true` — cái trên kiểm soát **toàn bộ matrix**, cái sau kiểm soát từng **step** trong job.

Hoặc dùng `continue-on-error: true` trên cấp job để jobs khác trong matrix tiếp tục dù một job fail:

```yaml
jobs:
  build:
    continue-on-error: true      # ← job-level, áp dụng cho cả matrix
    strategy:
      matrix:
        node-version: [12, 14, 16]
```

---

## Ví dụ thực tế: Test trên nhiều môi trường

```yaml
name: Cross-platform Tests

on: push

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [16, 18]
        exclude:
          - os: macos-latest
            node: 16             # bỏ macos + node 16 để tiết kiệm thời gian
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
```

Kết quả: 5 jobs song song (3×2 - 1 excluded).

---

## Tóm tắt

| Tính năng | Mô tả |
|---|---|
| `strategy.matrix` | Khai báo các key và mảng giá trị |
| `matrix.<key>` | Dùng giá trị trong job/step |
| `include` | Thêm tổ hợp đơn lẻ |
| `exclude` | Loại bỏ tổ hợp cụ thể |
| `fail-fast: false` | Không hủy matrix khi có job fail |

---

**Tiếp theo:** Reusable Workflows — Tái sử dụng workflow trong workflow khác →
