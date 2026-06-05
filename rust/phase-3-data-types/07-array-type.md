# Bài 26: Array Type — collection cố định, index, đọc/ghi, panic out-of-bounds

Tới giờ mỗi biến giữ **một** giá trị. Nhưng đời thực có "4 mùa", "12 tháng", "7 ngày" — những nhóm giá trị cùng loại. Type đầu tiên giữ **nhiều** giá trị là **array** (mảng): một cái hộp chứa nhiều phần tử, kích thước cố định, nằm gọn trên stack — nhanh nhất có thể.

## Scalar vs Compound — nhắc lại

| Nhóm | Giữ | Ví dụ |
|---|---|---|
| **Scalar** | một giá trị | i32, f64, bool, char |
| **Compound** | nhiều giá trị | **array**, tuple |

Array là compound type đầu tiên.

## Array là gì

**Array** = collection **kích thước cố định** của dữ liệu **đồng nhất** (homogeneous — cùng type), xếp theo thứ tự.

Ba đặc tính cốt lõi:
1. **Fixed size** — số phần tử cố định, **không** thêm/bớt được suốt đời mảng.
2. **Homogeneous** — mọi phần tử **cùng type** (toàn i32, hoặc toàn &str...).
3. **Ordered** — mỗi phần tử có vị trí (index) cố định.

Mỗi giá trị trong mảng gọi là một **element** (phần tử).

```rust
fn main() {
    let numbers = [4, 8, 15, 16, 23, 42];        // mảng 6 phần tử i32
    let apples = ["Granny Smith", "McIntosh", "Red Delicious"];  // 3 &str
}
```

Khai báo bằng cặp **square bracket** `[...]`, phần tử cách nhau bằng dấu phẩy.

## Type của array: `[type; length]`

Rust infer type mảng dạng `[ElementType; Length]`:

```rust
let numbers = [4, 8, 15, 16, 23, 42];
// type: [i32; 6]  ← phần tử i32, độ dài 6
```

```text
[ i32 ; 6 ]
  │    │
  │    └ length (số phần tử)
  └ type của mỗi phần tử
```

Annotate thủ công:

```rust
let numbers: [i32; 6] = [4, 8, 15, 16, 23, 42];
let scores: [i8; 4] = [10, 20, 30, 40];
```

**Length là một phần của type.** Mảng 5 phần tử và mảng 6 phần tử là **hai type khác nhau**:

```rust
let arr: [i32; 6] = [4, 8, 15, 16, 23];     // ERROR — chỉ có 5 phần tử
```
```text
error: expected an array with a fixed size of 6 elements, found one with 5
```

### Cú pháp khởi tạo nhanh

```rust
let zeros = [0; 5];             // [0, 0, 0, 0, 0] — 5 số 0
let dashes = ['-'; 10];         // 10 dấu gạch
```

`[value; count]` tạo mảng `count` phần tử cùng giá trị — tiện khi cần buffer khởi tạo sẵn.

### Mảng rỗng cần annotate

```rust
let empty = [];                 // ERROR — Rust không biết type/size
let empty: [f64; 0] = [];       // OK — annotate rõ
```

Mảng rỗng không có phần tử để infer → phải ghi rõ type và length 0.

## Index — truy cập phần tử (đếm từ 0)

Mỗi phần tử có **index position** (vị trí), **đếm từ 0**:

```text
seasons = ["Spring", "Summer", "Fall", "Winter"]
index:        0         1        2       3
length = 4, index cuối = length - 1 = 3
```

Truy cập bằng `array[index]`:

```rust
fn main() {
    let seasons = ["Spring", "Summer", "Fall", "Winter"];
    let first = seasons[0];         // "Spring"
    let third = seasons[2];         // "Fall"
    println!("{first}, {third}");
}
```

**Index cuối luôn = length − 1** (vì length đếm từ 1, index đếm từ 0). Mảng 4 phần tử có index 0–3.

Lấy độ dài bằng method `len()`:

```rust
let seasons = ["Spring", "Summer", "Fall", "Winter"];
println!("{}", seasons.len());      // 4
```

## Out-of-bounds — panic

Truy cập index không tồn tại:

```rust
let seasons = ["Spring", "Summer", "Fall", "Winter"];
println!("{}", seasons[100]);       // index 100 không tồn tại
```

Với index **literal cố định**, Rust bắt **tại compile time**. Với index **động** (biến), bắt **tại runtime** bằng **panic**:

```text
thread 'main' panicked at src/main.rs:3:20:
index out of bounds: the len is 4 but the index is 100
```

**Panic** = Rust phát hiện sai sót nghiêm trọng, dừng chương trình ngay. Đây là tính năng an toàn: thay vì đọc bừa memory rác (như C — nguồn lỗ hổng bảo mật), Rust dừng có kiểm soát.

