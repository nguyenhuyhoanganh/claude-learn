# Bài 25: Character Type — `char`, Unicode, UTF-8, vì sao 4 byte

Một chữ cái chiếm bao nhiêu memory? Bạn đoán 1 byte. Trong Rust, `char` chiếm **4 byte**. Vì sao gấp 4 lần? Câu trả lời mở ra cả thế giới Unicode — và giải thích vì sao `"café".len()` trả `5` chứ không phải `4`.

## Char là gì

**Character** (`char`) = **một** ký tự Unicode. Khai báo bằng **single quote** `'...'` (khác string dùng double quote `"..."`).

```rust
fn main() {
    let first_initial = 'B';        // char — single quote
    let digit = '7';                // char (ký tự '7', không phải số 7)
    let symbol = '$';
    let emoji = '🎧';                // char — emoji cũng là 1 ký tự Unicode
}
```

Quy tắc nháy:

| Nháy | Type | Số ký tự |
|---|---|---|
| `'B'` | `char` | đúng **1** |
| `"B"` | `&str` (string) | **0 hoặc nhiều** |

```rust
let c = 'B';            // char
let s = "B";            // string một ký tự — TYPE KHÁC HẲN
let bad = 'AB';         // ERROR: char chỉ chứa 1 ký tự
```
```text
error: character literal may only contain one codepoint
```

## Unicode và UTF-8 — vì sao char là 4 byte

**Unicode** = chuẩn công nghiệp mã hoá text cho hầu hết hệ chữ viết trên thế giới — hơn **140,000 ký tự**, phủ ~150 ngôn ngữ, cộng emoji, ký hiệu toán, mũi tên...

**UTF** (Unicode Transformation Format) = cách triển khai lưu Unicode trong memory:

| Biến thể | Đặc điểm |
|---|---|
| **UTF-8** | Phổ biến nhất; ký tự dài 1–4 byte (ASCII = 1 byte) |
| UTF-16 | 2 hoặc 4 byte |
| UTF-32 | luôn 4 byte |

Rust dùng **4 byte (32 bit)** cho mỗi `char` để chứa được **bất kỳ** ký tự Unicode nào. Chữ Latin (`'A'`) chỉ cần 1 byte, nhưng emoji có thể cần tới 4 — nên `char` lấy kích thước lớn nhất để hỗ trợ mọi trường hợp.

```text
char = 4 byte cố định
'A'  → thực dùng 1 byte, nhưng char vẫn cấp 4
'🎧' → cần 4 byte
```

> Lưu ý quan trọng: cảm nhận "một ký tự" của con người **không** trùng cách máy lưu. Một emoji mặt cười ta thấy là một biểu tượng, nhưng máy có thể lưu bằng 4 byte. Vài emoji phức tạp (cờ, emoji có màu da) thực chất là **nhiều** `char` ghép lại.

## char vs string: bài học về `.len()`

Đây là chỗ Unicode gây bất ngờ. `String`/`&str` trong Rust lưu dưới dạng **UTF-8 byte**, và `.len()` đếm **byte**, không phải ký tự:

```rust
fn main() {
    println!("{}", "hello".len());      // 5 — ASCII, 1 byte/ký tự
    println!("{}", "café".len());       // 5 (!) — 'é' chiếm 2 byte
    println!("{}", "日本".len());        // 6 — mỗi chữ Hán 3 byte
    println!("{}", "🎧".len());          // 4 — emoji 4 byte
}
```

Muốn đếm **ký tự** (char) thật, dùng `.chars().count()`:

```rust
fn main() {
    println!("{}", "café".chars().count());     // 4 — số ký tự
    println!("{}", "日本".chars().count());       // 2
}
```

| Cách | Đếm gì | "café" |
|---|---|---|
| `.len()` | **byte** (UTF-8) | 5 |
| `.chars().count()` | **ký tự** (char) | 4 |

Đây là lý do Rust **không** cho index string bằng số (`s[0]` là lỗi compile): byte thứ 0 có thể là nửa của một ký tự nhiều byte. An toàn phải đi qua `.chars()`. Phase Strings sẽ đào sâu.

## Method trên char

`char` có nhiều method kiểm tra/biến đổi, đa số trả `bool`:

```rust
fn main() {
    let c = 'B';
    println!("{}", c.is_alphabetic());   // true — chữ cái
    println!("{}", c.is_numeric());      // false
    println!("{}", c.is_uppercase());    // true
    println!("{}", c.is_lowercase());    // false
    println!("{}", c.is_whitespace());   // false
    println!("{}", c.is_alphanumeric()); // true — chữ hoặc số

    println!("{}", 'a'.to_uppercase());  // A
    println!("{}", 'A'.to_lowercase());  // a
    println!("{}", '5'.to_digit(10).unwrap());  // 5 — char '5' → số 5 (cơ số 10)
}
```

