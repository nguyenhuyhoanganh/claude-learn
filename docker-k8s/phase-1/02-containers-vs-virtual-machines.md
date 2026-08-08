# Bài 2: Containers vs Virtual Machines

## Virtual Machines — Giải pháp cũ cho vấn đề môi trường

Trước khi có Docker và containers phổ biến, Virtual Machines (VM) là cách phổ biến để tạo ra môi trường độc lập. VM vẫn hoạt động và vẫn có use case của nó, nhưng nó có những nhược điểm đáng kể so với containers.

### Cách VM hoạt động

```text
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

```text
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

### "Chia sẻ kernel" nghĩa là gì — phần quyết định mọi khác biệt

Cụm từ này bị lặp lại khắp nơi mà ít khi được giải nghĩa. Hãy xem **kernel** (nhân hệ điều hành) thật sự làm gì:

```text
   Ứng dụng của bạn muốn:
   ├─ mở một file          → phải nhờ kernel
   ├─ gửi gói tin qua mạng → phải nhờ kernel
   ├─ xin thêm bộ nhớ      → phải nhờ kernel
   └─ tạo tiến trình mới   → phải nhờ kernel

   Ứng dụng KHÔNG BAO GIỜ nói chuyện trực tiếp với phần cứng.
   Nó luôn đi qua kernel.
```

Giờ so hai cách:

```text
   MÁY ẢO — mỗi VM một kernel RIÊNG
   ════════════════════════════════
   App → Guest kernel → Hypervisor → Host kernel → phần cứng
          ▲                ▲
     tốn RAM cho     thêm một lớp
     mỗi VM          dịch lời gọi

   → 3 VM Ubuntu = 3 bản kernel Linux cùng nằm trong RAM
   → mỗi kernel tốn vài trăm MB, và phải khởi động (boot) đầy đủ


   CONTAINER — dùng CHUNG kernel của máy chủ
   ═════════════════════════════════════════
   App → Host kernel → phần cứng
          ▲
     KHÔNG có lớp nào ở giữa

   → 3 container Ubuntu = 1 kernel duy nhất
   → container chỉ chứa THƯ VIỆN và FILE của Ubuntu, không chứa kernel
   → khởi động container = khởi động một TIẾN TRÌNH, không phải boot máy
```

Câu chốt: **container không "khởi động" theo nghĩa của máy tính — nó chỉ chạy một tiến trình.** Đó là lý do nó mất mili giây thay vì vài phút.

### Hệ quả trực tiếp: có thứ container KHÔNG làm được

Vì dùng chung kernel, container **bị ràng buộc bởi kernel của máy chủ**:

```text
   Máy chủ Linux  →  chạy được container Linux           ✓
   Máy chủ Linux  →  chạy được container Windows         ✗ KHÔNG BAO GIỜ
   Máy chủ Windows→  chạy được container Windows         ✓
   Máy chủ Windows→  chạy container Linux qua WSL2/VM    ✓ (nhờ có VM ở giữa)
```

Với máy ảo thì không có ràng buộc này — chạy Windows trên máy chủ Linux hoàn toàn được, vì VM mang theo kernel riêng.

Đây chính là **lý do kỹ thuật** cho dòng "cần chạy OS hoàn toàn khác" ở bảng "khi nào dùng VM" phía dưới.

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

## Sự thật bất ngờ: trên macOS và Windows, container của bạn đang chạy trong một máy ảo

Câu trên vừa nói "trong cloud, container chạy bên trong VM". Điều ít người biết là **điều đó cũng đúng ngay trên máy bạn**, nếu bạn dùng macOS hoặc Windows.

```text
   TRÊN LINUX
   ══════════
   ┌─────────────────────────────────┐
   │  Linux (máy thật)               │
   │  ├─ Docker Engine               │
   │  └─ Container ── dùng kernel ───┼──► kernel Linux của chính máy này
   └─────────────────────────────────┘
   → Không có lớp ảo hoá nào cả


   TRÊN macOS / WINDOWS
   ════════════════════
   ┌───────────────────────────────────────────────┐
   │  macOS / Windows (máy thật)                   │
   │  ┌─────────────────────────────────────────┐  │
   │  │  MÁY ẢO LINUX (ẩn, Docker Desktop tạo)  │  │
   │  │  ├─ Docker Engine                       │  │
   │  │  └─ Container ── dùng kernel ───────────┼──┼──► kernel Linux
   │  └─────────────────────────────────────────┘  │     CỦA MÁY ẢO
   └───────────────────────────────────────────────┘
   → macOS và Windows KHÔNG CÓ kernel Linux
   → nên bắt buộc phải có một máy ảo Linux ở giữa
```

