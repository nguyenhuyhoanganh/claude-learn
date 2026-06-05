# Bài 64: Mutable slices — sửa một đoạn của array qua `&mut [T]`

Tới giờ mọi slice đều immutable — chỉ đọc. Nhưng array slice có thể **mutable**: `&mut [T]` cho phép **sửa** các phần tử trong một đoạn của array, và thay đổi đó **ảnh hưởng** array gốc. Bài này: cách tạo mutable slice, vì sao sửa slice đổi luôn array gốc, và một khác biệt quan trọng — Rust **không** cho mutable string slice.

## String slice luôn immutable; array slice có thể mutable

Một khác biệt cần nhớ ngay:

| Loại slice | Mutable được? |
|---|---|
| **String slice** (`&str`) | **Không** — luôn immutable |
| **Array slice** (`&[T]`) | **Có** — `&mut [T]` |

Rust **không** cho phép `&mut str` (mutable string slice) trong code thường — vì sửa một đoạn text có thể đổi số byte (ký tự Unicode nhiều byte) làm hỏng ranh giới. Nhưng array (phần tử cố định kích thước) thì sửa tại chỗ an toàn → mutable array slice được phép. Bài này về array slice.

## Tạo mutable slice: `&mut`

Cú pháp = slice + `mut` (như mutable reference, bài 53). Owner gốc phải `mut`:

```rust
fn main() {
    let mut my_array = [10, 15, 20, 25, 30];   // mut — vì slice sẽ sửa nó
    let my_slice = &mut my_array[2..4];          // mutable slice: index 2,3

    println!("{my_slice:?}");                     // [20, 25]
}
```

```text
&mut my_array[2..4]
│   │         │
│   │         └ range: index 2, 3
│   └ mut: cho phép SỬA phần tử trong slice
└ borrow
```

`&mut my_array[2..4]` = mutable slice tới phần tử index 2 và 3. Type là `&mut [i32]`. Có quyền **đọc và sửa** đoạn này. Owner `my_array` phải `mut` (nếu không → lỗi: "cannot borrow as mutable").

## Sửa slice → sửa array gốc

Đây là điểm cốt lõi. Sửa một phần tử qua slice **đổi luôn** array gốc — vì slice chỉ là reference tới cùng vùng memory, không phải bản sao:

```rust
fn main() {
    let mut my_array = [10, 15, 20, 25, 30];
    let my_slice = &mut my_array[2..4];           // slice tới [20, 25]

    my_slice[0] = 100;                            // sửa phần tử 0 CỦA SLICE

    println!("{my_slice:?}");                     // [100, 25]
    // my_array giờ cũng đổi:
    println!("{my_array:?}");                     // [10, 15, 100, 25, 30]
}
```

```text
my_array: [10, 15, 20, 25, 30]
                   └──┬──┘
          my_slice ───┘  (mượn index 2,3)

my_slice[0] = 100  →  sửa index 0 của SLICE (= index 2 của array)
                   →  my_array thành [10, 15, 100, 25, 30]
```

**Index trong slice tính từ 0 của slice**, không phải của array. `my_slice[0]` là phần tử đầu của slice (= `my_array[2]`). Sửa nó → array gốc đổi tại index 2. Slice là "cửa sổ" nhìn vào một đoạn array; sửa qua cửa sổ = sửa array thật.

## Vì sao thay đổi lan tới array gốc

Logic giống hệt mutable reference (phase 7): slice **không** copy dữ liệu, chỉ giữ địa chỉ tới vùng memory của array. `my_slice[0] = 100` đi theo địa chỉ, ghi 100 vào ô memory đó — chính là ô `my_array[2]`. Không có bản sao nào → một thay đổi, một vùng memory, cả hai "thấy".

Đây là sức mạnh: hàm nhận `&mut [T]` có thể sửa một đoạn array của caller tại chỗ, không copy, không trả về. Quy tắc borrowing vẫn áp dụng: khi mutable slice còn sống, không reference nào khác tới array được (một writer — bài 54).

## Use case thực tế: hàm sửa một đoạn array

```rust
fn double_all(slice: &mut [i32]) {           // nhận mutable array slice
    for n in slice.iter_mut() {              // iter_mut: duyệt sửa được
        *n *= 2;                             // *n: deref để sửa giá trị
    }
}

fn main() {
    let mut data = [1, 2, 3, 4, 5, 6];

    double_all(&mut data[0..3]);             // chỉ nhân đôi 3 phần tử đầu
    println!("{data:?}");                     // [2, 4, 6, 4, 5, 6]

    double_all(&mut data);                    // nhân đôi cả array
    println!("{data:?}");                     // [4, 8, 12, 8, 10, 12]
}
```

`double_all` nhận `&mut [i32]` → sửa được **một đoạn** (`&mut data[0..3]`) hoặc **cả array** (`&mut data`) — linh hoạt nhờ slice không khoá độ dài (bài 63), mutable nhờ `&mut`. `iter_mut()` + `*n` để sửa từng phần tử (deref vì `n` là `&mut i32`). Đây là pattern xử lý mảng tại chỗ chuẩn của Rust — sort, fill, transform một vùng.

## Quy tắc borrowing vẫn áp dụng

Mutable slice là mutable reference → quy tắc "một writer" (bài 54) áp dụng:

```rust
fn main() {
    let mut arr = [1, 2, 3];
    let s = &mut arr[..];        // mutable slice
    // let r = &arr;             // ERROR — đã có mutable borrow
    s[0] = 99;
    println!("{arr:?}");          // [99, 2, 3]
}
```

Khi mutable slice còn sống, không borrow nào khác tới array. Lifetime/NLL: slice "chết" ở lần dùng cuối → sau đó borrow lại được. Tất cả nhất quán với phase 7.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `mut` ở owner array | "cannot borrow as mutable" | `let mut array` |
| Mong `&mut str` (mutable string slice) | Không cho phép | Dùng `String` + method |
| Tưởng index slice tính theo array gốc | Tính từ 0 của **slice** | `slice[0]` = phần tử đầu slice |
| Tưởng sửa slice không đổi array | Đổi (cùng memory) | Slice là reference, không copy |
| Borrow khác khi mutable slice còn sống | Borrow error (một writer) | Dùng xong slice mới borrow lại |
| Quên `*` khi sửa qua `iter_mut` | Type error | `*n = ...` deref |

## Tóm tắt bài 64

- **Array slice mutable** `&mut arr[a..b]` (type `&mut [T]`): đọc **và sửa** một đoạn; owner phải `mut`.
- **String slice không mutable** (`&mut str` cấm) — sửa text đổi byte làm hỏng ranh giới Unicode.
- Sửa phần tử qua slice (`slice[0] = ...`) **đổi luôn array gốc** — slice là reference cùng memory, không copy.
- Index trong slice tính **từ 0 của slice**, không phải array.
- Hàm `&mut [T]` sửa một đoạn (hoặc cả) array tại chỗ — `iter_mut()` + `*n` để duyệt sửa.
- Quy tắc borrowing "một writer" vẫn áp dụng cho mutable slice.

**Bài kế tiếp** → [Bài 65: Project & Section Review — slice array & string, tổng kết phase](07-project-va-review.md)
