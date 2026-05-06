# Bài 1: Giới thiệu Docker Containers trong GitHub Actions

## Docker Container là gì?

Container là một **gói phần mềm** chứa cả code lẫn môi trường cần thiết để chạy code đó. Đặc điểm:
- **Isolated** — không bị ảnh hưởng bởi phần mềm cài trên máy host
- **Reproducible** — luôn chạy giống nhau trên bất kỳ máy nào hỗ trợ Docker
- **Defined** — môi trường được định nghĩa rõ ràng qua Dockerfile

---

## Tại sao dùng containers với GitHub Actions?

Khi chạy job trên runner Ubuntu/Windows của GitHub, bạn có **môi trường cố định** với danh sách phần mềm định sẵn. Điều này thường đủ, nhưng đôi khi:

- Bạn cần một phiên bản tool cụ thể không có sẵn
- Bạn cần cài nhiều phần mềm phức tạp — phải lặp lại trong mọi workflow
- Bạn muốn đảm bảo môi trường **hoàn toàn giống nhau** bất kể runner

**Giải pháp:** Đặt job vào một container tự định nghĩa.

**Ví dụ thực tế:** Playwright (công cụ test browser) có image chứa sẵn Chrome, Firefox, Safari. Dùng image đó thay vì phải cài browsers trong mỗi workflow run → tiết kiệm thời gian và tiền.

---

## GitHub Actions + Docker: hoạt động thế nào?

```
GitHub Runner (Ubuntu/Windows)
└── Docker Engine (chạy trong runner)
    └── Container (dựa trên image bạn chỉ định)
        └── Các steps của job chạy ở đây
```

Runner **chỉ host** container. Các steps của job thực sự chạy **bên trong** container, không phải trực tiếp trên runner.

Bạn vẫn dùng được các GitHub Actions như `actions/checkout@v3` hay `actions/cache@v3` trong container — GitHub Actions đảm bảo tương thích.

---

## Docker Hub — nơi tìm images

Docker Hub ([hub.docker.com](https://hub.docker.com)) là kho lưu trữ image chính thức. Tìm kiếm theo tên:

| Image | Môi trường cung cấp |
|---|---|
| `ubuntu` | Ubuntu Linux cơ bản |
| `node` | Ubuntu + Node.js |
| `node:16` | Ubuntu + Node.js 16 cụ thể |
| `python:3.11` | Linux + Python 3.11 |
| `postgres` | PostgreSQL database server |
| `mongo` | MongoDB database server |
| `mcr.microsoft.com/playwright` | Browsers cho testing |

---

## Khi nào dùng containers, khi nào không?

| Tình huống | Khuyến nghị |
|---|---|
| Workflow đơn giản (test Node.js app) | Runner mặc định là đủ |
| Cần phiên bản cụ thể của tool | Container |
| Cần nhiều tool phức tạp | Container |
| Muốn tái sử dụng environment qua nhiều workflows | Container |
| Cần database test riêng biệt | Service Container |

---

**Tiếp theo:** Chạy Job trong Container →
