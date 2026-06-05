# Bài 42: Project & Section Review — giai thừa (lặp & đệ quy), tổng kết Control Flow

Hết phase Control Flow. Project này gom mọi thứ: `if/else`, `match`, vòng lặp, và recursion — qua hai bài toán kinh điển. Sau đó là tổng kết toàn phase.

## Đề bài project

1. `color_to_number(color)` — map "red"→1, "green"→2, "blue"→3, khác→0. Viết **hai** bản: `if/else if` và `match`.
2. `factorial(n)` — tính giai thừa. Viết **hai** bản: iterative (vòng lặp) và recursive (đệ quy).

## Phần 1: color_to_number

### Bản if/else if

```rust
fn color_to_number_if(color: &str) -> i32 {
    if color == "red" {
        1
    } else if color == "green" {
        2
    } else if color == "blue" {
        3
    } else {
        0
    }
}
```

Mỗi nhánh là implicit return (không `;`); cả `if/else` là return value của hàm (bài 35).

### Bản match — gọn hơn

```rust
fn color_to_number_match(color: &str) -> i32 {
    match color {
        "red" => 1,
        "green" => 2,
        "blue" => 3,
        _ => 0,                     // catch-all: mọi string khác
    }
}

fn main() {
    println!("{}", color_to_number_match("red"));     // 1
    println!("{}", color_to_number_match("blue"));    // 3
    println!("{}", color_to_number_match("purple"));  // 0
}
```

`match` thắng ở đây: gọn hơn, và `_` bắt buộc (string vô hạn) khiến ta không quên trường hợp mặc định. So cùng giá trị (`color`) với nhiều hằng → `match` là lựa chọn idiomatic.

## Phần 2: factorial

`n! = n × (n-1) × ... × 1`. VD `5! = 120`, `4! = 24`.

### Bản iterative (vòng lặp)

```rust
fn factorial_iterative(number: i32) -> i32 {
    let mut product = 1;            // tích tích luỹ, bắt đầu từ 1
    let mut count = number;         // đếm ngược từ number về 1

    while count > 0 {
        product *= count;           // nhân dồn
        count -= 1;                 // tiến về điều kiện dừng
    }
    product                          // implicit return
}
```

Diễn biến `factorial_iterative(5)`:
```text
product=1, count=5
vòng: count>0? → product *= count, count -= 1
  5: product=1*5=5,   count=4
  4: product=5*4=20,  count=3
  3: product=20*3=60, count=2
  2: product=60*2=120,count=1
  1: product=120*1=120,count=0
  0: 0>0 false → dừng
→ 120
```

Hai biến `mut`: `product` (tích) và `count` (vị trí). `while count > 0` đảm bảo dừng; `count -= 1` tiến tới dừng.

### Bản recursive (đệ quy)

```rust
fn factorial_recursive(number: i32) -> i32 {
    if number <= 1 {
        return 1;                   // base case
    }
    number * factorial_recursive(number - 1)   // recursive case
}

fn main() {
    println!("{}", factorial_iterative(5));     // 120
    println!("{}", factorial_recursive(5));     // 120
}
```

Mấu chốt nhận diện: `5! = 5 × 4!` — giai thừa của n chứa giai thừa của n-1 (bài toán nhỏ hơn cùng dạng). Base case `number <= 1 → 1` dừng đệ quy; recursive case `number * factorial_recursive(number - 1)` tiến về base case.

> Ở đây dùng `return 1;` (explicit) trong base case vì nếu chỉ viết `1` thì code sau `if` vẫn chạy. Dùng `if/else` cũng được. `return` cho thoát sớm là chỗ hợp lệ để dùng (bài 31).

So hai bản:

| | Iterative | Recursive |
|---|---|---|
| Dừng bằng | `while count > 0` | base case `number <= 1` |
| Bộ nhớ | hằng số | tốn stack (mỗi lần gọi) |
| Idiomatic Rust | **ưu tiên** | dùng khi cấu trúc tự nhiên đệ quy |

