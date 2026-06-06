# Bài 86: Turbofish & nhiều generic — `::<T>` và `<T, U>`

Rust tự suy `T` từ giá trị — nhưng đôi khi bạn muốn **chỉ định rõ** type (ép `5` thành `u8` thay vì `i32` mặc định). Đó là **turbofish** `::<T>`. Và một hàm có thể có **nhiều** generic (`<T, U>`) — cho phép nhiều type độc lập. Hai kỹ thuật này mở rộng generic: kiểm soát type chính xác và linh hoạt nhiều type.

## Turbofish `::<T>` — chỉ định type rõ ràng

Bình thường Rust tự suy `T`. **Turbofish operator** `::<T>` cho phép **chỉ định** type cụ thể tại lời gọi:

```rust
fn identity<T>(value: T) -> T { value }

fn main() {
    let a = identity(5);                  // T = i32 (suy mặc định)
    let b = identity::<i8>(5);            // T = i8 (turbofish ép)
    let c = identity::<u32>(5);           // T = u32
}
```

```text
identity ::<i8> (5)
│        │      │
│        │      └ tham số bình thường
│        └ turbofish: chỉ định T = i8
└ tên hàm
```

Cú pháp: tên hàm + `::` + `<Type>` + `()`. Tên "turbofish" vì `::<>` trông như con cá đang bơi. Dùng khi muốn ép type khác mặc định, hoặc khi Rust không suy được.

```rust
let x = identity::<&str>("hi");
let y = identity::<bool>(true);
```

Turbofish giống cú pháp annotate type của struct (`Vec::<i32>`) nhưng cho lời gọi hàm — thêm `::` trước `<>`.

## Khi nào cần turbofish

Đa số trường hợp Rust tự suy đủ — không cần turbofish. Cần khi:
- **Ép type cụ thể** khác mặc định (`5` mặc định `i32`, muốn `u8`).
- **Rust không suy được** — thường với method như `.parse()` hay `.collect()`:

```rust
let n = "42".parse::<i32>().unwrap();     // parse cần biết parse thành type gì
let v = (1..5).collect::<Vec<i32>>();     // collect cần biết gom vào type gì
```

`.parse()` có thể trả nhiều type → turbofish nói rõ "parse thành `i32`". Đây là chỗ turbofish gặp nhiều nhất trong thực tế.

## Kết hợp generic và type cụ thể

Một hàm trộn generic `T` với type hard-code:

```rust
fn make_tuple<T>(first: T, second: i32) -> (T, i32) {    // T generic, i32 cụ thể
    (first, second)
}

fn main() {
    let t = make_tuple("hello", 5);      // first linh hoạt, second BẮT BUỘC i32
    // make_tuple("hello", "world");     // ERROR — second phải i32
}
```

`first` linh hoạt (generic `T`), `second` cố định `i32`. Compiler ép `second` đúng `i32`. Trộn được tuỳ nhu cầu.

## Một generic dùng nhiều chỗ → ép cùng type

Dùng cùng `T` cho nhiều parameter → ép chúng **cùng type**:

```rust
fn make_pair<T>(first: T, second: T) -> (T, T) {    // cả hai cùng T
    (first, second)
}

fn main() {
    make_pair(5, 10);                    // OK — cả hai i32
    make_pair("a", "b");                 // OK — cả hai &str
    // make_pair(5, "b");                // ERROR — T không thể vừa i32 vừa &str
}
```
```text
error: mismatched types: expected integer, found `&str`
```

Cùng `T` = **ràng buộc** hai parameter cùng type. Mỗi lời gọi chọn type khác, nhưng trong một lời gọi, cả hai phải giống. Rust thấy `first` là `i32` → `T = i32` → `second` cũng phải `i32`.

## Nhiều generic `<T, U>` — nhiều type độc lập

Cần hai parameter **khác type** → khai **nhiều** generic, cách nhau bằng `,`:

