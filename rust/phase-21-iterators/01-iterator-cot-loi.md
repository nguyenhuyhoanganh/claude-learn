# Bài 29: Iterators — pipeline functional, zero-cost

> Iterator chain `.iter().filter(...).map(...).collect()` đọc tự nhiên + compiler optimize đến mức ngang loop thủ công. Đây là một trong feature **đẹp nhất** của Rust. Bài này dạy trait `Iterator`, adapter vs consumer, lazy evaluation.

## Iterator trait

```rust
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
}
```

Có `next()` → là iterator. Cực tối giản nhưng đủ build pipeline phức tạp.

## Create iterator

```rust
let v = vec![1, 2, 3];

let iter = v.iter();              // Iterator<Item = &i32>
let iter = v.iter_mut();          // Iterator<Item = &mut i32>
let iter = v.into_iter();         // Iterator<Item = i32>

// From range
let iter = 1..5;                   // 1, 2, 3, 4

// From array
let iter = [1, 2, 3].iter();

// From hashmap
let m: HashMap<&str, i32> = ...;
let iter = m.iter();               // Iterator<Item = (&&str, &i32)>
```

## Adapters — lazy transform

```rust
let v = vec![1, 2, 3, 4, 5];

let result: Vec<i32> = v.iter()
    .map(|x| x * 2)              // adapter
    .filter(|x| *x > 4)           // adapter
    .collect();                   // consumer
```

Adapters **lazy** — không chạy gì cho đến khi consumer trigger.

### Common adapters

```rust
v.iter().map(|x| x + 1)           // transform
v.iter().filter(|x| **x > 0)      // keep matching
v.iter().filter_map(|x| if *x > 0 { Some(*x * 2) } else { None })

v.iter().enumerate()              // (index, value)
v.iter().zip(other.iter())         // pair items
v.iter().chain(other.iter())       // concatenate
v.iter().rev()                     // reverse (need DoubleEndedIterator)

v.iter().take(3)                   // first 3
v.iter().skip(2)                   // skip first 2
v.iter().step_by(2)                // every 2nd

v.iter().peekable()                // can peek next without consume
v.iter().inspect(|x| println!("seen {x}")) // debug
```

## Consumers — terminate chain

```rust
let v = vec![1, 2, 3, 4, 5];

v.iter().sum::<i32>();             // 15
v.iter().product::<i32>();          // 120
v.iter().max();                     // Some(&5)
v.iter().min();                     // Some(&1)
v.iter().count();                   // 5
v.iter().last();                    // Some(&5)
v.iter().nth(2);                    // Some(&3)

v.iter().all(|x| *x > 0);          // true — all match
v.iter().any(|x| *x > 4);          // true — at least 1
v.iter().find(|x| **x > 2);        // Some(&3) — first match
v.iter().position(|x| *x == 3);    // Some(2) — index

let sum: i32 = v.iter().fold(0, |acc, x| acc + x);   // 15
let v2: Vec<i32> = v.iter().copied().collect();      // collect
```

`collect()` quan trọng nhất — gather into collection.

## `collect` with turbofish

```rust
let s: String = v.iter().map(|x| x.to_string()).collect();
let v: Vec<i32> = (1..=5).collect();
let m: HashMap<i32, i32> = vec![(1, 2), (3, 4)].into_iter().collect();

// Type ambiguous — turbofish
let s = (1..=5).map(|x| x.to_string()).collect::<Vec<String>>();
```

Different collect target via type hint.

## Iterator chains realistic

```rust
let words = vec!["hello", "world", "foo", "bar", "baz"];

// Sum lengths
let total: usize = words.iter().map(|w| w.len()).sum();   // 18

// Vec of (word, len)
let pairs: Vec<(&&str, usize)> = words.iter()
    .map(|w| (w, w.len()))
    .collect();

// Find shortest
let shortest = words.iter().min_by_key(|w| w.len());   // Some(&"foo") (3)

// First long word
let long = words.iter().find(|w| w.len() > 4);          // Some(&"hello")

// Group by length
let by_len: HashMap<usize, Vec<&&str>> = words.iter()
    .fold(HashMap::new(), |mut acc, w| {
        acc.entry(w.len()).or_insert_with(Vec::new).push(w);
        acc
    });
```

## Zero-cost — same speed as loop

```rust
// Iterator
let sum: i32 = (1..=1_000_000).sum();

// Manual loop
let mut sum = 0i64;
for i in 1..=1_000_000 {
    sum += i;
}
```

Compiler optimize iterator chain → assembly equivalent loop manual. Often **better** vì vectorization opportunity rõ hơn.

## Custom iterator

```rust
struct Fibonacci {
    a: u64,
    b: u64,
}

impl Iterator for Fibonacci {
    type Item = u64;
    
    fn next(&mut self) -> Option<u64> {
        let next = self.a;
        self.a = self.b;
        self.b = next + self.b;
        Some(next)
    }
}

fn main() {
    let fib = Fibonacci { a: 0, b: 1 };
    let first_10: Vec<u64> = fib.take(10).collect();
    println!("{:?}", first_10);
    // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
}
```

Implement `Iterator` → free access all adapters/consumers.

## IntoIterator trait

```rust
trait IntoIterator {
    type Item;
    type IntoIter: Iterator<Item = Self::Item>;
    fn into_iter(self) -> Self::IntoIter;
}
```

Loops use this:
```rust
for x in collection { ... }     // calls collection.into_iter()
```

Vec implement `IntoIterator`:
- `Vec<T>` → owned items.
- `&Vec<T>` → `&T` items.
- `&mut Vec<T>` → `&mut T` items.

3 lifetime variants automatic.

## Iterator trong loop

```rust
let v = vec![1, 2, 3];

for x in &v {              // borrow
    println!("{x}");
}

for x in v.iter() {         // explicit borrow
    println!("{x}");
}

for x in v {                // consume
    println!("{x}");
}
// v unusable after
```

`for x in collection` = `for x in collection.into_iter()`.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Chain không collect → no execute | Lazy. Add `.collect()`, `.sum()`, `.for_each()`. |
| `.iter()` vs `.into_iter()` confusion | iter borrows, into_iter consumes. |
| Filter without dereference | Pattern: `.filter(\|x\| *x > 0)` for `&i32`. |
| Collect into wrong type | Turbofish or annotate. |
| `clone()` excessively in chain | Use `.copied()` for Copy types. |
| Reverse non-DoubleEndedIterator | Some iterators forward-only. |
| `fold` complexity | Many cases simpler: sum, max, collect. |
| `flat_map` confusing | Equivalent map + flatten. Used for nested. |

## Tóm tắt bài 29

- Iterator: trait với `next() -> Option<Item>`.
- Create: `.iter()`, `.iter_mut()`, `.into_iter()`, range `a..b`.
- Adapter (lazy): `map`, `filter`, `enumerate`, `zip`, `take`, `skip`, `rev`.
- Consumer: `collect`, `sum`, `count`, `find`, `fold`, `any`, `all`.
- `collect::<Type>()` turbofish for target type.
- Zero-cost: optimize to manual loop speed.
- Custom: implement `Iterator::next()`, get all adapters free.

**Bài kế tiếp** → [Bài 30 (phase-22): Testing — unit, integration, doc tests](../phase-22-testing/01-testing-cot-loi.md)
