# Bài 83: `if let` & `let else` — xử lý gọn một variant

`match` bắt buộc phủ **mọi** variant — nhưng nhiều khi bạn chỉ quan tâm **một** variant cụ thể. Enum 10 variant mà chỉ cần xử lý 1 cái thì `match` quá rườm rà (phải viết arm cho 9 cái còn lại). **`if let`** giải quyết: chạy code nếu khớp **đúng một** variant, kèm trích dữ liệu. Và **`let else`** làm điều ngược lại: chạy code nếu **không** khớp, đồng thời khai biến dùng được tiếp sau. Hai construct này gọn hoá những trường hợp `match` thừa.

## Vấn đề: `match` thừa khi chỉ cần một variant

`match` exhaustive — phủ mọi variant. Nếu chỉ cần xử lý một variant:

```rust
// Rườm rà: match cho 1 variant, _ cho phần còn lại không làm gì
match my_beverage {
    Milk::Whole => println!("Có sữa nguyên kem"),
    _ => {}                          // arm rác chỉ để thoả compiler
}
# enum Milk { Whole, Lowfat(i32) }
# let my_beverage = Milk::Whole;
```

Phải viết `_ => {}` (code rác) chỉ để thoả exhaustiveness. `if let` bỏ được điều này.

## `if let` — chạy code nếu khớp một variant

`if let` kết hợp `if` (điều kiện) + `let` (khai biến): chạy block nếu giá trị khớp **một** variant hard-code, không cần phủ variant khác:

```rust
fn main() {
    let my_beverage = Milk::Whole;

    if let Milk::Whole = my_beverage {       // khớp Whole?
        println!("Có sữa nguyên kem");
    }
    // không cần xử lý variant khác
}
# enum Milk { Whole, Lowfat(i32) }
```

```text
if let Milk::Whole = my_beverage {
│      │            │ │
│      │            │ └ giá trị động (so sánh)
│      │            └ một dấu = (không phải ==)
│      └ variant hard-code (đặt TRƯỚC =)
└ if let
```

- Variant hard-code (`Milk::Whole`) đặt **bên trái** `=`; giá trị động (`my_beverage`) bên **phải**.
- **Một** dấu `=` (không phải `==`) — vừa so khớp vừa (có thể) khai biến.
- Khớp → chạy block; không khớp → bỏ qua. Không bắt buộc phủ variant khác (khác `match`).

## `if let` trích dữ liệu kèm

Phần "`let`" lộ rõ khi variant có dữ liệu kèm: trích dữ liệu thành biến dùng trong block:

```rust
fn main() {
    let my_beverage = Milk::Lowfat(2);

    if let Milk::Lowfat(percent) = my_beverage {     // khớp Lowfat VÀ trích 'percent'
        println!("Sữa {percent}%");                   // dùng percent trong block
    }
}
# enum Milk { Whole, Lowfat(i32) }
```

Nếu `my_beverage` là `Lowfat`, Rust khai `percent` = dữ liệu kèm, dùng được trong block. Đây là phần "let" — khai biến từ dữ liệu variant. `percent` chỉ sống trong block này.

Cú pháp trích mirror khai báo (như `match`): tuple variant `Lowfat(percent)`; struct variant `NonDairy { kind }`:

```rust
if let Milk::NonDairy { kind } = my_beverage {       // struct variant
    println!("Sữa {kind}");
}
# enum Milk { NonDairy { kind: String } }
# let my_beverage = Milk::NonDairy { kind: String::from("yến mạch") };
```

## `if let ... else`

`if let` vẫn là if statement → thêm `else` được:

```rust
if let Milk::Whole = my_beverage {
    println!("Sữa nguyên kem");
} else {
    println!("Loại sữa khác");       // chạy nếu KHÔNG khớp Whole
}
# enum Milk { Whole, Lowfat(i32) }
# let my_beverage = Milk::Whole;
```

`else` chạy khi không khớp variant. Vẫn gọn hơn `match` khi chỉ quan tâm một variant chính + một nhánh fallback.

## `if let` vs `match`

| | `match` | `if let` |
|---|---|---|
| Phủ variant | **Mọi** (exhaustive) | Chỉ một (+ else tuỳ chọn) |
| Khi dùng | Cần xử lý nhiều/mọi variant | Chỉ quan tâm **một** variant |
| Trích dữ liệu | Có | Có |
| Rườm rà cho 1 variant | Có (arm `_` rác) | Không |

Quy tắc: nhiều variant cần xử lý → `match`; chỉ một variant → `if let`. `if let` là "match gọn cho một trường hợp".

## `let else` — chạy code nếu KHÔNG khớp, biến sống tiếp

`let else` (Rust 1.65+) làm **ngược** `if let`: chạy block `else` nếu **không** khớp, và biến trích ra sống **sau** block (không phải trong block):

