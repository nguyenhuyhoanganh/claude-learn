# Golang

> Học Go theo cách kỹ sư Google viết Go.

49 bài đi từ cú pháp và mô hình bộ nhớ (slice, map, pointer, escape analysis) qua hàm và xử lý lỗi, composition thay cho kế thừa, generics, **concurrency** (goroutine, channel, select, context), I/O và encoding, testing, tới các dự án thực hành.

**49 bài** trong 15 phần.

## Mục lục

### Phase 1 — foundation

| Bài | Nội dung |
|---|---|
| [01](phase-1-foundation/01-vi-sao-hoc-go.md) | Bài 1: Vì sao Go xứng đáng là ngôn ngữ thứ hai (hoặc thứ nhất) của bạn |
| [02](phase-1-foundation/02-cai-dat-go-va-toolchain.md) | Bài 2: Cài đặt Go và làm chủ Go toolchain |
| [03](phase-1-foundation/03-chuong-trinh-go-dau-tien.md) | Bài 3: Chương trình Go đầu tiên — Hello World + cấu trúc package |

### Phase 2 — core language

| Bài | Nội dung |
|---|---|
| [01](phase-2-core-language/01-values-variables.md) | Bài 1: Values và Variables — Bộ não của mọi chương trình Go |
| [02](phase-2-core-language/02-constants-iota.md) | Bài 2: Constants, iota và Enums "kiểu Go" |
| [03](phase-2-core-language/03-project-custom-logger.md) | Bài 3: Custom Logger — Project đầu tiên áp dụng iota + Stringer |

### Phase 3 — control flow

| Bài | Nội dung |
|---|---|
| [01](phase-3-control-flow/01-for-loop.md) | Bài 1: For loop — Cách duy nhất Go cho phép lặp |
| [02](phase-3-control-flow/02-if-else.md) | Bài 2: if-else và pattern "if với init" đặc trưng Go |
| [03](phase-3-control-flow/03-switch.md) | Bài 3: Switch — Go's secret weapon mạnh hơn Java/C nhiều |
| [04](phase-3-control-flow/04-project-sales-order.md) | Bài 4: Sales Order Processor — Project áp dụng for, if, switch, map |

### Phase 4 — data memory

| Bài | Nội dung |
|---|---|
| [01](phase-4-data-memory/01-arrays.md) | Bài 1: Arrays — Khối xây dựng đầu tiên của collections |
| [02](phase-4-data-memory/02-slices.md) | Bài 2: Slices — Dynamic array của Go (quan trọng nhất) |
| [03](phase-4-data-memory/03-maps.md) | Bài 3: Maps — Hash table built-in mọi Go developer phải master |
| [04](phase-4-data-memory/04-pointers.md) | Bài 4: Pointers — Đăng nhập trực tiếp vào memory |
| [05](phase-4-data-memory/05-slicing-advanced.md) | Bài 5: Slicing nâng cao — sub-slice, copy, package slices |
| [06](phase-4-data-memory/06-project-contact-management.md) | Bài 6: Contact Management System — Project áp dụng struct + slice + map + pointer |

### Phase 5 — functions errors

| Bài | Nội dung |
|---|---|
| [01](phase-5-functions-errors/01-functions-deep.md) | Bài 1: Functions — Function value, closure, named return |
| [02](phase-5-functions-errors/02-multiple-return-error.md) | Bài 2: Multiple return + error là first-class value |
| [03](phase-5-functions-errors/03-defer.md) | Bài 3: defer — Cleanup tự động và đảm bảo thực thi |
| [04](phase-5-functions-errors/04-panic-recover.md) | Bài 4: Panic và Recover — Cơ chế cuối cùng cho lỗi catastrophic |
| [05](phase-5-functions-errors/05-project-math-lib.md) | Bài 5: Safe Math Lib — Project áp dụng function, error, defer, recover |

### Phase 6 — oop composition

| Bài | Nội dung |
|---|---|
| [01](phase-6-oop-composition/01-struct-method.md) | Bài 1: Struct và Method — OOP "kiểu Go" |
| [02](phase-6-oop-composition/02-interfaces.md) | Bài 2: Interfaces — Implicit, mạnh hơn Java |
| [03](phase-6-oop-composition/03-composition-embedding.md) | Bài 3: Composition + Embedding — Thay thế inheritance |
| [04](phase-6-oop-composition/04-generics.md) | Bài 4: Generics — Type parameter từ Go 1.18+ |
| [05](phase-6-oop-composition/05-project-payroll-bank.md) | Bài 5: Payroll Processor + Bank Account — Project áp dụng struct, method, interface, embedding |

