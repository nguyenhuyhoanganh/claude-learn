# Bài 9: Interpolation với `{}` trong `println!` — chèn dynamic value vào string

> Bài trước ta khai báo variable nhưng chưa biết cách hiển thị. `println!` cho phép chèn giá trị variable vào string qua **interpolation**. Bài này đào sâu cú pháp `{}`, alternative inline `{name}` của Rust 1.58+, multi-placeholder, và 2 lỗi compile phổ biến (sai tên + case sensitivity).

## `println!` — recap

`println!` macro xuất text ra terminal **kèm line break** ở cuối. Khác với function thông thường, macro có `!` đặc trưng:

```rust
fn main() {
    println!("My garden");
    println!("My house");
}
```

Output:
```text
My garden
My house
```

Hai dòng riêng biệt vì `println!` (line break tự động). So sánh với `print!` (không line break):

```rust
fn main() {
    print!("Hello ");
    print!("World");
}
```

Output:
```text
Hello World
```

Cursor không xuống dòng — nội dung dính nhau cùng dòng.

Trong khoá học chủ yếu dùng `println!`.

## String — chuỗi ký tự trong `" "`

Bên trong `println!(...)`, nội dung trong cặp `" "` gọi là **string** (chuỗi). Đây là cách Rust hiểu "đây là 1 đoạn text, không phải code":

```rust
println!("My garden");
//        ↑         ↑
//      mở "     đóng "
```

Mọi ký tự giữa 2 dấu `"` được coi là text — bao gồm space, dấu chấm, số, emoji...

## Hardcoded vs Dynamic

**Hardcoded** = giá trị **viết cứng** vào code. Khi chạy, luôn ra cùng nội dung:

```rust
println!("Có 50 quả táo");        // always: Có 50 quả táo
```

**Dynamic** = giá trị **có thể thay đổi** — từ variable, từ user input, từ database, từ random:

```rust
let apples = 50;
println!("Có {} quả táo", apples);    // 50 lúc này
                                       // có thể 100, 200... nếu apples đổi
```

**Interpolation** = "chèn 1 giá trị dynamic vào string". Đây là feature **mọi ngôn ngữ lập trình đều có** dưới hình thức nào đó:

| Ngôn ngữ | Cú pháp |
|---|---|
| Rust | `println!("Has {} items", count)` hoặc `println!("Has {count} items")` |
| Python | `f"Has {count} items"` |
| JavaScript | `` `Has ${count} items` `` |
| C | `printf("Has %d items", count)` |
| Java | `System.out.printf("Has %d items", count)` |
| Go | `fmt.Printf("Has %d items", count)` |

Rust dùng `{}` đơn giản — tương tự `printf` của C nhưng type-safe.

## Cú pháp `{}` — positional argument

Cú pháp gốc của Rust (từ ngày đầu):

```rust
let apples = 50;
println!("My garden has {} apples", apples);
```

Cách Rust xử lý:
1. Đọc string `"My garden has {} apples"`.
2. Gặp `{}` — placeholder cần thay.
3. Lấy argument đầu sau dấu `,` để chèn vào.
4. `apples` resolve về `50` → chèn `50` vào chỗ `{}`.

Kết quả:
```text
My garden has 50 apples
```

### Multi-placeholder + multi-argument

Nhiều `{}` → nhiều argument tương ứng theo thứ tự:

```rust
let apples = 50;
let oranges = 20;
println!("My garden has {} apples and {} oranges", apples, oranges);
```

Output:
```text
My garden has 50 apples and 20 oranges
```

Quy tắc:
- Mỗi `{}` cần 1 argument theo thứ tự xuất hiện.
- Argument cách nhau bởi `,`.
- Convention: space sau `,` để dễ đọc.

### Expression làm argument

Không chỉ variable — bất kỳ expression nào cũng được:

```rust
let apples = 50;
println!("After eating, I have {} apples", apples - 10);
```

Rust evaluate `apples - 10` = `40`, rồi chèn `40` vào `{}`.

Output:
```text
After eating, I have 40 apples
```

Expression có thể phức tạp:

```rust
let a = 5;
let b = 3;
println!("Sum: {}, Product: {}, Quotient: {}", a + b, a * b, a / b);
```

Output:
```text
Sum: 8, Product: 15, Quotient: 1
```

## Inline `{var_name}` — Rust 1.58+

Từ Rust 1.58 (Jan 2022), có cú pháp ngắn hơn — viết tên variable thẳng trong `{}`:

```rust
let apples = 50;
println!("My garden has {apples} apples");
```

Cùng kết quả, không cần argument sau:
```text
My garden has 50 apples
```

So sánh 2 cú pháp:

```rust
// Old positional
println!("Has {} apples and {} oranges", apples, oranges);

// New inline (1.58+)
println!("Has {apples} apples and {oranges} oranges");
```

### Inline chỉ accept variable name

**Quan trọng**: inline syntax **chỉ chấp nhận tên variable đơn**, không cho phép expression:

```rust
let apples = 50;
println!("Has {apples}");              // OK
println!("Has {apples - 10}");          // ERROR — expression không được
```

