# Bài 63: Array slices — `&[T]`, độ dài động & deref coercion

Slice không chỉ cho string — array cũng slice được. **Array slice** trỏ tới một đoạn phần tử của array, type `&[T]`. Điểm mạnh đặc biệt: array slice **không gắn độ dài cố định** vào type — khác array gốc (`[i32; 6]` có số 6 trong type). Điều này khiến `&[T]` là type tham số linh hoạt nhất cho hàm xử lý array, nhờ deref coercion (như `&str` ở bài 62).

## Cú pháp array slice

Cùng cú pháp string slice, nhưng con số trong range là **index phần tử** (không phải byte):

```rust
fn main() {
    let values = [4, 8, 15, 16, 23, 42];
    let my_slice = &values[0..3];        // index 0 đến trước 3

    println!("{my_slice:?}");            // [4, 8, 15]
}
```

```text
&values[0..3]
│        │
│        └ range index: phần tử 0, 1, 2 (đến TRƯỚC 3)
└ borrow (array slice là reference)
```

Mẹo đếm: `end - start` = số phần tử. `3 - 0 = 3` → 3 phần tử. Array slice cần Debug `{:?}` để in (như array — bài 27).

Mọi shortcut range (bài 61) áp dụng: `&values[..3]` (từ đầu), `&values[2..]` (tới hết), `&values[..]` (toàn bộ).

## Type `&[T]` — KHÔNG có độ dài

Đây là điểm cốt lõi. So type array slice với reference array đầy đủ:

```rust
let values = [4, 8, 15, 16, 23, 42];

let slice = &values[0..3];       // type: &[i32]      — KHÔNG có độ dài
let reference = &values;         // type: &[i32; 6]   — CÓ độ dài 6
```

| Type | Nghĩa | Độ dài trong type? |
|---|---|---|
| `[i32; 6]` | array 6 phần tử | **Có** (6) |
| `&[i32; 6]` | reference tới array 6 phần tử | **Có** (6) |
| `&[i32]` | **array slice** | **Không** (động) |

`&[i32]` (array slice) **không** chứa độ dài — nó là "reference tới một số phần tử i32 nào đó". Độ dài động này là **sức mạnh**:

```rust
let slice3 = &values[0..3];      // &[i32] — 3 phần tử
let slice4 = &values[0..4];      // &[i32] — 4 phần tử, CÙNG type
```

Cả hai cùng type `&[i32]` dù số phần tử khác — type không quan tâm số lượng. Ngược lại, `&[i32; 6]` và `&[i32; 5]` là **hai type khác nhau** (độ dài là phần của type).

## Vì sao "không độ dài" làm tham số linh hoạt

Đây là lý do array slice quan trọng cho thiết kế hàm. So sánh hai cách khai tham số:

### Cách hẹp: `&[i32; 6]` (reference array độ dài cố định)

```rust
fn print_length(reference: &[i32; 6]) {      // CHỈ nhận array 6 phần tử
    println!("{}", reference.len());
}

fn main() {
    let arr6 = [1, 2, 3, 4, 5, 6];
    print_length(&arr6);                     // OK — đúng 6

    let arr5 = [1, 2, 3, 4, 5];
    print_length(&arr5);                     // ERROR — 5 ≠ 6
}
```
```text
error: mismatched types: expected `&[i32; 6]`, found `&[i32; 5]`
```

`&[i32; 6]` khoá cứng độ dài 6 → từ chối mọi array khác độ dài. Quá cứng.

### Cách linh hoạt: `&[i32]` (array slice)

```rust
fn print_length(reference: &[i32]) {         // nhận array slice BẤT KỲ độ dài
    println!("{}", reference.len());
}

fn main() {
    let arr6 = [1, 2, 3, 4, 5, 6];
    print_length(&arr6);                     // OK — &[i32;6] coerce thành &[i32]
    print_length(&arr6[0..3]);               // OK — slice 3 phần tử
    let arr5 = [10, 20, 30, 40, 50];
    print_length(&arr5);                     // OK — array khác độ dài cũng được
}
```

`&[i32]` nhận: slice bất kỳ độ dài, **và** reference array bất kỳ độ dài (qua coercion). Một hàm xử lý mọi array i32.

## Deref coercion với array — như `&str`

