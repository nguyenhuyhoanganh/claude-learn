# Bài 17: Type Aliases — đặt biệt danh cho type để code rõ nghĩa

Bạn thấy `let distance: i32 = 1600;`. Câu hỏi: 1600 cái gì? Mét? Feet? Giây? Type `i32` chỉ nói "số nguyên", không nói **ý nghĩa**. Rust có cách thêm ngữ cảnh ngay vào type: **type alias**.

## Type alias là gì

**Type alias** (biệt danh type) = một **tên thay thế** cho một type đã có. Khai báo bằng keyword `type`.

```rust
type Meters = i32;

fn main() {
    let mile_race: Meters = 1600;
    let two_mile_race: Meters = 3200;
}
```

`Meters` giờ là biệt danh của `i32`. Đọc `let mile_race: Meters = 1600;` ta hiểu ngay: 1600 **mét**, không phải con số vô nghĩa.

Cú pháp:

```text
type Meters = i32 ;
     ──────   ───
     biệt danh type gốc
```

Lưu ý quan trọng: vế phải là **type** (`i32`), **không phải giá trị** (`1600`). Đừng nhầm với `const` (gán giá trị) hay `let` (gán giá trị). `type` gán **type cho một cái tên type**.

| Keyword | Gán gì | Ví dụ |
|---|---|---|
| `let` | giá trị cho biến | `let x = 1600;` |
| `const` | giá trị cho hằng | `const MAX: i32 = 1600;` |
| `type` | **type** cho một tên type | `type Meters = i32;` |

Quy ước đặt tên: alias dùng **PascalCase** (viết hoa chữ đầu mỗi từ), giống mọi tên type khác trong Rust: `Meters`, `UserId`, `JobResult`.

## Quan trọng: alias KHÔNG tạo type mới

Đây là điểm dễ hiểu lầm nhất. `type Meters = i32` **không** đẻ ra một type mới — nó chỉ là **cái tên khác** cho `i32`. Dưới mui xe, `Meters` **chính là** `i32`.

```rust
type Meters = i32;
type Feet = i32;

fn main() {
    let distance: Meters = 1600;
    let height: Feet = 20;

    let nonsense = distance + height;   // BIÊN DỊCH OK — cộng mét với feet!
    println!("{nonsense}");              // 1620
}
```

Cộng mét với feet lẽ ra phải vô lý, nhưng compiler **không chặn** — vì cả hai thực chất là `i32`. Type alias chỉ là **tài liệu cho người đọc**, không phải rào chắn type-safety.

```text
type Meters = i32          Meters, Feet, i32 — đều là MỘT type
type Feet   = i32          (compiler coi như nhau)
        │
        └── chỉ khác tên gọi, không khác bản chất
```

Nếu bạn muốn compiler **thật sự chặn** cộng mét với feet, cần **newtype pattern** (`struct Meters(i32)`) — học ở phase Structs. Type alias là công cụ nhẹ hơn: chỉ tăng độ rõ, không tăng độ an toàn.

## Use case 1: rút gọn type dài dòng

Đây mới là chỗ type alias toả sáng trong code thật. Rust có những type rất dài. Viết đi viết lại thì mỏi và khó đọc:

```rust
use std::collections::HashMap;

// Không alias — lặp lại type khổng lồ mỗi nơi
fn build() -> HashMap<String, Vec<(i32, String)>> { todo!() }
fn merge(a: HashMap<String, Vec<(i32, String)>>) { todo!() }

// Có alias — gọn, một chỗ định nghĩa
type Records = HashMap<String, Vec<(i32, String)>>;
fn build2() -> Records { todo!() }
fn merge2(a: Records) { todo!() }
```

Đổi cấu trúc dữ liệu? Sửa **một dòng** `type Records = ...`, mọi nơi dùng `Records` tự cập nhật. Đây là lợi ích thực dụng nhất của alias trong production.

## Use case 2: Result với error type cố định

Pattern cực phổ biến trong thư viện Rust — định nghĩa một `Result` riêng cho module để khỏi lặp error type:

```rust
use std::fmt;

#[derive(Debug)]
struct AppError(String);

// Thay vì viết Result<T, AppError> khắp nơi:
type Result<T> = std::result::Result<T, AppError>;

fn parse_config(s: &str) -> Result<i32> {       // = Result<i32, AppError>
    s.trim().parse().map_err(|_| AppError("parse fail".into()))
}
```

