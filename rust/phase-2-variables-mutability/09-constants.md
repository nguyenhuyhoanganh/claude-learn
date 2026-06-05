# Bài 16: Constants — hằng số biết tại compile time, sống ở file level

Bạn viết chương trình kế toán. Thuế suất là `0.0725`, dùng ở 10 function khác nhau. Nếu khai báo `let tax_rate = 0.0725;` trong từng function, bạn lặp lại 10 lần — sửa thuế là sửa 10 chỗ. Tệ hơn: biến `let` chết theo scope function, không function nào dùng chung được. Giải pháp: **constant**.

## Constant là gì

**Constant** (hằng số) = một tên gán cho một giá trị **không bao giờ đổi** suốt chương trình. Khai báo bằng keyword `const`.

```rust
const TAX_RATE: f64 = 0.0725;

fn main() {
    println!("Thuế suất: {TAX_RATE}");
}
```

Nghe giống immutable variable (`let` không `mut`)? Gần giống, nhưng có **hai khác biệt cốt lõi** khiến constant là một công cụ riêng.

## Khác biệt 1: scope — file level vs function

Biến `let` bị giới hạn trong scope function (bài 15). Constant có thể khai báo ở **bất kỳ scope nào, kể cả file level** — ngoài mọi function — và mọi function trong file đều dùng được.

```rust
const TAX_RATE: f64 = 0.0725;     // file level — ai cũng thấy

fn calculate_tax(income: f64) -> f64 {
    income * TAX_RATE              // dùng được
}

fn display_rate() {
    println!("{TAX_RATE}");        // cũng dùng được
}

fn main() {
    let tax = calculate_tax(50000.0);
    println!("{tax}");             // 3625
}
```

`TAX_RATE` khai báo một lần ở đỉnh file, ba function dùng chung. Sửa thuế = sửa **một dòng**. Đây là antidote cho **magic number** — con số trần trụi rải khắp code không ai biết nghĩa gì.

## Khác biệt 2: giá trị phải biết tại compile time

Giá trị biến `let` xác định lúc **runtime** (khi chương trình chạy). Giá trị constant phải biết tại **compile time** (khi Rust build chương trình).

```text
                Compile time              Runtime
const TAX = 0.0725   ✓ giá trị đã chốt
let income = ...                          ✓ mới có giá trị (vd từ user)
```

Hệ quả thực tế: **không thể** dùng constant cho giá trị chỉ biết khi chạy:

```rust
const USER_INPUT: String = get_user_input();   // ERROR
//                         ^^^^^^^^^^^^^^^^ gọi function lúc runtime
```

User input chỉ có khi chương trình chạy → phải là biến, không thể là constant. Constant dành cho giá trị **bạn biết trước, hard-code, lặp lại nhiều nơi**: thuế suất, số Pi, max retry, tên app, port mặc định.

Giá trị constant được **nhúng thẳng vào executable** lúc compile — không tốn lookup runtime.

## Khác biệt 3 (cú pháp): bắt buộc type annotation

Với `let`, Rust tự suy type (inference). Với `const`, bạn **bắt buộc** ghi rõ type — không có ngoại lệ.

```rust
const TAX_RATE: f64 = 0.0725;     // : f64 BẮT BUỘC
const MAX_USERS: u32 = 10_000;
const APP_NAME: &str = "Ledger";

// const TAX_RATE = 0.0725;        // ERROR: missing type for `const`
```

Cú pháp type annotation: sau tên thêm `:`, một space, rồi type.

```text
const TAX_RATE : f64 = 0.0725 ;
      ───────   ───   ──────
      tên       type  giá trị
```

Vì sao bắt buộc? Constant là API ngầm — nó hiện diện file level, nhiều nơi dựa vào. Bắt ghi type giúp ý định rõ ràng, không để compiler đoán cho một thứ ảnh hưởng rộng.

## Quy ước đặt tên: SCREAMING_SNAKE_CASE

Constant viết **TOÀN HOA**, từ cách nhau bằng `_`:

```rust
const MAX_CONNECTIONS: u32 = 100;
const PI: f64 = 3.14159;
const DEFAULT_TIMEOUT_SECONDS: u64 = 30;
```

Sai convention thì compiler warn (không lỗi):

```rust
const tax_rate: f64 = 0.0725;
```
```text
warning: constant `tax_rate` should have an upper case name
  help: convert the identifier to upper case: `TAX_RATE`
```

Toàn hoa giúp người đọc **nhìn là biết** đây là hằng số, phân biệt ngay với biến snake_case thường.

## So sánh đầy đủ: const vs let vs let mut

