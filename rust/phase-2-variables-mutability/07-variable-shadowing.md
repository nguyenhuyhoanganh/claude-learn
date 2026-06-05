# Bài 14: Variable Shadowing — dùng lại tên cũ với type mới

Bạn nhận input từ user qua terminal. Mọi thứ gõ vào terminal đều là **string** — kể cả khi user gõ `100`. Bạn muốn biến chuỗi `"100"` thành số `100` để tính toán. Câu hỏi: đặt tên biến gì cho kết quả?

```rust
let weight_as_string = "100";
let weight_as_float = 100.0;     // parse từ string
let weight_as_int = 100;         // round float
```

Ba cái tên cho **cùng một khái niệm** (cân nặng), chỉ khác stage xử lý. Xấu, dài dòng, dễ nhầm. Rust có giải pháp: **variable shadowing** — khai báo lại cùng tên, kể cả khác type.

## Shadowing là gì — định nghĩa chính xác

**Shadowing** (che bóng) = dùng `let` **lần nữa** với một tên biến **đã tồn tại**. Lần khai báo mới **vô hiệu hoá** (invalidate) lần khai báo cũ — cái cũ bị "che bóng" bởi cái mới.

```rust
fn main() {
    let grams_of_protein = "100.345";       // String
    let grams_of_protein = 100.345;          // f64 — shadow lần 1
    let grams_of_protein = 100;              // i32 — shadow lần 2
}
```

Sau mỗi dòng `let`, `grams_of_protein` trở thành một **binding hoàn toàn mới**:
- Dòng 1 → `grams_of_protein` là `&str`.
- Dòng 2 → `grams_of_protein` là `f64`. Bản String bị che.
- Dòng 3 → `grams_of_protein` là `i32`. Bản f64 bị che.

Điểm mấu chốt: shadowing **không** sửa giá trị biến cũ — nó **tạo biến mới** trùng tên. Biến cũ vẫn nằm đó trong memory cho đến hết scope, chỉ là cái tên không trỏ tới nó nữa.

```text
Memory (stack)                Tên "grams_of_protein" trỏ tới đâu
┌──────────────────┐
│ "100.345" (&str) │ ← sau dòng 1
├──────────────────┤
│ 100.345  (f64)   │ ← sau dòng 2 (dòng 1 còn đó, nhưng bị che)
├──────────────────┤
│ 100      (i32)   │ ← sau dòng 3 (active version)
└──────────────────┘
```

## Use case kinh điển: chuỗi transformation

Đây là lý do shadowing tồn tại. Một giá trị đi qua nhiều bước biến đổi, mỗi bước đổi type, nhưng **ý nghĩa không đổi**:

```rust
fn main() {
    let input = "  42  ";                 // &str — raw từ user
    let input = input.trim();             // &str — bỏ khoảng trắng
    let input = input.parse::<i32>().unwrap();  // i32 — số thực sự
    let input = input * 2;                // i32 — đã xử lý

    println!("{input}");                   // 84
}
```

Không shadowing, bạn phải đẻ ra `raw_input`, `trimmed_input`, `parsed_input`, `final_input` — 4 cái tên rác cho 1 luồng dữ liệu. Shadowing giữ code sạch: 1 tên, đi qua pipeline.

> Để ý dòng 3: `let input = input.parse()...` — vế phải dùng `input` cũ (bản trim) để tính ra `input` mới. Rust evaluate vế phải **trước**, nên cái `input` bên phải vẫn là bản cũ. Bình thường và an toàn.

## Shadowing vs Mutability — khác nhau ở đâu

Người mới hay nhầm shadowing với `mut`. Chúng giải quyết 2 bài toán khác nhau.

| | `let mut x` rồi `x = ...` | `let x = ...` rồi `let x = ...` |
|---|---|---|
| Bản chất | Đổi **giá trị** của cùng 1 biến | Tạo **biến mới** trùng tên |
| Đổi được type? | **Không** — type cố định | **Có** — type tuỳ ý |
| Số binding | 1 binding duy nhất | Nhiều binding (cái sau che cái trước) |
| Cú pháp gán lại | `x = 5;` (không có `let`) | `let x = 5;` (có `let`) |

Ví dụ minh hoạ điểm "không đổi type được" của `mut`:

```rust
fn main() {
    let mut spaces = "   ";        // &str
    spaces = spaces.len();          // ERROR: mismatched types
}
```

```text
error[E0308]: mismatched types
 --> src/main.rs:3:14
  |
3 |     spaces = spaces.len();
  |              ^^^^^^^^^^^^ expected `&str`, found `usize`
```

