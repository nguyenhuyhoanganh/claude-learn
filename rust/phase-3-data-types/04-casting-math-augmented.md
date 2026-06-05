# Bài 23: Casting, Math & Augmented Assignment — `as`, phép toán, floor division, `+=`

Rust **không** tự động trộn type. Cộng một `i32` với một `f64` là **lỗi compile** — khác hẳn Python/JavaScript. Bạn phải **chuyển type thủ công** bằng `as`. Bài này: cách cast type, các phép toán (và bẫy floor division), và toán tử rút gọn `+=`.

## Casting với `as`

**Casting** = chuyển một giá trị từ type này sang type khác. Dùng keyword `as`:

```text
value as NewType
```

```rust
fn main() {
    let miles_away = 50;                 // i32
    let as_i8 = miles_away as i8;          // i32 → i8
    let as_u8 = miles_away as u8;          // i32 → u8
    let as_f64 = miles_away as f64;        // i32 → f64 = 50.0
}
```

Biến gốc `miles_away` **không đổi** — `as` tạo giá trị mới cho biến mới.

### Cast float → integer: mất phần thập phân

```rust
let pi = 3.99_f64;
let truncated = pi as i32;        // 3 — CẮT, không làm tròn!
```

Cast float xuống integer **cắt** phần thập phân (như `trunc()`), **không** làm tròn. `3.99 as i32` = `3`, không phải `4`. Muốn làm tròn: `pi.round() as i32`.

### Cast có thể mất dữ liệu âm thầm — đào sâu

`as` là cast "thô" — nó **không** báo lỗi khi giá trị không vừa type đích, mà **cắt bit/quay vòng** âm thầm:

```rust
let big = 300_i32;
let small = big as u8;            // 44 (!) — 300 vượt u8 (max 255), quay vòng

let neg = -1_i32;
let unsigned = neg as u8;         // 255 — bit pattern reinterpret
```

```text
300 = 256 + 44  →  u8 chỉ giữ phần dư  →  44
```

Đây là bẫy nguy hiểm: không panic, không warning, chỉ sai âm thầm. Khi cần chuyển type **an toàn** (báo lỗi nếu không vừa), dùng `try_into` thay vì `as`:

```rust
use std::convert::TryInto;

fn main() {
    let big = 300_i32;
    let result: Result<u8, _> = big.try_into();    // Err — vì không vừa
    match result {
        Ok(v) => println!("ok: {v}"),
        Err(_) => println!("không vừa u8!"),        // chạy nhánh này
    }
}
```

| Cách | Khi không vừa | Khi nào dùng |
|---|---|---|
| `as` | Cắt/quay vòng âm thầm | Biết chắc vừa, hoặc cố ý cắt bit |
| `try_into()` | Trả `Err` | Production, dữ liệu không chắc chắn |

## Phép toán và thuật ngữ

Symbol thực hiện phép toán gọi là **operator** (toán tử); giá trị nó tác động gọi là **operand** (toán hạng).

```text
5 + 4
│ │ │
operand operator operand
```

| Phép | Operator | Ví dụ | Kết quả |
|---|---|---|---|
| Cộng | `+` | `5 + 4` | `9` |
| Trừ | `-` | `10 - 6` | `4` |
| Nhân | `*` | `3 * 4` | `12` |
| Chia | `/` | `10 / 3` | `3` (xem dưới!) |
| Dư (modulo) | `%` | `7 % 2` | `1` |

```rust
fn main() {
    let sum = 5 + 4;            // 9
    let diff = 10 - 6;          // 4
    let product = 3 * 4;        // 12
}
```

Quy ước: đặt space hai bên operator (`5 + 4` không `5+4`) cho dễ đọc; `cargo fmt` tự sửa.

## Floor division — bẫy chia integer

Chia **integer cho integer**, Rust làm **floor division**: trả về **integer**, cắt phần thập phân:

```rust
fn main() {
    let a = 5 / 3;              // 1 — KHÔNG phải 1.666
    let b = 10 / 4;            // 2 — KHÔNG phải 2.5
    let c = 1 / 2;             // 0 (!) — bẫy kinh điển
}
```

`5 / 3`: 3 vào 5 được **1 lần** trọn vẹn → `1`. Phần dư bị vứt.

Muốn kết quả thập phân, chia **float cho float**:

```rust
let exact = 5.0 / 3.0;         // 1.6666666666666667
```

```text
5  / 3   → integer / integer → floor division → 1
5.0/ 3.0 → float   / float   → thập phân       → 1.666...
```

> Bẫy `1 / 2 = 0` gây bug logic âm thầm khi tính trung bình, tỉ lệ phần trăm. Nhớ: có thập phân thì ép một vế thành float (`5 as f64 / 3.0`).

