# Bài 29: Generics Intro & Section Review — type là argument, `Range<T>`, tổng kết Data Types

Khi bạn xem type của `1..31`, rust-analyzer hiện `Range<i32>`. Hai dấu `< >` đó — và chữ `i32` bên trong — là **generic**, một trong những khái niệm mạnh nhất Rust. Bài này giới thiệu generic ở mức cao (phase Generics sẽ đào sâu), rồi tổng kết toàn bộ phase Data Types.

## Vấn đề generic giải quyết

Hãy nhìn lại Range. Range có thể là range của số (`1..31`) hoặc của ký tự (`'b'..'f'`). Cả hai đều là Range — nhưng "range **của cái gì**" khác nhau.

Tưởng tượng bạn là người viết type Range đầu tiên. Bạn **không thể** biết trước mọi loại dữ liệu người ta sẽ muốn tạo range: i32, i8, char, hay type tương lai chưa tồn tại. Viết riêng `RangeOfI32`, `RangeOfChar`, `RangeOfI8`... là điên rồ. Giải pháp: **generic**.

## Generic là gì — type làm argument

**Generic** = một **type argument** (đối số là type). Đây là điểm then chốt:

- **Argument thường** = input là **giá trị** (vd `5`, `"hello"`) truyền cho function/method.
- **Generic** = input là **type** (vd `i32`, `char`) — không phải giá trị, mà là *loại* dữ liệu.

```text
value (giá trị):  5        "hello"     true
type  (loại):     i32      &str        bool
                  └─ generic truyền những thứ NÀY làm argument
```

Generic là **placeholder cho một type tương lai**. Y như parameter là placeholder cho một giá trị tương lai:

| Khái niệm | Placeholder cho | Giá trị cụ thể |
|---|---|---|
| Parameter | giá trị | argument (`5`) |
| **Generic** | **type** | **type cụ thể** (`i32`) |

## Ví von cái hộp

Một cái hộp là một *type* đồ vật. Nhưng hộp đặc biệt: nó chứa được **nhiều loại** thứ — sách, chai, đồ chơi. Nếu nhà sản xuất nói "hộp này **chỉ** đựng sách", giá trị cái hộp giảm hẳn. Hộp hữu ích **chính vì** đựng được nhiều loại.

Range giống cái hộp. Người viết Range nói: "Range chứa giá trị của **type generic** `T` — bạn quyết `T` là gì khi tạo range cụ thể." Chữ `T` (theo quy ước, viết hoa) là **tên cho type chưa xác định**.

```text
Range<T>          T = placeholder generic
   │
   ├── Range<i32>   khi T = i32  → 1..31
   └── Range<char>  khi T = char → 'b'..'f'
```

"Generic" trong đời thường nghĩa là "không cụ thể" — đúng bản chất: generic là type **chưa cụ thể**, chỉ là chỗ trống cho type cụ thể điền vào sau.

## Angle brackets `< >` — cú pháp generic

Type cụ thể điền vào generic nằm trong **angle bracket** `< >`:

```rust
let nums: Range<i32> = 1..31;       // T = i32
let chars: Range<char> = 'b'..'f';  // T = char
```

Nhưng `Range` không nằm ở top-level Rust — nó nằm trong một **module** (như thư mục). Phải dùng đường dẫn đầy đủ qua `::`:

```rust
use std::ops::Range;

fn main() {
    let month_days: Range<i32> = 1..31;
    let letters: Range<char> = 'b'..'f';
}
```

```text
std :: ops :: Range < i32 >
 │     │      │       │
 │     │      │       └ type cụ thể điền vào generic
 │     │      └ type Range
 │     └ module 'ops' (operators)
 └ standard library (thư viện chuẩn)
```

`::` = đi sâu vào module (như `/` trong đường dẫn file). `std` = standard library — kho tính năng built-in. Phase Project Structure đào sâu module và `use`. Bình thường bạn **không cần** annotate `Range<T>` thủ công (Rust infer được); đây chỉ để thấy generic trông ra sao.

Nếu type generic không khớp, compiler bắt lỗi:

```rust
let letters: Range<i8> = 'b'..'f';  // ERROR — range char nhưng khai i8
```

## Generic ở khắp Rust

Bạn đã gặp generic mà không biết:

```rust
Vec<i32>            // vector chứa i32 (phase Vectors)
Option<String>      // có thể có String hoặc không (phase Option)
Result<i32, Error>  // thành công i32 hoặc lỗi (phase Error Handling)
HashMap<String, i32>// map key String → value i32 (phase HashMaps)
```

Generic cho phép **một** type (Vec, Option, Range) làm việc với **mọi** type bên trong — tái sử dụng tối đa, vẫn type-safe. Phase Generics dạy cách tự viết generic cho function/struct của bạn.

---

# Project Solution — ráp toàn phase Data Types

