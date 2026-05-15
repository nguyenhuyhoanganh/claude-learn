# Bài 9: State Pattern

## State Pattern là gì?

State là một **Behavioral Design Pattern** cho phép object thay đổi behavior của mình khi internal state thay đổi. Object sẽ có vẻ như thay đổi class của nó.

**Ý tưởng cốt lõi:** Thay vì dùng hàng tá `if/else` hay `switch` để kiểm tra state, mỗi state được encapsulate trong một class riêng. Context object delegate behavior cho state object hiện tại.

**Ví dụ thực tế:**
- Traffic light (Red → Yellow → Green → Red)
- Order workflow (New → Paid → Shipped → Delivered)
- Vending machine (Idle → HasMoney → Dispensing → OutOfStock)
- TCP connection (Closed → Listen → Established → ...)

## Vấn đề không có State Pattern

```java
// Tangled if-else spaghetti
public class Order {
    private String status; // "NEW", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"
    
    public void pay() {
        if (status.equals("NEW")) {
            status = "PAID";
        } else if (status.equals("PAID")) {
            throw new RuntimeException("Already paid");
        } else if (status.equals("SHIPPED")) {
            throw new RuntimeException("Cannot pay shipped order");
        } // ... thêm nhiều states nữa
    }
    
    public void ship() {
        if (status.equals("PAID")) {
            status = "SHIPPED";
        } else {
            throw new RuntimeException("Cannot ship from state: " + status);
        }
    }
    // ... mỗi method đều có if-else dài như vậy
}
```

## UML Cấu trúc

```
Context ─────────> State (interface)
- state: State          |  + handle(Context)
+ setState(State)       |
+ request()             ↑
  → state.handle(this)  |
                 ┌──────┴────────────┐
                 ↓                   ↓
           ConcreteStateA      ConcreteStateB
           + handle(Context)   + handle(Context)
             {                   {
               // do A behavior    // do B behavior
               context.setState(  context.setState(
                 new StateB()        new StateA()
               )                   )
             }                   }
```

## Implement State Pattern

