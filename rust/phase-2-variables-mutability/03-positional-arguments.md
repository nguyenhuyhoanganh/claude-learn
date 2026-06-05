# Bài 10: Positional arguments — `{0}`, `{1}`, và bài học "đếm từ 0"

> `{}` chèn argument theo thứ tự. Nếu ta đặt index số trong `{}`, có thể chọn argument nào ta muốn — kể cả reuse 1 argument nhiều lần. Cú pháp này nhỏ, nhưng dạy bạn quy ước **đếm từ 0** — concept fundamental của mọi ngôn ngữ lập trình mà beginner phải internalize.

## Vấn đề: argument lặp lại

Đôi khi ta cần dùng cùng 1 variable nhiều lần trong 1 `println!`:

```rust
let apples = 50;

// Cú pháp cũ — phải lặp `apples` 3 lần
println!("I have {} apples. I can't believe I have {} apples! Yes, {} apples!", 
    apples, apples, apples);
```

Output:
```text
I have 50 apples. I can't believe I have 50 apples! Yes, 50 apples!
```

Phải truyền `apples` 3 lần — verbose. Nếu sau này đổi tên variable, phải sửa 3 chỗ.

### Inline cũng được nhưng đôi khi không tiện

```rust
println!("I have {apples} apples. Can't believe {apples}!");
```

OK với inline. Nhưng có những lúc ta muốn dùng expression — không phải variable đơn — thì inline không work, phải dùng positional. Lúc đó, positional index trở nên cực hữu ích.

## Cú pháp `{N}` — chỉ index argument

Mỗi argument sau string được Rust **đánh số** từ **0** trở đi:

```rust
let apples = 50;
let oranges = 20;
println!("{} apples, {} oranges", apples, oranges);
//                                  ↑       ↑
//                              index 0  index 1
```

Trong placeholder, ta có thể chỉ định **chính xác** index nào ta muốn:

```rust
let apples = 50;
let oranges = 20;
println!("{0} apples, {1} oranges", apples, oranges);
```

Cùng output:
```text
50 apples, 20 oranges
```

`{0}` = argument đầu (`apples`). `{1}` = argument thứ 2 (`oranges`).

### Lợi ích #1: Reuse argument

Áp dụng cho ví dụ lặp ở đầu bài:

```rust
let apples = 50;
println!("I have {0} apples. Can't believe I have {0} apples!", apples);
```

Chỉ truyền `apples` **1 lần**. Cả 2 `{0}` đều dùng argument duy nhất đó.

Output:
```text
I have 50 apples. Can't believe I have 50 apples!
```

Tiết kiệm code. Tránh sai sót khi sửa.

### Lợi ích #2: Đảo thứ tự

```rust
let apples = 50;
let oranges = 20;
println!("First {1}, then {0}", apples, oranges);
```

Output:
```text
First 20, then 50
```

`{1}` xuất hiện trước `{0}` trong string — Rust vẫn lấy đúng index. Linh hoạt khi đảo thứ tự hiển thị mà không đảo thứ tự argument.

### Lợi ích #3: Mix index với positional

Có thể trộn `{}` (positional auto-increment) với `{N}` (explicit index):

```rust
let a = 1;
let b = 2;
let c = 3;
println!("{} {} {0} {2}", a, b, c);
```

Output:
```text
1 2 1 3
```

Phân tích:
- `{}` đầu → next positional = arg index 0 = `1`.
- `{}` thứ 2 → next positional = arg index 1 = `2`.
- `{0}` → arg index 0 = `1`.
- `{2}` → arg index 2 = `3`.

Có thể trộn nhưng làm code khó đọc — hạn chế.

## Counting from 0 — bài học chung của lập trình

Đây là điểm transcript nhấn mạnh: **lập trình thường đếm từ 0**. Người thường đếm 1, 2, 3. Computer/code đếm 0, 1, 2.

```text
Người thường:   1  2  3  4  5
Lập trình:      0  1  2  3  4
```

Lý do lịch sử:
- C language (1972) chọn index 0 cho array.
- Vì address tính: `array[i]` = `base_address + i × size`.
- Index 0 → offset 0 → element đầu nằm ngay base_address. Đơn giản.
- C ảnh hưởng đến mọi ngôn ngữ sau: C++, Java, Python, JavaScript, Rust.

