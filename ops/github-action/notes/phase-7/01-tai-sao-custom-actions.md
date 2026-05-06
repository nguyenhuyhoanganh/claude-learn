# Bài 1: Tại sao cần Custom Actions?

## Actions là gì (nhắc lại)

Actions là các đoạn logic được đóng gói thành một bước có thể tái sử dụng. Bạn đã dùng chúng suốt khoá học:
- `actions/checkout@v3` — lấy code từ repository
- `actions/cache@v3` — cache dependencies
- `actions/upload-artifact@v3` — upload file

Những actions này đều do người khác viết. Nhưng bạn cũng có thể **tự viết**.

---

## Lý do viết Custom Actions

### 1. Gom nhóm steps lặp lại

Nếu bạn có 3 jobs và mỗi job đều có 2-3 bước giống hệt nhau:

```yaml
# Lặp trong lint, test, build...
- uses: actions/checkout@v3
- uses: actions/cache@v3
  with:
    path: node_modules
    key: ...
- run: npm ci
  if: steps.cache.outputs.cache-hit != 'true'
```

Thay vì copy-paste, đóng gói thành một action `cached-deps` và dùng ở mọi nơi.

### 2. Không có action công khai nào làm đúng điều bạn cần

Marketplace có hàng nghìn actions, nhưng có thể không có cái nào xử lý đúng use case của bạn. Custom action cho phép bạn viết logic bất kỳ.

### 3. Muốn chia sẻ với cộng đồng

Bạn có thể publish action lên Marketplace để người khác dùng.

---

## 3 loại Custom Actions

| Loại | Ngôn ngữ | Khi nào dùng |
|---|---|---|
| **Composite** | YAML (giống workflow) | Gom nhóm nhiều steps — không cần biết lập trình |
| **JavaScript** | JavaScript (Node.js) | Cần logic phức tạp, biết JS |
| **Docker** | Bất kỳ ngôn ngữ nào | Không biết JS, cần môi trường tùy chỉnh |

---

## Lưu trữ Custom Actions ở đâu?

### Trong cùng repository (local action)

```
.github/
  actions/
    cached-deps/          ← action định nghĩa ở đây
      action.yml
  workflows/
    deploy.yml            ← workflow dùng action
```

Chỉ dùng được trong repository này.

### Trong repository riêng (standalone action)

Tạo repo riêng (ví dụ: `my-org/cached-deps`). Cấu trúc file nằm ở root của repo:

```
action.yml                ← phải ở root, không trong .github/
main.js                   ← code của action
...
```

Dùng được từ bất kỳ repo nào:
```yaml
uses: my-org/cached-deps@v1
```

---

## File `action.yml` — Bắt buộc

Dù là loại action nào, bạn **luôn phải** có file `action.yml` trong thư mục action. File này khai báo:
- Tên và mô tả action
- Inputs nhận vào
- Outputs trả ra
- Cách thực thi (composite / node16 / docker)

---

**Tiếp theo:** Composite Action — Loại action đơn giản nhất →
