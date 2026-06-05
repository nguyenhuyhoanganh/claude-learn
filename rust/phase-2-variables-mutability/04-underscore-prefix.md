# Bài 11: Underscore prefix `_` — tắt warning "unused variable" có chủ đích

> Khoá học sẽ liên tục khai báo variable để demo concept rồi chưa kịp dùng → warning "unused variable" ngập terminal. `_` prefix là cách báo Rust: "tao biết rồi, im đi". Bài này dạy 2 syntax (`_name` và `_`), khi nào dùng cái nào, và pattern `_` đặc biệt trong destructuring.

## Vấn đề: warning ngập màn hình

Sau khi học khai báo variable, code khoá học hay có dạng:

```rust
fn main() {
    let apples = 50;
    let oranges = 20;
    let grapes = 100;
    
    println!("Demo data types");
}
```

Output:
```text
warning: unused variable: `apples`
 --> src/main.rs:2:9
  |
2 |     let apples = 50;
  |         ^^^^^^ help: if this is intentional, prefix it with an underscore: `_apples`

warning: unused variable: `oranges`
warning: unused variable: `grapes`

Demo data types
```

3 warning cho 3 variable không dùng. Program vẫn chạy (warning không block), nhưng terminal lộn xộn — không thấy output thật rõ ràng.

## Giải pháp: thêm `_` đầu tên variable

Rust convention: variable bắt đầu bằng `_` được compiler **bỏ qua check unused**:

```rust
fn main() {
    let _apples = 50;
    let _oranges = 20;
    let _grapes = 100;
    
    println!("Demo data types");
}
```

Output sạch sẽ:
```text
Demo data types
```

Không warning. Variable vẫn tồn tại, vẫn có giá trị 50/20/100 — chỉ là compiler không complain về việc chưa dùng.

### `_` thuộc tên variable

Quan trọng nhớ: `_apples` là **tên đầy đủ** của variable. Khi dùng phải gọi `_apples`:

```rust
fn main() {
    let _apples = 50;
    println!("Có {} quả táo", _apples);    // OK
}
```

Khi đã dùng `_apples`, warning biến mất hoàn toàn — không có warning kép. `_` chỉ là cách opt-out.

## So sánh trước-sau

```rust
// Trước — warning kêu
fn main() {
    let apples = 50;
    let oranges = 20;
    // ...
}

// Sau — silent
fn main() {
    let _apples = 50;
    let _oranges = 20;
    // ...
}
```

## Pattern: `_` duy nhất (anonymous)

Khác với `_apples` (tên có `_` đầu), còn có pattern `_` đứng riêng — gọi là **discard pattern**:

```rust
let _ = 5;                  // discard value 5
let _ = some_function();     // discard return value
```

`_` đơn không phải tên variable — nó là **placeholder báo "throw away"**. Không thể tham chiếu lại:

```rust
let _ = 5;
println!("{_}");            // ERROR
```

Error:
```text
error: in expressions, `_` can only be used on the left-hand side of an assignment
```

`_` chỉ valid ở vế trái `=` để discard. Không phải variable name.

### Khi nào dùng `_` đơn

- Gọi function chỉ để side-effect, không care return value:
  ```rust
  let _ = std::fs::remove_file("temp.txt");
  ```
- Pattern matching destructure mà skip 1 field:
  ```rust
  let (_, y) = (1, 2);        // bỏ qua x, lấy y
  ```

Phase Tuples + Pattern matching sẽ đào sâu.

## `_` prefix vs `_` đơn — bảng

| | `_name` | `_` đơn |
|---|---|---|
| Là tên variable? | Có, tên đầy đủ là `_name` | Không, là discard |
| Có thể tham chiếu lại? | Có (gọi `_name`) | Không |
| Compiler check unused? | Bỏ qua | Bỏ qua |
| Khi nào dùng | Có thể cần dùng sau | Chắc chắn không dùng |

## Khuyến nghị production

