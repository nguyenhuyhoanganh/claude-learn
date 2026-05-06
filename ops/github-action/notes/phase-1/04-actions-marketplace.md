# Bài 4: Dùng Actions từ Marketplace

## Action là gì?

Bên cạnh lệnh shell tự viết, bạn có thể dùng **Action** — những script được đóng gói sẵn để thực hiện các tác vụ phổ biến.

> **Phân biệt tên gọi:** "GitHub Actions" (viết hoa) là tên của tính năng. "action" (viết thường) là một script tái sử dụng trong marketplace.

**Ví dụ:** Thay vì tự viết lệnh `git clone` để lấy code về runner, bạn dùng action `actions/checkout` có sẵn — nhanh hơn, ổn định hơn.

---

## Cách dùng Action

Thay `run` bằng `uses`:

```yaml
steps:
  - name: Get the code
    uses: actions/checkout@v3   # tên-action@phiên-bản
```

### Tại sao phải ghim phiên bản (`@v3`)?

Action có thể được cập nhật và thay đổi theo thời gian. Nếu không ghim version, workflow của bạn có thể bị break khi action được cập nhật. Luôn thêm `@v3`, `@v4`... để đảm bảo workflow chạy ổn định.

---

## Cấu hình thêm cho Action (từ khoá `with`)

Một số action cần cấu hình thêm:

```yaml
steps:
  - name: Setup Node.js
    uses: actions/setup-node@v3
    with:
      node-version: 18    # cấu hình phiên bản Node.js
```

`with` là nơi bạn truyền các tham số cho action. Mỗi action có bộ tham số riêng — xem tài liệu của action đó để biết cần truyền gì.

---

## Hai Action quan trọng nhất

### 1. `actions/checkout` — Lấy code về runner

Đây là action **gần như bắt buộc** trong mọi workflow. Vì runner là máy trắng, không có code của bạn. Phải dùng action này để download code từ repository về.

```yaml
- name: Get code
  uses: actions/checkout@v3
```

> Mặc định sẽ lấy code của repository đang gắn workflow này. Không cần cấu hình thêm trong hầu hết trường hợp.

### 2. `actions/setup-node` — Cài Node.js

Runner `ubuntu-latest` đã có sẵn Node.js, nhưng nếu bạn muốn một phiên bản cụ thể:

```yaml
- name: Setup Node.js v18
  uses: actions/setup-node@v3
  with:
    node-version: 18
```

---

## Tìm Action trên Marketplace

Truy cập: **github.com/marketplace?type=actions**

Hoặc trực tiếp từ trang Actions tab → **New workflow** → GitHub sẽ gợi ý action phù hợp.

**Tiêu chí chọn action an toàn:**
- Badge "Verified creator" (đặc biệt tin tưởng nếu là của GitHub team)
- Số lượt dùng cao
- Được cập nhật gần đây

---

## Tóm tắt: `run` vs `uses`

| | `run` | `uses` |
|---|---|---|
| Dùng khi | Tác vụ đơn giản, tự viết lệnh | Tác vụ phức tạp, dùng lại |
| Ví dụ | `echo`, `npm install`, `npm test` | `checkout`, `setup-node` |
| Cú pháp | `run: lệnh shell` | `uses: owner/action@version` |

---

**Tiếp theo:** Ví dụ thực tế — CI workflow cho dự án Node.js →
