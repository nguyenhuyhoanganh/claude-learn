# Bài 27: Display, Debug & dbg! — traits in giá trị, `{:?}`, `{:#?}`, macro debug

Bạn thử in mảng: `println!("{}", seasons)` — và Rust **từ chối compile**. Vì sao số in được mà mảng thì không? Câu trả lời giới thiệu một trong những khái niệm quan trọng nhất Rust: **trait** — và hai trait cụ thể (`Display`, `Debug`) quyết định một giá trị có in được hay không, in thế nào.

## Trait là gì — hợp đồng cho type

**Trait** = một **hợp đồng** quy định rằng một type phải hỗ trợ một hoặc nhiều **method**.

Ví von đời thực: một hợp đồng ghi "phải có mặt lúc 9 giờ sáng". Sinh viên, kỹ sư, chuyến bay, gói hàng — đều có thể **honor** (tuân thủ) hợp đồng đó theo cách riêng. Trait y vậy: nó nói "type phải có method X", và mỗi type **implement** (hiện thực) method đó theo logic của mình.

```text
Trait (hợp đồng): "phải có method format() trả về string"
   │
   ├── i32  implement → "13"
   ├── bool implement → "true"
   └── array  KHÔNG implement → không in được
```

Khi type nhận tuân thủ một trait, ta nói nó **implements** trait đó. Type tự chọn implement trait nào — không bắt buộc. Ngôn ngữ khác gọi khái niệm tương tự là **interface** (Java) hoặc **protocol** (Swift). Phase Traits sẽ đào sâu; giờ chỉ cần nắm ý: trait = chuẩn chung để nhiều type cùng hỗ trợ một hành vi.

## Display — chuỗi thân thiện với người dùng

**Display** trait yêu cầu type có thể biểu diễn thành **chuỗi đẹp, dễ đọc cho người dùng cuối**.

Bí mật: cú pháp `{}` bạn dùng suốt khoá học chính là gọi method của Display ngầm sau lưng. Khi compiler thấy `{}`, nó gọi method format của Display để lấy chuỗi.

```rust
fn main() {
    let n = 13;
    let pi = 3.14;
    let flag = true;
    println!("{n} {pi} {flag}");     // OK — i32, f64, bool đều implement Display
}
```

Nhưng **không phải type nào cũng implement Display.** Với type phức tạp (mảng, tuple), không có một cách "hiển thị cho người dùng" hiển nhiên — `[4, 8, 15]` có ý nghĩa với lập trình viên, nhưng với người dùng cuối thì sao? Nên đội Rust **không** implement Display cho mảng:

```rust
let seasons = ["Spring", "Summer", "Fall", "Winter"];
println!("{}", seasons);            // ERROR
```
```text
error[E0277]: `[&str; 4]` doesn't implement `std::fmt::Display`
  = help: the trait `Display` is not implemented for `[&str; 4]`
```

## Debug — chuỗi cho lập trình viên

**Debug** trait giải bài toán đó: biểu diễn type thành **chuỗi cho lập trình viên**, phục vụ debug. Mảng/tuple **có** implement Debug.

Dùng format specifier `:?` (dấu hỏi) để gọi Debug thay vì Display:

```rust
fn main() {
    let seasons = ["Spring", "Summer", "Fall", "Winter"];
    println!("{seasons:?}");        // ["Spring", "Summer", "Fall", "Winter"]
    println!("{:?}", seasons);      // cùng kết quả, cú pháp positional
}
```

```text
{ seasons : ? }
   │       │ │
   │       │ └ ? = dùng Debug trait
   │       └ format specifier
   └ giá trị
```

| Trait | Cú pháp | Dành cho | Mảng? |
|---|---|---|---|
| **Display** | `{}` | Người dùng cuối | Không implement |
| **Debug** | `{:?}` | Lập trình viên | Có implement |

## Pretty-print với `{:#?}`

Thêm `#` trước `?` để **pretty-print** — xuống dòng mỗi phần tử, dễ đọc cho dữ liệu lồng nhau:

```rust
fn main() {
    let seasons = ["Spring", "Summer", "Fall", "Winter"];
    println!("{seasons:#?}");
}
```
```text
[
    "Spring",
    "Summer",
    "Fall",
    "Winter",
]
```

`{:?}` gọn một dòng; `{:#?}` trải nhiều dòng — chọn theo độ phức tạp dữ liệu.

| Specifier | Output |
|---|---|
| `{:?}` | `["Spring", "Summer", ...]` (một dòng) |
| `{:#?}` | mỗi phần tử một dòng (pretty) |

## Bật Debug cho type của bạn: `#[derive(Debug)]`

Struct/enum bạn tự định nghĩa (phase sau) **mặc định không** in được — phải opt-in Debug bằng compiler directive `#[derive(Debug)]`:

```rust
#[derive(Debug)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let p = Point { x: 1, y: 2 };
    println!("{p:?}");              // Point { x: 1, y: 2 }
    println!("{p:#?}");             // pretty: mỗi field một dòng
    // println!("{p}");            // ERROR — chưa implement Display
}
```

