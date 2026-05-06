# Bài 5: Huỷ và Bỏ qua Workflow

## Huỷ workflow đang chạy

### Tự động huỷ

Mặc định, nếu một **step thất bại** → job dừng lại → workflow bị huỷ. Các jobs phụ thuộc (qua `needs`) sẽ không chạy.

### Huỷ thủ công

Đôi khi bạn muốn dừng workflow đang chạy vì biết nó sẽ fail hoặc vì đã push nhầm:

1. Vào tab **Actions**
2. Click vào workflow run đang chạy (icon 🟡)
3. Click **"Cancel workflow"**

**Khi nào nên huỷ thủ công?**
- Phát hiện lỗi ngay sau khi push, không muốn đợi workflow chạy đến khi fail
- Workflow có bước tốn thời gian (build, deploy) mà bạn biết sẽ sai
- Tránh tốn quota nếu đang dùng gói trả phí

---

## Bỏ qua workflow (skip)

Đôi khi bạn push một commit nhỏ (sửa typo, thêm comment) và biết rằng không cần chạy CI/CD. Thay vì để workflow chạy rồi cancel, bạn có thể **bỏ qua ngay từ đầu**.

### Cách bỏ qua

Thêm một trong các annotation sau vào **commit message**:

```bash
git commit -m "Fix typo in README [skip ci]"
git commit -m "Fix typo in README [ci skip]"
git commit -m "Fix typo in README [no ci]"
git commit -m "Fix typo in README [skip actions]"
git commit -m "Fix typo in README [actions skip]"
```

GitHub Actions sẽ nhận ra annotation này và **không kích hoạt** workflow, dù event (`push`) đã xảy ra.

---

## Ví dụ thực tế

```bash
# Chỉ sửa comment trong code, không cần chạy test
git commit -m "Add inline comments for clarity [skip ci]"
git push
# → Không có workflow run nào được tạo
```

---

## Lưu ý

- Annotation phải nằm trong **commit message** (không phải PR description)
- Chỉ hoạt động với event `push` và `pull_request`
- Annotation trong commit message của **bất kỳ commit nào** trong push cũng có tác dụng (không chỉ commit cuối)

---

## Tóm tắt Phase 2

Bạn đã học cách kiểm soát khi nào workflow chạy:

✅ **Events**: Danh sách sự kiện có thể trigger workflow  
✅ **Activity Types**: Chọn chính xác loại hành động của event (opened, closed, synchronize...)  
✅ **Branches filter**: Chỉ trigger khi target đúng branch  
✅ **Paths filter**: Chỉ trigger khi đúng file thay đổi  
✅ **Fork PR**: Hiểu vì sao PR từ fork không tự chạy và cách approve  
✅ **Cancel**: Huỷ workflow thủ công  
✅ **Skip CI**: Bỏ qua workflow bằng commit message  

---

**Phase 3:** Làm việc với dữ liệu — Artifacts, Outputs, Caching →
