# Bài 1: Saga Pattern — giữ nhất quán cho giao dịch phân tán

Một người đặt combo du lịch: thuê xe, đặt khách sạn, mua vé máy bay — qua ba microservice. Hai bước đầu thành công, bước vé máy bay **ném exception**. Giờ khách có xe và phòng nhưng không có vé — một mớ hỗn độn. `@Transactional` không cứu được vì nó chỉ quản một DB. Đây là bài toán **distributed transaction**, và **Saga** là lời giải. Đây là pattern quan trọng bậc nhất với mọi microservice developer.

## Bài toán: distributed transaction và vì sao @Transactional bất lực

Công ty du lịch có 3 service: Car, Hotel, Flight. Một request đặt combo đi qua cả ba:

```text
   Người dùng đặt combo (1 request)
        │
        ▼  T1
   Car Service   ── reserveCar  ──► Car DB     ✅ (đã commit)
        │ forward
        ▼  T2
   Hotel Service ── reserveHotel ──► Hotel DB  ✅ (đã commit)
        │ forward
        ▼  T3
   Flight Service ── reserveFlight ──► RuntimeException ❌
```

> Một request, nhưng đi qua nhiều service, mỗi service tạo một **transaction riêng** commit vào DB riêng. Request kiểu này = **distributed transaction** (giao dịch phân tán qua nhiều container/node/region).

Khi Flight lỗi: `@Transactional` trong Flight rollback DB của *chính nó*. Nhưng **Car DB và Hotel DB đã commit** ở các transaction khác — Flight **không có quyền** rollback chúng. Và ta **không thể** bắt Car/Hotel "giữ lock chờ" Flight xong — khóa row quá lâu sẽ giết hiệu năng. Nên service commit + nhả lock ngay sau khi xong việc của mình.

Kết quả: khách có xe + phòng nhưng không vé → **data inconsistency**. Ta cần: **hoặc tất cả thành công, hoặc nếu lỗi thì hoàn tác mọi thứ đã làm**.

## Saga Pattern — chia nhỏ và bù trừ

> **Saga** = chia một giao dịch lớn thành **chuỗi transaction nhỏ, độc lập**, mỗi cái do một microservice quản. Khi lỗi, chạy các **compensation transaction** (giao dịch bù trừ) theo **thứ tự ngược** để hoàn tác.

Hai từ khóa cần nhớ: **nhỏ (smaller)** và **độc lập (independent)**.

```text
   Business request lớn
        │  chia thành...
        ▼
   T1 (service 1) → T2 (service 2) → T3 (service 3) → ... → Tn
        │              │                │
       C1             C2               C3   ← mỗi T có một C (compensation) đi kèm
```

| Khái niệm | Ý nghĩa |
|---|---|
| **Transaction (Tn)** | Việc một service làm trên DB của nó (vd `reserveCar`) |
| **Compensation (Cn)** | Việc hoàn tác Tn (vd `cancelCar`) — đặt **cùng** service, trỏ **cùng** DB với Tn (local) |

### Compensation chạy ngược, hoàn tác về "trạng thái có nghĩa"

Khi lỗi ở `Tn+1`, nó kích hoạt `Cn`, rồi `Cn-1`, ... ngược lên `C1`:

```text
   T1 → T2 → T3 → T4 ✗ lỗi
                  │ kích hoạt compensation NGƯỢC chiều
   C1 ◄── C2 ◄── C3 ◄──┘
```

> **"Rollback" ở đây KHÔNG phải database rollback** — mà là hoàn tác data về **trạng thái có nghĩa (meaningful state)**. Ví dụ: `reserveCar` đặt status = `BOOKED`; `cancelCar` đổi status = `CANCELLED` (không xóa row). Nhờ vậy bộ phận vận hành thấy `CANCELLED` thì không sắp xe cho khách → không ảnh hưởng nghiệp vụ.

Quan trọng: compensation **chỉ chạy khi có lỗi**. Nếu tất cả Tn thành công → không cần compensation. Mỗi service phải tự cung cấp **cả** logic transaction thường **lẫn** logic compensation.

## Hai flavor: Choreography vs Orchestration

Saga có **hai** cách hiện thực:

| | **Choreography** | **Orchestration** |
|---|---|---|
| Mô hình | **Phi tập trung (decentralized)** — không ai chỉ huy | **Tập trung (centralized)** — một Saga Manager điều phối |
| Mỗi service biết gì | Biết service **kế tiếp** (happy) + service **trước** (compensation) | Không biết gì — chỉ nghe lệnh từ orchestrator |
| Điều khiển | Phân tán khắp các service | Một chỗ duy nhất (Saga Manager) |
| Hợp với | Không cần framework đặc biệt | Thường dùng khi đã có **CQRS** (vd Axon) |
| Ẩn dụ | "Múa tập thể" — ai cũng tự biết bước của mình | "Nhạc trưởng" chỉ huy dàn nhạc |

```text
CHOREOGRAPHY (phi tập trung):
   svc1 ──► svc2 ──► svc3 ──► svc4    mỗi service tự gọi cái kế tiếp

ORCHESTRATION (tập trung):
            ┌── Saga Manager ──┐
            ▼     ▼     ▼      ▼
          svc1  svc2  svc3   svc4    manager ra lệnh từng bước
```

> Không có "tốt/xấu" tuyệt đối. Choreography khi không dùng framework CQRS; Orchestration khi đã có CQRS (Axon). Cả hai cho **cùng kết quả**. Phase 5 này làm **Choreography** (không CQRS); Phase 6 làm **Orchestration** (với CQRS/Axon).

## Tóm tắt bài 1

- **Distributed transaction**: một request qua nhiều service, mỗi cái commit DB riêng → `@Transactional` chỉ quản được một DB, không rollback xuyên service.
- **Saga**: chia thành **transaction nhỏ độc lập** (Tn); khi lỗi, chạy **compensation (Cn)** theo **thứ tự ngược** để hoàn tác về **trạng thái có nghĩa** (không phải DB rollback).
- Mỗi Tn có một Cn cục bộ cùng service/DB; compensation chỉ chạy khi lỗi.
- Hai flavor: **Choreography** (phi tập trung, "múa tập thể") và **Orchestration** (tập trung, "nhạc trưởng" — hợp với CQRS).

**Bài kế tiếp** → [Bài 2: Lợi ích, nhược điểm và thiết kế Choreography Saga](02-choreography-thiet-ke-va-tradeoffs.md)
