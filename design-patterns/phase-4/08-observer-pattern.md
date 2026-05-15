# Bài 8: Observer Pattern

## Observer Pattern là gì?

Observer (còn gọi là Event Listener, Publish-Subscribe) là một **Behavioral Design Pattern** định nghĩa quan hệ 1-nhiều giữa các objects: khi một object thay đổi state, tất cả các object phụ thuộc vào nó đều được thông báo và update tự động.

**Ý tưởng cốt lõi:**
- **Observable (Subject):** Object có state. Duy trì danh sách observers. Notify họ khi state thay đổi.
- **Observer:** Object muốn nhận thông báo khi subject thay đổi.

**Ví dụ thực tế:**
- Event listeners trong UI (button click → nhiều handlers)
- Stock price feeds → nhiều traders
- RSS/Newsletter → nhiều subscribers
- Java `EventListener`, `Observer`/`Observable` (deprecated)
- Spring `ApplicationEvent`

## UML Cấu trúc

```
Observable (Subject)               Observer (interface)
─────────────────────              ──────────────────
- observers: List<Observer>        + update(event)
+ subscribe(Observer)                    ↑
+ unsubscribe(Observer)        ┌─────────┴──────────┐
+ notifyObservers(event)       ↓                    ↓
                          ConcreteObserver1   ConcreteObserver2
```

## Implement Observer Pattern

```java
// Observer interface
public interface StockObserver {
    void update(String stockSymbol, double price, double change);
}

// Observable (Subject)
public class StockMarket {
    private final Map<String, Double> stockPrices = new HashMap<>();
    private final List<StockObserver> observers = new ArrayList<>();
    
    // Subscribe / Unsubscribe
    public void subscribe(StockObserver observer) {
        observers.add(observer);
    }
    
    public void unsubscribe(StockObserver observer) {
        observers.remove(observer);
    }
    
    // Update price và notify all observers
    public void updatePrice(String symbol, double newPrice) {
        double oldPrice = stockPrices.getOrDefault(symbol, newPrice);
        stockPrices.put(symbol, newPrice);
        double change = newPrice - oldPrice;
        
        System.out.printf("Stock update: %s = %.2f (%.2f)%n", symbol, newPrice, change);
        notifyObservers(symbol, newPrice, change);
    }
    
    private void notifyObservers(String symbol, double price, double change) {
        // iterate trên copy để tránh ConcurrentModificationException nếu observer unsubscribe trong update
        new ArrayList<>(observers).forEach(o -> o.update(symbol, price, change));
    }
    
    public double getPrice(String symbol) {
        return stockPrices.getOrDefault(symbol, 0.0);
    }
}

// Concrete Observer 1 - Trader muốn alert khi giá tăng/giảm nhiều
public class AlertTrader implements StockObserver {
    private final String name;
    private final double threshold; // % change để alert
    
    public AlertTrader(String name, double threshold) {
        this.name = name;
        this.threshold = threshold;
    }
    
    @Override
    public void update(String symbol, double price, double change) {
        double changePercent = Math.abs(change / (price - change)) * 100;
        if (changePercent >= threshold) {
            System.out.printf("[ALERT - %s] %s moved %.1f%% to %.2f%n",
                name, symbol, changePercent, price);
        }
    }
}

// Concrete Observer 2 - Logger ghi log tất cả thay đổi
public class StockLogger implements StockObserver {
    private final List<String> log = new ArrayList<>();
    
    @Override
    public void update(String symbol, double price, double change) {
        String entry = String.format("%s: %s = %.2f (%+.2f) at %s",
            LocalDateTime.now(), symbol, price, change, LocalDateTime.now());
        log.add(entry);
        System.out.println("[LOG] " + entry);
    }
    
    public List<String> getLog() {
        return Collections.unmodifiableList(log);
    }
}

// Concrete Observer 3 - Portfolio tracker
public class Portfolio implements StockObserver {
    private final Map<String, Integer> holdings = new HashMap<>();
    private final Map<String, Double> prices = new HashMap<>();
    
    public void addHolding(String symbol, int shares) {
        holdings.put(symbol, shares);
    }
    
    @Override
    public void update(String symbol, double price, double change) {
        if (holdings.containsKey(symbol)) {
            prices.put(symbol, price);
            double totalValue = holdings.entrySet().stream()
                .mapToDouble(e -> e.getValue() * prices.getOrDefault(e.getKey(), 0.0))
                .sum();
            System.out.printf("[PORTFOLIO] Updated value: $%.2f%n", totalValue);
        }
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        StockMarket market = new StockMarket();
        
        AlertTrader dayTrader = new AlertTrader("DayTrader", 2.0); // alert khi >= 2%
        StockLogger logger = new StockLogger();
        Portfolio portfolio = new Portfolio();
        portfolio.addHolding("AAPL", 10);
        portfolio.addHolding("GOOGL", 5);
        
        // Subscribe
        market.subscribe(dayTrader);
        market.subscribe(logger);
        market.subscribe(portfolio);
        
        // Update prices → notify all
        market.updatePrice("AAPL", 150.00);
        market.updatePrice("AAPL", 157.50); // +5% → alert!
        market.updatePrice("GOOGL", 2800.00);
        
        // DayTrader unsubscribes
        market.unsubscribe(dayTrader);
        market.updatePrice("AAPL", 160.00); // DayTrader không nhận
    }
}
```