| Tiêu chí | `const` | `let` (immutable) | `let mut` |
|---|---|---|---|
| Đổi giá trị được? | Không bao giờ | Không | Có |
| Khai báo file level? | **Có** | Không | Không |
| Biết tại compile time? | **Bắt buộc** | Không (runtime) | Không |
| Type annotation? | **Bắt buộc** | Tuỳ chọn (infer) | Tuỳ chọn |
| Dùng `mut`? | **Cấm** | — | Có |
| Naming | `SCREAMING_SNAKE` | `snake_case` | `snake_case` |
| Nhúng vào binary? | Có | Không | Không |

## Đào sâu: const được "inline" tại mỗi nơi dùng

Constant không phải một ô nhớ cố định mà cả chương trình trỏ tới. Compiler **inline** — chép giá trị thẳng vào từng chỗ dùng:

```rust
const TAX: f64 = 0.0725;
let a = price_a * TAX;     // compiler biến thành price_a * 0.0725
let b = price_b * TAX;     // price_b * 0.0725
```

Sau compile, không còn "biến TAX" nào trong binary — chỉ còn các literal `0.0725` rải tại điểm dùng. Đây là lý do const phải biết tại compile time: không có giá trị sẵn thì không inline được.

### const vs static — đừng nhầm

Rust còn có `static`, nhìn na ná const nhưng khác bản chất:

```rust
const MAX: u32 = 100;              // inline, không có địa chỉ cố định
static GREETING: &str = "Hi";      // MỘT ô nhớ cố định, có địa chỉ
```

- `const`: inline mỗi nơi dùng, **không** có địa chỉ memory cố định.
- `static`: tồn tại **một** instance duy nhất với địa chỉ cố định suốt đời chương trình.

99% trường hợp bạn muốn `const`. `static` chỉ cần khi thực sự cần một địa chỉ chung (ví dụ buffer toàn cục, hoặc `static mut` trong unsafe — hiếm và nguy hiểm). Mới học cứ dùng `const`.

## Use case thực tế

```rust
const MAX_LOGIN_ATTEMPTS: u8 = 5;
const SESSION_TIMEOUT_SECS: u64 = 1800;       // 30 phút
const API_BASE_URL: &str = "https://api.example.com";
const PI: f64 = std::f64::consts::PI;          // const có thể tham chiếu const khác

fn check_attempts(attempts: u8) -> bool {
    attempts < MAX_LOGIN_ATTEMPTS
}
```

Gom config hard-code vào const ở đỉnh file/module: muốn đổi giới hạn đăng nhập từ 5 thành 3, sửa một dòng, áp dụng toàn bộ. Đây là cách production code tránh magic number và giữ cấu hình tập trung.

## Khi nào KHÔNG dùng constant

- **Giá trị chỉ biết lúc runtime** (user input, đọc file, biến môi trường) → phải dùng biến.
- **Giá trị tính từ logic phức tạp runtime** → biến. (Rust có `const fn` cho một số tính toán compile-time, nhưng giới hạn — học sau.)
- **Giá trị chỉ dùng một lần trong một function nhỏ** → biến `let` cục bộ đủ rõ, không cần đẩy lên const file level.

Const là cho giá trị **cố định + biết trước + dùng nhiều nơi**. Thiếu một trong ba, cân nhắc biến thường.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên type annotation | `error: missing type` | Luôn ghi `: Type` |
| Đặt tên snake_case | Warning | Dùng `SCREAMING_SNAKE_CASE` |
| Dùng `const mut` | Lỗi cú pháp | Const luôn immutable, không có `mut` |
| Gán giá trị runtime cho const | Compile error | Dùng biến cho giá trị runtime |
| Nhầm const với static | Hiểu sai memory model | const inline; static một địa chỉ cố định |
| Lạm dụng const cho giá trị một-lần | Code rườm rà | Giá trị cục bộ dùng `let` |

## Tóm tắt bài 16

- **Constant** = tên gán giá trị **không bao giờ đổi**, khai báo bằng `const`.
- Ba khác biệt với biến: (1) khai báo được ở **file level**, (2) giá trị **biết tại compile time**, (3) **bắt buộc** type annotation.
- Naming: `SCREAMING_SNAKE_CASE`. Sai thì warn.
- Compiler **inline** const vào mỗi nơi dùng — antidote cho magic number.
- `const` ≠ `static`: const inline; static là một địa chỉ cố định (hiếm dùng).
- Dùng cho giá trị cố định, biết trước, lặp nhiều nơi. Giá trị runtime phải là biến.

**Bài kế tiếp** → [Bài 17: Type Aliases — đặt biệt danh cho type để code rõ nghĩa](10-type-aliases.md)
