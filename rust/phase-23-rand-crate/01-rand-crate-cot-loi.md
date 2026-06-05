# Bài 31: `rand` crate — random numbers in Rust

> Rust standard library **không** có random. Vì sao? — stdlib stable, random nhiều use case (PRNG kinds, distribution, security), tách ra crate maintain riêng. `rand` là de facto crate. Bài này dạy basics + common patterns.

## Setup

`Cargo.toml`:
```toml
[dependencies]
rand = "0.8"
```

```rust
use rand::Rng;

fn main() {
    let mut rng = rand::thread_rng();
    
    let n: i32 = rng.gen();                   // any i32
    let f: f64 = rng.gen();                   // f64 in [0, 1)
    let b: bool = rng.gen();
    
    println!("{n} {f} {b}");
}
```

`rand::thread_rng()` returns thread-local PRNG. Fast, no setup.

## Range generation

```rust
use rand::Rng;

let mut rng = rand::thread_rng();

let dice: u8 = rng.gen_range(1..=6);          // 1 to 6 inclusive
let percent: f64 = rng.gen_range(0.0..1.0);   // 0 to 1 exclusive
let int: i32 = rng.gen_range(-100..100);
```

`gen_range(start..end)` exclusive, `gen_range(start..=end)` inclusive.

## Random from collection

```rust
use rand::seq::SliceRandom;

let mut rng = rand::thread_rng();
let choices = vec!["apple", "banana", "cherry"];

// Pick one
let picked = choices.choose(&mut rng);                // Option<&&str>
println!("{:?}", picked);

// Pick multiple
let sample: Vec<_> = choices.choose_multiple(&mut rng, 2).collect();
println!("{:?}", sample);

// Shuffle in place
let mut nums = vec![1, 2, 3, 4, 5];
nums.shuffle(&mut rng);
println!("{:?}", nums);
```

`SliceRandom` trait — methods on slice via `use`.

## Random string

```rust
use rand::Rng;
use rand::distributions::Alphanumeric;

let s: String = rand::thread_rng()
    .sample_iter(&Alphanumeric)
    .take(10)
    .map(char::from)
    .collect();
println!("{s}");           // e.g. "Abc123XyZw"
```

`Alphanumeric` distribution generate `[a-zA-Z0-9]` byte.

## Seedable PRNG — reproducible

```rust
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;

let mut rng = StdRng::seed_from_u64(42);

let n1: u32 = rng.gen();
let n2: u32 = rng.gen();

// Run again with same seed → same n1, n2
```

For testing, reproducibility critical. `seed_from_u64(seed)` deterministic.

## Cryptographic vs Non-crypto

```rust
use rand::thread_rng;                    // ChaCha20 — secure
use rand::rngs::OsRng;                    // OS source — most secure

// Non-crypto, fast
use rand_xoshiro::Xoshiro256PlusPlus;
let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
```

Default `thread_rng` is **cryptographically secure** — slow but safe. For games/simulation, faster non-crypto OK.

| | thread_rng | OsRng | Xoshiro |
|---|---|---|---|
| Crypto secure | Yes | Yes (most) | No |
| Speed | Fast | Slow | Fastest |
| Use case | General | Crypto, security | Simulation, game |

## Custom distribution

```rust
use rand::distributions::{Distribution, Uniform};

let between_5_and_10 = Uniform::from(5..=10);
let mut rng = rand::thread_rng();

for _ in 0..5 {
    println!("{}", between_5_and_10.sample(&mut rng));
}
```

Create distribution once, reuse — faster than `gen_range` in tight loop.

### Normal distribution

```toml
rand_distr = "0.4"
```

```rust
use rand_distr::{Normal, Distribution};

let normal = Normal::new(50.0, 10.0).unwrap();   // mean 50, stddev 10
let mut rng = rand::thread_rng();

for _ in 0..5 {
    println!("{:.2}", normal.sample(&mut rng));
}
```

Many distributions: Normal, Poisson, Exponential, Binomial, ...

## Real-world examples

### Coin flip
```rust
fn coin_flip() -> bool {
    rand::thread_rng().gen_bool(0.5)
}
```

### Roll multiple dice
```rust
fn roll_dice(n: usize) -> Vec<u8> {
    let mut rng = rand::thread_rng();
    (0..n).map(|_| rng.gen_range(1..=6)).collect()
}
```

### Pick weighted
```rust
use rand::distributions::WeightedIndex;

let choices = ["common", "rare", "legendary"];
let weights = [80, 19, 1];           // 80%, 19%, 1%

let dist = WeightedIndex::new(&weights).unwrap();
let mut rng = rand::thread_rng();

let picked = &choices[dist.sample(&mut rng)];
```

### Generate UUID-like

For real UUID: `uuid` crate. For simple random ID:

```rust
fn random_id(len: usize) -> String {
    use rand::distributions::Alphanumeric;
    rand::thread_rng()
        .sample_iter(Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}
```

## Performance tip

```rust
let mut rng = rand::thread_rng();        // create once

for _ in 0..1_000_000 {
    let n: u32 = rng.gen();              // reuse
}
```

Don't call `thread_rng()` in hot loop — get once, reuse.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `let n = rand::random()` ambiguous | Annotate type or turbofish. |
| `gen_range(0..0)` | Empty range — panic. Check. |
| `thread_rng()` in loop | Get once outside. |
| Non-Copy types in `choose` | Use `choose` returns Option<&T>, deref. |
| Wrong distribution | Match distribution to use case. |
| `seed_from_u64` for crypto | Not secure. Use OsRng. |
| Forget `&mut rng` | Most methods take `&mut`. |
| `shuffle` Vec borrowed | Move or split borrow. |

## Tóm tắt bài 31

- `rand` crate de facto for random.
- `rand::thread_rng()` quick, secure default.
- `gen()`, `gen_range(a..b)`, `gen_bool(p)`.
- `SliceRandom` trait: `choose`, `choose_multiple`, `shuffle`.
- `Alphanumeric` distribution for strings.
- Seedable: `StdRng::seed_from_u64(seed)` for reproducible test.
- Distributions: Uniform, Normal, Weighted, etc. via `rand_distr`.
- Performance: create rng once, reuse.

**Bài kế tiếp** → [Bài 32 (phase-24): `chrono` crate — date/time](../phase-24-chrono-crate/01-chrono-cot-loi.md)
