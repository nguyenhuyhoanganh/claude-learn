# Bài 14: Ownership — feature đặc trưng nhất của Rust

> Ownership là thứ làm Rust **khác mọi ngôn ngữ khác**. C/C++ cho bạn tự lo memory → segfault. Java/Python tự GC → pause + RAM tốn. Rust giải bằng cách: compiler track owner của mỗi value, free tự động khi owner ra scope. Bài này là **bài quan trọng nhất phase đầu** — đọc chậm, hiểu thật.

## Vấn đề Rust giải

3 nỗi đau memory management:

### 1. Dangling pointer (C/C++)
```c
char* p = malloc(10);
free(p);
strcpy(p, "hi");    // use after free — crash hoặc security hole
```

### 2. Double free (C/C++)
```c
free(p);
free(p);     // double free — crash
```

### 3. Memory leak (Java/Python ngầm, C explicit)
```c
char* p = malloc(10);
// quên free → leak
```

### 4. Pause GC (Java/Python)
GC scan toàn heap mỗi 10ms → app pause. Không acceptable cho real-time / latency-sensitive.

**Rust giải tất cả** bằng **ownership system** — verify lúc compile, zero runtime cost.

## 3 quy tắc ownership

```text
1. Mỗi value có duy nhất 1 owner.
2. Khi owner ra scope, value bị drop (free).
3. Chỉ 1 owner tại 1 thời điểm.
```

Đơn giản trên lý thuyết. Thực hành lúc đầu thấy lạ.

## Stack vs Heap — refresher

```text
┌──────────────────┐
│      Stack        │  ← fast, fixed size, LIFO, auto-managed
│ ┌──────────────┐ │
│ │ local vars    │ │
│ │ function args │ │
│ │ ...           │ │
│ └──────────────┘ │
└──────────────────┘

┌──────────────────┐
│       Heap        │  ← slower, dynamic size, scattered
│  [block A] [B]    │
│         [C]       │
│  [D]      [E]     │
└──────────────────┘
```

| | Stack | Heap |
|---|---|---|
| Size | Cố định, biết compile | Dynamic, biết runtime |
| Speed | Cực nhanh | Chậm hơn (vài lần) |
| Allocation | Push/pop (1 instruction) | Hệ thống tìm chỗ trống |
| Cleanup | Tự (function exit) | Manual hoặc GC |
| Đối tượng | Primitive, fixed-size struct | String, Vec, Box, dynamic data |

Stack value: `i32`, `f64`, `bool`, `char`, fixed array, fixed struct.
Heap value: `String`, `Vec<T>`, `Box<T>`, `Rc<T>`.

## Copy types vs Move types

Rust có 2 cách xử lý assignment:

### Copy types (stack-only)

```rust
let x = 5;
let y = x;        // copy — cả 2 đều usable
println!("{x} {y}");  // 5 5
```

`i32` implement `Copy` trait → khi assign, dữ liệu được **duplicate**. Cả 2 variable đều own version riêng.

Copy types: scalar (`i32`, `f64`, `bool`, `char`), tuple chỉ chứa Copy types, fixed array Copy types.

### Move types (heap-managed)

```rust
let s1 = String::from("hello");
let s2 = s1;             // MOVE — s1 không còn dùng được

println!("{s1}");        // ERROR
```

```text
error[E0382]: borrow of moved value: `s1`
 --> src/main.rs:4:15
  |
2 |     let s1 = String::from("hello");
  |         -- move occurs because `s1` has type `String`, which does not implement the `Copy` trait
3 |     let s2 = s1;
  |              -- value moved here
4 |     println!("{s1}");
  |               ^^ value borrowed here after move
```

Vì sao move? — `String` chứa heap pointer. Nếu copy `s1` → `s2`, **2 pointer cùng trỏ 1 heap block**. Khi s1 + s2 ra scope, **double free** → crash.

Rust tránh bằng cách: assignment cho move type **transfer ownership**. Sau move, source variable invalid.

## String internals — vì sao move

```text
let s1 = String::from("hello");

stack:                 heap:
┌──────────┐          ┌────────────┐
│ ptr ─────┼─────────►│ h e l l o  │
│ len: 5    │          └────────────┘
│ cap: 5    │
└──────────┘
   s1
```

`String` trên stack có 3 field: ptr, len, capacity. Data thực tế ("hello") trên heap.

Khi `let s2 = s1`:
```text
stack:                 heap:
┌──────────┐          ┌────────────┐
│ ptr ─────┼──────┐──►│ h e l l o  │
│ len: 5    │      │   └────────────┘
│ cap: 5    │      │
└──────────┘      │
   s1 (invalid)   │
┌──────────┐      │
│ ptr ─────┼──────┘
│ len: 5    │
│ cap: 5    │
└──────────┘
   s2 (owner)
```

