# Bài 8: Thiết kế Order Aggregate — fields, relationships, invariant

> Trước khi gõ class `Order` đầu tiên, ta cần **thiết kế nó trên giấy**: chứa field gì, quan hệ với Entity/VO nào, invariant nào phải đảm bảo, state machine nào áp dụng. Bài này làm việc đó — thiết kế **Order Aggregate** theo DDD, để bài 11 code chỉ là gõ lại thiết kế đã có.

## Bắt đầu từ câu hỏi: cụm gì cần nhất quán cùng nhau?

DDD nói "Aggregate = cụm Entity + VO **luôn nhất quán cùng nhau**". Áp vào food ordering, hỏi: khi tạo 1 order, có những object nào **bắt buộc đồng bộ trong 1 transaction**?

- `Order` (tổng đơn) — bắt buộc.
- `OrderItem` (danh sách từng món) — bắt buộc đồng bộ với `Order` (item chỉ tồn tại khi order tồn tại; xoá order = xoá item).
- `OrderAddress` (địa chỉ giao) — bắt buộc đồng bộ với `Order`.
- `Money` (totalPrice) — VO, đi với Order.
- `OrderStatus` (PENDING/PAID/...) — enum, đi với Order.

Còn:
- `Customer` — KHÔNG. Customer tồn tại độc lập, sống lâu hơn order. Chỉ tham chiếu qua `customerId`.
- `Restaurant` — KHÔNG. Tương tự, chỉ tham chiếu qua `restaurantId`.
- `Product` — KHÔNG. Product thuộc Restaurant context, chỉ tham chiếu qua `productId`.

```text
                            ╔══════════════════════════════════════╗
                            ║         Order Aggregate                ║
                            ║                                        ║
                            ║   ┌──────────────────────────────┐    ║
                            ║   │     Order (Aggregate Root)    │    ║
                            ║   │                                │    ║
                            ║   │  - orderId: OrderId            │    ║
                            ║   │  - customerId: CustomerId      │ ───┼─► trỏ ngoài (chỉ ID)
                            ║   │  - restaurantId: RestaurantId  │ ───┼─► trỏ ngoài (chỉ ID)
                            ║   │  - deliveryAddress: StreetAddr │    ║
                            ║   │  - price: Money                │    ║
                            ║   │  - items: List<OrderItem>      │    ║
                            ║   │  - trackingId: TrackingId      │    ║
                            ║   │  - orderStatus: OrderStatus    │    ║
                            ║   │  - failureMessages: List<Str>  │    ║
                            ║   └─────────────┬────────────────┘    ║
                            ║                 │ contains              ║
                            ║                 ▼                       ║
                            ║   ┌──────────────────────────────┐    ║
                            ║   │       OrderItem (Entity)      │    ║
                            ║   │                                │    ║
                            ║   │  - orderItemId: OrderItemId   │    ║
                            ║   │  - orderId: OrderId           │    ║
                            ║   │  - product: Product           │ ───┼─► trỏ Product
                            ║   │  - quantity: int              │    ║   (read-only ref)
                            ║   │  - price: Money               │    ║
                            ║   │  - subTotal: Money            │    ║
                            ║   └──────────────────────────────┘    ║
                            ║                                        ║
                            ╚════════════════════════════════════════╝
                                          │
              ──────────────────────────  │  ──────────────────────────
                outside aggregate         │     outside aggregate
                                          ▼
                                   chỉ qua ID, không qua object
```

Quy tắc DDD chặt chẽ:

| Có được không? | Tại sao |
|---|---|
| `Order` chứa `List<OrderItem>` | OK — cùng aggregate, root sở hữu |
| `Order` chứa `Customer` object | KHÔNG — Customer ngoài aggregate, chỉ tham chiếu qua `CustomerId` |
| `Order` chứa `customerId: CustomerId` (VO) | OK — đây là cách tham chiếu cross-aggregate |
| Outside gọi `orderItem.setQuantity(5)` trực tiếp | KHÔNG — phải `order.changeItemQuantity(itemId, 5)` qua root |
| `Order.addItem(...)` rồi save chỉ Item không save Order | KHÔNG — toàn aggregate save cùng nhau |

## Field-by-field — Order entity

| Field | Type | Vai trò | Có set sau khi tạo không |
|---|---|---|---|
| `orderId` | `OrderId` (VO của UUID) | Identity internal, dùng làm PK DB | Không (immutable) |
| `customerId` | `CustomerId` (VO) | Ai đặt order | Không |
| `restaurantId` | `RestaurantId` (VO) | Order thuộc quán nào | Không |
| `deliveryAddress` | `StreetAddress` (VO) | Địa chỉ giao | Không |
| `price` | `Money` (VO) | Tổng tiền client gửi lên | Không |
| `items` | `List<OrderItem>` | Các món | Không (set 1 lần lúc create) |
| `trackingId` | `TrackingId` (VO của UUID) | Identity public, expose ra REST | Không |
| `orderStatus` | `OrderStatus` enum | PENDING/PAID/APPROVED/CANCELLED/CANCELLING | Có (state machine) |
| `failureMessages` | `List<String>` | Lý do nếu lỗi | Có (append-only) |

