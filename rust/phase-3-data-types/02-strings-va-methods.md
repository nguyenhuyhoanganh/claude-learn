# Bài 21: Strings & Methods — string literal, ký tự đặc biệt, raw string, gọi method

`"Hello World"` là string đầu tiên bạn viết. Nhưng string trong Rust phức tạp hơn vẻ ngoài: có nhiều **loại** string, có **ký tự đặc biệt** thay đổi cách hiển thị, và mọi giá trị (kể cả string) đều có **method** — hàm gắn liền trên giá trị. Bài này gỡ cả ba.

## String literal là gì

**String** = một chuỗi ký tự, một đoạn text. Khai báo bằng cặp **double quote** `"..."`.

Thứ bạn dùng tới giờ chính xác gọi là **string literal** (chuỗi hằng): string mà compiler **biết giá trị tại compile time** vì bạn viết thẳng trong source code.

```rust
let greeting = "Hello";       // string literal — biết trước
```

Không phải lúc nào cũng vậy. Khi xin input từ user, bạn **không biết** chuỗi đó tới khi chạy — đó là string động, type khác (`String`, học ở phase Strings). Còn string hard-code trong code = string literal.

> Type của string literal hiện ra là `&str` (không phải `str`). Dấu `&` liên quan tới **borrowing** — phase Slices/References sẽ đào sâu. Giờ nhớ: `&str` = type của chuỗi hard-code.

## Ký tự đặc biệt (escape sequences)

Bên trong string, vài chuỗi bắt đầu bằng backslash `\` **không** in ra theo nghĩa đen mà mang ý nghĩa đặc biệt:

| Ký tự | Tên | Tác dụng |
|---|---|---|
| `\n` | newline | Xuống dòng |
| `\t` | tab | Thụt một tab |
| `\"` | escaped quote | In dấu `"` thật |
| `\\` | escaped backslash | In dấu `\` thật |
| `\r` | carriage return | Về đầu dòng |
| `\0` | null | Ký tự null |

```rust
fn main() {
    println!("Dear Emily\nHow have you been?");
}
```
```text
Dear Emily
How have you been?
```

`\n` không in ra hai ký tự `\` và `n` — nó **ép xuống dòng**. `\t` thụt đầu dòng.

### Vì sao cần escape `"` và `\`

Muốn in dấu `"` trong string? Nếu gõ thẳng, Rust tưởng bạn **kết thúc** string:

```rust
println!("Juliet said "I love you, Romeo"");   // LỖI — Rust nghĩ string kết thúc ở "said "
```

Phải **escape** bằng `\"` — bảo Rust "đây là dấu nháy thường, không phải dấu kết thúc":

```rust
println!("Juliet said \"I love you, Romeo\"");
```
```text
Juliet said "I love you, Romeo"
```

Tương tự backslash. Mô hình đường dẫn Windows `C:\My Documents\new\videos` gặp rắc rối vì `\n` bị hiểu là newline:

```rust
let path = "C:\My Documents\new\videos";       // \n thành xuống dòng!
```

Escape mỗi `\` bằng `\\`:

```rust
let path = "C:\\My Documents\\new\\videos";
println!("{path}");                             // C:\My Documents\new\videos
```

Output chỉ còn **một** `\` mỗi chỗ — cái còn lại là cái escape.

## Raw string — bỏ qua mọi escape

Phải escape cả tá `\` thì mệt. **Raw string** bảo Rust coi **mọi ký tự theo nghĩa đen**, không xử lý escape. Thêm `r` trước dấu `"`:

```rust
let path = r"C:\My Documents\new\videos";       // không cần \\
println!("{path}");                             // C:\My Documents\new\videos
```

Trong raw string, `\n` là hai ký tự `\` và `n` thật, không phải newline.

Cần chứa cả dấu `"` trong raw string? Dùng `r#"..."#`:

```rust
let json = r#"{"name": "Alice", "age": 30}"#;   // dấu " bên trong giữ nguyên
println!("{json}");                             // {"name": "Alice", "age": 30}
```

| Dạng | Khi nào dùng |
|---|---|
| `"..."` | Bình thường, ít ký tự đặc biệt |
| `r"..."` | Nhiều `\` (đường dẫn, regex) |
| `r#"..."#` | Có cả `\` lẫn `"` (JSON, HTML) |

Raw string cực hữu ích cho **regex pattern**, **đường dẫn Windows**, **JSON nhúng** — chỗ backslash và quote dày đặc.

## Method — hàm sống trên giá trị

**Method** = một function **gắn liền trên một giá trị/type**. Khác function thường (gọi độc lập), method gọi **trên** một giá trị qua cú pháp dấu chấm:

