# Bài 28: Closures — anonymous functions capture environment

> Closure = function inline + capture biến từ scope chứa nó. Quan trọng cho iterator chains, callback, event handlers. Bài này dạy syntax, 3 trait Fn/FnMut/FnOnce, capture rules.

## Closure syntax

```rust
let add = |a, b| a + b;
println!("{}", add(2, 3));     // 5

let greet = |name: &str| println!("Hello, {name}!");
greet("Alice");

// Multi-line body
let process = |x: i32| {
    let doubled = x * 2;
    let plus_one = doubled + 1;
    plus_one
};
println!("{}", process(5));    // 11
```

`|params| expression` or `|params| { block }`.

### Compared to fn

```rust
fn add_fn(a: i32, b: i32) -> i32 { a + b }
let add_cl = |a, b| a + b;
```

Closure infer types từ usage. Có thể annotate explicit nếu cần.

## Capture environment

```rust
let multiplier = 3;
let multiply = |x| x * multiplier;    // capture multiplier
println!("{}", multiply(5));           // 15
```

Closure "see" variables in enclosing scope. Function (`fn`) không capture được.

## 3 trait — Fn, FnMut, FnOnce

Rust capture biến theo 1 trong 3 cách:

### `Fn` — capture by reference (read-only)

```rust
let name = String::from("Alice");
let greet = || println!("Hi, {name}");    // borrow &name
greet();
greet();                                   // multi call OK
println!("{name}");                        // still usable
```

### `FnMut` — capture by mutable reference

```rust
let mut count = 0;
let mut increment = || count += 1;         // borrow &mut count
increment();
increment();
println!("{count}");                       // 2
```

### `FnOnce` — capture by value (move)

```rust
let name = String::from("Alice");
let consume = move || println!("Hi, {name}");  // move name in
consume();
// consume();                              // error if name not Copy
```

`move` keyword force capture by value.

### Trait hierarchy
```text
FnOnce            ← all closures
  └─ FnMut        ← if no consume
       └─ Fn      ← if no mutate
```

Most permissive = `Fn`. Most restrictive = `FnOnce` (consumes captured).

## Function param: take closure

```rust
fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(x)
}

fn apply_twice<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(f(x))
}

fn main() {
    let double = |x| x * 2;
    println!("{}", apply(double, 5));          // 10
    println!("{}", apply_twice(double, 5));    // 20
}
```

`F: Fn(i32) -> i32` = "F is callable with i32 returning i32".

### Choose Fn / FnMut / FnOnce

```rust
fn apply_fn<F: Fn()>(f: F) { f(); f(); }              // multi call, read-only
fn apply_mut<F: FnMut()>(mut f: F) { f(); f(); }      // multi call, mutate
fn apply_once<F: FnOnce()>(f: F) { f(); }             // single call, consume
```

## Return closure

```rust
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}

fn main() {
    let add5 = make_adder(5);
    println!("{}", add5(10));      // 15
    println!("{}", add5(20));      // 25
}
```

`impl Fn(...) -> ...` return type. `move` capture `n` by value.

### `Box<dyn Fn>` — dynamic closure

```rust
fn make_op(op: char) -> Box<dyn Fn(i32, i32) -> i32> {
    match op {
        '+' => Box::new(|a, b| a + b),
        '-' => Box::new(|a, b| a - b),
        '*' => Box::new(|a, b| a * b),
        _ => Box::new(|_, _| 0),
    }
}
```

Return different closures from branches → `Box<dyn Fn>`.

## Iterator + closure

Closure shine với iterator:

```rust
let nums = vec![1, 2, 3, 4, 5];

let sum: i32 = nums.iter().sum();                          // 15
let doubled: Vec<i32> = nums.iter().map(|x| x * 2).collect();
let evens: Vec<&i32> = nums.iter().filter(|x| *x % 2 == 0).collect();
let max = nums.iter().max();                                // Some(&5)

let count = nums.iter().filter(|x| **x > 2).count();        // 3
```

Phase Iterators (21) đào sâu chain.

## Common patterns

### Sort with closure
```rust
let mut nums = vec![3, 1, 4, 1, 5, 9, 2, 6];
nums.sort_by(|a, b| b.cmp(a));         // descending
```

### Conditional logic
```rust
fn process<F: Fn(i32) -> bool>(items: &[i32], filter: F) -> Vec<i32> {
    items.iter().copied().filter(|&x| filter(x)).collect()
}

let evens = process(&[1, 2, 3, 4], |x| x % 2 == 0);
```

### Event handler
```rust
struct Button {
    on_click: Box<dyn Fn()>,
}

impl Button {
    fn new<F: Fn() + 'static>(handler: F) -> Self {
        Button { on_click: Box::new(handler) }
    }
    
    fn click(&self) {
        (self.on_click)();
    }
}

let mut count = 0;
let btn = Button::new(move || println!("clicked!"));
btn.click();
```

## Closure vs function pointer

```rust
fn fn_ptr(x: i32) -> i32 { x + 1 }

fn take_fn(f: fn(i32) -> i32) -> i32 { f(5) }
fn take_closure<F: Fn(i32) -> i32>(f: F) -> i32 { f(5) }

take_fn(fn_ptr);                              // OK
take_fn(|x| x + 1);                           // OK if no capture

let n = 1;
// take_fn(|x| x + n);                        // ERROR — captures
take_closure(|x| x + n);                      // OK
```

`fn(...)` = function pointer, no capture. `Fn`/`FnMut`/`FnOnce` = closure, may capture.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Capture by reference rồi modify | Use `FnMut` and `mut` closure. |
| Capture mut value double | Borrow rules apply. |
| Return closure capturing local | Add `move` keyword. |
| `Fn` vs `FnMut` mismatch | Choose trait by behavior. |
| Boxed closure overhead | OK for callback. Generic for hot path. |
| Lifetime in closure return type | `impl Fn(i32) -> i32 + '_` lifetime hint. |
| `move` move ownership unexpectedly | Use `&` borrow inside closure. |
| Recursive closure | Hard. Wrap in struct. |

## Tóm tắt bài 28

- Closure `|params| body` — anonymous function capture environment.
- 3 traits: `Fn` (read), `FnMut` (modify), `FnOnce` (consume).
- `move` keyword force capture by value.
- Function param: `F: Fn(...) -> ...`.
- Return: `impl Fn(...) -> ...` or `Box<dyn Fn(...) -> ...>`.
- Used heavily with iterator chains.
- Closure ≠ function pointer (`fn`) — closure can capture.

**Bài kế tiếp** → [Bài 29 (phase-21): Iterators — pipeline functional](../phase-21-iterators/01-iterator-cot-loi.md)
