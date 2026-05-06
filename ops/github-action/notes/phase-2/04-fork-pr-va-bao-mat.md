# Bài 4: Pull Request từ Fork — Điều cần biết

## Vấn đề đặc biệt với forked repositories

Khi repository của bạn là **public**, bất kỳ ai cũng có thể:
1. Fork repository của bạn
2. Sửa code trong fork của họ
3. Mở Pull Request về repository gốc của bạn

Nếu workflow chạy tự động với **mọi PR**, điều này tạo ra rủi ro:
- Người lạ có thể spam workflow runs → tốn quota (nếu có trả phí)
- Workflow độc hại có thể truy cập secrets của bạn

---

## Hành vi mặc định của GitHub Actions

> **Khi PR đến từ fork lần đầu tiên → workflow KHÔNG tự chạy.**

Thay vào đó, bạn (chủ repository) sẽ thấy thông báo:
```
"This workflow requires approval before running."
```

Bạn phải **approve thủ công** trước khi workflow chạy.

---

## Quy tắc cụ thể

| Người mở PR | Lần đầu | Lần sau |
|---|---|---|
| Collaborator (được bạn add) | Tự động chạy | Tự động chạy |
| Fork từ người lạ, lần đầu | **Cần approve** | Tự động chạy |
| Fork từ người lạ, đã approve trước | Tự động chạy | Tự động chạy |

Sau khi bạn approve PR đầu tiên của một người, các PR tiếp theo từ người đó sẽ tự chạy workflow.

---

## Tại sao lại có cơ chế này?

GitHub bảo vệ bạn vì:
1. Ai cũng fork public repo được → dễ tạo workflow run giả
2. Workflow có thể đọc secrets → nguy cơ lộ thông tin nhạy cảm
3. Nếu trả phí → tốn tiền không đáng

---

## Cách approve workflow từ fork

1. Vào tab **Actions** của repository
2. Click vào workflow run đang chờ (hiển thị icon ⚠️)
3. Click **"Approve and run"**

---

## Lưu ý khi nhìn vào PR từ fork

Luôn xem qua code thay đổi **trước khi approve**. Workflow chạy với code của PR đó — nếu code chứa lệnh độc hại, nó sẽ được thực thi trên runner của bạn.

> Phần bảo mật chi tiết hơn sẽ được đề cập trong phần nâng cao của khoá học. Ở đây chỉ cần biết cơ chế này tồn tại và vì sao.

---

## Tóm tắt

```
Repository public
    ↓
Người lạ fork + mở PR
    ↓
GitHub: "Cần approve!"
    ↓
Bạn xem xét code
    ↓
Approve → workflow chạy
```

---

**Tiếp theo:** Huỷ và bỏ qua workflow run →
