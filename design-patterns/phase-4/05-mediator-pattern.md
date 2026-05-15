# Bài 5: Mediator Pattern

## Mediator Pattern là gì?

Mediator là một **Behavioral Design Pattern** định nghĩa một object trung gian (mediator) để encapsulate cách các object trong một nhóm tương tác với nhau. Các object không giao tiếp trực tiếp mà thông qua mediator.

**Vấn đề không có Mediator:**

```
A ←→ B
↕  ✗ ↕
C ←→ D
```

N objects → N*(N-1)/2 connections. Thêm object mới → phải update tất cả.

**Với Mediator:**

```
A → Mediator ← B
    ↕
    C, D
```

Mỗi object chỉ biết về Mediator. Mediator điều phối tất cả.

**Ví dụ thực tế:**
- Chat room (mọi người giao tiếp qua server)
- Air traffic control (máy bay giao tiếp qua tower)
- UI form (các widget phối hợp qua controller)
- Spring MVC DispatcherServlet
- Event Bus trong Android/JavaFX

## UML Cấu trúc

```
Colleague ──────> Mediator (interface)
                      |  + notify(sender, event)
                      |
                      ↓
               ConcreteMediator
               - colleague1: Colleague
               - colleague2: Colleague
               + notify(sender, event) {
                   // điều phối reactions
                 }
```

## Ví dụ: UI Form Mediator

Khi checkbox "Register" được check → enable username/password fields. Khi unchecked → disable chúng.

```java
// Mediator interface
public interface UIMediator {
    void notify(UIComponent sender, String event);
}

// Colleague base class
public abstract class UIComponent {
    protected UIMediator mediator;
    
    public UIComponent(UIMediator mediator) {
        this.mediator = mediator;
    }
    
    protected void changed(String event) {
        mediator.notify(this, event); // thông báo cho mediator
    }
}

// Concrete Colleagues
public class Checkbox extends UIComponent {
    private boolean checked;
    
    public Checkbox(UIMediator mediator) {
        super(mediator);
    }
    
    public void setChecked(boolean checked) {
        this.checked = checked;
        System.out.println("Checkbox: " + (checked ? "checked" : "unchecked"));
        changed("checkbox_changed"); // notify mediator
    }
    
    public boolean isChecked() { return checked; }
}

public class TextField extends UIComponent {
    private String value = "";
    private boolean enabled = true;
    
    public TextField(UIMediator mediator) {
        super(mediator);
    }
    
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        System.out.println(getClass().getSimpleName() + 
            (enabled ? " enabled" : " disabled"));
    }
    
    public void setText(String value) {
        if (!enabled) {
            System.out.println("Cannot type - field is disabled");
            return;
        }
        this.value = value;
        changed("text_changed");
    }
    
    public boolean isEnabled() { return enabled; }
    public String getValue() { return value; }
}

public class SubmitButton extends UIComponent {
    private boolean enabled = false;
    
    public SubmitButton(UIMediator mediator) {
        super(mediator);
    }
    
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        System.out.println("Submit button: " + (enabled ? "enabled" : "disabled"));
    }
    
    public void click() {
        if (!enabled) {
            System.out.println("Button is disabled");
            return;
        }
        System.out.println("Form submitted!");
        changed("submit_clicked");
    }
}

// Concrete Mediator - tập trung tất cả logic điều phối
public class RegistrationFormMediator implements UIMediator {
    private Checkbox registerCheckbox;
    private TextField usernameField;
    private TextField passwordField;
    private SubmitButton submitButton;
    
    public void setComponents(Checkbox checkbox, TextField username, 
                               TextField password, SubmitButton submit) {
        this.registerCheckbox = checkbox;
        this.usernameField = username;
        this.passwordField = password;
        this.submitButton = submit;
        
        // Initial state: all disabled
        usernameField.setEnabled(false);
        passwordField.setEnabled(false);
        submitButton.setEnabled(false);
    }
    
    @Override
    public void notify(UIComponent sender, String event) {
        if (sender == registerCheckbox && event.equals("checkbox_changed")) {
            boolean checked = registerCheckbox.isChecked();
            usernameField.setEnabled(checked);
            passwordField.setEnabled(checked);
            // Submit chỉ enable khi checked và có data
            updateSubmitButton();
        } else if ((sender == usernameField || sender == passwordField) 
                   && event.equals("text_changed")) {
            updateSubmitButton();
        }
    }
    
    private void updateSubmitButton() {
        boolean hasData = !usernameField.getValue().isEmpty() 
                        && !passwordField.getValue().isEmpty();
        submitButton.setEnabled(registerCheckbox.isChecked() && hasData);
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        RegistrationFormMediator mediator = new RegistrationFormMediator();
        
        Checkbox checkbox = new Checkbox(mediator);
        TextField usernameField = new TextField(mediator);
        TextField passwordField = new TextField(mediator);
        SubmitButton submitButton = new SubmitButton(mediator);
        
        mediator.setComponents(checkbox, usernameField, passwordField, submitButton);
        
        System.out.println("\n--- User checks 'Register' ---");
        checkbox.setChecked(true);
        // TextField enabled, password enabled, submit disabled (no data yet)
        
        System.out.println("\n--- User types username ---");
        usernameField.setText("john_doe");
        // Submit still disabled (no password)
        
        System.out.println("\n--- User types password ---");
        passwordField.setText("secret123");
        // Submit now enabled!
        
        System.out.println("\n--- User clicks Submit ---");
        submitButton.click();
        
        System.out.println("\n--- User unchecks 'Register' ---");
        checkbox.setChecked(false);
        // Fields disabled, submit disabled
    }
}
```

