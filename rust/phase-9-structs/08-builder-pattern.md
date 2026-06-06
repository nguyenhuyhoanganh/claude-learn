# Bài 73: Builder pattern — chuỗi method để dựng struct

Gọi ba method để cập nhật struct, bạn phải viết tên biến ba lần: `computer.upgrade_cpu(...); computer.upgrade_memory(...); computer.upgrade_hard_drive(...)`. Rườm rà. **Builder pattern** giải quyết: mỗi method **trả về `self`** (reference), cho phép **nối chuỗi** method liền mạch. Đây là một **design pattern** — không phải cú pháp Rust riêng, mà là cách *cấu trúc* code để giải bài toán, gặp ở nhiều ngôn ngữ.

## Design pattern là gì

**Design pattern** = cách viết/cấu trúc code được khuyến nghị để giải một loại bài toán cụ thể. Không phải cú pháp đặc thù — mà là cách **tư duy** và **tổ chức** code. Builder pattern có ở nhiều ngôn ngữ; ý tưởng cốt lõi: **mỗi method trả về instance (hoặc reference tới nó)** để chain method.

## Vấn đề: lặp tên biến

Method cập nhật field thường không trả gì (unit `()`) → phải gọi rời rạc, lặp tên biến mỗi lần:

```rust
fn main() {
    let mut computer = Computer::new(String::from("M3 Max"), 64, 2);

    computer.upgrade_cpu(String::from("M4 Max"));        // lặp 'computer'
    computer.upgrade_memory(128);                         // lặp 'computer'
    computer.upgrade_hard_drive_capacity(4);             // lặp 'computer'
}
# struct Computer { cpu: String, memory: u32, hard_drive_capacity: u32 }
# impl Computer { fn new(cpu:String,memory:u32,hard_drive_capacity:u32)->Self{Self{cpu,memory,hard_drive_capacity}} fn upgrade_cpu(&mut self,c:String){} fn upgrade_memory(&mut self,m:u32){} fn upgrade_hard_drive_capacity(&mut self,h:u32){} }
```

Mỗi method gọi riêng, `computer` viết lại liên tục. Builder pattern gom thành một chuỗi.

## Giải pháp: method trả về `&mut self`

Đổi mỗi method để **trả về `&mut self`** (mutable reference tới instance). Dòng cuối method là `self`, return type là `&mut Self`:

```rust
#[derive(Debug)]
struct Computer { cpu: String, memory: u32, hard_drive_capacity: u32 }

impl Computer {
    fn new(cpu: String, memory: u32, hard_drive_capacity: u32) -> Self {
        Self { cpu, memory, hard_drive_capacity }
    }

    fn upgrade_cpu(&mut self, new_cpu: String) -> &mut Self {   // trả &mut Self
        self.cpu = new_cpu;
        self                                                     // trả lại chính nó
    }
    fn upgrade_memory(&mut self, new_memory: u32) -> &mut Self {
        self.memory = new_memory;
        self
    }
    fn upgrade_hard_drive_capacity(&mut self, new_cap: u32) -> &mut Self {
        self.hard_drive_capacity = new_cap;
        self
    }
}
```

```text
fn upgrade_cpu(&mut self, new_cpu: String) -> &mut Self {
    self.cpu = new_cpu;       ← sửa field
    self                       ← TRẢ lại self (không ;) → cho phép chain
}
```

Mỗi method: sửa field, rồi `self` (dòng cuối, không `;`) → trả mutable reference tới instance. Return type `-> &mut Self`. (Không phải `self` value — đó là move ownership; không phải `&self` — đó là immutable. Chính xác là `&mut Self`.)

## Chain method liền mạch

Giờ nối các method bằng `.` liên tiếp — vì mỗi cái trả `&mut self`, method tiếp theo gọi luôn trên đó:

```rust
fn main() {
    let mut computer = Computer::new(String::from("M3 Max"), 64, 2);

    computer
        .upgrade_cpu(String::from("M4 Max"))     // trả &mut self
        .upgrade_memory(128)                      // gọi tiếp trên đó
        .upgrade_hard_drive_capacity(4);          // và tiếp

    println!("{computer:#?}");
}
# #[derive(Debug)] struct Computer { cpu: String, memory: u32, hard_drive_capacity: u32 }
# impl Computer { fn new(cpu:String,memory:u32,hard_drive_capacity:u32)->Self{Self{cpu,memory,hard_drive_capacity}} fn upgrade_cpu(&mut self,c:String)->&mut Self{self.cpu=c;self} fn upgrade_memory(&mut self,m:u32)->&mut Self{self.memory=m;self} fn upgrade_hard_drive_capacity(&mut self,h:u32)->&mut Self{self.hard_drive_capacity=h;self} }
```

