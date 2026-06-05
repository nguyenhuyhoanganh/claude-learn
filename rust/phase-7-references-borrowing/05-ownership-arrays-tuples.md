# Bài 57: Ownership với Array & Tuple — index làm move hay copy

Bạn lấy phần tử đầu của một array bằng `arr[0]` — với array số thì ổn, nhưng với array `String` thì compiler **từ chối**. Vì sao? Vì collection type (array, tuple) **sở hữu** các phần tử bên trong, và lấy một phần tử ra đụng tới quy tắc ownership y như gán biến. Bài này: ownership lan xuống collection, và vì sao phải borrow thay vì lấy thẳng phần tử heap.

## Collection sở hữu phần tử của nó

Ownership không chỉ là chuyện của biến/parameter. **Collection type sở hữu các phần tử bên trong** — tạo cây phân cấp ownership (nhắc lại bài 43):

```text
biến  →  sở hữu array  →  sở hữu các phần tử
```

```rust
let registrations = [true, false, true];
// registrations sở hữu array; array sở hữu 3 bool
```

`registrations` là owner của array; array là owner của ba bool. Khi `registrations` ra khỏi scope, cả array và phần tử bị dọn.

## Index phần tử Copy: tạo bản sao

Lấy phần tử bằng index. Nếu phần tử là type **Copy** (bool, i32...), Rust tạo **bản sao** — array vẫn nguyên vẹn:

```rust
fn main() {
    let registrations = [true, false, true];
    let first = registrations[0];          // bool là Copy → bản sao

    println!("{first}");                    // true
    println!("{registrations:?}");          // [true, false, true] — VẪN đủ
}
```

`bool` implement Copy → `registrations[0]` copy giá trị `true` vào `first`. Array giữ cả ba phần tử. Cả `first` lẫn `registrations` đều dùng được — y như gán biến với type Copy (bài 45).

## Index phần tử non-Copy: lỗi "cannot move out"

Đổi sang array `String` (heap, non-Copy), kết quả khác hẳn:

```rust
fn main() {
    let languages = [String::from("Rust"), String::from("JS")];
    let first = languages[0];              // ERROR!
}
```
```text
error[E0507]: cannot move out of index of `[String; 2]`
  move occurs because value has type `String`, which does not implement `Copy`
```

`String` không Copy → lấy `languages[0]` sẽ là **move**. Nhưng move một phần tử ra khỏi array tạo trạng thái **kỳ quặc**: array vẫn sở hữu phần tử `"JS"`, nhưng `"Rust"` đã move sang `first`. Array rơi vào "sở hữu một phần" — phần tử 0 vô hiệu, phần tử 1 còn. Rust **cấm** trạng thái nửa vời này.

```text
languages: [ "Rust", "JS" ]
              │
let first = languages[0]  → move "Rust" ra
              ↓
languages: [ ???,    "JS" ]  ← sở hữu một phần → CẤM
```

## Hai cách sửa: clone hoặc borrow

### Cách 1: clone (tốn memory)

```rust
let first = languages[0].clone();          // bản sao thật của String
```

`clone` tạo bản sao heap → không move, array nguyên vẹn. Nhưng **nhân đôi** text "Rust" → tốn memory.

### Cách 2: borrow reference (idiomatic — nên dùng)

```rust
fn main() {
    let languages = [String::from("Rust"), String::from("JS")];
    let first = &languages[0];             // borrow — &String

    println!("{first}");                    // Rust
    println!("{languages:?}");              // ["Rust", "JS"] — VẪN đủ
}
```

`&languages[0]` mượn reference tới phần tử — **không** move, **không** copy heap. `languages` giữ ownership cả hai phần tử; `first` là `&String` trỏ vào phần tử đầu. Cả hai dùng được. Đây là cách **idiomatic** (chuẩn Rust) — rẻ hơn clone.

| Cách | Move? | Copy heap? | Array sau đó |
|---|---|---|---|
| `languages[0]` (non-Copy) | ✗ cấm | — | (lỗi) |
| `languages[0].clone()` | Không | Có (đắt) | nguyên vẹn |
| `&languages[0]` (borrow) | Không | Không (rẻ) | nguyên vẹn |

