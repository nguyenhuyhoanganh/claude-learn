# Bài 80: `match` với enum — xử lý mọi variant, trích dữ liệu kèm

`match` (phase 5) và enum sinh ra cho nhau. `match` **bắt buộc** xử lý mọi variant — compiler chặn nếu bạn quên một cái. Và mạnh hơn: trong mỗi arm, `match` **trích** dữ liệu kèm của variant ra dùng. Đây là cách bạn "mở" một enum để xem nó là variant nào và lấy dữ liệu bên trong — kỹ thuật trung tâm khi làm việc với enum (và sau này là `Option`/`Result`).

## Vì sao `match` + enum hoàn hảo

`match` so giá trị với các pattern (arm), chạy arm khớp đầu tiên, và **kiểm tra đầy đủ** (exhaustive — phase 5 bài 36). Với enum: compiler đảm bảo bạn xử lý **mọi variant** — quên một cái thì không compile. Đây là lý do enum + match là combo cốt lõi: branching an toàn, không sót trường hợp.

## match với variant trơn

```rust
enum OperatingSystem {
    Windows,
    MacOS,
    Linux,
}

fn years_since_release(os: OperatingSystem) -> u32 {
    match os {
        OperatingSystem::Windows => 39,
        OperatingSystem::MacOS => 23,
        OperatingSystem::Linux => 34,
    }
}

fn main() {
    let my_os = OperatingSystem::MacOS;
    println!("{}", years_since_release(my_os));      // 23
}
```

Mỗi arm: `Enum::Variant => giá_trị`. `match` là expression → trả giá trị (làm return value của hàm, implicit, không `;`). Compiler bắt buộc phủ cả 3 variant — bỏ `Linux` thì:

```text
error[E0004]: non-exhaustive patterns: `Linux` not covered
```

Đây là sức mạnh: thêm variant mới vào enum → mọi `match` thiếu nó **lỗi compile**, nhắc bạn cập nhật. Không bao giờ sót variant âm thầm.

## Arm với block code

Arm có thể là block `{}` (nhiều dòng) thay vì giá trị đơn. Mọi arm phải trả **cùng type**; dòng cuối block (không `;`) là giá trị:

```rust
fn years_since_release(os: OperatingSystem) -> u32 {
    match os {
        OperatingSystem::Windows => {
            println!("Hệ điều hành khá cũ!");
            39                       // dòng cuối, không ; → giá trị arm
        }
        OperatingSystem::MacOS => 23,    // arm giá trị đơn
        OperatingSystem::Linux => 34,
    }
}
# enum OperatingSystem { Windows, MacOS, Linux }
```

Trộn block và giá trị đơn được, miễn mọi arm trả cùng type (`u32` ở đây). Không dùng `return` trong arm (không phải thân hàm) — dùng implicit (bỏ `;` dòng cuối). Có `;` → arm trả unit `()` → mismatch type.

## Trích dữ liệu kèm: tuple variant

Đây là phần mạnh nhất. Với variant kèm dữ liệu, `match` **trích** dữ liệu ra trong arm. Cú pháp mirror khai báo variant. Tuple variant → dùng `()` + tên biến cho dữ liệu:

```rust
enum LaundryCycle {
    Cold,                                // unit
    Hot { temperature: u32 },            // struct variant
    Delicate(String),                    // tuple variant
}

fn wash(cycle: LaundryCycle) {
    match cycle {
        LaundryCycle::Cold => {
            println!("Giặt nước lạnh");
        }
        LaundryCycle::Hot { temperature } => {       // trích field 'temperature'
            println!("Giặt ở {temperature} độ");
        }
        LaundryCycle::Delicate(fabric_type) => {     // trích dữ liệu, đặt tên 'fabric_type'
            println!("Giặt nhẹ cho {fabric_type}");
        }
    }
}

fn main() {
    wash(LaundryCycle::Cold);
    wash(LaundryCycle::Hot { temperature: 100 });
    wash(LaundryCycle::Delicate(String::from("lụa")));
}
```

```text
LaundryCycle::Delicate(fabric_type) => ...
│                      │
│                      └ tên biến bắt dữ liệu kèm (dùng được trong arm)
└ variant

LaundryCycle::Hot { temperature } => ...
                    │
                    └ tên field (struct variant), dùng được trong arm
```

