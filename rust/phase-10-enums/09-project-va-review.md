# Bài 84: Project & Section Review — Subscription enum, tổng kết phase

Hết phase Enums. Project này dựng hệ thống subscription dùng enum lồng, ba loại variant, method với `match`. Sau đó tổng kết toàn phase — và nhìn lại bộ ba mô hình hoá dữ liệu (struct + enum + match).

## Đề bài project

1. `Tier` enum: `Gold`, `Silver`, `Platinum` (variant trơn).
2. `Subscription` enum: `Free` (trơn), `Basic(f64, u32)` (tuple variant: giá, số tháng), `Premium { tier: Tier }` (struct variant kèm enum lồng).
3. Method `summarize` dùng `match` xử lý từng variant.
4. Tạo instance mỗi loại, gọi `summarize`.

## Lời giải đầy đủ

```rust
#[derive(Debug)]
enum Tier {
    Gold,
    Silver,
    Platinum,
}

#[derive(Debug)]
enum Subscription {
    Free,                            // unit variant
    Basic(f64, u32),                 // tuple variant: giá/tháng, số tháng
    Premium { tier: Tier },          // struct variant: kèm enum lồng
}

impl Subscription {
    fn summarize(&self) {
        match self {
            Subscription::Free => {
                println!("Truy cập giới hạn");
            }
            Subscription::Basic(price, months) => {       // trích tuple variant
                println!("Tính năng premium giới hạn: {price}/tháng trong {months} tháng");
            }
            Subscription::Premium { tier } => {           // trích struct variant
                println!("Toàn quyền premium. Hạng: {tier:?}");   // tier:? cần Debug
            }
        }
    }
}

fn main() {
    Subscription::Free.summarize();                       // inline

    let basic = Subscription::Basic(4.99, 3);
    basic.summarize();

    let premium = Subscription::Premium { tier: Tier::Platinum };
    premium.summarize();
}
```

### Điểm học cốt lõi

| Phần | Khái niệm |
|---|---|
| `Tier`, `Subscription` enum | Định nghĩa enum, variant (bài 76) |
| `Basic(f64, u32)` | Tuple variant nhiều dữ liệu (bài 77) |
| `Premium { tier: Tier }` | Struct variant + enum lồng (bài 78, 79) |
| `impl Subscription { summarize }` | Method enum (bài 81) |
| `match self` phủ 3 variant | match + enum exhaustive (bài 80) |
| `Basic(price, months)`, `Premium { tier }` | Trích dữ liệu kèm trong match |
| `{tier:?}` | Debug cho enum lồng |

### Bẫy trong project

- `match self` phải phủ cả 3 variant — thiếu một → non-exhaustive error.
- Trích tuple variant dùng `()`, struct variant dùng `{}` (mirror khai báo).
- `tier:?` cần `Tier` derive Debug (đã derive) để in.
- `&self` → `tier` là reference `&Tier`, dùng được trong format.

---

# Section Review — tổng kết Enums

## Định nghĩa & variant

- **Enum** = tập hữu hạn giá trị; mỗi giá trị là **variant**; biểu diễn "HOẶC".
- `enum Name { Variant1, Variant2 }` (PascalCase); tạo `Enum::Variant`.
- 3 loại variant (mirror 3 loại struct):
  - **Unit**: `Free` (không dữ liệu).
  - **Tuple**: `Basic(f64, u32)` (dữ liệu theo vị trí).
  - **Struct**: `Premium { tier: Tier }` (dữ liệu có tên field).

## Dữ liệu kèm & lồng nhau

- Variant kèm **associated value** — điều khiến enum Rust mạnh; mỗi variant kèm dữ liệu khác nhau.
- Enum cấp memory theo **variant lớn nhất** + tag.
- Lồng tự do: enum trong enum, enum trong struct, struct trong enum → cây dữ liệu mô hình domain.

## match với enum

- `match` + enum: **exhaustive** (phủ mọi variant, compiler bắt buộc).
- Trích dữ liệu kèm trong arm (cú pháp mirror khai báo).
- Nâng cao: `|` gộp variant, `_`/tên catch-all (cuối), match **giá trị chính xác** (`Lowfat(2)`).

## Method & construct gọn

```text
impl Enum { fn method(&self) { match self { ... } } }   ← method + match self
if let Variant(x) = value { ... }        ← xử lý gọn MỘT variant (x trong block)
let Variant(x) = value else { return };  ← trích hoặc thoát (x sau block)
```

- Method enum: `impl`, `self`, thường `match self`; 4 dạng `self`.
- `if let`: chỉ một variant, không cần phủ hết.
- `let else`: ngược lại, biến sống sau, else phải thoát.

## Bản đồ phase Enums

```text
ĐỊNH NGHĨA
  enum Name { Unit, Tuple(T), Struct { f: T } }  →  Enum::Variant
  associated data · 3 loại variant · lồng nhau · memory theo variant lớn nhất

MATCH (cốt lõi)
  match self { Variant => ... }  exhaustive
  trích dữ liệu · | gộp · _ catch-all · giá trị chính xác

METHOD & GỌN
  impl + match self · if let (một variant) · let else (trích hoặc thoát)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Variant thiếu prefix enum | `Enum::Variant` |
| match thiếu variant | Phủ hết hoặc `_` |
| Sai cú pháp variant (()/{}) | Mirror khai báo |
| `_`/catch-all không cuối | Đặt cuối |
| `let else` không thoát | return/panic trong else |
| `==` thay `=` trong if let | Một dấu `=` |

---

# Bộ ba mô hình hoá dữ liệu (Struct + Enum + Match)

Sau phase 5, 9, 10, bạn có bộ ba công cụ mô hình hoá cốt lõi của Rust:

```text
struct  → "VÀ": gói nhiều thuộc tính (Coffee có name VÀ price VÀ is_hot)
enum    → "HOẶC": một trong tập biến thể (Payment là Card HOẶC PayPal)
match   → xử lý: rẽ nhánh an toàn theo variant, trích dữ liệu, exhaustive
```

Ba thứ phối hợp: struct gói dữ liệu, enum chọn biến thể (kèm dữ liệu), match mở enum xử lý từng trường hợp — compiler đảm bảo không sót. Đây là cách Rust mô hình hoá domain chính xác và an toàn, thay thế đa hình OOP cho tập biến thể hữu hạn. Hầu hết code Rust thực tế là tổ hợp ba thứ này.

## Tóm tắt phase Enums

- **Enum** biểu diễn tập hữu hạn biến thể ("HOẶC"); variant có thể kèm dữ liệu (unit/tuple/struct).
- Enum lồng nhau + struct → cây dữ liệu mô hình domain; type system bắt lỗi tổ hợp sai.
- **match + enum** là combo cốt lõi: exhaustive, trích dữ liệu, độ chính xác cao.
- Method enum (`impl` + `match self`); `if let`/`let else` xử lý gọn một variant.
- Struct + enum + match = bộ ba mô hình hoá dữ liệu của Rust.

Bạn đã nắm cả struct lẫn enum — nhưng nhiều lúc code lặp lại cho từng type (một hàm cho `i32`, một hàm y hệt cho `f64`). Phase tiếp theo là **Generics** — viết code **một lần** dùng cho **nhiều type**, an toàn và không lặp. Đây là chìa khoá cho `Vec<T>`, `Option<T>`, `Result<T, E>` mà bạn đã thoáng thấy.

**Bài kế tiếp** → [Bài 85: Generics — viết code một lần cho nhiều type](../phase-11-generics/01-generics-la-gi.md)
