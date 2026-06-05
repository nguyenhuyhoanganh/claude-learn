# Bài 19: Project & Section Review — ráp toàn bộ phase Variables

Hết phase Variables. Bài này có hai phần: (1) giải một project nhỏ buộc bạn dùng **mọi** khái niệm đã học cùng lúc, (2) review tổng hợp toàn phase để chốt kiến thức trước khi sang Data Types.

## Đề bài project

Viết một chương trình ghi nhận thông tin một trận đấu, dùng:
- Một biến immutable kèm explicit type annotation.
- Một biến mutable, đổi giá trị giữa chừng.
- Một constant ở file level.
- Variable shadowing để đổi type.
- Cả ba kiểu interpolation trong `println!`.
- Một biến không dùng được xử lý bằng `_` hoặc `#[allow]`.

## Lời giải đầy đủ

```rust
const TOUCHDOWN_POINTS: i32 = 6;          // hằng file level, biết tại compile time

fn main() {
    let season: &str = "Fall";             // immutable + explicit type
    let mut points_scored: i32 = 28;       // mutable

    points_scored = 35;                    // đổi giá trị (KHÔNG có let)

    let event_time = "06:00";              // &str
    let event_time = 6;                    // shadowing: &str → i32

    #[allow(unused_variables)]
    let favorite_beverage = "Snapple Apple";   // không dùng — directive tha

    println!(
        "Mùa {season}, đội ghi {points_scored} điểm, trận lúc {event_time}h, \
         mỗi touchdown {TOUCHDOWN_POINTS} điểm."
    );
}
```

Output:
```text
Mùa Fall, đội ghi 35 điểm, trận lúc 6h, mỗi touchdown 6 điểm.
```

### Phân tích từng quyết định

| Dòng | Khái niệm | Vì sao |
|---|---|---|
| `const TOUCHDOWN_POINTS` | constant file level | Giá trị cố định, biết trước, dùng trong main → const. Bắt buộc `: i32`. |
| `let season: &str` | immutable + annotation | Mùa không đổi → immutable. Annotation `&str` để luyện cú pháp. |
| `let mut points_scored` | mutable | Điểm thay đổi trong trận → cần `mut`. |
| `points_scored = 35` | gán lại | Không `let` — chỉ đổi giá trị biến đã có. Cùng type `i32`. |
| `let event_time = "06:00"` rồi `= 6` | shadowing | Đổi type `&str` → `i32`, giữ một tên (cùng khái niệm "giờ"). |
| `#[allow(unused_variables)]` | directive | Tha biến demo không dùng. (Thực tế nên xoá hoặc dùng `_`.) |

### Ba kiểu interpolation — ôn lại

Cùng output, ba cách viết placeholder:

```rust
// Cách 1: tên biến trong ngoặc (gọn nhất, Rust 2021+)
println!("Mùa {season}, ghi {points_scored} điểm");

// Cách 2: ngoặc rỗng + truyền theo thứ tự
println!("Mùa {}, ghi {} điểm", season, points_scored);

// Cách 3: vị trí số (tái dùng cùng giá trị nhiều lần)
println!("Mùa {0}, lại nhắc mùa {0}, ghi {1} điểm", season, points_scored);
```

Vị trí đánh số **từ 0**: `season` là 0, `points_scored` là 1. Cách 3 lợi khi cần in cùng giá trị nhiều lần mà không truyền lặp.

## Review tổng hợp phase Variables

### Biến và type inference

- **Variable** = tên cho một giá trị. Khai báo `let name = value;`.
- Rust **infer** type từ giá trị khởi tạo. Integer mặc định `i32`, float mặc định `f64`.
- Annotation tuỳ chọn: `let x: i32 = 5;`. Cú pháp `: Type` sau tên.

### Mutability

```text
let x = 5;          immutable — KHÔNG đổi được (mặc định của Rust)
let mut x = 5;      mutable   — đổi giá trị được
x = 10;             OK nếu x là mut, và cùng type
x = "hi";           LUÔN lỗi — mut đổi giá trị, KHÔNG đổi type
```

