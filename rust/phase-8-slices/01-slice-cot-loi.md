# Bài 16: Slices — view vào portion của data

> Slice là **reference đến chuỗi liên tiếp** trong array, string, vector — không own data, không copy. Cực kỳ hữu ích cho function nhận substring/subarray. Bài này dạy 3 slice phổ biến: `&str`, `&[T]`, `&[u8]`.

## String slice — `&str`

```rust
let s = String::from("hello world");
let hello = &s[0..5];       // "hello"
let world = &s[6..11];      // "world"
let all = &s[..];           // "hello world"

println!("{hello} | {world}");
```

`&s[start..end]` = slice từ byte `start` đến `end-1`. Không own data — chỉ ref + length.

```text
s:                                heap:
┌──────────────┐                 ┌──────────────────┐
│ ptr ─────────┼────────────────►│ h e l l o   w o r│
│ len: 11       │                 │ l d              │
│ cap: 11       │                 └──────────────────┘
└──────────────┘

hello = &s[0..5]:
┌──────────────┐    
│ ptr ─────────┼─► (trỏ vào s[0])
│ len: 5        │
└──────────────┘

world = &s[6..11]:
┌──────────────┐
│ ptr ─────────┼─► (trỏ vào s[6])
│ len: 5        │
└──────────────┘
```

Slice = `(ptr, len)`. Zero-copy.

### Range shortcuts

```rust
let s = String::from("hello");

&s[0..2]       // "he"
&s[..2]        // "he" — from start
&s[3..]        // "lo" — to end
&s[..]         // "hello" — whole
&s[0..s.len()] // "hello" — explicit full
```

### String literal IS a slice

```rust
let lit: &str = "hello world";
```

`"hello world"` type = `&'static str` — slice vào read-only memory của binary. Lifetime `'static` = sống suốt program.

## Array slice — `&[T]`

```rust
let nums = [1, 2, 3, 4, 5];
let first_three: &[i32] = &nums[0..3];     // [1, 2, 3]
let last_two = &nums[3..];                  // [4, 5]

for x in first_three {
    println!("{x}");
}
```

Cùng concept với string slice nhưng cho array/vector.

## Function nhận slice — flexible

```rust
fn sum(nums: &[i32]) -> i32 {
    nums.iter().sum()
}

fn main() {
    let arr = [1, 2, 3, 4, 5];
    let vec = vec![10, 20, 30];
    
    println!("{}", sum(&arr));            // 15
    println!("{}", sum(&vec));            // 60
    println!("{}", sum(&arr[1..3]));      // 5
}
```

`&[i32]` accept:
- Array `[i32; N]` (auto-deref).
- Vector `Vec<i32>` (auto-deref).
- Slice của bất kỳ container.

Idiomatic — **function param dùng slice thay vì `Vec`**.

## `&str` vs `String` — recap

| | `String` | `&str` |
|---|---|---|
| Ownership | Own | Borrow |
| Heap allocated | Có | Không (trỏ vào string hoặc literal) |
| Mutable | Có (`mut`) | Không |
| Growable | Có | Không |
| Use case | Build/mutate | Read-only param, literal |

Convert qua lại:
```rust
let s: String = String::from("hello");
let slice: &str = &s;                  // &String → &str (auto-deref)
let slice: &str = s.as_str();          // explicit

let owned: String = slice.to_string();   // &str → String
let owned: String = String::from(slice);  // alternative
```

## Range type

`0..5` thực ra là value type `Range<i32>`:

```rust
let r: std::ops::Range<i32> = 0..5;
for i in r {
    println!("{i}");
}
```

Range implement `Iterator` → dùng được trong `for`.

## Boundary character — UTF-8 careful

```rust
let s = String::from("héllo");
let bad = &s[0..3];                    // ERROR runtime
```

`héllo` có `é` = 2 bytes UTF-8 (0xC3, 0xA9). `&s[0..3]` cố cắt giữa char → panic.

```text
thread 'main' panicked at 'byte index 3 is not a char boundary; it is inside 'é' (bytes 1..3) of `héllo`'
```

Safe:
```rust
let s = String::from("héllo");
let bytes = s.as_bytes();              // &[u8]
println!("{:?}", &bytes[0..3]);        // [104, 195, 169]

// Iterate chars
for c in s.chars() {                    // 1 char unit
    println!("{c}");
}
```

`String` lưu UTF-8 → slice phải align char boundary. Phase Strings (15) đào sâu.

## Slice không grow

```rust
let mut s = String::from("hello");
let r = &s[0..5];                       // immutable borrow
s.push_str("!");                        // ERROR — mutate while borrowed
```

```text
error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable
```

Slice giữ immutable ref → không thể mutate source. Borrow rules.

## `first_word` — classic example

```rust
fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b' ' {
            return &s[..i];
        }
    }
    s
}

fn main() {
    let s = String::from("hello world");
    let word = first_word(&s);
    println!("{word}");        // hello
}
```

Take `&str` (accept String + literal). Return slice — caller borrow vẫn live.

## Mutable slice — `&mut [T]`

```rust
fn double_all(arr: &mut [i32]) {
    for x in arr.iter_mut() {
        *x *= 2;
    }
}

fn main() {
    let mut nums = [1, 2, 3];
    double_all(&mut nums);
    println!("{:?}", nums);    // [2, 4, 6]
}
```

`&mut [T]` cho phép modify in place. Vẫn borrow rules.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Slice ngoài bounds | Panic. Check len trước. |
| String slice giữa UTF-8 char | Panic. Dùng `.chars()` hoặc check `.is_char_boundary(i)`. |
| Mutate source khi slice borrowed | Borrow rules — drop slice trước. |
| `&String` thay `&str` param | Less flexible. Dùng `&str`. |
| `let s = &v[1..3].to_vec();` | Tạo Vec mới (clone). OK nhưng tốn — chỉ khi cần own. |
| Slice from local return | Lifetime issue. Phase 19. |
| `&[T]` empty slice | OK — `&[]` valid. |
| `nums.iter()` vs `&nums` trong loop | Cả 2 OK. `&nums` → IntoIterator. |

## Tóm tắt bài 16

- Slice = `(ptr, len)` — reference vào portion liên tiếp, không own.
- `&str` = string slice. `&[T]` = array/vector slice.
- String literal `"..."` type là `&'static str` — slice vào read-only.
- Function param prefer slice (`&str`, `&[T]`) over owned (`String`, `Vec<T>`).
- Range syntax: `[a..b]`, `[..b]`, `[a..]`, `[..]`.
- UTF-8: slice phải char boundary, nếu không panic.
- Mutable slice `&mut [T]` cho phép modify in place.

**Bài kế tiếp** → [Bài 17 (phase-9): Structs — định nghĩa kiểu dữ liệu phức hợp](../phase-9-structs/01-struct-cot-loi.md)
