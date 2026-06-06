# Bài 85: Generics — viết code một lần cho nhiều type

Bạn viết một hàm `identity` trả về chính giá trị nhận vào — cho `i32`. Mai cần y hệt cho `bool`, lại copy thành `identity_bool`. Rồi `f64`, `String`... cùng một logic, chỉ khác type. Lặp vô tận. **Generics** giải quyết: viết code **một lần**, dùng cho **mọi type**, vẫn an toàn type. Đây là chìa khoá cho `Vec<T>`, `Option<T>`, `Result<T, E>` — và bạn đã thoáng thấy generic ở bài 29.

## Vấn đề: code lặp lại cho từng type

```rust
fn identity_i32(value: i32) -> i32 { value }       // y hệt nhau...
fn identity_bool(value: bool) -> bool { value }    // ...chỉ khác type
fn identity_f64(value: f64) -> f64 { value }       // lặp vô tận
```

Thân hàm **giống hệt** — chỉ type khác. Bị buộc viết riêng vì hard-code type cụ thể. Nếu có cách trừu tượng hoá type này, không cụ thể mà tổng quát...

## Generic là gì

**Generic** = một **type argument** — placeholder trừu tượng cho một type cụ thể trong tương lai. Nhắc lại bài 29:

- **Parameter** là placeholder cho một **giá trị** (argument).
- **Generic** là placeholder cho một **type** (i32, String, bool...).

"Generic" nghĩa là "không cụ thể" — đúng bản chất: type chưa cụ thể, chỉ là chỗ trống cho type tương lai điền vào.

## Hàm generic: cú pháp `<T>`

Khai báo generic bằng angle bracket `<T>` **sau tên hàm**, rồi dùng `T` làm type cho parameter/return:

```rust
fn identity<T>(value: T) -> T {      // một hàm cho MỌI type
    value
}
```

```text
fn identity <T> (value: T) -> T {
│           │            │     │
│           │            │     └ return type là T
│           │            └ parameter type là T
│           └ khai báo generic T (sau tên hàm)
└ hàm
```

- `<T>` sau tên hàm **khai báo** generic; tên tuỳ ý (convention: **`T`** — viết hoa, short for "type").
- `value: T`, `-> T`: dùng `T` làm type. Nghĩa: "với type `T` bất kỳ, nhận `value` kiểu `T`, trả về kiểu `T`".
- Vì cùng `T`, parameter và return **cùng type** (dù chưa biết type gì).

**Bắt buộc khai `<T>`** trước khi dùng. Không có `<T>` mà viết `value: T` → Rust tưởng `T` là một type cụ thể (struct/enum tên `T`).

## Gọi hàm generic

Rust **tự suy** type `T` từ giá trị truyền vào:

```rust
fn main() {
    println!("{}", identity(5));              // T = i32 (suy từ 5)
    println!("{}", identity(3.14));           // T = f64
    println!("{}", identity("hello"));        // T = &str
    println!("{}", identity(String::from("hi")));  // T = String
    println!("{}", identity(true));           // T = bool
}
# fn identity<T>(value: T) -> T { value }
```

Mỗi lời gọi, Rust nhìn giá trị → xác định `T` → kiểm tra return đúng `T`. Một hàm `identity` xử lý mọi type — kể cả type tự định nghĩa:

```rust
#[derive(Debug)]
struct DeliSandwich;

fn main() {
    let s = identity(DeliSandwich);          // T = DeliSandwich (type của bạn!)
    println!("{s:?}");
}
# fn identity<T>(value: T) -> T { value }
# #[derive(Debug)] struct DeliSandwich;
```

Generic chấp nhận cả type tương lai chưa tồn tại — đó là sức mạnh: code không bị khoá vào type cụ thể.

## Đào sâu: monomorphization — generic không tốn gì lúc chạy

Generic nghe như chậm (xử lý "type bất kỳ" lúc chạy?). **Không.** Lúc compile, Rust làm **monomorphization**: nhìn mọi lời gọi generic, sinh ra **phiên bản riêng** cho từng type cụ thể được dùng — đúng việc bạn làm thủ công đầu bài, nhưng tự động:

```text
Code bạn viết:           Sau monomorphization (trong binary):
fn identity<T>(...)   →   fn identity_i32(value: i32) -> i32 { value }
identity(5)              fn identity_bool(value: bool) -> bool { value }
identity(true)           fn identity_str(value: &str) -> &str { value }
identity("hi")           ...mỗi type một hàm riêng
```

Trong binary cuối, **không** còn khái niệm generic — Rust đã sinh các hàm cụ thể. Bạn được lợi (viết một lần), Rust lo phần lặp. Kết quả: generic **zero-cost** — nhanh như viết tay từng phiên bản, không overhead runtime. (Đánh đổi: binary lớn hơn chút vì nhiều bản sao — gọi là code bloat, thường không đáng kể.)

## Vì sao generic quan trọng

Generic là nền cho code tái sử dụng + an toàn của Rust:
- **Không lặp**: một hàm/struct/enum cho nhiều type.
- **An toàn type**: compiler vẫn kiểm tra đầy đủ (parameter/return cùng `T` được enforce).
- **Zero-cost**: monomorphization → nhanh như code cụ thể.

Mọi type generic bạn đã thấy (`Vec<T>`, `Option<T>`, `Range<T>`) dựa trên cơ chế này. Phase này dạy dùng generic cho function (bài này), struct (bài 87), enum (bài 89), method (bài 88).

## Use case thực tế

```rust
// Một hàm tìm phần tử lớn nhất cho MỌI type so sánh được
fn largest<T: PartialOrd>(list: &[T]) -> &T {     // T: PartialOrd = ràng buộc (bài sau)
    let mut max = &list[0];
    for item in list {
        if item > max {
            max = item;
        }
    }
    max
}

fn main() {
    let nums = [3, 7, 2, 9, 4];
    let words = ["pear", "apple", "banana"];
    println!("{}", largest(&nums));      // 9
    println!("{}", largest(&words));     // pear
}
```

`largest` xử lý cả `[i32]` lẫn `[&str]` — một hàm, nhiều type. (`T: PartialOrd` là **trait bound** — ràng buộc `T` phải so sánh được; phase Traits đào sâu. Ở đây chỉ cần thấy generic + ràng buộc cho code vừa linh hoạt vừa an toàn.)

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `T` không khai `<T>` | Rust tìm type tên `T` | Khai `<T>` sau tên hàm |
| Tưởng generic chậm runtime | Sai — monomorphization | Zero-cost |
| Cùng `T` nhưng mong khác type | `T` ép cùng type | Dùng nhiều generic (bài 86) |
| Quên generic cần ràng buộc để dùng phép toán | Compile error | Trait bound (phase Traits) |

## Tóm tắt bài 85

- **Generic** = type argument, placeholder cho type tương lai — như parameter cho giá trị.
- Giải bài toán lặp: viết code **một lần** cho **mọi type**, vẫn an toàn type.
- Hàm generic: `fn name<T>(value: T) -> T` — khai `<T>` sau tên, dùng `T` làm type.
- Rust **tự suy** `T` từ giá trị truyền vào; cùng `T` → cùng type.
- **Monomorphization**: compiler sinh phiên bản riêng cho mỗi type → generic **zero-cost** runtime.
- Nền cho `Vec<T>`, `Option<T>`, `Result<T,E>`; dùng cho function/struct/enum/method.

**Bài kế tiếp** → [Bài 86: Turbofish & nhiều generic — `::<T>` và `<T, U>`](02-turbofish-va-multiple.md)
