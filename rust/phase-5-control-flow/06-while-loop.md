# Bài 39: `while` loop — lặp khi điều kiện còn đúng; so sánh loop/while/for

`loop` + `break` chạy được, nhưng phải tự quản lý điểm dừng — dễ quên `break`, dễ vô hạn. `while` thanh lịch hơn: nó **tự dừng** khi điều kiện không còn đúng. Bài này: cách `while` hoạt động, và bảng so sánh ba kiểu vòng lặp (`loop`/`while`/`for`) để bạn biết khi nào dùng cái nào.

## `while` — lặp khi điều kiện còn đúng

`while` lặp **chừng nào** một điều kiện còn `true`, và **tự động dừng** khi điều kiện thành `false`:

```text
while <condition> {
    // lặp khi condition = true
}
```

```rust
fn main() {
    let mut seconds = 10;

    while seconds > 0 {
        println!("{seconds} giây nữa...");
        seconds -= 1;
    }
    println!("Phóng!");
}
```

So với `loop` ở bài 38, `while` gọn hơn rõ: **không cần** `break`, không cần `if seconds == 0` trong thân — điều kiện `seconds > 0` ngay đầu vòng tự lo việc dừng.

## Cách `while` chạy — từng bước

```text
seconds = 10
while seconds > 0:
  vòng 1: 10 > 0? true  → in "10...", seconds = 9
  vòng 2:  9 > 0? true  → in "9...",  seconds = 8
  ...
  vòng 10: 1 > 0? true  → in "1...",  seconds = 0
  vòng 11: 0 > 0? FALSE → dừng tự động
in "Phóng!"
```

Trước **mỗi** vòng, Rust kiểm tra điều kiện. Còn `true` → chạy thân; thành `false` → thoát ngay (không chạy thân vòng đó nữa). Điều kiện kiểm ở **đầu** vòng — nếu sai từ đầu, thân không chạy lần nào:

```rust
let mut n = 0;
while n > 5 {           // 0 > 5 false ngay → thân KHÔNG chạy lần nào
    println!("{n}");
}
```

## Vẫn cần thay đổi state, nếu không vô hạn

`while` tự dừng, nhưng chỉ khi điều kiện **có thể** thành false. Thân vòng phải **thay đổi** dữ liệu (state) liên quan đến điều kiện:

```rust
let mut seconds = 10;
while seconds > 0 {
    println!("{seconds}");
    // QUÊN seconds -= 1 → seconds mãi = 10 → vô hạn
}
```

**State** = dữ liệu thay đổi theo thời gian. Điều kiện `while` phải phụ thuộc state mà thân vòng thay đổi, để cuối cùng thành false. Quên cập nhật → infinite loop, y như `loop` quên `break`.

## `break` và `continue` cũng dùng được với `while`

Hai keyword từ bài 38 hoạt động y hệt trong `while`:

```rust
fn main() {
    let mut seconds = 21;

    while seconds > 0 {
        if seconds % 2 == 0 {
            println!("{seconds} (chẵn) — bỏ 3 giây");
            seconds -= 3;
            continue;               // nhảy về kiểm điều kiện while
        }
        println!("{seconds} giây nữa...");
        seconds -= 1;
    }
    println!("Phóng!");
}
```

Với `while`, `continue` nhảy về **kiểm lại điều kiện `while`** (đầu vòng). `break` vẫn thoát hẳn. Khác `loop`: `break` trong `while` **không** trả giá trị được (chỉ `loop` mới trả qua `break`).

## Bonus: `while let` — lặp khi pattern còn khớp

Biến thể `while let` lặp chừng nào một pattern còn khớp — cực hữu ích với `Option`/`Vec` (phase sau, giới thiệu trước):

```rust
fn main() {
    let mut stack = vec![1, 2, 3];

    while let Some(top) = stack.pop() {     // lặp khi pop() còn trả Some
        println!("{top}");                   // 3, 2, 1
    }
    // dừng khi stack rỗng → pop() trả None → pattern không khớp
}
```

