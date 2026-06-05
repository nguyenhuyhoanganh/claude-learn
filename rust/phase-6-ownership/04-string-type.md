# Bài 46: String type — text động trên heap, `String::new`, `String::from`, `push_str`

Tới giờ string của bạn là `"text"` hard-code — không đổi được. Nhưng đời thực cần string **co giãn**: nối tên họ, đọc input user, build câu trả lời. Đó là type **`String`** (chữ S hoa) — text **động trên heap**. Đây là type heap đầu tiên ta dùng, và là ví dụ hoàn hảo để thấy ownership vận hành thật (bài 47). Bài này: `String` là gì, tạo nó, và điều gì xảy ra trên heap khi nó lớn lên.

## Hai loại string trong Rust

Điểm gây bối rối kinh điển cho người mới: Rust có **hai** type string.

| | `&str` (string literal/slice) | `String` |
|---|---|---|
| Cú pháp | `"pasta"` (double quote) | `String::from("pasta")` |
| Nằm ở đâu | Nhúng trong **binary executable** | **Heap** (runtime) |
| Biết khi nào | Compile time | Runtime |
| Đổi được? | **Không** (read-only) | **Có** (mutable, co giãn) |
| Copy trait? | Có (là reference) | **Không** (heap) |

`"pasta"` bạn dùng tới giờ là **`&str`** — text hard-code, compiler biết trước, nhúng thẳng vào file thực thi, **không đổi được**. (Bài 49 đào sâu `&str` vs `String`.)

`String` (chữ S hoa, viết đầy đủ) là type **khác hẳn** — text động trên heap, **đổi được**.

## Vì sao cần String

`&str` tuyệt khi biết text tại compile time. Nhưng nhiều tình huống cần string **động**:
- Input user (không biết bao nhiêu ký tự).
- Nội dung file (không biết kích thước).
- String cần **thêm/bớt/đổi** ký tự (mutation).

Mọi mutation đó **không thể** với `&str` (read-only, nhúng cố định) nhưng **được** với `String` — vì nó động, mutable, lưu trên **heap** (vùng hỗ trợ co giãn — bài 44).

## Tạo String: `new` và `from`

### `String::new()` — string rỗng

```rust
fn main() {
    let text = String::new();        // String rỗng
}
```

Cú pháp mới: `String::new()`.
- `String` = type, đồng thời là **namespace** (container chứa các function liên quan).
- `::` = đi vào namespace.
- `new` = một **function** (không phải method) sống trong namespace `String`, trả về `String` mới (rỗng).

`new` không gọi trực tiếp được — phải qua namespace `String::new()`. Đây là convention Rust phổ biến: type định nghĩa function `new` trong namespace của nó, trả về giá trị của type đó.

### `String::from("...")` — từ text có sẵn

```rust
fn main() {
    let candy = String::from("KitKat");   // String trên heap từ &str
}
```

`String::from` nhận một `&str` (string literal) và tạo một `String` trên heap dựa trên text đó. `"KitKat"` vẫn nhúng trong binary, nhưng runtime dùng nó làm cơ sở tạo `String` trên heap.

Cả hai cách, biến (`text`/`candy`) là **owner** của String, chịu trách nhiệm dọn heap khi ra khỏi scope.

## String trên heap trông ra sao: 3 phần metadata

Đây là phần quan trọng để hiểu ownership. Khi tạo `String`, có data ở **cả hai** vùng:
- **Text** ("Boris") nằm trên **heap**.
- **Metadata** nằm trên **stack**, gồm **ba** phần:

```text
STACK (metadata)              HEAP (text)
┌──────────────────┐
│ ptr  ───────────────────>  ['B','o','r','i','s']
│ len      = 5     │          (5 byte đang dùng)
│ capacity = 10    │          (10 byte được cấp)
└──────────────────┘
```

| Phần | Ý nghĩa |
|---|---|
| **ptr** (reference) | Địa chỉ tới text trên heap |
| **len** (length) | Số **byte** text đang dùng |
| **capacity** | Số **byte** đã cấp ở ô heap (≥ len) |

> Nhắc lại bài 25: `len` đếm **byte**, không phải ký tự. "Boris" = 5 byte (ASCII), nhưng ký tự Unicode nhiều byte thì len > số ký tự.

**Vì sao có capacity ≥ len**: allocator có thể cấp ô 10 byte cho text 5 byte. Dư 5 byte để **co giãn** sau — thêm ký tự vừa capacity thì không phải xin ô heap mới. Tối ưu hiệu năng.

## `push_str` — nối text (mutation)

`push_str` thêm text vào **cuối** String (gọi là **concatenation** — nối chuỗi). Chỉ có trên `String` (heap, mutable), **không** trên `&str`.

