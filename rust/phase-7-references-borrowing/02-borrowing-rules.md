# Bài 54: Quy tắc borrowing — nhiều reader HOẶC một writer

Reference cho mượn data — nhưng mượn bừa bãi sinh bug: reference A tưởng data là X, reference B đổi data thành Y, A đọc nhầm. Đây là **data race** — nguồn bug kinh điển ở ngôn ngữ khác. Rust diệt tận gốc bằng **quy tắc borrowing**, một trong những quy tắc quan trọng nhất cả ngôn ngữ. Bài này: hai quy tắc vàng, và vì sao compiler đôi khi "thông minh bất ngờ" cho qua code tưởng sai.

## Vấn đề: nhiều reference, kỳ vọng khác nhau

Ví von xe hơi: bạn (owner) cho hai bạn mượn xe màu xanh.
- Bạn A mượn **immutable** (chỉ dùng, không đổi) — kỳ vọng xe xanh, trả lại xe xanh.
- Bạn B mượn **mutable** (được đổi) — sơn xe thành đỏ.

A quay lại thấy xe **đỏ** → kỳ vọng vỡ. Trong code: reference A tưởng String có 5 ký tự, reference B (mutable) xoá/thêm ký tự → A trỏ tới data không như mong đợi → bug.

Rust giải bằng hai quy tắc.

## Quy tắc 1: bao nhiêu immutable reference cũng được

Một giá trị có thể có **vô số immutable reference** cùng lúc:

```rust
fn main() {
    let car = String::from("Đỏ");
    let r1 = &car;
    let r2 = &car;
    let r3 = &car;
    println!("{r1} {r2} {r3} {}", &car);   // OK — bao nhiêu cũng được
}
```

**Vì sao an toàn**: immutable reference **không** đổi được data. Không ai sửa → không có bất ngờ. 100 người mượn xe xanh, tất cả hứa không đổi → tất cả thấy xe xanh. Không rủi ro.

## Quy tắc 2: chỉ một mutable reference, và không kèm reference nào khác

Một giá trị chỉ được có **một mutable reference tại một thời điểm**, và khi đã có nó thì **không** được có reference nào khác (mutable hay immutable):

```rust
fn main() {
    let mut car = String::from("Đỏ");
    let r1 = &mut car;
    let r2 = &car;          // ERROR — đã có mutable ref, không thêm ref nào
    println!("{r1} {r2}");
}
```
```text
error[E0502]: cannot borrow `car` as immutable because it is also borrowed as mutable
```

**Vì sao**: mutable reference có quyền đổi data; reference khác kỳ vọng data ổn định. Để chúng cùng tồn tại → đúng tình huống "bạn A xe xanh, bạn B sơn đỏ". Compiler chặn để không bao giờ xảy ra.

Lưu ý: tạo `&mut` cần owner **`mut`** (`let mut car`).

## Quy tắc vàng: nhiều READER hoặc một WRITER

Gộp hai quy tắc thành một câu:

```text
Tại một thời điểm, một giá trị có thể có:
  - BẤT KỲ số immutable reference (nhiều reader),   HOẶC
  - ĐÚNG MỘT mutable reference (một writer)
  Không bao giờ cả hai cùng lúc.
```

| Tình huống | Cho phép? |
|---|---|
| Nhiều `&` (immutable) | ✓ |
| Một `&mut` (mutable) | ✓ |
| Một `&mut` + bất kỳ `&` | ✗ |
| Nhiều `&mut` | ✗ |

Đây là cách Rust **đảm bảo an toàn tại compile time**: không bao giờ có chuyện đọc data đang bị ghi đồng thời (data race). Ngôn ngữ khác chỉ phát hiện (nếu may) lúc runtime; Rust chặn lúc compile.

## Compiler thông minh: lifetimes (NLL)

Đây là phần gây bất ngờ. Code sau **tưởng vi phạm** quy tắc 2 nhưng vẫn compile:

```rust
fn main() {
    let mut car = String::from("Đỏ");
    let r1 = &mut car;
    println!("{r1}");          // r1 dùng LẦN CUỐI ở đây
    let r2 = &car;             // OK! r1 không còn dùng sau dòng trên
    println!("{r2}");
}
```

Compiler đủ thông minh để thấy: `r1` (mutable) **dùng lần cuối** ở dòng `println!("{r1}")`. Sau đó `r1` không còn được dùng → nó "chết". Vậy khi `r2` được tạo, `r1` đã hết hiệu lực → **không thực sự coexist** → an toàn → cho qua.

