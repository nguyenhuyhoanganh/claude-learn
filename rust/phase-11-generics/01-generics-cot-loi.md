# Bài 19: Generics — code reusable theo type

> Thay vì viết `fn largest_i32`, `fn largest_f64`, `fn largest_string`... viết 1 `fn largest<T>` work cho mọi type. Generic = abstract over type. Rust generic là **zero-cost** — compile time generate version cho mỗi type concrete (monomorphization).

## Function generic

```rust
fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}

fn main() {
    let nums = vec![10, 25, 3, 42, 8];
    println!("{}", largest(&nums));      // 42
    
    let chars = vec!['y', 'm', 'a', 'q'];
    println!("{}", largest(&chars));     // y
}
```

`<T>` declare type parameter. `T: PartialOrd` constraint — T phải implement `PartialOrd` (cho `>`).

### Trait bound — `T: Trait`

```rust
fn print<T: std::fmt::Display>(x: T) {
    println!("{x}");
}
```

T phải có `Display` để `{}` work. Phase Traits (18) sẽ dạy `Display`.

### Multiple bounds

```rust
fn foo<T: Display + Clone>(x: T) { ... }
fn bar<T, U: Display + Clone>(x: T, y: U) { ... }

// where clause cho readability
fn complex<T, U>(x: T, y: U)
where
    T: Display + Clone,
    U: PartialOrd + Copy,
{
    // ...
}
```

`where` clause clean hơn khi bounds nhiều.

## Struct generic

```rust
struct Point<T> {
    x: T,
    y: T,
}

fn main() {
    let int_point = Point { x: 5, y: 10 };
    let float_point = Point { x: 1.5, y: 2.5 };
}
```

Type khác → struct khác (monomorphized). `Point<i32>` và `Point<f64>` là 2 type concrete.

### Multiple type params

```rust
struct Pair<T, U> {
    first: T,
    second: U,
}

let p = Pair { first: "name", second: 42 };
```

## Method với generic struct

```rust
impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }
}

impl<T: PartialOrd> Point<T> {           // constraint trên method
    fn larger_x(&self, other: &Point<T>) -> bool {
        self.x > other.x
    }
}

impl Point<f64> {                         // method chỉ cho concrete type
    fn distance_from_origin(&self) -> f64 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
```

3 patterns:
- `impl<T> Point<T>` — generic method.
- `impl<T: Bound> Point<T>` — generic với constraint.
- `impl Point<f64>` — method chỉ cho 1 concrete type.

## Enum generic

```rust
enum Option<T> {
    Some(T),
    None,
}

enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

`Option<T>` work cho mọi type T. Phase Option/Result (12) đào sâu.

## Monomorphization — zero-cost

```rust
fn largest<T: PartialOrd>(list: &[T]) -> &T { ... }

// Caller code:
let a = largest(&vec![1, 2, 3]);
let b = largest(&vec!["a", "b", "c"]);
```

Compiler generate:
```rust
fn largest_i32(list: &[i32]) -> &i32 { ... }
fn largest_str(list: &[&str]) -> &&str { ... }
```

Mỗi T concrete → 1 version riêng. Runtime: gọi function thường, **không** virtual dispatch.

Trade-off:
- ✓ Runtime fast (no indirection).
- ✗ Binary size lớn hơn (nhiều version).
- ✗ Compile chậm hơn.

So với Java generic (erasure) hoặc C++ template (cũng monomorphize) — Rust kết hợp performance C++ với safety check.

## Generic constraint patterns

### `+` combine bounds
```rust
fn print<T: Display + Debug>(x: T) { ... }
```

### `Sized` (default)
Mọi `T` mặc định `T: Sized` — biết size lúc compile. Opt-out với `?Sized` để chấp nhận unsized (vd `str`, slice).

### Default type param
```rust
struct Container<T = i32> {
    value: T,
}

let c: Container = Container { value: 5 };          // T = i32 default
let c: Container<String> = Container { value: String::from("hi") };
```

Stdlib `HashMap<K, V, S = RandomState>` — hasher mặc định.

## Generic vs Trait Object (preview)

```rust
// Generic — static dispatch
fn print_static<T: Display>(x: T) {
    println!("{x}");
}

// Trait object — dynamic dispatch
fn print_dynamic(x: &dyn Display) {
    println!("{x}");
}
```

| | Generic `<T: Trait>` | Trait Object `&dyn Trait` |
|---|---|---|
| Dispatch | Static (compile time) | Dynamic (runtime vtable) |
| Speed | Faster | Slower (vtable lookup) |
| Binary size | Lớn (mono) | Nhỏ |
| Heterogeneous collection | Không (`Vec<T>` 1 type) | Có (`Vec<Box<dyn Trait>>`) |

Phase Traits (18) đào sâu.

## Turbofish — explicit generic

```rust
let v = Vec::new();         // type ambiguous
let v = Vec::<i32>::new();   // explicit qua turbofish

let n: i32 = "42".parse().unwrap();
let n = "42".parse::<i32>().unwrap();    // turbofish
```

`::<T>` syntax — fish-shape `::<>`. Dùng khi compiler không infer được.

## `From` và `Into` — convert generic

```rust
impl From<i32> for f64 { ... }       // standard library

let n: i32 = 42;
let f: f64 = f64::from(n);            // From
let f: f64 = n.into();                 // Into — automatic via blanket impl
```

Phase 18 đào sâu.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `T` không có operator + | Add bound `T: Add` hoặc generic `T: Sum`. |
| Generic method nhiều trait param | Dùng `where` clause. |
| Method khác bound trên cùng struct | OK — separate `impl` blocks. |
| Forget turbofish khi inference fail | `::<>` chỉ định type. |
| Binary phình to vì nhiều mono | Acceptable trade. Dynamic dispatch nếu cần. |
| Generic dùng runtime check | KHÔNG — Rust compile-time check. |
| `Vec<T>` mix type | KHÔNG — Vec homogeneous. Dùng enum hoặc `Box<dyn Trait>`. |
| Recursive generic infinite | `Box<T>` cho recursion. |

## Tóm tắt bài 19

- Generic = abstract over type với `<T>`.
- Trait bound `T: TraitName` constraint. `where` clause clean cho nhiều bound.
- Struct, enum, function, method đều generic được.
- Monomorphization: compiler generate version cho mỗi type concrete → zero runtime cost.
- Generic (static dispatch) vs Trait Object (dynamic dispatch, `&dyn Trait`).
- Turbofish `::<T>` chỉ định type khi inference fail.

**Bài kế tiếp** → [Bài 20 (phase-12): Option và Result — null + exception thay thế](../phase-12-option-result/01-option-cot-loi.md)
