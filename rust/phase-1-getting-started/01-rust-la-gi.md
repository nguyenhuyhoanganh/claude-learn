# Bài 1: Rust là gì và compiler hoạt động ra sao

Rust **không** chỉ là "thêm một ngôn ngữ" giữa rừng Python, Java, Go. Nó là một câu trả lời khác cho câu hỏi cũ: làm sao để code **nhanh như C** mà không phải sống trong sợ hãi `segmentation fault` hay `use-after-free`? Bài đầu tiên này dạy bạn đặt Rust đúng chỗ trên bản đồ ngôn ngữ, hiểu compiler làm gì, và quan trọng nhất — đặt tâm thế cho hành trình học một ngôn ngữ **nghiêm khắc nhất ngành**.

## Đặt Rust vào bản đồ ngôn ngữ

Có hàng trăm ngôn ngữ lập trình. Để hiểu Rust, hãy xếp nó vào nhóm:

| Nhóm | Đại diện | Ưu | Nhược | Quản lý bộ nhớ |
|---|---|---|---|---|
| **Systems programming** | C, C++, Rust, Zig | Cực nhanh, control tuyệt đối tài nguyên | Khó viết, dễ bug bộ nhớ | Manual / static |
| **Garbage collected** | Java, C#, Go, Python | Dễ viết, không lo memory | Có pause GC, ăn RAM | Tự động (GC) |
| **Scripting** | Python, JavaScript, Ruby | Viết nhanh | Chạy chậm hơn | Tự động + interpreter |
| **Functional** | Haskell, OCaml, Elixir | Reasoning toán học | Curve dốc | Tự động |

**Rust thuộc nhóm systems programming** — cùng nhóm C/C++. Nhưng khác biệt **cốt lõi**:
- C/C++: bạn tự lo bộ nhớ, compiler tin bạn. Bug nhiều, security holes nhiều.
- Rust: compiler **bắt buộc** bạn lo bộ nhớ đúng cách. Bug bộ nhớ **bị catch lúc compile**.

Khẩu hiệu chính thức Rust: **"Fast, reliable, productive — pick three"**.

## Systems programming nghĩa là gì?

"Systems programming" = lập trình các phần mềm có **giới hạn tài nguyên khắt khe**:
- Operating system kernel (Linux, macOS lõi).
- Database engine (PostgreSQL, Redis).
- Browser engine (Chrome's V8, Firefox's Servo).
- Game engine (Unreal).
- Embedded firmware (IoT, automotive).
- Cryptocurrency wallet, blockchain node.

Nhóm phần mềm này:
- Phải chạy với **dung lượng RAM nhỏ** (đôi khi 1 MB cho IoT).
- Phải chạy **siêu nhanh** (browser render < 16ms/frame).
- Phải chạy **trực tiếp với phần cứng** (driver disk, network).
- **Không có chỗ cho garbage collector** — pause 50ms cũng đã hỏng experience.

Rust giải bài toán này: tốc độ C, an toàn bộ nhớ tự động, không GC.

## Lịch sử nhanh

- **2006**: Graydon Hoare (Mozilla engineer) bắt đầu project Rust như side-project cá nhân.
- **2010**: Mozilla công bố Rust public, đầu tư team chính thức.
- **2015**: Rust 1.0 ra mắt — backward compatibility guarantee.
- **2017-2020**: Servo browser engine, Firefox tích hợp component Rust. Cloudflare, Dropbox dùng production.
- **2021**: Rust Foundation thành lập (AWS, Google, Microsoft, Mozilla, Huawei tài trợ).
- **2023-2024**: Linux kernel chính thức accept Rust code. Windows kernel cũng có Rust.
- **2025-2026**: Rust trong top 10 Stack Overflow Developer Survey, **most loved language** 9 năm liên tiếp.

## Rust dùng để build gì?

