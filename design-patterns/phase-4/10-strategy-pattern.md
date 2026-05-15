# Bài 10: Strategy Pattern

## Strategy Pattern là gì?

Strategy là một **Behavioral Design Pattern** định nghĩa một họ (family) các algorithm, đóng gói từng cái, và làm chúng có thể hoán đổi (interchangeable) lẫn nhau. Strategy cho phép thay đổi algorithm độc lập với client sử dụng nó.

**Ý tưởng cốt lõi:** Tách algorithm ra khỏi context object. Client có thể chọn hoặc đổi algorithm lúc runtime mà không cần sửa context.

**Ví dụ thực tế:**
- Sorting: QuickSort, MergeSort, BubbleSort (cùng API, khác algorithm)
- Payment: CreditCard, PayPal, Crypto
- Compression: ZIP, GZIP, BZIP2
- Validation strategy
- `java.util.Comparator`

## UML Cấu trúc

```
Context ─────────> Strategy (interface)
- strategy: Strategy    |  + execute(data)
+ setStrategy(s)        |
+ doSomething()         ↑
  → strategy.execute()  |
                 ┌──────┴──────────────┐
                 ↓                     ↓
          ConcreteStrategyA    ConcreteStrategyB
          + execute(data)      + execute(data)
          (Algorithm A)        (Algorithm B)
```

## Implement Strategy Pattern

```java
// Strategy interface
public interface SortStrategy {
    <T extends Comparable<T>> void sort(List<T> list);
    String getName();
}

// Context
public class DataSorter {
    private SortStrategy strategy;
    
    public DataSorter(SortStrategy strategy) {
        this.strategy = strategy;
    }
    
    // Đổi strategy lúc runtime
    public void setStrategy(SortStrategy strategy) {
        this.strategy = strategy;
        System.out.println("Switched to: " + strategy.getName());
    }
    
    public <T extends Comparable<T>> void sort(List<T> list) {
        System.out.println("Sorting with: " + strategy.getName());
        strategy.sort(list);
    }
}

// Concrete Strategy 1 - Bubble Sort
public class BubbleSortStrategy implements SortStrategy {
    @Override
    public <T extends Comparable<T>> void sort(List<T> list) {
        int n = list.size();
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (list.get(j).compareTo(list.get(j + 1)) > 0) {
                    T temp = list.get(j);
                    list.set(j, list.get(j + 1));
                    list.set(j + 1, temp);
                }
            }
        }
    }
    
    @Override public String getName() { return "BubbleSort"; }
}

// Concrete Strategy 2 - Quick Sort (simplified)
public class QuickSortStrategy implements SortStrategy {
    @Override
    public <T extends Comparable<T>> void sort(List<T> list) {
        if (list.size() <= 1) return;
        quickSort(list, 0, list.size() - 1);
    }
    
    private <T extends Comparable<T>> void quickSort(List<T> list, int low, int high) {
        if (low < high) {
            int pivot = partition(list, low, high);
            quickSort(list, low, pivot - 1);
            quickSort(list, pivot + 1, high);
        }
    }
    
    private <T extends Comparable<T>> int partition(List<T> list, int low, int high) {
        T pivot = list.get(high);
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (list.get(j).compareTo(pivot) <= 0) {
                i++;
                T temp = list.get(i);
                list.set(i, list.get(j));
                list.set(j, temp);
            }
        }
        T temp = list.get(i + 1);
        list.set(i + 1, list.get(high));
        list.set(high, temp);
        return i + 1;
    }
    
    @Override public String getName() { return "QuickSort"; }
}

// Concrete Strategy 3 - Built-in sort (delegate to Collections)
public class JavaBuiltInSortStrategy implements SortStrategy {
    @Override
    public <T extends Comparable<T>> void sort(List<T> list) {
        Collections.sort(list); // TimSort internally
    }
    
    @Override public String getName() { return "JavaBuiltIn(TimSort)"; }
}

// Client
public class Main {
    public static void main(String[] args) {
        List<Integer> data = new ArrayList<>(Arrays.asList(64, 34, 25, 12, 22, 11, 90));
        
        DataSorter sorter = new DataSorter(new BubbleSortStrategy());
        sorter.sort(data);
        System.out.println("Sorted: " + data);
        
        // Reset và thử strategy khác
        data = new ArrayList<>(Arrays.asList(64, 34, 25, 12, 22, 11, 90));
        sorter.setStrategy(new QuickSortStrategy()); // đổi strategy!
        sorter.sort(data);
        System.out.println("Sorted: " + data);
        
        // Dùng built-in (ưu tiên trong thực tế)
        data = new ArrayList<>(Arrays.asList(64, 34, 25, 12, 22, 11, 90));
        sorter.setStrategy(new JavaBuiltInSortStrategy());
        sorter.sort(data);
        System.out.println("Sorted: " + data);
    }
}
```

## Ví dụ thực tế: Payment Strategy

