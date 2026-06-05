# Bài 23: String trong Rust — phức tạp hơn bạn nghĩ

> Python/JS: `len(s)` = số character. Rust: `s.len()` = số byte. Vì sao? UTF-8. Bài này dạy `String` vs `&str`, bytes vs chars vs graphemes, common operations, và lý do Rust string khắt khe (đổi lại: i18n đúng).

## `String` vs `&str` — recap

```rust
let owned: String = String::from("hello");      // heap, growable, mut
let borrowed: &str = "hello";                    // slice, immutable, static
let view: &str = &owned;                          // slice into String
```

| | `String` | `&str` |
|---|---|---|
| Ownership | Own heap data | Borrow |
| Growable | Có | Không |
| Mutable | Có (`mut`) | Không |
| Size known | Runtime | Compile (with lifetime) |
| Common use | Build/modify | Read, param |

## Create String

```rust
let s = String::new();                          // empty
let s = String::from("hello");                   // from &str
let s = "hello".to_string();                     // alternative
let s = "hello".to_owned();                      // alternative
let s = String::with_capacity(20);               // pre-allocate
let s = format!("{} {}", "hello", "world");     // build
```

## Modify

```rust
let mut s = String::from("Hello");

s.push(' ');                  // append char
s.push_str("world");          // append &str
s += "!";                      // operator +=
s.insert(0, '*');              // insert at index
s.insert_str(1, "ABC");

s.pop();                       // remove last char → Option<char>
s.remove(0);                   // remove at index → char
s.clear();                     // empty

let s2 = s.to_uppercase();
let s2 = s.to_lowercase();
let s2 = s.trim();              // trim whitespace both sides
```

## Concatenate

```rust
let a = String::from("hello");
let b = String::from(" world");

// + operator
let c = a + &b;                 // a moved (consumed)!
// println!("{a}");              // ERROR

// format! macro
let c = format!("{} {}", "hello", "world");

// push_str
let mut c = String::from("hello");
c.push_str(" world");
```

`+` operator quirky: `String + &str`. First operand consumed. Production prefer `format!()` for clarity.

## Bytes vs Chars vs Graphemes

```rust
let s = String::from("héllo");

println!("{}", s.len());           // 6 — bytes (é = 2 bytes UTF-8)
println!("{}", s.chars().count()); // 5 — Unicode codepoints

for b in s.bytes() {               // u8
    print!("{b} ");
}
// 104 195 169 108 108 111

for c in s.chars() {                // char
    print!("{c} ");
}
// h é l l o
```

3 layer:
- **Byte** = UTF-8 byte (`u8`).
- **Char** = Unicode codepoint (4 bytes, `char`).
- **Grapheme cluster** = "what user perceives as 1 letter" (e.g. `é` = base + accent có thể là 2 codepoints).

Stdlib có `chars()` + `bytes()`. Graphemes cần crate `unicode-segmentation`.

### Family emoji case
```rust
let s = "👨‍👩‍👧‍👦";              // family emoji
println!("{}", s.len());           // 25 — bytes
println!("{}", s.chars().count()); // 7 — codepoints (4 emojis + 3 ZWJ joiners)
```

User thấy "1 family", Rust thấy 25 bytes. UTF-8 reality.

## Slicing — careful

```rust
let s = String::from("héllo");
let first_char = &s[0..1];         // OK — 'h' = 1 byte
let bad = &s[0..2];                // panic — chia giữa 'é'
```

`String::[range]` slice bytes. Phải align char boundary.

Safe alternatives:
```rust
// Take first N chars
let prefix: String = s.chars().take(3).collect();

// Skip + take
let middle: String = s.chars().skip(1).take(2).collect();

// Position-based
if let Some((i, _)) = s.char_indices().nth(3) {
    let prefix = &s[..i];
}
```

## Common methods

```rust
let s = String::from("Hello, World!");

s.len();                    // 13
s.is_empty();                // false

s.contains("World");          // true
s.starts_with("Hello");       // true
s.ends_with("!");             // true

s.find("World");              // Some(7)
s.find('W');                  // Some(7)

s.replace("World", "Rust");   // "Hello, Rust!"

s.split(",");                 // iterator: ["Hello", " World!"]
s.split_whitespace();          // iterator words
s.lines();                    // iterator lines

s.repeat(3);                  // "Hello, World!Hello, World!Hello, World!"
```

### `split` returns iterator

```rust
let s = "a,b,c,d";
let parts: Vec<&str> = s.split(',').collect();
// ["a", "b", "c", "d"]

for p in s.split(',') {
    println!("{p}");
}
```

## Parse + format

```rust
let n: i32 = "42".parse().unwrap();
let f: f64 = "3.14".parse().unwrap();
let n: Result<i32, _> = "abc".parse();      // Err

let s = 42.to_string();                      // "42"
let s = format!("{:>5}", 42);                // "   42" (right align width 5)
let s = format!("{:.2}", 3.14159);            // "3.14"
let s = format!("{:08b}", 10);                // "00001010" (binary pad)
let s = format!("{:#x}", 255);                // "0xff"
```

Format spec rất giàu — xem `std::fmt`.

## Iterate chars với index

```rust
let s = "héllo";
for (i, c) in s.char_indices() {
    println!("{i}: {c}");
}
// 0: h
// 1: é
// 3: l
// 4: l
// 5: o
```

`char_indices()` trả `(byte_index, char)`.

## `&str` literal vs raw string

```rust
let normal = "line1\nline2";         // \n escape
let raw = r"line1\nline2";            // literal "\n"

let with_quotes = "She said \"hi\"";
let raw_quotes = r#"She said "hi""#;   // # delimiter for inner "
```

`r"..."` raw — không process escape. Hữu ích cho regex, path Windows.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `s.len()` = char count | Sai — bytes. Dùng `chars().count()`. |
| `s[2]` index | Compile error — String không impl `Index<usize>`. Phải slice `&s[0..2]`. |
| Slice giữa multi-byte char | Panic. Use char_indices. |
| `s + s2` operator, s2 not `&str` | `s + &s2`. |
| `+ "..." + "..."` chain | Verbose. `format!()` cleaner. |
| Compare String với &str | OK (auto-coerce in `==`). |
| Trim returns &str | If need owned: `.trim().to_string()`. |
| Mutate String during iteration | Borrow rules. Collect first. |

## Tóm tắt bài 23

- `String` (owned heap) vs `&str` (slice). Use `&str` for function param.
- Create: `String::new()`, `String::from()`, `"".to_string()`, `format!()`.
- Modify: `push`, `push_str`, `+=`, `insert`, `remove`, `clear`, `to_uppercase`.
- `len()` = bytes, `chars().count()` = codepoints, grapheme cần crate.
- Slice `&s[a..b]` panic nếu không align char boundary.
- Format: `format!()` macro với spec đa dạng.
- Raw string `r"..."` cho escape literal.

**Bài kế tiếp** → [Bài 24 (phase-16): HashMap — key-value lookup nhanh](../phase-16-hashmaps/01-hashmap-cot-loi.md)
