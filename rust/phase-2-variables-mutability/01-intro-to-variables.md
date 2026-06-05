# Bài 8: Intro Variables — let, inferred type, warning đầu tiên

> Sau khi học function `main` và macro `println!`, đến lúc dạy **variable** — concept đầu tiên thực sự "lập trình". Bài này dạy chi tiết: variable là gì, vì sao cần, cú pháp `let`, snake_case naming, inferred type (i32), và warning "unused variable" mà beginner sẽ gặp liên tục.

## Variable là gì — định nghĩa thực dụng

**Variable** = "**tên** ta gán cho 1 **giá trị**". Hãy nghĩ variable như một **placeholder** hoặc **stand-in** (thế vai) cho giá trị. Bất cứ khi nào muốn dùng giá trị đó, ta có thể viết tên variable thay vì viết lại giá trị thô.

Variable mang 2 lợi ích cốt lõi:

**1. Variable cung cấp context — ý nghĩa về giá trị**

Hãy xem 2 đoạn code sau:

```rust
fn main() {
    println!("My garden has {}", 50);
}
```

```rust
fn main() {
    let apples = 50;
    println!("My garden has {} apples", apples);
}
```

Code đầu tiên: `50` là gì? Một con số bí ẩn. Developer khác đọc code chỉ thấy literal `50` — không hiểu nó đại diện cho gì.

Code thứ hai: ta thấy ngay — `50` là số **apples** (táo). Variable name là **documentation tự thân**. Tên rõ ràng = ít comment cần thiết.

**2. Variable cho phép tái sử dụng**

Nếu code có 10 chỗ dùng `50`, mà ngày mai cần đổi thành `60`, ta phải tìm-thay 10 chỗ. Lỡ sót 1 chỗ → bug. Nếu dùng variable `let apples = 50;` và 10 chỗ tham chiếu `apples`, đổi 1 dòng `= 60;` → đồng bộ toàn bộ.

Hai lợi ích này là **bài học cơ bản #1** của lập trình. Hardcoded literal số/string trong code = "**magic number**" — anti-pattern phổ biến. Variable / constant là antidote.

## Cú pháp `let` — khai báo variable

Variable Rust khai báo qua keyword `let`. Cú pháp:

```rust
let name = value;
```

4 thành phần theo thứ tự:

1. **`let`** — keyword. Báo Rust ta đang khai báo variable mới.
2. **`name`** — variable name (identifier). Tự đặt.
3. **`=`** — assignment operator. Gán giá trị bên phải vào tên bên trái.
4. **`value`** — giá trị khởi tạo (literal hoặc expression).
5. **`;`** — semicolon. Kết thúc statement.

Ví dụ cụ thể:

```rust
fn main() {
    let apples = 50;
    let oranges = 14 + 6;
    let fruits = apples + oranges;
}
```

3 statement. Đọc lần lượt:
- `apples` được gán giá trị `50`.
- `oranges` được gán giá trị `20` (Rust evaluate `14 + 6` trước rồi gán).
- `fruits` được gán giá trị `70` (Rust resolve `apples = 50`, `oranges = 20`, cộng).

### Đánh giá right-hand side trước

Quan trọng nhớ: Rust **luôn evaluate vế phải `=` trước**, **rồi** gán cho vế trái.

```rust
let x = 2 + 3 * 4;        // evaluate 2 + 3*4 = 14, rồi gán x = 14
let y = some_function();   // gọi function, lấy return value, gán y
let z = x + y;             // dùng giá trị hiện tại của x, y
```

Quy tắc này đơn giản nhưng phải nhớ vững. Code phức tạp sẽ chain nhiều expression — Rust luôn resolve từ trong ra ngoài, phải sang trái.

### Spacing convention quanh `=`

Quy ước cộng đồng:

```rust
let apples = 50;          // GOOD — space cả 2 bên =
let apples=50;            // OK Rust accept, nhưng xấu
let apples =50;           // OK, xấu
```

`cargo fmt` tự reformat về dạng có space. Đừng tốn công gõ sai.

## Snake_case — quy ước đặt tên Rust

Rust quy ước variable name dùng **snake_case**:

| Pattern | Quy tắc | Ví dụ |
|---|---|---|
| **snake_case** (Rust prefer) | lowercase, words tách bằng `_` | `apple_count`, `user_email`, `is_active` |
| **camelCase** (JavaScript style) | lowercase đầu, viết hoa từ kế | `appleCount`, `userEmail` |
| **PascalCase** (Type style) | viết hoa mọi từ | `AppleCount`, `UserEmail` |
| **SCREAMING_SNAKE** (const style) | UPPERCASE + `_` | `MAX_USERS`, `PI_VALUE` |

