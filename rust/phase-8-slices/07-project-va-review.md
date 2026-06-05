# Bài 65: Project & Section Review — slice array & string, tổng kết phase

Hết phase Slices — và cũng khép lại bộ ba ownership cốt lõi (Ownership → References → Slices). Project này luyện cả array slice (kể cả mutable) lẫn string slice. Sau đó tổng kết phase và cả ba phase nền tảng.

## Đề bài project

1. Tạo array `cereals` gồm 5 String.
2. Trích các slice: `first_two`, `mid_three`, `last_three`.
3. Dùng **mutable** slice `last_three` đổi phần tử cuối thành "Lucky Charms".
4. Lấy reference tới một String trong array, rồi trích **string slice** một phần của nó.

## Lời giải đầy đủ

```rust
fn main() {
    let mut cereals = [
        String::from("Cookie Crisp"),
        String::from("Cinnamon Toast Crunch"),
        String::from("Frosted Flakes"),
        String::from("Cocoa Puffs"),
        String::from("Captain Crunch"),
    ];

    // --- Array slices (immutable) ---
    let first_two = &cereals[0..2];          // 2 đầu (0..2)
    let mid_three = &cereals[1..4];          // 3 giữa (1,2,3)
    println!("{first_two:?}");
    println!("{mid_three:?}");

    // --- Mutable array slice: sửa phần tử cuối ---
    let last_three = &mut cereals[2..5];     // mutable slice 3 cuối
    last_three[2] = String::from("Lucky Charms");   // index 2 CỦA SLICE
    println!("{cereals:?}");                  // "Captain Crunch" → "Lucky Charms"

    // --- String slices từ phần tử trong array ---
    let cookie_crisp = &cereals[0];          // &String (reference, không move)
    let cookie = &cookie_crisp[..6];         // string slice "Cookie"
    println!("{cookie}");

    let cocoa_puffs = &cereals[3];           // &String
    let puffs = &cocoa_puffs[6..];           // string slice "Puffs" (byte 6 tới hết)
    println!("{puffs}");
}
```

### Điểm học cốt lõi

**Array slice (index):**
- `&cereals[0..2]` = 2 phần tử đầu; mẹo `end - start` = số phần tử.
- Slice là borrow → `cereals` giữ ownership; in bằng `{:?}`.

**Mutable slice:**
- `&mut cereals[2..5]` cần `cereals` là `mut` (owner phải mut để tạo mutable borrow).
- `last_three[2]` = index 2 **của slice** = "Captain Crunch" (= index 4 của array).
- Sửa qua slice → `cereals` đổi luôn (cùng memory).

**String slice từ phần tử array:**
- `&cereals[0]` là `&String` (borrow — **không** move String ra khỏi array, tránh "sở hữu một phần" bài 57).
- `&cookie_crisp[..6]` trích "Cookie" (6 byte đầu); `&cocoa_puffs[6..]` trích "Puffs" (byte 6 tới hết).
- ASCII nên byte = ký tự, an toàn.

### Bẫy trong project

- Quên `mut` ở `cereals` → không tạo được `&mut cereals[2..5]`.
- Dùng `cereals[0]` (không `&`) để lấy String → lỗi move (phần tử String non-Copy, bài 57); phải `&cereals[0]`.
- Index slice tính từ 0 của slice, không phải array.

---

# Section Review — tổng kết Slices

## Slice là gì

- **Slice** = reference tới một **đoạn liên tục** của collection (string, array) — phân nhóm của reference.
- Borrow một phần, không lấy ownership; "phần" có thể là toàn bộ.
- Cú pháp: `&collection[start..end]` (end exclusive).

## String slice (`&str`)

- Range theo **byte** (không phải ký tự); ASCII trùng, Unicode khác.
- **String literal `"..."` chính là `&str`** (slice tới text trong binary).
- `len` đếm **byte**; cắt giữa ký tự Unicode → **panic** "not a char boundary".
- Shortcut: `..n` (từ đầu), `n..` (tới hết), `..` (toàn bộ).

