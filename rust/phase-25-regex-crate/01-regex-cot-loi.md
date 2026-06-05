# Bài 33: `regex` crate — pattern matching strings

> Validate email, extract date, replace substring. Rust stdlib không có regex — dùng `regex` crate (maintained bởi BurntSushi, người tạo ripgrep). Bài này dạy basics + production patterns.

## Setup

```toml
[dependencies]
regex = "1.10"
```

```rust
use regex::Regex;

fn main() {
    let re = Regex::new(r"\d+").unwrap();
    
    println!("{}", re.is_match("abc 42 xyz"));    // true
    println!("{:?}", re.find("abc 42 xyz"));      // Some("42")
}
```

`Regex::new(pattern)` compile pattern. `r"..."` raw string — avoid double-escape.

## Common operations

### Match — boolean
```rust
let re = Regex::new(r"^hello").unwrap();
re.is_match("hello world");          // true
re.is_match("say hello");             // false
```

### Find — first occurrence
```rust
let re = Regex::new(r"\d+").unwrap();
let m = re.find("foo 42 bar 99");    // Some(match)
let s = m.unwrap().as_str();           // "42"
let r = m.unwrap().range();             // 4..6
```

### Find all
```rust
let re = Regex::new(r"\d+").unwrap();
let nums: Vec<&str> = re.find_iter("a 1 b 22 c 333")
    .map(|m| m.as_str())
    .collect();
// ["1", "22", "333"]
```

### Capture groups
```rust
let re = Regex::new(r"(\d{4})-(\d{2})-(\d{2})").unwrap();
let caps = re.captures("date: 2024-06-04").unwrap();

println!("year: {}", &caps[1]);     // 2024
println!("month: {}", &caps[2]);    // 06
println!("day: {}", &caps[3]);      // 04
```

`[0]` whole match, `[1]+` capture groups.

### Named captures
```rust
let re = Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap();
let caps = re.captures("2024-06-04").unwrap();

println!("{}", &caps["year"]);
println!("{}", &caps["month"]);
println!("{}", &caps["day"]);
```

Named more readable.

### Replace
```rust
let re = Regex::new(r"\s+").unwrap();
let result = re.replace_all("hello    world   foo", " ");
// "hello world foo"

// With captures
let re = Regex::new(r"(\d{4})-(\d{2})-(\d{2})").unwrap();
let result = re.replace_all("2024-06-04", "$3/$2/$1");
// "04/06/2024"
```

`$1`, `$2`, ... = capture group reference.

### Split
```rust
let re = Regex::new(r"[,;]").unwrap();
let parts: Vec<&str> = re.split("a,b;c,d;e").collect();
// ["a", "b", "c", "d", "e"]
```

## Common patterns

### Email validation
```rust
let re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
re.is_match("user@example.com");        // true
```

**Note**: real email validation surprisingly complex. RFC 5322 fully = too complex. Above ~99% case.

### Phone number
```rust
let re = Regex::new(r"^\+?[\d\s\-\(\)]{10,}$").unwrap();
```

### URL extraction
```rust
let re = Regex::new(r"https?://[^\s]+").unwrap();
for url in re.find_iter(text) {
    println!("{}", url.as_str());
}
```

### Word frequency
```rust
use std::collections::HashMap;

let text = "the quick brown fox jumps over the lazy dog";
let re = Regex::new(r"\w+").unwrap();

let mut counts: HashMap<&str, i32> = HashMap::new();
for word in re.find_iter(text) {
    *counts.entry(word.as_str()).or_insert(0) += 1;
}
```

## Flags

```rust
let re = Regex::new(r"(?i)hello").unwrap();        // case insensitive
let re = Regex::new(r"(?m)^line").unwrap();         // multiline
let re = Regex::new(r"(?s).*").unwrap();            // dot matches newline
let re = Regex::new(r"(?x)
    \d+         # digits
    \s+         # whitespace
").unwrap();                                         // extended mode (comments)
```

Combine: `(?im)`. Position important — apply to following.

## Performance

```rust
// BAD: compile per call
for line in lines {
    let re = Regex::new(r"\d+").unwrap();      // compile every time!
    if re.is_match(line) { ... }
}

// GOOD: compile once
let re = Regex::new(r"\d+").unwrap();
for line in lines {
    if re.is_match(line) { ... }
}

// BEST: lazy_static for global
use once_cell::sync::Lazy;
static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\d+").unwrap());

for line in lines {
    if RE.is_match(line) { ... }
}
```

### `regex` crate guarantees

- **Linear time** in input size. No catastrophic backtracking (unlike PCRE).
- Trade-off: no backreferences, no lookahead.
- 99% real-world regex don't need those.

For full PCRE syntax: `fancy-regex` crate (slower).

## Common pitfalls

### Greedy by default
```rust
let re = Regex::new(r"<.+>").unwrap();
let m = re.find("<a><b>").unwrap();
println!("{}", m.as_str());     // <a><b>  (greedy)

let re = Regex::new(r"<.+?>").unwrap();
let m = re.find("<a><b>").unwrap();
println!("{}", m.as_str());     // <a>  (lazy)
```

`?` after quantifier = lazy.

### Anchor

```rust
let re = Regex::new(r"^\d+$").unwrap();
re.is_match("42");              // true
re.is_match("a 42 b");          // false (anchored)
```

`^` start, `$` end. Without → match anywhere.

### Character class

```rust
let re = Regex::new(r"[a-zA-Z]+").unwrap();              // letters
let re = Regex::new(r"[^aeiou]").unwrap();               // not vowel
let re = Regex::new(r"\w").unwrap();                     // word char
let re = Regex::new(r"\s").unwrap();                     // whitespace
let re = Regex::new(r"\d").unwrap();                     // digit
```

`\b` word boundary, `\B` not boundary.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Compile regex per call | Compile once, reuse. |
| Greedy match too much | Add `?` for lazy. |
| Forget anchor | `^...$` for full match. |
| Special chars not escaped | `\.` for literal `.`. |
| Captures index 0 vs 1 | `[0]` whole, `[1]+` groups. |
| Unicode without flag | `\w` ASCII default. Use Unicode flag. |
| Backreference not supported | regex crate. Use fancy-regex. |
| `find_iter` lifetime | Iterator borrow input. |

## Tóm tắt bài 33

- `regex` crate (no stdlib).
- `Regex::new(r"...")` compile. Raw string avoid escape.
- Methods: `is_match`, `find`, `find_iter`, `captures`, `replace_all`, `split`.
- Capture: `[0]` whole, `[1]+` groups, `["name"]` named.
- Replace with `$1`, `$2`.
- Flags: `(?i)` case, `(?m)` multiline, `(?s)` dotall.
- Compile once, reuse — major perf.
- Linear time guarantee — no catastrophic backtrack.

**Bài kế tiếp** → [Bài 34 (phase-26): Box smart pointer](../phase-26-box/01-box-cot-loi.md)