Convention Rust:
- **Variable + function** → snake_case.
- **Type, struct, enum** → PascalCase.
- **Constant + static** → SCREAMING_SNAKE_CASE.

Tên gọi "snake_case" vì khi nhìn từ xa, dấu `_` nối các chữ trông như con rắn. (Đùa thôi — không cần nhớ lý do, chỉ cần nhớ quy tắc.)

### Compiler warning khi sai convention

```rust
fn main() {
    let appleCount = 50;        // camelCase — Rust warn
    println!("{}", appleCount);
}
```

Output:
```text
warning: variable `appleCount` should have a snake case name
  help: convert the identifier to snake case: `apple_count`
```

Rust compiler **chỉ rõ chỗ sai + suggest tên đúng**. Đây là một trong những điểm mạnh nhất của Rust — error message hữu ích. Sửa theo gợi ý:

```rust
let apple_count = 50;
```

Warning biến mất.

### Quy tắc đặt tên kỹ thuật

Variable name **phải**:
- Bắt đầu bằng **chữ cái** (a-z, A-Z) hoặc **underscore** `_`.
- Tiếp theo có thể là chữ, số, hoặc `_`.
- **Không** chứa space, dấu gạch ngang `-`, ký hiệu đặc biệt `@#$!`.
- **Không** trùng với keyword Rust (`let`, `fn`, `if`, `mut`, `return`, ...).

Hợp lệ:
```rust
let x = 1;
let counter = 0;
let user_name = "Alice";
let _unused = 5;
let item_1 = "a";
let userName = "Bob";          // hợp lệ nhưng warn
```

Không hợp lệ:
```rust
let 1st = 5;                   // bắt đầu bằng số
let user-name = "x";           // dấu -
let my var = 10;                // space
let let = 5;                   // keyword
```

### Unicode trong tên

Rust hỗ trợ Unicode trong tên:

```rust
let π = 3.14159;
let 名前 = "Alice";
let tên = "Bob";
```

Compile được, nhưng **không nên dùng**. Cộng đồng Rust convention English ASCII — code dễ search, dễ chia sẻ. Unicode chỉ hợp cho personal toy project.

## Variable assignment là 1 statement

Dòng `let apples = 50;` là **statement**. Phase Functions sẽ phân biệt statement vs expression. Lúc này nhớ:

- Statement = "ra lệnh làm việc gì đó", kết thúc bằng `;`.
- Variable assignment là 1 thought hoàn chỉnh → cần `;` kết câu.

```rust
let x = 5;                    // dấu ; bắt buộc
let y = 10                    // ERROR — thiếu ;
```

Error:
```text
error: expected `;`, found `let`
 --> src/main.rs:3:14
  |
2 |     let y = 10
  |              ^ help: add `;` here
```

Một trong những lỗi phổ biến nhất với beginner. Compiler chỉ rõ ngay dòng + cột thiếu.

## Inferred type — `i32` từ rust-analyzer

Sau khi gõ `let apples = 50;` trong VSCode, extension **rust-analyzer** sẽ hiển thị:

```text
let apples: i32 = 50;
         ─────
       hiển thị ngầm
       (không nằm trong source code)
```

`: i32` này **không** thuộc source code — chỉ là **inlay hint** mà rust-analyzer chèn vào hiển thị giúp ta. Mục đích: cho biết Rust **suy luận** type của variable là gì.

### Type là gì

**Type** = "loại dữ liệu". Mỗi value trong Rust có type xác định. Khi ta gán `50`, Rust hỏi: "50 là loại nào?":
- **Integer** (số nguyên): 0, 1, -5, 50, 1000000.
- **Float** (số thập phân): 3.14, 0.001, 1.5.
- **String** (text): "Hello", "Alice".
- **Boolean**: true / false.
- **Character**: 'A', 'é'.
- ...

Phase Data Types (3) đào sâu. Lúc này biết: `50` là integer → Rust default type là `i32`.

### `i32` nghĩa là gì

`i32`:
- `i` — **integer** (số nguyên, có thể âm).
- `32` — **32 bits** memory.

32 bits = 4 bytes. Range biểu diễn được: -2,147,483,648 đến 2,147,483,647 (~ 2 tỷ).

Default `i32` được chọn vì cân bằng:
- Đủ lớn cho hầu hết counter, ID, age, year.
- Đủ nhỏ để CPU xử lý 1 cycle.
- Phổ biến trên mọi architecture.

Phase Data Types sẽ học 12 integer type khác (`i8`, `u8`, `i64`, `u64`, ...) và khi nào dùng cái nào.

### Inlay hints — bật/tắt trong VSCode

