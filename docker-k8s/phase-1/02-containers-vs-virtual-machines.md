# Bài 2: Containers vs Virtual Machines

## Virtual Machines — Giải pháp cũ cho vấn đề môi trường

Trước khi có Docker và containers phổ biến, Virtual Machines (VM) là cách phổ biến để tạo ra môi trường độc lập. VM vẫn hoạt động và vẫn có use case của nó, nhưng nó có những nhược điểm đáng kể so với containers.

### Cách VM hoạt động

```
┌──────────────────────────────────────────────────┐
│              Host OS (Windows/macOS/Linux)        │
├──────────────────────────────────────────────────┤
│            Hypervisor (VirtualBox, VMware...)     │
├────────────────┬────────────────┬────────────────┤
│   VM 1         │   VM 2         │   VM 3         │
│  ┌──────────┐  │  ┌──────────┐  │  ┌──────────┐  │
│  │Guest OS  │  │  │Guest OS  │  │  │Guest OS  │  │
│  │(Linux)   │  │  │(Linux)   │  │  │(Linux)   │  │
│  ├──────────┤  │  ├──────────┤  │  ├──────────┤  │
│  │Libraries │  │  │Libraries │  │  │Libraries │  │
│  ├──────────┤  │  ├──────────┤  │  ├──────────┤  │
│  │App Code  │  │  │App Code  │  │  │App Code  │  │
│  └──────────┘  │  └──────────┘  │  └──────────┘  │
└────────────────┴────────────────┴────────────────┘
```

Mỗi VM là **một máy tính hoàn chỉnh** chạy bên trong máy tính của bạn. Nó có:
- Hệ điều hành riêng (Guest OS) — thường là Linux
- Kernel riêng
- Drivers riêng
- Tất cả tools mặc định của OS đó

### Ưu điểm của VM

- **Cách ly hoàn toàn**: Mỗi VM hoàn toàn độc lập, không ảnh hưởng lẫn nhau
- **Môi trường nhất quán**: Cùng OS, cùng tools, có thể chia sẻ cấu hình
- **Kiểm soát tốt**: Có thể cấu hình chi tiết từng thành phần

### Nhược điểm của VM

❌ **Lãng phí tài nguyên**: Mỗi VM cần hàng GB RAM và disk space chỉ cho OS

❌ **Khởi động chậm**: Phải boot cả một OS — mất vài phút

❌ **Trùng lặp**: Nếu 3 VM đều dùng Ubuntu, có 3 bản Ubuntu riêng biệt trên đĩa

❌ **Khó chia sẻ**: Không có file cấu hình đơn giản để recreate VM

❌ **Performance kém**: VM tạo ra overhead đáng kể, đặc biệt khi chạy nhiều VM

---

## Docker Containers — Giải pháp hiện đại

Containers chia sẻ kernel của host OS, không cần một OS riêng biệt cho mỗi container.

### Cách Containers hoạt động

```
┌──────────────────────────────────────────────────┐
│              Host OS (Windows/macOS/Linux)        │
├──────────────────────────────────────────────────┤
│                   Docker Engine                   │
├────────────────┬────────────────┬────────────────┤
│  Container 1   │  Container 2   │  Container 3   │
│  ┌──────────┐  │  ┌──────────┐  │  ┌──────────┐  │
│  │(thin OS  │  │  │(thin OS  │  │  │(thin OS  │  │
│  │layer)    │  │  │layer)    │  │  │layer)    │  │
│  ├──────────┤  │  ├──────────┤  │  ├──────────┤  │
│  │Libraries │  │  │Libraries │  │  │Libraries │  │
│  ├──────────┤  │  ├──────────┤  │  ├──────────┤  │
│  │App Code  │  │  │App Code  │  │  │App Code  │  │
│  └──────────┘  │  └──────────┘  │  └──────────┘  │
└────────────────┴────────────────┴────────────────┘
         (Chia sẻ kernel của Host OS)
```

Container có thể có một **lớp OS mỏng** (thin OS layer) bên trong, nhưng đây là bản rất nhỏ gọn, không phải một OS đầy đủ như VM.

### Ưu điểm của Containers

✅ **Nhẹ và nhanh**: Khởi động trong vài giây (thậm chí mili giây)

✅ **Tiết kiệm tài nguyên**: Chia sẻ kernel, không duplicate OS

✅ **Dễ chia sẻ**: Dùng Dockerfile (file cấu hình) hoặc Image để share

✅ **Portable**: Chạy được ở bất kỳ đâu có Docker Engine

✅ **Isolated**: Mỗi container vẫn cách ly với nhau và với host

---

## So sánh trực tiếp

| Tiêu chí | Virtual Machine | Docker Container |
|---|---|---|
| Kích thước | GB (cả OS) | MB (chỉ app + deps) |
| Khởi động | Vài phút | Vài giây |
| Tài nguyên RAM | Nhiều (cả OS) | Ít hơn nhiều |
| Cách ly | Rất mạnh (full OS) | Tốt (shared kernel) |
| Chia sẻ | Khó (image VM nặng) | Dễ (Dockerfile/Image nhẹ) |
| Portability | Phụ thuộc hypervisor | Chạy ở bất kỳ đâu có Docker |
| Use case | Cần full OS khác | App development/deployment |

---

## Khi nào dùng VM, khi nào dùng Container?

**Dùng Container (Docker) khi:**
- Phát triển và deploy ứng dụng web/API
- Microservices
- CI/CD pipelines
- Cần môi trường nhất quán nhanh

**Vẫn dùng VM khi:**
- Cần chạy OS hoàn toàn khác (Windows app trên Linux server)
- Security isolation cực kỳ cao (mỗi tenant một VM riêng)
- Cần kiểm soát phần cứng cấp thấp

> **Thực tế:** Trong nhiều môi trường cloud, containers lại chạy **bên trong** VM — vừa có security của VM, vừa có hiệu quả của container.

---

## Tóm tắt

- VM tạo ra máy tính hoàn chỉnh bên trong máy tính → nặng, chậm, tốn tài nguyên
- Container chia sẻ kernel với host OS → nhẹ, nhanh, tiết kiệm
- Container vẫn cách ly tốt nhưng không "nặng" như VM
- Docker là công cụ tiêu chuẩn để tạo và quản lý container

---

**Tiếp theo:** Cài đặt Docker trên máy tính →