Hệ quả: trong code, bạn sẽ thấy đếm từ 0 **xuyên suốt**:

| Ngữ cảnh | Index đầu |
|---|---|
| Array element | `arr[0]` là phần tử đầu |
| String character | `s[0]` là ký tự đầu (với encoding nhất định) |
| Function argument | Arg đầu là position 0 |
| Loop counter | `for i in 0..10` chạy từ 0 đến 9 |
| Day of week | Có thể 0=Sunday hoặc 0=Monday tuỳ lib |

Beginner mất vài tuần để internalize. Cách rèn: count tay từ 0 khi nhìn vào collection. "Sáng nay tôi ăn 0 quả táo, 1 quả lê, 2 quả nho" → 3 fruit total nhưng index 0, 1, 2.

> Vài exception: Lua, MATLAB, Fortran đếm từ 1. Rất minority. Đa số 0-based.

## Demo program

```rust
fn main() {
    let apples = 50;
    let oranges = 20;
    let grapes = 100;
    
    // Cả 3 cách interpolation
    println!("Old positional:");
    println!("  {} {} {}", apples, oranges, grapes);
    
    println!("With index:");
    println!("  {0} {1} {2}", apples, oranges, grapes);
    
    println!("Reversed via index:");
    println!("  {2} {1} {0}", apples, oranges, grapes);
    
    println!("Reuse via index:");
    println!("  {0} {0} {0} {1}", apples, oranges, grapes);
    
    println!("Inline (Rust 1.58+):");
    println!("  {apples} {oranges} {grapes}");
}
```

Output:
```text
Old positional:
  50 20 100
With index:
  50 20 100
Reversed via index:
  100 20 50
Reuse via index:
  50 50 50 20
Inline (Rust 1.58+):
  50 20 100
```

Quan sát:
- Dòng 1 và 2 giống nhau — `{}` và `{0}{1}{2}` cùng nghĩa.
- Dòng 3 — đảo thứ tự hiển thị.
- Dòng 4 — reuse `apples` 3 lần với `{0}`, kèm 1 `{1}` cho `oranges`.
- Dòng 5 — inline tương đương.

## Index out of range — compile error

```rust
println!("{2}", 5);              // chỉ 1 arg, index 2 không tồn tại
```

Error:
```text
error: invalid reference to positional argument 2 (there is 1 argument)
```

Compiler check lúc compile — không có chuyện crash runtime vì index sai.

## Named argument — alternative

Bonus: Rust còn cú pháp **named argument**:

```rust
println!("{name} is {age}", name = "Alice", age = 30);
```

Output:
```text
Alice is 30
```

Tương tự inline nhưng arg đặt tên explicit. Hữu ích khi muốn dùng tên rõ nghĩa mà variable thực tế không có tên đó.

Khoá học chủ yếu dùng:
1. Positional `{}` cho expression.
2. Inline `{var}` cho variable.

Indexed `{N}` ít dùng — chỉ khi cần reuse hoặc reorder.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Đếm từ 1 → off-by-one | Nhớ: arg đầu là index `0`. |
| Index out of range `{5}` mà chỉ 3 arg | Compile error. Đếm lại. |
| Nhầm inline `{name}` với indexed `{0}` | Khác — inline lấy var theo tên, indexed lấy arg theo position. |
| Mix nhiều cách trong 1 string | Hợp lệ nhưng khó đọc. Stick 1 style. |
| Index `{01}` (leading zero) | Compiler treat `{01}` = `{1}`. Tránh confusion. |

## Tóm tắt bài 10

- `{N}` chỉ định **index argument cụ thể** sau string.
- Argument đếm **từ 0**: arg đầu = `{0}`, arg 2 = `{1}`, ...
- Lợi ích: reuse argument (`{0}` nhiều lần), reorder hiển thị.
- Có thể mix `{}` positional với `{N}` indexed.
- Lập trình **đếm từ 0** — quy ước phổ quát kế thừa từ C 1972.
- Index out of range → compile error.
- Named argument `{name}` với `name = value` là alternative.

**Bài kế tiếp** → [Bài 11: Underscore prefix — tắt warning "unused variable"](04-underscore-prefix.md)
