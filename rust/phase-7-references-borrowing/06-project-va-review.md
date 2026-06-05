# Bài 58: Project & Section Review — road trip với mutable references, tổng kết phase

Hết phase References & Borrowing. Project này dựng một chuỗi hàm cùng sửa một String qua **mutable reference** — đúng pattern giải bài toán scale của phase 6. Sau đó tổng kết toàn phase.

## Đề bài project

Mô hình một chuyến đi:
1. `start_trip()` — tạo và trả về String "Kế hoạch: ".
2. Ba hàm `visit_*` — mỗi hàm **mutate** String (nối tên thành phố) **không** lấy ownership.
3. `show_itinerary()` — in String, **không** lấy ownership.

## Lời giải đầy đủ

```rust
fn start_trip() -> String {                   // tạo → trả ownership
    String::from("Kế hoạch: ")
}

fn visit_hanoi(trip: &mut String) {           // &mut — mượn + sửa
    trip.push_str("Hà Nội");
}

fn visit_hue(trip: &mut String) {
    trip.push_str("Huế");
}

fn visit_saigon(trip: &mut String) {
    trip.push_str("Sài Gòn");
}

fn show_itinerary(trip: &String) {            // & — mượn, chỉ đọc
    println!("{trip}");
}

fn main() {
    let mut trip = start_trip();              // trip là owner; mut để tạo &mut

    visit_hanoi(&mut trip);                   // mượn mutable
    trip.push_str(" và ");                    // trip vẫn owner → tự sửa được
    visit_hue(&mut trip);
    trip.push_str(" và ");
    visit_saigon(&mut trip);
    trip.push('.');                           // push char

    show_itinerary(&trip);                    // mượn immutable
    // Kế hoạch: Hà Nội và Huế và Sài Gòn.
}
```

### Phân tích quyết định

| Hàm | Parameter | Vì sao |
|---|---|---|
| `start_trip` | (none) `-> String` | **Tạo** giá trị → trả ownership |
| `visit_*` | `&mut String` | **Sửa** tại chỗ, không lấy ownership |
| `show_itinerary` | `&String` | Chỉ **đọc** → immutable ref đủ |

Điểm học cốt lõi:
- `trip` là owner **suốt** chương trình — không clone, không return-gán-lại.
- `visit_*` nhận `&mut trip` → mượn, sửa, trả tự động cuối hàm (dọn *reference*, không phải String).
- Việc `trip.push_str(...)` chạy được **giữa** các lời gọi chứng minh `trip` vẫn là owner (không bị move).
- `show_itinerary` nhận `&trip` (immutable) vì chỉ đọc — thử `push_str` trong đó sẽ lỗi (không quyền sửa).
- Owner `trip` phải `mut` mới tạo được `&mut trip`.

## Vì sao đây là pattern đúng

So với phase 6 (ownership thuần — return + gán lại mọi bước), bản này:
- **Không clone** → không nhân đôi heap.
- **Không return-gán-lại** → mỗi hàm chỉ mượn.
- **Scale** → thêm bao nhiêu `visit_*` cũng được, cùng pattern.

Đây chính là lời giải mà phase 6 hứa hẹn: references xoá sạch rườm rà của "hàm nuốt giá trị".

---

# Section Review — tổng kết References & Borrowing

## Reference & Borrow

- **Reference** = địa chỉ của giá trị; **borrow** = tạo reference bằng `&`.
- Lợi ích: dùng lại data **không** move ownership, **không** nhân đôi (rẻ).
- Ví von Eiffel Tower: cho địa chỉ (rẻ, nhân nhiều bản) thay vì xây bản sao tháp.

## Hai loại reference

```text
&T     (immutable) → chỉ ĐỌC; bao nhiêu cũng được; implement Copy
&mut T (mutable)   → ĐỌC + SỬA; chỉ một tại một thời điểm; KHÔNG Copy (move)
```

- Reference **immutable mặc định**; `&mut` để sửa.
- Bốn dạng parameter: `String`/`mut String` (move), `&String`/`&mut String` (mượn).

## Quy tắc borrowing (vàng)

```text
Tại một thời điểm: NHIỀU immutable ref (reader)  HOẶC  MỘT mutable ref (writer)
                   không bao giờ cả hai
```

- Diệt **data race** tại compile time.
- **Lifetime/NLL**: vòng đời ref kết thúc ở **lần dùng cuối**, không phải cuối scope.
- Compiler bảo thủ: chặn theo **khả năng coexist**.

## Copy với references

- Immutable ref **Copy** (gán = copy, cả hai valid) — nhiều reader an toàn.
- Mutable ref **không Copy** → **move** (giữ "một writer").

## Dangling reference

- Reference tới vùng đã giải phóng (use-after-free) — Rust **cấm compile**.
- Quy tắc: **referent phải sống lâu hơn reference**.
- Hàm tạo giá trị → trả **ownership**, không trả ref tới biến cục bộ.

## Ownership với collection

- Array/tuple **sở hữu** phần tử (cây ownership).
- Index phần tử Copy → bản sao; phần tử non-Copy → **cấm move out** → dùng `&` (borrow) hoặc `.clone()`.

## Bản đồ phase References & Borrowing

```text
REFERENCE
  & (borrow) · &T immutable (đọc) · &mut T mutable (sửa)
  4 dạng parameter: String/mut String/&String/&mut String

QUY TẮC VÀNG
  nhiều reader HOẶC một writer  → chống data race (compile-time)
  lifetime/NLL: vòng đời = tới lần dùng cuối

COPY
  &T Copy (nhiều reader) · &mut T move (một writer)

AN TOÀN
  dangling reference cấm (referent sống lâu hơn reference)
  collection: phần tử non-Copy → borrow/clone, không move out
```

## Bẫy tổng hợp

| Bẫy | Cách tránh |
|---|---|
| `&mut` + `&` coexist | Một writer hoặc nhiều reader |
| Tạo `&mut` từ owner immutable | `let mut` owner |
| Dùng mutable ref sau khi gán đi | Mutable ref move |
| Trả `&` tới biến cục bộ | Trả ownership |
| `arr[0]` với phần tử String | `&arr[0]` hoặc clone |
| `&String` rồi cố sửa | Dùng `&mut String` |

## Tóm tắt phase References & Borrowing

- **Reference** (`&`) cho mượn data không lấy ownership — giải bài toán scale của phase 6.
- **`&T`** đọc (Copy, nhiều cái); **`&mut T`** sửa (move, một cái).
- Quy tắc vàng: **nhiều reader HOẶC một writer** → chống data race tại compile time.
- **Dangling reference** bị cấm (referent sống lâu hơn reference); collection non-Copy → borrow.
- Pattern chuẩn: mượn `&mut` để sửa tại chỗ, `&` để đọc — owner giữ nguyên suốt.

Bạn đã hoàn tất bộ ba ownership cốt lõi (Ownership → References). Mảnh cuối là **Slices** — một loại reference đặc biệt trỏ tới **một phần** của collection (đoạn giữa String, một lát array). Slices xây thẳng lên references và là nền cho cách xử lý text/mảng hiệu quả trong Rust.

**Bài kế tiếp** → [Bài 59: Slices — reference tới một phần của collection](../phase-8-slices/01-slice-la-gi.md)
