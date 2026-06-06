# Bài 74: Tuple struct & unit-like struct — hai loại struct còn lại

Rust có 3 loại struct: **named field** (đã học suốt phase), **tuple struct**, và **unit-like struct**. Hai loại sau ít gặp hơn nhưng có vai trò riêng: tuple struct cho **type-safety** (phân biệt hai thứ cùng dữ liệu nhưng khác ý nghĩa), unit-like struct cho struct **không dữ liệu** nhưng vẫn mang method. Bài này khép lại bức tranh struct.

## Tuple struct — field theo vị trí, không tên

**Tuple struct** giống tuple: lưu nhiều giá trị khác type, nhưng **không tên field** — mỗi field có **vị trí** (index từ 0). Khác tuple thường: nó có **tên type**.

```rust
struct ShortDuration(u32, u32);      // hours, minutes — KHÔNG tên field
struct LongDuration(u32, u32);       // years, months
```

```text
struct ShortDuration(u32, u32);
│      │             │
│      │             └ type các field theo VỊ TRÍ (như tuple)
│      └ tên type
└ keyword
```

- `struct` + tên + **`()`** (như tuple, không `{}`) + type các field theo thứ tự + `;`.
- Field không tên, chỉ vị trí.

Tạo instance dùng `()` (như tuple), truy cập bằng `.0`, `.1`:

```rust
fn main() {
    let work_shift = ShortDuration(8, 0);        // 8 giờ 0 phút
    println!("{} giờ {} phút", work_shift.0, work_shift.1);   // .0, .1

    let era = LongDuration(5, 3);                // 5 năm 3 tháng
    println!("{} năm {} tháng", era.0, era.1);
}
# struct ShortDuration(u32, u32);
# struct LongDuration(u32, u32);
```

Cú pháp luôn theo khai báo: khai bằng `()` → tạo bằng `()`, truy cập bằng `.index`.

## Lợi ích tuple struct: type-safety qua tên

Vì sao dùng tuple struct thay tuple thường? **Tên type tạo type riêng biệt** — chống nhầm lẫn. Xét tuple thường:

```rust
let work_shift = (8, 0);             // (u32, u32)
let era = (5, 3);                    // (u32, u32) — CÙNG type!
```

Với compiler, `work_shift` và `era` **cùng type** `(u32, u32)` — dù ý nghĩa khác (ca làm vs kỷ nguyên). Hệ quả: truyền nhầm không bị bắt:

```rust
fn go_to_work(length: (u32, u32)) { /* ... */ }

go_to_work(work_shift);              // OK — đúng ý
go_to_work(era);                     // OK?! — SAI ý nhưng compiler KHÔNG bắt
# fn go_to_work(length: (u32, u32)) {}
# let work_shift = (8, 0); let era = (5, 3);
```

Tuple struct sửa điều này — `ShortDuration` và `LongDuration` là **hai type khác nhau** dù cùng `(u32, u32)`:

```rust
fn go_to_work(length: ShortDuration) { /* ... */ }

go_to_work(work_shift);              // OK — ShortDuration
go_to_work(era);                     // ERROR — era là LongDuration, không phải ShortDuration!
# struct ShortDuration(u32, u32); struct LongDuration(u32, u32);
# fn go_to_work(length: ShortDuration) {}
# let work_shift = ShortDuration(8,0); let era = LongDuration(5,3);
```
```text
error[E0308]: mismatched types: expected `ShortDuration`, found `LongDuration`
```

Tên type = định danh riêng → compiler bắt nhầm lẫn. Đây là **newtype pattern** (nhắc lại bài 17): bọc dữ liệu trong type riêng để an toàn hơn, dùng `struct Name(T)` thay vì alias.

| | Tuple `(u32, u32)` | Tuple struct |
|---|---|---|
| Có tên type? | Không | **Có** |
| Hai thứ cùng dữ liệu phân biệt? | Không (cùng type) | **Có** (type khác nhau) |
| Compiler bắt nhầm? | Không | **Có** |

Tuple struct cũng **khác** tuple thường — không truyền tuple vào nơi cần tuple struct và ngược lại.

