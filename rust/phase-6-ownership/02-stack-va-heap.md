# Bài 44: Stack và Heap — hai vùng bộ nhớ, vì sao cần cả hai

Để hiểu ownership, phải hiểu **memory được tổ chức ra sao**. Khi chạy, chương trình Rust có hai vùng memory: **stack** và **heap**. Mỗi vùng có ưu/nhược riêng, và Rust chọn vùng nào tuỳ loại dữ liệu. Hiểu rạch ròi hai vùng này là chìa khoá hiểu mọi thứ sắp tới: vì sao `i32` copy được mà `String` thì move, vì sao có references.

## Hai vùng, một câu hỏi: kích thước biết trước không?

```text
                Stack                      Heap
Tốc độ          Nhanh                      Chậm hơn
Kích thước data Cố định, biết compile-time Động, biết runtime
Ví dụ           i32, f64, bool, char, array String, Vec, user input
```

Quy tắc một câu: **biết kích thước tại compile time → stack; kích thước động/runtime → heap.**

## Stack — chồng đĩa LIFO

**Stack** lưu giá trị theo thứ tự nhận vào, và lấy ra theo thứ tự **ngược lại**. Gọi là **LIFO** (Last In, First Out — vào sau, ra trước).

Ví von kinh điển: chồng khay ăn trong căng-tin. Người đến đặt khay lên **đỉnh**; người lấy cũng lấy từ **đỉnh**. Khay cuối cùng đặt vào là khay đầu tiên lấy ra.

```text
        ┌─────────┐  ← đỉnh: push (đặt vào) / pop (lấy ra) Ở ĐÂY
        │ khay 3  │     (vào sau cùng → ra đầu tiên)
        ├─────────┤
        │ khay 2  │
        ├─────────┤
        │ khay 1  │  ← đáy (vào đầu → ra cuối)
        └─────────┘
```

Thuật ngữ: thêm = **push** (đẩy vào), bỏ = **pop** (lấy ra). Chỉ thao tác ở **đỉnh**.

**Vì sao stack nhanh**: chỉ có một chỗ để thêm/bớt (đỉnh) → không phải tìm kiếm. Dữ liệu nằm liền kề → CPU cache đọc nhanh.

**Điều kiện**: data trên stack **phải có kích thước cố định, biết tại compile time**. `i32` luôn 4 byte, `bool` luôn 1 byte, `[i32; 5]` luôn 20 byte — compiler biết hết → lưu stack. Khi function kết thúc, biến ra khỏi scope, giá trị stack bị pop theo LIFO.

## Heap — kho hàng/bãi đỗ xe

**Heap** là vùng lưu trữ rộng, linh hoạt. Khi cần không gian **động** (kích thước không biết trước), chương trình **xin** từ heap lúc runtime.

**Dynamic** = không đoán trước, không cố định, có thể đổi kích thước khi chạy. Ví dụ:
- **User input**: hỏi địa chỉ user — 5 hay 100 ký tự? Không biết trước.
- **Nội dung file**: file 1KB hay 1MB? Không biết trước.

Quy trình xin heap:
1. Một chương trình tên **memory allocator** tìm một ô trống đủ lớn trong heap.
2. Allocator trả về một **reference** (tham chiếu) = **địa chỉ** của ô đó.

```text
Heap = bãi đỗ xe:
  xe (giá trị) = cấu trúc cụ thể chiếm chỗ
  địa chỉ "H25" (reference) = chỉ dẫn TÌM xe
```

## Reference/Pointer — địa chỉ, không phải giá trị

Điểm cốt lõi cần nắm: **địa chỉ khác giá trị**. Địa chỉ là thứ ta **đi theo** để tới giá trị.

Ví von ngôi nhà:
- **Ngôi nhà** = giá trị thật trên heap (kích thước thay đổi).
- **Địa chỉ ghi trên tờ giấy** = reference (kích thước cố định — chỉ cần đủ chỗ ghi địa chỉ).

```text
Tờ giấy ghi địa chỉ "123 Lê Lợi"  ──follow──>  Ngôi nhà thật
(reference, kích thước cố định)                 (heap data, kích thước động)
```

**Reference được lưu trên STACK** (vì kích thước cố định), nhưng nó **trỏ tới** giá trị trên heap. Đây là cách Rust kết hợp cả hai vùng: con trỏ nhỏ gọn ở stack, dữ liệu lớn ở heap.

