# Bài 1: Job Artifacts — File đầu ra của Jobs

## Vấn đề: File sinh ra trong job thì biến mất sau khi job xong

Khi workflow chạy, runner là một máy ảo tạm thời. Sau khi job hoàn thành, máy đó bị xoá cùng với mọi file trên đó.

Vậy nếu job build sinh ra file `dist/`, làm sao bạn:
- Tải về để kiểm tra thủ công?
- Dùng trong job deploy (chạy trên máy khác)?

→ Giải pháp: **Job Artifacts**

---

## Artifact là gì?

Artifact là **file hoặc thư mục** được sinh ra bởi một job và cần được:
- Lưu lại để tải về thủ công sau này (để inspect hoặc distribute)
- Truyền sang job khác trong cùng workflow

**Ví dụ artifact thực tế:**

| Loại dự án | Artifact |
|---|---|
| Website | Thư mục `dist/` chứa HTML, CSS, JS đã build |
| Mobile app | File `.apk` hoặc `.ipa` |
| Desktop app | File `.exe` hoặc binary |
| CI test | Log file của test run |

---

## Điều cần hiểu trước khi dùng

> **Mỗi job chạy trên một máy riêng biệt.** File sinh ra ở job `build` **không tự có mặt** ở job `deploy`. Phải dùng artifact để "vận chuyển" file giữa các jobs.

---

## Hai actions chính

GitHub cung cấp sẵn 2 actions để làm việc với artifact:

| Action | Chức năng |
|---|---|
| `actions/upload-artifact@v3` | Upload file từ runner lên GitHub lưu trữ |
| `actions/download-artifact@v3` | Download file đã lưu xuống runner đang chạy |

---

## Vòng đời của artifact

```
Job build                    GitHub Storage            Job deploy
─────────────────────        ──────────────────        ──────────────────
npm run build                                          
→ sinh ra dist/        →→→  upload-artifact  →→→      download-artifact
                             lưu dưới key               → dist/ có sẵn
                             "dist-files"               trên máy này
                                   ↓
                             (người dùng cũng
                              có thể download
                              thủ công tại đây)
```

---

## Artifact vs Cache — Đừng nhầm lẫn

| | Artifact | Cache |
|---|---|---|
| Dùng để | Lưu **kết quả** của job | Tăng tốc bằng cách tái dùng file |
| Ví dụ | `dist/`, `.apk`, log file | `node_modules`, pip packages |
| Thời gian lưu | Theo cấu hình (mặc định 90 ngày) | Ngắn hơn, dựa trên cache key |
| Mục đích | Inspect hoặc deploy | Tránh download lại |

---

**Tiếp theo:** Thực hành upload và download artifact →
