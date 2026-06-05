# Bài 26: Traits — interface và polymorphism Rust style

> Trait = "interface" của Rust nhưng mạnh hơn. Define behavior shared across types. Phase này dạy define trait, implement, default method, trait bound, common derive, và `impl Trait`/`dyn Trait`.

## Define trait

```rust
trait Animal {
    fn name(&self) -> String;
    fn sound(&self) -> String;
    
    fn introduce(&self) -> String {            // default method
        format!("I am {} and I say {}", self.name(), self.sound())
    }
}
```

`trait Name { methods }`. Method có thể chỉ signature (abstract) hoặc có default body.

## Implement trait

```rust
struct Dog { name: String }
struct Cat { name: String }

impl Animal for Dog {
    fn name(&self) -> String { self.name.clone() }
    fn sound(&self) -> String { String::from("Woof") }
}

impl Animal for Cat {
    fn name(&self) -> String { self.name.clone() }
    fn sound(&self) -> String { String::from("Meow") }
    
    fn introduce(&self) -> String {            // override default
        format!("{} (cat) says meow", self.name)
    }
}

fn main() {
    let d = Dog { name: String::from("Rex") };
    let c = Cat { name: String::from("Whiskers") };
    
    println!("{}", d.introduce());       // I am Rex and I say Woof
    println!("{}", c.introduce());       // Whiskers (cat) says meow
}
```

`impl TraitName for Type { ... }`. Mỗi type tự define behavior.

## Common standard traits

### `Debug` — `{:?}` print
```rust
#[derive(Debug)]
struct Point { x: f64, y: f64 }

println!("{:?}", point);
```

### `Display` — `{}` print
```rust
impl std::fmt::Display for Point {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

println!("{}", point);
```

`Display` cho user-facing. `Debug` cho dev. **Không derive Display** — phải implement.

### `Clone` — deep copy
```rust
#[derive(Clone)]
struct Config { /* ... */ }

let copy = config.clone();
```

### `Copy` — implicit copy
```rust
#[derive(Copy, Clone)]
struct Point2D { x: f64, y: f64 }       // chỉ struct toàn Copy field

let p1 = Point2D { x: 1.0, y: 2.0 };
let p2 = p1;                              // implicit copy, p1 vẫn dùng
```

`Copy` require `Clone`. Auto-trait.

### `PartialEq`, `Eq` — equality
```rust
#[derive(PartialEq, Eq)]
struct Id(u64);

if a == b { ... }
```

`Eq` stricter (reflexive). Float không `Eq` (NaN != NaN).

### `PartialOrd`, `Ord` — ordering
```rust
#[derive(PartialOrd, Ord, PartialEq, Eq)]
struct Score(u32);

if a > b { ... }
```

### `Hash` — HashMap key
```rust
#[derive(Hash, PartialEq, Eq)]
struct UserId(u64);
```

### `Default`
```rust
#[derive(Default)]
struct Config { count: u32, name: String }

let c = Config::default();        // count: 0, name: ""
```

### `From` / `Into` — type conversion
```rust
struct Celsius(f64);
struct Fahrenheit(f64);

impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self {
        Fahrenheit(c.0 * 9.0 / 5.0 + 32.0)
    }
}

let c = Celsius(100.0);
let f: Fahrenheit = c.into();          // auto Into via blanket impl
```

Implement `From`, get `Into` free.

## Trait bound — function generic với behavior

```rust
fn announce<T: std::fmt::Display>(item: T) {
    println!("Item: {item}");
}

fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}
```

`T: Trait` — constraint. Type implement trait mới dùng được.

### Multiple bounds + where clause

```rust
fn print<T: std::fmt::Display + Clone>(x: T) { ... }

fn complex<T, U>(x: T, y: U) -> String
where
    T: std::fmt::Display + Clone,
    U: std::fmt::Debug,
{
    format!("{x} {y:?}")
}
```

## `impl Trait` syntax — sugar

```rust
fn make_displayable() -> impl std::fmt::Display {
    "hello"
}

fn process(x: impl Iterator<Item = i32>) {
    for n in x { println!("{n}"); }
}
```

`impl Trait` = "some type implementing Trait". Return type opaque, param compact.

## `dyn Trait` — dynamic dispatch

```rust
fn print_all(items: &[Box<dyn std::fmt::Display>]) {
    for item in items {
        println!("{item}");
    }
}

fn main() {
    let items: Vec<Box<dyn std::fmt::Display>> = vec![
        Box::new(42),
        Box::new("hello"),
        Box::new(3.14),
    ];
    print_all(&items);
}
```

`Box<dyn Trait>` = trait object — runtime dispatch, heterogeneous collection.

## `impl Trait` vs `dyn Trait`

| | `impl Trait` | `dyn Trait` |
|---|---|---|
| Dispatch | Static (compile) | Dynamic (runtime) |
| Speed | Faster | Slower (vtable) |
| Binary size | Lớn (mono) | Nhỏ |
| Heterogeneous | Không | Có |
| Stored in struct | Không trivial | `Box<dyn Trait>` field |

Prefer `impl Trait` cho generic param/return. `dyn Trait` cho heterogeneous collection.

## Trait inheritance

```rust
trait Animal {
    fn name(&self) -> String;
}

trait Pet: Animal {                      // Pet : Animal
    fn owner(&self) -> String;
}
```

Implement `Pet` → also implement `Animal`.

## Associated type

```rust
trait Iterator {
    type Item;                          // associated type
    
    fn next(&mut self) -> Option<Self::Item>;
}

struct Counter { count: u32 }

impl Iterator for Counter {
    type Item = u32;
    
    fn next(&mut self) -> Option<u32> {
        self.count += 1;
        if self.count < 6 { Some(self.count) } else { None }
    }
}
```

Mỗi impl chọn 1 type concrete cho `Item`. Cleaner than generic param.

## Orphan rule

```rust
// OK: own trait, any type
impl MyTrait for i32 { ... }

// OK: stdlib trait, own type
impl Display for MyType { ... }

// ERROR: stdlib trait, stdlib type
impl Display for i32 { ... }       // không own — không impl
```

"At least one of (trait, type) must be local to crate" — prevent conflicts across crates.

Workaround: newtype.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `Display` derive | Không derive được — implement manual. |
| Trait method conflict | Disambiguate: `<Type as Trait>::method()`. |
| Generic with no bound | Default `Sized`. Add `+ ?Sized` for trait object. |
| Object-safe error | Method với `Self` return / generic không object-safe. Phase 27. |
| Orphan rule fail | Newtype wrap. |
| `Box<dyn Trait>` size | Heap alloc + vtable. Cost. |
| Default method use missing field | Default method dùng được method khác trait, not field. |
| Forget `impl` block | `trait Foo {}` không implement automatically. |

## Tóm tắt bài 26

- `trait Name { fn method(&self); }` define interface.
- `impl Trait for Type` implement.
- Default method có body trong trait.
- `#[derive(Debug, Clone, ...)]` auto-implement common traits.
- Display vs Debug, PartialEq vs Eq, Copy vs Clone — phân biệt.
- `T: Trait` bound. `where` clause cho nhiều.
- `impl Trait` static, `dyn Trait` dynamic. Trade speed vs size.
- Orphan rule: own trait OR own type cho impl.

**Bài kế tiếp** → [Bài 27 (phase-19): Lifetimes — explicit borrow tracking](../phase-19-lifetimes/01-lifetime-cot-loi.md)