```rust
const TOUCHDOWN_POINTS: i32 = 6;

fn main() {
    let distance: i32 = 1_337;                  // integer + _ separator

    let miles = distance as i16;                 // casting i32 → i16

    let height = 150.345_46;                     // f64
    println!("{height:.3}");                     // format specifier → 150.345

    let with_milk = true;                        // bool
    let with_sugar = true;

    let is_my_type = with_milk && with_sugar;    // AND logic → true
    let is_acceptable = with_milk || with_sugar; // OR logic → true

    let distances: [i8; 4] = [13, 23, 75, 100];  // array i8
    println!("{distances:?}");                    // Debug → [13, 23, 75, 100]

    let combo = (miles, height, is_my_type, distances);  // tuple gộp khác type
    println!("{combo:#?}");                       // pretty Debug
}
```

| Bước | Khái niệm dùng |
|---|---|
| `1_337` | integer + dấu `_` phân cách |
| `distance as i16` | casting với `as` |
| `{height:.3}` | format specifier (3 chữ số) |
| `&&`, `||` | AND/OR logic trả bool |
| `[i8; 4]` | array đồng nhất, annotate type+length |
| `{distances:?}` | Debug trait (array không có Display) |
| `(miles, height, ...)` | tuple gộp type khác nhau |
| `{combo:#?}` | pretty-print Debug |

---

# Section Review — tổng kết phase Data Types

## Số

- **Integer**: signed (`i`, âm+dương) / unsigned (`u`, 0+dương); số = bit; mặc định `i32`.
- **Float**: `f32` / `f64` (mặc định); precision có giới hạn → rounding error; không so `==`, không dùng cho tiền.
- `usize`/`isize`: đổi kích thước theo máy; dùng để **index**.
- `_` phân cách trang trí; overflow debug panic / release wrap.

## Casting & phép toán

- `as` cast type (cắt âm thầm nếu không vừa → `try_into` an toàn).
- Floor division: integer/integer trả integer (`5/3=1`); `%` lấy dư.
- Augmented: `+= -= *= /= %=`; không có `++`/`--`; không ép type ngầm.

## bool & char & string

- `bool`: `true`/`false`; `!` đảo; `==`/`!=`/`&&`/`||`; short-circuit.
- `char`: một ký tự Unicode `'x'`, 4 byte; khác string `"x"`.
- String: `&str` literal; ký tự đặc biệt `\n \t \"`; raw string `r"..."`.

## Method & trait

- **Method**: hàm trên giá trị, `value.method(args)`; chain được.
- **Trait**: hợp đồng buộc type hỗ trợ method.
- **Display** (`{}`) cho user; **Debug** (`{:?}`, `{:#?}`) cho dev; `dbg!` macro debug nhanh.

## Compound types

- **Array** `[T; N]`: cố định, đồng nhất; index từ 0; out-of-bounds panic; trên stack.
- **Tuple** `(...)`: gộp khác type; truy cập `.0`; destructuring `let (a,b)=t`.
- **Range** `a..b` / `a..=b`: dãy liên tục; **for** duyệt iterable.

## Generic

- Generic = **type làm argument**; placeholder cho type tương lai (`Range<T>`, `Vec<T>`).
- Cho phép một type làm việc với mọi type bên trong — tái sử dụng + type-safe.

## Bản đồ phase Data Types

```text
Scalar ─┬─ integer (i/u, bit, overflow)
        ├─ float (f32/f64, precision, format specifier)
        ├─ bool (&&, ||, !, ==, short-circuit)
        └─ char (Unicode, 4 byte)

String  ── &str literal, escape, raw string
Method  ── value.method(), chain
Trait   ── Display {} / Debug {:?} / dbg!

Compound┬─ array [T; N] (cố định, stack)
        └─ tuple (...) (khác type, destructure)

Range   ── a..b / a..=b + for loop
Generic ── type là argument (Range<T>)
```

Phase này là "buffet" — nếm qua nhiều khái niệm cốt lõi (method, trait, generic) mà các phase sau sẽ đào sâu. Bạn giờ biết **mỗi giá trị thuộc type gì** và Rust kiểm soát type chặt ra sao. Phase tiếp theo: **function** — cách đóng gói logic thành khối tái sử dụng, với parameter, return value, và phân biệt statement vs expression (chìa khoá hiểu cú pháp Rust).

## Tóm tắt bài 29

- **Generic** = type làm argument, placeholder cho type cụ thể tương lai (như parameter cho giá trị).
- `Range<T>`, `Vec<T>`, `Option<T>`… dùng generic — một type làm việc với mọi type bên trong.
- Angle bracket `< >` chứa type cụ thể; `std::ops::Range` qua module path `::`.
- Phase Data Types phủ: số, bool, char, string, method, trait, array, tuple, range, generic.
- Khái niệm method/trait/generic được giới thiệu sớm, đào sâu ở các phase sau.

**Bài kế tiếp** → [Bài 30: Intro Functions & Parameters — đóng gói logic, tham số, đối số](../phase-4-functions/01-intro-functions-parameters.md)