s1 vẫn tồn tại trên stack nhưng Rust mark "moved" — không cho phép access.

Khi `s2` ra scope:
- Rust call `drop()` cho s2.
- `drop()` free heap block.
- s1 không bị drop lần 2 (đã moved).

→ No double free, no dangling.

## `clone()` — explicit deep copy

Muốn copy thực sự (cả heap):

```rust
let s1 = String::from("hello");
let s2 = s1.clone();      // deep copy

println!("{s1} {s2}");    // hello hello — cả 2 OK
```

`clone()` malloc heap mới + copy bytes. Tốn thời gian + RAM. **Explicit** — bạn biết rõ đang làm.

Rule: **avoid `clone()` trừ khi cần thiết**. Nếu code phải clone nhiều → review lại design, có thể dùng reference (`&`).

## Pass to function = move/copy

```rust
fn take(s: String) {
    println!("got {s}");
}

fn main() {
    let s = String::from("hello");
    take(s);
    // s không dùng được nữa — moved vào function
}
```

Pass string vào function = move. Function "consume" value.

Copy type:
```rust
fn take_int(n: i32) {
    println!("{n}");
}

fn main() {
    let x = 5;
    take_int(x);
    println!("{x}");      // OK — i32 copy
}
```

## Return move ownership

```rust
fn make_string() -> String {
    let s = String::from("created");
    s     // return = move ownership ra ngoài
}

fn main() {
    let s = make_string();
    println!("{s}");
}
```

Return value transfer ownership ra caller. Caller giờ own.

### Pattern: take + return

```rust
fn append_world(mut s: String) -> String {
    s.push_str(" world");
    s
}

fn main() {
    let s = String::from("hello");
    let s = append_world(s);     // move in, move out
    println!("{s}");              // hello world
}
```

Cách này verbose. Phase References sẽ dạy `&mut s` để mutate in-place without move.

## `Drop` trait — auto cleanup

Khi owner ra scope, Rust call `drop()` tự động:

```rust
fn main() {
    let s = String::from("hello");
    println!("{s}");
}   // ← drop(s) ở đây, heap freed
```

Custom drop:
```rust
struct Connection { id: u32 }

impl Drop for Connection {
    fn drop(&mut self) {
        println!("Closing connection {}", self.id);
    }
}

fn main() {
    let conn = Connection { id: 1 };
}   // ← "Closing connection 1"
```

Phase Smart Pointers (26-27) sâu hơn.

## So sánh memory management

| Approach | When freed | Cost | Bug class |
|---|---|---|---|
| Manual (C) | Programmer call free | 0 runtime | Dangling, double free, leak |
| GC (Java, Python) | GC pause periodically | 5-30% CPU + pause | Có thể leak references |
| Reference counting (Swift) | Last ref dropped | 5-15% atomic ops | Cycle leak |
| **Rust ownership** | Owner ra scope | 0 runtime | Compile error (no runtime bug) |

Rust: **runtime cost zero**, bugs caught **compile time**.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `let s2 = s1; println!("{s1}")` | Moved. Dùng `clone()` hoặc reference. |
| Vô tình move vào function | Pass `&s` reference thay. |
| `clone()` mọi thứ để fix lỗi | Slow. Học reference + borrow (phase 7). |
| Tưởng `i32` move | `i32` Copy — không move. |
| Tuple `(String, i32)` Copy? | Không — vì String không Copy. Tuple Copy chỉ khi mọi element Copy. |
| Forget pattern `&` trong function param | Function take ownership. Refactor. |
| Try assign moved | "borrow of moved value" — error message rất rõ. |
| `String::from` vs literal `"..."` | Literal `&'static str` — không heap, không move concern. `String` heap. |

## Tóm tắt bài 14

- Ownership: mỗi value 1 owner; owner ra scope → drop tự động.
- Copy types (stack, scalar): assignment = duplicate, cả 2 dùng được.
- Move types (heap, String/Vec): assignment = transfer ownership, source invalid.
- `clone()` deep copy explicit — tránh nếu không cần.
- Pass to fn = move (heap) hoặc copy (stack). Return = move out.
- `Drop` trait auto-cleanup khi out of scope — no runtime cost.
- Phase 7 (References) dạy cách dùng value không lấy ownership.

**Bài kế tiếp** → [Bài 15: References & borrowing — share không lấy ownership](../phase-7-references-borrowing/01-borrowing-cot-loi.md)
