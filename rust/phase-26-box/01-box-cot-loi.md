# Bài 34: `Box<T>` — smart pointer cơ bản nhất

> `Box<T>` = heap allocation + automatic cleanup. Đơn giản nhất trong family smart pointer. Dùng cho: large data, recursive type, trait object, transfer ownership across function. Bài này dạy core uses.

## Box cơ bản

```rust
let b = Box::new(5);          // i32 on heap, b is pointer
println!("{}", b);             // 5 (auto-deref)
println!("{}", *b);            // 5 (explicit deref)
```

`Box::new(value)`:
1. Allocate heap.
2. Move `value` to heap.
3. Return `Box<T>` (pointer + automatic drop).

When `b` drops:
1. Drop value via heap pointer.
2. Free heap allocation.

Zero overhead beyond raw pointer + auto drop.

## Use case 1: Large data

```rust
struct BigStruct {
    data: [u8; 1_000_000],     // 1 MB on stack
}

fn main() {
    // Stack alloc — risky for large
    let big = BigStruct { data: [0; 1_000_000] };
    
    // Heap alloc — safe
    let big = Box::new(BigStruct { data: [0; 1_000_000] });
    
    // Pass by value cheap — only 8 bytes (pointer)
    process(big);
}

fn process(b: Box<BigStruct>) { /* ... */ }
```

Stack typically limited 1-8 MB. Large struct on stack → overflow. Box → heap.

## Use case 2: Recursive type

Without Box:
```rust
enum List {
    Cons(i32, List),                  // ERROR — infinite size
    Nil,
}
```

```text
error[E0072]: recursive type `List` has infinite size
```

Each `Cons` contains `List` → unbounded.

With Box:
```rust
enum List {
    Cons(i32, Box<List>),             // OK — Box is pointer, fixed size
    Nil,
}

fn main() {
    let list = List::Cons(1,
        Box::new(List::Cons(2,
            Box::new(List::Cons(3, Box::new(List::Nil))))));
}
```

`Box<List>` = 8 bytes (pointer), fixed. Cycle broken.

Common: linked list, tree, AST.

## Use case 3: Trait object — `Box<dyn Trait>`

```rust
trait Shape {
    fn area(&self) -> f64;
}

struct Circle { r: f64 }
struct Square { s: f64 }

impl Shape for Circle {
    fn area(&self) -> f64 { 3.14 * self.r * self.r }
}

impl Shape for Square {
    fn area(&self) -> f64 { self.s * self.s }
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Circle { r: 1.0 }),
        Box::new(Square { s: 2.0 }),
    ];
    
    for s in &shapes {
        println!("{}", s.area());
    }
}
```

Heterogeneous collection — different types implementing same trait.

`Vec<dyn Shape>` doesn't compile (unsized). `Vec<Box<dyn Shape>>` works.

## Use case 4: Return trait from fn

```rust
fn make_shape(kind: &str) -> Box<dyn Shape> {
    match kind {
        "circle" => Box::new(Circle { r: 1.0 }),
        "square" => Box::new(Square { s: 2.0 }),
        _ => panic!(),
    }
}
```

Different concrete return types from branches. Need `Box<dyn Shape>` or `impl Shape` (single type).

## Box methods

```rust
let b = Box::new(5);

let v: i32 = *b;                       // deref + move out
let r: &i32 = &*b;                      // borrow inner
let r: &i32 = &b;                       // auto-deref to &i32

let unboxed = Box::into_raw(b);        // → raw pointer (unsafe context)
// b consumed
```

`Box::into_raw` rare — for FFI.

## Move semantics

```rust
let b1 = Box::new(5);
let b2 = b1;                            // b1 moved to b2
// println!("{b1}");                     // ERROR — b1 moved
println!("{b2}");
```

Box itself moves like any owned type.

```rust
fn take(b: Box<i32>) -> i32 { *b }

let b = Box::new(42);
let n = take(b);                        // b moved into fn
// b unusable
```

## Drop trait — auto cleanup

```rust
struct Resource { id: u32 }

impl Drop for Resource {
    fn drop(&mut self) {
        println!("Releasing resource {}", self.id);
    }
}

fn main() {
    let r = Box::new(Resource { id: 1 });
}                                       // ← "Releasing resource 1"
```

When Box drops, inner value drops, then heap freed.

## Box vs other smart pointers

| | `Box<T>` | `Rc<T>` | `RefCell<T>` |
|---|---|---|---|
| Heap allocate | Yes | Yes | No (wraps T) |
| Multi-ownership | No | Yes (refcount) | No |
| Interior mutability | No | No | Yes |
| Thread-safe | Yes (if T is) | No | No |

Phase Cell/RefCell/Rc (27) đào sâu.

## When NOT use Box

- Small data: just use stack value.
- Single owner OK: don't need Rc.
- Static dispatch enough: use generic `<T: Trait>` not `Box<dyn Trait>`.

Box pays for: heap alloc (~50ns), pointer indirection. Usually negligible.

## Common patterns

### Builder return
```rust
fn build_handler() -> Box<dyn Fn(i32) -> i32> {
    Box::new(|x| x * 2)
}
```

### Recursive ADT (data type)
```rust
enum Expr {
    Num(f64),
    Add(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
}

fn eval(e: &Expr) -> f64 {
    match e {
        Expr::Num(n) => *n,
        Expr::Add(a, b) => eval(a) + eval(b),
        Expr::Mul(a, b) => eval(a) * eval(b),
    }
}
```

### Error type uniform
```rust
fn process() -> Result<(), Box<dyn std::error::Error>> {
    // any error type
}
```

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `Box<T>` for everything | Only when needed: recursion, dyn, large. |
| Move out of Box twice | Box content moves like T. Once. |
| `Box<dyn Trait>` heap alloc per item | OK for small N. Pool for hot path. |
| `Vec<dyn Trait>` direct | Sized error. Use `Vec<Box<dyn Trait>>`. |
| Box<Box<T>> | Usually unnecessary. Flatten. |
| FFI lifecycle | `Box::into_raw` / `Box::from_raw` careful pairing. |
| Memory layout assumption | Box = pointer, but layout opaque. |
| Clone Box<T> | Need `T: Clone`. Or use Rc. |

## Tóm tắt bài 34

- `Box<T>` = heap allocation + auto cleanup.
- Use cases: large data, recursive type, trait object, return polymorphic.
- `Box::new(value)` → move to heap, return owner pointer.
- Auto-deref: `*box`, methods on T via Box.
- Move semantics: own + transfer like any value.
- Trait object: `Box<dyn Trait>` for heterogeneous collection.
- Cost: heap alloc + pointer indirect — usually negligible.

**Bài kế tiếp** → [Bài 35 (phase-27): Cell, RefCell, Rc, OnceCell](../phase-27-cell-refcell-rc/01-rc-refcell-cot-loi.md)