Tránh panic: kiểm tra trước, hoặc dùng `.get()` trả `Option` (an toàn):

```rust
let seasons = ["Spring", "Summer", "Fall", "Winter"];
match seasons.get(100) {
    Some(s) => println!("{s}"),
    None => println!("không có phần tử ở index đó"),   // chạy nhánh này
}
```

| Cách | Khi index sai | Khi nào dùng |
|---|---|---|
| `arr[i]` | **panic** | Chắc chắn index hợp lệ |
| `arr.get(i)` | trả `None` (không panic) | Index không chắc chắn |

## Ghi (mutate) phần tử

Mảng `mut` cho phép **thay** phần tử (vẫn không thêm/bớt được — size cố định):

```rust
fn main() {
    let mut seasons = ["Spring", "Summer", "Fall", "Winter"];
    println!("{}", seasons[2]);     // Fall
    seasons[2] = "Autumn";          // thay phần tử index 2
    println!("{}", seasons[2]);     // Autumn
}
```

`array[index] = value` ghi đè. Dùng cùng `=` như gán biến — nhất quán.

Không thêm/bớt được:

```rust
seasons[4] = "Extra";           // panic — index 4 không tồn tại (chỉ 0-3)
```

> Cần collection **co giãn** được (thêm/bớt phần tử)? Đó là **`Vec`** (vector) — như array nhưng động, lưu trên heap. Học ở phase Vectors. Array cho khi biết chính xác số phần tử, cố định.

## Đào sâu: vì sao array nằm trên stack — và nhanh

Vì Rust biết **type và length tại compile time**, nó biết chính xác mảng chiếm bao nhiêu memory (`[i32; 6]` = 6 × 4 = 24 byte). Nhờ vậy mảng lưu được trên **stack** — vùng memory nhanh nhất:

```text
Stack (nhanh, kích thước biết trước)     Heap (chậm hơn, kích thước động)
┌─────────────────────────┐
│ [4, 8, 15, 16, 23, 42]   │  ← array ở đây
└─────────────────────────┘              Vec sẽ ở đây
```

- **Stack**: cấp phát/giải phóng tức thì (chỉ dịch con trỏ), dữ liệu nằm liền kề → cache-friendly.
- Array không cần "xin heap" lúc chạy → zero overhead cấp phát.

Đây là lý do array nhanh nhưng cứng nhắc (size cố định): đánh đổi linh hoạt lấy tốc độ. Vec ngược lại — linh hoạt nhưng phải dùng heap.

## Lặp qua array

```rust
fn main() {
    let colors = ["red", "green", "blue"];
    for color in colors {
        println!("{color}");
    }
}
```

Vòng `for` duyệt từng phần tử — chi tiết ở bài 28 (Ranges & iteration). Đây là cách xử lý mảng phổ biến hơn là index thủ công.

## Use case thực tế: bảng tra cố định

```rust
const DAYS: [&str; 7] = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DAYS_IN_MONTH: [u8; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

fn day_name(weekday_index: usize) -> &'static str {
    DAYS[weekday_index]
}

fn main() {
    println!("{}", day_name(0));            // T2
    println!("{}", DAYS_IN_MONTH[1]);       // 28 (tháng 2)
}
```

Array hợp nhất cho **bảng tra cố định, biết trước** (ngày trong tuần, số ngày mỗi tháng, hằng số config) — kích thước không bao giờ đổi.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Trộn type trong mảng | Compile error | Mảng đồng nhất; cần khác type dùng tuple |
| Index sai → panic runtime | Chương trình dừng | Dùng `.get()` hoặc check `< len()` |
| Mong thêm/bớt phần tử | Không được — size cố định | Dùng `Vec` |
| Tưởng index bắt đầu từ 1 | Lệch một (off-by-one) | Index từ 0, cuối = len−1 |
| Mảng rỗng không annotate | Compile error | `let x: [T; 0] = [];` |
| Length sai số phần tử | Type mismatch | Length phải khớp số phần tử |

## Tóm tắt bài 26

- **Array** = collection **cố định kích thước**, **đồng nhất type**, có thứ tự; khai báo `[...]`.
- Type là `[ElementType; Length]`; **length là phần của type** — mảng 5 ≠ mảng 6.
- Index **đếm từ 0**, cuối = `len()−1`; `[v; n]` tạo nhanh n phần tử cùng giá trị.
- Out-of-bounds → **panic** (an toàn); `.get()` trả `Option` không panic.
- `mut` cho **thay** phần tử (`arr[i] = v`), **không** thêm/bớt; cần co giãn dùng `Vec`.
- Array nằm trên **stack** (size biết tại compile time) → nhanh; hợp cho bảng tra cố định.

**Bài kế tiếp** → [Bài 27: Display, Debug & dbg! — traits in giá trị, `{:?}`, `{:#?}`, macro debug](08-display-debug-dbg.md)
