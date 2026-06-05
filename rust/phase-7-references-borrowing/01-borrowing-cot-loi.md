# Bài 15: References và borrowing — share không lấy ownership

> Ownership chặt. Mỗi lần gọi function với String → move? Code thành mớ `clone()`/return-tuple? Không. Rust có **reference** — "mượn" value tạm để đọc/ghi mà không lấy ownership. Bài này dạy `&`, `&mut`, và **borrow checker** — kẻ gác cổng nghiêm khắc nhưng cứu mạng.

## Reference cơ bản — `&`

```rust
fn calculate_length(s: &String) -> usize {
    s.len()
}

fn main() {
    let s = String::from("hello");
    let len = calculate_length(&s);     // mượn s
    println!("{s} has length {len}");    // s vẫn dùng được!
}
```

`&s` = "reference đến s". Function nhận `&String` thay vì `String` — **không lấy ownership**.

```text
stack:
┌──────┐    ┌──────┐    heap:
│ &s   ├───►│ s    ├───►"hello"
└──────┘    │ ptr  │
            │ len  │
            │ cap  │
            └──────┘
```

`&s` là pointer đến variable `s`. Khi function exit, reference die — owner `s` không bị drop.

### Reference rules

```rust
let x = 5;
let r = &x;
println!("{}", r);          // 5 — auto-deref print
println!("{}", *r);         // 5 — explicit deref
```

`*r` = dereference (lấy value). Trong nhiều ngữ cảnh Rust auto-deref → bạn không cần `*` thủ công.

## Mutable reference — `&mut`

Default reference **immutable**. Muốn modify:

```rust
fn append_world(s: &mut String) {
    s.push_str(" world");
}

fn main() {
    let mut s = String::from("hello");
    append_world(&mut s);
    println!("{s}");        // hello world
}
```

3 thứ cần đồng bộ:
- `s` khai báo `mut`.
- Pass `&mut s` (có `mut`).
- Parameter type `&mut String`.

Thiếu 1 → compile error.

## Borrow checker rules — **rất quan trọng**

```text
Tại 1 thời điểm cho 1 value:
  - Hoặc 1 mutable reference (&mut)
  - Hoặc nhiều immutable reference (&)
  - KHÔNG được cả 2 cùng lúc
```

### Demo: nhiều immutable ref — OK

```rust
let s = String::from("hello");
let r1 = &s;
let r2 = &s;
let r3 = &s;
println!("{r1} {r2} {r3}");     // OK
```

Đọc many — không conflict.

### Demo: 1 mutable + 1 immutable — FAIL

```rust
let mut s = String::from("hello");
let r1 = &s;
let r2 = &mut s;
println!("{r1}");
println!("{r2}");
```

```text
error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable
```

Vì sao? — Nếu cho phép:
- r1 đọc s (giả định "hello").
- r2 ghi s ("hello world").
- r1 đọc lại → giờ thấy "hello world" — surprise! Data race.

Rust compile-time prevent.

### Demo: 2 mutable — FAIL

```rust
let mut s = String::from("hello");
let r1 = &mut s;
let r2 = &mut s;
r1.push_str(" a");
r2.push_str(" b");
```

```text
error[E0499]: cannot borrow `s` as mutable more than once at a time
```

2 mutable ref = 2 writer → race condition khi multithread. Compile catch.

## Non-lexical lifetimes (NLL) — borrow scope thông minh

```rust
let mut s = String::from("hello");
let r1 = &s;
println!("{r1}");          // r1 dùng lần cuối ở đây

let r2 = &mut s;            // OK — r1 không còn "live"
r2.push_str(" world");
```

Rust 2018+ borrow scope = **từ creation đến last use**, không phải đến end of block. Code linh hoạt hơn.

## Reference + Function — patterns

### Read-only
```rust
fn print_length(s: &String) {
    println!("{}", s.len());
}
```

### Mutate in place
```rust
fn capitalize(s: &mut String) {
    *s = s.to_uppercase();
}
```

### Return reference (lifetimes — phase 19)
```rust
fn first_word(s: &String) -> &str {
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b' ' {
            return &s[..i];
        }
    }
    &s[..]
}
```

`-> &str` return reference. Caller borrow vẫn live.

## Dangling reference — Rust prevent

C cho phép:
```c
char* dangle() {
    char s[10] = "hi";
    return s;       // s die khi return — dangling pointer
}
```

Rust catch:
```rust
fn dangle() -> &String {
    let s = String::from("hi");
    &s              // s drop, &s dangle
}
```

```text
error[E0106]: missing lifetime specifier
```

Phase Lifetimes giải thích nhưng cốt lõi: Rust track lifetime, không cho phép reference outlive value.

## Reference vs Pointer

- **Reference** (`&T`, `&mut T`) = Rust safe abstraction. Bound bởi borrow rules.
- **Raw pointer** (`*const T`, `*mut T`) = C-style. Unsafe, không borrow check.

Khoá học chủ yếu dùng reference. Raw pointer cho FFI, unsafe Rust — advanced.

## `&str` vs `&String`

Thường viết `fn foo(s: &str)` thay `fn foo(s: &String)`. Vì sao?

```rust
fn print_str(s: &str) { println!("{s}"); }
fn print_string(s: &String) { println!("{s}"); }

fn main() {
    let owned = String::from("hello");
    let literal = "world";
    
    print_str(&owned);       // OK — &String auto-deref to &str
    print_str(literal);       // OK — literal is &str
    
    print_string(&owned);     // OK
    print_string(literal);    // ERROR — &str không phải &String
}
```

`&str` accept cả `&String` lẫn `&'static str` literal. `&String` chỉ accept owned. **Idiom: dùng `&str` cho param read-only**.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Borrow conflict | Reduce scope của ref, hoặc Clone/Rc. |
| Forget `mut` ở 3 chỗ | Variable mut + `&mut` ref + `&mut Type` param. |
| Use ref after owner drop | Compile error — adjust scope. |
| Return reference từ function param | Cần lifetime annotation (phase 19). |
| Multiple mutable nhưng different fields | Split borrow OK: `let (a, b) = (&mut s.field1, &mut s.field2);` |
| `&String` param thay `&str` | Verbose + restrict caller. Dùng `&str`. |
| `*r = ...` mà r là `&T` immutable | Cần `&mut T`. |
| Auto-deref confusing | Most cases works. Explicit `*` khi compiler complain. |

## Tóm tắt bài 15

- Reference `&T` = borrow read-only. `&mut T` = borrow mutable.
- **Rules**: cùng lúc 1 mut HOẶC many immut. Không mix.
- Borrow scope = creation đến last use (NLL).
- Return reference cần lifetime (phase 19).
- Prefer `&str` over `&String` cho function param.
- Compile-time prevent: data race, dangling pointer, double free.

**Bài kế tiếp** → [Bài 16 (phase-8): Slices — view vào portion của data](../phase-8-slices/01-slice-cot-loi.md)