Cùng kết quả; iterative an toàn hơn (không tràn stack), recursive gọn và sát định nghĩa toán học.

---

# Section Review — tổng kết Control Flow

## Rẽ nhánh: if / else if / else

- `if <bool> { }`: chạy khi true; **không ngoặc**, **không truthiness**.
- `else if`: điều kiện kế nếu cái trước false; `else`: fallback.
- Rust dừng ở **match đầu tiên**; có `else` → đảm bảo một nhánh chạy.
- `if` là **expression** → gán vào biến (thay ternary); mọi nhánh cùng type.

## match

- `match value { pattern => code }`: so với mọi biến thể; **exhaustive** (compiler bắt phủ đủ).
- `_` = catch-all (đặt cuối); bind tên để dùng giá trị còn lại.
- Nâng cao: `|` (nhiều giá trị), `..=` (range), **match guard** `if`, `unreachable!()`.
- `match` là expression → trả giá trị; mọi arm cùng type.

## Vòng lặp: loop / while / for

```text
loop  : lặp vô hạn, dừng bằng break (break trả giá trị được)
while : lặp khi điều kiện true, tự dừng khi false
for   : duyệt collection/range (an toàn nhất, idiomatic)
```

- `break` thoát hẳn; `continue` bỏ vòng hiện tại, sang vòng kế.
- Labeled loop `'name:` + `break 'name` thoát loop ngoài.
- Vòng lặp cần thay đổi state, nếu không vô hạn.

## Recursion

- Hàm **gọi chính nó**; cần **base case** (dừng) + recursive case (tiến về base).
- **Call stack** theo dõi các lời gọi; thiếu base case → **stack overflow**.
- Mọi recursion viết được bằng iteration — Rust ưu tiên iteration.

## Debugging

- Breakpoint dừng tại dòng; xem Variables, Call Stack; Step Over/Into/Out.
- Extension: CodeLLDB (Mac/Linux), C/C++ (Windows).

## Bản đồ phase Control Flow

```text
RẼ NHÁNH
  if / else if / else  (if là expression → gán biến)
  match (exhaustive, _ catch-all, | range guard)

LẶP
  loop  (vô hạn + break, break trả giá trị)
  while (điều kiện động)        + break / continue
  for   (duyệt collection)        (+ labeled loop)
  recursion (base case, call stack, stack overflow)

CÔNG CỤ
  debugger VSCode (breakpoint, step, call stack)
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| Điều kiện `if` không phải bool | Dùng biểu thức trả bool |
| `match` thiếu trường hợp | Phủ đủ hoặc `_` cuối |
| Vòng lặp quên cập nhật state | Đảm bảo tiến tới dừng |
| Recursion thiếu base case | Luôn có điều kiện dừng |
| Nhánh `if`/arm `match` khác type | Mọi nhánh cùng type |
| `_` không đặt cuối match | Đặt `_` cuối cùng |

## Tóm tắt phase Control Flow

- **if/else** (expression, gán biến) và **match** (exhaustive, an toàn) để rẽ nhánh.
- **loop/while/for** để lặp; `break`/`continue` điều khiển; `for` idiomatic nhất.
- **Recursion** (base case + call stack) — mạnh nhưng ưu tiên iteration để tránh tràn stack.
- Debugger VSCode để quan sát từng bước.

Bạn đã biết chương trình **ra quyết định** và **lặp lại**. Phase tiếp theo là trái tim của Rust và là lý do nó tồn tại: **Ownership** — hệ thống quản lý bộ nhớ không cần garbage collector, không cần `free()` thủ công. Đây là khái niệm khó nhất nhưng cũng đặc trưng nhất của Rust, và mọi thứ về scope (phase 2) đã chuẩn bị cho bạn.

**Bài kế tiếp** → [Bài 43: Ownership — hệ thống quản lý bộ nhớ độc nhất của Rust](../phase-6-ownership/01-ownership-la-gi.md)
