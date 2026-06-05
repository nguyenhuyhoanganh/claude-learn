# Bài 28: Tuple & Ranges — gộp type khác nhau, destructuring, range, vòng for

Array bắt mọi phần tử **cùng type**. Nhưng một nhân viên là: tên (string) + tuổi (số) + lương (float) — ba type khác nhau, thuộc về nhau. Type gộp được **type khác nhau** là **tuple**. Và khi cần một dãy số liên tục `1..100` mà không muốn gõ từng số, có **range**. Bài này gói cả hai, cộng vòng `for` để duyệt.

## Tuple là gì

**Tuple** = collection chứa nhiều phần tử, mỗi phần tử có index theo thứ tự — **giống array, nhưng cho phép type khác nhau**.

| | Array | Tuple |
|---|---|---|
| Cú pháp | `[...]` square bracket | `(...)` parenthesis |
| Type phần tử | **Đồng nhất** (cùng type) | **Khác nhau** được |
| Kích thước | Cố định | Cố định |
| Truy cập | `arr[index]` | `tup.index` (dấu chấm) |

```rust
fn main() {
    let employee = ("Molly", 32, "Marketing");
    // type: (&str, i32, &str)
}
```

Khai báo bằng **cặp ngoặc tròn** `(...)`, phần tử cách bằng dấu phẩy. Type của tuple liệt kê type **từng vị trí**: `(&str, i32, &str)`.

```rust
let mixed = ("Alice", 30, 5.9, true);   // (&str, i32, f64, bool)
```

## Truy cập tuple bằng `.index`

Khác array (dùng `[]`), tuple dùng **dấu chấm + số index** (đếm từ 0):

```rust
fn main() {
    let employee = ("Molly", 32, "Marketing");
    let name = employee.0;          // "Molly"
    let age = employee.1;           // 32
    let dept = employee.2;          // "Marketing"
    println!("{name}, {age}, {dept}");
}
```

```text
employee = ("Molly", 32, "Marketing")
index:        .0      .1     .2
```

Index phải là **số literal** (`tup.0`), không phải biến — vì mỗi vị trí có type riêng, compiler cần biết chính xác lúc compile.

## Destructuring — tách tuple thành nhiều biến một lần

Lấy từng phần tử qua `.0`, `.1`, `.2` dài dòng. **Destructuring** tách cả tuple vào nhiều biến trong một dòng:

```rust
fn main() {
    let employee = ("Molly", 32, "Marketing");
    let (name, age, dept) = employee;       // tách 3 phần tử → 3 biến

    println!("{name}, {age}, {dept}");      // Molly, 32, Marketing
}
```

Số biến trong `(...)` phải khớp số phần tử tuple. Rust gán theo thứ tự: `name = .0`, `age = .1`, `dept = .2`.

Bỏ qua phần tử không cần bằng `_`:

```rust
let (name, _, dept) = employee;     // chỉ lấy tên và phòng, bỏ tuổi
```

Đây là pattern cực phổ biến, đặc biệt khi function **trả về nhiều giá trị** (qua tuple):

```rust
fn min_max(arr: [i32; 4]) -> (i32, i32) {
    (arr[0], arr[3])                // trả tuple (min, max) giả định đã sort
}

fn main() {
    let (lo, hi) = min_max([1, 5, 9, 12]);
    println!("{lo}..{hi}");         // 1..12
}
```

## In tuple — Debug, không Display

Như array, tuple **không** implement Display nhưng **có** Debug:

```rust
let employee = ("Molly", 32, "Marketing");
println!("{employee:?}");           // ("Molly", 32, "Marketing")
println!("{employee:#?}");          // pretty: mỗi phần tử một dòng
// println!("{employee}");         // ERROR — no Display
```

## Tuple rỗng — the Unit type `()`

Tuple rỗng `()` có tên riêng: **unit type**. Nó đại diện "không có giá trị có ý nghĩa" — function không trả gì thực chất trả `()`. Sẽ gặp ở phase Functions. Giờ chỉ cần biết `()` tồn tại và nghĩa là "rỗng".

## Range là gì

**Range** = một dãy giá trị **liên tục**, viết gọn bằng `..` thay vì liệt kê từng giá trị:

```rust
fn main() {
    let month_days = 1..31;         // 1, 2, ..., 30
    let letters = 'b'..'f';         // 'b', 'c', 'd', 'e'
}
```

Cú pháp: `start..end`. **Quan trọng — `end` là exclusive** (không bao gồm):

```text
1..31    →  1, 2, 3, ..., 30   (KHÔNG có 31)
```

