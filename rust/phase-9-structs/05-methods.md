# Bài 70: Methods — hàm sống trên struct, 4 dạng `self`

Field là **dữ liệu** của struct; **method** là **hành vi** của nó. Bạn đã gọi method sẵn (`s.push_str`, `s.clone`); giờ học **tự định nghĩa** method cho struct của mình. Mọi method nhận `self` làm tham số đầu — và `self` có đúng 4 dạng (tương ứng 4 cách truyền struct ở bài 67). Đây là nơi struct chuyển từ "túi dữ liệu" thành "type sống động".

## Method là gì

**Method** = function **thuộc về** một type, sống trên instance. Gọi bằng `instance.method(args)`. Như function, method nhận tham số và trả giá trị — khác ở chỗ nó **gắn với struct** và truy cập được dữ liệu của struct.

Field = dữ liệu; method = hành vi/hành động. Method giúp **gom mọi chức năng của một struct vào một chỗ**, và mọi instance tự động có các method đó.

## `impl` block — nơi định nghĩa method

Method định nghĩa trong **`impl` block** (implementation), tách khỏi định nghĩa field:

```rust
#[derive(Debug)]
struct TaylorSwiftSong {
    title: String,
    release_year: u32,
    duration_secs: u32,
}

impl TaylorSwiftSong {               // impl + tên struct
    fn display_song_info(&self) {
        println!("Tên: {}", self.title);
        println!("Năm: {}", self.release_year);
        println!("Thời lượng: {} giây", self.duration_secs);
    }
}
```

```text
impl TaylorSwiftSong {
│    │
│    └ struct được implement method
└ keyword (implementation)

  fn display_song_info(&self) {     ← method, tham số đầu là self
```

Khác OOP (field + method chung một chỗ), Rust tách: field trong `struct {}`, method trong `impl {}`. Mọi thứ trong `impl TaylorSwiftSong` tự động gắn với `TaylorSwiftSong`.

## `self` — tham số đầu bắt buộc

Tham số **đầu tiên** của mọi method luôn là **`self`** — đại diện cho struct (ở dạng nào đó). Bên trong method, truy cập field qua `self.field`:

```rust
fn display_song_info(&self) {
    println!("{}", self.title);      // self.field truy cập field
}
```

Gọi method: `instance.method()`. **Không** truyền `self` lúc gọi — Rust tự truyền instance vào `self`:

```rust
fn main() {
    let song = TaylorSwiftSong {
        title: String::from("Blank Space"),
        release_year: 2014,
        duration_secs: 231,
    };
    song.display_song_info();        // Rust tự truyền song vào self
}
# #[derive(Debug)] struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
# impl TaylorSwiftSong { fn display_song_info(&self) { println!("{}", self.title); } }
```

## 4 dạng `self` — tương ứng 4 cách truyền struct

`self` có đúng **4 dạng**, y như 4 cách truyền struct vào hàm (bài 67) — value/reference × immutable/mutable:

```text
self        → value, immutable: method LẤY ownership, chỉ đọc
mut self    → value, mutable:   LẤY ownership, sửa được
&self       → reference, immutable: MƯỢN, chỉ đọc      ← phổ biến nhất
&mut self   → reference, mutable:   MƯỢN, sửa được     ← phổ biến
```

Đây là **shortcut**; dạng đầy đủ ghi rõ type (`self: &TaylorSwiftSong`). Ba cách viết tương đương:

```rust
fn f(&self) {}                       // shortcut (dùng cái này)
fn f(self: &TaylorSwiftSong) {}      // type đầy đủ
fn f(self: &Self) {}                 // Self = alias cho struct đang impl
```

`Self` (chữ S hoa) = alias cho type đang `impl` — bền hơn khi đổi tên struct (không phải sửa khắp nơi). Đa số dùng shortcut `&self`/`&mut self`.

## `&self` — đọc (phổ biến nhất)

Method chỉ đọc field → `&self` (mượn, không lấy ownership):

```rust
impl TaylorSwiftSong {
    fn display_song_info(&self) {            // mượn immutable
        println!("{} ({})", self.title, self.release_year);
    }
}

fn main() {
    let song = TaylorSwiftSong { /* ... */ };
    song.display_song_info();        // song vẫn dùng được sau
    song.display_song_info();        // gọi lại OK — không mất ownership
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
```

`&self` không move → gọi method bao nhiêu lần cũng được, instance vẫn sống. Đây là dạng phổ biến nhất.

## `&mut self` — sửa

Method sửa field → `&mut self` (mượn mutable):