### Phase 7 — strings modules

| Bài | Nội dung |
|---|---|
| [01](phase-7-strings-modules/01-strings-runes-bytes.md) | Bài 1: Strings, runes, bytes — Hiểu UTF-8 trong Go |
| [02](phase-7-strings-modules/02-go-modules.md) | Bài 2: Go Modules — Quản lý dependency |

### Phase 8 — concurrency

| Bài | Nội dung |
|---|---|
| [01](phase-8-concurrency/01-goroutines.md) | Bài 1: Goroutines — Concurrency cơ bản của Go |
| [02](phase-8-concurrency/02-channels.md) | Bài 2: Channels — Communication giữa goroutines |
| [03](phase-8-concurrency/03-mutex-sync.md) | Bài 3: Mutex và sync package — Khi channel không đủ |
| [04](phase-8-concurrency/04-project-downloader.md) | Bài 4: Concurrent File Downloader — Project gốc Go concurrency |

### Phase 9 — io encoding

| Bài | Nội dung |
|---|---|
| [01](phase-9-io-encoding/01-file-io.md) | Bài 1: File IO — Read, Write, Buffer, Atomic write |
| [02](phase-9-io-encoding/02-json-encoding.md) | Bài 2: JSON encoding/decoding — Backbone của REST API |

### Phase 10 — database

| Bài | Nội dung |
|---|---|
| [01](phase-10-database/01-database-sql.md) | Bài 1: Database SQL với database/sql + sqlx + pgx |

### Phase 11 — web

| Bài | Nội dung |
|---|---|
| [01](phase-11-web/01-net-http.md) | Bài 1: net/http — Web server từ scratch |

### Phase 12 — testing

| Bài | Nội dung |
|---|---|
| [01](phase-12-testing/01-testing-basics.md) | Bài 1: Testing — table-driven, subtest, benchmark, mock |

### Phase 13 — time web

| Bài | Nội dung |
|---|---|
| [01](phase-13-time-web/01-time-and-randomness.md) | Bài 1: time.Time, format date, Timer/Ticker, random |
| [02](phase-13-time-web/02-web-classic-app.md) | Bài 2: Web Classic App — Router, template, session, form, auth |

### Phase 14 — ecommerce

| Bài | Nội dung |
|---|---|
| [01](phase-14-ecommerce/01-architecture.md) | Bài 1: E-Commerce REST API — Architecture & Project Setup |
| [02](phase-14-ecommerce/02-jwt-auth.md) | Bài 2: JWT Auth, password hashing, middleware, refresh token |
| [03](phase-14-ecommerce/03-service-repository.md) | Bài 3: Service layer + Repository pattern + Dependency Injection |
| [04](phase-14-ecommerce/04-file-upload-s3.md) | Bài 4: File upload S3, CDN, multipart, presigned URL |
| [05](phase-14-ecommerce/05-event-driven.md) | Bài 5: Event-Driven với SQS, Watermill, Email worker |
| [06](phase-14-ecommerce/06-swagger-deploy.md) | Bài 6: Swagger docs + Production deploy + Observability |

### Phase 15 — graphql mcp

| Bài | Nội dung |
|---|---|
| [01](phase-15-graphql-mcp/01-graphql-basics.md) | Bài 1: GraphQL với gqlgen — Schema-first API alternative |
| [02](phase-15-graphql-mcp/02-mocking-search.md) | Bài 2: Advanced Mocking + PostgreSQL Full-text Search |
| [03](phase-15-graphql-mcp/03-mcp-server.md) | Bài 3: MCP Server in Go — Tích hợp AI vào ứng dụng |
| [04](phase-15-graphql-mcp/04-course-summary.md) | Bài 4: Course Summary + Roadmap nâng cao |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới học Go | phase đầu tuần tự, đặc biệt kỹ phần slice và pointer |
| Đến từ Java/Python | chú ý phase composition — Go không có kế thừa |
| Muốn nắm concurrency | phase concurrency là phần cốt lõi của Go |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