## Array slice (`&[T]`)

- Range theo **index phần tử**; in bằng `{:?}`.
- Type `&[T]` **không** chứa độ dài → linh hoạt (nhận mọi độ dài).
- Slice là **fat pointer** (ptr + len) → biết biên runtime.

## Deref coercion

```text
&String → &str    (luôn được)     &str ↛ &String   (không)
&[T;N]  → &[T]     (luôn được)     &[T] ↛ &[T;N]    (không)
```

- Một chiều: type cụ thể → type slice.
- **Quy tắc thiết kế**: tham số text → `&str`; tham số array → `&[T]` (linh hoạt nhất).

## Mutable slice

- Array slice mutable `&mut [T]` (owner phải `mut`); sửa slice → đổi array gốc.
- String slice **không** mutable (`&mut str` cấm).
- Quy tắc borrowing "một writer" vẫn áp dụng.

## Bản đồ phase Slices

```text
SLICE = reference tới một ĐOẠN của collection
  &collection[start..end]  (end exclusive)

STRING SLICE (&str)              ARRAY SLICE (&[T])
  range theo BYTE                  range theo INDEX
  literal "..." LÀ &str            type không có độ dài
  len = byte; panic char boundary  fat pointer (ptr+len)
  immutable only                   mutable được (&mut [T])

DEREF COERCION (một chiều)
  &String→&str · &[T;N]→&[T]
  → tham số: &str, &[T] (linh hoạt nhất)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Cắt giữa ký tự Unicode | Cắt đúng ranh giới |
| `len` tưởng đếm ký tự | Đếm byte |
| Tham số `&String`/`&[T;N]` cứng | Dùng `&str`/`&[T]` |
| `arr[0]` với phần tử String | `&arr[0]` (borrow) |
| Quên `mut` owner cho mutable slice | `let mut` |
| Index slice theo array gốc | Theo 0 của slice |

---

# Tổng kết bộ ba Ownership (Phase 6-7-8)

Bạn vừa hoàn tất ba phase nền tảng nhất của Rust:

```text
Phase 6 (Ownership)   : ai SỞ HỮU giá trị; move vs copy; quản lý bộ nhớ không GC
Phase 7 (References)  : MƯỢN toàn bộ giá trị (&, &mut); quy tắc borrowing
Phase 8 (Slices)      : MƯỢN một phần giá trị (&x[a..b]); deref coercion
```

Một mạch logic xuyên suốt:
- **Ownership** giải quyết "ai dọn bộ nhớ" → an toàn không GC.
- **References** cho mượn để khỏi move/clone → giải bài toán scale.
- **Slices** cho mượn một phần để xử lý đoạn text/mảng hiệu quả.

Mọi quy tắc chồng lên nhau: slice tuân quy tắc reference, reference tuân quy tắc ownership. Hiểu bộ ba này là hiểu **linh hồn của Rust** — phần khó nhất, nhưng cũng là phần khiến Rust độc nhất.

## Tóm tắt phase Slices

- **Slice** = reference tới một đoạn collection: `&str` (string, theo byte) và `&[T]` (array, theo index).
- String literal là `&str`; `len` đếm byte; cắt sai ranh giới Unicode → panic.
- `&[T]` không khoá độ dài → linh hoạt; slice là fat pointer (ptr + len).
- **Deref coercion** một chiều → tham số dùng `&str`/`&[T]` linh hoạt nhất.
- Array slice mutable được (`&mut [T]`, sửa đổi array gốc); string slice thì không.

Bạn đã chinh phục bộ ba ownership. Phase tiếp theo chuyển sang **mô hình hoá dữ liệu**: **Struct** — gói nhiều field có tên thành một type của riêng bạn, nền tảng cho mọi chương trình Rust thực tế (và là nơi method, `#[derive(Debug)]` toả sáng).

**Bài kế tiếp** → [Bài 66: Struct — định nghĩa type dữ liệu của riêng bạn](../phase-9-structs/01-struct-la-gi.md)
