# Bài 11: Tuples và Arrays — compound types cơ bản

> Sau scalar, đến **compound type** — gói nhiều giá trị vào 1. Phase này dạy 2 cái cơ bản: **tuple** (heterogeneous, fixed size) và **array** (homogeneous, fixed size). Slice và Vector học ở phase sau.

## Tuple — kết hợp type khác nhau

```rust
fn main() {
    let person: (String, i32, f64) = (String::from("Alice"), 30, 1.65);
    
    let name = &person.0;
    let age = person.1;
    let height = person.2;
    
    println!("{} is {} years old, {:.2}m", name, age, height);
}
```

Truy cập field qua **index dot notation**: `tuple.0`, `tuple.1`, ...

### Destructuring

```rust
let (name, age, height) = person;
println!("{name} {age} {height}");
```

Pattern matching để extract — phổ biến hơn `.0`/`.1`.

### Tuple types đặc biệt

```rust
let unit: () = ();        // unit tuple — empty
let single = (5,);         // 1-tuple (trailing comma bắt buộc)
let multi = (1, 2, 3);     // 3-tuple
```

- **Unit `()`** = "không có gì". Function không return value thực ra return `()`.
- 1-tuple `(5,)` — bắt buộc trailing comma, phân biệt với `(5)` (= `5` trong nhóm).

### Function return multiple values

```rust
fn min_max(nums: &[i32]) -> (i32, i32) {
    let min = *nums.iter().min().unwrap();
    let max = *nums.iter().max().unwrap();
    (min, max)
}

fn main() {
    let (lo, hi) = min_max(&[3, 1, 4, 1, 5, 9, 2, 6]);
    println!("min={lo} max={hi}");
}
```

Tuple = cách phổ biến trả nhiều giá trị từ function.

### Fixed size + heterogeneous

```rust
let t: (i32, f64, char) = (5, 3.14, 'A');
// (i32, f64, char) là 1 type — type khác (i32, i32) hoàn toàn
```

Tuple type = combination các type bên trong. `(i32, i32)` ≠ `(i32, f64)`.

Size cố định lúc compile. Không thể `push`/`pop`.

## Array — list cùng type

```rust
let nums: [i32; 5] = [1, 2, 3, 4, 5];

println!("{}", nums[0]);    // 1
println!("{}", nums[4]);    // 5

// Length
println!("{}", nums.len()); // 5
```

Cú pháp type: `[T; N]` — N phải biết lúc compile.

### Khởi tạo

```rust
// Liệt kê
let a = [1, 2, 3];

// Type annotation
let a: [i32; 3] = [1, 2, 3];

// Init same value
let zeros = [0; 100];        // [0, 0, 0, ...] 100 phần tử
let buffer = [b' '; 1024];   // 1024 spaces
```

`[value; count]` — repeat syntax.

### Index out of bounds

```rust
let a = [1, 2, 3];
let x = a[10];               // panic runtime
```

```text
thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 10'
```

Rust check bounds runtime → no buffer overflow như C.

Safe access:
```rust
let x = a.get(10);            // Option<&i32>: None
match x {
    Some(v) => println!("got {v}"),
    None => println!("out of range"),
}
```

`.get()` trả `Option` — phase 12 sẽ học sâu.

### Khi nào dùng array

- Số lượng phần tử **cố định** lúc compile.
- Performance-critical (stack allocated, không heap).
- Buffer size known: `[u8; 1024]` cho I/O buffer.

```rust
const BUFFER_SIZE: usize = 4096;
let buf: [u8; BUFFER_SIZE] = [0; BUFFER_SIZE];
```

Nếu size động → dùng `Vec<T>` (phase 13).

### Iterate array

```rust
let nums = [10, 20, 30, 40, 50];

for n in nums {                    // copy each — vì i32 implement Copy
    println!("{n}");
}

for (i, n) in nums.iter().enumerate() {
    println!("[{i}] {n}");
}
```

## Tuple vs Array

| | Tuple | Array |
|---|---|---|
| Type bên trong | Heterogeneous | Homogeneous |
| Access | `.0`, `.1` (compile-time index) | `[i]` (runtime index) |
| Size | Cố định (số phần tử) | Cố định (compile-time N) |
| Iterate | Không (không nhất quán type) | Có |
| Use case | Return multi value, named pos | List cùng type |

## Array slicing — preview slice (phase 8)

```rust
let nums = [1, 2, 3, 4, 5];
let slice = &nums[1..4];          // [2, 3, 4]
println!("{:?}", slice);
```

`[1..4]` = range, lấy index 1 đến 3 (exclusive 4). Slice là **reference** vào portion của array.

Phase Slices (8) đào sâu.

## Multi-dimensional array

```rust
let matrix: [[i32; 3]; 2] = [
    [1, 2, 3],
    [4, 5, 6],
];

println!("{}", matrix[0][1]);       // 2
println!("{}", matrix[1][2]);       // 6
```

`[[T; M]; N]` = N rows, M cols.

## Debug print với `{:?}`

```rust
let t = (1, 2.5, "hello");
let a = [1, 2, 3];

println!("{:?}", t);                // (1, 2.5, "hello")
println!("{:?}", a);                // [1, 2, 3]
println!("{:#?}", a);               // pretty print
```

`{:?}` = Debug format. `{:#?}` = pretty (multi-line). Phase Traits (18) đào sâu Display vs Debug.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `(5)` thay `(5,)` cho 1-tuple | Trailing comma bắt buộc cho 1-tuple. |
| Mix type trong array | Array homogeneous. Dùng tuple hoặc enum. |
| Index out of bounds panic | `.get()` cho safe access. |
| Array size không compile-time | Phải `const N: usize = ...;`. Dynamic size → `Vec`. |
| Forget `let nums: [i32; 5]` annotation | Suy luận được nếu literal có values, không nếu init `[0; N]` ambiguous. |
| Compare 2 array khác length | Type khác → không compile. `[i32; 3]` ≠ `[i32; 4]`. |
| Tuple field `.0.0` cho nested | OK: `let t = ((1, 2), 3); t.0.0` = 1. |

## Tóm tắt bài 11

- **Tuple** `(T1, T2, ...)`: heterogeneous, fixed size, access `.0`/`.1`.
- **Array** `[T; N]`: homogeneous, compile-time fixed size, access `[i]`.
- Destructuring tuple: `let (a, b, c) = t;`.
- Out-of-bounds index → panic runtime. `.get()` trả `Option` safe.
- Tuple cho return multi value. Array cho list cùng type, size cố định.
- `{:?}` Debug print, `{:#?}` pretty. Dynamic-size list → `Vec` (phase 13).

**Bài kế tiếp** → [Bài 12 (phase-4): Functions — parameters, return, expressions](../phase-4-functions/01-fn-basics.md)
