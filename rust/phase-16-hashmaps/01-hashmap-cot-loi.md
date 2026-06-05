# Bài 24: HashMap — key-value lookup O(1)

> Khi cần "tìm value theo key" → `HashMap<K, V>`. Average O(1) insert/get/remove. Rust HashMap khác Python `dict` ở 2 điểm: ownership rules vẫn áp dụng, và default hasher slower but secure (DoS resistant). Bài này dạy create, access, common patterns.

## Create HashMap

```rust
use std::collections::HashMap;

let mut scores: HashMap<String, i32> = HashMap::new();
scores.insert(String::from("Alice"), 90);
scores.insert(String::from("Bob"), 85);

// From iterator
let scores: HashMap<&str, i32> = HashMap::from([
    ("Alice", 90),
    ("Bob", 85),
]);

// Pre-allocate
let mut h: HashMap<i32, String> = HashMap::with_capacity(100);
```

`HashMap` ở `std::collections` — phải `use`.

## Access

```rust
let score = scores.get("Alice");                // Option<&i32>
match score {
    Some(&s) => println!("Alice: {s}"),
    None => println!("no Alice"),
}

// Or with default
let s = scores.get("Alice").copied().unwrap_or(0);
```

`get(&key)` trả `Option<&V>` — handle case key không tồn tại.

### `entry` API — common pattern

```rust
let mut counts: HashMap<&str, i32> = HashMap::new();

for word in ["a", "b", "a", "c", "a", "b"] {
    *counts.entry(word).or_insert(0) += 1;
}

// counts = {"a": 3, "b": 2, "c": 1}
```

`entry(key)` returns `Entry`:
- `.or_insert(default)` — insert if absent, returns `&mut V`.
- `.or_insert_with(|| compute())` — lazy default.
- `.and_modify(|v| ...).or_insert(...)` — modify if exists else insert.

Idiom cho counter, accumulator.

## Iterate

```rust
for (key, value) in &scores {
    println!("{key}: {value}");
}

// Keys only
for key in scores.keys() {
    println!("{key}");
}

// Values only
for value in scores.values() {
    println!("{value}");
}

// Mutable values
for value in scores.values_mut() {
    *value += 10;
}
```

**Order không deterministic** — HashMap không guarantee order. `BTreeMap` sorted nếu cần.

## Remove + Update

```rust
scores.remove("Alice");                          // Option<i32>
scores.insert("Alice".to_string(), 95);          // overwrite existing
```

`insert` return `Option<V>`:
- `None` nếu key mới.
- `Some(old_value)` nếu replace.

## Ownership

```rust
let key = String::from("Alice");
let value = 90;

scores.insert(key, value);
// key moved into map — không dùng được nữa
// value (i32) copy — vẫn dùng được
```

Key + value MOVE vào map (nếu không Copy type). Cleanup: map drop → entries drop.

### Reference key

```rust
let mut m: HashMap<&str, i32> = HashMap::new();

let name = String::from("Alice");
m.insert(&name, 90);
// name vẫn own — m chỉ borrow

drop(name);                                       // ERROR — m borrow vẫn live
```

Reference key cần lifetime tracking. Production prefer owned (`String`) key.

## HashMap với Vec value

```rust
let mut groups: HashMap<String, Vec<i32>> = HashMap::new();

groups.entry("evens".to_string()).or_insert_with(Vec::new).push(2);
groups.entry("evens".to_string()).or_insert_with(Vec::new).push(4);
groups.entry("odds".to_string()).or_insert_with(Vec::new).push(1);
```

Group-by pattern. `or_insert_with(Vec::new)` lazy create empty vec.

## Methods chính

```rust
m.len();                            // số entries
m.is_empty();
m.contains_key(&key);
m.clear();

m.keys();                            // iterator over &K
m.values();                           // iterator over &V
m.values_mut();                       // iterator over &mut V
m.iter();                            // iterator over (&K, &V)
m.iter_mut();                         // iterator over (&K, &mut V)

m.into_keys();                        // consume map, return owned K
m.into_values();                      // consume map, return owned V
m.into_iter();                        // consume, return owned pairs
```

## HashSet — HashMap without value

```rust
use std::collections::HashSet;

let mut set: HashSet<i32> = HashSet::new();
set.insert(1);
set.insert(2);
set.insert(1);                       // duplicate ignored

println!("{}", set.contains(&1));    // true
println!("{}", set.len());            // 2

let a: HashSet<i32> = [1, 2, 3].into_iter().collect();
let b: HashSet<i32> = [2, 3, 4].into_iter().collect();

let inter: HashSet<_> = a.intersection(&b).collect();    // {2, 3}
let union: HashSet<_> = a.union(&b).collect();           // {1, 2, 3, 4}
let diff: HashSet<_> = a.difference(&b).collect();       // {1}
```

Set operations natural.

## Hasher

```rust
// Default — SipHash 1-3 (secure but slower)
let m: HashMap<i32, i32> = HashMap::new();

// Custom — FxHash (fast, less secure)
use rustc_hash::FxHashMap;
let m: FxHashMap<i32, i32> = FxHashMap::default();
```

Default = security-focused (chống HashDoS attack). External crate `rustc-hash`, `ahash`, `fnv` faster for trusted input.

## Custom key type

Type custom dùng làm key cần implement:
- `Hash`
- `PartialEq` + `Eq`

```rust
#[derive(Hash, PartialEq, Eq)]
struct UserId(u64);

let mut m: HashMap<UserId, String> = HashMap::new();
m.insert(UserId(1), "Alice".to_string());
```

Derive 3 traits cho gọn.

## BTreeMap — sorted alternative

```rust
use std::collections::BTreeMap;

let mut m: BTreeMap<String, i32> = BTreeMap::new();
m.insert("b".to_string(), 2);
m.insert("a".to_string(), 1);
m.insert("c".to_string(), 3);

for (k, v) in &m {           // sorted by key
    println!("{k}: {v}");
}
// a: 1
// b: 2
// c: 3
```

| | HashMap | BTreeMap |
|---|---|---|
| Order | Không | Sorted by key |
| Insert/get | O(1) avg | O(log n) |
| Key trait | `Hash + Eq` | `Ord` |
| Use case | Fast lookup | Range query, sorted iter |

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Key moved khi insert | Clone hoặc dùng reference với lifetime. |
| Mutate value during iteration | Borrow rules. Use `values_mut` carefully. |
| Order assumption | HashMap không order. BTreeMap nếu cần. |
| Compare HashMap == | Equal nếu same entries (not order). |
| Custom key without Hash/Eq | Derive 3 traits. |
| `get("key")` mismatch type | Need `&K`. With String key: `m.get("key")` auto-coerce. |
| Capacity wasted | `shrink_to_fit()` reclaim. |
| Default hasher slow | External crate for hot path. |

## Tóm tắt bài 24

- `HashMap<K, V>` ở `std::collections`. O(1) avg insert/get/remove.
- Methods: `insert`, `get`, `remove`, `contains_key`, `entry`, `iter`.
- `entry().or_insert()` pattern cho counter/group.
- Ownership: key + value moved vào map.
- Iteration order undefined. `BTreeMap` sorted.
- Custom key: derive `Hash`, `Eq`, `PartialEq`.
- `HashSet<T>` = HashMap without value. Set operations: intersection, union, difference.

**Bài kế tiếp** → [Bài 25 (phase-17): Error handling — panic, Result, custom error](../phase-17-error-handling/01-error-handling-cot-loi.md)