`rust-analyzer` mặc định hiển thị inlay hints (`: i32`). Nếu chữ hiển thị mờ làm bạn khó chịu:

VSCode → Settings → search "rust-analyzer.inlayHints" → toggle.

Cá nhân tôi để bật — feedback ngay tức thì về type đỡ phải đoán. Beginner đặc biệt nên bật.

## Warning "unused variable"

Sau khi gõ `let apples = 50;` và save, VSCode sẽ hiển thị **squiggly line** màu vàng dưới `apples`. Hover chuột:

```text
warning: unused variable: `apples`
help: if this is intentional, prefix it with an underscore: `_apples`
```

### Warning vs Error

| | Warning | Error |
|---|---|---|
| Đường gạch | Vàng | Đỏ |
| Build | Vẫn build, vẫn chạy | KHÔNG build, không chạy |
| Mức độ | Cảnh báo, gợi ý cải thiện | Phải sửa mới chạy được |
| Ví dụ | Unused variable, naming sai | Sai syntax, type mismatch |

Warning **không block** compile. Program vẫn chạy bình thường:

```text
$ cargo run
warning: unused variable: `apples`
...
   Compiling hello_world v0.1.0
    Finished `dev` profile
     Running `target/debug/hello_world`
```

Error **block** compile:

```text
$ cargo run
error[E0425]: cannot find value `applez` in this scope
...
error: could not compile `hello_world` due to 1 previous error
```

Không có output "Running" — program không chạy.

### Vì sao có warning "unused variable"

Rust warn để nhắc:
- Có thể bạn quên dùng → bug logic.
- Hoặc bạn cố tình → nói rõ với compiler.

Trong production, tốt nhất **fix mọi warning**. Variable không dùng = code chết, gây nhầm lẫn cho reader, có thể là sót bug.

Trong khoá học, ta thường khai báo variable để **demo** concept, chưa kịp dùng → warning xuất hiện ngẫu nhiên. **Đừng panic**. Có 3 cách handle:

1. **Bỏ qua** — warning không ngăn chạy.
2. **Dùng variable** — `println!("{apples}");`.
3. **Prefix `_`** — bài kế tiếp sẽ học.

## Demo program đầy đủ

```rust
fn main() {
    let apples = 50;
    let oranges = 14 + 6;
    let fruits = apples + oranges;
}
```

Save, chạy:
```text
$ cargo run
warning: unused variable: `apples`
warning: unused variable: `oranges`
warning: unused variable: `fruits`
    Finished `dev` profile
     Running `target/debug/hello_world`
```

Không có output gì khác vì ta chưa gọi `println!`. 3 warning vì 3 variable không dùng.

Để thấy output, thêm `println!`:

```rust
fn main() {
    let apples = 50;
    let oranges = 14 + 6;
    let fruits = apples + oranges;
    println!("Total fruits: {}", fruits);
}
```

Output:
```text
Total fruits: 70
```

`{}` là placeholder — bài kế tiếp sẽ đào sâu.

## Bẫy thường gặp

| Bẫy | Cách sửa |
|---|---|
| Quên `;` cuối `let` | Compiler chỉ rõ dòng + cột. Thêm `;`. |
| Đặt tên camelCase | Warning. Đổi snake_case. |
| Tên bắt đầu bằng số (`let 2nd = 5`) | Error. Bắt đầu bằng chữ hoặc `_`. |
| Tham chiếu variable chưa khai báo | Error E0425 "cannot find value". Khai trước. |
| `let APPLES = 50` (uppercase) | Warning. UPPERCASE chỉ cho `const`. |
| Tưởng warning là error | Warning OK build vẫn chạy. Error block. |
| Inferred type hiển thị làm bạn nghĩ là source code | Đó là inlay hint từ rust-analyzer, không phải code thật. |
| `let` 2 lần cùng tên cùng scope | Hợp lệ — gọi là shadowing (bài sau). |

## Tóm tắt bài 8

- Variable = **tên** ta gán cho **giá trị**. 2 lợi ích: context + reuse.
- Cú pháp: `let name = value;`. 5 thành phần — `let`, name, `=`, value, `;`.
- Rust evaluate right-hand side trước rồi gán cho left-hand side.
- Convention naming: **snake_case** cho variable. Warning nếu camelCase.
- Rust infer type — default integer là `i32`. rust-analyzer hiển thị inlay hint `: i32`.
- Warning "unused variable" hiện squiggly vàng — build vẫn chạy. Production nên fix.
- Phân biệt warning (vàng, không block) vs error (đỏ, block compile).

**Bài kế tiếp** → [Bài 9: Interpolation với `{}` trong println!](02-interpolation-curly-braces.md)
