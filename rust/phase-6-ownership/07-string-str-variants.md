# Bài 49: String, &String, str, &str — bốn type chuỗi và reference là Copy

`&str`, `String`, `&String`, `str` — bốn cách viết "chuỗi" trong Rust, và đây là điểm gây bối rối bậc nhất cho người mới. Giờ bạn đã hiểu references (bài 48), ta gỡ rối triệt để bốn type này. Cộng thêm một sự thật quan trọng: **reference implement Copy trait** — giải thích vì sao gán `&str` không bao giờ "move".

## Bốn biến thể chuỗi

```text
String   →  text động, sở hữu, trên HEAP (runtime)
&String  →  reference tới một String trên heap
str      →  text read-only nhúng trong BINARY (compile-time)
&str     →  reference tới một str (string slice/literal)
```

Mổ xẻ từng cái:

### `String` — text sở hữu, heap

Đã học (bài 46): text động trên heap, mutable, owner chịu trách nhiệm dọn. Tạo bằng `String::from`/`String::new`.

### `&String` — reference tới String

Dùng `&` trước một `String` (bài 48) → địa chỉ tới String trên heap. Tránh nhân đôi heap data — chỉ lưu địa chỉ.

```rust
let owned = String::from("hi");
let r: &String = &owned;         // &String
```

### `str` — text nhúng binary

`str` là text **read-only**, **nhúng thẳng vào binary executable** lúc compile. Compiler biết chính xác text và kích thước → đặt vào file thực thi, không phải stack hay heap. Vì cố định, **không đổi được**.

Bạn **hiếm khi** dùng `str` trực tiếp — luôn qua reference `&str`.

### `&str` — reference tới str (cái bạn dùng suốt khoá học)

Khi viết `"pasta"` (string literal), bạn tạo một `str` nhúng binary, nhưng biến nhận được là **`&str`** — reference tới text đó:

```rust
let food = "pasta";              // type: &str
```

Dấu `&` ở `&str` chính là dấu hiệu nó là **reference**. Tới giờ mọi string literal bạn dùng đều là `&str` — đó là lý do type hiện ra `&str` chứ không phải `str`.

## `&str` trỏ vào đâu — không phải stack, không phải heap

Điểm tinh tế: `&str` của string literal **không** trỏ vào stack hay heap, mà trỏ vào **text nhúng trong binary** (đã được nạp vào memory khi chương trình chạy).

```text
Source code:  let food = "pasta";
       ↓ compile
Binary executable: ...[pasta]...   ← text nhúng ở đây
       ↓ runtime (nạp vào memory)
food: &str ───trỏ tới──> "pasta" trong vùng nhớ chứa binary đã nạp
```

Nên không có chuyện nhân đôi text này — chỉ là một reference đi theo địa chỉ tới text trong binary. Mọi string literal đều theo cơ chế này. (Có thể tự kiểm chứng: mở binary trong `target/debug/` bằng hex editor, search text literal — sẽ thấy nó nằm trong file.)

## Bảng so sánh đầy đủ

| Type | Sở hữu? | Đổi được? | Ở đâu | Khi dùng |
|---|---|---|---|---|
| `String` | Có (owner) | Có | Heap | Text động, build, lưu trữ |
| `&String` | Không (mượn) | Không | (địa chỉ tới heap) | Mượn một String |
| `str` | — | Không | Binary | Hầu như không dùng trực tiếp |
| `&str` | Không (mượn) | Không | (địa chỉ tới binary/heap) | Literal, tham số chỉ-đọc |

> Lưu ý: `&str` cũng trỏ được tới một phần của `String` trên heap (slice) — phase 8 (Slices) đào sâu. Vì vậy `&str` là type tham số linh hoạt nhất cho hàm chỉ đọc text (bài 50).

## Reference implement Copy trait

Đây là mảnh ghép quan trọng. Ở bài 45, type stack implement Copy. **Reference cũng implement Copy** — reference là một địa chỉ, kích thước cố định, copy rẻ.

Hệ quả: gán một reference cho biến khác → **copy reference**, **không** move:

```rust
fn main() {
    let ice_cream = "Cookies and Cream";   // &str
    let dessert = ice_cream;               // COPY reference, không move

    println!("{ice_cream}");               // OK — vẫn valid!
    println!("{dessert}");                 // OK
}
```

Khác hẳn `String` (move ở bài 47), `&str` gán đi gán lại đều OK — vì reference là Copy. Cả hai biến giữ một địa chỉ trỏ tới **cùng** text trong binary.

```text
  ice_cream → địa chỉ ─┐
                       ├──> "Cookies and Cream" (một text trong binary)
  dessert   → địa chỉ ─┘   (hai địa chỉ, một text)
```

```text
Hai tờ giấy ghi CÙNG một địa chỉ → dẫn tới cùng một ngôi nhà.
```

Không move ownership (reference không "sở hữu" text gốc), không nhân đôi text — chỉ copy địa chỉ (rẻ). Đây là lý do bạn chưa từng gặp lỗi "moved value" khi làm việc với string literal.

## Vì sao điều này quan trọng cho ownership

| Gán | Hành vi | Bản gốc sau đó |
|---|---|---|
| `let b = a;` với `i32` | Copy (stack) | valid |
| `let b = a;` với `&str`/`&String` | **Copy reference** | valid |
| `let b = a;` với `String` | **Move** | vô hiệu hoá |

Quy tắc gộp: **type Copy (stack data + references) → copy; type non-Copy (heap data như String) → move.** Reference rơi vào nhóm Copy — đó là tính chất nền cho việc truyền reference vào nhiều hàm mà không lo ownership (bài 50, phase 7).

## Đào sâu: vì sao Rust nhúng str vào binary

`str` cố định nên Rust nhúng vào binary thay vì cấp phát runtime:
- **Nhanh**: không tốn thời gian allocate heap lúc chạy.
- **Chia sẻ**: nhiều `&str` trỏ cùng text, không nhân bản.
- **An toàn**: text read-only, không ai sửa được → không lo mutation đua tranh.

Đây là tối ưu compile-time: thứ biết trước thì cố định hoá, thứ động thì để heap. Cùng triết lý "biết compile-time → rẻ; runtime → linh hoạt" xuyên suốt Rust.

## Quy tắc thực dụng chọn type

```text
Text sẽ đổi/co giãn?           → String
Chỉ đọc, hard-code trong code? → &str (literal)
Hàm chỉ cần ĐỌC text?          → tham số &str (nhận cả String lẫn literal — bài 50)
Cần mượn một String có sẵn?    → &String (hoặc &str)
```

`str` trực tiếp gần như không bao giờ viết — luôn qua `&str`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Nhầm `String` và `&str` là một | Type mismatch | Hai type khác: sở hữu vs mượn |
| Mong `&str` move khi gán | Không — là Copy | Reference luôn copy |
| Dùng `str` trực tiếp | Hầu như không hợp lệ | Dùng `&str` |
| Tham số hàm dùng `String` khi chỉ đọc | Buộc caller move/clone | Dùng `&str` (bài 50) |
| Tưởng literal nằm trên heap | Nằm trong binary | `&str` trỏ text nhúng binary |
| Tưởng `&String` = `&str` | Liên quan nhưng khác type | (deref coercion — phase 8) |

## Tóm tắt bài 49

- Bốn biến thể: **`String`** (sở hữu, heap, động), **`&String`** (mượn String), **`str`** (text nhúng binary, read-only), **`&str`** (reference tới str — string literal).
- String literal `"..."` có type **`&str`** — trỏ tới text nhúng trong **binary** (không stack/heap).
- **Reference implement Copy** → gán `&str`/`&String` là **copy địa chỉ**, không move; bản gốc valid.
- Quy tắc gộp: type Copy (stack + references) → copy; non-Copy (String) → move.
- `str` nhúng binary để nhanh/chia sẻ/an toàn; gần như luôn dùng qua `&str`.
- Hàm chỉ-đọc text → tham số **`&str`** (linh hoạt nhất — bài 50).

**Bài kế tiếp** → [Bài 50: Ownership với function parameters — truyền vào hàm là copy hay move](08-ownership-functions.md)
