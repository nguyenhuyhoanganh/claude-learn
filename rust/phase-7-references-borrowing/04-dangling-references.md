# Bài 56: Dangling references — reference trỏ vào vùng đã giải phóng

Bạn trả về một reference tới String tạo trong hàm. Hàm kết thúc, String bị dọn, nhưng reference vẫn trỏ tới ô heap đó — giờ trống rỗng. Đó là **dangling reference**: địa chỉ tới ngôi nhà đã bị phá. Ở C/C++ đây là nguồn bug và lỗ hổng bảo mật kinh điển. Rust **chặn tại compile time** — không thể viết nổi. Bài này: dangling reference là gì, vì sao Rust cấm, và cách sửa.

## Dangling reference là gì

**Dangling reference** = một reference (con trỏ) tới địa chỉ memory đã được **giải phóng** (deallocated). "Dangle" = lủng lẳng, không đáng tin → reference tới nơi giá trị **không còn tồn tại**.

Ví von: bạn đưa địa chỉ một ngôi nhà cho bạn bè, nhưng ngôi nhà đã bị phá. Địa chỉ giờ vô dụng — dẫn tới bãi đất trống.

## Ví dụ vi phạm — trả reference tới giá trị cục bộ

```rust
fn create_city() -> &String {        // trả &String
    let city = String::from("Hà Nội");
    &city                             // trả reference tới city
}                                     // city ra khỏi scope → DỌN "Hà Nội"
```
```text
error[E0106]: missing lifetime specifier
  this function's return type contains a borrowed value,
  but there is no value for it to be borrowed from
```

Lưu ý: lỗi xuất hiện **dù chưa gọi** `create_city`. Chỉ riêng định nghĩa đã sai. Lần theo:

```text
1. let city = String::from("Hà Nội");  → city là owner của "Hà Nội" trên heap
2. &city                                → tạo reference tới ô heap đó
3. } (hết hàm)                          → city ra khỏi scope → DỌN "Hà Nội"
4. nhưng đã return reference tới ô vừa dọn → DANGLING
```

Hàm kết thúc, `city` (owner) dọn text heap. Reference trả về trỏ tới ô **đã bị xoá** → dangling. Rust từ chối compile.

```text
create_city trả &String ──> ô heap
                              │
} hết hàm: city dọn ô ────────┘ ← ô bị xoá
→ reference trỏ tới ô trống = dangling → CẤM
```

## Vì sao Rust chặn — quy tắc cốt lõi

Rust **đảm bảo**: reference **không bao giờ** sống lâu hơn giá trị nó trỏ tới. Diễn đạt:

> **The referent must outlive the reference** — giá trị gốc (referent) phải sống lâu hơn mọi reference tới nó.

```text
Ngôi nhà phải đứng lâu hơn mọi địa chỉ tới nó
→ địa chỉ luôn dẫn tới ngôi nhà còn đứng (hợp lệ)
```

Compiler kiểm điều này tại compile time. Reference Rust **luôn** trỏ tới data hợp lệ — đây là khác biệt then chốt với "pointer" ở C (có thể dangling, đọc rác/crash/lỗ hổng).

## Cách sửa: trả ownership, đừng trả reference

Compiler gợi ý: "return the owned value directly". Thay vì trả `&String` (reference), trả `String` (ownership):

```rust
fn create_city() -> String {         // trả String (ownership), không &String
    let city = String::from("Hà Nội");
    city                             // MOVE ownership ra → bảo toàn
}

fn main() {
    let c = create_city();           // c là owner mới
    println!("{c}");                 // Hà Nội
}
```

Khi trả `String` (ownership move ra — bài 51), giá trị **không** bị dọn cuối hàm mà được chuyển về caller. Không còn ô heap nào bị xoá oan → không dangling. Đơn giản hơn:

```rust
fn create_city() -> String {
    String::from("Hà Nội")           // tạo và move ra luôn
}
```