## Tuple: cùng quy tắc, cú pháp `.index`

Tuple cũng sở hữu phần tử; quy tắc y hệt, chỉ khác cú pháp truy cập (dấu chấm):

```rust
fn main() {
    // Tuple phần tử Copy → bản sao OK
    let regs = (true, false, true);
    let first = regs.0;                     // bool Copy → bản sao OK

    // Tuple phần tử non-Copy → phải borrow
    let langs = (String::from("Rust"), String::from("Go"));
    // let f = langs.0;                     // ERROR — cannot move out
    let f = &langs.0;                       // borrow — OK
    println!("{f} {langs:?}");
}
```

Tuple dùng `.0`, `.1` (bài 28); array dùng `[0]`, `[1]`. Nhưng logic ownership giống nhau: phần tử Copy → copy được; phần tử non-Copy → phải borrow (hoặc clone).

## Đào sâu: vì sao "sở hữu một phần" bị cấm

Tại sao Rust không cho move một phần tử ra khỏi array? Vì nó phá vỡ tính toàn vẹn của owner:
- Array là **một** owner chịu trách nhiệm dọn **toàn bộ** phần tử cuối scope.
- Nếu phần tử 0 đã move đi (owner khác sẽ dọn nó), nhưng array vẫn nghĩ mình sở hữu cả mảng → cuối scope array cố dọn cả phần tử 0 → **double free**.
- Rust không có cách "đánh dấu" một ô array là "đã move" trong khi giữ các ô khác (array kích thước cố định, layout liền kề).

Nên Rust cấm thẳng. Muốn lấy phần tử heap **ra** thật sự (move) cần method chuyên dụng như `Vec::remove`, `std::mem::take`, hoặc `.into_iter()` tiêu thụ cả collection — học sau. Còn để **dùng** phần tử, cứ borrow.

```text
Array = MỘT owner dọn TẤT CẢ phần tử cuối scope
→ move một phần tử ra = array dọn ô đã move = double free
→ Rust cấm → borrow (hoặc clone) thay thế
```

## Use case thực tế

```rust
fn main() {
    let users = [
        String::from("alice"),
        String::from("bob"),
        String::from("carol"),
    ];

    // Duyệt bằng reference — không move, không copy
    for user in &users {                   // user là &String
        println!("Người dùng: {user}");
    }

    // Lấy một phần tử để đọc → borrow
    let admin = &users[0];
    println!("Admin: {admin}");
    println!("Tổng: {} người", users.len());   // users vẫn đủ
}
```

Duyệt collection heap bằng `&collection` (mượn từng phần tử) là pattern phổ biến nhất — không động tới ownership. Đây cũng là lý do bài 28 dùng `for x in arr` được với array số (Copy) nhưng với array String cần `for x in &arr`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `arr[0]` với phần tử String | `cannot move out` | `&arr[0]` (borrow) hoặc `.clone()` |
| `tuple.0` với phần tử String | `cannot move out` | `&tuple.0` |
| `for x in arr` với array String | move/lỗi | `for x in &arr` |
| Clone phần tử khi chỉ cần đọc | Tốn memory | Borrow `&` |
| Tưởng index luôn copy | Chỉ với type Copy | Non-Copy phải borrow |
| Mong move một phần tử ra dễ dàng | Cấm (sở hữu một phần) | Dùng method chuyên dụng (sau) |

## Tóm tắt bài 57

- Collection (array, tuple) **sở hữu** phần tử bên trong → ownership lan xuống thành cây.
- Index phần tử **Copy** (bool, i32) → tạo **bản sao**, collection nguyên vẹn.
- Index phần tử **non-Copy** (String) → sẽ là move → tạo "sở hữu một phần" → Rust **cấm**.
- Sửa: **`.clone()`** (đắt, nhân đôi heap) hoặc **`&collection[i]`** borrow (rẻ, idiomatic).
- Tuple cùng quy tắc, cú pháp `.0`/`.1`; duyệt collection heap bằng `for x in &collection`.
- Cấm "sở hữu một phần" để tránh double free (array dọn cả ô đã move).

**Bài kế tiếp** → [Bài 58: Project & Section Review — road trip với mutable references, tổng kết phase](06-project-va-review.md)
