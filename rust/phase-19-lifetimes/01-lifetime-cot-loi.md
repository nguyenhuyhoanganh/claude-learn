# Bài 27: Lifetimes — explicit borrow tracking

> Borrow checker bảo vệ bạn khỏi dangling reference. Đôi khi nó cần **hint** từ developer — đó là lifetime annotation. Bài này dạy `'a` syntax, lifetime elision rules, và struct chứa reference.

## Vấn đề Rust solve

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() { x } else { y }
}
```

```text
error[E0106]: missing lifetime specifier
```

Compiler không biết: returned `&str` reference đến `x` hay `y`? Borrow scope tới đâu?

Sửa:
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

`'a` = lifetime parameter. Đọc: "function lấy `x` và `y` cùng lifetime `'a`, return reference cũng `'a`".

## Lifetime annotation syntax

```rust
&i32           // reference
&'a i32        // reference with lifetime 'a
&'a mut i32    // mutable reference with lifetime 'a
```

`'a` là **name** — convention 1 chữ cái lowercase với apostrophe.

## Khi nào cần annotate

```rust
// Trường hợp 1: input multi reference, return reference
fn first<'a>(s: &'a str, _other: &str) -> &'a str { s }

// Trường hợp 2: struct chứa reference
struct Parser<'a> {
    source: &'a str,
}
```

Compiler **không infer** — phải explicit khi:
- Function return reference tied to specific param.
- Struct/enum field là reference.
- Method return reference khác `&self`.

## Lifetime elision rules

Rust auto-infer trong common cases — không cần annotate.

### Rule 1: Each input ref → own lifetime

```rust
fn foo(x: &str)                  → fn foo<'a>(x: &'a str)
fn bar(x: &str, y: &str)         → fn bar<'a, 'b>(x: &'a str, y: &'b str)
```

### Rule 2: If 1 input lifetime → output gets same

```rust
fn foo(x: &str) -> &str          → fn foo<'a>(x: &'a str) -> &'a str
```

### Rule 3: Method có `&self` → output gets self lifetime

```rust
fn method(&self, other: &str) -> &str
→ fn method<'a, 'b>(&'a self, other: &'b str) -> &'a str
```

Rules cover ~80% case. Còn lại phải explicit.

## Struct chứa reference

```rust
struct Parser<'a> {
    source: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(s: &'a str) -> Self {
        Parser { source: s, pos: 0 }
    }
    
    fn rest(&self) -> &'a str {
        &self.source[self.pos..]
    }
}

fn main() {
    let text = String::from("hello world");
    let p = Parser::new(&text);
    println!("{}", p.rest());
    // text phải sống ít nhất bằng p
}
```

Struct lifetime constraint: instance không thể outlive reference inside.

## Multiple lifetime — different scopes

```rust
struct Parser<'a, 'b> {
    source: &'a str,
    filename: &'b str,
}
```

2 reference different lifetime. Hữu ích khi 2 ref có ownership khác nhau.

### Constraint: `'a: 'b`

```rust
fn foo<'a, 'b>(x: &'a str, y: &'b str) -> &'b str
where
    'a: 'b,                               // 'a outlives 'b
{
    if x.len() > y.len() { x } else { y }
}
```

`'a: 'b` = "lifetime 'a outlives 'b". Sometimes needed.

## `'static` lifetime

```rust
let s: &'static str = "hello world";        // string literal
```

`'static` = lives entire program.

Common usage:
- String literals.
- Constants `const X: &str = "..."`.
- Spawned threads: `std::thread::spawn(|| { ... })` requires `'static`.

```rust
fn make_static() -> &'static str {
    "hardcoded"            // OK — literal is 'static
}

fn make_local() -> &'static str {
    let s = String::from("...");
    &s                                       // ERROR — s drop, not static
}
```

## Lifetime trong impl

```rust
struct Wrapper<'a> {
    data: &'a [i32],
}

impl<'a> Wrapper<'a> {
    fn new(data: &'a [i32]) -> Self {
        Wrapper { data }
    }
    
    fn sum(&self) -> i32 {
        self.data.iter().sum()
    }
}
```

`impl<'a> Wrapper<'a>` — declare `'a` once at impl block.

## Trait + lifetime

```rust
trait Source<'a> {
    fn get(&self) -> &'a str;
}

impl<'a> Source<'a> for &'a str {
    fn get(&self) -> &'a str {
        self
    }
}
```

Trait with lifetime parameter. Phase 21/27 may revisit.

## Common patterns

### Builder with reference
```rust
struct Builder<'a> {
    name: Option<&'a str>,
}

impl<'a> Builder<'a> {
    fn new() -> Self { Builder { name: None } }
    fn name(mut self, n: &'a str) -> Self {
        self.name = Some(n);
        self
    }
}
```

### Iterator with reference
```rust
struct Tokenizer<'a> {
    rest: &'a str,
}

impl<'a> Iterator for Tokenizer<'a> {
    type Item = &'a str;
    fn next(&mut self) -> Option<&'a str> { ... }
}
```

Common for parser/lexer.

## When to clone vs annotate

```rust
// Option A: lifetime annotation
struct Parser<'a> { source: &'a str }

// Option B: owned String
struct Parser { source: String }
```

**Option A** (reference): saves memory, no copy. Lifetime constraint.
**Option B** (owned): simpler, more flexible. Costs clone.

For learning: prefer Option B. For perf-critical: Option A.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Return ref from local variable | Local drop. Return owned hoặc take from param. |
| `'a` không declared trong impl | `impl<'a> Type<'a>` declare first. |
| Multiple lifetime nhưng compiler suggest one | Single lifetime simpler — accept. |
| `'static` everywhere | Wrong concept. Use only for literal/const. |
| Lifetime in fn arg `<'a, 'b>` complex | Try eliding first, add only when needed. |
| Self-referential struct | Hard. Use `Pin`, or external `ouroboros` crate. |
| Lifetime mismatch in trait | Lifetime variance — advanced. |
| Compiler error "borrow may not live long enough" | Check scope — value drop before ref used. |

## Tóm tắt bài 27

- `'a` = lifetime parameter, name with apostrophe.
- 3 elision rules cover most cases.
- Explicit when: multi-param return ref, struct field ref, method ref khác `&self`.
- `'static` = entire program. Use for literal, const.
- Struct with ref needs `<'a>` declaration.
- Trade owned (simple) vs ref (efficient) per use case.
- Compiler error messages helpful — read carefully.

**Bài kế tiếp** → [Bài 28 (phase-20): Closures — functional value capture environment](../phase-20-closures/01-closure-cot-loi.md)