## Use case tuple struct: newtype wrapper

Phổ biến: bọc một giá trị để tạo type domain rõ nghĩa, chống nhầm:

```rust
struct Meters(f64);
struct Feet(f64);
struct UserId(u32);
struct ProductId(u32);

fn main() {
    let distance = Meters(100.0);
    let height = Feet(20.0);
    // Compiler chặn cộng Meters với Feet, hay nhầm UserId với ProductId
    println!("{}", distance.0);      // truy cập giá trị bên trong qua .0
}
```

`UserId(u32)` và `ProductId(u32)` cùng là `u32` nhưng type khác → không lẫn ID người dùng với ID sản phẩm. An toàn hơn dùng `u32` trần. Tuple struct một field (`struct Meters(f64)`) là dạng newtype kinh điển.

## Unit-like struct — struct không field

**Unit-like struct** = struct **không có field nào** (gợi nhớ unit type `()` — tuple rỗng):

```rust
struct Empty;                        // không field, chỉ tên + ;

fn main() {
    let my_empty = Empty;            // tạo: chỉ tên, không () không {}
}
```

```text
struct Empty;        ← không {} (named), không () (tuple) — chỉ ;
let x = Empty;       ← tạo instance: chỉ tên
```

Không field nghe vô dụng? Nhưng vẫn **định nghĩa method** được, và hữu ích trong vài design pattern. Bạn ít gặp, nhưng cần nhận ra cú pháp:

```rust
struct Logger;

impl Logger {
    fn log(&self, msg: &str) {       // method dù không field
        println!("[LOG] {msg}");
    }
}

fn main() {
    let logger = Logger;
    logger.log("Khởi động");         // [LOG] Khởi động
}
```

`Logger` không lưu dữ liệu, nhưng nhóm hành vi (method `log`). Use case thực tế: marker type, implement trait mà không cần state (phase Traits), zero-sized type cho generics. Hiếm gặp lúc mới học — chỉ cần biết nó tồn tại.

## So sánh 3 loại struct

| Loại | Cú pháp định nghĩa | Tạo instance | Truy cập | Khi dùng |
|---|---|---|---|---|
| **Named field** | `struct S { f: T }` | `S { f: v }` | `s.f` (tên) | Phổ biến nhất — dữ liệu có nghĩa |
| **Tuple struct** | `struct S(T, T);` | `S(v, v)` | `s.0` (vị trí) | Newtype, ít field, type-safety |
| **Unit-like** | `struct S;` | `S` | (không field) | Marker, method không state |

```text
named field : struct Coffee { name: String, price: f64 }   ← field có tên
tuple struct: struct Point(i32, i32)                        ← field theo vị trí
unit-like   : struct Marker;                                ← không field
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Truy cập tuple struct bằng tên field | Không có tên | Dùng `.0`, `.1` |
| Truyền tuple thường vào nơi cần tuple struct | Type mismatch | Tạo đúng tuple struct |
| Dùng tuple thường khi cần phân biệt ý nghĩa | Nhầm lẫn không bị bắt | Dùng tuple struct (newtype) |
| Tạo unit-like struct bằng `Empty()` hay `Empty {}` | Lỗi | Chỉ `Empty` |
| Tuple struct nhiều field khó đọc (.3, .4) | Mất nghĩa | Nhiều field → named field struct |

## Tóm tắt bài 74

- Rust có 3 loại struct: **named field** (phổ biến), **tuple struct**, **unit-like**.
- **Tuple struct** `struct S(T, T);`: field theo **vị trí** (`.0`, `.1`), tạo bằng `()`; có **tên type**.
- Lợi ích tuple struct: **type-safety** — tên type phân biệt hai thứ cùng dữ liệu khác ý nghĩa (newtype pattern, chống nhầm).
- **Unit-like struct** `struct S;`: **không field**, tạo bằng chỉ tên; vẫn định nghĩa method được (marker, no-state).
- Named field cho dữ liệu có nghĩa; tuple struct cho newtype/ít field; unit-like cho marker.

**Bài kế tiếp** → [Bài 75: Project & Section Review — Flight struct, tổng kết phase](10-project-va-review.md)