`std::io::Result<T>` chính là `type Result<T> = Result<T, std::io::Error>` — bạn đã dùng alias mà không biết. Alias có thể nhận **type parameter** (`<T>`), giữ phần tổng quát.

## Đào sâu: alias hoạt động lúc nào

Type alias được **giải quyết tại compile time** — compiler thay mọi `Meters` bằng `i32` trước khi sinh mã. Tại runtime không tồn tại khái niệm "Meters"; chỉ có `i32`. Vì vậy:

- **Zero-cost**: không tốn gì lúc chạy, thuần đường cú pháp.
- **Không type-safety**: vì sau khi thay, mọi alias của cùng type gốc là một.
- Thông báo lỗi compiler có thể hiện cả alias lẫn type gốc để bạn dễ lần.

So sánh ba mức "đặt tên" trong Rust:

| Công cụ | Tạo type mới? | Type-safe? | Chi phí runtime | Mục đích |
|---|---|---|---|---|
| `type X = i32` (alias) | Không | Không | 0 | Rõ nghĩa, rút gọn type dài |
| `struct X(i32)` (newtype) | **Có** | **Có** | 0 (thường) | Chặn nhầm lẫn ở compile time |
| `enum`/`struct` đầy đủ | Có | Có | tuỳ | Mô hình hoá dữ liệu |

## Use case thực tế: domain types cho dự án

```rust
type UserId = u64;
type Timestamp = i64;       // Unix epoch giây
type Money = i64;           // lưu cents, tránh lỗi float

struct Order {
    id: u64,
    user: UserId,           // đọc rõ: đây là ID user, không phải số bất kỳ
    created_at: Timestamp,
    total: Money,           // cents — alias nhắc team đừng dùng float cho tiền
}
```

Dù alias không chặn nhầm lẫn, nó **truyền ý định** cho cả team: thấy `Money` là biết "lưu cents", thấy `Timestamp` là biết "epoch giây". Là tài liệu sống ngay trong chữ ký function/struct.

## Khi nào KHÔNG dùng type alias

- **Cần compiler chặn nhầm lẫn** (mét vs feet, UserId vs ProductId không được lẫn) → dùng **newtype** `struct`, không phải alias.
- **Type đã ngắn gọn, rõ nghĩa** (`i32`, `String`) → alias `type Age = i32` đôi khi thừa, trừ khi muốn nhấn ngữ cảnh domain.
- **Lạm dụng nhiều tầng alias** (`type A = B; type B = C; ...`) → người đọc phải lần ngược nhiều bước, khó hiểu hơn là rõ hơn.

Quy tắc: alias để **rút gọn type dài** hoặc **thêm ngữ cảnh nhẹ**; cần an toàn thật thì lên newtype.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng alias tạo type mới, an toàn | Cộng mét + feet vẫn compile | Nhớ alias = chỉ tên khác; cần chặn thì newtype |
| Gán giá trị thay vì type (`type X = 5`) | Compile error | Vế phải `type` phải là **type** |
| Đặt tên snake_case | Warning | Alias dùng PascalCase |
| Lồng quá nhiều tầng alias | Khó đọc | Giữ alias một tầng, gần định nghĩa |
| Dùng alias mong type-safety | Bug lọt lưới | Dùng `struct Name(T)` cho an toàn |

## Tóm tắt bài 17

- **Type alias** = tên thay thế cho type đã có, khai báo `type Name = ExistingType;`.
- Vế phải là **type**, không phải giá trị (khác `let`/`const`).
- **Không** tạo type mới, **không** thêm type-safety — chỉ là tài liệu, alias của cùng type gốc coi như nhau.
- Giá trị thật: **rút gọn type dài** (`HashMap<String, Vec<...>>`) và **thêm ngữ cảnh domain** (`Money`, `UserId`).
- Có thể nhận type parameter: `type Result<T> = ...` (pattern phổ biến trong lib).
- Cần compiler chặn nhầm lẫn → dùng **newtype struct**, không phải alias.

**Bài kế tiếp** → [Bài 18: Compiler Directives — `#[allow]` và metadata điều khiển compiler](11-compiler-directives.md)
