# Bài 33: Project & Section Review — ráp toàn bộ phase Functions

Hết phase Functions. Bài này giải một project buộc bạn viết nhiều function với số input và type trả về khác nhau, rồi tổng kết toàn phase.

## Đề bài project

Viết ba function:
1. `apply_to_jobs(number, title)` — nhận i32 và &str, **in** câu, không trả gì.
2. `is_even(number)` — nhận i32, **trả** bool (số có chẵn không).
3. `alphabets(text)` — nhận &str, **trả** tuple `(bool, bool)`: có chứa 'a'? có chứa 'z'?

## Lời giải đầy đủ

```rust
fn apply_to_jobs(number: i32, title: &str) {        // trả unit () — không -> 
    println!("Tôi đang ứng tuyển {number} công việc {title}");
}

fn is_even(number: i32) -> bool {
    number % 2 == 0                                   // implicit return bool
}

fn alphabets(text: &str) -> (bool, bool) {
    (text.contains('a'), text.contains('z'))         // implicit return tuple
}

fn main() {
    apply_to_jobs(35, "Rust developer");
    // Tôi đang ứng tuyển 35 công việc Rust developer

    println!("{}", is_even(8));                       // true
    println!("{}", is_even(9));                       // false

    println!("{:?}", alphabets("aardvark"));          // (true, false)
    println!("{:?}", alphabets("zoology"));           // (false, true)
    println!("{:?}", alphabets("zebra"));             // (true, true)
}
```

### Phân tích từng function

| Function | Input | Return | Kỹ thuật |
|---|---|---|---|
| `apply_to_jobs` | 2 param (i32, &str) | unit `()` | Không `->`, chỉ `println!` |
| `is_even` | 1 param (i32) | `bool` | `% 2 == 0`, implicit return |
| `alphabets` | 1 param (&str) | `(bool, bool)` | tuple, `contains`, implicit |

Điểm cần thấy:
- **Số input khác nhau**: `main`(0), `is_even`(1), `apply_to_jobs`(2).
- **Type trả về khác nhau**: unit, bool, tuple — không liên quan type parameter.
- `alphabets` trả tuple → in bằng `{:?}` (tuple không có Display, chỉ Debug — nhắc lại bài 27, 28).

### Bẫy `;` trong `is_even`

```rust
fn is_even(number: i32) -> bool {
    number % 2 == 0;            // CÓ ; → trả () thay vì bool → LỖI
}
```

Có `;`, dòng thành statement, hàm trả unit → mismatch với `-> bool`. Bỏ `;` để implicit return. Nếu muốn giữ `;`, phải dùng `return`:

```rust
fn is_even(number: i32) -> bool {
    return number % 2 == 0;     // có return + ; → OK
}
```

Cả hai chạy, nhưng implicit (không `return`, không `;`) là idiomatic.

### Biến trung gian cũng tốt

`alphabets` viết một dòng rất gọn, nhưng tách biến cũng hoàn toàn ổn, thậm chí dễ đọc hơn:

```rust
fn alphabets(text: &str) -> (bool, bool) {
    let has_a = text.contains('a');
    let has_z = text.contains('z');
    (has_a, has_z)             // tuple từ hai biến
}
```

Đặt tên biến mô tả dữ liệu là **điểm mạnh**, không phải yếu. Chọn rõ ràng hơn là ngắn.

---

# Section Review — tổng kết phase Functions

## Khai báo và gọi

- **Function** = chuỗi bước tái sử dụng. `fn name() { ... }`, tên snake_case.
- `main` chạy tự động; function khác phải **invoke** bằng `name()`.
- Rust không quan tâm thứ tự định nghĩa (trước/sau `main`), miễn cùng scope thấy được.

## Parameter & Argument (input)

- **Parameter** = tên input mong đợi, khai trong `()`, **bắt buộc** `: type`.
- **Argument** = giá trị cụ thể truyền khi gọi.
- Nhiều parameter tách bằng `,`; compiler kiểm tra **số lượng + type**.
- Parameter dùng như biến trong thân hàm; mỗi lần gọi nhận giá trị khác.

## Return value (output)

- Khai type trả về bằng `-> type` sau `()`.
- **Explicit**: `return value;` — kết thúc hàm ngay (code sau là unreachable).
- **Implicit** (idiomatic): dòng cuối **bỏ `;`** → tự động là return value.
- Không khai/không trả gì → trả **unit `()`**; không cần ghi `-> ()`.

## Statement vs Expression

```text
statement   : làm việc, không giá trị, kết thúc ;   → let x = 5;
expression  : đánh giá thành giá trị, không ;       → 5 + 3, square(2)
dấu ;       : biến expression → statement (vứt giá trị)
```

- **Block `{}` là expression** → trả dòng cuối không `;`.
- Vì vậy `if`/`match`/`loop` **trả giá trị** → gán thẳng vào biến (Rust expression-oriented).
- Mọi nhánh `if`/`match` phải **cùng type**.

## Bản đồ phase Functions

```text
fn name(param: type, ...) -> ret_type {
│        │                   │           │
│        │                   │           └ thân = block (expression)
│        │                   └ return value (implicit: dòng cuối không ;)
│        └ parameter (input, bắt buộc type)
└ keyword fn

invoke: name(arg, ...)        ← arg = giá trị cụ thể

statement ; ≠ expression (không ;)
block / if / match → trả giá trị (cùng type mọi nhánh)
```

## Bẫy tổng hợp toàn phase

| Bẫy | Cách tránh |
|---|---|
| Quên `()` khi gọi | Luôn `name()` |
| Quên type parameter | Param bắt buộc `: type` |
| Thừa `;` ở implicit return | Bỏ `;` dòng cuối |
| Quên `-> type` khi có trả về | Khai sau `->` |
| Nhánh `if` khác type | Mọi nhánh cùng type |
| Hàm quá nhiều việc | Chia nhỏ, single responsibility |

## Triết lý: hàm nhỏ, một việc

Xây chương trình tốt = ghép nhiều **viên gạch nhỏ** (function một trách nhiệm), không phải vài hàm khổng lồ. Dấu hiệu hàm quá tải: thân dài cả trăm dòng, hoặc nhận chục parameter. Tách logic tái sử dụng thành function — lời khuyên đúng cho mọi ngôn ngữ.

## Tóm tắt phase Functions

- Function gói logic tái sử dụng: `fn`, parameter (input, bắt buộc type), return value (output).
- **Implicit return** (dòng cuối bỏ `;`) là idiomatic; `return` cho thoát sớm.
- Không trả gì → **unit `()`**.
- **Statement** (`;`, không giá trị) vs **expression** (không `;`, có giá trị) — chìa khoá cú pháp Rust.
- Block là expression → `if`/`match` trả giá trị, gán thẳng vào biến.
- Thiết kế: hàm nhỏ, một trách nhiệm.

Bạn đã biết đóng gói logic thành function tái sử dụng. Phase tiếp theo: **control flow** — `if`/`else`, `match`, vòng `loop`/`while`/`for` — cách chương trình **ra quyết định** và **lặp lại**, tận dụng chính cái tính chất "if là expression" vừa học.

**Bài kế tiếp** → [Bài 34: Câu lệnh `if` — chương trình ra quyết định](../phase-5-control-flow/01-if-else-statements.md)