```rust
impl TaylorSwiftSong {
    fn double_length(&mut self) {            // mượn mutable
        self.duration_secs = self.duration_secs * 2;   // sửa field
    }
}

fn main() {
    let mut song = TaylorSwiftSong { /* ... */ };   // owner phải mut
    song.double_length();            // duration_secs ×2
    song.display_song_info();        // song vẫn sống — gọi method tiếp được
}
# struct TaylorSwiftSong { title: String, release_year: u32, duration_secs: u32 }
# impl TaylorSwiftSong { fn double_length(&mut self){ self.duration_secs *= 2; } fn display_song_info(&self){} }
```

`&mut self` sửa struct gốc, không move. Owner (`song`) phải `mut`. Vì là reference, gọi method này rồi method khác liên tiếp đều OK.

## Vì sao ưu tiên reference `self`

Hai dạng value (`self`, `mut self`) **lấy ownership** → sau khi gọi một method, instance bị move vào `self`, không gọi method khác được:

```rust
song.display_song_info();    // nếu là (self) → song bị move vào đây
song.double_length();        // ERROR — song đã move ở dòng trên
```

Dùng `self`/`mut self` (value) → mỗi instance chỉ gọi được **một** method rồi mất. Phải return `self` để giữ lại — rườm rà (vấn đề scale bài 51). Nên **gần như luôn dùng `&self`/`&mut self`** (reference): instance sống mãi, gọi bao nhiêu method cũng được. Value `self` chỉ dùng khi method cố ý **tiêu thụ** struct (hiếm, vd chuyển đổi rồi huỷ instance cũ).

| Dạng `self` | Ownership | Sửa? | Gọi nhiều method? | Dùng khi |
|---|---|---|---|---|
| `self` | move | Không | Không (mất sau 1 lần) | Tiêu thụ struct |
| `mut self` | move | Có | Không | Tiêu thụ + sửa |
| `&self` | mượn | Không | **Có** | **Đọc** (phổ biến nhất) |
| `&mut self` | mượn | Có | **Có** | **Sửa** (phổ biến) |

## Rust tự dereference khi gọi method qua reference

Dù `self` là `&TaylorSwiftSong` (reference), `self.title` vẫn chạy — Rust tự deref khi dùng `.` (nhắc lại bài 48, 67). Code method giống nhau dù `self` là value hay reference — thiết kế nhất quán.

## Use case thực tế

```rust
#[derive(Debug)]
struct BankAccount { owner: String, balance: f64 }

impl BankAccount {
    fn display(&self) {                      // đọc → &self
        println!("{}: {:.2}đ", self.owner, self.balance);
    }
    fn deposit(&mut self, amount: f64) {     // sửa → &mut self
        self.balance += amount;
    }
    fn withdraw(&mut self, amount: f64) -> bool {
        if amount <= self.balance {
            self.balance -= amount;
            true
        } else {
            false
        }
    }
}

fn main() {
    let mut acc = BankAccount { owner: String::from("Anh"), balance: 100.0 };
    acc.deposit(50.0);
    acc.withdraw(30.0);
    acc.display();                   // Anh: 120.00đ
}
```

Method gom hành vi của `BankAccount` (đọc, gửi, rút) vào một chỗ; mọi tài khoản tự động có. `&self` cho đọc, `&mut self` cho sửa — đúng pattern.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `self` làm tham số đầu | Thành associated function (bài 72) | Method luôn có `self` |
| Dùng `self` (value) rồi gọi method tiếp | move error | Dùng `&self`/`&mut self` |
| `&self` rồi cố sửa field | Không quyền | Dùng `&mut self` |
| Quên `mut` owner khi gọi `&mut self` method | Compile error | `let mut` instance |
| Truyền `self` lúc gọi | Lỗi | Rust tự truyền; chỉ truyền tham số sau `self` |
| Định nghĩa method ngoài `impl` | Không gắn struct | Đặt trong `impl` block |

## Tóm tắt bài 70

- **Method** = function thuộc struct, sống trong **`impl` block**; field = dữ liệu, method = hành vi.
- Tham số đầu luôn là **`self`** (đại diện struct); truy cập field qua `self.field`; gọi `instance.method()` (không truyền `self`).
- **4 dạng `self`**: `self`/`mut self` (value, move) và `&self`/`&mut self` (reference, mượn) — như 4 cách truyền struct.
- **Ưu tiên `&self`** (đọc) và **`&mut self`** (sửa) — không mất ownership, gọi nhiều method được.
- `self`/`mut self` (value) lấy ownership → instance mất sau 1 method; chỉ dùng khi tiêu thụ struct.
- `Self` (S hoa) = alias type đang impl; Rust tự deref khi dùng `.` qua reference.

**Bài kế tiếp** → [Bài 71: Methods nâng cao — nhiều tham số & gọi method từ method](06-methods-nang-cao.md)
