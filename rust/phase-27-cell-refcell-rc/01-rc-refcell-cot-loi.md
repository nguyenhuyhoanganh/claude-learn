# Bài 35: Rc, Cell, RefCell, OnceCell — multi-ownership + interior mutability

> Borrow checker chặt — đôi khi cần "lách". `Rc<T>` cho multi-owner. `RefCell<T>` cho mutate qua immutable ref. `OnceCell` cho lazy init. Bài cuối phase concept — production patterns dùng nhiều.

## `Rc<T>` — reference counting

```rust
use std::rc::Rc;

let a = Rc::new(String::from("hello"));
let b = Rc::clone(&a);
let c = a.clone();                // alternative syntax

println!("count: {}", Rc::strong_count(&a));    // 3
```

`Rc::clone` cheap — increment refcount, not deep copy. Free when count = 0.

### When use Rc

```rust
struct Node {
    value: i32,
    children: Vec<Rc<Node>>,         // shared children
}
```

Tree where node may have multiple parents — Rc.

### `Rc` is single-thread only

Cross-thread → `Arc<T>` (atomic reference count). Same API, slower (atomic ops). Phase Concurrency course.

## `Cell<T>` — interior mutability for Copy

```rust
use std::cell::Cell;

struct Counter {
    count: Cell<u32>,
}

impl Counter {
    fn increment(&self) {            // &self (not &mut)!
        let old = self.count.get();
        self.count.set(old + 1);
    }
}

fn main() {
    let c = Counter { count: Cell::new(0) };
    c.increment();
    c.increment();
    println!("{}", c.count.get());   // 2
}
```

`Cell<T>` lets mutate inside `&Counter` (immutable ref). T must be `Copy`.

Method: `get()`, `set(val)`, `replace(val)`, `take()`.

## `RefCell<T>` — interior mutability for non-Copy

```rust
use std::cell::RefCell;

let cell = RefCell::new(vec![1, 2, 3]);

// Read borrow
{
    let v = cell.borrow();           // Ref<Vec<i32>>
    println!("{:?}", *v);
}

// Mutate
{
    let mut v = cell.borrow_mut();   // RefMut<Vec<i32>>
    v.push(4);
}

println!("{:?}", cell.borrow());     // [1, 2, 3, 4]
```

### Runtime borrow check

```rust
let cell = RefCell::new(5);

let r1 = cell.borrow();
let r2 = cell.borrow_mut();          // PANIC at runtime!
```

```text
thread panicked at 'already borrowed: BorrowMutError'
```

Borrow rules **shifted from compile to runtime**. Trade compile safety for flexibility.

### `try_borrow*`

```rust
match cell.try_borrow_mut() {
    Ok(mut v) => *v += 1,
    Err(_) => println!("already borrowed"),
}
```

Non-panic version.

## Common pattern: `Rc<RefCell<T>>`

Multi-owner + mutable:

```rust
use std::rc::Rc;
use std::cell::RefCell;

let shared = Rc::new(RefCell::new(vec![1, 2, 3]));

let a = Rc::clone(&shared);
let b = Rc::clone(&shared);

a.borrow_mut().push(4);
b.borrow_mut().push(5);

println!("{:?}", shared.borrow());      // [1, 2, 3, 4, 5]
```

Used for: observer pattern, shared mutable state in single-thread, graph with cycles (use Weak for back-edge).

## `Weak<T>` — non-owning Rc

Cycle problem:
```rust
struct Node {
    value: i32,
    parent: Rc<Node>,           // strong ref to parent
    children: Vec<Rc<Node>>,
}
```

Parent → children, children → parent. Refcount never 0. Memory leak.

Fix:
```rust
use std::rc::{Rc, Weak};

struct Node {
    value: i32,
    parent: RefCell<Weak<Node>>,        // weak — doesn't count
    children: RefCell<Vec<Rc<Node>>>,
}
```

`Weak<T>` doesn't prevent drop. Access via `.upgrade()` → `Option<Rc<T>>`.

```rust
if let Some(parent) = node.parent.borrow().upgrade() {
    println!("parent value: {}", parent.value);
}
```

## `OnceCell<T>` — initialize once

```rust
use std::cell::OnceCell;

struct Config {
    db_url: OnceCell<String>,
}

impl Config {
    fn db_url(&self) -> &str {
        self.db_url.get_or_init(|| {
            std::env::var("DB_URL").unwrap_or_else(|_| "default".to_string())
        })
    }
}
```

`get_or_init(closure)` initialize lazily. Subsequent calls return cached.

Single-thread only. Multi-thread: `OnceCell` from `once_cell` crate (or `std::sync::OnceLock`).

### `LazyCell` — Rust 1.80+

```rust
use std::cell::LazyCell;

let expensive: LazyCell<HashMap<String, i32>> = LazyCell::new(|| {
    let mut m = HashMap::new();
    // expensive setup
    m
});

println!("{:?}", expensive.get("key"));      // compute on first access
```

Combine OnceCell + closure. Auto-init on first access.

## Comparison

| | Mut via &self? | Multi-owner? | Compile check? |
|---|---|---|---|
| `&T` | No | No | Yes |
| `&mut T` | Yes | No | Yes |
| `Rc<T>` | No | Yes | Yes |
| `Cell<T>` (Copy) | Yes | No | No (runtime) |
| `RefCell<T>` | Yes | No | No (runtime) |
| `Rc<RefCell<T>>` | Yes | Yes | No (runtime) |
| `Box<T>` | No (owner) | No | Yes |

Compile-time check ideal. Runtime check (RefCell) when borrow checker too strict.

## Production patterns

### Observer
```rust
type Listeners = Rc<RefCell<Vec<Box<dyn Fn(i32)>>>>;

struct EventBus {
    listeners: Listeners,
}

impl EventBus {
    fn subscribe(&self, f: Box<dyn Fn(i32)>) {
        self.listeners.borrow_mut().push(f);
    }
    
    fn emit(&self, value: i32) {
        for f in self.listeners.borrow().iter() {
            f(value);
        }
    }
}
```

### Lazy global
```rust
use std::cell::OnceCell;

thread_local! {
    static CONFIG: OnceCell<Config> = OnceCell::new();
}

fn config() -> &'static Config {
    CONFIG.with(|cell| {
        cell.get_or_init(load_config)
    })
}
```

For real global (cross-thread), use `std::sync::OnceLock` instead.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Forget Rc::clone, use .clone() | Both work. `Rc::clone` clear intent. |
| RefCell borrow + borrow_mut | Runtime panic. Reduce scope. |
| Cycle leak with Rc | Use Weak for back-edge. |
| Cell with non-Copy | Use RefCell. |
| Multi-thread with Rc | Use Arc + Mutex instead. |
| Excessive RefCell | Refactor — may indicate design issue. |
| Deref multiple level | `&**rc_box` etc — auto often works. |
| OnceCell init twice | Second call no-op. Return existing. |

## Tóm tắt bài 35

- `Rc<T>`: shared ownership single-thread. Refcount.
- `Cell<T>` (Copy types): mutate inside `&self`, runtime no check needed.
- `RefCell<T>` (any types): mutate inside `&self`, runtime borrow check, panic on violation.
- `Rc<RefCell<T>>`: combine — shared mutable single-thread.
- `Weak<T>`: non-owning Rc, breaks cycles.
- `OnceCell` / `LazyCell`: lazy init, immutable after.
- Multi-thread: `Arc`, `Mutex`, `OnceLock`. Separate chapter.

**Bài kế tiếp** → [Bài 36 (phase-28): Tổng kết khoá học](../phase-28-congratulations/01-tong-ket.md)