## Modulo — phần dư

`%` trả **phần dư** sau chia:

```rust
fn main() {
    println!("{}", 7 % 2);     // 1 — 2 vào 6, dư 1
    println!("{}", 8 % 2);     // 0 — chia hết
    println!("{}", 9 % 2);     // 1
}
```

Use case kinh điển: kiểm tra **chẵn/lẻ** và chu kỳ:

```rust
let n = 14;
let is_even = n % 2 == 0;       // true
let every_3rd = n % 3 == 0;     // false — không chia hết 3
```

## Augmented assignment — `+=`, `-=`, `*=`, `/=`, `%=`

Rất thường gặp: lấy giá trị biến, áp phép toán, gán lại vào chính nó. Viết dài:

```rust
let mut year = 2025;
year = year + 1;               // 2026
```

**Augmented assignment operator** rút gọn — "tính trước, gán sau":

```rust
let mut year = 2025;
year += 1;                     // 2026 — = year + 1
year -= 5;                     // 2021
year *= 2;                     // 4042
year /= 4;                     // 1010 (floor division!)
year %= 100;                   // 10   (dư)
```

```text
year += 1
     │  │
     │  └ giá trị bên phải
     └ "cộng rồi gán": year = year + 1
```

Biến **bắt buộc `mut`** vì giá trị bị ghi đè.

> Rust **không có** `++` hay `--` như C/Java/JavaScript. Tăng 1 phải viết `x += 1`. Đây là quyết định cố ý: `++` gây nhập nhằng (pre/post-increment) và bug — Rust bỏ hẳn.

## Đào sâu: Rust không tự ép type (no implicit coercion)

Khác Python (`5 + 2.0` chạy), Rust **từ chối** trộn type:

```rust
let x = 5;        // i32
let y = 2.0;      // f64
let z = x + y;    // ERROR: cannot add f64 to i32
```
```text
error[E0277]: cannot add `f64` to `i32`
```

Phải cast rõ ràng:

```rust
let z = x as f64 + y;          // 7.0 — cast i32 → f64 trước
```

Vì sao khắt khe? **An toàn**. Ép type ngầm là nguồn bug tinh vi (mất chính xác, overflow bất ngờ) trong C. Rust buộc bạn **nói rõ ý định** — đổi type là quyết định có chủ đích, không xảy ra sau lưng.

Lưu ý: hai operand của phép toán phải **cùng type**:

```rust
let a: i32 = 5;
let b: i64 = 10;
let c = a + b;                 // ERROR — i32 + i64 không hợp
let c = a as i64 + b;          // OK
```

## Use case thực tế: tính giờ/phút/giây

```rust
fn format_duration(total_secs: u32) -> String {
    let hours = total_secs / 3600;          // floor division
    let minutes = (total_secs % 3600) / 60; // dư rồi chia tiếp
    let seconds = total_secs % 60;
    format!("{hours:02}:{minutes:02}:{seconds:02}")
}

fn main() {
    println!("{}", format_duration(3725));   // 01:02:05
}
```

`/` và `%` phối hợp tách giờ-phút-giây — pattern dùng floor division đúng chỗ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `1 / 2 = 0` (chia integer) | Bug logic âm thầm | Ép float: `1.0 / 2.0` |
| `as` cắt giá trị không vừa | Sai âm thầm, không báo | Dùng `try_into()` |
| Cast float→int tưởng làm tròn | Thực ra **cắt** | `x.round() as i32` |
| Trộn i32 + f64 | Compile error | Cast cùng type trước |
| Quên `mut` khi dùng `+=` | Compile error | `let mut` |
| Tìm `++`/`--` | Không tồn tại | Dùng `+= 1` / `-= 1` |

## Tóm tắt bài 23

- **Casting** với `as`: chuyển type thủ công; float→int **cắt** phần thập phân.
- `as` **cắt/quay vòng âm thầm** khi không vừa → dùng `try_into()` để an toàn.
- **Floor division**: integer / integer trả integer (`5/3 = 1`); cần thập phân thì chia float.
- `%` (modulo) trả phần dư — dùng kiểm tra chẵn/lẻ, chu kỳ.
- **Augmented assignment** `+=` `-=` `*=` `/=` `%=`: tính rồi gán; cần `mut`; Rust không có `++`/`--`.
- Rust **không ép type ngầm**: operand phải cùng type, đổi type phải nói rõ — vì an toàn.

**Bài kế tiếp** → [Bài 24: Booleans & Logic — `bool`, `!`, `==`, `&&`, `||`, short-circuit](05-booleans-va-logic.md)
