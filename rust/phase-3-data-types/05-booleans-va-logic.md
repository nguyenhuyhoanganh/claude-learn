# Bài 24: Booleans & Logic — `bool`, `!`, `==`, `&&`, `||`, short-circuit

Mọi quyết định trong chương trình rút về một câu hỏi đúng/sai: user đã đăng nhập chưa? tuổi đủ chưa? đã thanh toán **và** còn hàng? Type mô hình hoá đúng/sai là **boolean** — và các toán tử logic kết hợp chúng là xương sống của mọi `if`, vòng lặp, điều kiện bạn sẽ viết.

## Boolean là gì

**Boolean** (đặt theo nhà toán học George Boole) = type chỉ có **đúng hai** giá trị: `true` hoặc `false`. Type là `bool`. Mô hình hoá "tính đúng" — và mọi cặp nhị phân: bật/tắt, có/không, hợp lệ/không.

```rust
fn main() {
    let is_active = true;          // bool — không có dấu nháy!
    let is_admin = false;
    let flag: bool = true;          // annotate nếu muốn
}
```

`true`/`false` viết thường, **không** có dấu nháy — chúng không phải string, là type `bool` riêng biệt.

> Bộ nhớ: `bool` chiếm **1 byte** (8 bit), dù về lý thuyết 1 bit là đủ. Lý do: CPU hiện đại truy cập theo byte nhanh hơn theo từng bit lẻ. Đánh đổi 7 bit để lấy tốc độ.

## Boolean thường đến từ phép so sánh

Hiếm khi gõ thẳng `true`/`false`. Thường bool **sinh ra** từ một phép đánh giá:

```rust
fn main() {
    let age = 21;
    let is_young = age < 35;        // bool: true
    let can_vote = age >= 18;       // bool: true
}
```

Toán tử so sánh (trả `bool`):

| Operator | Ý nghĩa |
|---|---|
| `<` | nhỏ hơn |
| `>` | lớn hơn |
| `<=` | nhỏ hơn hoặc bằng |
| `>=` | lớn hơn hoặc bằng |
| `==` | bằng |
| `!=` | khác |

Một số method cũng trả bool:

```rust
let n = -40;
n.is_positive();        // false
n.is_negative();        // true
let s = "Hello";
s.is_empty();           // false
s.starts_with("He");    // true
```

## Đảo boolean với `!`

Dấu `!` (exclamation) đặt trước bool **đảo ngược** nó: `true`→`false`, `false`→`true`.

```rust
fn main() {
    println!("{}", !true);          // false
    let logged_in = false;
    println!("{}", !logged_in);     // true
}
```

Hữu ích để diễn đạt logic ngược cho dễ đọc:

```rust
let age = 13;
let can_see = age >= 17;
let cannot_see = !can_see;          // thay vì viết lại age < 17
```

Hai cách (`!can_see` và `age < 17`) cho cùng kết quả — chọn cái diễn đạt ý rõ hơn.

## Equality `==` vs Assignment `=` — đừng nhầm

Đây là lỗi kinh điển của người mới:

| Operator | Tên | Tác dụng |
|---|---|---|
| `=` | assignment | **Gán** giá trị vào biến |
| `==` | equality | **So sánh** hai giá trị, trả `bool` |

```rust
let x = 5;             // GÁN 5 vào x
let same = x == 5;     // SO SÁNH x với 5 → true
```

`!=` (inequality) là phủ định của `==`:

```rust
println!("{}", 13 == 13);          // true
println!("{}", 13 != 13);          // false
println!("{}", "Coke" == "Pepsi"); // false
println!("{}", "Coke" != "Pepsi"); // true
```

### So sánh string: phân biệt hoa thường và khoảng trắng

```rust
"Coke" == "coke"        // false — C hoa ≠ c thường
"Coke" == "Coke "       // false — có space cuối, 4 ký tự ≠ 5 ký tự
```

Hai string bằng nhau **chỉ khi** từng ký tự giống hệt, đúng thứ tự. Space là một ký tự thật.

### Phải cùng type mới so sánh được

```rust
13 == 13.0             // ERROR — i32 vs f64
13 == 13.0 as i32      // OK — cùng i32 → true
```

Use case thật của `==`: so dữ liệu **động** (không biết trước) với giá trị đã biết — vd so password user nhập với password đúng.

## AND logic `&&` — cả hai phải đúng

`&&` (hai ampersand) nhận hai bool, trả `true` **chỉ khi cả hai** đều `true`:

```rust
fn main() {
    let purchased_ticket = true;
    let plane_on_time = true;
    let making_event = purchased_ticket && plane_on_time;   // true
    println!("{making_event}");
}
```

Bảng chân trị:

| A | B | `A && B` |
|---|---|---|
| true | true | **true** |
| true | false | false |
| false | true | false |
| false | false | false |

Chỉ một `false` là cả biểu thức `false`. Dùng khi **mọi** điều kiện phải thoả: "đã đăng nhập **và** là admin **và** còn hạn".

