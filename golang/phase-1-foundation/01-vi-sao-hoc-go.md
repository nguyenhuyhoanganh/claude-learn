# Bài 1: Vì sao Go xứng đáng là ngôn ngữ thứ hai (hoặc thứ nhất) của bạn

Đầu thập niên 2010, Google có vấn đề. Codebase C++ build mất 45 phút. Code Java verbose, runtime nặng. Python chậm khi scale. Họ cần một ngôn ngữ **compile nhanh**, **chạy nhanh**, **viết ngắn**, mà developer mới onboard trong 1 tuần thay vì 6 tháng. Robert Griesemer, Rob Pike, Ken Thompson — 3 huyền thoại từ thời UNIX — bắt tay viết **Go**. Mục tiêu: ngôn ngữ cho thế kỷ 21, network-first, concurrency-first, đơn giản đến mức không có chỗ tranh cãi syntax.

Hơn một thập kỷ sau, Go đứng sau **Docker, Kubernetes, Terraform, etcd, Prometheus, CockroachDB, Hugo, Caddy** — gần như toàn bộ nền tảng cloud-native hiện đại. Khi bạn `kubectl apply`, bạn đang chạy Go. Khi bạn `docker run`, bạn đang chạy Go.

## Course này dạy gì

Khoá học gốc do Joseph Arbour — CTO, Go engineer, 15 năm làm fintech/healthcare/e-commerce — record trong 1 năm. **40 giờ video** thực chiến. Mục tiêu: sau khi học xong, bạn không cần mua thêm course Go nào nữa, làm được production-grade web/REST/GraphQL/MCP server.

Triết lý course đứng trên 3 trụ:

```text
┌─────────────────────────────────────────────────┐
│  PROJECT-BASED                                  │
│  Học bằng cách build, không chỉ đọc lý thuyết.  │
│  Mỗi section kết thúc bằng project nhỏ.         │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  ENGINEERING-FIRST                              │
│  Hiểu foundation (memory, pointer, concurrency) │
│  trước khi nhảy vào framework, API.             │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  PRODUCTION-READY                               │
│  Code chuẩn: test, mock, Docker, AWS, JWT, S3.  │
│  Pattern dùng được ở công ty thật.              │
└─────────────────────────────────────────────────┘
```

## Lộ trình 26 sections → 15+ phases

| Phase | Nội dung | Section gốc |
|---|---|---|
| 1 | Foundation & Setup | 01 |
| 2 | Core Language Fundamentals | 04 |
| 3 | Control Flow & Logic | 05 |
| 4 | Data Structures & Memory | 06 |
| 5 | Functions & Error Handling | 07 |
| 6 | OOP & Composition | 08-09 |
| 7 | Strings & Modules | 10-11 |
| 8 | Concurrency (lý do mọi người đến Go) | 12 |
| 9 | File IO & Encoding | 13-14 |
| 10 | Database Programming | 15 |
| 11 | Web Development | 16 |
| 12 | Testing & QA | 17, 22 |
| 13 | E-Commerce REST API Project | 19 |
| 14 | GraphQL | 20-21 |
| 15 | Refactor + Search + MCP Server | 23-26 |

Section 02 (Windows install) và 03 (Linux install) được fold vào bài 2 dưới.

## Vì sao Go nhanh được như C, dễ viết như Python?

```text
[Code Go]
   │
   │   go build
   ▼
[Compiler: parse → SSA → optimize]
   │
   ▼
[Single static binary]    ← KHÔNG cần JVM, KHÔNG cần runtime cài thêm
   │
   ▼
[Native machine code chạy thẳng trên OS]
```

Khác với Java (cần JVM), Python (cần interpreter), Node.js (cần V8), Go biên dịch ra **một file binary tĩnh** chạy thẳng trên Linux/Mac/Windows. Cùng một code, `GOOS=linux go build` cho Linux, `GOOS=windows go build` cho Windows. Không phụ thuộc môi trường runtime.

Khi `docker run alpine /myapp` chỉ 10MB, đó là vì Go binary không cần kéo theo cả runtime.

## So sánh nhanh với ngôn ngữ khác