Compiler error:
```text
error: invalid format string
```

Muốn dùng expression → positional:
```rust
println!("Has {} after eating", apples - 10);
```

### Khi nào dùng cái nào

| Tình huống | Chọn |
|---|---|
| Variable đơn giản | Inline `{apples}` |
| Expression (`a + b`, `func()`) | Positional `{}` + arg |
| 1 variable dùng nhiều lần | Inline (đỡ lặp) |
| Mix variable + expression | Trộn được |

Mix được:
```rust
let apples = 50;
let bonus = 5;
println!("Have {apples}, will get {} more", bonus * 2);
```

Output:
```text
Have 50, will get 10 more
```

## Vai trò của `{}` — quan trọng

`{}` là **báo hiệu cho Rust**: "đây là chỗ chèn dynamic content". Quên `{}` → Rust hiểu là text thường:

```rust
let apples = 50;
println!("My garden has apples apples");
```

Output:
```text
My garden has apples apples
```

Chữ "apples" thứ 2 hiển thị **literal text** — Rust không hiểu là variable. Phải có `{}` để mark placeholder.

## 2 lỗi compile phổ biến với interpolation

### Lỗi 1: Tên sai (typo)

```rust
let apples = 50;
println!("Has {applez} fruits");        // typo: z thay s
```

Compile error:
```text
error[E0425]: cannot find value `applez` in this scope
 --> src/main.rs:3:20
  |
3 |     println!("Has {applez} fruits");
  |                    ^^^^^^ not found in this scope
help: a local variable with a similar name exists: `apples`
```

Rust catch:
- **Dòng + cột** sai.
- Lỗi gì.
- **Suggestion** tên gần đúng (`apples`).

→ Sửa typo, save, recompile → OK.

### Lỗi 2: Case sensitivity

```rust
let apples = 50;
println!("Has {Apples} fruits");        // capital A
```

Compile error:
```text
error[E0425]: cannot find value `Apples` in this scope
help: a local variable with a similar name exists: `apples`
```

Rust **case-sensitive**. `Apples` ≠ `apples` ≠ `APPLES`. Đây là 3 identifier khác nhau hoàn toàn.

→ Sửa về `apples` lowercase.

### Vì sao Rust strict case

Lý do:
- Catch bug typo sớm.
- Cho phép phân biệt:
  - `apple` (variable, snake_case).
  - `Apple` (type, PascalCase).
  - `APPLE` (constant, SCREAMING).

3 tên cùng "apple" nhưng 3 vai trò khác — case differentiate.

## Số đối số phải khớp số placeholder

```rust
println!("{} {} {}", 1, 2);        // 3 placeholder nhưng 2 arg
```

Compile error:
```text
error: 3 positional arguments in format string, but there are 2 arguments
```

Tương tự thiếu placeholder:
```rust
println!("{} {}", 1, 2, 3);        // 2 placeholder, 3 arg
```

Error:
```text
error: argument never used
  --> src/main.rs:2:25
   |
2  |     println!("{} {}", 1, 2, 3);
   |              ------         ^ argument never used
```

Compiler luôn catch mismatch — **type safety lúc compile**.

## Test verify trên máy

```rust
fn main() {
    let apples = 50;
    let oranges = 20;
    
    // Cách 1: positional
    println!("My garden has {} apples and {} oranges", apples, oranges);
    
    // Cách 2: inline
    println!("My garden has {apples} apples and {oranges} oranges");
    
    // Cách 3: mix
    println!("Total: {}", apples + oranges);
}
```

Output:
```text
My garden has 50 apples and 20 oranges
My garden has 50 apples and 20 oranges
Total: 70
```

3 dòng. 2 dòng đầu giống hệt (chứng minh 2 syntax tương đương).

## Bẫy thường gặp

| Bẫy | Cách sửa |
|---|---|
| Quên `{}` placeholder → text literal | Thêm `{}` chỗ cần chèn. |
| Typo tên variable | Đọc suggestion compiler, fix. |
| Case sai (`Apples` thay `apples`) | Match exact case. |
| Inline với expression `{a + b}` | Dùng positional `{}` + arg. |
| Số `{}` ≠ số arg | Compiler catch — đếm lại. |
| Quên `,` giữa arg | Compiler báo expected `,`. |
| Quên `;` cuối `println!` | Statement chưa terminate. |
| `print!` vs `println!` confusion | `ln` = line break tự động. |

## Tóm tắt bài 9

- `println!` xuất text + line break tự động. `print!` không line break.
- String trong `" "` — mọi ký tự bên trong là text literal.
- `{}` = placeholder để chèn dynamic value.
- 2 syntax: positional `{} ... arg, arg` vs inline `{var_name}` (Rust 1.58+).
- Inline chỉ accept variable name đơn. Expression phải dùng positional.
- Rust catch typo + case sensitivity lúc compile — error message kèm suggest.
- Số `{}` phải match số argument — compiler enforce.

**Bài kế tiếp** → [Bài 10: Positional arguments — index 0, 1, 2... và bài học counting from 0](03-positional-arguments.md)