Trong production code, `_` prefix nên hạn chế:
- Nếu variable không dùng → **xoá** dòng đó, không phải mặc kệ `_`.
- Variable có `_` thường gây confusion cho reader: "Tại sao có code mà không dùng?"

Khoá học dùng `_` nhiều vì mục đích **demo** — instructor cần khai báo variable để show syntax, nhưng chưa kịp dùng. OK trong context teaching.

Use case **chính đáng** của `_` prefix trong production:
- **Function parameter** không dùng nhưng signature bắt buộc khai báo:
  ```rust
  fn callback(_event: Event, data: i32) {
      println!("{data}");                // chỉ care data, ignore event
  }
  ```
- **Trait method** override mà không cần param:
  ```rust
  impl Drop for Resource {
      fn drop(&mut self) { /* ... */ }
  }
  ```
- Variable cần exist để `Drop` trait fire (vd. lock guard):
  ```rust
  let _lock = mutex.lock();              // giữ lock đến cuối scope
  ```

Phase Smart Pointers + Trait sẽ gặp lại.

## Demo verify

```rust
fn main() {
    let _unused = 50;
    let used = 100;
    
    println!("Used variable: {used}");
}
```

Output:
```text
Used variable: 100
```

Không warning. `_unused` exist nhưng không complain.

Thử bỏ `_`:
```rust
fn main() {
    let unused = 50;
    let used = 100;
    
    println!("Used variable: {used}");
}
```

Output:
```text
warning: unused variable: `unused`
Used variable: 100
```

Có warning.

## Compiler directive — alternative

Có cách khác tắt warning toàn file/function — bằng `#[allow(unused_variables)]`. Sẽ học chi tiết ở bài 14 (Compiler directives). Lúc này biết:

```rust
#[allow(unused_variables)]
fn main() {
    let apples = 50;
    let oranges = 20;
    println!("Demo");
}
```

`#[allow(...)]` apply lên function/block phía dưới. Không cần thêm `_` từng variable. Trade-off:
- `_` prefix: per-variable, rõ intent.
- `#[allow]`: per-function/file, gọn hơn nhưng quét chung.

## Pattern `_name` chung cho mọi binding

`_` prefix work với **mọi binding** — không chỉ `let`:

```rust
// Function param
fn process(_input: String) {
    println!("Ignored input");
}

// Pattern match
match value {
    Some(_x) => println!("Got something"),
    None => println!("Nothing"),
}

// Closure
let closure = |_arg| println!("Ignored arg");
```

Tất cả `_x`, `_input`, `_arg` đều silent unused warning.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `_apples` rồi tham chiếu `apples` | Phải gọi `_apples` (kể cả underscore). |
| `_` đơn rồi tham chiếu | Không được — `_` là discard. |
| `_` prefix vẫn cảnh báo unused khi tham chiếu | Đảm bảo gọi đúng `_name` không phải `name`. |
| Quên đặt `_` cho param trait không dùng | Warning. Hoặc dùng `_`. |
| Lạm dụng `_` thay vì xoá code chết | Production: xoá, đừng silent. |
| `_` cho variable mut | OK: `let mut _x = 5;` (hiếm khi cần). |

## Tóm tắt bài 11

- Warning "unused variable" hiện khi khai báo nhưng chưa dùng. Không block compile.
- Prefix `_` (`_apples`) → compiler bỏ qua check unused. Tên đầy đủ là `_apples`.
- `_` đơn = discard pattern — không phải tên, chỉ để throw away value.
- Khoá học dùng `_` cho demo concept. Production: xoá code dead thay vì silent.
- Use case chính đáng: function param không dùng, trait override, lock guard.
- Alternative tắt warning: `#[allow(unused_variables)]` apply cả function/file (bài 14).
- `_` prefix work với mọi binding: `let`, function param, pattern, closure.

**Bài kế tiếp** → [Bài 12: Immutable và mutable variables — `mut` keyword](05-immutable-and-mutable.md)
