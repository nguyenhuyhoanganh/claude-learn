# Bài 10: Scalar types — integer, float, boolean, char

> Rust statically typed — mọi giá trị có **type** xác định lúc compile. Bài này dạy 4 scalar type cơ bản (giá trị đơn): integer, float, boolean, character. Hiểu rõ size, range, overflow để tránh bug bộ nhớ và logic.

## Scalar vs Compound

- **Scalar** = 1 giá trị: `i32`, `f64`, `bool`, `char`.
- **Compound** = nhiều giá trị: tuple, array, struct, enum.

Phase này covered scalar. Phase Structs sẽ học compound.

## Integer types

Rust có **12 integer types** chia 2 chiều:

| | 8-bit | 16-bit | 32-bit | 64-bit | 128-bit | arch-dependent |
|---|---|---|---|---|---|---|
| **Signed** | `i8` | `i16` | `i32` | `i64` | `i128` | `isize` |
| **Unsigned** | `u8` | `u16` | `u32` | `u64` | `u128` | `usize` |

- `i` = signed (cho âm + dương).
- `u` = unsigned (chỉ dương, gồm 0).
- Số = bit width.
- `isize` / `usize` = bằng word size CPU (32-bit hoặc 64-bit tuỳ máy).

### Range của mỗi type

| Type | Min | Max |
|---|---|---|
| `i8` | -128 | 127 |
| `u8` | 0 | 255 |
| `i16` | -32,768 | 32,767 |
| `u16` | 0 | 65,535 |
| `i32` | -2,147,483,648 | 2,147,483,647 |
| `u32` | 0 | 4,294,967,295 |
| `i64` | ~ -9.2 × 10¹⁸ | ~ 9.2 × 10¹⁸ |
| `u64` | 0 | ~ 1.8 × 10¹⁹ |

Công thức:
- `iN` range: `-2^(N-1)` đến `2^(N-1) - 1`.
- `uN` range: `0` đến `2^N - 1`.

### Default type

Khi không annotate, integer literal default = `i32`:

```rust
let x = 5;        // i32
let y = 5i64;     // explicit i64 (suffix)
let z: u32 = 5;   // explicit u32 (annotation)
```

`i32` được chọn default vì cân bằng range + perf trên 99% hệ thống.

### Khi nào dùng type nào

| Use case | Type |
|---|---|
| Counter loop, index | `usize` |
| Tuổi, ngày trong tháng | `u8` |
| Year | `i32` hoặc `u32` |
| File size, byte count | `u64` |
| Unix timestamp (sec) | `i64` (negative cho trước 1970) |
| Bit mask | `u8`/`u16`/`u32`/`u64` tuỳ width |
| Money cents | `i64` |
| Cryptography hash | `u128` hoặc `[u8; N]` |

### Number literal — readability

```rust
let billion = 1_000_000_000;       // underscore separator
let hex = 0xFF;                    // hex
let octal = 0o77;                  // octal
let binary = 0b1010_0001;          // binary
let byte = b'A';                   // byte literal (u8 = 65)
```

Underscore không ảnh hưởng giá trị — chỉ giúp đọc.

### Integer overflow

```rust
let x: u8 = 255;
let y: u8 = x + 1;        // overflow!
```

Hành vi:
- **Debug mode**: panic — crash với message rõ ràng.
  ```text
  thread 'main' panicked at 'attempt to add with overflow'
  ```
- **Release mode**: wrap-around — `255 + 1 = 0` (silent, dangerous).

Xử lý explicit:

```rust
let x: u8 = 255;

let safe = x.checked_add(1);    // Option<u8>: None nếu overflow
let wrapped = x.wrapping_add(1); // u8: 0 (wrap)
let saturated = x.saturating_add(1); // u8: 255 (clamp)
let (result, overflowed) = x.overflowing_add(1); // (0, true)
```

Production thường dùng `checked_add` cho safety, `wrapping_add` cho hash/crypto.

## Float types

Chỉ 2 loại:

| Type | Size | Precision |
|---|---|---|
| `f32` | 32-bit | ~7 chữ số thập phân |
| `f64` | 64-bit | ~15-17 chữ số (default) |

```rust
let pi: f64 = 3.14159265358979;
let e: f32 = 2.71828_f32;        // suffix
let x = 1.0;                      // default f64
```

### IEEE 754 — floating-point standard

Rust dùng IEEE 754:
- Có `Infinity`, `-Infinity`, `NaN` (Not a Number).
- **Precision loss** với decimal:
  ```rust
  let a = 0.1 + 0.2;
  println!("{a}");          // 0.30000000000000004
  ```

