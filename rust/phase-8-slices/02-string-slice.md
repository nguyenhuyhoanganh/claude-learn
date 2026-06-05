# Bài 60: String slice — cú pháp range, `&str`, và string literal cũng là slice

Giờ vào code. **String slice** trỏ tới một đoạn ký tự của string — và type của nó là `&str`, chính cái type bạn đã thấy suốt khoá học với string literal. Bài này tiết lộ một sự thật bất ngờ: `"text"` bạn viết bấy lâu **chính là** một string slice. Hiểu điều này gắn kết mọi thứ về string lại với nhau.

## Cú pháp tạo string slice

Tạo slice từ một String bằng `&collection[range]` — borrow operator `&`, rồi giá trị, rồi `[range]`:

```rust
fn main() {
    let action_hero = String::from("Arnold Schwarzenegger");

    let first_name = &action_hero[0..6];     // byte 0 đến trước 6
    println!("{first_name}");                 // Arnold
}
```

```text
&action_hero[0..6]
│            │
│            └ range byte: từ 0, đến TRƯỚC 6 (6 byte: 0,1,2,3,4,5)
└ borrow operator (slice vẫn là reference)
```

Range trong `[]` (nhắc lại bài 28): `start..end`, **end exclusive** (đi tới nhưng không gồm). `0..6` = 6 byte đầu = "Arnold".

So với reference thường:

```rust
let string_ref = &action_hero;          // &String — mượn CẢ string
let first_name = &action_hero[0..6];    // &str   — mượn ĐOẠN (slice)
```

`&action_hero` (không `[]`) = `&String` (cả string). `&action_hero[0..6]` (có `[]`) = `&str` (một đoạn). Square bracket biến reference thành slice.

## Range theo BYTE, không phải ký tự

Điểm cực quan trọng (nối bài 25): con số trong range là **index byte**, **không** phải index ký tự.

```rust
let action_hero = String::from("Arnold Schwarzenegger");
let last_name = &action_hero[7..21];     // byte 7 đến trước 21
println!("{last_name}");                  // Schwarzenegger
```

```text
A  r  n  o  l  d     S  c  h  w  a  r  z  e  n  e  g  g  e  r
0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
                  ↑space      ↑'S' byte 7        'r' byte 20↑
&[7..21] = byte 7..20 = "Schwarzenegger"
```

Với ký tự ASCII (chữ Latin) 1 ký tự = 1 byte nên range "trông như" theo ký tự. Nhưng ký tự Unicode (emoji, tiếng Việt có dấu) nhiều byte — range vẫn theo **byte** (bài 61 đào sâu cái bẫy này).

## Type là `&str` — string slice

Để ý type của `first_name`/`last_name`: **`&str`** ("ref str", string slice). Không phải `String`, không phải `&String`:

```rust
let first_name: &str = &action_hero[0..6];   // annotate rõ
```

| Type | Là gì |
|---|---|
| `String` | text sở hữu, heap |
| `&String` | reference tới CẢ String |
| `&str` | **string slice** — reference tới một đoạn |
| `str` | text gốc (hiếm dùng trực tiếp) |

`first_name` **không** sở hữu text — chỉ là địa chỉ tới 6 byte đầu của text trên heap (Rust tự dereference khi in).

## Sự thật bất ngờ: string literal LÀ string slice

Đây là mảnh ghép quan trọng. Thử dùng string literal thay String:

```rust
fn main() {
    let action_hero = "Arnold Schwarzenegger";   // type: &str (!)
    let first_name = &action_hero[0..6];          // &str
}
```

Type của `action_hero` (literal) cũng là **`&str`** — cùng type với `first_name`/`last_name`. Vì sao?

Mọi string literal `"..."` **chính là** một string slice: nó là một **reference tới text nhúng trong binary** (bài 49). `action_hero` không sở hữu text — chỉ trỏ tới text trong executable. Đó là slice **bao toàn bộ** text (trường hợp "portion = toàn bộ" của bài 59).

