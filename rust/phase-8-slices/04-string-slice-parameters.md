# Bài 62: String slice làm tham số hàm — `&str` linh hoạt & deref coercion

Khi viết hàm nhận text, bạn chọn type tham số: `String`? `&String`? `&str`? Lựa chọn này quan trọng hơn vẻ ngoài. Dùng `&str` làm tham số khiến hàm nhận được **cả** `&String` lẫn `&str` — linh hoạt nhất. Bí mật đằng sau là **deref coercion**, một tính năng Rust tự động chuyển `&String` thành `&str`. Đây là quy tắc thiết kế API quan trọng bạn sẽ dùng mãi.

## Vấn đề: `&String` parameter quá hẹp

Hàm nhận `&String` chỉ chấp nhận đúng `&String`:

```rust
fn do_hero_stuff(hero_name: &String) {       // chỉ nhận &String
    println!("{hero_name} cứu thế giới");
}

fn main() {
    let action_hero = String::from("Arnold");
    do_hero_stuff(&action_hero);             // OK — &String

    let another = "Sylvester";               // &str (literal)
    do_hero_stuff(another);                  // ERROR — &str không phải &String
}
```
```text
error[E0308]: mismatched types: expected `&String`, found `&str`
```

`&String` parameter từ chối `&str` (string literal, hoặc slice một đoạn). Hẹp — caller có literal hoặc slice thì kẹt.

## Giải pháp: `&str` parameter linh hoạt

Đổi tham số thành `&str` → hàm nhận **cả hai**:

```rust
fn do_hero_stuff(hero_name: &str) {          // nhận &str VÀ &String
    println!("{hero_name} cứu thế giới");
}

fn main() {
    let action_hero = String::from("Arnold");
    do_hero_stuff(&action_hero);             // OK — &String tự chuyển thành &str

    let another = "Sylvester";               // &str
    do_hero_stuff(another);                  // OK — &str khớp trực tiếp

    do_hero_stuff(&action_hero[0..6]);       // OK — slice một đoạn cũng được
}
```

`&str` parameter chấp nhận: string literal (`&str`), slice một đoạn (`&str`), **và** `&String`. Linh hoạt nhất.

## Deref coercion — vì sao `&String` lọt vào `&str`

Vì sao `&action_hero` (`&String`) truyền được vào hàm nhận `&str`? Tính năng **deref coercion**: khi gặp một reference, Rust **tự dereference** đến khi khớp type cần. Cụ thể, Rust tự chuyển `&String` → `&str` sau lưng:

```text
do_hero_stuff(&action_hero)
   &action_hero : &String
   → Rust deref coercion → &str   (tự động, sau lưng)
   → khớp tham số &str  ✓
```

`&String` chứa một String hoàn chỉnh, nên Rust luôn biểu diễn nó như một `&str` (slice bao toàn bộ). Chuyển được an toàn → Rust tự làm.

## Coercion CHỈ một chiều: &String → &str, không ngược lại

Điểm cốt lõi. Vì sao hàm nhận `&String` **không** nhận `&str` (ví dụ đầu bài)? Vì coercion **một chiều**:

```text
&String  ──coerce──>  &str    ✓ (luôn an toàn)
&str     ──✗──────>  &String  ✗ (không đảm bảo)
```

- `&String` → `&str`: **luôn được**. Một `&String` chắc chắn là reference tới một String đầy đủ → biểu diễn thành slice (bao toàn bộ) được.
- `&str` → `&String`: **không được**. Một `&str` có thể là slice **một đoạn**, hoặc literal trong binary — **không** đảm bảo nó đến từ một String trên heap. Rust không thể "bịa ra" một String → từ chối.

```text
&str có thể là: slice một đoạn | literal trong binary | slice toàn bộ
→ KHÔNG đảm bảo là &String → Rust không coerce ngược
```

Đây là lý do `&str` parameter "rộng hơn": mọi `&String` chuyển thành `&str` được, nhưng không phải `&str` nào cũng là `&String`. Nhận type rộng (`&str`) → chấp nhận nhiều đầu vào hơn.

## Quy tắc thiết kế: tham số text dùng `&str`

| Type tham số | Nhận được | Đánh giá |
|---|---|---|
| `String` | chỉ String (move/clone) | Hẹp + lấy ownership |
| `&String` | chỉ `&String` | Hẹp |
| **`&str`** | `&str`, `&String`, slice | **Linh hoạt nhất** ✓ |

**Quy tắc vàng**: hàm chỉ **đọc** text → tham số `&str`. Nó nhận mọi dạng text (literal, String mượn, slice), không buộc caller move hay clone. Đây là idiom Rust chuẩn — thư viện Rust dùng `&str` cho tham số text khắp nơi.

```rust
// Idiomatic: nhận &str
fn greet(name: &str) {
    println!("Chào {name}");
}

fn main() {
    let owned = String::from("Anh");
    greet(&owned);           // &String → &str
    greet("Bình");           // &str literal
    greet(&owned[0..1]);     // slice
}
```

## Khi nào KHÔNG dùng `&str`

| Tình huống | Dùng |
|---|---|
| Hàm chỉ đọc text | `&str` |
| Hàm cần **sở hữu**/tiêu thụ text | `String` (move) |
| Hàm cần **sửa tại chỗ** | `&mut String` |
| Hàm lưu text vào struct lâu dài | `String` (thường) |

`&str` cho **đọc**. Cần sở hữu/sửa thì dùng type tương ứng (bài 50, 53).

## Đào sâu: deref coercion ở method calls

Deref coercion không chỉ ở tham số hàm — nó giải thích vì sao gọi method `&str` trên một `String` chạy được:

```rust
let s = String::from("hello world");
let n = s.len();                 // len() là method... String có, &str cũng có
let word = s.split(' ').next();  // split là method của str — String tự coerce
```

Khi gọi method, Rust tự deref `String` → `str` để tìm method phù hợp. Nên `String` "thừa hưởng" mọi method của `str`. Đây là lý do bạn dùng `String` và `&str` gần như thay thế nhau khi gọi method — coercion làm cầu nối ngầm.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tham số `&String` cho hàm chỉ đọc | Từ chối literal/slice | Dùng `&str` |
| Mong `&str` → `&String` tự chuyển | Không (một chiều) | Chỉ `&String` → `&str` |
| Dùng `String` parameter khi chỉ đọc | Buộc caller move/clone | Dùng `&str` |
| Quên `&` khi truyền String vào `&str` param | Type mismatch | Truyền `&owned` |
| Tưởng phải `&owned[..]` để có &str | `&owned` coerce sẵn | `&owned` đủ |

## Tóm tắt bài 62

- Tham số **`&str`** nhận được **`&str`** (literal, slice) **và** **`&String`** → linh hoạt nhất.
- **Deref coercion**: Rust tự chuyển `&String` → `&str` sau lưng khi cần.
- Coercion **một chiều**: `&String`→`&str` luôn được; `&str`→`&String` **không** (slice/literal không đảm bảo là String).
- **Quy tắc vàng**: hàm chỉ đọc text → tham số `&str` (idiom Rust); cần sở hữu/sửa thì `String`/`&mut String`.
- Deref coercion cũng cho phép gọi method của `str` trên `String` — cầu nối ngầm.

**Bài kế tiếp** → [Bài 63: Array slices — `&[T]`, độ dài động & deref coercion](05-array-slices.md)