Vì sao `&arr6` (`&[i32; 6]`) lọt vào hàm nhận `&[i32]`? **Deref coercion** — cùng cơ chế `&String`→`&str` (bài 62):

```text
&[i32; 6]  ──coerce──>  &[i32]    ✓ (luôn an toàn)
&[i32]     ──✗──────>  &[i32; 6]  ✗ (không đảm bảo độ dài)
```

- `&[i32; 6]` → `&[i32]`: **luôn được**. Một reference array đầy đủ chắc chắn biểu diễn thành array slice được.
- `&[i32]` → `&[i32; 6]`: **không**. Một slice có thể là bất kỳ độ dài — không đảm bảo đúng 6.

Song song hoàn hảo với string:

| String | Array | Coerce |
|---|---|---|
| `&String` → `&str` | `&[T; N]` → `&[T]` | ✓ một chiều |
| `&str` ↛ `&String` | `&[T]` ↛ `&[T; N]` | ✗ ngược lại |

Quy tắc thiết kế giống hệt: **tham số dùng type slice** (`&str`, `&[T]`) để linh hoạt nhất.

## Quy tắc thiết kế: tham số array dùng `&[T]`

```rust
fn sum(numbers: &[i32]) -> i32 {             // &[T] — nhận mọi array/slice i32
    let mut total = 0;
    for n in numbers {
        total += n;
    }
    total
}

fn main() {
    let a = [1, 2, 3];
    let b = [10, 20, 30, 40, 50];
    println!("{}", sum(&a));                 // 6
    println!("{}", sum(&b));                 // 150 — khác độ dài, cùng hàm
    println!("{}", sum(&b[1..3]));           // 50 — slice một đoạn
}
```

Một hàm `sum` xử lý array 3 phần tử, 5 phần tử, hay slice — tất cả nhờ `&[i32]`. Đây là lý do thư viện Rust dùng `&[T]` cho tham số collection. (Sau này `Vec<T>` cũng coerce thành `&[T]` — `&[T]` là type "chung" cho mọi dãy phần tử liền kề.)

## Đào sâu: slice là "fat pointer"

Vì sao `&[T]` không cần độ dài trong type mà vẫn biết bao nhiêu phần tử? Vì array slice là **fat pointer** (con trỏ "béo") — lưu **hai** thứ trên stack:

```text
&[i32] slice = [ ptr, len ]
                 │    │
                 │    └ số phần tử (biết runtime)
                 └ địa chỉ phần tử đầu
```

Khác reference thường (chỉ địa chỉ), slice mang **địa chỉ + độ dài**. Nên `.len()` chạy được dù type không ghi độ dài — độ dài nằm trong chính slice (runtime), không phải type (compile-time). Đây là cách Rust kết hợp linh hoạt (type không khoá độ dài) với an toàn (luôn biết biên để chặn out-of-bounds). String slice `&str` cũng là fat pointer (ptr + số byte).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tham số `&[T; N]` cố định độ dài | Từ chối array khác độ dài | Dùng `&[T]` |
| Mong `&[T]` → `&[T; N]` tự chuyển | Không (một chiều) | Chỉ `&[T;N]` → `&[T]` |
| Quên `{:?}` khi in slice | Compile error (no Display) | Dùng Debug `{:?}` |
| Range index vượt biên | Panic | Giữ trong độ dài |
| Nhầm index (array) với byte (string) | Sai đoạn | Array: index; string: byte |

## Tóm tắt bài 63

- **Array slice**: `&arr[start..end]`, type **`&[T]`**, range theo **index phần tử**; in bằng `{:?}`.
- `&[T]` **không** chứa độ dài (động); khác `[T; N]`/`&[T; N]` (độ dài là phần của type).
- "Không độ dài" làm `&[T]` linh hoạt: nhận array/slice **bất kỳ độ dài** → tham số lý tưởng.
- **Deref coercion** một chiều: `&[T; N]` → `&[T]` (luôn được), ngược lại không — song song `&String`/`&str`.
- **Quy tắc vàng**: tham số array → `&[T]` (như tham số text → `&str`).
- Slice là **fat pointer** (ptr + len) → biết biên runtime mà không cần độ dài trong type.

**Bài kế tiếp** → [Bài 64: Mutable slices — sửa một đoạn của array qua `&mut [T]`](06-mutable-slices.md)