`while let Some(top) = stack.pop()`: mỗi vòng lấy phần tử cuối; khi hết, `pop()` trả `None`, pattern `Some(top)` không khớp → dừng. Gọn hơn nhiều so với kiểm rỗng thủ công. Sẽ rõ hơn sau khi học `Option` và `Vec`.

## So sánh ba vòng lặp: loop / while / for

`for` đã gặp ở bài 28 (duyệt range/array). Đây là bức tranh đầy đủ:

| | `loop` | `while` | `for` |
|---|---|---|---|
| Dừng khi | `break` thủ công | điều kiện thành false | duyệt hết collection |
| Điều kiện kiểm ở | bất kỳ (`if`+`break`) | đầu vòng | tự động (hết phần tử) |
| Trả giá trị qua `break`? | **Có** | Không | Không |
| Nguy cơ vô hạn | Cao (quên break) | Có (quên cập nhật state) | **Không** (collection hữu hạn) |
| Hợp nhất cho | lặp vô hạn, retry, trả giá trị | lặp tới điều kiện động | duyệt range/array/iterator |

```rust
// Cùng "đếm 1..=5" — ba cách:

// loop: rườm rà nhất
let mut i = 1;
loop { if i > 5 { break; } println!("{i}"); i += 1; }

// while: gọn hơn
let mut i = 1;
while i <= 5 { println!("{i}"); i += 1; }

// for: gọn nhất, an toàn nhất (không thể vô hạn, không cần mut)
for i in 1..=5 { println!("{i}"); }
```

**Quy tắc thực dụng**: ưu tiên `for` khi duyệt dải/collection đã biết (an toàn nhất, idiomatic). Dùng `while` khi lặp tới một điều kiện động không gắn với collection. Dùng `loop` khi cần lặp vô hạn hoặc `break` trả giá trị. Trong Rust idiomatic, `for` xuất hiện nhiều nhất.

## Use case thực tế: xử lý tới khi cạn

```rust
fn main() {
    let mut balance = 1000.0;
    let monthly_payment = 250.0;
    let mut month = 0;

    while balance > 0.0 {
        balance -= monthly_payment;
        month += 1;
        println!("Tháng {month}: còn lại {balance:.2}");
    }
    println!("Trả hết sau {month} tháng");
}
```

`while` lý tưởng khi số vòng lặp **không biết trước** mà phụ thuộc điều kiện động (trả nợ tới khi hết). Nếu biết trước số vòng (vd "12 tháng"), `for month in 1..=12` gọn hơn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên cập nhật state trong thân | Infinite loop | Đảm bảo điều kiện tiến tới false |
| Quên `mut` cho biến điều kiện | Compile error | `let mut` |
| Mong `break value` trong `while` | Không hỗ trợ | Dùng `loop` để trả giá trị |
| Dùng `while` khi duyệt collection | Dài dòng, dễ off-by-one | Dùng `for` |
| `continue` quên cập nhật state trước đó | Infinite loop | Cập nhật state TRƯỚC `continue` |
| Điều kiện sai chiều | Thân không chạy / chạy mãi | Kiểm logic điều kiện kỹ |

## Tóm tắt bài 39

- `while <condition> { }` lặp **chừng nào** điều kiện `true`, **tự dừng** khi false — không cần `break`.
- Điều kiện kiểm ở **đầu** mỗi vòng; sai từ đầu thì thân không chạy lần nào.
- Vẫn phải **thay đổi state** trong thân để điều kiện thành false, nếu không vô hạn.
- `break`/`continue` dùng được; nhưng `break` trong `while` **không** trả giá trị (chỉ `loop`).
- `while let` lặp khi pattern còn khớp — gọn với `Option`/`Vec` (phase sau).
- Chọn: **`for`** duyệt collection (an toàn, idiomatic), **`while`** điều kiện động, **`loop`** vô hạn/trả giá trị.

**Bài kế tiếp** → [Bài 40: Recursion — hàm tự gọi chính nó, base case, call stack](07-recursion.md)