Rust **mặc định immutable** — ngược với hầu hết ngôn ngữ. Muốn đổi giá trị phải xin phép bằng `mut`.

### Bốn cách "đặt tên cho thứ gì đó" — phân biệt rõ

| Keyword | Đặt tên cho | Đổi được? | Đổi type? | Scope | Naming |
|---|---|---|---|---|---|
| `let` | giá trị (biến) | không | shadow được | function | `snake_case` |
| `let mut` | giá trị (biến) | có (giá trị) | không | function | `snake_case` |
| `const` | giá trị (hằng) | không bao giờ | — | file level | `SCREAMING_SNAKE` |
| `type` | **type** (alias) | — | — | tuỳ | `PascalCase` |

### Shadowing vs scope

- **Shadowing**: `let` lại cùng tên → binding mới, đổi type được, cái cũ bị che.
- **Scope**: vùng giữa `{}`; biến chết khi ra khỏi scope. Inner thấy outer, outer không thấy inner.
- Shadow trong inner block chỉ sống trong block đó.

### Directive và error

- **Compiler directive** `#[...]`: metadata điều khiển compiler. `#[allow(unused_variables)]` tha cảnh báo.
- **Warning** (vàng) không chặn build; **error** (đỏ) chặn build.
- Mỗi error có mã `E####`; `rustc --explain E0384` xem chi tiết.
- Cảnh báo hay gặp nhất: **unused variable** — fix bằng `_` prefix (gọn nhất).

## Bản đồ phase Variables

```text
let / inferred type
   │
   ├── interpolation {} (3 kiểu)
   ├── positional args, _ prefix
   │
   ├── immutable (mặc định) ── mut (xin đổi giá trị)
   │
   ├── shadowing (let lại, đổi type) ── scope ({}, vòng đời biến)
   │
   ├── const (file level, compile time, SCREAMING_SNAKE)
   ├── type alias (PascalCase, không type mới)
   │
   └── compiler directive #[...] / #![...]
```

## Bẫy tổng hợp toàn phase

| Bẫy | Cách tránh |
|---|---|
| Cố đổi giá trị biến immutable | Thêm `mut` |
| Cố đổi **type** bằng `mut` | Dùng **shadowing** |
| Quên `mut` đặt sau `let` | Cú pháp đúng: `let mut x` |
| Quên type annotation cho `const` | `const` **bắt buộc** `: Type` |
| Dùng biến ngoài scope của nó | Khai báo ở scope đủ rộng |
| Tưởng type alias chặn nhầm type | Alias chỉ là tên; cần an toàn → newtype |
| Lạm dụng `#[allow]` giấu bug | Sửa nguyên nhân, biến lẻ dùng `_` |
| Tưởng warning chặn chạy | Warning không block; error mới block |

## Tóm tắt phase Variables

- Biến = tên cho giá trị; Rust **infer** type, mặc định **immutable**.
- `mut` đổi **giá trị**; **shadowing** đổi **type** (binding mới).
- `const`: file level, biết compile time, bắt buộc annotation, `SCREAMING_SNAKE`.
- `type`: alias cho type có sẵn — rõ nghĩa/rút gọn, không tạo type mới.
- **Scope** (`{}`) quyết định vòng đời biến — nền móng cho **ownership** ở phase sau.
- `#[...]` directive điều khiển compiler; warning ≠ error.

Bạn đã có nền vững về cách Rust quản lý **tên và giá trị**. Phase tiếp theo trả lời câu hỏi lớn: mỗi giá trị **thuộc loại gì** — integer mấy bit, float, bool, char, array, tuple — và Rust kiểm soát chúng chặt chẽ ra sao.

**Bài kế tiếp** → [Bài 20: Intro Data Types & Integers — i8 đến i128, u8 đến u128, overflow](../phase-3-data-types/01-intro-data-types-integers.md)
