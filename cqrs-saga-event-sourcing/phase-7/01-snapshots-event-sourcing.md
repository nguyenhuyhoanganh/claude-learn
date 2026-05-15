# Bài 1: Snapshots trong Event Sourcing

## Vấn đề Performance

Trong Event Sourcing, mỗi khi một Command được xử lý, Aggregate phải **replay tất cả events** từ đầu để tái tạo state hiện tại.

```
AccountAggregate phải replay:
Event 1: AccountCreated
Event 2: MoneyDeposited +$2000
Event 3: MoneyWithdrawn -$120
Event 4: MoneyDeposited +$500
Event 5: MoneyWithdrawn -$80
...
Event 100,000: MoneyWithdrawn -$50  ← Mới vừa xảy ra
```

Với khách hàng dùng tài khoản ngân hàng 10 năm, có thể có 100,000+ events. **Replay 100,000 events mỗi khi có transaction mới = performance catastrophe!**

---

## Demo: Axon Framework replay events

Để minh chứng, đặt breakpoint trong `@EventSourcingHandler` methods của CustomerAggregate:

```java
@EventSourcingHandler
public void on(CustomerCreatedEvent event) {
    // Đặt breakpoint ở đây ←
    this.customerId = event.getCustomerId();
}

@EventSourcingHandler
public void on(CustomerUpdatedEvent event) {
    // Đặt breakpoint ở đây ←
    this.name = event.getName();
}
```

Sau khi tạo 1 customer và update 2 lần (3 events tổng), khi gọi `updateCustomer` lần 3:
- Breakpoint dừng **3 lần** (replay: event 1, 2, 3) trước khi event mới được lưu
- Sau khi lưu event mới: Axon Server có 4 events

Khi có 100,000 events → breakpoint dừng 100,000 lần → cực kỳ chậm.

---

## Snapshot là gì?

**Snapshot** = chụp lại state của Aggregate tại một thời điểm nhất định.

Thay vì replay toàn bộ 100,000 events:
1. Lưu snapshot tại event 99,900 (state tại thời điểm đó)
2. Khi cần rebuild state: load snapshot + replay chỉ events 99,901 đến hiện tại

```
Events: [E1, E2, ..., E99900] → Snapshot S1 (state sau E99900)
                                        ↓
New events: [E99901, ..., E100K]
                                        ↓
Rebuild: S1 + E99901...E100K = Current State ✅

Tiết kiệm: không cần replay E1..E99900!
```

---

## Implementation trong Axon Framework

### Bước 1: Tạo SnapshotTriggerDefinition Bean

```java
// Trong Spring Boot main class (@SpringBootApplication)
@Bean
public SnapshotTriggerDefinition customerSnapshotTrigger(Snapshotter snapshotter) {
    // Tạo snapshot sau mỗi 3 events (cho demo; production nên dùng 50-100)
    return new EventCountSnapshotTriggerDefinition(snapshotter, 3);
}
```

**Các loại SnapshotTriggerDefinition:**

| Class | Khi nào trigger |
|---|---|
| `EventCountSnapshotTriggerDefinition` | Sau N events |
| `AggregateLoadTimeSnapshotTriggerDefinition` | Khi aggregate load quá lâu |
| `NoSnapshotTriggerDefinition` | Không bao giờ (disable snapshots) |

### Bước 2: Gắn SnapshotTrigger vào Aggregate

```java
@Aggregate(snapshotTriggerDefinition = "customerSnapshotTrigger")
// Bean name phải khớp với @Bean method name ở trên ↑
@Slf4j
public class CustomerAggregate {
    
    @AggregateIdentifier
    private String customerId;
    
    private String name;
    private String email;
    private String mobileNumber;
    
    // ... CommandHandlers và EventSourcingHandlers
}
```

Chỉ cần **2 thay đổi nhỏ** này. Axon Framework tự lo phần còn lại!

---

## Cách Axon quản lý Snapshots

### Lưu Snapshot

```
Events: [E1, E2, E3]  → Snapshot S1 được tạo sau E3
Events: [E4, E5, E6]  → Snapshot S2 được tạo sau E6
Events: [E7, ...]
```

Axon lưu snapshots trong Axon Server's Event Store — cùng chỗ với events, nhưng với metadata khác biệt.

### Đọc từ Snapshot

Khi cần rebuild Aggregate state (cho E8 mới):
1. Tìm snapshot gần nhất (S2 sau E6)
2. Deserialize S2 thành Aggregate state
3. Replay chỉ events sau S2: [E7]
4. Process command → E8

Thay vì replay [E1, E2, E3, E4, E5, E6, E7] → chỉ load S2 + [E7]!

### Snapshot trong Axon Dashboard