Muốn bao gồm `end`, dùng `..=`:

| Cú pháp | Bao gồm end? | `1..5` cho |
|---|---|---|
| `start..end` | **Không** (exclusive) | 1, 2, 3, 4 |
| `start..=end` | **Có** (inclusive) | 1, 2, 3, 4, 5 |

```rust
let exclusive = 1..5;       // 1, 2, 3, 4
let inclusive = 1..=5;      // 1, 2, 3, 4, 5
```

Range cũng chỉ có Debug, không Display:

```rust
println!("{:?}", 1..31);    // 1..31
```

## Vòng `for` — duyệt (iterate) range/array

**Iterate** = duyệt qua từng phần tử của collection, lần lượt. Range, array, tuple... là **iterable**. Vòng `for` là cú pháp duyệt:

```rust
fn main() {
    for number in 1..=5 {
        println!("{number}");       // in 1, 2, 3, 4, 5
    }
}
```

```text
for number in 1..=5 {
│   │       │  │
│   │       │  └ range/collection để duyệt
│   │       └ keyword 'in'
│   └ biến nhận từng giá trị (đổi mỗi vòng)
└ keyword 'for'
```

Đọc tự nhiên: "với mỗi `number` trong `1..=5`, làm...". Biến `number` nhận lần lượt từng giá trị.

Duyệt range ký tự:

```rust
for letter in 'a'..='e' {
    print!("{letter} ");            // a b c d e
}
```

Duyệt array:

```rust
fn main() {
    let colors = ["red", "green", "blue"];
    for color in colors {
        println!("{color} is nice");
    }
}
```

Quy ước: biến lặp là dạng **số ít** của tên collection (`colors` → `color`). Phase Control Flow và Iterators đào sâu vòng lặp; đây là giới thiệu.

## Use case thực tế

```rust
fn main() {
    // Range + for: tính tổng 1..=100
    let mut sum = 0;
    for n in 1..=100 {
        sum += n;
    }
    println!("Tổng 1..100 = {sum}");        // 5050

    // Tuple: function trả nhiều giá trị
    let (quotient, remainder) = divmod(17, 5);
    println!("17 / 5 = {quotient} dư {remainder}");   // 3 dư 2
}

fn divmod(a: i32, b: i32) -> (i32, i32) {
    (a / b, a % b)              // trả tuple (thương, dư)
}
```

Tuple shine khi cần trả **nhiều giá trị** từ một function mà chưa cần định nghĩa cả struct. Range shine khi cần lặp một dãy số/ký tự liên tục.

## Khi nào dùng cái nào

| Cần | Dùng |
|---|---|
| Nhiều giá trị **cùng type**, số lượng cố định | array |
| Nhiều giá trị **khác type** thuộc về nhau | tuple |
| Trả nhiều giá trị từ function (nhanh, ad-hoc) | tuple |
| Dữ liệu có tên field rõ ràng, dùng lâu dài | struct (phase sau) |
| Dãy số/ký tự liên tục | range |
| Lặp qua collection | vòng `for` |

> Tuple > 3-4 phần tử bắt đầu khó đọc (`.3`, `.4` không nói lên ý nghĩa). Lúc đó nên dùng **struct** với field có tên (phase Structs).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `[]` truy cập tuple | Compile error | Tuple dùng `.0`, `.1` |
| Index tuple bằng biến | Compile error | Index phải literal |
| Quên range end là exclusive | Lệch một phần tử | Dùng `..=` nếu cần bao gồm |
| Số biến destructure không khớp | Compile error | Khớp số phần tử |
| `{}` in tuple/range | No Display | Dùng `{:?}` |
| Tuple quá nhiều field | Khó đọc `.5`, `.6` | Chuyển sang struct |

## Tóm tắt bài 28

- **Tuple** `(...)`: gộp nhiều giá trị **khác type**; truy cập `.0`, `.1` (index literal).
- **Destructuring** `let (a, b, c) = tup` tách nhiều biến một lần; `_` bỏ phần tử.
- Tuple/range chỉ có **Debug** (`{:?}`), không Display; tuple rỗng `()` = unit type.
- **Range** `start..end` (exclusive) hoặc `start..=end` (inclusive) — dãy liên tục gọn.
- **Vòng `for x in collection`** duyệt range/array/tuple; biến lặp đổi mỗi vòng.
- Tuple cho trả nhiều giá trị ad-hoc; nhiều field có tên → dùng **struct**.

**Bài kế tiếp** → [Bài 29: Generics Intro & Section Review — type là argument, `Range<T>`, tổng kết Data Types](10-generics-intro-va-review.md)
