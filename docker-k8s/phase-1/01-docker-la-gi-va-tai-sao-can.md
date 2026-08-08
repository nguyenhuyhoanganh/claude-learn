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

### Ba vấn đề này thật sự trông như thế nào

Phần này làm cụ thể ba gạch đầu dòng ở trên, vì đọc mô tả trừu tượng thì ai cũng gật đầu nhưng chưa thấy đau.

**Vấn đề 1 — cùng một dòng code, hai kết quả:**

```text
   MÁY BẠN                              SERVER PRODUCTION
   ───────                              ─────────────────
   $ node --version                     $ node --version
   v14.3.0                              v12.22.1

   $ node app.mjs                       $ node app.mjs
   Server chạy ở cổng 3000              SyntaxError: await is only valid
                                        in async functions
                                              ▲
                                   top-level await CHỈ CÓ từ Node 14.3
```

Điều làm lỗi này khó chịu: **nó không xuất hiện lúc bạn viết code, cũng không xuất hiện lúc test**. Nó xuất hiện lúc deploy — thời điểm tệ nhất.

**Vấn đề 2 — bug chỉ xảy ra trên máy một người:**

```text
   Bạn:         "Chức năng xuất Excel chạy tốt mà."
   Đồng nghiệp: "Máy mình lỗi 'library not found'."
   Bạn:         "Lạ nhỉ, máy mình vẫn chạy."

   Nguyên nhân thật: máy bạn từng cài một thư viện hệ thống cho project
   khác cách đây 8 tháng. Nó nằm trong máy bạn, KHÔNG nằm trong repo.
   → Máy bạn có một "trạng thái ẩn" mà không ai tái lập được.
```

**Vấn đề 3 — chuyển project là cài lại:**

```text
   Sáng:  làm project A  →  cần Python 2.7   →  pyenv global 2.7.18
   Chiều: làm project B  →  cần Python 3.11  →  pyenv global 3.11.5
   Tối:   quay lại project A                 →  phải đổi lại

   Và đó mới chỉ là Python. Còn Node, PHP, database, Redis,
   mỗi thứ một phiên bản khác nhau cho mỗi project.
```

Điểm chung của cả ba: **môi trường chạy nằm ngoài mã nguồn**, nên không ai kiểm soát được nó bằng Git.

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

```text
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

### Điều Docker thật sự thay đổi: môi trường trở thành mã nguồn

Đây là ý quan trọng nhất của cả bài, và nó không nằm ở chỗ "container nhẹ hơn máy ảo".

```text
   TRƯỚC DOCKER
   ════════════
   Trong Git:      chỉ có code
   Ngoài Git:      Node phiên bản nào, thư viện hệ thống nào,
                   biến môi trường nào, ai đó đã cài gì trên server
                   → KHÔNG AI BIẾT CHẮC, không ai tái lập được

   CÓ DOCKER
   ═════════
   Trong Git:      code  +  Dockerfile
                            ▲
                   Dockerfile MÔ TẢ CHÍNH XÁC môi trường chạy:
                   base image nào, cài gì, biến gì, chạy lệnh gì

   → Môi trường được QUẢN LÝ PHIÊN BẢN như code
   → Ai clone repo cũng dựng lại được ĐÚNG môi trường đó
