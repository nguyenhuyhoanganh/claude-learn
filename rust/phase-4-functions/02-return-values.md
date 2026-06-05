# Bài 31: Return Values — explicit `return`, implicit (bỏ `;`), unit type `()`

Parameter là **input** chảy vào function. Mặt còn lại là **return value** — **output** function trả ra. Một function tính bình phương mà không trả kết quả thì vô dụng. Bài này: hai cách trả giá trị (và vì sao cách "ngầm" lại là chuẩn của Rust), cộng cái bẫy dấu `;` nổi tiếng.

## Return value là gì

**Return value** (giá trị trả về) = **output** của function — thứ nó tạo ra và **trả lại** cho **caller** (nơi đã gọi nó).

```rust
fn square(number: i32) -> i32 {
    return number * number;
}

fn main() {
    let result = square(5);        // result = 25 — nhận return value
    println!("{result}");
}
```

Để khai báo return value cần **hai** thứ:
1. **Annotate type trả về** trong chữ ký hàm: `-> type` (sau cặp `()`).
2. **Trả giá trị** trong thân hàm (explicit hoặc implicit).

```text
fn square(number: i32) -> i32 {
│                         │
│                         └ type trả về (sau mũi tên ->)
└ parameter & type
```

Mũi tên `->` là dấu trừ `-` + dấu lớn hơn `>`. Type trả về **không cần** trùng type parameter — tuỳ hàm làm gì:

```rust
fn is_adult(age: i32) -> bool {    // nhận i32, trả bool
    return age >= 18;
}
```

## Cách 1: explicit return với `return`

Dùng keyword `return` + giá trị + `;`:

```rust
fn square(number: i32) -> i32 {
    return number * number;
}
```

Compiler **bắt bạn chịu trách nhiệm** với type đã khai:

```rust
fn square(number: i32) -> i32 {
    return true;               // ERROR — khai i32 mà trả bool
}
```
```text
error[E0308]: mismatched types: expected `i32`, found `bool`
```

### `return` kết thúc function ngay

`return` **terminate** (chấm dứt) function — code sau nó **không bao giờ chạy**:

```rust
fn square(number: i32) -> i32 {
    return number * number;
    let x = 1 + 1;             // warning: unreachable expression
}
```

Sau `return`, hàm kết thúc. Dòng sau là "code chết" (unreachable) — compiler cảnh báo.

## Cách 2: implicit return — bỏ `return` và `;`

Rust có lối tắt: function **tự động trả về kết quả của dòng cuối được đánh giá**. Không cần keyword `return`. Để dùng, làm **hai** việc:

1. **Bỏ** keyword `return`.
2. **Bỏ dấu `;`** ở dòng cuối — đây là phần then chốt.

```rust
fn square(number: i32) -> i32 {
    number * number            // KHÔNG có ; → tự động là return value
}
```

Cùng kết quả `25`, nhưng gọn và idiomatic hơn.

### Bẫy dấu `;` — quan trọng nhất bài này

Dấu `;` quyết định dòng cuối là **giá trị trả về** hay **statement vô giá trị**:

```rust
fn square(number: i32) -> i32 {
    number * number;           // CÓ ; → statement, KHÔNG trả gì → trả unit ()
}
```
```text
error[E0308]: mismatched types
  expected `i32`, found `()`
  |     number * number;
  |                    - help: remove this semicolon to return this value
```

Hãy nghĩ dấu `;` như **dấu chấm hết câu**:
- **Không `;`**: ý chưa kết thúc → giá trị "chảy ra" thành return value.
- **Có `;`**: ý đã trọn → statement độc lập, giá trị bị vứt, hàm trả unit.

```text
number * number      ← KHÔNG ; → biểu thức (expression) → return value
number * number ;    ← CÓ ;    → câu lệnh (statement)    → vứt giá trị
```

> Quy ước cộng đồng Rust **ưu tiên implicit return** (idiomatic). `return` để dành cho thoát sớm giữa hàm (early return) — gặp khi học `if`. Dòng cuối không `;` là chuẩn.

So sánh hai cách:

| | Explicit | Implicit |
|---|---|---|
| Keyword | `return value;` | (không) |
| Dấu `;` | Có | **Không** |
| Vị trí | Bất kỳ đâu (thoát sớm) | Chỉ dòng cuối |
| Idiomatic? | Cho early return | **Mặc định ưa dùng** |

## Unit type `()` — khi function không trả gì

Function **không** khai `-> type` và **không** trả giá trị thì trả về **unit** — tuple rỗng `()`, nghĩa "không có giá trị có ý nghĩa".

```rust
fn greet(name: &str) {          // không có -> ... → trả unit ()
    println!("Chào {name}");
}
```

Cú pháp `()` vừa là **giá trị** vừa là **type** (cùng ký hiệu). Vì unit là **mặc định**, bạn **không cần** ghi `-> ()`:

```rust
fn greet(name: &str) -> () {    // hợp lệ nhưng thừa
    println!("Chào {name}");
}

fn greet2(name: &str) {         // tương đương, gọn hơn — bỏ -> ()
    println!("Chào {name}");
}
```

Mọi function **luôn** có return value:
- Bạn trả tường minh bằng `return`, **hoặc**
- Dòng cuối không `;` (implicit), **hoặc**
- Không có gì cả → trả `()`.

```rust
fn does_nothing() {
    // thân rỗng → trả ()
}

fn prints() {
    println!("hi");             // dòng cuối CÓ ; → trả ()
}
```

## Đào sâu: vì sao Rust thiết kế implicit return

Implicit return không phải mánh cú pháp — nó đến từ việc **mọi thứ trong Rust là expression** (biểu thức có giá trị). Thân function là một block, block trả về dòng cuối không `;` (đã thấy ở bài Scopes). Hệ quả: `if`, `match`, block đều trả giá trị được — bài 32 sẽ đào sâu statement vs expression.

Điều này khác C/Java (nơi `return` bắt buộc) và làm code Rust ngắn, ít nhiễu. Đánh đổi: người mới hay quên/thừa dấu `;` — nhưng compiler chỉ rõ chỗ sửa ("remove this semicolon").

## Use case thực tế

```rust
fn calculate_discount(price: f64, is_member: bool) -> f64 {
    if is_member {
        price * 0.9            // member giảm 10% — implicit return từ nhánh if
    } else {
        price                  // không giảm
    }
}

fn parse_or_default(input: &str) -> i32 {
    match input.trim().parse::<i32>() {
        Ok(n) => n,            // parse thành công → trả n
        Err(_) => 0,           // lỗi → trả mặc định 0
    }
}

fn main() {
    println!("{}", calculate_discount(100.0, true));   // 90
    println!("{}", parse_or_default("42"));            // 42
    println!("{}", parse_or_default("abc"));           // 0
}
```

`if`/`match` là expression → nhánh cuối không `;` trở thành return value. Pattern cực phổ biến trong Rust idiomatic.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thừa `;` ở implicit return | Trả `()` thay vì giá trị | Bỏ `;` dòng cuối |
| Quên `-> type` khi có trả về | Compile error | Khai type sau `->` |
| Code sau `return` | Unreachable warning | Bỏ code chết |
| Type trả về sai với khai báo | Compile error | Khớp `-> type` |
| Ghi `-> ()` thừa | (không lỗi, dư) | Bỏ khi trả unit |
| Tưởng phải luôn dùng `return` | Code rườm rà | Implicit là idiomatic |

## Tóm tắt bài 31

- **Return value** = output hàm trả cho caller; cần khai `-> type` + trả giá trị.
- **Explicit**: `return value;` — kết thúc hàm ngay, code sau là unreachable.
- **Implicit** (idiomatic): dòng cuối **bỏ `;`** → tự động là return value.
- **Bẫy `;`**: có `;` = statement vứt giá trị (trả `()`); không `;` = expression trả giá trị.
- Không khai/không trả gì → trả **unit `()`**; không cần ghi `-> ()`.
- Implicit return đến từ "mọi thứ là expression" — nền cho `if`/`match` trả giá trị (bài 32).

**Bài kế tiếp** → [Bài 32: Blocks, Statements & Expressions — chìa khoá hiểu cú pháp Rust](03-blocks-statements-expressions.md)