## Ví dụ thực tế trong Java

### Java EventListener (Legacy)

```java
// Java Swing là Observer pattern
JButton button = new JButton("Click me");

// ActionListener là Observer
button.addActionListener(e -> {
    System.out.println("Button clicked!");
}); // ActionEvent = notification

// Có thể thêm nhiều listeners
button.addActionListener(e -> logger.log("Button click logged"));
button.addActionListener(e -> analytics.track("button_click"));
```

### Java PropertyChangeListener

```java
// JavaBeans PropertyChangeSupport
public class BankAccount {
    private final PropertyChangeSupport support = new PropertyChangeSupport(this);
    private double balance;
    
    public void addPropertyChangeListener(PropertyChangeListener listener) {
        support.addPropertyChangeListener(listener);
    }
    
    public void deposit(double amount) {
        double oldBalance = this.balance;
        this.balance += amount;
        support.firePropertyChange("balance", oldBalance, this.balance);
    }
}

// Observer
account.addPropertyChangeListener(evt -> {
    System.out.printf("Balance changed: %.2f → %.2f%n", 
        evt.getOldValue(), evt.getNewValue());
});
```

### Spring ApplicationEvent

```java
// Spring Event System = Observer Pattern
@Component
public class OrderService {
    @Autowired
    private ApplicationEventPublisher publisher;
    
    public void placeOrder(Order order) {
        saveOrder(order);
        publisher.publishEvent(new OrderPlacedEvent(this, order)); // notify
    }
}

// Observer - tự động được notify
@Component
public class EmailNotificationListener {
    @EventListener
    public void handleOrderPlaced(OrderPlacedEvent event) {
        sendConfirmationEmail(event.getOrder());
    }
}

@Component
public class InventoryListener {
    @EventListener
    public void handleOrderPlaced(OrderPlacedEvent event) {
        updateInventory(event.getOrder());
    }
}
```

## Push vs Pull Model

```java
// PUSH: Observable gửi data trong notification
interface Observer {
    void update(String symbol, double price, double change); // data được push
}

// PULL: Observable chỉ notify, observer tự pull data
interface Observer {
    void update(Observable source); // observer tự gọi source.getData()
}
```

**Push:** Observer nhận đủ data ngay. Đơn giản hơn nhưng coupling cao hơn.
**Pull:** Observer chỉ biết có sự kiện, tự lấy data cần. Flexible hơn nhưng cần expose getter.

## So sánh Observer vs Mediator

| | Observer | Mediator |
|--|---------|---------|
| **Pattern** | 1-nhiều (1 subject → nhiều observers) | Nhiều-nhiều (qua trung gian) |
| **Coupling** | Subject không biết observer class cụ thể | Mediator biết tất cả colleagues |
| **Direction** | Subject → Observers | Bidirectional |
| **Dùng khi** | State change cần broadcast | Objects cần phối hợp phức tạp |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Memory leaks** | Observer không unsubscribe → strong reference → GC không thu hồi |
| **Order** | Thứ tự notify observers thường không đảm bảo |
| **Thread safety** | Notify trong multi-thread → cần synchronization |
| **Event flooding** | Nhiều updates nhanh → buffer hoặc debounce |

## Pitfalls (Nhược điểm)

1. **Memory leaks:** Observer không unsubscribe → "dangling subscribers"
2. **Unexpected updates:** Observer có thể nhận nhiều updates không liên quan
3. **Update storms:** Subject A notify Observer → Observer update Subject B → notify thêm observers → cascade
4. **Debug khó:** Khó trace ai notify ai khi có nhiều observers

## Tóm lại

```
Observer = Subject duy trì danh sách observer, notify tất cả khi state thay đổi
```

**Dùng Observer khi:**
- Thay đổi ở 1 object phải trigger updates ở nhiều object khác
- Không biết trước có bao nhiêu objects cần update
- Muốn loose coupling giữa các objects liên quan

---
**Tiếp theo:** State Pattern →