```rust
fn process() {
    let my_beverage = Milk::Lowfat(2);

    let Milk::Lowfat(percent) = my_beverage else {   // khớp Lowfat? nếu KHÔNG → else
        println!("Không phải sữa lowfat");
        return;                                       // else PHẢI thoát (return/panic/break)
    };

    // percent dùng được TỪ ĐÂY trở đi (sau block else)
    println!("Sữa {percent}% có sẵn");
}
# enum Milk { Whole, Lowfat(i32) }
```

```text
let Milk::Lowfat(percent) = my_beverage else {
│   │                       │             │
│   │                       │             └ else: chạy nếu KHÔNG khớp
│   │                       └ giá trị động
│   └ variant + trích dữ liệu
└ let

  ...else block PHẢI thoát (return/panic/...)
};
percent dùng được Ở ĐÂY (sau cả construct)
```

Khác `if let` (biến sống **trong** block khớp), `let else`: biến (`percent`) sống **sau** construct, dùng tiếp trong cả hàm. Block `else` chạy khi **không** khớp.

## `let else`: block else BẮT BUỘC thoát

Điểm cốt lõi: block `else` **phải** thoát luồng (`return`, `panic!`, `break`, `continue`). Vì sao? Nếu không khớp, `percent` **không** được khai. Nếu code chạy tiếp sau block else mà dùng `percent` → `percent` không tồn tại. Nên compiler **bắt buộc** else thoát, đảm bảo code sau đó chỉ chạy khi đã khớp (và `percent` hợp lệ):

```rust
let Milk::Lowfat(percent) = my_beverage else {
    return;                          // BẮT BUỘC thoát — nếu không, lỗi compile
};
println!("{percent}");               // chỉ tới đây nếu đã khớp → percent hợp lệ
# enum Milk { Whole, Lowfat(i32) }
# fn f(my_beverage: Milk) {
# }
```

Quên thoát trong else → lỗi compile. Đây là cách `let else` đảm bảo an toàn: sau nó, biến chắc chắn tồn tại.

## `if let` vs `let else`

```text
if let Variant(x) = value { ... }        → x sống TRONG block, chạy nếu KHỚP
let Variant(x) = value else { return };  → x sống SAU block, else chạy nếu KHÔNG khớp
```

| | `if let` | `let else` |
|---|---|---|
| Block chạy khi | **khớp** | **không** khớp |
| Biến sống ở | trong block | **sau** construct (cả hàm) |
| Yêu cầu | (không) | else phải thoát |
| Khi dùng | làm gì đó nếu khớp | "trích hoặc thoát sớm" (happy path) |

`let else` lý tưởng cho "happy path": trích dữ liệu, nếu không được thì thoát sớm, rồi code chính tiếp tục với biến đã trích — tránh lồng sâu.

## Use case thực tế

```rust
#[derive(Debug)]
enum Config {
    Loaded { port: u32 },
    Missing,
}

fn start_server(config: Config) {
    // let else: trích port hoặc thoát
    let Config::Loaded { port } = config else {
        println!("Chưa có config, dừng");
        return;
    };
    // từ đây port hợp lệ
    println!("Khởi động server ở cổng {port}");
}

fn main() {
    start_server(Config::Loaded { port: 8080 });    // Khởi động server ở cổng 8080
    start_server(Config::Missing);                   // Chưa có config, dừng
}
```

`let else` trích `port`, không có config thì thoát sớm; phần còn lại của hàm chạy với `port` chắc chắn hợp lệ — không lồng `if let`/`match`. Pattern "validate rồi tiếp tục" cực phổ biến, `let else` làm nó phẳng và sạch.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `==` thay `=` trong `if let` | Lỗi | Một dấu `=` |
| Đặt giá trị động bên trái `=` | Sai logic | Variant hard-code bên trái |
| `let else` block không thoát | Compile error | `return`/`panic!`/`break` trong else |
| Dùng `match` cho một variant | Rườm rà | `if let` |
| Tưởng biến `if let` sống ngoài block | Chỉ trong block | Cần sống tiếp → `let else` |
| Quên `;` cuối `let else` | Lỗi | `let ... else { } ;` |

## Tóm tắt bài 83

- **`if let Variant(x) = value`**: chạy block nếu **khớp** một variant, trích `x` dùng **trong** block — gọn hơn `match` khi chỉ quan tâm một variant.
- Variant hard-code bên **trái** `=`, giá trị động bên **phải**; một dấu `=` (không `==`); thêm `else` được.
- **`let else`**: block `else` chạy nếu **không** khớp; biến trích sống **sau** construct (cả hàm).
- `let else` block **bắt buộc thoát** (return/panic/break) — đảm bảo biến hợp lệ ở code sau.
- `if let` cho "làm gì nếu khớp"; `let else` cho "trích hoặc thoát sớm" (happy path, tránh lồng sâu).
- Cú pháp trích dữ liệu mirror khai báo variant (như `match`).

**Bài kế tiếp** → [Bài 84: Project & Section Review — Subscription enum, tổng kết phase](09-project-va-review.md)