Emoji **không** thuộc hoa/thường/chữ cái → mọi `is_*` chữ cái trả `false`:

```rust
let emoji = '🎧';
emoji.is_alphabetic();      // false
emoji.is_uppercase();       // false
```

Bảng method hay dùng:

| Method | Trả `true` khi |
|---|---|
| `is_alphabetic()` | là chữ cái |
| `is_numeric()` | là chữ số |
| `is_alphanumeric()` | chữ hoặc số |
| `is_whitespace()` | space/tab/newline |
| `is_uppercase()` / `is_lowercase()` | hoa / thường |
| `to_digit(radix)` | (trả `Option<u32>`) char → số |

## Đào sâu: char là một Unicode scalar value

`char` của Rust không phải "1 byte như C" mà là một **Unicode scalar value** — một mã điểm (code point) hợp lệ từ U+0000 đến U+D7FF và U+E000 đến U+10FFFF. Điều này có nghĩa:

- Một `char` luôn là một code point hoàn chỉnh, hợp lệ — không bao giờ là "nửa ký tự".
- Khác C, nơi `char` là 1 byte (chỉ đủ ASCII) — chương trình C xử lý Unicode phải dùng mảng byte thủ công, dễ sinh bug.
- Rust phân biệt rạch ròi: `char` (1 scalar, 4 byte cố định) vs `&str`/`String` (chuỗi byte UTF-8, độ dài thay đổi).

```text
C:    char = 1 byte  → 'A' OK, 'é' phải dùng nhiều byte thủ công
Rust: char = 4 byte  → 'A', 'é', '日', '🎧' đều là MỘT char
```

## Use case thực tế: validate và phân loại ký tự

```rust
fn classify(c: char) -> &'static str {
    if c.is_alphabetic() { "chữ cái" }
    else if c.is_numeric() { "chữ số" }
    else if c.is_whitespace() { "khoảng trắng" }
    else { "ký hiệu" }
}

fn count_digits(text: &str) -> usize {
    text.chars().filter(|c| c.is_numeric()).count()
}

fn main() {
    println!("{}", classify('7'));               // chữ số
    println!("{}", count_digits("abc123!@#4"));  // 4
}
```

Lặp qua `char` để validate input (mật khẩu có đủ chữ số? username chỉ chữ-số?) là pattern thật, dùng method `is_*` đúng mục đích.

## Khi nào dùng char vs string

| Dùng `char` khi | Dùng `&str`/`String` khi |
|---|---|
| Đúng một ký tự (dấu phân cách, ký tự đầu) | Đoạn text bất kỳ |
| Lặp qua từng ký tự để xử lý | Lưu/truyền nội dung |
| So sánh ký tự đơn | Ghép nối, định dạng |

```rust
let separator = ',';            // char — một ký tự
let message = "Hello, world";   // string — nhiều ký tự
let parts = message.split(separator);   // split nhận char
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `"x"` khi cần char | Type mismatch | char dùng `'x'` (single quote) |
| Nhồi nhiều ký tự vào `'ab'` | Compile error | char đúng 1 ký tự |
| Tưởng `.len()` đếm ký tự | Sai với Unicode | `.chars().count()` |
| Index string `s[0]` | Compile error | Dùng `.chars().nth(0)` |
| Tưởng char = 1 byte | Char là 4 byte | char là Unicode scalar |
| Gọi `is_uppercase` trên emoji mong true | Trả false | Emoji không có hoa/thường |

## Tóm tắt bài 25

- **`char`** = một ký tự Unicode, single quote `'B'`; khác string `"B"` (double quote, type `&str`).
- **Unicode** ~140,000 ký tự; **UTF-8** phổ biến (1–4 byte/ký tự); `char` cố định **4 byte** để chứa mọi ký tự.
- `.len()` đếm **byte** UTF-8 (`"café"` = 5); `.chars().count()` đếm **ký tự** (= 4).
- Không index string bằng số — đi qua `.chars()`; phase Strings đào sâu.
- Method `is_alphabetic/is_numeric/is_uppercase/to_digit`… đa số trả `bool`; emoji không hoa/thường.
- `char` là **Unicode scalar value** hoàn chỉnh — an toàn hơn `char` 1-byte của C.

**Bài kế tiếp** → [Bài 26: Array Type — collection cố định, index, đọc/ghi, panic out-of-bounds](07-array-type.md)
