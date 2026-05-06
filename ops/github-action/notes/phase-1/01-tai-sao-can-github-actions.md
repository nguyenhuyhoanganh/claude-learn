# Bài 1: Tại sao cần GitHub Actions?

## Vấn đề thực tế

Khi phát triển phần mềm, team của bạn thường phải lặp đi lặp lại các tác vụ thủ công sau mỗi lần có code mới:

1. Kéo code mới về
2. Cài lại dependencies
3. Chạy test để kiểm tra code không bị lỗi
4. Build project
5. Deploy lên server

Nếu làm thủ công, bạn sẽ mất thời gian và dễ quên bước nào đó. GitHub Actions giúp **tự động hóa** toàn bộ quy trình này.

## GitHub Actions là gì?

GitHub Actions là một tính năng tích hợp sẵn trong GitHub, cho phép bạn định nghĩa các **quy trình tự động** (gọi là workflow) chạy ngay trên hạ tầng của GitHub — không cần server riêng.

**Ví dụ thực tế:** Mỗi khi bạn `git push` lên GitHub:
- GitHub Actions tự động chạy test
- Nếu test pass → tự động deploy lên server
- Nếu test fail → gửi thông báo, không deploy

## Giá và phạm vi sử dụng

| Repository | Miễn phí |
|---|---|
| Public | Hoàn toàn miễn phí |
| Private | Có giới hạn phút/tháng tùy gói |

> Trong khoá học này, tất cả ví dụ đều chạy được với tài khoản GitHub miễn phí.

## Điều kiện cần

- Có tài khoản GitHub (tạo miễn phí tại github.com)
- Hiểu cơ bản về Git và GitHub (commit, push, branch, pull request)

---

**Tiếp theo:** Tìm hiểu 3 khái niệm cốt lõi của GitHub Actions →
