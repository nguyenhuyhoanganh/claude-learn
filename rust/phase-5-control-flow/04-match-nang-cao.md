# Bài 37: `match` nâng cao — nhiều giá trị `|`, range, match guard, `unreachable!`

`match` cơ bản so một giá trị với một hằng mỗi arm. Nhưng thực tế bạn cần: "nếu là 2 *hoặc* 4 *hoặc* 6", "nếu trong khoảng 0–9", "nếu số chẵn". Bài này mở khoá ba kỹ thuật làm `match` mạnh hơn hẳn `if/else`: gộp giá trị bằng `|`, khớp range, và **match guard** (gắn điều kiện `if` vào arm).

## Gộp nhiều giá trị với `|`

Một arm khớp **nhiều** giá trị bằng dấu `|` (pipe) — đọc là "hoặc":

```rust
fn main() {
    let number = 8;

    match number {
        2 | 4 | 6 | 8 => println!("{number} là số chẵn nhỏ"),
        1 | 3 | 5 | 7 => println!("{number} là số lẻ nhỏ"),
        _ => println!("Số khác"),
    }
}
```

`2 | 4 | 6 | 8` khớp nếu `number` là **bất kỳ** giá trị nào trong đó, cùng chạy một block. Gọn hơn nhiều so với viết 4 arm riêng.

```text
2 | 4 | 6 | 8 => ...
  │
  └ "hoặc" — khớp nếu trùng BẤT KỲ giá trị nào
```

## Khớp range với `..=`

Liệt kê `2 | 4 | 6 | ...` cho dải lớn thì bất khả thi. Dùng **range inclusive** `start..=end` trong pattern:

```rust
fn main() {
    let score = 85;

    let grade = match score {
        90..=100 => "A",
        80..=89  => "B",
        70..=79  => "C",
        60..=69  => "D",
        _        => "F",
    };

    println!("{grade}");        // B
}
```

`90..=100` khớp mọi giá trị từ 90 đến 100 (bao gồm hai đầu). Lưu ý: pattern chỉ dùng range **inclusive** `..=` (không dùng `..` exclusive). Range trong `match` cực gọn cho phân loại theo ngưỡng — và exhaustive hơn `if/else if` vì compiler kiểm tra phủ đủ.

Range cũng dùng với ký tự:

```rust
match c {
    'a'..='z' => println!("chữ thường"),
    'A'..='Z' => println!("chữ hoa"),
    '0'..='9' => println!("chữ số"),
    _ => println!("ký tự khác"),
}
# let c = 'k';
```

## Match guard — gắn điều kiện `if` vào arm

Đôi khi pattern thuần không đủ — cần kiểm tra một **điều kiện** trên giá trị khớp. **Match guard** là một `if` gắn sau pattern:

```rust
fn main() {
    let number = 8;

    match number {
        value if value % 2 == 0 => println!("{value} là số chẵn"),
        value if value % 2 != 0 => println!("{value} là số lẻ"),
        _ => unreachable!(),
    }
}
```

```text
value if value % 2 == 0 => ...
│     │
│     └ match guard: điều kiện phải đúng thì arm mới khớp
└ tên bind giá trị (dùng được trong guard và block)
```

Cách hoạt động:
1. `value` là tên bind giá trị đang khớp (tên tuỳ bạn — `x`, `n`, `my_num`...).
2. `if value % 2 == 0` là **guard** — arm chỉ khớp nếu pattern trúng **và** guard `true`.
3. Trong block dùng được `value`.

Match guard cho phép logic mà pattern thuần không làm được (kiểm tra tính chia hết, so với biến khác, gọi method). Tên bind phải nhất quán: khai `value` thì dùng `value`; khai `x` thì dùng `x`.

## `unreachable!` — đánh dấu arm không bao giờ chạy

Trong ví dụ trên, một số luôn chẵn *hoặc* lẻ → arm `_` cuối **không bao giờ** chạy. Nhưng compiler không đủ thông minh để biết guard đã phủ hết, nên vẫn đòi arm catch-all. Thay vì viết code rác, dùng macro **`unreachable!()`**:

```rust
match number {
    value if value % 2 == 0 => println!("chẵn"),
    value if value % 2 != 0 => println!("lẻ"),
    _ => unreachable!(),        // "dòng này không bao giờ tới được"
}
# let number = 8;
```

