# Bài 76: Enum là gì — biểu diễn "một trong nhiều biến thể"

Struct biểu diễn "**VÀ**": một Coffee có name **và** price **và** is_hot. Nhưng nhiều thứ đời thực là "**HOẶC**": một quân bài là Hearts **hoặc** Diamonds **hoặc** Spades **hoặc** Clubs — đúng một trong bốn. Mô hình hoá string thì sai (string là **bất kỳ** text); cần một type giới hạn đúng tập hữu hạn. Đó là **enum** — và cùng với struct + `match` (phase 5), nó là bộ ba mô hình hoá dữ liệu cốt lõi của Rust.

## Enum là gì

**Enum** (từ "enumerate" — liệt kê từng cái) = type biểu diễn một **tập hữu hạn các giá trị có thể**. Mỗi giá trị gọi là **variant** (biến thể).

Hữu ích khi type chỉ là **một** trong tập giới hạn: 7 ngày trong tuần, 4 mùa, ~195 quốc gia, trạng thái đơn hàng. String không phù hợp (string = bất kỳ text); enum giới hạn đúng các lựa chọn cho phép.

## Định nghĩa enum

`enum` keyword + tên (PascalCase) + `{}` chứa variant (PascalCase, cách nhau bằng `,`):

```rust
#[derive(Debug)]
enum CardSuit {
    Hearts,
    Diamonds,
    Spades,
    Clubs,
}
```

```text
enum CardSuit {
│    │         │
│    │         └ block chứa variant
│    └ tên enum: PascalCase
└ keyword

  Hearts,      ← variant: PascalCase, KHÔNG nháy (không phải string)
```

- Variant viết PascalCase, **không** nháy — chúng là variant của enum, không phải string.
- Như struct, đây là **blueprint** — chưa có instance, chỉ định nghĩa tập 4 lựa chọn.
- `#[derive(Debug)]` để in được (enum mặc định không implement Display/Debug — như struct, bài 69).

## Tạo instance: `Enum::Variant`

Tạo giá trị enum bằng tên enum + `::` + variant:

```rust
fn main() {
    let first_card = CardSuit::Hearts;        // CardSuit::Variant
    let second_card = CardSuit::Spades;
}
```

```text
CardSuit :: Hearts
│         │  │
│         │  └ variant cụ thể
│         └ truy cập namespace enum
└ enum
```

`::` giống cú pháp associated function của struct (bài 72) — hợp lý, vì cả hai là **namespace**: variant "sống" trong namespace enum. Tên `Hearts` đơn lẻ **không** hợp lệ — phải có prefix `CardSuit::` để Rust biết nó từ đâu.

Type của `first_card` là **`CardSuit`** (không phải `Hearts`):

```rust
let first_card: CardSuit = CardSuit::Hearts;     // type là enum CardSuit
```

In bằng Debug (sau khi derive):

```rust
println!("{:?}", second_card);       // Spades
```

## Variable type cố định là enum

Biến enum chỉ nhận variant của **chính** enum đó:

```rust
fn main() {
    let mut card = CardSuit::Spades;
    card = CardSuit::Clubs;          // OK — cùng enum CardSuit
    // card = "Hearts";              // ERROR — không phải CardSuit
    // card = OtherEnum::X;          // ERROR — enum khác
}
# #[derive(Debug)] enum CardSuit { Hearts, Diamonds, Spades, Clubs }
```

Gán lại được (nếu `mut`) nhưng phải cùng type `CardSuit` — một trong 4 variant, không gì khác. Đây là sức mạnh: type chỉ cho phép tập giá trị hợp lệ, compiler chặn giá trị ngoài tập.

## Enum dùng như mọi type

Enum là owned value như struct/String — tuân mọi quy tắc ownership. Dùng được mọi nơi:

```rust
// Làm field của struct
struct Card {
    rank: String,
    suit: CardSuit,                  // field type là enum
}

// Trong array (mọi phần tử cùng enum)
let suits = [CardSuit::Hearts, CardSuit::Clubs];   // [CardSuit; 2]

// Trong tuple
let pair = (CardSuit::Hearts, CardSuit::Spades);
# #[derive(Debug)] enum CardSuit { Hearts, Diamonds, Spades, Clubs }
# struct Card { rank: String, suit: CardSuit }
```

Enum là giá trị: làm biến, field struct, phần tử array/tuple, tham số/return của hàm. Mọi quy tắc ownership (move, borrow) áp dụng như struct.

## Enum vs struct: HOẶC vs VÀ

Khác biệt cốt lõi giữa hai công cụ mô hình hoá:

| | Struct | Enum |
|---|---|---|
| Biểu diễn | "**VÀ**" — có mọi field cùng lúc | "**HOẶC**" — đúng một variant |
| Ví dụ | Coffee có name VÀ price VÀ is_hot | CardSuit là Hearts HOẶC Spades HOẶC... |
| Khi dùng | Gói nhiều thuộc tính của một thứ | Một trong tập lựa chọn hữu hạn |

```text
struct Coffee { name, price, is_hot }   → một Coffee CÓ name VÀ price VÀ is_hot
enum CardSuit { Hearts, Spades, ... }   → một CardSuit LÀ Hearts HOẶC Spades HOẶC...
```

Hai công cụ bổ sung nhau: struct gói thuộc tính, enum chọn một biến thể. Thực tế thường lồng nhau (enum làm field struct, struct làm dữ liệu variant — bài sau).

## Use case thực tế

```rust
#[derive(Debug)]
enum TrafficLight { Red, Yellow, Green }

#[derive(Debug)]
enum Direction { North, South, East, West }

fn main() {
    let light = TrafficLight::Red;
    let heading = Direction::North;
    println!("{light:?} {heading:?}");       // Red North
}
```

Enum hoàn hảo cho trạng thái hữu hạn (đèn giao thông, hướng, trạng thái đơn) — compiler đảm bảo chỉ giá trị hợp lệ, và `match` (bài 80) buộc xử lý mọi variant.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng variant không có prefix enum | `cannot find value` | `Enum::Variant` |
| Bọc variant trong nháy | Thành string | Variant không nháy |
| Tên enum/variant snake_case | Warning | PascalCase |
| `{:?}` enum chưa derive Debug | Compile error | `#[derive(Debug)]` |
| Gán variant của enum khác | Type mismatch | Cùng enum |
| Mô hình tập hữu hạn bằng String | Cho phép giá trị sai | Dùng enum |

## Tóm tắt bài 76

- **Enum** = type biểu diễn **tập hữu hạn giá trị**, mỗi giá trị là **variant**; biểu diễn "HOẶC".
- Định nghĩa: `enum Name { Variant1, Variant2 }` (PascalCase, variant không nháy); là blueprint.
- Tạo instance: `Enum::Variant`; type biến là enum; cần `#[derive(Debug)]` để in.
- Biến enum chỉ nhận variant của chính enum đó — compiler chặn giá trị ngoài tập.
- Enum dùng như mọi type: biến, field struct, phần tử array/tuple; tuân ownership.
- **Struct** = "VÀ" (mọi field); **enum** = "HOẶC" (một variant) — hai công cụ bổ sung nhau.

**Bài kế tiếp** → [Bài 77: Enum với dữ liệu kèm theo — tuple variant](02-enum-associated-values.md)
