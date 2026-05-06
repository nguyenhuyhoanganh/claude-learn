# Bài 2: Dùng Actions An toàn

## Rủi ro từ Third-party Actions

Actions có thể thực thi **bất kỳ code nào** — tương tự cài npm package, bạn phải tin tưởng người viết nó. Một action độc hại có thể:
- Đọc và gửi secrets ra ngoài
- Thay đổi code trong repository
- Xóa issues, PR, hoặc thay đổi cài đặt repository

GitHub **không kiểm duyệt** actions khi publish lên Marketplace.

---

## Mức độ tin cậy từ thấp đến cao

### 1. Actions do bạn tự viết ✅ (an toàn nhất)
Bạn kiểm soát hoàn toàn. Không rủi ro từ bên ngoài.

### 2. Actions từ tác giả đã được verify ✅ (tin cậy cao)

Trong Marketplace, tác giả verified có badge ✓ màu xanh bên cạnh tên. GitHub đã xác minh danh tính và uy tín của tác giả. Không đảm bảo 100% nhưng đáng tin cậy.

Ví dụ verified: `actions/checkout`, `actions/setup-node` (by GitHub), `aws-actions/configure-aws-credentials` (by AWS).

### 3. Actions từ cộng đồng (chưa verify) ⚠️ (cần kiểm tra)

Trước khi dùng, hãy:
- Xem repository của action — có code rõ ràng không?
- Kiểm tra số stars, forks, ngày cập nhật gần nhất
- Đọc code `action.yml` và file logic chính
- Xem issues và PR — có báo cáo lạ không?

### 4. Cho phép tất cả actions ⚠️ (rủi ro cao nhất)
Ai cũng có thể dùng bất kỳ action nào — bao gồm cả action độc hại mới publish.

---

## Ghim version bằng commit SHA

Thay vì dùng version tag như `@v3` (có thể bị thay đổi):

```yaml
# ⚠️ Tag có thể bị đổi nội dung
- uses: actions/checkout@v3

# ✅ SHA không thể thay đổi — an toàn hơn
- uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
```

Tags như `v3` là mutable — tác giả hoặc kẻ tấn công (nếu chiếm được account) có thể push code mới vào tag cũ. SHA là immutable.

---

## Giới hạn actions được phép dùng trong repository

Vào **Settings → Actions → General → Actions permissions**:

| Tùy chọn | Ý nghĩa |
|---|---|
| Disable actions | Tắt hoàn toàn, không dùng actions |
| Allow only my own | Chỉ actions từ account của bạn |
| Allow verified creators | Actions từ tác giả verified |
| Allow all | Tất cả — rủi ro nhất |

Còn có tùy chọn cho phép actions từ một danh sách repo cụ thể.

---

## Kiểm soát Fork PR

Vào **Settings → Actions → General → Fork pull request workflows**:

- **Require approval for first-time contributors** (mặc định an toàn)
- **Require approval for all outside collaborators** (an toàn nhất, nhưng chậm hơn)

PR từ fork có thể thay đổi file workflow — approve trước khi chạy là cần thiết.

---

**Tiếp theo:** Permissions và GITHUB_TOKEN →
