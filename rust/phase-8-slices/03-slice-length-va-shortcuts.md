# Bài 61: Độ dài slice & cú pháp rút gọn — byte vs ký tự, ranh giới Unicode

Slice trỏ tới một dãy **byte**, không phải ký tự — và điều này gây ra một cái bẫy nguy hiểm với emoji/Unicode khiến chương trình **panic**. Bài này: cách đo độ dài slice (`len`), vì sao cắt giữa ký tự Unicode làm crash, và ba cú pháp rút gọn range giúp code gọn hơn.

## `len` — độ dài tính bằng byte

Method `len` trả độ dài slice — **số byte**, không phải số ký tự:

```rust
fn main() {
    let food = "pizza";
    println!("{}", food.len());          // 5 — 5 byte (ASCII: 1 ký tự = 1 byte)

    let slice = &food[0..3];             // "piz"
    println!("{}", slice.len());         // 3
}
```

ASCII may mắn: 1 ký tự = 1 byte, nên `len` trùng số ký tự. Nhưng đó **không** phải quy luật chung.

## Cái bẫy Unicode: cắt giữa ký tự → panic

Emoji và ký tự Unicode chiếm **nhiều byte**. Cắt slice không trúng **ranh giới ký tự** (character boundary) → **panic runtime**:

```rust
fn main() {
    let food = "🍕";                      // emoji pizza
    println!("{}", food.len());          // 4 (!) — 4 byte, dù MẮT thấy 1 ký tự

    let bad = &food[0..3];               // cắt giữa 4 byte → PANIC
}
```
```text
thread 'main' panicked at 'byte index 3 is not a char boundary;
it is inside '🍕' (bytes 0..4)'
```

`🍕` chiếm **4 byte**. `&food[0..3]` cố lấy 3 byte đầu — nhưng 3 byte đó là **một nửa** chuỗi byte tạo nên emoji, không phải một ký tự hợp lệ. Rust **không** cho slice trỏ tới chuỗi byte vô nghĩa → panic.

```text
🍕 = [byte0, byte1, byte2, byte3]   ← 4 byte tạo MỘT ký tự
&food[0..3] = [byte0, byte1, byte2] ← cắt giữa → KHÔNG phải ký tự hợp lệ → PANIC
&food[0..4] = cả 4 byte             ← trúng ranh giới → OK
```

Chỉ `&food[0..4]` (trọn 4 byte) mới hợp lệ. Mọi điểm cắt giữa (1, 2, 3) đều panic. Đây là lý do slice "theo byte" quan trọng: bạn phải cắt **đúng ranh giới ký tự**.

> **Bài học**: với text có thể chứa Unicode (input user, tên có dấu, emoji), **đừng** hard-code index byte. Dùng `.char_indices()`, `.chars()`, hoặc method tìm kiếm (`.find()`) để cắt đúng ranh giới. Hard-code `[0..6]` chỉ an toàn khi chắc chắn ASCII.

```rust
// An toàn với Unicode: cắt theo ký tự, không theo byte cứng
let s = "café";
let first_two: String = s.chars().take(2).collect();   // "ca"
```

## Vì sao Rust thiết kế strict thế này

Rust **không cho** index string bằng số đơn (`s[0]`) và **panic** khi slice sai ranh giới — nghe phiền, nhưng có lý do:
- Trả về "nửa ký tự" là vô nghĩa (chuỗi byte không decode được thành text).
- Im lặng trả rác (như C) → bug âm thầm, hiển thị lỗi, lỗ hổng.
- Panic to, rõ ràng, ngay lập tức → bắt lỗi tại chỗ thay vì để nó lan.

Đây là triết lý "thà nổ to còn hơn sai âm thầm" — bảo vệ tính đúng đắn của text.

## Cú pháp rút gọn range

Ba shortcut giúp range gọn hơn:

### 1. Bỏ lower bound → từ đầu

```rust
let s = "Arnold Schwarzenegger";
let a = &s[0..6];        // tường minh
let b = &s[..6];         // rút gọn — bỏ 0, ngầm từ đầu
// a và b giống nhau
```

