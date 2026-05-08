# Bài 1: Docker là gì và tại sao cần dùng?

## Vấn đề thực tế trong phát triển phần mềm

Hãy tưởng tượng bạn đang phát triển một ứng dụng Node.js trên máy tính cá nhân. Code chạy ngon lành. Nhưng khi deploy lên server sản xuất (production), ứng dụng bị lỗi. Nguyên nhân? Server đang dùng Node.js version 12 còn máy bạn dùng version 14.3 — và tính năng mà code bạn dùng chỉ có từ 14.3 trở lên.

Đây là một trong những vấn đề phổ biến nhất mà Docker giải quyết.

### Ba vấn đề cụ thể Docker giải quyết

**1. Sự khác biệt giữa môi trường dev và production**

Code chạy được trên máy bạn nhưng không chạy được trên server. Nguyên nhân thường là:
- Phiên bản runtime khác nhau (Node.js, Python, PHP, Java...)
- Thư viện hệ thống khác nhau
- Cấu hình hệ điều hành khác nhau

**2. Sự khác biệt giữa các máy trong team**

Bạn dùng Node.js 18, đồng nghiệp dùng Node.js 16. Một số tính năng của bạn không chạy trên máy họ. Điều này làm chậm tiến độ và gây ra những bug khó tái hiện.

**3. Nhiều project với phiên bản xung đột**

Project A dùng Python 2.7, Project B dùng Python 3.11. Mỗi lần chuyển project lại phải cài đặt lại — rất mất thời gian.

---

## Docker là gì?

**Docker là một công cụ tạo và quản lý containers** — các "hộp" phần mềm chứa đầy đủ code và mọi thứ cần thiết để chạy code đó.

### Container là gì?

Container là một **đơn vị phần mềm chuẩn hoá**, bao gồm:
- Source code của ứng dụng
- Runtime cần thiết (ví dụ: Node.js 14.3)
- Các dependencies và thư viện
- Cấu hình môi trường

**Ví dụ trực quan:** Hãy nghĩ đến một hộp picnic. Hộp đó chứa đầy đủ thức ăn và dụng cụ ăn uống. Bạn có thể mang hộp đó đến bất kỳ đâu và có ngay bữa picnic — không cần lo thiếu đĩa hay dao nĩa. Container hoạt động theo cùng nguyên lý: tất cả những gì ứng dụng cần đều nằm trong container.

```
┌─────────────────────────┐
│       Container         │
│  ┌────────────────────┐ │
│  │   Source Code      │ │
│  ├────────────────────┤ │
│  │   Node.js 14.3     │ │
│  ├────────────────────┤ │
│  │   npm packages     │ │
│  └────────────────────┘ │
└─────────────────────────┘
        Chạy ở bất kỳ đâu
```

### Tại sao container quan trọng?

Container **luôn cho kết quả giống hệt nhau** dù chạy ở đâu — máy dev, máy của đồng nghiệp, hay server production. Đây là điều mà không container thì rất khó đảm bảo.

---

## Docker trong thực tế — Các use case phổ biến

| Tình huống | Không có Docker | Có Docker |
|---|---|---|
| Dev → Production | Cài lại đúng version trên server | Container đã có sẵn mọi thứ |
| Onboard team member mới | Cài hàng giờ dependencies | Pull image, chạy ngay |
| Chuyển giữa projects | Uninstall/install lại version | Chuyển sang container khác |
| CI/CD pipeline | Phụ thuộc vào cấu hình server | Container đồng nhất mọi nơi |

---

## Docker vs Container: phân biệt rõ

Nhiều người hay nhầm lẫn hai khái niệm này:

- **Container**: Khái niệm, là "hộp" chứa phần mềm. Hệ điều hành hiện đại đã hỗ trợ native.
- **Docker**: Công cụ để tạo và quản lý containers dễ dàng. Docker là **de facto standard** cho việc làm này.

> Bạn không cần Docker để tạo container, nhưng Docker làm việc này cực kỳ đơn giản nên mọi người đều dùng.

---

## Tóm tắt

- Docker giải quyết vấn đề **môi trường không nhất quán** giữa dev, staging và production
- Container là **gói phần mềm khép kín** chứa code + mọi thứ cần để chạy
- Container **chạy giống hệt nhau** ở bất kỳ đâu có Docker
- Docker là **công cụ** (không phải container) — nó giúp bạn tạo và quản lý containers

---

**Tiếp theo:** So sánh Docker Containers với Virtual Machines →
