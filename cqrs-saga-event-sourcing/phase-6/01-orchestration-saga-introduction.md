# Bài 1: Orchestration Saga — một "nhạc trưởng" điều phối

Phase 5 làm Choreography: mỗi service tự biết gọi service kế tiếp — như múa tập thể không người chỉ huy. Orchestration đảo ngược: một **Saga Manager** trung tâm cầm chịch toàn bộ luồng, ra lệnh từng service. Pattern này hợp khi bạn đã có CQRS (Axon). Ta sẽ làm lại cùng bài toán đổi số điện thoại, nhưng lần này phức tạp hơn vì có **hai DB** (read + write) phải rollback.

## Orchestration: "nhạc trưởng" thay vì "múa tập thể"

> **Orchestration Saga** = một **orchestrator/Saga Manager** trung tâm điều khiển và sắp xếp thứ tự gọi các service, đảm bảo giao dịch hoàn tất hoặc rollback khi lỗi.

Tên "orchestration" lấy cảm hứng từ **dàn nhạc giao hưởng**: một **nhạc trưởng (conductor)** đứng giữa, vung tay điều khiển các nhạc công chơi hài hòa. Tương tự, Saga Manager chỉ huy các service.

```text
CHOREOGRAPHY (Phase 5):          ORCHESTRATION (Phase 6):
   svc1 → svc2 → svc3 → svc4         ┌─── Saga Manager ───┐
   (tự gọi nhau)                      ▼     ▼     ▼      ▼
                                    svc1  svc2  svc3   svc4
                                    (chỉ nghe lệnh từ manager)
```

| | Choreography | Orchestration |
|---|---|---|
| Điều khiển | Phân tán, mỗi service tự biết | Tập trung ở Saga Manager |
| Service biết gì | Service kế/trước | Không gì — chỉ nghe lệnh |
| Ai quyết next/compensation | Mỗi service | Chỉ Saga Manager |

> (Bên lề) "Saga" trong kể chuyện nghĩa là một **trường ca anh hùng dài**; trong tin học, Saga pattern chỉ một **giao dịch dài (long-running transaction)** gồm chuỗi thao tác. Không quan trọng kỹ thuật, nhưng người ta hay hỏi.

## Đặt Saga Manager ở đâu?

Saga Manager có thể nằm ngoài 4 service, hoặc **nhúng vào service nhận request đầu tiên**. Ta chọn nhúng vào **Customer** (service expose API đổi số):

```text
   Client ──► Customer Service
                 │  (chứa Saga Manager bên trong)
                 ▼
        Saga Manager điều phối: customer → accounts → cards → loans
```

> **Vì sao nhúng vào customer thay vì tách riêng?** Nếu Saga Manager là service riêng, customer phải gọi nó qua mạng → thêm **network latency**. Nhúng vào customer (service vốn nhận request gốc) thì tiết kiệm hơn.

Saga Manager được hiện thực bằng **Axon Framework** — vì ta đã dùng Axon cho CQRS + Event Sourcing (Phase 3), nên dùng luôn Saga của Axon là tự nhiên.

## Vì sao Orchestration ở đây phức tạp hơn Choreography?

Đây là điểm mấu chốt. Phase 5 (Choreography) **không** dùng CQRS → mỗi service chỉ **một** DB → rollback một chỗ là xong. Phase 6 dùng **CQRS + Event Sourcing** → mỗi service có **hai** DB:

```text
   Mỗi microservice (CQRS + ES):
   ┌─────────────┐         ┌─────────────┐
   │ WRITE DB     │ event  │ READ DB      │
   │ (event store)│───────►│ (current)    │
   └─────────────┘         └─────────────┘

   Đổi số → phải cập nhật CẢ HAI DB
   Rollback → phải hoàn tác CẢ HAI DB
```

Khi đổi số, phải update cả write DB (event sourcing) lẫn read DB. Khi compensation, phải rollback **cả hai**. Cẩn thận gấp đôi so với Choreography.

> Đây chính là "bộ ba sát thủ" mà nhiều enterprise dùng: **CQRS + Event Sourcing + Saga (Orchestration)**. Ta đang ráp cả ba lại với nhau.

## Bài toán vẫn là đổi số điện thoại

Vẫn như Phase 5: đổi `mobileNumber` đồng bộ qua 4 service, lỗi thì hoàn tác về số cũ ở cả 4. Khác biệt: lần này điều phối bằng **Saga Manager + commands/events** (Axon), không phải mỗi service tự gọi nhau (Spring Cloud Stream).

```text
   Saga Manager (trong customer):
      T1: dispatch updateCustomerMobileNumberCommand → customer cập nhật (write+read DB)
      T2: dispatch updateAccountMobileNumberCommand  → accounts
      T3: dispatch updateCardMobileNumberCommand     → cards
      T4: dispatch updateLoanMobileNumberCommand     → loans
   Lỗi ở Tn → Saga Manager dispatch rollback command ngược chiều
```

## Tóm tắt bài 1

- **Orchestration Saga**: một **Saga Manager** trung tâm ("nhạc trưởng") điều phối, ra lệnh từng service; khác Choreography ("múa tập thể", phi tập trung).
- Service trong orchestration **không biết** next/compensation — chỉ nghe lệnh; mọi quyết định ở Saga Manager.
- Đặt Saga Manager **nhúng trong customer** (service nhận request gốc) để tránh network latency; hiện thực bằng **Axon Saga**.
- Phức tạp hơn Phase 5 vì có **CQRS + ES** → mỗi service **hai DB** (read + write) phải cập nhật/rollback.
- Bài toán: vẫn đổi số điện thoại qua 4 service, điều phối bằng commands/events Axon.

**Bài kế tiếp** → [Bài 2: Chuẩn bị commands, events và config](02-orchestration-commands-events-setup.md)