`..6` = từ byte 0 đến trước 6. Bỏ `0` cho gọn.

### 2. Bỏ upper bound → tới hết

```rust
let s = "Arnold Schwarzenegger";
let a = &s[7..21];       // tường minh (phải biết byte cuối)
let b = &s[7..];         // rút gọn — từ byte 7 tới HẾT
```

`7..` = từ byte 7 tới hết chuỗi. Lợi: **không cần** tính byte cuối — bền hơn khi text đổi độ dài:

```rust
let s = "Arnold Superman";        // tên khác độ dài
let last = &s[7..];               // vẫn lấy đúng từ byte 7 tới hết
```

### 3. Bỏ cả hai → toàn bộ

```rust
let s = "Arnold Schwarzenegger";
let full = &s[..];       // từ đầu tới hết = TOÀN BỘ
```

`..` = từ đầu tới hết = cả collection. Đây là slice "portion = toàn bộ" (bài 59). Type vẫn là `&str` (slice), khác `&s` (`&String`) về type nhưng cùng nội dung.

Bảng tổng:

| Cú pháp | Nghĩa | Tương đương |
|---|---|---|
| `&s[0..6]` | byte 0 đến trước 6 | `&s[..6]` |
| `&s[7..len]` | byte 7 tới hết | `&s[7..]` |
| `&s[0..len]` | toàn bộ | `&s[..]` |
| `&s[2..5]` | đoạn giữa | (không rút gọn được) |

## `&s[..]` vs `&s` — khác type, cùng nội dung

```rust
let s = String::from("hello");
let slice: &str = &s[..];        // &str — slice toàn bộ
let reference: &String = &s;     // &String — reference cả String
```

Cùng nội dung "hello", nhưng `&s[..]` là `&str` (slice), `&s` là `&String` (reference). Khi chỉ cần reference toàn bộ, `&s` đơn giản hơn. `&s[..]` hữu ích khi cần **type `&str`** (vd truyền vào hàm nhận `&str` — bài 62). Lợi thế thật của slice là khi lấy **một đoạn** (`&s[2..5]`).

## Use case thực tế

```rust
fn main() {
    let log = String::from("2024-06-15 ERROR disk full");

    let date = &log[..10];           // "2024-06-15" — từ đầu, 10 byte
    let rest = &log[11..];           // "ERROR disk full" — từ byte 11 tới hết

    println!("Ngày: {date}");
    println!("Nội dung: {rest}");
}
```

Cú pháp rút gọn (`..10`, `11..`) làm code parse log gọn và rõ — không phải đếm byte cuối. (An toàn vì log ASCII; nếu có Unicode phải cẩn thận ranh giới.)

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cắt giữa ký tự Unicode | Panic "not a char boundary" | Cắt đúng ranh giới, hoặc dùng `.chars()` |
| Tưởng `len` đếm ký tự | Đếm **byte** | `.chars().count()` cho ký tự |
| Hard-code byte index với Unicode | Sai/panic | Dùng `.find()`/`.char_indices()` |
| Quên end exclusive | Lệch một byte | `start..end` không gồm `end` |
| Nhầm `&s[..]` (&str) với `&s` (&String) | Type khác | `[..]` tạo slice |

## Tóm tắt bài 61

- **`len`** trả độ dài slice tính bằng **byte**, không phải ký tự (ASCII trùng, Unicode khác).
- Cắt slice **giữa** một ký tự Unicode nhiều byte → **panic** "not a char boundary".
- Với text có thể chứa Unicode, đừng hard-code index byte — dùng `.chars()`/`.find()`.
- Rút gọn range: `..n` (từ đầu), `n..` (tới hết), `..` (toàn bộ).
- `n..` bền hơn khi text đổi độ dài (không cần tính byte cuối).
- `&s[..]` là `&str` (slice), `&s` là `&String`; lợi thế slice thật là lấy **một đoạn**.

**Bài kế tiếp** → [Bài 62: String slice làm tham số hàm — `&str` linh hoạt & deref coercion](04-string-slice-parameters.md)