Quy tắc money: **không** dùng `f64` cho tiền. Dùng `i64` cents hoặc thư viện `rust_decimal`.

### NaN gotcha

```rust
let nan = f64::NAN;
println!("{}", nan == nan);   // false! NaN != NaN
println!("{}", nan.is_nan()); // true — đúng cách check
```

NaN không bằng chính nó (theo spec). Compare bằng `.is_nan()`.

## Boolean type

```rust
let t: bool = true;
let f: bool = false;
let computed = 5 > 3;             // bool
```

Chỉ 2 giá trị: `true`, `false`. Size 1 byte (không phải 1 bit — alignment lý do).

Khác C, Rust **không** convert tự động số → bool:
```rust
let x = 5;
if x { ... }              // LỖI compile — phải `if x != 0`
```

Strict — giảm bug nhầm lẫn.

## Character type

```rust
let c: char = 'A';
let heart: char = '❤';
let han: char = '中';
let emoji: char = '🦀';
```

- 4 bytes (32-bit) — chứa Unicode scalar value.
- Dùng `' '` (single quote), không `"`.
- 1 char = 1 codepoint Unicode (không phải byte hay grapheme).

```rust
let one_char: char = '🦀';
let s: &str = "🦀";
println!("char: 4 bytes, str: {} bytes", s.len());
// char: 4 bytes, str: 4 bytes (UTF-8 encoded)
```

`char` ≠ `str`:
- `char` = đơn vị Unicode codepoint.
- `str` = chuỗi UTF-8 bytes.

Phase Strings (phase 15) đào sâu.

## Type annotation explicit

Đôi khi compiler không suy luận được:

```rust
let parsed = "42".parse().unwrap();   // LỖI — type không xác định
```

```text
error[E0282]: type annotations needed
```

Fix:
```rust
let parsed: i32 = "42".parse().unwrap();
// hoặc
let parsed = "42".parse::<i32>().unwrap();  // turbofish syntax
```

`::<Type>` gọi là **turbofish** — chỉ định type cho generic.

## Operations

```rust
// Arithmetic
let sum = 5 + 10;
let diff = 95.5 - 4.3;
let product = 4 * 30;
let quotient = 56.7 / 32.2;
let remainder = 43 % 5;       // modulo

// Integer division (truncate)
let truncated = 7 / 2;        // 3, không phải 3.5

// Mixed types: cần convert explicit
let a: i32 = 5;
let b: f64 = 2.0;
let c = a as f64 / b;          // a cast sang f64
```

### Type casting với `as`

```rust
let x: i32 = 1000;
let y: u8 = x as u8;            // 232 (truncate)

let f: f64 = 3.7;
let i: i32 = f as i32;          // 3 (truncate, không round)

let c: char = 'A';
let n: u32 = c as u32;          // 65 (ASCII code)
```

`as` cast giữa numeric type — **truncate** nếu giá trị quá lớn. Nguy hiểm nếu không cẩn thận. Production prefer `TryFrom`:

```rust
let x: i32 = 1000;
let y: u8 = u8::try_from(x).unwrap();   // panic vì 1000 > 255
```

`try_from` trả `Result` — handle error explicit.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Overflow release mode silently wrap | Dùng `checked_add` / `saturating_add` cho safety. |
| `0.1 + 0.2 != 0.3` | Float imprecision. Dùng `(a - b).abs() < EPSILON`. |
| NaN compare `==` luôn false | `.is_nan()`. |
| `if x` với số | Rust strict — phải `if x != 0`. |
| Mix `i32 + f64` | Cast explicit `x as f64`. |
| Cast `as` truncate silently | `try_from` cho safety. |
| Forget turbofish `parse::<T>()` | Annotate variable type hoặc turbofish. |
| `char` vs `&str` confusion | char single quote `'A'`, str double `"A"`. |

## Tóm tắt bài 10

- 12 integer types: `i8/16/32/64/128` + `u8/16/32/64/128` + `isize/usize`. Default `i32`.
- Overflow: debug panic, release wrap. Dùng `checked_add` cho safety.
- 2 float types: `f32`, `f64`. Default `f64`. Không dùng cho money.
- `bool`: chỉ `true`/`false`, không auto-convert số.
- `char`: 4 bytes Unicode codepoint, single quote.
- Cast `as` truncate. `TryFrom` cho safe conversion.

**Bài kế tiếp** → [Bài 11: Tuples, arrays, slices, vectors](02-compound-types.md)
