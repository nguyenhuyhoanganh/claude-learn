# Bài 21: Vectors — dynamic array của Rust

> Array fixed size compile-time. Cần list grow/shrink runtime → `Vec<T>`. Bài này dạy: create, push/pop, index, iterate, common methods, và memory model bên trong.

## Create Vec

```rust
// Empty + push
let mut v: Vec<i32> = Vec::new();
v.push(1);
v.push(2);
v.push(3);

// Macro literal
let v = vec![1, 2, 3, 4, 5];

// Initial size with default
let v = vec![0; 10];           // [0, 0, ..., 0] 10 phần tử

// From iterator
let v: Vec<i32> = (1..=5).collect();
```

`vec![]` macro thuận tiện nhất.

## Index access

```rust
let v = vec![10, 20, 30];

let first = v[0];              // 10 — panic nếu out of bounds
let safe = v.get(0);            // Some(&10)
let oob = v.get(100);           // None
```

`[i]` panic out of bounds. `.get(i)` trả `Option<&T>`. Production thường `.get()`.

## Iterate

```rust
let v = vec![1, 2, 3];

for x in &v {                  // &i32 — borrow
    println!("{x}");
}
// v vẫn dùng được

for x in &mut v {              // &mut i32 — mutable borrow
    *x += 10;
}

for x in v {                   // i32 — consume (move)
    println!("{x}");
}
// v không dùng được
```

3 cách iterate khác nhau. Choose theo nhu cầu.

## Common methods

```rust
let mut v = vec![1, 2, 3];

v.push(4);                     // [1, 2, 3, 4]
v.pop();                       // Some(4), v = [1, 2, 3]
v.insert(0, 0);                 // [0, 1, 2, 3]
v.remove(1);                    // 1 (return), v = [0, 2, 3]

v.len();                       // 3
v.is_empty();                  // false
v.contains(&2);                 // true
v.first();                     // Some(&0)
v.last();                       // Some(&3)

v.sort();                      // in-place sort
v.reverse();                    // in-place reverse
v.clear();                     // empty
```

### Iterator methods (preview)

```rust
let v = vec![1, 2, 3, 4, 5];

let sum: i32 = v.iter().sum();              // 15
let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();
let evens: Vec<&i32> = v.iter().filter(|x| *x % 2 == 0).collect();
let max = v.iter().max().unwrap();           // &5
```

Phase Iterators (21) đào sâu.

## Memory model

```text
Vec<T>:
stack:                   heap:
┌──────────┐            ┌────────────────┐
│ ptr ─────┼───────────►│ [0] [1] [2] ...│
│ len: 3    │            └────────────────┘
│ cap: 4    │
└──────────┘
```

3 field:
- `ptr` — pointer đến heap.
- `len` — số phần tử đang có.
- `cap` — capacity (size buffer allocate).

Khi `push` mà `len == cap`:
1. Allocate buffer mới lớn hơn (thường gấp đôi).
2. Copy data sang.
3. Update ptr/cap.
4. Free buffer cũ.

Amortized O(1) push.

### Capacity vs Length

```rust
let mut v = Vec::with_capacity(10);
println!("len: {}, cap: {}", v.len(), v.capacity());  // 0, 10

v.push(1);
println!("len: {}, cap: {}", v.len(), v.capacity());  // 1, 10
```

Pre-allocate khi biết size — avoid realloc.

## Vec of generic type

```rust
let words: Vec<&str> = vec!["hello", "world"];
let strings: Vec<String> = vec![String::from("a"), String::from("b")];
let pairs: Vec<(i32, i32)> = vec![(1, 2), (3, 4)];
```

T phải cùng type — homogeneous.

### Vec of mixed type → enum

```rust
enum Cell {
    Int(i32),
    Text(String),
    Float(f64),
}

let row: Vec<Cell> = vec![
    Cell::Int(1),
    Cell::Text(String::from("hello")),
    Cell::Float(3.14),
];
```

Enum wrap variety. Hoặc `Vec<Box<dyn Trait>>` (phase 18).

## Slice từ Vec

```rust
let v = vec![1, 2, 3, 4, 5];
let slice: &[i32] = &v[1..4];        // [2, 3, 4]
```

Slice borrow vào Vec — không copy.

## Pass Vec vs slice to function

```rust
fn sum_owned(v: Vec<i32>) -> i32 { v.iter().sum() }       // consume
fn sum_borrowed(v: &Vec<i32>) -> i32 { v.iter().sum() }   // borrow Vec
fn sum_slice(v: &[i32]) -> i32 { v.iter().sum() }          // slice — best

fn main() {
    let v = vec![1, 2, 3];
    println!("{}", sum_slice(&v));         // OK
    println!("{}", sum_slice(&[1, 2, 3])); // OK
    println!("{}", sum_slice(&v[..2]));     // OK
}
```

**Idiom**: dùng `&[T]` slice cho param thay vì `&Vec<T>` — flexible hơn.

## Borrow trong loop

```rust
let v = vec![1, 2, 3];

let first = &v[0];          // borrow
// v.push(4);                // ERROR — borrow active

println!("{first}");        // last use — borrow ends
v.push(4);                  // OK now
```

Borrow checker bảo vệ — Vec realloc → invalidate `first` pointer.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `v[100]` out of bounds | `.get()` trả Option safe. |
| Mutate Vec khi đang borrow ref | Borrow rules. Drop ref trước. |
| Iterate `for x in v` rồi dùng v | Move. Dùng `&v` borrow. |
| Compare Vec với array | Type khác. Convert hoặc compare element. |
| Capacity sai → realloc nhiều | `with_capacity(n)` pre-allocate. |
| `Vec<&str>` mixed lifetime | Lifetime annotation. Phase 19. |
| Sort cần `PartialOrd` | Type custom phải implement. |
| `v.iter()` vs `v.iter_mut()` vs `v.into_iter()` | Read / Mutate / Consume — choose. |

## Tóm tắt bài 21

- `Vec<T>` = dynamic array growable, on heap.
- Create: `Vec::new()`, `vec![1,2,3]`, `vec![0; n]`.
- Methods: push/pop/insert/remove/len/sort/iter.
- `[i]` panic, `.get(i)` Option.
- 3 cách iterate: `&v` (read), `&mut v` (modify), `v` (consume).
- Memory: ptr + len + cap. Push amortized O(1).
- Function param prefer `&[T]` slice over `&Vec<T>`.

**Bài kế tiếp** → [Bài 22 (phase-14): Project structure — modules, crates, workspaces](../phase-14-project-structure/01-modules-cot-loi.md)