`unreachable!()` (macro, kết thúc `!`):
- **Thoả mãn compiler** (cung cấp arm catch-all bắt buộc).
- **Truyền ý định** rõ cho người đọc: "trường hợp này logic không thể xảy ra".
- Nếu *bằng cách nào đó* code chạy tới đây (do lỗi logic), chương trình **panic** với thông báo rõ — bắt bug thay vì âm thầm sai.

Khác với `_ => println!("...")` (code rác, im lặng), `unreachable!()` nói thẳng "không thể tới đây".

> Họ macro tương tự: `todo!()` (chưa viết, sẽ làm sau), `unimplemented!()` (không định implement), `panic!("msg")` (dừng có chủ đích). Tất cả panic khi chạy tới — hữu ích đánh dấu trạng thái code.

## Kết hợp: binding + range + guard

Các kỹ thuật ghép được:

```rust
fn classify(n: i32) -> &'static str {
    match n {
        0 => "không",
        n if n < 0 => "âm",
        1..=9 => "một chữ số dương",
        n if n % 2 == 0 => "chẵn nhiều chữ số",
        _ => "lẻ nhiều chữ số",
    }
}

fn main() {
    println!("{}", classify(-5));    // âm
    println!("{}", classify(7));     // một chữ số dương
    println!("{}", classify(100));   // chẵn nhiều chữ số
}
```

Thứ tự arm **quan trọng** (khớp từ trên xuống): `0` trước, rồi âm, rồi range, rồi guard chẵn, cuối là catch-all.

## Đào sâu: match guard vs pattern thuần

Pattern thuần (`2 | 4`, `0..=9`) được compiler dùng để kiểm tra **exhaustiveness chính xác**. Match guard thì **không** — compiler không phân tích nội dung guard, nên không biết `value if even` + `value if odd` đã phủ hết → vẫn đòi `_`.

| | Pattern thuần (`|`, range) | Match guard (`if`) |
|---|---|---|
| Compiler phân tích phủ đủ? | **Có** (chính xác) | Không (coi như chưa phủ hết) |
| Diễn đạt được | So hằng, range | Điều kiện tuỳ ý trên giá trị |
| Cần catch-all? | Chỉ khi chưa phủ hết | Thường cần (`_` hoặc `unreachable!`) |

Quy tắc: ưu tiên pattern thuần (range/`|`) khi đủ — được compiler bảo vệ phủ đủ; dùng guard khi cần logic mà pattern không diễn đạt được.

## Use case thực tế: xử lý mã trạng thái HTTP

```rust
fn status_message(code: u16) -> &'static str {
    match code {
        200 | 201 | 204 => "Thành công",
        300..=399 => "Chuyển hướng",
        400 | 404 => "Lỗi client phổ biến",
        code if code >= 400 && code < 500 => "Lỗi client khác",
        500..=599 => "Lỗi server",
        _ => "Mã không xác định",
    }
}

fn main() {
    println!("{}", status_message(404));    // Lỗi client phổ biến
    println!("{}", status_message(503));    // Lỗi server
}
```

`|` cho mã rời rạc, range cho dải, guard cho điều kiện phức tạp — tất cả trong một `match` gọn, exhaustive.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `..` (exclusive) trong pattern | Compile error | Pattern chỉ dùng `..=` |
| Tên bind không nhất quán | Compile error | Khai và dùng cùng tên |
| Quên catch-all với guard | Non-exhaustive error | Thêm `_` hoặc `unreachable!()` |
| `_ => println!(...)` thay `unreachable!` | Code rác, sai âm thầm | Dùng `unreachable!()` |
| Thứ tự arm sai (guard/range) | Khớp nhầm arm | Sắp đúng thứ tự, cụ thể trước |
| Tưởng guard được kiểm phủ đủ | Vẫn cần `_` | Guard không tính vào exhaustiveness |

## Tóm tắt bài 37

- `|` gộp nhiều giá trị trong một arm: `2 | 4 | 6 => ...` ("hoặc").
- Range pattern `start..=end` (chỉ inclusive `..=`) khớp dải số/ký tự — gọn cho ngưỡng.
- **Match guard** `pattern if condition` gắn điều kiện vào arm; bind tên để dùng giá trị.
- **`unreachable!()`** đánh dấu arm không thể chạy — thoả compiler, panic nếu lỡ chạy.
- Pattern thuần được compiler kiểm **phủ đủ**; match guard thì **không** → thường cần catch-all.
- Họ macro: `unreachable!`/`todo!`/`unimplemented!`/`panic!` đánh dấu trạng thái code.

**Bài kế tiếp** → [Bài 38: `loop`, `break`, `continue` — lặp vô hạn có kiểm soát](05-loop-break-continue.md)