| Tiêu chí | Go | Java | Python | Node.js | C++ |
|---|---|---|---|---|---|
| Compile speed | < 1s | chậm (Maven) | N/A | N/A | rất chậm |
| Runtime cần thêm | Không | JVM | Interpreter | V8 | Không |
| Binary size | 10-20 MB tĩnh | JAR + JVM ~200MB | venv + interpreter | node_modules huge | nhỏ |
| Concurrency | goroutines (built-in) | threads/CompletableFuture | asyncio/threading | event loop | std::thread |
| GC | Có | Có | Có | Có | Không |
| Generic | Có (1.18+) | Có | Duck typing | Duck typing | Có |
| Learning curve | Thấp | Trung bình | Thấp | Thấp | Cao |
| Use case mạnh | Backend, CLI, cloud | Enterprise | Data, ML | Web, real-time | System, game |

Bạn không cần thay thế ngôn ngữ chính. Học Go vì:
- 80% job DevOps/SRE/Cloud yêu cầu Go.
- Microservices high-throughput nên viết Go.
- CLI tool internal nên viết Go (binary tĩnh, distribute dễ).

## Khi nào KHÔNG nên dùng Go?

| Use case | Lựa chọn tốt hơn |
|---|---|
| Data science, ML | Python (pandas, PyTorch, scikit-learn) |
| Mobile app native | Swift (iOS), Kotlin (Android) |
| Game engine 3D | C++, Rust |
| Embedded MCU | C, Rust |
| Frontend UI | TypeScript + React/Vue |
| Quick prototype dynamic typing | Python, Ruby |

Go không là "silver bullet" — chỉ là tool phù hợp một số bài toán. Hiểu rõ scope sẽ tránh kiểu "tôi viết frontend bằng Go" không cần thiết.

## Bẫy người mới mắc khi học Go

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Bỏ qua phần fundamental, nhảy vào REST API | Code không hiểu pointer, channel, race condition | Học theo thứ tự, không skip |
| So sánh syntax với Java/Python liên tục | Bối rối, viết code "fake Go" | Chấp nhận triết lý Go: tối giản |
| Bỏ qua project cuối section | Không có muscle memory | Làm hết exercise |
| Đợi đủ kiến thức rồi mới làm project | Không bao giờ làm | Code song song với học |
| Đánh giá course sau 2 video | Mất context, bỏ cuộc sớm | Kiên nhẫn hết section foundation |

## Triết lý "Go-way"

Go không phải Java mặc áo mới. Vài convention dân Go bám rất chặt:

- **Tên ngắn**: `i` cho loop, `err` cho error, `ctx` cho context, `r` cho `*http.Request`.
- **Không có exception**: error là value, return rõ ràng.
- **Không có inheritance**: composition + interface implicit.
- **Một format chuẩn**: `gofmt` chạy mọi nơi, không tranh cãi tab/space.
- **Implicit interface**: type satisfy interface mà không cần `implements`.
- **Concurrency là first-class**: `go func()` chạy goroutine.

Học Go là học một **mindset** mới — không chỉ syntax. Người chuyển từ Java/C# thường bị "withdrawal" 2-3 tuần đầu vì thiếu `class`, `extends`, `try/catch`.

## Yêu cầu sau bài 1

- Có hứng thú học Go (quan trọng nhất).
- Biết command line cơ bản (cd, ls, mkdir).
- Có máy tính (Mac/Windows/Linux đều OK).
- Cài text editor: VSCode + Go extension (khuyến nghị), hoặc GoLand, hoặc vim/neovim.

Không cần biết Java/C++/Python trước. Course này dạy từ con số 0.

## Tóm tắt bài 1

- Go ra đời 2009 tại Google, giải bài toán scale + simplicity.
- Sau hơn 10 năm thống trị cloud-native: Docker, Kubernetes, Terraform, Prometheus đều Go.
- Compile ra binary tĩnh — không cần runtime, deploy 1 file.
- 26 sections gốc → 15+ phases, hết phase 15 là production developer.
- Triết lý: project-based, engineering-first, production-ready.
- KHÔNG dùng Go cho: data science, mobile native, game 3D, frontend.
- Đừng đem mindset Java/Python vào — học "Go-way" từ đầu.

**Bài kế tiếp** → [Bài 2: Cài đặt Go và làm chủ Go toolchain](02-cai-dat-go-va-toolchain.md)