- **Tuple variant** `Delicate(String)` → trích bằng `()` + tên tự đặt (`fabric_type`); tên tuỳ bạn (vì theo vị trí).
- **Struct variant** `Hot { temperature: u32 }` → trích bằng `{}` + tên field (`temperature`); tên **không** tuỳ — phải đúng tên field.

Tên biến trích ra dùng được trong block của arm. Đây là cách "mở" enum: kiểm tra là variant nào **và** lấy dữ liệu bên trong cùng lúc.

## Cú pháp trích mirror khai báo

Quy tắc: cú pháp trích trong match **giống** cú pháp khai báo variant:

| Variant khai báo | Trích trong match |
|---|---|
| `Cold` (unit) | `Cold` |
| `Delicate(String)` (tuple) | `Delicate(name)` — tên tự đặt |
| `Hot { temperature: u32 }` (struct) | `Hot { temperature }` — tên field |

Khai bằng `()` → trích bằng `()`; khai bằng `{}` → trích bằng `{}`. Nhất quán, dễ nhớ.

## match là expression — gán biến

Như mọi `match`, kết quả gán được vào biến:

```rust
let description = match cycle {
    LaundryCycle::Cold => "lạnh",
    LaundryCycle::Hot { temperature } => "nóng",
    LaundryCycle::Delicate(_) => "nhẹ",       // _ bỏ qua dữ liệu nếu không cần
};
# enum LaundryCycle { Cold, Hot { temperature: u32 }, Delicate(String) }
# let cycle = LaundryCycle::Cold;
```

Dùng `_` trong vị trí dữ liệu nếu không cần dùng nó (vd `Delicate(_)` — biết là Delicate nhưng không cần fabric). Mọi arm cùng type (`&str` ở đây).

## Use case thực tế

```rust
#[derive(Debug)]
enum WebEvent {
    PageLoad,
    Click { x: i32, y: i32 },
    KeyPress(char),
    Paste(String),
}

fn handle(event: WebEvent) -> String {
    match event {
        WebEvent::PageLoad => String::from("Trang tải"),
        WebEvent::Click { x, y } => format!("Click tại ({x}, {y})"),
        WebEvent::KeyPress(c) => format!("Nhấn phím {c}"),
        WebEvent::Paste(text) => format!("Dán: {text}"),
    }
}

fn main() {
    println!("{}", handle(WebEvent::Click { x: 10, y: 20 }));   // Click tại (10, 20)
    println!("{}", handle(WebEvent::KeyPress('a')));            // Nhấn phím a
}
```

`handle` xử lý mọi loại sự kiện, trích dữ liệu kèm từng loại (toạ độ click, phím, text dán). Compiler đảm bảo phủ mọi `WebEvent` — thêm event mới sẽ buộc cập nhật `handle`. Đây là pattern xử lý sự kiện/message chuẩn trong Rust.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thiếu variant trong match | non-exhaustive error | Phủ mọi variant (hoặc `_`) |
| Sai cú pháp trích (tuple vs struct) | Lỗi | `()` cho tuple, `{}` cho struct |
| Đặt sai tên field struct variant | Lỗi | Đúng tên field |
| Arm trả khác type | Type mismatch | Mọi arm cùng type |
| `;` cuối block arm khi cần giá trị | Trả unit | Bỏ `;` dòng giá trị |
| Trích dữ liệu không cần | Warning unused | Dùng `_` bỏ qua |

## Tóm tắt bài 80

- `match` + enum hoàn hảo: compiler **bắt buộc** phủ mọi variant (exhaustive) — thêm variant mới buộc cập nhật mọi match.
- Mỗi arm `Enum::Variant => ...`; `match` là expression trả giá trị; arm có thể là block (dòng cuối không `;`).
- **Trích dữ liệu kèm** trong arm: tuple variant `Variant(name)` (tên tự đặt); struct variant `Variant { field }` (tên field).
- Cú pháp trích **mirror** khai báo variant (`()` ↔ `()`, `{}` ↔ `{}`).
- Dùng `_` bỏ qua dữ liệu không cần; mọi arm phải cùng type.
- Đây là cách "mở" enum — kiểm tra variant **và** lấy dữ liệu cùng lúc; nền cho `Option`/`Result`.

**Bài kế tiếp** → [Bài 81: Method trên enum — hành vi cho từng variant](06-enum-methods.md)