```java
// State interface
public interface OrderState {
    void pay(Order order);
    void ship(Order order);
    void deliver(Order order);
    void cancel(Order order);
    String getStateName();
}

// Context
public class Order {
    private OrderState state;
    private final String orderId;
    
    public Order(String orderId) {
        this.orderId = orderId;
        this.state = new NewOrderState(); // trạng thái ban đầu
        System.out.println("Order " + orderId + " created [NEW]");
    }
    
    // Context delegate tất cả behavior cho state
    public void pay() { state.pay(this); }
    public void ship() { state.ship(this); }
    public void deliver() { state.deliver(this); }
    public void cancel() { state.cancel(this); }
    
    // State objects gọi setState để chuyển state
    public void setState(OrderState newState) {
        System.out.printf("Order %s: %s → %s%n", 
            orderId, state.getStateName(), newState.getStateName());
        this.state = newState;
    }
    
    public String getStateName() { return state.getStateName(); }
}

// Concrete State 1 - NEW
public class NewOrderState implements OrderState {
    
    @Override
    public void pay(Order order) {
        System.out.println("Processing payment...");
        order.setState(new PaidOrderState());
    }
    
    @Override
    public void ship(Order order) {
        System.out.println("ERROR: Cannot ship unpaid order");
    }
    
    @Override
    public void deliver(Order order) {
        System.out.println("ERROR: Cannot deliver unpaid order");
    }
    
    @Override
    public void cancel(Order order) {
        System.out.println("Order cancelled (was new)");
        order.setState(new CancelledOrderState());
    }
    
    @Override public String getStateName() { return "NEW"; }
}

// Concrete State 2 - PAID
public class PaidOrderState implements OrderState {
    
    @Override
    public void pay(Order order) {
        System.out.println("ERROR: Order already paid");
    }
    
    @Override
    public void ship(Order order) {
        System.out.println("Shipping order...");
        order.setState(new ShippedOrderState());
    }
    
    @Override
    public void deliver(Order order) {
        System.out.println("ERROR: Must ship before delivering");
    }
    
    @Override
    public void cancel(Order order) {
        System.out.println("Cancelling and refunding...");
        order.setState(new CancelledOrderState());
    }
    
    @Override public String getStateName() { return "PAID"; }
}

// Concrete State 3 - SHIPPED
public class ShippedOrderState implements OrderState {
    
    @Override
    public void pay(Order order) {
        System.out.println("ERROR: Order already paid and shipped");
    }
    
    @Override
    public void ship(Order order) {
        System.out.println("ERROR: Order already shipped");
    }
    
    @Override
    public void deliver(Order order) {
        System.out.println("Order delivered!");
        order.setState(new DeliveredOrderState());
    }
    
    @Override
    public void cancel(Order order) {
        System.out.println("ERROR: Cannot cancel shipped order");
    }
    
    @Override public String getStateName() { return "SHIPPED"; }
}

// Concrete State 4 - DELIVERED (terminal state)
public class DeliveredOrderState implements OrderState {
    
    @Override
    public void pay(Order order) { System.out.println("ERROR: Already delivered"); }
    
    @Override
    public void ship(Order order) { System.out.println("ERROR: Already delivered"); }
    
    @Override
    public void deliver(Order order) { System.out.println("ERROR: Already delivered"); }
    
    @Override
    public void cancel(Order order) { System.out.println("ERROR: Cannot cancel delivered order"); }
    
    @Override public String getStateName() { return "DELIVERED"; }
}

// Concrete State 5 - CANCELLED (terminal state)
public class CancelledOrderState implements OrderState {
    
    @Override
    public void pay(Order order) { System.out.println("ERROR: Order is cancelled"); }
    
    @Override
    public void ship(Order order) { System.out.println("ERROR: Order is cancelled"); }
    
    @Override
    public void deliver(Order order) { System.out.println("ERROR: Order is cancelled"); }
    
    @Override
    public void cancel(Order order) { System.out.println("Order already cancelled"); }
    
    @Override public String getStateName() { return "CANCELLED"; }
}

// Client
public class Main {
    public static void main(String[] args) {
        Order order = new Order("ORD-001");
        
        order.ship();       // ERROR: Cannot ship unpaid order
        order.pay();        // Processing payment... [NEW → PAID]
        order.pay();        // ERROR: Order already paid
        order.ship();       // Shipping order... [PAID → SHIPPED]
        order.cancel();     // ERROR: Cannot cancel shipped order
        order.deliver();    // Order delivered! [SHIPPED → DELIVERED]
        order.cancel();     // ERROR: Cannot cancel delivered order
        
        System.out.println("Final state: " + order.getStateName()); // DELIVERED
    }
}
```

## State Machine Diagram

```
           pay()           ship()          deliver()
[NEW] ──────────> [PAID] ──────────> [SHIPPED] ──────────> [DELIVERED]
  │                 │
  │ cancel()        │ cancel()
  └───────────────> └───────────────────────────────────> [CANCELLED]
```

## So sánh State vs Strategy

| | State | Strategy |
|--|-------|---------|
| **Chuyển đổi** | State tự chuyển sang state khác | Client chọn strategy |
| **Biết nhau** | States có thể biết về state khác | Strategies không biết nhau |
| **Mục đích** | Thay đổi behavior theo state | Chọn algorithm lúc runtime |
| **Intent** | FSM (Finite State Machine) | Pluggable algorithms |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **State transition** | Ai chuyển state? Context hay State object? (cả hai đều hợp lệ) |
| **Shared states** | States không có mutable instance variables → có thể share (Singleton/Flyweight) |
| **Entry/Exit actions** | Có thể thêm logic khi enter/exit state |

## Pitfalls (Nhược điểm)

1. **Class explosion:** Nhiều states → nhiều classes
2. **State sharing:** Nếu states có state riêng → khó share
3. **Complex transitions:** Nhiều states với nhiều transitions → khó maintain

## Tóm lại

```
State = Encapsulate behavior theo state, delegate cho state object hiện tại
```

**Dùng State khi:**
- Object có behavior phụ thuộc vào state, và state thay đổi lúc runtime
- Code có nhiều if/else hay switch phức tạp kiểm tra state
- Muốn implement Finite State Machine (FSM)

---
**Tiếp theo:** Strategy Pattern →
