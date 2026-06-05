# Bài 59: Slice là gì — reference tới một phần của collection

Reference (phase 7) cho mượn **toàn bộ** một giá trị. Nhưng nhiều khi bạn chỉ cần **một phần**: 6 ký tự đầu của một String, ba phần tử giữa của một array. Đó là **slice** — một loại reference đặc biệt trỏ tới **một đoạn** của collection. Như miếng pizza là một phần của cả cái bánh. Bài này dựng khái niệm; các bài sau là cú pháp.

## Slice là gì

Nhắc lại: **collection type** = type chứa nhiều giá trị (array, tuple, String). **Slice** = một **reference**, nhưng tới một **phần/đoạn liên tục** của collection — một *phân nhóm* của reference.

```text
String slice = reference tới một dãy ký tự (byte) của một string
Array slice  = reference tới một dãy phần tử của một array
```

Ví von miếng pizza: một slice là một **phần** của cả cái bánh. Slice trong Rust cũng vậy — reference tới một mảnh, một đoạn của thứ lớn hơn.

## Slice vẫn là reference — vẫn borrow, không sở hữu

Vì slice là một loại reference, nó **mượn** (borrow), **không** lấy ownership. Nhưng nó mượn **một phần** thay vì toàn bộ.

Ví von ngôi nhà:
- **Reference thường** (phase 7): mượn **cả** ngôi nhà — bạn vẫn là chủ, tôi dùng toàn bộ.
- **Slice**: mượn **một phòng** hoặc **một tầng** — một phần của ngôi nhà.

```text
&house        → reference: mượn cả nhà
&house[room]  → slice: mượn một phần của nhà
```

Cùng nguyên tắc borrow của phase 7: owner giữ ownership, slice chỉ mượn — nhưng phạm vi mượn là một đoạn.

## Nuance: "một phần" có thể là toàn bộ

Đây là điểm tinh tế dễ gây bối rối. **Portion** (phần) nghĩa là một mảnh của tổng thể. Trong Rust, slice có thể là **bất kỳ** phần nào — kể cả **toàn bộ** collection.

```text
Slice có thể mượn:
  - một phòng (phần nhỏ)
  - một tầng (phần lớn)
  - cả ngôi nhà (toàn bộ)   ← vẫn là slice!
```

Logic: nếu mượn được "một phần" của thứ gì đó, thì "một phần" đó có thể là mảnh nhỏ, mảnh lớn, hoặc cả toàn bộ. Khái niệm slice bao trùm cả ba.

- Slice **thường** dùng để mượn một **mảnh/đoạn** (đây là mục đích chính).
- Nhưng slice **cũng có thể** đại diện **toàn bộ** collection — khi đó nó tương đương một reference thường.

Giữ ý này trong đầu sẽ giúp hiểu code các bài sau: khi thấy slice bao cả collection, đừng bối rối — đó là trường hợp đặc biệt hợp lệ.

## Vì sao cần slice

Reference thường chỉ cho mượn **nguyên** giá trị — không cách nào trỏ tới "6 ký tự đầu" hay "3 phần tử giữa". Slice lấp khoảng trống đó:

```text
&text          → reference tới CẢ string (không chọn đoạn được)
&text[0..6]    → slice tới 6 byte đầu (chọn đoạn!)
```

Slice cho phép:
- Trỏ tới một **đoạn** của text/array mà **không copy** đoạn đó (rẻ như mọi reference).
- Viết hàm xử lý "một phần" linh hoạt (bài 62, 63 — deref coercion).
- Đọc/sửa một vùng con của collection (bài 64 — mutable slice).

## Slice trong bức tranh ownership

```text
Phase 6 (Ownership)   : ai sở hữu giá trị, move vs copy
Phase 7 (References)  : mượn TOÀN BỘ giá trị (&, &mut)
Phase 8 (Slices)      : mượn MỘT PHẦN giá trị (&x[a..b])
```

Slice là mảnh cuối của bộ ba: nó xây thẳng lên references, chỉ thêm khả năng "chọn đoạn". Mọi quy tắc reference (borrow, immutable/mutable, không dangling) đều áp dụng — chỉ khác phạm vi là một đoạn thay vì toàn bộ.

## Hai loại slice sẽ học

| Loại | Mượn phần của | Cú pháp | Type |
|---|---|---|---|
| **String slice** | string (text) | `&s[0..6]` | `&str` |
| **Array slice** | array | `&arr[0..3]` | `&[T]` |

Cả hai dùng cùng cú pháp `&collection[range]` — chỉ khác con số trong range nghĩa là **byte** (string) hay **index** (array). Bài 60-62 lo string slice; bài 63-64 lo array slice.

## Bẫy thường gặp (về khái niệm)

| Hiểu lầm | Thực tế |
|---|---|
| Slice copy đoạn dữ liệu | Slice là **reference** — chỉ mượn, không copy |
| Slice lấy ownership đoạn đó | Không — vẫn borrow, owner giữ nguyên |
| Slice luôn là mảnh nhỏ hơn | Có thể bao cả collection (trường hợp đặc biệt) |
| Slice là type hoàn toàn mới | Là một **phân nhóm reference** |
| Slice không theo quy tắc reference | Theo hết (borrow, mutable, dangling...) |

## Tóm tắt bài 59

- **Slice** = một loại **reference** trỏ tới một **đoạn liên tục** của collection (string, array).
- Slice **borrow** (mượn) một phần, **không** lấy ownership — như mượn một phòng thay vì cả nhà.
- "Một phần" có thể là mảnh nhỏ, lớn, hoặc **toàn bộ** collection (khi đó ≈ reference thường).
- Slice lấp khoảng trống mà reference thường không làm được: trỏ tới **một đoạn** mà không copy.
- Hai loại: **string slice** (`&str`, theo byte) và **array slice** (`&[T]`, theo index).
- Slice xây thẳng lên references — mọi quy tắc reference vẫn áp dụng.

**Bài kế tiếp** → [Bài 60: String slice — cú pháp range, `&str`, và string literal cũng là slice](02-string-slice.md)
