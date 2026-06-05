# Bài 20: Data Types & Integers — i8 đến i128, signed/unsigned, overflow

Bạn viết `let x = 5;` và rust-analyzer hiện `: i32`. Vì sao `i32` mà không phải `i8` hay `i64`? Vì sao Rust **bắt buộc** biết type của mọi biến trước khi chạy? Phase này trả lời: mỗi giá trị thuộc một **type**, và Rust kiểm soát type cực kỳ chặt — đó là gốc rễ của sự an toàn và tốc độ của Rust.

## Vì sao Rust cần biết type tại compile time

Rust là ngôn ngữ **statically typed** (định type tĩnh): compiler phải biết type của **mọi** biến tại **compile time**, trước khi chương trình chạy.

Lý do là **bộ nhớ**. Khi biết "biến này là `i32`", compiler biết nó cần đúng **32 bit** memory. Lúc chạy, chương trình xin đúng chừng đó, đặt giá trị vào, không thừa không thiếu. Không có type, compiler không biết xin bao nhiêu memory → không tối ưu được.

```text
let x = 5;   →  compiler: "i32 → cần 32 bit"  →  runtime: xin 32 bit, lưu 5
```

Đây là khác biệt nền tảng với Python/JavaScript (dynamically typed — type biết lúc chạy). Rust quyết mọi thứ sớm → nhanh hơn và bắt lỗi type ngay khi compile.

## Scalar vs Compound — hai nhóm type lớn

| Nhóm | Định nghĩa | Ví dụ |
|---|---|---|
| **Scalar** (vô hướng) | Giữ **một** giá trị | integer, float, bool, char |
| **Compound** (gộp) | Giữ **nhiều** giá trị | array, tuple |

Bài này và vài bài tới lo scalar (số, bool, char). Array/tuple (compound) ở bài 26, 28. Giờ bắt đầu với integer.

## Integer — số nguyên, hai họ signed và unsigned

**Integer** = số nguyên (không có phần thập phân). Rust chia integer thành hai họ:

- **Signed** (có dấu): hỗ trợ **cả âm lẫn dương**. Bắt đầu bằng `i` (integer). VD: `i8`, `i32`.
- **Unsigned** (không dấu): chỉ **0 và dương**. Bắt đầu bằng `u`. VD: `u8`, `u32`.

Số sau `i`/`u` là **số bit** chiếm trong memory. `i32` = 32 bit; `u8` = 8 bit.

```text
i 32        u 8
│  │        │ │
│  └ bit    │ └ bit
└ signed    └ unsigned
```

### Bit và byte — đơn vị memory

- **Bit** = đơn vị nhỏ nhất, chứa `0` hoặc `1`.
- **8 bit = 1 byte**.
- 1024 byte = 1 KB, 1024 KB = 1 MB, 1024 MB = 1 GB.

`i32` = 32 bit = 4 byte. `i8` = 8 bit = 1 byte (bằng 1/4 i32).

### Bảng range đầy đủ

| Type | Bit | Range |
|---|---|---|
| `i8` | 8 | −128 … 127 |
| `u8` | 8 | 0 … 255 |
| `i16` | 16 | −32,768 … 32,767 |
| `u16` | 16 | 0 … 65,535 |
| `i32` | 32 | −2,147,483,648 … 2,147,483,647 |
| `u32` | 32 | 0 … 4,294,967,295 |
| `i64` | 64 | ≈ −9.2×10¹⁸ … 9.2×10¹⁸ |
| `u64` | 64 | 0 … ≈ 1.8×10¹⁹ |
| `i128` / `u128` | 128 | số khổng lồ |

**Quy luật quan trọng**: cùng số bit, unsigned đi xa gấp đôi về phía dương — vì không phải dành 1 bit lưu dấu âm/dương. So `i8` (−128…127) với `u8` (0…255): cùng 8 bit, nhưng `u8` tiến tới 255 thay vì 127.

## Khai báo và annotate integer

Mặc định Rust infer integer là **`i32`** (cân bằng tốt: đủ lớn, CPU xử lý nhanh, phổ biến). Muốn type khác phải annotate:

```rust
fn main() {
    let eight_bit: i8 = -112;          // annotate sau tên
    let unsigned: u8 = 200;
    let big = 5_000_000_000i64;         // annotate ở cuối literal (không space)
    let default = 5;                    // không annotate → i32
}
```

Hai cách annotate:
- Sau tên: `let x: i8 = 50;` (phổ biến, nhất quán với mọi type).
- Gắn vào literal: `let x = 50i8;` (gặp đôi khi, gọn).

### Giá trị vượt range = compile error

```rust
let x: i8 = -210;        // i8 chỉ tới −128
```
```text
error: literal out of range for `i8`
  = note: the literal `-210` does not fit into the type `i8`
          whose range is `-128..=127`
```

```rust
let y: u8 = 400;         // u8 chỉ tới 255 → lỗi
let z: u8 = -15;         // u8 không nhận âm → lỗi
```

Rust bắt lỗi **ngay khi compile** nếu literal vượt range — không đợi tới runtime mới nổ.

## Dấu `_` làm dải phân cách cho số