## OR logic `||` — chỉ cần một đúng

`||` (hai pipe) trả `true` nếu **ít nhất một** bool `true`:

```rust
fn main() {
    let paid = false;
    let is_admin = true;
    let can_access = paid || is_admin;     // true — vì is_admin
}
```

Bảng chân trị:

| A | B | `A \|\| B` |
|---|---|---|
| true | true | true |
| true | false | true |
| false | true | true |
| false | false | **false** |

Chỉ `false` khi **cả hai** `false`. Dùng khi **bất kỳ** điều kiện nào đủ: "trả phí **hoặc** là admin".

```text
&&  : khắt khe — MỌI điều kiện phải đúng
||  : dễ tính — CHỈ MỘT điều kiện đúng là đủ
```

## Kết hợp nhiều điều kiện

```rust
let age = 25;
let has_license = true;
let is_sober = true;

let can_drive = age >= 18 && has_license && is_sober;        // 3 điều kiện AND
let weekend_or_holiday = is_saturday || is_sunday || is_holiday;
# let (is_saturday, is_sunday, is_holiday) = (false, true, false);
```

Trộn `&&` và `||` — dùng ngoặc cho rõ thứ tự:

```rust
let eligible = (age >= 18 && has_license) || is_admin;
# let is_admin = false;
```

`&&` có độ ưu tiên cao hơn `||` (như `*` so với `+`), nhưng **luôn dùng ngoặc** khi trộn để khỏi đoán.

## Đào sâu: short-circuit evaluation

Rust dùng **short-circuit** (đoản mạch): dừng đánh giá sớm khi đã biết kết quả.

```text
false && <bất kỳ>   → false ngay, KHÔNG xét vế phải
true  || <bất kỳ>   → true ngay,  KHÔNG xét vế phải
```

- `&&`: nếu vế trái `false`, cả biểu thức chắc chắn `false` → bỏ qua vế phải.
- `||`: nếu vế trái `true`, cả biểu thức chắc chắn `true` → bỏ qua vế phải.

Không chỉ tối ưu tốc độ — còn là **pattern an toàn**: đặt điều kiện "rẻ/bảo vệ" bên trái để tránh chạy vế phải nguy hiểm.

```rust
fn main() {
    let items = [10, 20, 30];
    let idx = 5;
    // Nếu đảo thứ tự, items[idx] sẽ panic. Short-circuit cứu:
    if idx < items.len() && items[idx] > 15 {
        println!("an toàn");
    } else {
        println!("idx ngoài phạm vi");      // chạy nhánh này, KHÔNG panic
    }
}
```

`idx < items.len()` là `false` → `&&` dừng, **không** chạy `items[idx]` (vốn sẽ panic). Đây là kỹ thuật guard kinh điển: kiểm tra hợp lệ trước, truy cập sau.

## Use case thực tế: kiểm tra quyền truy cập

```rust
fn can_view_content(logged_in: bool, is_subscriber: bool, is_admin: bool) -> bool {
    logged_in && (is_subscriber || is_admin)
}

fn main() {
    println!("{}", can_view_content(true, false, true));    // true — admin
    println!("{}", can_view_content(true, true, false));    // true — subscriber
    println!("{}", can_view_content(false, true, true));    // false — chưa login
    println!("{}", can_view_content(true, false, false));   // false — không quyền
}
```

"Phải đăng nhập **VÀ** (là subscriber **HOẶC** admin)" — đúng kiểu logic phân quyền thật.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `=` thay `==` | Compile error / gán nhầm | `==` để so sánh |
| Bọc `true` trong nháy `"true"` | Thành string, không phải bool | `true` không nháy |
| So string khác hoa thường | `==` trả false bất ngờ | Chuẩn hoá `.to_lowercase()` trước |
| So khác type (i32 vs f64) | Compile error | Cast cùng type |
| Trộn `&&`/`||` không ngoặc | Logic sai khó thấy | Luôn dùng ngoặc |
| Đặt điều kiện nguy hiểm bên trái | Panic dù có guard | Guard rẻ bên trái, short-circuit bảo vệ |

## Tóm tắt bài 24

- **`bool`** chỉ có `true`/`false` (không nháy); chiếm 1 byte vì tốc độ CPU.
- Bool thường sinh từ so sánh (`<`, `>`, `==`, `!=`) hoặc method (`is_empty`…).
- `!` đảo bool; `=` (gán) ≠ `==` (so sánh, trả bool).
- `&&` (AND): cả hai phải đúng; `||` (OR): chỉ cần một đúng.
- So string phân biệt **hoa/thường và space**; so sánh cần **cùng type**.
- **Short-circuit**: dừng sớm khi biết kết quả — tối ưu và dùng làm guard tránh panic.

**Bài kế tiếp** → [Bài 25: Character Type — `char`, Unicode, UTF-8, vì sao 4 byte](06-character-type.md)
