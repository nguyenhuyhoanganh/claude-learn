# Bài 82: `match` nâng cao — nhiều giá trị `|`, bắt biến, match giá trị chính xác

`match` với enum còn tinh vi hơn nhiều. Bạn có thể: gộp nhiều variant vào một arm bằng `|`; dùng `_` hoặc tên biến để bắt "mọi variant còn lại"; và match đến **giá trị cụ thể bên trong** một variant (không chỉ variant, mà variant với đúng dữ liệu kèm). Độ chính xác này khiến `match` cực mạnh — bạn nhắm trúng đúng trường hợp cần.

## Gộp nhiều variant với `|`

Nhiều variant cùng xử lý → gộp bằng `|` (đọc "hoặc") trong một arm:

```rust
#[derive(Debug)]
enum OnlineOrderStatus {
    Ordered,
    Packed,
    Shipped,
    Delivered,
}

impl OnlineOrderStatus {
    fn check(&self) {
        match self {
            OnlineOrderStatus::Ordered | OnlineOrderStatus::Packed => {
                println!("Đơn đang được chuẩn bị");      // gộp 2 variant
            }
            OnlineOrderStatus::Shipped => println!("Đang giao"),
            OnlineOrderStatus::Delivered => println!("Đã giao"),
        }
    }
}
# fn main() {}
```

`Ordered | Packed => ...` — khớp nếu là **một trong hai**, cùng chạy một block. Gọn hơn viết hai arm giống nhau (như `match` số ở bài 37).

## Catch-all: `_` và bắt biến

Không muốn liệt kê hết variant → dùng catch-all "mọi variant còn lại".

**`_`** — bỏ qua, không cần biết là variant nào:

```rust
match self {
    OnlineOrderStatus::Delivered => println!("Đã giao"),
    _ => println!("Chưa tới"),       // mọi variant còn lại
}
# enum OnlineOrderStatus { Ordered, Packed, Shipped, Delivered }
# impl OnlineOrderStatus { fn f(&self) {
# }}
```

**Tên biến** — bắt giá trị còn lại để dùng (cần Debug để in):

```rust
match self {
    OnlineOrderStatus::Delivered => println!("Đã giao"),
    other_status => println!("Trạng thái: {other_status:?}"),   // bắt variant
}
# enum OnlineOrderStatus { Ordered, Packed, Shipped, Delivered }
```

`other_status` khớp mọi variant còn lại **và** giữ giá trị để dùng (khác `_` bỏ qua). Cả hai phải đặt **cuối** (như bài 36) — nếu không sẽ chặn arm sau (unreachable).

| Catch-all | Khớp | Dùng được giá trị? |
|---|---|---|
| `_` | mọi variant còn lại | Không |
| `other` (tên) | mọi variant còn lại | **Có** |

## Match giá trị chính xác trong variant

Phần mạnh nhất: match không chỉ variant, mà variant với **giá trị kèm cụ thể**. Vd `Lowfat(i32)` — match riêng `Lowfat(2)`:

```rust
#[derive(Debug)]
enum Milk {
    Lowfat(i32),                     // kèm % chất béo
    Whole,
}

impl Milk {
    fn drink(self) {
        match self {
            Milk::Lowfat(2) => {                         // CHỈ khớp Lowfat với giá trị 2
                println!("Tuyệt, sữa 2% là yêu thích!");
            }
            Milk::Lowfat(percent) => {                   // Lowfat với BẤT KỲ giá trị khác
                println!("Sữa lowfat {percent}%");
            }
            Milk::Whole => println!("Sữa nguyên kem"),
        }
    }
}

fn main() {
    Milk::Lowfat(2).drink();         // "Tuyệt, sữa 2%..."
    Milk::Lowfat(1).drink();         // "Sữa lowfat 1%"
    Milk::Whole.drink();             // "Sữa nguyên kem"
}
```

```text
Milk::Lowfat(2)        → khớp CHỈ KHI là Lowfat VÀ giá trị = 2
Milk::Lowfat(percent)  → khớp Lowfat với giá trị bất kỳ (bắt vào 'percent')
```

`Lowfat(2)` chỉ khớp khi variant là Lowfat **và** dữ liệu kèm đúng `2`. `Lowfat(1)`, `Lowfat(99)` không khớp arm này. Độ chính xác cực cao: nhắm trúng variant + giá trị cụ thể.

## Thứ tự quan trọng: cụ thể trước, tổng quát sau