Số nhiều chữ số khó đọc. Rust cho chèn `_` bất kỳ đâu trong số để dễ nhìn — compiler **bỏ qua hoàn toàn** `_`:

```rust
let million = 1_000_000;          // = 1000000
let card = 1234_5678_9012_3456;    // nhóm 4 như thẻ tín dụng
let weird = 1_2__3___4;            // hợp lệ nhưng kỳ quặc
```

Quy ước: nhóm 3 chữ số như dấu phẩy trong toán học. Thuần để người đọc, không ảnh hưởng giá trị.

## usize và isize — kích thước theo kiến trúc máy

Mọi integer trên đều **cố định** bit (i32 luôn 32 bit mọi máy). Có hai type đặc biệt **đổi kích thước theo máy chạy**:

- `usize` — unsigned, kích thước theo kiến trúc.
- `isize` — signed, kích thước theo kiến trúc.

```text
Máy 32-bit:   usize = u32,  isize = i32
Máy 64-bit:   usize = u64,  isize = i64
```

```rust
let days: usize = 55;        // u32 hay u64 tuỳ máy
let temp: isize = -15_000;   // i32 hay i64 tuỳ máy
```

Lợi ích: một đoạn code chạy đúng trên mọi kiến trúc, tự dùng kích thước phù hợp. Quan trọng hơn: `usize` là **type chuẩn để đánh index** mảng/vector trong Rust — bạn sẽ gặp liên tục ở phase Vectors, Slices. Lý do: index không bao giờ âm và phải khớp khả năng địa chỉ hoá của máy.

## Đào sâu: integer overflow — Rust xử lý ra sao

Điều gì xảy ra khi cộng vượt range lúc **runtime** (không phải literal cố định)?

```rust
let x: u8 = 255;
let y = x + 1;        // 256 vượt u8 (max 255)
```

Rust xử lý **khác nhau giữa debug và release**:

| Build | Hành vi khi overflow |
|---|---|
| **Debug** (`cargo run`) | **Panic** — chương trình dừng, báo `attempt to add with overflow` |
| **Release** (`cargo run --release`) | **Wrap around** — 255 + 1 = 0 (quay vòng), không panic |

Đây là quyết định thiết kế quan trọng: debug bắt lỗi sớm để dev thấy; release ưu tiên tốc độ (không check). Trong C, overflow là **undefined behavior** — nguồn vô số bug bảo mật. Rust chặt hơn nhiều.

Cần kiểm soát rõ ràng? Dùng method chuyên dụng thay vì `+`:

```rust
let a: u8 = 255;
let b = a.checked_add(1);        // None nếu overflow → Option<u8>
let c = a.wrapping_add(1);        // 0 — cố ý quay vòng
let d = a.saturating_add(1);      // 255 — kẹp ở max
let (e, of) = a.overflowing_add(1);  // (0, true) — kèm cờ báo overflow
```

`checked_add` trả `Option` (bài Option/Result) — pattern an toàn cho tính toán có thể tràn. Production code xử lý tiền/đếm nên cân nhắc các method này thay vì `+` trần.

## Đừng ám ảnh tối ưu memory sớm

Người mới hay cố dùng type nhỏ nhất (`i8` cho mọi số nhỏ). Đây thường là **tối ưu sớm** (premature optimization) làm code tệ hơn. Văn hoá "tiết kiệm từng bit" đến từ thời C (1972), máy yếu, memory hiếm. Máy hiện đại mạnh — dùng `i32` cho số nhỏ hoàn toàn ổn, không chậm đi.

Thứ tự ưu tiên: (1) viết chương trình **chạy đúng**, (2) tối ưu memory **sau**, chỉ khi thực sự cần (môi trường nhúng, dữ liệu cực lớn). Mặc định `i32`/`i64` là đủ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gán giá trị vượt range | Compile error | Chọn type đủ lớn |
| Gán âm cho unsigned | Compile error | Dùng signed nếu cần âm |
| Tưởng overflow luôn panic | Release lại wrap, sai âm thầm | Dùng `checked_/saturating_add` khi quan trọng |
| Dùng i32 để index mảng | Type mismatch | Index dùng `usize` |
| Ám ảnh dùng i8 mọi nơi | Code rườm rà, dễ tràn | Mặc định i32, tối ưu sau |
| Quên `_` chỉ là trang trí | (không sao) | `_` không đổi giá trị |

## Tóm tắt bài 20

- Rust **statically typed**: biết type mọi biến tại compile time để cấp đúng memory.
- Integer hai họ: **signed** (`i`, âm+dương) và **unsigned** (`u`, 0+dương); số là **bit**.
- Cùng bit, unsigned đi xa gấp đôi phía dương (không tốn bit lưu dấu).
- Mặc định infer **`i32`**; annotate bằng `: type` hoặc gắn literal `50i8`.
- `_` là dải phân cách trang trí; `usize`/`isize` đổi kích thước theo máy, dùng để **index**.
- Overflow: debug **panic**, release **wrap**; dùng `checked_add`… khi cần kiểm soát.

**Bài kế tiếp** → [Bài 21: Strings & Methods — string literal, ký tự đặc biệt, raw string, gọi method](02-strings-va-methods.md)