Đây là **lifetime** (vòng đời) của reference, cụ thể là cơ chế **NLL (Non-Lexical Lifetimes)**: vòng đời reference kết thúc ở **lần dùng cuối**, không phải cuối scope (`}`).

```text
let r1 = &mut car;        ┐ lifetime r1
println!("{r1}");         ┘ ← lần dùng cuối → r1 "chết" ở đây
let r2 = &car;            ┐ lifetime r2 (r1 đã chết → không coexist → OK)
println!("{r2}");         ┘
```

So với nếu `r1` dùng **sau** khi tạo `r2`:

```rust
let r1 = &mut car;
let r2 = &car;             // ERROR — vì...
println!("{r1} {r2}");     // r1 dùng Ở ĐÂY → coexist với r2 → vi phạm
```

`r1` dùng sau dòng tạo `r2` → vòng đời hai cái **chồng nhau** → vi phạm quy tắc 2.

## Đào sâu: compiler chỉ quan tâm coexist, không phải có mutate thật

Điểm tinh tế: compiler **bảo thủ** — nó chặn dựa trên **khả năng coexist**, không phải có mutate thật hay không:

```rust
let mut car = String::from("Đỏ");
let r1 = &mut car;         // mutable ref — DÙ không gọi method mutate nào
let r2 = &car;             // ERROR — chỉ cần r1 (mutable) coexist là cấm
println!("{r1} {r2}");
```

Dù `r1` không hề sửa gì, chỉ **sự tồn tại đồng thời** của một mutable ref và một ref khác đã đủ để compiler lo. Nó không phân tích "có thực sự nguy hiểm không" — cứ có khả năng là chặn. An toàn hơn là tiếc.

> **Đừng sợ lifetimes.** Bạn không cần hiểu sâu để code đúng — compiler luôn báo nếu vi phạm quy tắc vàng. Cứ nhớ "nhiều reader hoặc một writer", gặp lỗi thì đọc gợi ý compiler.

## Use case thực tế: vì sao quy tắc này cứu bạn

```rust
fn main() {
    let mut data = vec![1, 2, 3];
    let first = &data[0];          // immutable ref vào phần tử đầu
    data.push(4);                   // ERROR — push cần &mut, nhưng 'first' (&) còn sống
    println!("{first}");
}
```
```text
error[E0502]: cannot borrow `data` as mutable because it is also borrowed as immutable
```

Vì sao quan trọng: `push` có thể khiến Vec **reallocate** (dời sang ô heap mới — như String bài 46). Nếu cho phép, `first` sẽ trỏ tới ô **cũ đã giải phóng** → dangling reference → đọc rác/crash. Quy tắc borrowing chặn `push` khi còn `first` → **ngăn bug trước khi nó xảy ra**. Đây là an toàn thật, không phải phiền nhiễu vô cớ. (Bài 56 đào sâu dangling references.)

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `&mut` + `&` cùng lúc | Compile error | Tách vòng đời, hoặc dùng xong cái này mới tạo cái kia |
| Nhiều `&mut` coexist | Compile error | Chỉ một writer tại một thời điểm |
| Tạo `&mut` từ owner immutable | Compile error | `let mut` owner |
| Mong compiler phân tích "có nguy hiểm thật không" | Nó chặn theo coexist | Giảm vùng coexist |
| Sửa Vec/String khi còn ref tới phần tử | Borrow error | Dùng xong ref rồi mới sửa |
| Hoảng vì lifetime | Mất thời gian | Compiler luôn báo; nhớ quy tắc vàng |

## Tóm tắt bài 54

- Quy tắc vàng: một giá trị có **nhiều immutable reference (reader)** HOẶC **đúng một mutable reference (writer)** — không bao giờ cả hai.
- Nhiều `&` an toàn (không ai sửa); một `&mut` cấm mọi ref khác (tránh đọc data đang bị ghi).
- Diệt tận gốc **data race** tại **compile time** (ngôn ngữ khác chỉ phát hiện runtime, nếu may).
- **Lifetime/NLL**: vòng đời reference kết thúc ở **lần dùng cuối**, không phải cuối scope → code tưởng sai vẫn compile nếu không coexist.
- Compiler bảo thủ: chặn theo **khả năng coexist**, không cần mutate thật.
- Quy tắc này ngăn dangling reference (vd Vec reallocate khi còn ref) — an toàn thật.

**Bài kế tiếp** → [Bài 55: References & Copy trait — immutable ref copy, mutable ref move](03-references-va-copy.md)