## Ví dụ thực tế: Chat Room

```java
// Chat room là Mediator pattern kinh điển
public interface ChatMediator {
    void sendMessage(String message, ChatUser sender);
    void addUser(ChatUser user);
}

public class ChatRoom implements ChatMediator {
    private final List<ChatUser> users = new ArrayList<>();
    
    @Override
    public void addUser(ChatUser user) {
        users.add(user);
    }
    
    @Override
    public void sendMessage(String message, ChatUser sender) {
        users.stream()
            .filter(u -> u != sender) // không gửi lại cho người gửi
            .forEach(u -> u.receive(message, sender.getName()));
    }
}

public class ChatUser {
    private final String name;
    private final ChatMediator mediator;
    
    public ChatUser(String name, ChatMediator mediator) {
        this.name = name;
        this.mediator = mediator;
        mediator.addUser(this);
    }
    
    public void send(String message) {
        System.out.println(name + " sends: " + message);
        mediator.sendMessage(message, this);
    }
    
    public void receive(String message, String from) {
        System.out.printf("  [%s receives from %s]: %s%n", name, from, message);
    }
    
    public String getName() { return name; }
}

// Sử dụng
ChatRoom room = new ChatRoom();
ChatUser alice = new ChatUser("Alice", room);
ChatUser bob = new ChatUser("Bob", room);
ChatUser charlie = new ChatUser("Charlie", room);

alice.send("Hello everyone!");
// Bob receives from Alice: Hello everyone!
// Charlie receives from Alice: Hello everyone!
```

## So sánh Mediator vs Observer

| | Mediator | Observer |
|--|---------|---------|
| **Communication** | Nhiều-nhiều (M:M) | Một-nhiều (1:M) |
| **Direction** | Bidirectional | Unidirectional |
| **Coupling** | Objects biết về mediator | Observable không biết observers |
| **Control** | Mediator điều phối logic | Observable chỉ notify |
| **Dùng khi** | Objects cần phối hợp phức tạp | State change cần broadcast |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Mediator is hub** | Mediator biết tất cả colleagues → có thể trở thành "God object" |
| **Reusability** | Mediator thường tight-coupled với colleagues cụ thể → khó reuse |
| **Testability** | Dễ test từng colleague riêng lẻ vì không phụ thuộc nhau |

## Pitfalls (Nhược điểm)

1. **God object:** Mediator có thể trở nên quá phức tạp, chứa quá nhiều logic
2. **Single point of failure:** Mediator bị lỗi → toàn hệ thống giao tiếp bị ảnh hưởng
3. **Hard to reuse:** Mediator thường specific cho một group objects cụ thể
4. **Complexity:** Đôi khi trực tiếp communicate đơn giản hơn

## Tóm lại

```
Mediator = Object trung gian điều phối giao tiếp giữa các objects
```

**Dùng Mediator khi:**
- Nhiều objects cần giao tiếp theo cách phức tạp → tạo dependencies
- Muốn tái sử dụng một số components nhưng không thể vì chúng tightly coupled
- Có nhiều M:M relationships cần được đơn giản hóa

---
**Tiếp theo:** Iterator Pattern →
