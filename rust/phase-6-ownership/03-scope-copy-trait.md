# Bài 45: Scope & Copy trait — biến chết cuối scope, type stack tự copy

Giờ ghép ownership với scope (phase 2) và xem điều xảy ra khi gán biến này cho biến khác. Với data stack (`i32`, `bool`...) kết quả "bình thường" — copy tự động, cả hai biến dùng được. Hiểu kỹ trường hợp "bình thường" này là điều kiện để thấy data heap (`String`) hành xử **khác hẳn** ở bài sau. Bí mật nằm ở một trait: **Copy**.

## Ownership gắn với scope

Nhắc lại: **scope** = vùng một tên còn valid, gắn với **block** (`{}`). Mọi giá trị Rust có owner, và owner dọn giá trị **khi ra khỏi scope** (chạm `}`):

```rust
fn main() {
    let age = 33;        // 'age' là owner của 33
    // ... dùng age ...
}                         // hết scope → 'age' dọn 33 khỏi stack
```

Với block lồng, biến chết khi block lồng kết thúc:

```rust
fn main() {
    let age = 33;
    {
        let is_handsome = true;       // owner của true
        println!("{is_handsome}");
    }                                  // 'is_handsome' ra khỏi scope → dọn
    // println!("{is_handsome}");     // ERROR: cannot find value
    println!("{age}");                 // age vẫn sống (scope main)
}
```

## Dọn theo thứ tự LIFO

Khi nhiều biến cùng scope kết thúc, stack dọn theo **LIFO** (vào sau ra trước):

```rust
fn main() {
    let age = 33;            // push 33 (đầu tiên)
    let is_handsome = true;  // push true (sau)
    // ... dùng ...
}   // dọn: true trước (is_handsome), rồi 33 (age) — LIFO
```

```text
Push:  age=33 → is_handsome=true
Pop:   is_handsome (true) trước → age (33) sau   [LIFO]
```

Thứ tự dọn không ảnh hưởng kết quả chương trình — đây là chi tiết behind-the-scenes. Điểm cần nhớ: mỗi owner dọn giá trị của mình khi ra khỏi scope.

## Gán biến cho biến: điều gì xảy ra?

Câu hỏi cốt lõi của cả phase. Xét gán một biến cho biến khác:

```rust
fn main() {
    let time = 2025;        // time là owner của 2025
    let year = time;        // ??? điều gì xảy ra với 2025?
}
```

Nhớ: vế phải `=` được đánh giá trước. Rust thấy `time` (= 2025). Vì `i32` **implement Copy trait**, Rust tạo **bản sao đầy đủ** của `2025` trên stack. Kết quả: `time` và `year` là **hai bản độc lập** của `2025`, hai owner riêng biệt.

```text
Stack:
  time → 2025   (bản gốc, vẫn valid)
  year → 2025   (bản sao độc lập)
```

Cả hai dùng được sau dòng gán:

```rust
fn main() {
    let time = 2025;
    let year = time;
    println!("Năm {time}, cũng là {year}");   // CẢ HAI valid → 2025, 2025
}
```

## Copy trait là gì

**Copy** là một trait (như Debug/Display — bài 27). Type implement Copy **hứa** rằng nó có thể được **sao chép đầy đủ tự động** trong các tình huống cần bản sao (như gán biến).

Các type **scalar, kích thước cố định, lưu trên stack** đều implement Copy:

| Type | Copy? |
|---|---|
| `i32`, `u64`, mọi integer | ✓ |
| `f32`, `f64` | ✓ |
| `bool` | ✓ |
| `char` | ✓ |
| tuple của type Copy (vd `(i32, bool)`) | ✓ |
| array của type Copy | ✓ |
| `String` | ✗ (heap) |
| `Vec<T>` | ✗ (heap) |

**Vì sao stack data implement Copy**: data trên stack kích thước cố định, dễ định vị, copy rẻ → tạo bản sao đầy đủ rẻ hơn là quản lý ownership phức tạp. Rust copy luôn cho gọn.

## Điểm then chốt: bản gốc vẫn valid

Với type Copy, sau khi "copy" sang biến khác, **bản gốc vẫn dùng được** (như ví dụ `time`/`year` trên). Đây là hành vi "bình thường" bạn mong đợi.

**Nhưng** — và đây là lý do cả phase tồn tại — điều này **chỉ đúng** với type Copy (stack). Với heap data như `String` (bài 47), bản gốc sẽ **bị vô hiệu hoá** sau khi gán. Hãy ghi nhớ ví dụ `time`/`year` này: bài tới sẽ lặp lại y hệt cú pháp với `String` và cho kết quả ngược lại.

```text
Copy type (i32):    let b = a;  → a VẪN dùng được (bản sao)
Non-Copy (String):  let b = a;  → a BỊ VÔ HIỆU (move) — bài 47
```

## Đào sâu: Copy vs Clone

Hai trait dễ nhầm (Clone ở bài 48):

| | Copy | Clone |
|---|---|---|
| Khi nào xảy ra | **Tự động** (gán, truyền hàm) | **Thủ công** (gọi `.clone()`) |
| Type áp dụng | Stack, kích thước cố định | Cả heap (String, Vec...) |
| Chi phí | Rẻ (stack) | Có thể đắt (copy cả heap) |
| Quan hệ | Type có Copy thì cũng có Clone | Clone không bắt buộc có Copy |

Copy là "sao chép ngầm, rẻ" cho stack; Clone là "sao chép tường minh, có thể đắt" cho heap. Một type chỉ được implement Copy nếu copy nó **chỉ là sao chép bit trên stack** (không đụng heap) — đó là lý do `String` không thể Copy.

## Type Copy không bao giờ "move"

Vì hệ quả: type implement Copy **không bao giờ** trải qua move (bài 47). Gán/truyền hàm luôn tạo bản sao, owner gốc còn nguyên. Khái niệm "move" và các lỗi "borrow of moved value" **chỉ** xảy ra với type non-Copy (heap). Đây là lý do tới giờ bạn chưa từng gặp lỗi ownership — ta chỉ dùng số/bool (Copy).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng mọi gán đều tạo bản sao | Sai với heap (String move) | Chỉ type Copy mới tự sao |
| Nhầm Copy với Clone | Hiểu sai chi phí | Copy tự động/rẻ; Clone thủ công/có thể đắt |
| Mong String implement Copy | Không (heap) | String dùng move hoặc `.clone()` |
| Dùng biến sau khi nó ra khỏi scope | Compile error | Khai ở scope đủ rộng |
| Tưởng thứ tự LIFO ảnh hưởng kết quả | Không, chỉ là chi tiết nội bộ | Bỏ qua khi viết logic |

## Tóm tắt bài 45

- Owner dọn giá trị khi **ra khỏi scope** (`}`); nhiều biến dọn theo **LIFO**.
- Gán biến cho biến: nếu type implement **Copy**, Rust tạo **bản sao đầy đủ** → cả hai valid.
- Type **stack, kích thước cố định** (i32, f64, bool, char, tuple/array của chúng) implement Copy.
- Stack data copy rẻ → Rust copy tự động cho gọn; **bản gốc vẫn dùng được**.
- **Copy** (tự động, rẻ, stack) ≠ **Clone** (thủ công, có thể đắt, heap).
- Type Copy **không bao giờ move** — lỗi ownership chỉ xảy ra với heap data (bài 47).

**Bài kế tiếp** → [Bài 46: String type — text động trên heap, `String::new`, `String::from`, `push_str`](04-string-type.md)