`mut` cho **đổi giá trị**, không cho **đổi type**. Cùng case với shadowing thì chạy ngon:

```rust
fn main() {
    let spaces = "   ";            // &str
    let spaces = spaces.len();      // usize — OK, binding mới
    println!("{spaces}");           // 3
}
```

## Kết hợp shadowing với mut

Hai cơ chế không loại trừ nhau. Bạn có thể shadow để đổi type, rồi cho binding mới `mut` để đổi giá trị:

```rust
fn main() {
    let count = "5";              // &str, immutable
    let mut count = 5;            // i32, mutable — shadow + mut
    count = 10;                   // OK: gán giá trị i32 mới
    count = 15;                   // OK
    // count = "20";              // ERROR: count giờ là i32, không nhận &str
}
```

Sau shadow ở dòng 2, `count` là `i32` mutable. Gán `10`, `15` đều OK (cùng type). Gán `"20"` thì lỗi — type đã chốt là `i32`.

## Đào sâu: shadowing không free — nhưng compiler tối ưu

Mỗi `let` về lý thuyết tạo một binding mới với địa chỉ stack riêng. Nghe như tốn memory? Thực tế **không** — Rust compile qua LLVM với tối ưu hoá. Nếu bản cũ không còn dùng, compiler tái sử dụng slot hoặc loại bỏ hẳn (dead code elimination). Ở release build, ba dòng shadow thường gộp thành vài lệnh CPU, zero overhead so với viết tay.

Điều này khác hẳn ngôn ngữ có garbage collector: ở đó mỗi biến mới có thể tạo rác cho GC dọn. Rust quyết định mọi thứ ở compile time — shadowing là **zero-cost abstraction**, một triết lý xuyên suốt Rust: tính năng tiện cho người viết nhưng không phạt hiệu năng runtime.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng shadow sửa biến cũ | Hiểu sai logic | Nhớ: shadow tạo binding **mới** |
| Shadow nhầm trong vòng lặp, mất giá trị tích luỹ | Bug logic | Cần tích luỹ thì dùng `mut`, không shadow |
| Shadow trong inner scope rồi mong dùng ở outer | Biến out of scope | Shadow trong block chỉ sống trong block (xem [[08-scopes]]) |
| Dùng `mut` rồi cố đổi type | `error[E0308]` | Đổi type thì shadow, không phải `mut` |
| Shadow vô tình do trùng tên | Đè mất biến cần dùng | Đặt tên rõ ràng, bật clippy lint |

Ví dụ bẫy "shadow trong scope":

```rust
fn main() {
    let x = 5;
    {
        let x = x * 2;       // shadow trong inner block
        println!("{x}");      // 10
    }
    println!("{x}");          // 5 — bản outer, inner shadow đã chết
}
```

Inner `x = 10` chỉ tồn tại trong cặp `{}`. Ra khỏi block, tên `x` lại trỏ về bản outer `5`. Đây là cầu nối sang bài Scopes.

## Khi nào KHÔNG nên shadow

Shadowing tiện nhưng lạm dụng gây khó đọc:

- **Tích luỹ giá trị trong loop** → dùng `mut`, không shadow (shadow trong loop reset mỗi vòng).
- **Hai khái niệm khác nhau tình cờ trùng tên** → đặt tên khác, đừng để shadow che mất biến quan trọng.
- **Đoạn code dài** → shadow nhiều lần khiến reader phải lần ngược xem tên đang là type/giá trị gì. Giới hạn shadow trong block ngắn, gần nhau.

Quy tắc thực dụng: shadow khi **cùng khái niệm, đổi dạng**; tránh shadow khi hai thứ khác nhau.

## Tóm tắt bài 14

- Shadowing = dùng `let` lần nữa với tên cũ → tạo **binding mới**, vô hiệu hoá cái cũ.
- Khác `mut`: shadow **đổi được type**, `mut` chỉ đổi giá trị (giữ nguyên type).
- Use case số 1: chuỗi transformation đổi type mà giữ một tên (string → trim → parse → tính).
- Vế phải `let` evaluate trước, nên `let x = x + 1` dùng `x` cũ để tạo `x` mới — an toàn.
- Shadow trong inner block chỉ sống trong block đó, không rò ra ngoài.
- Zero-cost: compiler tối ưu, không phạt hiệu năng.

**Bài kế tiếp** → [Bài 15: Scopes — block, biến sống và chết theo cặp `{}`](08-scopes.md)