`Lowfat(percent)` (bắt mọi giá trị) phải đặt **sau** `Lowfat(2)` (cụ thể). Vì match khớp từ trên xuống — `Lowfat(percent)` khớp **mọi** Lowfat (kể cả 2), nên nếu đặt trước, `Lowfat(2)` không bao giờ tới được:

```rust
match self {
    Milk::Lowfat(percent) => ...,    // khớp MỌI Lowfat (kể cả 2)
    Milk::Lowfat(2) => ...,          // UNREACHABLE — không bao giờ tới
}
# enum Milk { Lowfat(i32), Whole }
# let self_ = Milk::Whole;
```

Quy tắc: pattern **cụ thể** (giá trị xác định) trước, **tổng quát** (bắt biến) sau. Như guard ở bài 37.

## Exhaustiveness vẫn áp dụng

Match giá trị cụ thể vẫn cần phủ đủ. `Lowfat(2)` chỉ phủ một giá trị — còn vô số `i32` khác chưa phủ → cần `Lowfat(percent)` (bắt mọi giá trị còn lại) mới đủ:

```text
Milk::Lowfat(2)        ← chỉ phủ giá trị 2
Milk::Lowfat(percent)  ← phủ MỌI i32 còn lại → giờ Lowfat đã đủ
Milk::Whole            ← phủ Whole
```

Thiếu `Lowfat(percent)` → "non-exhaustive" (vì `Lowfat(5)`, `Lowfat(100)`... chưa phủ). Compiler vẫn bắt buộc phủ hết.

## Use case thực tế

```rust
#[derive(Debug)]
enum Command {
    Move(i32, i32),
    Quit,
    Help,
    Unknown(String),
}

fn execute(cmd: &Command) -> String {
    match cmd {
        Command::Move(0, 0) => String::from("Đã ở gốc toạ độ"),    // giá trị cụ thể
        Command::Move(x, y) => format!("Di chuyển tới ({x}, {y})"),
        Command::Quit | Command::Help => String::from("Lệnh hệ thống"),  // gộp |
        Command::Unknown(text) => format!("Không rõ: {text}"),
        // (đủ rồi — mọi variant đã phủ)
    }
}

fn main() {
    println!("{}", execute(&Command::Move(0, 0)));    // Đã ở gốc toạ độ
    println!("{}", execute(&Command::Move(5, 3)));    // Di chuyển tới (5, 3)
    println!("{}", execute(&Command::Quit));          // Lệnh hệ thống
}
```

`Move(0, 0)` (giá trị cụ thể) trước `Move(x, y)` (tổng quát); `Quit | Help` gộp; `Unknown(text)` trích dữ liệu. Match cho phép xử lý cực chi tiết: đặc biệt hoá trường hợp gốc toạ độ, gộp lệnh hệ thống, bắt lệnh lạ. Pattern cực mạnh cho parser, state machine, command handler.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `_`/tên catch-all không đặt cuối | Unreachable arm | Đặt cuối |
| Pattern tổng quát trước cụ thể | Cụ thể unreachable | Cụ thể trước, tổng quát sau |
| Match giá trị cụ thể quên phủ phần còn lại | non-exhaustive | Thêm arm bắt biến |
| Dùng `_` khi cần giá trị | Mất giá trị | Bắt bằng tên |
| Gộp `|` variant khác cấu trúc dữ liệu | Lỗi (binding không khớp) | Gộp variant tương thích |

## Tóm tắt bài 82

- Gộp nhiều variant một arm bằng **`|`** ("hoặc"); cùng xử lý một block.
- Catch-all: **`_`** (bỏ qua) hoặc **tên biến** (bắt giá trị còn lại); đặt **cuối**.
- Match **giá trị chính xác trong variant**: `Lowfat(2)` chỉ khớp variant Lowfat với dữ liệu đúng `2`.
- Thứ tự: pattern **cụ thể** trước, **tổng quát** (bắt biến) sau — nếu không, cụ thể unreachable.
- Exhaustiveness vẫn áp dụng — match giá trị cụ thể cần arm bắt phần còn lại mới đủ.
- Độ chính xác này cho xử lý chi tiết: đặc biệt hoá trường hợp, gộp nhóm, trích dữ liệu — mạnh cho parser/state machine.

**Bài kế tiếp** → [Bài 83: `if let` & `let else` — xử lý gọn một variant](08-if-let-let-else.md)
