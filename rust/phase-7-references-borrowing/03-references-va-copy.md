# Bài 55: References & Copy trait — immutable ref copy, mutable ref move

Bài 49 nói "reference implement Copy". Nhưng đó chỉ đúng với **immutable** reference. **Mutable** reference thì **không** Copy — nó **move** như String. Vì sao khác nhau? Câu trả lời nối thẳng với quy tắc borrowing (bài 54): nhiều reader được, một writer thôi. Hiểu bài này khoá lại toàn bộ mô hình reference.

## Immutable reference implement Copy

Gán một immutable reference cho biến khác → **copy reference**, cả hai dùng được:

```rust
fn main() {
    let coffee = String::from("Mocha");
    let a = &coffee;          // immutable ref
    let b = a;                // COPY ref — không move

    println!("{a} {b}");      // OK — Mocha Mocha (cả hai valid)
}
```

`a` vẫn dùng được sau `let b = a;`. Vì immutable reference implement **Copy** — nó là một địa chỉ, copy rẻ. Hình dung `let b = a;` như tạo **immutable reference thứ hai** tới `coffee`:

```text
  coffee → "Mocha"
  a ──────┐
  b ──────┴──> trỏ cùng "Mocha"  (hai địa chỉ, copy của nhau)
```

**Vì sao được phép Copy**: theo quy tắc borrowing, **nhiều immutable reference cùng lúc là an toàn** (bài 54). Tạo bản sao của immutable ref = thêm một reader → không rủi ro. Nên Rust cho copy tự do.

## Mutable reference KHÔNG implement Copy → move

Đổi `a` thành mutable reference, kết quả ngược hẳn:

```rust
fn main() {
    let mut coffee = String::from("Mocha");
    let a = &mut coffee;      // mutable ref
    let b = a;                // MOVE — không copy!

    // println!("{a}");       // ERROR — a đã bị move
    println!("{b}");          // OK — b là owner mới của mutable ref
}
```
```text
error[E0382]: borrow of moved value: `a`
  note: `&mut String` does not implement the `Copy` trait
```

`a` (mutable ref) **không** Copy → `let b = a;` là **move**: ownership của mutable reference chuyển sang `b`, `a` **vô hiệu hoá**.

**Vì sao mutable ref không Copy**: nếu nó Copy, `let b = a;` sẽ tạo **hai** mutable reference cùng trỏ một data → vi phạm quy tắc 2 (chỉ một writer). Để giữ quy tắc đó, Rust **bắt buộc** mutable reference **move** thay vì copy — đảm bảo luôn chỉ một mutable reference hợp lệ tại một thời điểm.

```text
Nếu &mut Copy được:  a ─┐
                        ├─> "Mocha"  → HAI writer → vi phạm quy tắc 2
                     b ─┘
Nên Rust bắt move:   a (vô hiệu)  b ─> "Mocha"  → một writer → an toàn
```

## So sánh: hai loại reference, hai hành vi

```text
Immutable ref (&T)   → Copy  → gán = copy, cả hai valid   (nhiều reader OK)
Mutable ref  (&mut T) → Move → gán = move, bản gốc vô hiệu (một writer)
```

| | `&String` (immutable) | `&mut String` (mutable) |
|---|---|---|
| Implement Copy? | **Có** | **Không** |
| `let b = a;` | copy (cả hai valid) | move (`a` vô hiệu) |
| Lý do | nhiều reader an toàn | giữ "một writer" |
| Số ref cùng data | bao nhiêu cũng được | đúng một |

Đây là biểu hiện trực tiếp của quy tắc borrowing ở tầng Copy/Move: Copy-able ↔ nhiều reader an toàn; non-Copy (move) ↔ ép một writer.

## Move xảy ra ở dòng gán

Như mọi move, mutable ref valid tới **trước** dòng gán:

```rust
fn main() {
    let mut coffee = String::from("Mocha");
    let a = &mut coffee;
    let b = a;                // move ở đây
    // a chết, b sống

    let mut tea = String::from("Earl");
    let x = &mut tea;
    println!("{x}");          // x dùng được TRƯỚC khi move
    let y = x;                // move
    println!("{y}");
}
```

Lỗi `let b = a` với mutable ref **không** phải vì "dùng a và b cùng nhau" — mà vì **chỉ riêng việc dùng `a` sau move** đã sai (a là tên vô hiệu).

## Áp dụng cho function parameters

Cùng quy tắc khi truyền reference vào hàm:

```rust
fn read(r: &String) { println!("{r}"); }
fn modify(r: &mut String) { r.push_str("!"); }

fn main() {
    let mut s = String::from("hi");

    let a = &s;
    read(a);                  // immutable ref Copy → a vẫn dùng được sau
    read(a);                  // OK — gọi lại

    let m = &mut s;
    modify(m);                // mutable ref MOVE vào hàm → m vô hiệu sau
    // modify(m);             // ERROR — m đã move
}
```

Truyền immutable ref vào hàm = copy (dùng lại được). Truyền mutable ref = move (dùng một lần). Trong thực tế thường truyền `&mut s` trực tiếp (`modify(&mut s)`) thay vì qua biến trung gian — tránh vướng move.

## Đào sâu: Copy trait phản ánh ngữ nghĩa an toàn

Tại sao Rust gắn Copy với immutable mà không với mutable? Vì **Copy chỉ an toàn khi nhân bản không phá quy tắc nào**:
- Nhân bản immutable ref → thêm reader → quy tắc "nhiều reader" cho phép → Copy OK.
- Nhân bản mutable ref → thêm writer → vi phạm "một writer" → **không** thể Copy.

Copy trait ở Rust không tuỳ tiện — nó được trao cho type **khi và chỉ khi** việc tự động nhân bản giá trị đó luôn an toàn. Mutable reference không thoả → không Copy → buộc move. Đây là sự nhất quán: cùng một nguyên lý an toàn (mô hình ownership/borrowing) chi phối cả Copy lẫn move lẫn quy tắc reference.

```text
Type implement Copy ⟺ tự động nhân bản LUÔN an toàn
  i32, bool       → copy bit stack, vô hại        → Copy ✓
  &T (immutable)  → thêm reader, vô hại           → Copy ✓
  &mut T          → thêm writer, vi phạm quy tắc  → Copy ✗ (move)
  String          → nhân đôi heap, đắt/owner kép  → Copy ✗ (move)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng mutable ref sau khi gán nó đi | `moved value` | Mutable ref move; dùng `b` (owner mới) |
| Tưởng mọi reference đều Copy | Chỉ immutable | Mutable ref move |
| Mong hai `&mut` từ cùng data | Vi phạm "một writer" | Một mutable ref tại một thời điểm |
| Truyền `&mut` qua biến rồi tái dùng biến | Move | Truyền `&mut s` trực tiếp |
| Quên owner phải `mut` để tạo `&mut` | Compile error | `let mut` owner |

## Tóm tắt bài 55

- **Immutable reference** (`&T`) implement **Copy** → `let b = a;` copy, cả hai valid (nhiều reader an toàn).
- **Mutable reference** (`&mut T`) **không** Copy → `let b = a;` **move**, `a` vô hiệu (giữ "một writer").
- Mutable ref buộc move để không bao giờ có hai writer cùng data — đúng quy tắc borrowing (bài 54).
- Truyền vào hàm: immutable ref = copy (dùng lại được); mutable ref = move (một lần).
- Copy trait được trao **khi và chỉ khi** tự động nhân bản luôn an toàn — nhất quán với mô hình ownership.

**Bài kế tiếp** → [Bài 56: Dangling references — reference trỏ vào vùng đã giải phóng](04-dangling-references.md)