Bài transcript liệt kê:
- **Command-line tools**: `ripgrep` (thay `grep`), `fd` (thay `find`), `bat` (thay `cat`), `exa` (thay `ls`).
- **Build tools**: webpack thay bằng Turbopack, esbuild có version Rust.
- **Device drivers**: kernel-level code.
- **Databases**: SurrealDB, Materialize, TiKV.
- **Programming languages**: Deno (JS runtime), Ruff (Python linter), Biome.
- **Web applications**: backend với Axum, Actix-web; frontend với Yew, Leptos (WebAssembly).
- **Operating systems**: Redox OS.

Công ty dùng production: **AWS** (Firecracker — virtualization cho Lambda), **Microsoft** (Windows kernel components), **Mozilla** (Firefox), **Cloudflare** (Pingora — proxy thay nginx), **Discord** (Read States service), **Dropbox** (file sync), **Figma** (multiplayer sync), **Meta** (source control), **1Password** (engine).

## Vì sao học Rust năm 2026?

3 lý do thực dụng:

### 1. Lương cao
Stack Overflow Survey 2025: Rust developer **median salary** ~$120k (US), so với Python ~$100k. Lý do: ít developer, demand cao. Theo HackerRank và DevSkiller, kỹ năng Rust được trả thêm 20-30%.

### 2. Kiến thức transferable
Học Rust = học **system-level mindset**. Sau Rust, code Python/JavaScript của bạn cũng tốt hơn vì bạn hiểu memory, ownership, concurrency sâu hơn.

### 3. Tương lai dài
Linux kernel + Windows + ChromeOS + Android (Project Treble) đều thêm Rust. Big tech invest 10+ năm tiếp theo. Skill này không "out" sớm.

## Rust compiler — kẻ gác cổng

**Compiler** = chương trình **dịch** source code (mã bạn viết) thành **machine code** (mã CPU hiểu được).

```text
source code (main.rs)           machine code (executable)
                                
fn main() {                       0F 1E FA 55 48 89 E5 48
    println!("Hello");      ──►   83 EC 20 48 8D 35 49 0E
}                                 00 00 48 8D 3D 4A 0E ...
                  ↑                            ↑
   bạn viết được                    chỉ CPU hiểu được
   (text human readable)            (binary - bytes)
```

3 từ kỹ thuật cần phân biệt:

| Từ | Nghĩa |
|---|---|
| **Source code** | Mã text bạn viết (`.rs` cho Rust, `.py` cho Python, `.c` cho C) |
| **Machine code** | Binary CPU thực thi trực tiếp |
| **Executable** (a.k.a. **binary**) | File chứa machine code, OS biết cách run |

Compiler Rust = **`rustc`**. Khi gõ `rustc main.rs`, nó:
1. **Lex**: tách source code thành tokens (`fn`, `main`, `(`, `)`, `{`, ...).
2. **Parse**: dựng cây AST (Abstract Syntax Tree).
3. **Type check**: verify mọi biến có type đúng.
4. **Borrow check** (đặc trưng Rust!): verify ownership rules.
5. **Optimize**: rewrite code cho nhanh hơn (dead code elimination, inline, loop unrolling).
6. **Codegen**: phát machine code cho CPU đích.

Tổng cộng, Rust compiler **rất chậm** so với Python interpreter (tất nhiên), nhưng output rất nhanh.

## Compiled vs Interpreted — hiểu thật

```text
Compiled language (Rust, C, C++, Go):
   source.rs ──[compile]──► binary ──[run]──► output
                            ↑
                  máy này build, chạy được khắp nơi cùng arch

Interpreted language (Python, Ruby, JavaScript):
   source.py ──[interpreter on the fly]──► output
              ↑
   máy nào chạy cũng phải có interpreter sẵn
```

| | Compiled | Interpreted |
|---|---|---|
| Tốc độ runtime | Nhanh | Chậm hơn 10-100x |
| Cần tool runtime | Không (đã đóng gói) | Phải có interpreter |
| Edit-run cycle | Compile lại (chậm) | Edit → run ngay |
| Distribute | Ship 1 binary | Ship source + cần env |
| Error catch | Lúc compile (sớm) | Lúc run (muộn) |

Rust là **compiled** → bug được catch sớm, runtime nhanh, ship 1 file.