Kiểm chứng ngay trên máy bạn:

```bash
docker run --rm alpine uname -a
```

```text
Linux 3f2a8b1c4d5e 6.10.14-linuxkit #1 SMP ... x86_64 Linux
                                       ▲
                              "linuxkit" = kernel của máy ảo
                              do Docker Desktop tạo ra
```

Trên máy macOS thật, `uname -a` sẽ ra `Darwin`. Nhưng bên trong container lại ra `Linux` — bằng chứng rõ ràng có một lớp Linux ở giữa.

### Vì sao điều này quan trọng chứ không phải chuyện vui

Nó giải thích ba hiện tượng mà người dùng macOS/Windows hay gặp và không hiểu vì sao:

| Hiện tượng | Nguyên nhân |
|---|---|
| **Bind mount rất chậm** trên macOS (`npm install` trong container chậm gấp nhiều lần) | File phải đi qua lớp chia sẻ giữa máy thật và máy ảo. Trên Linux thì không có lớp này |
| Docker "ăn" vài GB RAM dù chưa chạy container nào | Đó là RAM cấp cho **máy ảo**, không phải cho container |
| `localhost` trong container không gọi được dịch vụ trên máy thật | Container nằm trong máy ảo → `localhost` là của máy ảo. Phải dùng `host.docker.internal` |

```bash
# Trên macOS/Windows: gọi dịch vụ đang chạy ở máy thật
docker run --rm alpine ping -c1 host.docker.internal
```

Và nó cũng làm rõ một điều về bảng so sánh phía trên: những con số "nhẹ, nhanh" của container là **so với việc chạy nhiều máy ảo**. Trên macOS bạn vẫn trả chi phí của **một** máy ảo — chỉ là trả một lần cho mọi container, thay vì mỗi container một máy ảo.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Container là máy ảo siêu nhẹ" | Container **không có kernel riêng**. Nó là **tiến trình bị cách ly**, không phải máy tính thu nhỏ |
| Định chạy container Windows trên máy chủ Linux | **Không bao giờ được** — kernel không tương thích |
| Nghĩ container cách ly mạnh bằng máy ảo | **Không.** Chung kernel nghĩa là một lỗ hổng kernel ảnh hưởng mọi container. Đó là lý do cloud vẫn bọc container trong VM |
| Đo hiệu năng bind mount trên macOS rồi kết luận "Docker chậm" | Chậm vì lớp chia sẻ file của **máy ảo**, không phải bản chất Docker. Trên Linux nhanh hơn nhiều |
| Dùng `localhost` trong container để gọi máy thật | Trong container, `localhost` là **chính container đó**. Dùng `host.docker.internal` (macOS/Windows) |
| Tưởng `docker stats` cho biết RAM Docker chiếm trên máy | Nó chỉ đo container. RAM của máy ảo Docker Desktop phải xem ở cài đặt Docker Desktop |

---

## Tóm tắt bài 2

- VM tạo ra máy tính hoàn chỉnh bên trong máy tính → nặng, chậm, tốn tài nguyên
- Container chia sẻ kernel với host OS → nhẹ, nhanh, tiết kiệm
- Container vẫn cách ly tốt nhưng không "nặng" như VM
- Docker là công cụ tiêu chuẩn để tạo và quản lý container
- **"Chia sẻ kernel"** nghĩa là: mọi thao tác file/mạng/bộ nhớ của app đều đi qua kernel, và container dùng **kernel của máy chủ** thay vì mang theo kernel riêng. Vì vậy container **chỉ là một tiến trình được cách ly**, khởi động tính bằng mili giây.
- Hệ quả trực tiếp: **không thể chạy container Windows trên máy chủ Linux**. Máy ảo thì làm được, vì nó mang kernel riêng.
- Cách ly của container **yếu hơn** máy ảo (chung kernel) — đó là lý do các nhà cung cấp cloud vẫn bọc container trong VM.
- **Trên macOS và Windows, container của bạn đang chạy bên trong một máy ảo Linux** do Docker Desktop tạo. Kiểm chứng bằng `docker run --rm alpine uname -a` (thấy `linuxkit`).
- Điều đó giải thích ba hiện tượng hay gặp: **bind mount chậm**, **Docker chiếm RAM khi chưa chạy gì**, và **`localhost` không gọi được máy thật** (phải dùng `host.docker.internal`).

---

**Bài kế tiếp** → [Bài 3: Cài đặt Docker](03-cai-dat-docker.md)
