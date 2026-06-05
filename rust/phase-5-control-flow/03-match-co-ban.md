# Bài 36: `match` cơ bản — kiểm tra mọi biến thể, catch-all `_`

Chuỗi `if/else if` dài 6-7 nhánh trở nên rối, và tệ hơn: nếu bạn **quên** một trường hợp, compiler im lặng — bug lọt. `match` giải cả hai: cú pháp gọn cho nhiều nhánh, **và** compiler **bắt buộc** bạn xử lý *mọi* khả năng. Đây là một trong những tính năng được yêu thích nhất của Rust.

## `match` là gì

`match` so một giá trị với **mọi biến thể (variant) có thể** của nó, mỗi biến thể gắn một block code. Giống `switch/case` ở ngôn ngữ khác, nhưng an toàn hơn nhiều. Cú pháp:

```text
match <value> {
    pattern1 => <code>,
    pattern2 => <code>,
}
```

```rust
fn main() {
    let evaluation = true;

    match evaluation {
        true => println!("Giá trị là true"),
        false => println!("Giá trị là false"),
    }
}
```

- `match` + giá trị cần so (`evaluation`).
- Trong `{}` là các **arm** (nhánh) hay **pattern**.
- Mỗi arm: `pattern => code`, ngăn cách bằng dấu phẩy.
- `=>` (dấu mũi tên kép, "rocket") nối pattern với code.

Đọc: "khớp `evaluation`; nếu là `true` thì..., nếu là `false` thì...".

## Exhaustiveness — compiler bắt buộc đủ mọi trường hợp

Đây là sức mạnh cốt lõi. Rust **kiểm tra đầy đủ (exhaustive)**: bạn phải xử lý **mọi** giá trị có thể, nếu thiếu thì **không compile**:

```rust
fn main() {
    let evaluation = true;
    match evaluation {
        true => println!("true"),
        // thiếu false!
    }
}
```
```text
error[E0004]: non-exhaustive patterns: `false` not covered
```

`bool` chỉ có hai giá trị → phải có cả `true` và `false`. Đây là **điểm thắng** so với `if`: với `if`, quên một trường hợp là chuyện của bạn (không ai nhắc); với `match`, compiler **đảm bảo** bạn không bỏ sót.

Lợi ích thật sự lộ rõ ở phase Enums/Option/Result: khi thêm một biến thể mới vào enum, mọi `match` thiếu xử lý nó sẽ **lỗi compile** — bạn được nhắc cập nhật khắp nơi, không sót.

## `match` không cần dấu phẩy giữa block

Nếu arm dùng block `{}`, không bắt buộc dấu phẩy; nếu arm là biểu thức đơn, **cần** dấu phẩy:

```rust
match x {
    1 => {                      // block — không cần , sau }
        println!("một");
        println!("dòng nữa");
    }
    2 => println!("hai"),       // biểu thức đơn — CẦN ,
    _ => println!("khác"),
}
# let x = 1;
```

## `match` là expression — trả giá trị

Như `if`, mỗi arm **trả giá trị**, nên `match` gán được vào biến. Khi map pattern → giá trị, bỏ block, viết thẳng:

```rust
fn main() {
    let evaluation = true;

    let value = match evaluation {
        true => 20,
        false => 40,
    };                          // ; kết thúc let

    println!("{value}");        // 20
}
```

**Mọi arm phải trả cùng type** (như `if`) — để biến biết type. Một arm trả i32, arm khác trả bool → lỗi.

## Catch-all `_` — xử lý "mọi trường hợp còn lại"

`bool` chỉ 2 giá trị nên liệt kê hết được. Nhưng `i32` có hàng tỉ giá trị, `&str` có vô hạn — không thể liệt kê. Giải pháp: **catch-all** `_` (underscore), khớp **mọi** giá trị còn lại — tương đương `else`:

```rust
fn main() {
    let season = "summer";

    match season {
        "summer" => println!("Nghỉ hè"),
        "winter" => println!("Lạnh quá"),
        "fall" => println!("Lá rụng"),
        "spring" => println!("Mưa nhiều"),
        _ => println!("Mùa không xác định"),   // mọi string khác
    }
}
```