```text
value . method_name ( args )
  │       │            │
  giá trị tên method   tham số (có thể không có)
```

```rust
fn main() {
    let value: i32 = -15;
    println!("{}", value.abs());        // 15 — trị tuyệt đối
}
```

`value.abs()`: lấy `value`, gọi method `abs` (absolute — khoảng cách tới 0). Cặp `()` **invoke** (chạy) method. Giá trị method trả về gọi là **return value** — ở đây là `15`.

### Method nhận argument

Như function, method có thể nhận **input** (argument) trong cặp ngoặc:

```rust
let value: i32 = -15;
println!("{}", value.pow(2));           // 225 — (-15)² = 225
println!("{}", value.pow(3));           // -3375 — (-15)³
```

`pow(2)` = lũy thừa bậc 2. Argument `2` tuỳ biến cách method chạy. Nhiều argument thì tách bằng dấu phẩy.

### Method trên string

String cũng có method. Kinh điển là `trim` — cắt khoảng trắng hai đầu:

```rust
fn main() {
    let messy = "   my content   ";
    println!("[{}]", messy.trim());     // [my content]
}
```

```text
"   my content   "  →  trim()  →  "my content"
```

Vài method string hay dùng:

```rust
let s = "Hello World";
s.len();              // 11 — số byte
s.to_uppercase();     // "HELLO WORLD"
s.to_lowercase();     // "hello world"
s.replace("o", "0");  // "Hell0 W0rld"
s.contains("World");  // true
s.starts_with("He");  // true
```

Method của integer/string/float đều do **đội Rust định nghĩa sẵn** — bạn không tự đặt tên (sau này phase Structs/Traits sẽ học tự viết method cho type của mình).

## Đào sâu: method có thể chain (nối chuỗi)

Vì method trả về giá trị, và giá trị đó lại có method, bạn **nối chuỗi** được — pipeline đọc trái sang phải:

```rust
fn main() {
    let raw = "   Hello World   ";
    let result = raw.trim().to_lowercase().replace(" ", "_");
    println!("{result}");               // hello_world
}
```

```text
"   Hello World   "
  → trim()         "Hello World"
  → to_lowercase() "hello world"
  → replace(" ","_") "hello_world"
```

Mỗi method nhận kết quả của method trước. Đây là phong cách rất Rust-ish, đặc biệt mạnh với iterator (phase Iterators).

## Use case thực tế: làm sạch input

```rust
fn normalize_email(raw: &str) -> String {
    raw.trim()                  // bỏ khoảng trắng vô tình
       .to_lowercase()          // email không phân biệt hoa thường
       .replace(' ', "")        // bỏ space giữa (lỗi gõ)
}

fn main() {
    println!("{}", normalize_email("  Alice@Example.COM  "));
    // alice@example.com
}
```

Pattern này (trim → lowercase → chuẩn hoá) gặp khắp nơi khi xử lý input người dùng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên escape `"` trong string | Compile error | Dùng `\"` hoặc raw `r#"..."#` |
| `\` đơn trong đường dẫn Windows | `\n`/`\t` bị hiểu nhầm | Dùng `\\` hoặc raw string `r"..."` |
| Gọi method quên cặp `()` | Không chạy method | Luôn có `()`: `s.trim()` không `s.trim` |
| Nhầm `&str` với `String` | Type mismatch sau này | `&str` = literal; `String` = động (phase sau) |
| Tưởng `\n` in ra `\n` | Xuống dòng bất ngờ | `\n` là newline; muốn chữ thật dùng raw |
| `len()` đếm ký tự | Thực ra đếm **byte** | Ký tự Unicode nhiều byte (xem bài 25) |

## Tóm tắt bài 21

- **String literal** = text hard-code trong `"..."`, biết tại compile time, type `&str`.
- **Ký tự đặc biệt**: `\n` xuống dòng, `\t` tab, `\"` in dấu nháy, `\\` in backslash.
- **Raw string** `r"..."` coi mọi ký tự theo nghĩa đen; `r#"..."#` chứa được cả `"`.
- **Method** = hàm trên giá trị: `value.method(args)`, `()` để invoke, trả về return value.
- Method **chain** được vì mỗi cái trả giá trị có method tiếp: `s.trim().to_lowercase()`.
- Method của type built-in do đội Rust định nghĩa; tự viết method học ở phase sau.

**Bài kế tiếp** → [Bài 22: Floats & Format Specifier — f32/f64, độ chính xác, làm tròn khi in](03-floats-va-format-specifier.md)