```rust
fn make_tuple<T, U>(first: T, second: U) -> (T, U) {    // T và U độc lập
    (first, second)
}

fn main() {
    make_tuple(5, "hello");              // T = i32, U = &str — OK
    make_tuple(true, 3.14);              // T = bool, U = f64 — OK
    make_tuple(5, 10);                   // T = i32, U = i32 — CŨNG OK
}
```

```text
make_tuple <T, U> (first: T, second: U)
           │  │
           │  └ generic thứ hai (convention: U, sau T)
           └ generic thứ nhất
```

Convention: `T`, rồi `U` (chữ kế trong bảng chữ cái). `<T, U>` cho phép `first`/`second` **khác type độc lập**.

## Quan trọng: nhiều generic CHO PHÉP khác, không BẮT BUỘC khác

Điểm tinh tế: `<T, U>` **mở ra khả năng** hai type khác nhau, nhưng **không bắt buộc** khác:

```rust
make_tuple(5, "hello");      // T=i32, U=&str — khác type
make_tuple(5, 10);           // T=i32, U=i32 — CÙNG type, vẫn OK!
# fn make_tuple<T, U>(first: T, second: U) -> (T, U) { (first, second) }
```

`<T, U>` chỉ là hai chỗ trống độc lập — điền cùng type cũng được. Khác với một `T` dùng hai chỗ (ép cùng type). So sánh:

| Cú pháp | Hai parameter | Khi dùng |
|---|---|---|
| `<T>` dùng `T, T` | **bắt buộc** cùng type | Cần đảm bảo giống nhau |
| `<T, U>` dùng `T, U` | **cho phép** khác type (giống cũng được) | Cần linh hoạt độc lập |

Chọn cẩn thận: dùng một `T` khi muốn ràng buộc giống; dùng `T, U` khi muốn độc lập.

## Use case thực tế

```rust
// Cần cùng type: hoán đổi hai giá trị
fn swap<T>(a: T, b: T) -> (T, T) {
    (b, a)
}

// Cần khác type: ghép key-value
fn pair<K, V>(key: K, value: V) -> (K, V) {     // tên tuỳ: K (key), V (value)
    (key, value)
}

fn main() {
    let (x, y) = swap(1, 2);                     // cùng type i32
    let entry = pair("age", 30);                 // khác type: &str + i32
    println!("{x} {y}, {entry:?}");
}
```

`swap` cần cùng type (`<T>`); `pair` cần khác type (`<K, V>`). Tên generic tuỳ ý — `K`/`V` cho key/value rõ nghĩa hơn `T`/`U`. Chọn số lượng generic theo ràng buộc bài toán.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Một `T` cho hai parameter khác type | Type mismatch | Dùng `<T, U>` |
| `<T, U>` mong bắt buộc khác type | Chỉ cho phép, không bắt buộc | Dùng một `T` để ép giống |
| Quên turbofish khi `.parse()`/`.collect()` | Rust không suy được type | `::<Type>` |
| Turbofish sai cú pháp (thiếu `::`) | Lỗi | `func::<Type>()` |
| Quên `,` giữa nhiều generic | Lỗi cú pháp | `<T, U>` |

## Tóm tắt bài 86

- **Turbofish** `func::<Type>()` chỉ định type rõ ràng tại lời gọi — khi ép type khác mặc định hoặc Rust không suy được (`.parse::<i32>()`).
- Trộn generic với type cụ thể được (`fn f<T>(a: T, b: i32)`).
- Một `T` dùng nhiều chỗ → **bắt buộc** cùng type; mỗi lời gọi chọn type riêng.
- Nhiều generic `<T, U>` → **cho phép** (không bắt buộc) khác type độc lập.
- Chọn: một `T` để ràng buộc giống; `<T, U>` để linh hoạt độc lập.
- Tên generic tuỳ ý (`T`, `U`, `K`, `V`) — chọn rõ nghĩa.

**Bài kế tiếp** → [Bài 87: Generic trong struct — type linh hoạt cho field](03-generics-trong-struct.md)
