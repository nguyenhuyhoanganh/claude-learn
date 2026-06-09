# Bài 2: Snapshot — lý thuyết

Vấn đề (bài 1): replay 100.000 event cho mỗi lần ghi quá chậm. **Snapshot** là lời giải kinh điển: định kỳ chụp lại current state, để aggregate khởi đầu từ ảnh chụp đó thay vì từ event đầu tiên. Bài này giải thích snapshot hoạt động thế nào, khi nào dùng, và đánh đổi gì.

## Snapshot là gì?

> **Snapshot** = một "ảnh chụp" **current state** của aggregate tại một mốc, sau khi đã replay các event tới mốc đó. Khi cần dựng state, aggregate **chỉ** load snapshot gần nhất + các event **sau** nó — không replay lại từ đầu.

Ý tưởng: thay vì luôn bắt đầu từ event 0, ta lưu sẵn "kết quả tới event 100" làm snapshot, rồi từ đó đi tiếp.

```text
   KHÔNG snapshot — replay từ đầu mỗi lần:
   event 0 → 1 → 2 → ... → 99 → 100 → (event mới)   ← replay 100 cái

   CÓ snapshot (cứ 100 event chụp 1 lần):
   [SNAPSHOT @100] → 101 → 102 → (event mới)         ← chỉ load snapshot + 2 event
        ▲
        chứa current state đã dựng từ event 0..100
```

## Cấu hình: chụp sau mỗi N event

Developer cấu hình **ngưỡng**: cứ sau N event thì tạo một snapshot. Ví dụ "cứ 100 event":

```text
   event 1..100   → tạo SNAPSHOT @100 (state sau khi replay 1..100)
   event 101..200 → tạo SNAPSHOT @200
   ...
```

Khi ghi event mới sau snapshot @100, aggregate bỏ qua event 1..100, chỉ dùng snapshot @100 + các event 101..(mới). Snapshot được lưu **cùng** event store (hoặc một storage riêng).

```text
   Các bước snapshot hoạt động:
   1. Đủ N event → framework tạo snapshot (chứa current state tại mốc đó)
   2. Ghi event mới sau đó → khôi phục state BẮT ĐẦU TỪ snapshot
   3. Bỏ qua mọi event trước snapshot
```

## Khi nào nên dùng snapshot

| Tình huống | Vì sao |
|---|---|
| **High event volume** | Aggregate có lịch sử dài (account 100K event) → replay từ đầu quá chậm |
| **Performance concerns** | Thời gian ghi tăng theo số event → snapshot giữ ổn định |
| **Periodic consistency checks** | Snapshot định kỳ là điểm "chốt" state để kiểm tra |

Ngược lại, aggregate ít event (order ~4) thì snapshot **thừa** — không có gì để tối ưu.

## Đánh đổi — không miễn phí

| Trade-off | Giải thích |
|---|---|
| **Storage overhead** | Snapshot tốn thêm chỗ lưu (ngoài event) |
| **Snapshot frequency** | Chụp quá dày → tốn storage + tốn công tạo; quá thưa → vẫn replay nhiều. Phải cân |
| **Snapshot integrity** | Snapshot phải đúng; nếu logic dựng state thay đổi, snapshot cũ có thể lệch → cần quản lý version cẩn thận |

> **Chọn ngưỡng N thế nào?** Cân giữa: N nhỏ → ít replay nhưng nhiều snapshot (tốn storage + overhead tạo); N lớn → ít snapshot nhưng vẫn phải replay nhiều event sau snapshot gần nhất. Tùy đặc thù aggregate (tần suất ghi, độ dài lịch sử).

## Snapshot giữ trọn sức mạnh Event Sourcing

Điểm tinh tế: snapshot **không xóa** event cũ — event 0..100 vẫn nằm trong store. Snapshot chỉ là **lối tắt** để dựng state nhanh. Nghĩa là:
- Audit trail đầy đủ vẫn còn (event 0..N nguyên vẹn).
- Replay/time-travel (Phase 2) vẫn làm được khi cần (bỏ qua snapshot, chạy lại từ đầu).
- Chỉ **đường nóng** (ghi event mới hàng ngày) được tăng tốc.

```text
   Event store sau snapshot:
   [event 0..100 VẪN CÒN]  +  [SNAPSHOT @100]  +  [event 101..]
        │                          │
        audit/time-travel dùng     đường nóng dùng (nhanh)
```

## Tóm tắt bài 2

- **Snapshot**: ảnh chụp current state tại mốc N event; dựng state = load snapshot gần nhất + event **sau** nó (không replay từ đầu).
- Cấu hình "cứ N event chụp một lần"; snapshot lưu cùng (hoặc tách) event store.
- Dùng khi: **high event volume, performance concerns, periodic consistency**. Aggregate ít event thì thừa.
- Trade-off: **storage overhead, frequency (dày/thưa), integrity** — chọn N cân bằng.
- Snapshot **không xóa** event cũ → audit/time-travel vẫn nguyên, chỉ tăng tốc đường nóng.

**Bài kế tiếp** → [Bài 3: Hiện thực Snapshot với Axon (kết thúc khóa học)](03-snapshots-implement-axon.md)