```rust
fn main() {
    let mut name = String::from("Boris");   // mut để cho phép mutation
    println!("{name}");                      // Boris

    name.push_str(" Pask");                  // nối " Pask"
    println!("{name}");                      // Boris Pask
}
```

Bắt buộc `mut` — biến immutable mặc định, mutation cần xin phép. `push_str` nhận một `&str` làm argument.

## Đào sâu: điều gì xảy ra trên heap khi push_str

Khi nối thêm text, có **hai** khả năng:

### Khả năng 1: còn đủ capacity

```text
Trước: len=5, capacity=10, text="Boris"
push_str(" Pas")  → cần 9 byte ≤ capacity 10
Sau:   len=9, capacity=10  ← ptr KHÔNG đổi, ghi thẳng vào ô cũ
```

Text mới ghi vào ô heap hiện tại. `ptr` và `capacity` giữ nguyên, chỉ `len` tăng. Nhanh.

### Khả năng 2: vượt capacity → reallocate

```text
Trước: len=9, capacity=10
push_str("kk")  → cần 11 byte > capacity 10
→ allocator tìm ô MỚI lớn hơn (vd capacity 20)
→ chép text sang ô mới, DỌN ô cũ
Sau:   ptr=ô_mới, len=11, capacity=20
```

Khi vượt capacity, Rust tìm ô heap **mới lớn hơn**, chép text sang, **dọn** ô cũ, cập nhật metadata (ptr, len, capacity). Đây chính là sự **linh hoạt của heap** — String co giãn được, điều `&str` không làm được.

Quá trình reallocate **đắt** (tìm ô + chép). Nếu biết trước kích thước, dùng `String::with_capacity(n)` để cấp sẵn, tránh reallocate nhiều lần — tối ưu production.

## Các method String hữu ích

```rust
let mut s = String::from("Hello");
s.push_str(", World");      // nối &str: "Hello, World"
s.push('!');                // nối MỘT char: "Hello, World!"
s.len();                    // 13 (byte)
s.clear();                  // xoá hết → "" (mutation)
s.is_empty();               // true sau clear
s.replace("l", "L");        // tạo String mới với thay thế
let n: String = String::from("a") + "b";   // nối bằng + (a phải là String)
```

`push` (một char) vs `push_str` (một &str) — đừng nhầm.

## Use case thực tế: build string động

```rust
fn build_greeting(name: &str, count: u32) -> String {
    let mut msg = String::new();
    msg.push_str("Chào ");
    msg.push_str(name);
    msg.push_str(", bạn có ");
    msg.push_str(&count.to_string());   // số → String
    msg.push_str(" tin nhắn");
    msg
}

fn main() {
    println!("{}", build_greeting("Anh", 5));
    // Chào Anh, bạn có 5 tin nhắn
}
```

Trong thực tế, macro `format!` thường gọn hơn cho ghép phức tạp: `format!("Chào {name}, bạn có {count} tin nhắn")` — trả về `String`, dùng cú pháp như `println!` nhưng không in mà trả giá trị.

## Khi nào dùng String vs &str

| Dùng `String` khi | Dùng `&str` khi |
|---|---|
| Text động, co giãn, mutate | Text hard-code, cố định |
| Sở hữu/lưu trữ text lâu dài | Chỉ đọc tạm thời |
| Build từ nhiều phần | Literal trong code |
| Trả về text tạo trong function | Tham số function chỉ đọc (bài 50) |

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `push_str` trên `&str` | Không có method | Dùng `String` |
| Quên `mut` khi mutate | Compile error | `let mut` |
| `len()` đếm ký tự | Thực ra đếm **byte** | `.chars().count()` cho ký tự |
| Nhầm `push` (char) với `push_str` (&str) | Type mismatch | `push('a')` vs `push_str("ab")` |
| Reallocate nhiều lần trong loop | Chậm | `String::with_capacity(n)` |
| Tưởng `String::new` là method | Là function trong namespace | Gọi qua `String::new()` |

## Tóm tắt bài 46

- Rust có hai string: **`&str`** (literal, nhúng binary, cố định, read-only) và **`String`** (heap, động, mutable).
- `String` cho text co giãn: input user, file, build động — điều `&str` không làm được.
- Tạo: `String::new()` (rỗng) hoặc `String::from("...")` (từ &str); biến là **owner**.
- String = text trên **heap** + metadata trên **stack** (ptr, len, capacity).
- **capacity ≥ len** để co giãn; vượt capacity → **reallocate** (tìm ô mới, chép, dọn cũ).
- `push_str(&str)` / `push(char)` nối text (cần `mut`); `format!` gọn cho ghép phức tạp.

**Bài kế tiếp** → [Bài 47: Move, drop, clone — chuyển quyền sở hữu heap data](05-move-drop-clone.md)