```text
let action_hero = "Arnold...";   → &str: slice bao TOÀN BỘ text trong binary
let first_name  = &action_hero[0..6];  → &str: slice một ĐOẠN của text đó
                                          (cùng type, khác phạm vi)
```

Đây là lý do type của string literal luôn hiện `&str` chứ không phải `str` — nó là một reference (slice), không phải text gốc. Mọi `"..."` bạn viết từ đầu khoá học đều là string slice mà không biết.

## Slice tạo reference độc lập, không phụ thuộc biến gốc

Điểm tinh tế: `&action_hero[0..6]` **không** tạo "reference tới reference". Nó dùng `action_hero` **một lần** để xác định vùng memory, rồi tạo một reference **độc lập** tới đoạn đó:

```rust
fn main() {
    let first_name = {
        let action_hero = "Arnold Schwarzenegger";
        &action_hero[0..6]               // slice 6 byte đầu
    };                                    // action_hero ra khỏi scope
    println!("{first_name}");             // Arnold — VẪN hoạt động!
}
```

Tưởng đây là dangling reference (bài 56)? **Không.** Text "Arnold Schwarzenegger" nhúng trong **binary**, sống suốt chương trình. `action_hero` chỉ là một slice tới text đó; `first_name` dùng vùng memory đó làm cơ sở tạo slice riêng (6 byte đầu). Khi `action_hero` ra khỏi scope, text trong binary **vẫn còn** → `first_name` vẫn hợp lệ.

(Lưu ý: với **String trên heap**, slice phụ thuộc String còn sống — vì text trên heap bị dọn khi String hết scope. Đây là chỗ borrow rules bảo vệ: không cho String chết khi còn slice tới nó.)

## Panic khi range ngoài biên

Range vượt độ dài → **panic runtime**:

```rust
let action_hero = "Arnold Schwarzenegger";   // 21 byte (index 0..20)
let bad = &action_hero[7..22];               // byte 22 không tồn tại
```
```text
thread 'main' panicked at 'byte index 22 is out of bounds'
```

Slice phải nằm trong biên hợp lệ. (Bài 61: thêm bẫy "không trúng ranh giới ký tự" với Unicode.)

## Use case thực tế: trích phần của text

```rust
fn main() {
    let email = String::from("alice@example.com");

    // Tìm vị trí '@' rồi cắt phần tên
    let at = email.find('@').unwrap();        // 5
    let username = &email[0..at];              // slice "alice"
    let domain = &email[at + 1..];             // slice "example.com"

    println!("{username} / {domain}");         // alice / example.com
}
```

Slice cho phép trích username/domain **không copy** — chỉ trỏ vào các đoạn của String gốc. Rẻ và hiệu quả, đúng tinh thần Rust.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Range theo ký tự thay vì byte | Sai đoạn / panic (Unicode) | Nhớ range là **byte** |
| Range vượt biên | Panic runtime | Giữ trong độ dài |
| Nhầm `&s` (&String) với `&s[..]` (&str) | Type khác | `[]` tạo slice `&str` |
| Tưởng literal là `str` | Là `&str` (slice) | Literal = slice tới binary |
| Slice String trên heap rồi để String chết | Borrow error (Rust chặn) | String sống khi còn slice |

## Tóm tắt bài 60

- **String slice**: `&collection[start..end]` — borrow một đoạn, type **`&str`**.
- Range là **index byte** (end exclusive), không phải ký tự — ASCII trùng nhau, Unicode khác.
- `&s` (không `[]`) = `&String` (cả string); `&s[..]` (có `[]`) = `&str` (slice).
- **String literal `"..."` chính là `&str`** — slice bao toàn bộ text nhúng trong binary.
- Slice tạo reference **độc lập** tới vùng memory, không phụ thuộc biến gốc (nếu text sống đủ lâu).
- Range vượt biên → **panic**; slice cho trích đoạn text mà không copy.

**Bài kế tiếp** → [Bài 61: Độ dài slice & cú pháp rút gọn — byte vs ký tự, ranh giới Unicode](03-slice-length-va-shortcuts.md)