```java
// Strategy interface
public interface PaymentStrategy {
    boolean pay(double amount);
    String getPaymentMethodName();
}

// Concrete strategies
public class CreditCardPayment implements PaymentStrategy {
    private final String cardNumber;
    private final String cvv;
    
    public CreditCardPayment(String cardNumber, String cvv) {
        this.cardNumber = cardNumber;
        this.cvv = cvv;
    }
    
    @Override
    public boolean pay(double amount) {
        System.out.printf("Charging $%.2f to card ending %s%n", 
            amount, cardNumber.substring(cardNumber.length() - 4));
        return true; // assume success
    }
    
    @Override public String getPaymentMethodName() { return "Credit Card"; }
}

public class PayPalPayment implements PaymentStrategy {
    private final String email;
    
    public PayPalPayment(String email) { this.email = email; }
    
    @Override
    public boolean pay(double amount) {
        System.out.printf("PayPal charging $%.2f to %s%n", amount, email);
        return true;
    }
    
    @Override public String getPaymentMethodName() { return "PayPal"; }
}

// Context
public class ShoppingCart {
    private final List<Item> items = new ArrayList<>();
    private PaymentStrategy paymentStrategy;
    
    public void addItem(Item item) { items.add(item); }
    
    public void setPaymentStrategy(PaymentStrategy strategy) {
        this.paymentStrategy = strategy;
    }
    
    public boolean checkout() {
        if (paymentStrategy == null) throw new IllegalStateException("No payment method");
        double total = items.stream().mapToDouble(Item::getPrice).sum();
        System.out.printf("Checkout: $%.2f via %s%n", total, paymentStrategy.getPaymentMethodName());
        return paymentStrategy.pay(total);
    }
}

// Usage
ShoppingCart cart = new ShoppingCart();
cart.addItem(new Item("Book", 29.99));
cart.addItem(new Item("Pen", 4.99));

cart.setPaymentStrategy(new CreditCardPayment("4111111111111111", "123"));
cart.checkout();

// User đổi sang PayPal
cart.setPaymentStrategy(new PayPalPayment("user@example.com"));
cart.checkout();
```

## Ví dụ thực tế: Java Comparator

```java
// Comparator là Strategy pattern
List<Employee> employees = getEmployees();

// Strategy 1: sort by salary
employees.sort(Comparator.comparingDouble(Employee::getSalary));

// Strategy 2: sort by name
employees.sort(Comparator.comparing(Employee::getName));

// Strategy 3: complex - by department, then salary descending
employees.sort(Comparator.comparing(Employee::getDepartment)
    .thenComparing(Comparator.comparingDouble(Employee::getSalary).reversed()));

// Strategy được tạo inline với lambda
Comparator<String> byLength = (s1, s2) -> s1.length() - s2.length();
List<String> names = Arrays.asList("Charlie", "Alice", "Bob");
names.sort(byLength);
System.out.println(names); // [Bob, Alice, Charlie]
```

## Strategy với Lambda (Java 8+)

```java
// Không cần class riêng nếu strategy đơn giản
public class DataProcessor {
    private Function<List<Integer>, List<Integer>> sortStrategy;
    
    public DataProcessor(Function<List<Integer>, List<Integer>> strategy) {
        this.sortStrategy = strategy;
    }
    
    public List<Integer> process(List<Integer> data) {
        return sortStrategy.apply(data);
    }
}

// Sử dụng lambda thay vì class
DataProcessor ascending = new DataProcessor(list -> {
    List<Integer> sorted = new ArrayList<>(list);
    Collections.sort(sorted);
    return sorted;
});

DataProcessor descending = new DataProcessor(list -> {
    List<Integer> sorted = new ArrayList<>(list);
    sorted.sort(Collections.reverseOrder());
    return sorted;
});
```

## So sánh Strategy vs Template Method

| | Strategy | Template Method |
|--|---------|----------------|
| **Cơ chế** | Composition (chứa strategy object) | Inheritance (extends base class) |
| **Linh hoạt** | Đổi algorithm lúc runtime | Cố định khi compile |
| **Algorithm** | Toàn bộ algorithm khác nhau | Skeleton giống nhau, vài steps khác |
| **Khi dùng** | Cần đổi algorithm động | Subclasses chỉ khác một vài bước |

## Pitfalls (Nhược điểm)

1. **Over-engineering:** Nếu chỉ có 1-2 algorithm và không đổi → không cần Strategy
2. **Client awareness:** Client phải biết về sự khác biệt giữa các strategies để chọn đúng
3. **Communication overhead:** Context phải pass data vào strategy → interface coupling

## Tóm lại

```
Strategy = Encapsulate algorithm trong object, client chọn và đổi algorithm lúc runtime
```

**Dùng Strategy khi:**
- Cần đổi algorithm lúc runtime
- Nhiều variants của cùng một operation
- Muốn loại bỏ conditional logic phức tạp chọn algorithm

---
**Tiếp theo:** Template Method Pattern →