> **JIT (Just-In-Time)** như Java, JavaScript là kiểu lai: compile tại lúc chạy, có cache. Phức tạp, không bàn ở đây.

## Syntax — Rust nghiêm khắc thế nào

**Syntax** = các ký tự và quy tắc viết code. Mỗi ngôn ngữ có syntax riêng. Compiler Rust **rất nghiêm** so với Python, JavaScript:

| Loại lỗi | Python | JavaScript | Rust |
|---|---|---|---|
| Sai chính tả tên biến | Lỗi lúc chạy | Có thể imply tạo biến mới (`undefined`) | Lỗi compile ngay |
| Thiếu dấu chấm phẩy | Có thể OK (Python ko cần) | OK (auto-insert) | Lỗi compile |
| Sai type | Lỗi lúc chạy | Convert silently | Lỗi compile |
| Dùng biến chưa khởi tạo | Lỗi runtime | `undefined` | Lỗi compile |
| Dùng biến đã free | Crash (segfault) ở C | N/A (có GC) | Lỗi compile (borrow checker) |

Rust catch nhiều bug **lúc compile** = developer feedback loop nhanh, production ít bug.

### Những thứ Rust "khó tính" về

- **Case sensitive**: `MyVar` ≠ `myvar` ≠ `myVar`. Compiler báo lỗi nếu bạn tham chiếu sai case.
- **Whitespace**: 1 space ≠ 2 spaces ở một số chỗ. Nhưng dấu cách giữa tokens thì OK.
- **Symbol**: `;` không phải `,`. `()` không phải `[]`. `{}` không phải `()`.
- **Line break**: Tab ≠ space, nhưng Rust thường tự reformat.
- **Brackets**: Mỗi `{` phải có `}` đóng. Mỗi `(` phải có `)`.

Beginner thường nản vì lỗi compile. Tin tôi: sau 1 tháng, bạn sẽ thấy ngược lại — compiler là **người bạn tốt nhất**. Mỗi error message chỉ rõ dòng nào sai, sai gì, đôi khi gợi ý fix.

## Tâm thế lúc học

Cách hiệu quả:
1. **Copy y hệt** code instructor gõ — đảm bảo môi trường giống.
2. Verify code chạy đúng → mới bắt đầu modify.
3. Khi modify, đổi 1 thứ tại 1 thời điểm → nếu lỗi biết ngay đâu sai.
4. **Đọc compiler error**. Đừng panic. Error message Rust nổi tiếng tốt — đọc kỹ, hiểu, fix.
5. Đừng google ngay. Thử 5-10 phút tự fix trước → google.

Cách **sai lầm**:
1. Copy 50 dòng cùng lúc, không chạy thử từng phần.
2. Sửa nhiều thứ cùng lúc.
3. Skip error message, chạy thử random.
4. So sánh với Python/JavaScript: "code này ở Python work mà". Rust ≠ Python.

## Rustacean — văn hoá cộng đồng

Lập trình viên Rust gọi nhau là **Rustaceans** — chơi chữ từ "crustaceans" (lớp giáp xác như tôm, cua). Mascot không chính thức của Rust là con cua tên **Ferris**.

Cộng đồng Rust nổi tiếng:
- **Welcoming**: documentation tốt, RFC process minh bạch.
- **Compiler error**: được design để **helpful** chứ không "khinh user".
- **Forum / Discord**: helpful, không gatekeep.

## Tóm tắt bài 1

- Rust = systems programming language, cùng nhóm C/C++ nhưng an toàn hơn.
- 2006 Graydon Hoare, 2010 Mozilla, 2015 stable 1.0, 2024 Linux kernel.
- Compiler = chương trình dịch source code sang machine code. Rust dùng `rustc`.
- Compiled language: nhanh runtime, catch bug sớm, ship 1 file.
- Syntax cực nghiêm — đổi lại catch bug nhiều ở compile time.
- Tâm thế học: copy đúng, modify ít một, đọc kỹ error message.
- Cộng đồng welcoming — không panic khi gặp error.

**Bài kế tiếp** → [Bài 2: Cài đặt Rust trên macOS](02-cai-dat-rust-macos.md)