```text
computer.upgrade_cpu(...)  →  &mut Computer
        .upgrade_memory(...)  →  &mut Computer   (gọi trên kết quả trước)
        .upgrade_hard_drive_capacity(...)  →  &mut Computer
```

Không lặp `computer` — viết một lần, chain liền. `upgrade_cpu` trả `&mut Computer`, Rust tự deref khi gọi `.upgrade_memory` trên đó, cứ thế. Đọc gọn, đẹp, tuần tự. Tên "builder" vì nó **dựng** (build) type từng bước.

## Vì sao `&mut self` chứ không `self`

| Return type | Hậu quả |
|---|---|
| `self` (value) | Move ownership ra mỗi method → phức tạp, mất instance gốc |
| `&self` (immutable ref) | Không sửa được field |
| **`&mut Self`** | Sửa được + chain được + không move | ✓ |

`&mut Self` là lựa chọn đúng: mutable reference cho phép sửa field, và trả reference cho phép chain mà không move ownership khỏi `computer`. (Một số builder dùng `self` value để consume rồi trả `Self` — phổ biến khi builder là struct riêng; ở đây dùng `&mut self` cho đơn giản.)

## Builder không bắt buộc — đó là pattern

Điểm quan trọng: builder pattern **không phải tính năng Rust bắt buộc** — đó là cách bạn **chọn** cấu trúc code (trả `self` mỗi method) để bật cú pháp chain. Code thường (gọi rời) vẫn chạy đúng; builder chỉ làm nó **đẹp và gọn hơn**. Đây là bản chất "design pattern": một cách tổ chức, không phải quy tắc ngôn ngữ.

## Use case thực tế: cấu hình phức tạp

Builder toả sáng khi dựng object nhiều tuỳ chọn:

```rust
#[derive(Debug)]
struct HttpRequest {
    url: String,
    method: String,
    timeout: u32,
    retries: u32,
}

impl HttpRequest {
    fn new(url: String) -> Self {
        Self { url, method: String::from("GET"), timeout: 30, retries: 0 }   // mặc định
    }
    fn method(&mut self, m: String) -> &mut Self { self.method = m; self }
    fn timeout(&mut self, t: u32) -> &mut Self { self.timeout = t; self }
    fn retries(&mut self, r: u32) -> &mut Self { self.retries = r; self }
}

fn main() {
    let mut req = HttpRequest::new(String::from("https://api.example.com"));
    req.method(String::from("POST"))
       .timeout(60)
       .retries(3);
    println!("{req:#?}");
}
```

`new` đặt giá trị mặc định; mỗi method tuỳ chỉnh một field và chain được. Đọc như "tạo request, đặt method POST, timeout 60, retries 3" — rõ ràng, linh hoạt (chỉ chain field cần đổi). Pattern này gặp khắp thư viện Rust (HTTP client, query builder, config).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên return `self` ở cuối method | Không chain được | Dòng cuối là `self` (không `;`) |
| Return `self` (value) thay `&mut Self` | Move ownership | Dùng `-> &mut Self` |
| Return `&self` (immutable) | Không sửa field | Dùng `&mut self` + `&mut Self` |
| Quên khai `-> &mut Self` | Tưởng trả unit → mismatch | Khai return type |
| Quên `mut` owner khi chain | Compile error | `let mut instance` |
| `;` sau `self` cuối method | Trả unit | Bỏ `;` |

## Tóm tắt bài 73

- **Builder pattern**: mỗi method trả về `&mut self` → cho phép **chain** method liền mạch.
- **Design pattern** = cách cấu trúc code giải bài toán (không phải cú pháp Rust riêng), có ở nhiều ngôn ngữ.
- Method builder: sửa field, rồi `self` (dòng cuối không `;`), return type `-> &mut Self`.
- Chain `instance.m1(...).m2(...).m3(...)` — viết tên một lần, không lặp.
- `&mut Self` đúng vì sửa được + chain được + không move; `self` value sẽ move, `&self` không sửa được.
- Toả sáng khi dựng object nhiều tuỳ chọn (HTTP request, config, query) với giá trị mặc định + chain tuỳ chỉnh.

**Bài kế tiếp** → [Bài 74: Tuple struct & unit-like struct — hai loại struct còn lại](09-tuple-unit-structs.md)
