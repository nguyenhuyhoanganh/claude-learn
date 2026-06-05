# Bài 43: Ownership là gì — giải pháp quản lý bộ nhớ độc nhất của Rust

Đây là phần khiến Rust trở thành Rust. **Ownership** (quyền sở hữu) là lý do Rust nhanh như C **mà** an toàn như Python — không cần garbage collector, không cần `free()` thủ công. Đây cũng là khái niệm khó nhất, learning curve dốc nhất. Tin tốt: mọi thứ về **scope** bạn học ở phase 2 chính là nền móng. Ta đi từng bước.

## Vấn đề: quản lý bộ nhớ

**Memory** (bộ nhớ, RAM) = phần cứng lưu dữ liệu **tạm thời** chương trình cần khi chạy. Khác ổ cứng (lưu lâu dài, còn khi tắt máy), memory **xoá sạch** khi tắt máy. Mỗi app mở ra **xin** memory để lưu data tạm.

Memory **hữu hạn** (32GB, 64GB...). Dùng mãi không trả lại → hết → máy chậm/crash. Nên: cần **trả** memory về máy khi không dùng nữa.

```text
allocation   (cấp phát)   = chương trình XIN memory
deallocation (giải phóng) = chương trình TRẢ memory về cho máy
```

Câu hỏi muôn thuở của mọi ngôn ngữ: **ai chịu trách nhiệm giải phóng memory, và khi nào?**

## Ba trường phái giải quyết — và đánh đổi

### 1. Thủ công (C, C++) — nhanh nhưng nguy hiểm

Lập trình viên tự `malloc` (xin) và `free` (trả) trong source code. Gánh nặng đặt lên người viết.

Con người không hoàn hảo → bug kinh điển:
- **Quên free**: xin memory, dùng, không trả → **memory leak** (rò rỉ).
- **Free hai lần**: trả một vùng đã trả rồi → **double free** → memory corruption, lỗ hổng bảo mật.

Ví von: điện thoại với 15 app mở quên tắt, chạy ngầm ngốn pin/RAM. C giống vậy — bạn tự chịu trách nhiệm dọn dẹp.

**Ưu**: nhanh nhất (không cần gì chạy thêm). **Nhược**: dễ sai, nguồn vô số lỗ hổng bảo mật.

### 2. Garbage Collector (Java, Python, Go, Ruby) — an toàn nhưng chậm

Một chương trình **chạy song song** (garbage collector) tự tìm data không còn dùng và dọn. Tự động hoá việc dọn dẹp.

Ví von: một app nền theo dõi mọi app khác, app nào mở > 1 giờ không dùng thì tự tắt. Tiện — nhưng **bản thân app nền đó cũng ngốn RAM** và chạy vào lúc bất lợi → chậm chương trình.

**Ưu**: an toàn (không lo leak/double-free). **Nhược**: chậm hơn, GC ngốn tài nguyên và "khựng" (pause) bất chợt. Python/Ruby không bao giờ nhanh bằng C một phần vì luôn phải có GC chạy.

### 3. Ownership (Rust) — nhanh VÀ an toàn

Rust phá thế lưỡng nan. Ownership là **tính năng compile-time**: compiler kiểm tra một bộ quy tắc, **không** chạy gì lúc runtime.

```text
            Nhanh?   An toàn?   Cách
C/C++         ✓        ✗        thủ công malloc/free
Java/Python   ✗        ✓        garbage collector (runtime)
Rust          ✓        ✓        ownership (compile-time)
```

**Điểm mấu chốt**: ownership tồn tại **cho compiler và lập trình viên** — nó **không** ảnh hưởng chương trình lúc chạy. Compiler kiểm tra quy tắc lúc compile, đảm bảo code không có lỗi memory, rồi sinh ra binary nhanh như C (không GC, không overhead runtime). Vấn đề duy nhất của ownership là **learning curve** — thời gian dev học để hiểu, không phải hạn chế kỹ thuật.

## Owner là gì — định nghĩa thực dụng

**Mọi giá trị** trong chương trình Rust có một **owner** (chủ sở hữu). Owner = ai/cái gì chịu trách nhiệm **dọn dẹp** giá trị đó khi nó không còn dùng.