Khi truy cập Axon Server Dashboard → Snapshots:
```
Aggregate ID: abc-123-def-456
Token: 0  ← vị trí snapshot (sau event index 0, 1, 2)
```

---

## Demo chi tiết

### Setup

```java
@Bean
public SnapshotTriggerDefinition customerSnapshotTrigger(Snapshotter snapshotter) {
    return new EventCountSnapshotTriggerDefinition(snapshotter, 3);
}
```

### Quan sát behavior

1. **Tạo customer** (Event 0: CustomerCreated)
2. **Update customer 1 lần** (Event 1: CustomerUpdated)
3. **Update customer 2 lần** (Event 2: CustomerUpdated)

→ Sau Event 2 (3 events total, index 0,1,2): **Snapshot được tạo!**

4. **Update lần 3**:
   - Axon load Snapshot → chỉ 0 events cần replay
   - Event 3 được lưu
   - Breakpoint chỉ dừng **0 lần** (chỉ từ snapshot)

5. **Update lần 4** (Event 4):
   - Load Snapshot + replay Event 3
   - Breakpoint dừng **1 lần**

### Lưu ý đặc biệt

Axon tính snapshot event **vào event count**:

```
Snapshot được tạo sau mỗi 3 events:

Events:    E0  E1  E2  → Snapshot S1
Counter:   1   2   3   → reset

E3  S1  → Snapshot S1 được coi là event (counter = 2!)
E3  S1  E4 → counter = 3 → Snapshot S2 tạo ra!
```

Điều này giải thích tại sao snapshots có thể xuất hiện nhiều hơn dự kiến.

---

## Production Best Practices

### Chọn snapshot threshold đúng

```java
// Development/Demo
new EventCountSnapshotTriggerDefinition(snapshotter, 3);

// Production (tùy theo business)
new EventCountSnapshotTriggerDefinition(snapshotter, 50);   // moderate
new EventCountSnapshotTriggerDefinition(snapshotter, 100);  // aggressive
new EventCountSnapshotTriggerDefinition(snapshotter, 1000); // conservative
```

**Nguyên tắc chọn threshold:**
- Quá thấp (3): Tạo quá nhiều snapshots → tốn storage
- Quá cao (10000): Không tối ưu performance
- Khuyến nghị: 50-200 tùy use case

### Áp dụng cho tất cả Aggregates

```java
// CustomerAggregate
@Aggregate(snapshotTriggerDefinition = "customerSnapshotTrigger")
public class CustomerAggregate { ... }

// AccountsAggregate
@Aggregate(snapshotTriggerDefinition = "accountSnapshotTrigger")
public class AccountsAggregate { ... }

// CardsAggregate
@Aggregate(snapshotTriggerDefinition = "cardSnapshotTrigger")
public class CardsAggregate { ... }

// LoansAggregate
@Aggregate(snapshotTriggerDefinition = "loanSnapshotTrigger")
public class LoansAggregate { ... }
```

### Snapshot Storage với Axon Server EE

Axon Server Enterprise Edition hỗ trợ lưu snapshots tách biệt khỏi events — tối ưu I/O pattern.

---

## Trade-offs của Snapshots

| Lợi ích | Chi phí |
|---|---|
| Giảm replay time | Tốn storage cho snapshots |
| Performance tốt hơn | Thêm độ phức tạp |
| Scale với nhiều events | Phải quản lý snapshot lifecycle |
| Giảm load Axon Server | Schema evolution phức tạp hơn |

### Schema Evolution với Snapshots

Khi Aggregate state fields thay đổi, snapshots cũ có thể không compatible:

```java
// Version 1: CustomerAggregate
String name;
String email;

// Version 2: thêm field mới
String name;
String email;
String phoneNumber;  // ← mới thêm
```

Snapshot từ Version 1 không có `phoneNumber` → cần migration strategy.

**Giải pháp:**
1. Đánh version snapshots và xử lý migration trong code
2. Delete tất cả snapshots cũ khi có major schema change → rebuild từ events
3. Dùng `@Revision` annotation của Axon để quản lý versioning

---

## Tóm tắt

| Aspect | Không có Snapshot | Có Snapshot |
|---|---|---|
| Aggregate với 100K events | Replay 100K events | Replay từ snapshot + N events gần nhất |
| Performance | Giảm dần theo thời gian | Ổn định |
| Storage | Chỉ events | Events + Snapshots |
| Complexity | Thấp | Trung bình |
| Khuyến nghị | Small apps, ít events | Production, high-traffic |

---

> **Kết luận:** Snapshots là **tối ưu hóa không thể thiếu** cho bất kỳ hệ thống Event Sourcing production nào có lượng events lớn. Axon Framework hỗ trợ sẵn, cần chưng 2 dòng code để enable.

**Chúc mừng!** Bạn đã hoàn thành toàn bộ khóa học CQRS, Saga và Event Sourcing.