`#[derive(Debug)]` bảo compiler **tự sinh** code Debug — bạn khỏi viết tay. Đây là lý do `#[derive(Debug)]` xuất hiện trên gần như mọi struct bạn sẽ viết. (Nhớ `#[derive(...)]` từ bài Compiler Directives — đây là ứng dụng quan trọng nhất của nó.) Display thì **không** derive được — phải tự implement (phase Traits).

## Macro `dbg!` — debug nhanh và bẩn

`dbg!` là **macro** (kết thúc bằng `!` như `println!`) để debug nhanh. Nó in **kèm tên file, số dòng, code gốc, và giá trị** ở dạng Debug:

```rust
fn main() {
    let x = dbg!(2 + 2);            // in chi tiết, VÀ trả lại giá trị cho x
    let seasons = ["Spring", "Summer"];
    dbg!(&seasons);
}
```
```text
[src/main.rs:2:13] 2 + 2 = 4
[src/main.rs:4:5] &seasons = [
    "Spring",
    "Summer",
]
```

`dbg!` cho biết:
- **File + dòng** (`src/main.rs:2`) — biết debug ở đâu, hữu ích trong project nhiều file.
- **Code gốc** (`2 + 2`) — biết biểu thức nào.
- **Giá trị** (`4`) — kết quả, dạng Debug.

Khác `println!`, `dbg!` **trả lại giá trị** nó nhận → chèn được giữa biểu thức mà không phá luồng:

```rust
let total = dbg!(price * quantity) + tax;   // vẫn tính bình thường, kèm in debug
# let (price, quantity, tax) = (10, 3, 5);
```

Argument của `dbg!` phải implement Debug. **Đừng để `dbg!` trong code production** — nó thuần cho dev, xoá sau khi xong.

| Công cụ | Mục đích | Ghi chú |
|---|---|---|
| `println!("{}")` | In Display cho user | type phải có Display |
| `println!("{:?}")` | In Debug cho dev | gọn |
| `println!("{:#?}")` | In Debug pretty | dữ liệu lồng nhau |
| `dbg!(x)` | Debug nhanh + vị trí | xoá trước khi ship |

## Đào sâu: trait quyết định khả năng — không phải mặc định

Điểm cốt lõi: trong Rust, một type **không tự nhiên** in được. Nó in được **chỉ vì** đã implement Display/Debug. Đây là triết lý "explicit over implicit": khả năng của một type được khai báo rõ qua trait nó implement, không phải ma thuật ngầm.

Hệ quả thực tế bạn sẽ gặp liên tục:
- Quên `#[derive(Debug)]` trên struct → không `{:?}` được → compiler nhắc thêm derive.
- Muốn `{}` cho struct → phải tự viết `impl Display` (không derive được) vì Rust không đoán được "cách đẹp" để hiển thị dữ liệu của bạn.

Cùng họ derive hữu ích: `#[derive(Debug, Clone, PartialEq)]` — Debug để in, Clone để copy, PartialEq để so `==`. Gặp khắp nơi.

## Use case thực tế

```rust
#[derive(Debug)]
struct Order {
    id: u32,
    items: u32,
    total: f64,
}

fn main() {
    let order = Order { id: 1001, items: 3, total: 59.99 };

    dbg!(&order);                   // debug nhanh lúc phát triển

    // Log có cấu trúc cho dev:
    println!("Đơn hàng: {order:?}");

    // Hiển thị cho user (tự ghép, vì Order không có Display):
    println!("Đơn #{} — {} món — {:.2}đ", order.id, order.items, order.total);
}
```

Debug cho log/dev, còn output cho user thì ghép chuỗi thủ công bằng các field — vì Display không tự có.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `{}` cho mảng/tuple/struct | Compile error (no Display) | Dùng `{:?}` |
| Quên `#[derive(Debug)]` trên struct | `{:?}` lỗi | Thêm derive |
| Mong `{}` cho struct sau derive | Display không derive được | Tự `impl Display` |
| Để `dbg!` trong production | Rò log, bẩn output | Xoá sau khi debug |
| Tưởng `dbg!` không trả giá trị | Thực ra trả lại | Dùng được giữa biểu thức |
| Nhầm Debug trait vs `dbg!` macro | Lẫn lộn khái niệm | Trait = hợp đồng; macro = lệnh in |

## Tóm tắt bài 27

- **Trait** = hợp đồng buộc type hỗ trợ method; type **implement** mới có khả năng đó.
- **Display** (`{}`): chuỗi cho người dùng — số/bool/float có, mảng/tuple **không**.
- **Debug** (`{:?}`): chuỗi cho lập trình viên — mảng/tuple **có**; `{:#?}` pretty-print.
- Struct tự định nghĩa: `#[derive(Debug)]` để in `{:?}`; Display phải tự implement.
- **`dbg!(x)`** in file+dòng+code+giá trị, **trả lại** giá trị; chỉ dùng khi dev, xoá trước khi ship.
- Triết lý: khả năng in là **explicit** qua trait, không mặc định ngầm.

**Bài kế tiếp** → [Bài 28: Tuple & Ranges — gộp type khác nhau, destructuring, range, vòng for](09-tuple-va-ranges.md)