```

Từ góc nhìn này, Docker không phải "công cụ ảo hoá nhẹ". Nó là **cách biến môi trường chạy thành một file văn bản kiểm soát được bằng Git**. Mọi lợi ích khác đều là hệ quả của điều đó.

---

## Docker trong thực tế — Các use case phổ biến

| Tình huống | Không có Docker | Có Docker |
|---|---|---|
| Dev → Production | Cài lại đúng version trên server | Container đã có sẵn mọi thứ |
| Onboard team member mới | Cài hàng giờ dependencies | Pull image, chạy ngay |
| Chuyển giữa projects | Uninstall/install lại version | Chuyển sang container khác |
| CI/CD pipeline | Phụ thuộc vào cấu hình server | Container đồng nhất mọi nơi |

### Nhìn thấy khác biệt bằng lệnh thật

Ba lệnh dưới đây chạy được ngay sau khi cài Docker, và chúng cho thấy điều mà bảng trên mô tả:

```bash
# Chạy Node 12 — KHÔNG cài Node 12 lên máy
docker run --rm node:12 node --version
```

```text
v12.22.12
```

```bash
# Ngay sau đó chạy Node 18 — cũng không cài gì
docker run --rm node:18 node --version
```

```text
v18.20.4
```

```bash
# Và máy thật của bạn vẫn không hề đổi
node --version
```

```text
v20.11.0
```

Ba phiên bản Node dùng được trong một phút, **không cái nào đụng tới máy bạn**. Cờ `--rm` nghĩa là xoá container ngay sau khi chạy xong, nên cũng không để lại rác.

Đây chính là lời giải cho **vấn đề 3** ở đầu bài — và bạn vừa thấy nó hoạt động chứ không chỉ đọc mô tả.

---

## Docker vs Container: phân biệt rõ

Nhiều người hay nhầm lẫn hai khái niệm này:

- **Container**: Khái niệm, là "hộp" chứa phần mềm. Hệ điều hành hiện đại đã hỗ trợ native.
- **Docker**: Công cụ để tạo và quản lý containers dễ dàng. Docker là **de facto standard** cho việc làm này.

> Bạn không cần Docker để tạo container, nhưng Docker làm việc này cực kỳ đơn giản nên mọi người đều dùng.

Nói cụ thể hơn: khả năng cách ly tiến trình nằm sẵn trong **nhân Linux** (qua hai cơ chế tên là *namespace* và *cgroup*). Docker chỉ là lớp công cụ đóng gói khả năng đó thành thứ dễ dùng. Chính vì vậy sau này mới có những công cụ khác cùng chạy được container mà không cần Docker — Podman, containerd, CRI-O — và Kubernetes ở nửa sau khoá học dùng **containerd** chứ không dùng Docker.

Bạn chưa cần nhớ những cái tên đó bây giờ. Chỉ cần nhớ: **container là một chuẩn, Docker là một cách làm ra nó**.

---

## Ba thứ Docker KHÔNG giải quyết

Phần này quan trọng ngang phần "Docker giải quyết gì", vì kỳ vọng sai dẫn tới thất vọng.

| Điều nhiều người tưởng | Sự thật |
|---|---|
| "Docker làm app chạy nhanh hơn" | **Không.** Container gần như không thêm chi phí, nhưng cũng không làm code bạn nhanh hơn. Docker giải bài toán **nhất quán**, không phải **tốc độ** |
| "Đóng gói Docker là app tự scale được" | **Không.** Scale là việc của Kubernetes hoặc dịch vụ điều phối (từ phase-11 trở đi) |
| "Có Docker là hết bug môi trường" | **Không hết.** Container vẫn khác nhau nếu bạn dùng tag `latest`, hoặc phụ thuộc biến môi trường bên ngoài, hoặc chạy trên kiến trúc CPU khác (ARM so với x86) |

Dòng cuối đáng nhớ: viết `FROM node:18` hôm nay và sáu tháng sau, bạn có thể nhận **hai image khác nhau** — vì tag `18` được đẩy đè khi có bản vá mới. Muốn tái lập tuyệt đối thì phải ghim phiên bản cụ thể hơn. Chi tiết ở [Phase 2 bài 4](../phase-2/04-naming-tagging-va-chia-se-images.md).

---

## Bẫy thường gặp cho người mới

| Bẫy | Vì sao sai | Cách hiểu đúng |
|---|---|---|
| "Container là máy ảo nhẹ" | Container **không có hệ điều hành riêng** — nó dùng chung nhân với máy chủ | Xem [bài 2](02-containers-vs-virtual-machines.md) |
| Nhầm **image** với **container** | Image là bản thiết kế (tĩnh), container là thứ đang chạy (động) | Một image tạo ra được nhiều container |
| Nghĩ dữ liệu trong container tự động được giữ lại | Xoá container là **mất sạch** dữ liệu bên trong | Cần volume — [Phase 3](../phase-3/01-data-trong-docker.md) |
| Tưởng phải cài Docker lên server production mới dùng được | Có cách đó, nhưng còn ECS, Cloud Run, Kubernetes | [Phase 9](../phase-9/01-tu-development-den-production.md) |
| Dùng Docker cho cả script chạy một lần | Với việc quá đơn giản, Docker chỉ thêm bước | Docker đáng dùng khi có **phụ thuộc cần cố định** |
| Nghĩ Docker chỉ dành cho backend | Build frontend, công cụ dòng lệnh, database local đều dùng được | [Phase 7](../phase-7/01-utility-containers-la-gi.md) về utility container |

---

## Tóm tắt bài 1

- Docker giải quyết vấn đề **môi trường không nhất quán** giữa dev, staging và production
- Container là **gói phần mềm khép kín** chứa code + mọi thứ cần để chạy
- Container **chạy giống hệt nhau** ở bất kỳ đâu có Docker
- Docker là **công cụ** (không phải container) — nó giúp bạn tạo và quản lý containers
- Ý cốt lõi: Docker biến **môi trường chạy thành một file văn bản** (Dockerfile) quản lý được bằng Git. Mọi lợi ích khác là hệ quả của điều này.
- Khả năng cách ly nằm ở **nhân Linux**, không phải ở Docker — nên có nhiều công cụ khác cùng chạy container được, và Kubernetes dùng **containerd**.
- Docker **không** làm app nhanh hơn, **không** tự scale, và **không** tự hết bug môi trường nếu bạn dùng tag `latest`.
- Ba lệnh đáng thử ngay: `docker run --rm node:12 node --version`, đổi `12` thành `18`, rồi so với `node --version` trên máy thật.

---

**Bài kế tiếp** → [Bài 2: Containers vs Virtual Machines](02-containers-vs-virtual-machines.md)