Tại sao tách `orderId` và `trackingId`?
- `orderId` là internal — index DB, không lộ ra ngoài.
- `trackingId` là public — expose qua REST API. Tách giúp khi cần đổi schema internal không break public API.

## State Machine của Order

```text
                  initiateOrder()
        ────────────────────────────► [PENDING]
                                        │
                                        │ pay()
                                        ▼
                                     [PAID]
                                        │
                                        │ approve()         initCancel()
                                        │                       │
                                        ▼                       ▼
                                  [APPROVED]              [CANCELLING]
                                                                │
                                                                │ cancel()
                                                                ▼
                                                          [CANCELLED]
```

| Transition | Method | Điều kiện |
|---|---|---|
| (init) → `PENDING` | `initiateOrder()` | Status đang null |
| `PENDING` → `PAID` | `pay()` | Status đang `PENDING` |
| `PAID` → `APPROVED` | `approve()` | Status đang `PAID` |
| `PAID` → `CANCELLING` | `initCancel(failureMsgs)` | Status đang `PAID` (compensation từ Restaurant reject) |
| `CANCELLING` → `CANCELLED` | `cancel(failureMsgs)` | Status đang `CANCELLING` hoặc `PENDING` |
| `PENDING` → `CANCELLED` | `cancel(failureMsgs)` | Cho trường hợp Payment fail |

**Vì sao có trạng thái trung gian `CANCELLING`?**

Khi Restaurant reject, Order đang ở `PAID`. Phải:
1. Đổi Order sang `CANCELLING` ngay (đánh dấu "đang rollback").
2. Gửi event xin Payment refund.
3. Payment refund xong publish `PaymentCancelledEvent`.
4. Order nhận event, đổi sang `CANCELLED`.

Nếu chỉ có `CANCELLED` (không có `CANCELLING`), không phân biệt được "đang rollback" với "đã rollback xong". Hai trạng thái phục vụ nghiệp vụ rõ ràng.

**Terminal state**: `APPROVED` và `CANCELLED`. Vào rồi không ra. Code enforce: không có method nào trên `APPROVED` hoặc `CANCELLED`.

## Invariant — bất biến phải bảo vệ

Aggregate Root có trách nhiệm enforce **mọi rule sau** mỗi state change:

| Invariant | Phải đảm bảo |
|---|---|
| `price > 0` | Không thể có order giá 0 hoặc âm |
| `items` không rỗng | Order phải có ít nhất 1 item |
| `price == sum(items.subTotal)` | Tổng tiền order = tổng tiền các item |
| `item.subTotal == item.price * item.quantity` | Tính tiền item đúng công thức |
| `item.product.id` tồn tại trong restaurant's product list | Item phải là sản phẩm restaurant đang bán |
| `item.price == product.price` | Giá item client gửi = giá restaurant đang niêm yết (chống tampering) |
| Status transition theo state machine | Không nhảy từ `PENDING` thẳng `APPROVED` |
| `failureMessages` không trùng | Append chỉ message mới |

Validation chạy:
- Một số ở constructor (kích thước `items`, `price > 0`).
- Một số ở `initiateOrder()` (kiểm tra `price == sum`).
- Một số ở từng method (state transition).
- Validation cần thêm thông tin restaurant → giao cho `OrderDomainService` (sẽ học ở bài 12).

## Value Objects của Order

Chuyển field "primitive" sang VO:

| Primitive | Value Object |
|---|---|
| `UUID id` | `OrderId(UUID value)` |
| `UUID customerId` | `CustomerId(UUID value)` |
| `UUID restaurantId` | `RestaurantId(UUID value)` |
| `UUID trackingId` | `TrackingId(UUID value)` |
| `BigDecimal price` | `Money(BigDecimal amount)` |
| `String street, postalCode, city` | `StreetAddress(UUID id, String street, String postalCode, String city)` |

Lợi ích:
1. **Tự document**: `order.getCustomerId()` rõ ràng hơn `order.getCustomerUuid()`.
2. **Type safety**: không thể nhầm `customerId` với `restaurantId` (cả 2 cùng UUID nhưng VO khác type).
3. **Logic gắn liền VO**: `Money.add()`, `Money.multiply()`, `Money.isGreaterThanZero()` đặt trong `Money` — không tản mác.
4. **Validation tại VO**: `Money` constructor reject `null`, reject âm.

Ví dụ Money:

```java
public final class Money {
    private final BigDecimal amount;
    public Money(BigDecimal amount) {
        if (amount == null) throw new IllegalArgumentException("Money cannot be null");
        this.amount = amount;
    }
    public Money add(Money other)         { return new Money(amount.add(other.amount)); }
    public Money subtract(Money other)    { return new Money(amount.subtract(other.amount)); }
    public Money multiply(int multiplier) { return new Money(amount.multiply(new BigDecimal(multiplier))); }
    public boolean isGreaterThanZero()    { return amount.compareTo(BigDecimal.ZERO) > 0; }
    public boolean isGreaterThan(Money o) { return amount.compareTo(o.amount) > 0; }
    @Override public boolean equals(Object o) { /* equals by amount */ }
    @Override public int hashCode() { /* hash by amount */ }
}
```

Field `final` + không setter = **immutable**. Bằng nhau bằng giá trị.

## OrderItem — entity con trong Aggregate

```text
OrderItem
├── orderItemId: OrderItemId (entity ID, scope trong Order)
├── orderId: OrderId         (back-reference, set bởi root)
├── product: Product         (read-only snapshot)
├── quantity: int
├── price: Money             (giá đơn vị)
└── subTotal: Money          (= price * quantity, double check)
```

Lưu ý:
- `orderItemId` chỉ unique **trong scope của Order**. Hai Order khác nhau có thể có `itemId = 1, 2, 3` trùng nhau — không sao vì không truy cập item từ ngoài.
- `Product` ở đây là **snapshot**: copy `productId`, `name`, `price` lúc order tạo. Nếu sau này restaurant đổi giá product, order cũ vẫn giữ giá lúc đặt. Đây là kỹ thuật "**đóng băng giá tại thời điểm giao dịch**".

```java
public class OrderItem extends BaseEntity<OrderItemId> {
    private OrderId orderId;          // back-ref, set bởi Order khi initialize
    private final Product product;     // snapshot
    private final int quantity;
    private final Money price;
    private final Money subTotal;

    public boolean isPriceValid() {
        return price.isGreaterThanZero() &&
               price.equals(product.getPrice()) &&        // không tampering
               price.multiply(quantity).equals(subTotal); // tính đúng
    }
}
```

## Aggregate Root: invariant tổng

Logic mà chỉ Root mới làm được:

```java
public class Order extends AggregateRoot<OrderId> {
    public void initiateOrder() {
        if (orderStatus != null) throw new OrderDomainException("Order is not in correct state for initialization!");
        orderStatus = OrderStatus.PENDING;
        initializeOrderItems();
    }

    public void validateOrder() {
        validateInitialOrder();
        validateTotalPrice();
        validateItemsPrice();
    }

    private void validateTotalPrice() {
        if (price == null || !price.isGreaterThanZero()) {
            throw new OrderDomainException("Total price must be greater than zero!");
        }
    }

    private void validateItemsPrice() {
        Money orderItemsTotal = items.stream()
            .map(orderItem -> {
                if (!orderItem.isPriceValid()) {
                    throw new OrderDomainException("Order item price is invalid: " + orderItem.getProduct().getId().getValue());
                }
                return orderItem.getSubTotal();
            })
            .reduce(Money.ZERO, Money::add);
        if (!price.equals(orderItemsTotal)) {
            throw new OrderDomainException("Total price " + price.getAmount()
                + " is not equal to Order items total " + orderItemsTotal.getAmount());
        }
    }
    // ... state changes (pay, approve, cancel)
}
```

`validateOrder()` được gọi **sau khi initiateOrder** trong Domain Service (bài 12 sẽ rõ).

## OrderStatus enum và domain logic

```java
public enum OrderStatus {
    PENDING, PAID, APPROVED, CANCELLING, CANCELLED
}
```

Lưu ý: enum **không** có method behavior trong khoá học (vì DDD đặt logic vào Aggregate Root). Trong DDD nâng cao, có thể đặt state-specific behavior vào enum (Tell-Don't-Ask) — nhưng giữ đơn giản cho khoá học.

## Tóm tắt bài 8

- Order Aggregate gồm 1 Root (`Order`) + 1 child Entity (`OrderItem`) + nhiều VO (`Money`, `OrderId`, `CustomerId`, ...).
- Tham chiếu xuyên aggregate **chỉ qua ID** — không nhúng object.
- State machine 5 trạng thái: `PENDING → PAID → APPROVED` (golden path) hoặc nhánh `CANCELLING → CANCELLED`.
- Invariant được enforce bởi Root: kích thước items, giá tổng, giá item, state transition.
- VO đại diện cho mọi giá trị có ý nghĩa business (UUID không bao giờ dùng trần — luôn wrap vào VO).
- `OrderItem` chứa snapshot `Product` để chống tampering giá và đóng băng giá tại lúc đặt.

**Bài kế tiếp** → [Bài 9: Common-domain module — base Entity, BaseId, AggregateRoot, DomainEvent](03-common-domain-base-classes.md)