Không có `_`, match một string sẽ **không compile** ("non-exhaustive patterns") vì vô hạn string chưa được phủ. `_` đóng vai "tất cả phần còn lại".

```text
"summer" → khớp giá trị cụ thể
"winter" → khớp giá trị cụ thể
   _     → khớp MỌI giá trị còn lại (catch-all, như else)
```

## `_` PHẢI đặt cuối cùng

`match` khớp **từ trên xuống**, dừng ở arm đầu tiên trúng. Vì `_` khớp **mọi thứ**, đặt nó không phải cuối sẽ chặn các arm sau:

```rust
match season {
    _ => println!("mọi mùa"),       // khớp NGAY → các arm dưới vô dụng
    "summer" => println!("hè"),     // KHÔNG BAO GIỜ chạy
}
# let season = "summer";
```
```text
warning: unreachable pattern
```

Compiler cảnh báo "unreachable pattern". Luôn đặt `_` **cuối cùng** — nó là fallback sau khi mọi pattern cụ thể đã được thử.

## Lấy giá trị thay vì bỏ qua: binding với tên

Đôi khi muốn **dùng** giá trị khớp `_` thay vì bỏ qua. Thay `_` bằng một **tên biến** — nó bắt giá trị và dùng được trong arm:

```rust
fn main() {
    let number = 7;

    match number {
        0 => println!("không"),
        1 => println!("một"),
        other => println!("số khác: {other}"),   // 'other' bắt giá trị
    }
}
```
```text
số khác: 7
```

`other` (tên bất kỳ) khớp mọi giá trị còn lại **và** giữ giá trị đó để dùng. Khác `_` (vứt giá trị). Dùng tên khi cần giá trị; dùng `_` khi chỉ cần "mọi thứ khác" mà không quan tâm là gì.

| Pattern cuối | Khớp | Dùng được giá trị? |
|---|---|---|
| `_` | mọi giá trị còn lại | Không (bỏ qua) |
| `other` (tên) | mọi giá trị còn lại | **Có** (bind vào tên) |

## Refactor `if/else if` → `match`

`match` là cách gọn để thay chuỗi `if/else if` so sánh **cùng một giá trị** với nhiều hằng:

```rust
// Trước: if/else if
let label = if season == "summer" { "hè" }
    else if season == "winter" { "đông" }
    else { "khác" };

// Sau: match — gọn, exhaustive
let label = match season {
    "summer" => "hè",
    "winter" => "đông",
    _ => "khác",
};
# let season = "summer";
```

`match` thắng khi so một giá trị với nhiều khả năng cố định. `if/else if` thắng khi mỗi nhánh là điều kiện **khác nhau, phức tạp** (vd `a > 5 && b < 3`).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thiếu trường hợp | Compile error (non-exhaustive) | Phủ đủ hoặc thêm `_` |
| `_` không đặt cuối | Unreachable pattern warning | `_` luôn ở cuối |
| Arm trả khác type | Compile error | Mọi arm cùng type |
| Quên `,` giữa arm biểu thức đơn | Compile error | Thêm `,` sau arm |
| Dùng `_` khi cần giá trị | Mất giá trị | Bind bằng tên biến |
| Quên `match` là expression | Bỏ lỡ gán biến gọn | Gán `let x = match ...` |

## Tóm tắt bài 36

- `match value { pattern => code, ... }`: so giá trị với mọi biến thể, mỗi arm một block.
- **Exhaustive**: compiler **bắt buộc** phủ mọi trường hợp — thiếu thì không compile (an toàn hơn `if`).
- `match` là **expression** → trả giá trị, gán vào biến; mọi arm **cùng type**.
- **`_`** = catch-all, khớp mọi giá trị còn lại (như `else`); **phải đặt cuối** (nếu không → unreachable).
- Dùng **tên biến** thay `_` để bắt và dùng giá trị còn lại; `_` thì bỏ qua.
- `match` gọn hơn `if/else if` khi so một giá trị với nhiều hằng cố định.

**Bài kế tiếp** → [Bài 37: `match` nâng cao — nhiều giá trị `|`, match guard, `unreachable!`](04-match-nang-cao.md)