Như đời thực: bạn là owner của ngôi nhà → bạn chịu trách nhiệm cho ngôi nhà. Trong Rust, owner chịu trách nhiệm **giải phóng memory** của giá trị khi không cần nữa.

```rust
fn main() {
    let age = 33;        // 'age' là OWNER của giá trị 33
}                         // hết scope → 'age' dọn 33 khỏi memory
```

Owner thường là một **tên** (name) — phổ biến nhất là **variable**. Nhưng cũng có thể là:
- **Parameter** của function (cũng là một tên).
- **Composite type** (array, tuple) — array sở hữu các phần tử của nó.

## Ba quy tắc ownership

Toàn bộ ownership rút về ba quy tắc cốt lõi (sẽ thấy chúng vận hành qua cả phase):

```text
1. Mỗi giá trị có một OWNER.
2. Tại một thời điểm chỉ có MỘT owner.
3. Khi owner ra khỏi scope, giá trị bị DROP (dọn).
```

Quy tắc 2 quan trọng: **một owner tại một thời điểm**, nhưng owner **có thể đổi** (như bán nhà → chủ mới). Việc đổi owner gọi là **move** (bài 47).

```text
Nhà có thể đổi chủ (bán đi), nhưng tại một lúc chỉ một chủ.
Giá trị Rust có thể đổi owner (move), nhưng tại một lúc chỉ một owner.
```

## Ownership như cây phân cấp

Owner có thể lồng nhau: một biến sở hữu một tuple, tuple sở hữu các giá trị bên trong, giá trị đó lại có thể sở hữu giá trị khác — nhiều tầng:

```text
biến  →  sở hữu tuple  →  sở hữu các phần tử bên trong  →  ...
```

Khi biến gốc ra khỏi scope, cả cây bị dọn từ trên xuống. Đây là cách Rust dọn dẹp cấu trúc phức tạp tự động, đệ quy — không cần GC, không cần bạn viết tay.

## Vì sao quy tắc 3 gắn với scope

Quy tắc 3 nối thẳng tới scope (phase 2): khi owner **ra khỏi scope** (chạm `}`), Rust tự dọn giá trị. Đây là lý do bài Scopes là nền móng cho ownership — ownership chỉ là scope + quy tắc "ai giữ giá trị" chồng lên.

```rust
fn main() {
    let x = String::from("hi");   // x là owner
    // ... dùng x ...
}                                  // x ra khỏi scope → Rust tự dọn "hi"
```

Không `free()` thủ công (như C), không GC (như Java) — chỉ là `}` cuối scope, quyết định tại compile time.

## Bẫy thường gặp (về tư duy)

| Hiểu lầm | Thực tế |
|---|---|
| Ownership làm chương trình chậm | Compile-time only, **zero** runtime cost |
| Ownership giống GC | GC chạy runtime; ownership kiểm lúc compile |
| Phải tự `free()` như C | Rust tự dọn ở cuối scope |
| Một giá trị có nhiều owner | Đúng một owner tại một thời điểm |
| Owner cố định | Owner đổi được (move), chỉ một tại một lúc |
| Ownership chỉ là lý thuyết | Nó là lý do Rust vừa nhanh vừa an toàn |

## Tóm tắt bài 43

- **Ownership** = giải pháp quản lý bộ nhớ của Rust: nhanh như C (không GC), an toàn như Python (không lỗi memory).
- Là tính năng **compile-time**, **zero** chi phí runtime — chỉ ảnh hưởng compiler/dev.
- Các trường phái khác đánh đổi: C (nhanh, dễ sai), GC (an toàn, chậm); Rust được cả hai.
- **Owner** = ai chịu trách nhiệm dọn dẹp một giá trị; thường là biến/parameter/composite type.
- Ba quy tắc: (1) mỗi giá trị một owner, (2) một owner tại một thời điểm, (3) owner ra khỏi scope → giá trị bị **drop**.
- Owner đổi được (**move**); ownership gắn chặt với **scope** (phase 2 là nền móng).

**Bài kế tiếp** → [Bài 44: Stack và Heap — hai vùng bộ nhớ, vì sao cần cả hai](02-stack-va-heap.md)