```text
Trả &String  → reference tới ô bị dọn  → DANGLING (cấm)
Trả String   → MOVE ownership ra        → ô được bảo toàn (OK)
```

Quy tắc: hàm **tạo** giá trị → trả **ownership** (`-> String`), không trả reference tới giá trị cục bộ.

## Đào sâu: vì sao đây là an toàn lớn

Ở C/C++, dangling pointer (còn gọi **use-after-free**) là một trong những lỗ hổng bảo mật phổ biến và nguy hiểm nhất:
- Đọc data đã giải phóng → đọc rác hoặc data của thứ khác (rò rỉ thông tin).
- Ô đó được cấp lại cho data khác → ghi đè/đọc nhầm → corruption, có thể bị khai thác chiếm quyền.

Rust **loại bỏ hoàn toàn** lớp lỗ hổng này tại compile time — không cần runtime check, không tốn hiệu năng. Đây là một trong những lý do Rust được chọn cho code bảo mật trọng yếu (trình duyệt, OS, hệ thống nhúng). "Memory safety without garbage collection" — và dangling reference là một mảnh quan trọng của lời hứa đó.

## Khi nào trả reference là hợp lệ

Trả reference **được phép** khi reference trỏ tới data **sống lâu hơn** hàm — ví dụ data được truyền **vào** hàm (caller sở hữu, sống tiếp sau hàm):

```rust
fn first_word(s: &String) -> &str {      // trả ref tới data của CALLER
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b' ' {
            return &s[0..i];             // ref vào s (caller sở hữu) — OK
        }
    }
    &s[..]
}

fn main() {
    let sentence = String::from("Xin chao");
    let word = first_word(&sentence);    // sentence sống tiếp → ref hợp lệ
    println!("{word}");                   // Xin
}
```

Ở đây reference trả về trỏ tới `sentence` (caller sở hữu), **không** tới biến cục bộ của hàm → `sentence` sống lâu hơn reference → hợp lệ. Đây là tiền đề cho **string slices** (phase 8) — trả về phần của một String mà không copy. (Trường hợp phức tạp cần chú thích **lifetime** tường minh — phase Lifetimes về sau.)

| Trả reference tới... | Hợp lệ? | Vì sao |
|---|---|---|
| Giá trị **cục bộ** trong hàm | ✗ | Bị dọn cuối hàm → dangling |
| Giá trị truyền **vào** (của caller) | ✓ | Caller sống lâu hơn → hợp lệ |

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Trả `&` tới biến cục bộ | `missing lifetime` / dangling | Trả ownership (`String`) |
| Tưởng phải gọi hàm mới lỗi | Lỗi ngay ở định nghĩa | Sửa chữ ký hàm |
| Trả reference khi hàm tạo giá trị mới | Sai mô hình | Hàm tạo → trả ownership |
| Cố "lách" để giữ ref tới data đã dọn | Compiler chặn | Không thể; đổi sang ownership |
| Nhầm referent với reference | Hiểu sai quy tắc | Referent (gốc) phải sống lâu hơn reference |

## Tóm tắt bài 56

- **Dangling reference** = reference tới vùng memory đã **giải phóng** (giá trị không còn) — bug nặng ở C (use-after-free).
- Trả `&String` tới **biến cục bộ** → biến bị dọn cuối hàm → reference dangling → Rust **cấm compile** (dù chưa gọi).
- Quy tắc: **referent phải sống lâu hơn reference** — Rust đảm bảo reference luôn trỏ data hợp lệ.
- Sửa: hàm tạo giá trị → trả **ownership** (`-> String`, move ra), không trả reference tới giá trị cục bộ.
- Rust loại bỏ lớp lỗ hổng use-after-free tại **compile time**, không tốn hiệu năng — lý do dùng cho code bảo mật.
- Trả reference **hợp lệ** khi trỏ data sống lâu hơn hàm (vd data của caller) → tiền đề cho slices (phase 8).

**Bài kế tiếp** → [Bài 57: Ownership với Array & Tuple — index làm move hay copy](05-ownership-arrays-tuples.md)