Reference còn gọi là **pointer** (con trỏ) — vì nó "trỏ" tới giá trị. (Có khác biệt nhỏ: reference Rust **đảm bảo** trỏ tới giá trị hợp lệ — bài 48 đào sâu.)

## Vì sao heap chậm hơn

**Ghi (write)**: heap allocator phải **tìm** ô trống đủ lớn (mất thời gian); stack chỉ đẩy vào đỉnh (tức thì).

**Đọc (read)**: heap phải **đi theo địa chỉ** tới vùng nhớ — như đi tìm xe trong bãi đỗ rộng, nhảy từ chỗ này sang chỗ khác. Stack có data liền kề, ít nhảy → CPU nhanh hơn.

```text
Stack: data liền kề, một chỗ thao tác   → nhanh đọc + ghi
Heap:  phải tìm ô (ghi) + đi theo địa chỉ (đọc), data rải rác → chậm hơn
```

## Vậy sao không dùng stack cho tất cả?

Câu hỏi tự nhiên: stack nhanh hơn cả đọc lẫn ghi, sao không dùng luôn? **Vì stack chỉ chứa data kích thước cố định.** Khi data động (string co giãn, input user), **bắt buộc** dùng heap. Đánh đổi: stack nhanh nhưng cứng nhắc; heap chậm nhưng linh hoạt.

## Liên hệ ownership: vì sao chủ yếu lo heap data

Mục đích chính của **ownership là quản lý heap data**. Lý do:
- Stack data: kích thước cố định, dọn dẹp đơn giản (chỉ pop), copy rẻ → ít cần quản lý chặt.
- Heap data: kích thước lớn/động, dọn dẹp phức tạp (phải trả đúng ô), copy đắt → **cần** ownership để biết ai dọn, khi nào, tránh leak/double-free.

Ownership tồn tại chủ yếu để **giảm trùng lặp heap data** và đảm bảo heap memory được giải phóng đúng một lần, đúng lúc. Đây là nền cho các bài tiếp: `String` (heap) hành xử khác `i32` (stack) chính vì lý do này.

## Bảng phân loại type theo vùng

| Type | Vùng | Vì sao |
|---|---|---|
| `i32`, `u64`, `f64` | Stack | Kích thước cố định |
| `bool`, `char` | Stack | Kích thước cố định |
| `[i32; 5]` (array) | Stack | Kích thước cố định (length biết trước) |
| `tuple` (của type stack) | Stack | Tổng kích thước cố định |
| `String` | Heap (+ stack metadata) | Co giãn, kích thước động |
| `Vec<T>` | Heap (+ stack metadata) | Co giãn |
| `&T` (reference) | Stack | Địa chỉ, kích thước cố định |

> Lưu ý: `String`/`Vec` có **cả hai**: text/phần tử trên heap, còn metadata (con trỏ + length + capacity) trên stack — bài 46 sẽ mổ xẻ.

## Bẫy thường gặp (về tư duy)

| Hiểu lầm | Thực tế |
|---|---|
| Reference chứa giá trị | Reference chứa **địa chỉ** dẫn tới giá trị |
| String nằm hoàn toàn trên stack | Text ở heap, metadata ở stack |
| Stack nhanh nên dùng cho mọi thứ | Stack chỉ chứa data kích thước cố định |
| Heap chậm nên xấu | Heap cần thiết cho data động |
| Phải nhớ chi tiết LIFO để code | Đây là kiến thức nền, ngày thường không cần nhớ kỹ |

## Tóm tắt bài 44

- Hai vùng memory: **stack** (nhanh, kích thước cố định biết compile-time) và **heap** (chậm hơn, động, runtime).
- Stack là **LIFO** (push/pop ở đỉnh) — nhanh vì một chỗ thao tác, data liền kề.
- Heap cần **memory allocator** tìm ô trống, trả về **reference** (địa chỉ).
- **Reference = địa chỉ ≠ giá trị**; reference lưu trên stack, trỏ tới data trên heap.
- Heap chậm hơn vì phải tìm ô (ghi) và đi theo địa chỉ (đọc); stack data liền kề.
- **Ownership chủ yếu quản lý heap data** — nền cho việc `String` move còn `i32` copy.

**Bài kế tiếp** → [Bài 45: Scope, Copy trait — biến chết cuối scope, type stack tự copy](03-scope-copy-trait.md)
