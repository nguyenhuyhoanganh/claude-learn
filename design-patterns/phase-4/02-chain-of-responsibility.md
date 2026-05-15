# Bài 2: Chain of Responsibility Pattern

## Chain of Responsibility là gì?

Chain of Responsibility (CoR) là một **Behavioral Design Pattern** cho phép truyền request qua một chuỗi các handler. Mỗi handler quyết định xử lý request hay truyền cho handler tiếp theo.

**Ý tưởng cốt lõi:** Request đi qua từng handler theo thứ tự. Handler có thể xử lý hoặc bỏ qua (chuyển tiếp).

**Ví dụ thực tế:**
- Middleware trong web framework (authentication → logging → rate limiting → handler)
- Xử lý đơn xin nghỉ phép (team lead → manager → director)
- Exception handling trong Java (catch blocks)
- Event bubbling trong HTML DOM

## UML Cấu trúc

```
Client ──────> Handler (abstract/interface)
                   |  + handle(request)
                   |  - next: Handler
                   |
         ┌─────────┴──────────────────┐
         ↓                            ↓
  ConcreteHandler1             ConcreteHandler2
  + handle(request) {          + handle(request) {
      if (canHandle(req))          if (canHandle(req))
          doHandle(req)                doHandle(req)
      else                        else
          next.handle(req)             next.handle(req)
    }                             }
```

## Implement Chain of Responsibility

```java
// Handler abstract base class
public abstract class LeaveRequestHandler {
    private LeaveRequestHandler next;
    
    // Builder-style setter để chain handlers
    public LeaveRequestHandler setNext(LeaveRequestHandler next) {
        this.next = next;
        return next; // cho phép chain: a.setNext(b).setNext(c)
    }
    
    // Template method - subclass quyết định xử lý hay không
    public final void handle(LeaveRequest request) {
        if (canHandle(request)) {
            processRequest(request);
        } else if (next != null) {
            next.handle(request);
        } else {
            System.out.println("Request denied: no handler available for " + 
                request.getDays() + " days");
        }
    }
    
    protected abstract boolean canHandle(LeaveRequest request);
    protected abstract void processRequest(LeaveRequest request);
}

// Request object
public class LeaveRequest {
    private final String employeeName;
    private final int days;
    private final String reason;
    
    public LeaveRequest(String employeeName, int days, String reason) {
        this.employeeName = employeeName;
        this.days = days;
        this.reason = reason;
    }
    
    public String getEmployeeName() { return employeeName; }
    public int getDays() { return days; }
    public String getReason() { return reason; }
}

// Concrete Handler 1 - Team Lead (tối đa 3 ngày)
public class TeamLeadHandler extends LeaveRequestHandler {
    private final String teamLeadName;
    
    public TeamLeadHandler(String name) {
        this.teamLeadName = name;
    }
    
    @Override
    protected boolean canHandle(LeaveRequest request) {
        return request.getDays() <= 3;
    }
    
    @Override
    protected void processRequest(LeaveRequest request) {
        System.out.printf("Team Lead %s approved %s's %d-day leave%n",
            teamLeadName, request.getEmployeeName(), request.getDays());
    }
}

// Concrete Handler 2 - Manager (4-7 ngày)
public class ManagerHandler extends LeaveRequestHandler {
    private final String managerName;
    
    public ManagerHandler(String name) {
        this.managerName = name;
    }
    
    @Override
    protected boolean canHandle(LeaveRequest request) {
        return request.getDays() <= 7;
    }
    
    @Override
    protected void processRequest(LeaveRequest request) {
        System.out.printf("Manager %s approved %s's %d-day leave%n",
            managerName, request.getEmployeeName(), request.getDays());
    }
}

// Concrete Handler 3 - Director (8-30 ngày)
public class DirectorHandler extends LeaveRequestHandler {
    @Override
    protected boolean canHandle(LeaveRequest request) {
        return request.getDays() <= 30;
    }
    
    @Override
    protected void processRequest(LeaveRequest request) {
        System.out.printf("Director approved %s's %d-day leave%n",
            request.getEmployeeName(), request.getDays());
    }
}

// Client - tạo chain và gửi request
public class LeaveSystem {
    public static void main(String[] args) {
        // Tạo handlers
        TeamLeadHandler teamLead = new TeamLeadHandler("Alice");
        ManagerHandler manager = new ManagerHandler("Bob");
        DirectorHandler director = new DirectorHandler();
        
        // Xây dựng chain: teamLead → manager → director
        teamLead.setNext(manager).setNext(director);
        
        // Gửi requests
        LeaveRequest r1 = new LeaveRequest("John", 2, "Vacation");
        teamLead.handle(r1);
        // Team Lead Alice approved John's 2-day leave
        
        LeaveRequest r2 = new LeaveRequest("Jane", 5, "Medical");
        teamLead.handle(r2);
        // Manager Bob approved Jane's 5-day leave
        
        LeaveRequest r3 = new LeaveRequest("Mike", 20, "Sabbatical");
        teamLead.handle(r3);
        // Director approved Mike's 20-day leave
        
        LeaveRequest r4 = new LeaveRequest("Carol", 60, "Long leave");
        teamLead.handle(r4);
        // Request denied: no handler available for 60 days
    }
}
```

## Ví dụ thực tế: Java Exception Handling

```java
// Exception handling là Chain of Responsibility
try {
    riskyOperation();
} catch (FileNotFoundException e) { // Handler 1 - cụ thể nhất
    System.out.println("File not found: " + e.getMessage());
} catch (IOException e) {           // Handler 2 - rộng hơn
    System.out.println("IO error: " + e.getMessage());
} catch (Exception e) {             // Handler 3 - general nhất
    System.out.println("Unexpected error: " + e.getMessage());
}
// Nếu không catch được → propagate lên caller (chain tiếp tục)
```

## Ví dụ thực tế: Servlet Filter Chain

```java
// Java Servlet Filters là CoR
public class AuthenticationFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) 
            throws IOException, ServletException {
        if (!isAuthenticated(req)) {
            ((HttpServletResponse) res).sendError(401);
            return; // stop chain
        }
        chain.doFilter(req, res); // pass to next filter
    }
}

// Spring Security cũng là chuỗi Security Filters
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Request không được xử lý** | Phải quyết định: throw exception hay silently drop |
| **Thứ tự chain** | Thứ tự handler quan trọng - cụ thể nhất trước |
| **Performance** | Chain dài → nhiều checks → cân nhắc |
| **Terminate chain** | Handler có thể dừng chain sau khi xử lý hoặc không |

## So sánh CoR vs Command

| | CoR | Command |
|--|-----|---------|
| **Handler** | Nhiều handler, mỗi cái có thể xử lý | Một handler cụ thể |
| **Request** | Được truyền dọc chain | Đến đúng handler |
| **Kết quả** | Không biết ai xử lý | Biết rõ ai xử lý |
| **Dùng khi** | Validation, filtering, multiple handlers | Encapsulate operation |

## Pitfalls (Nhược điểm)

1. **Request bị bỏ qua:** Nếu chain không được cấu hình đúng → request "rơi vào khoảng trống"
2. **Khó debug:** Khó biết request được xử lý ở đâu
3. **Circular chain:** Nếu cấu hình sai → infinite loop
4. **Performance:** Chain dài với nhiều check condition

## Tóm lại

```
CoR = Request đi qua chuỗi handler, mỗi handler xử lý hoặc truyền tiếp
```

**Dùng CoR khi:**
- Nhiều đối tượng có thể xử lý request, không biết trước cái nào
- Muốn gửi request đến nhiều handler mà không coupling sender-receiver
- Tập hợp handlers có thể thay đổi lúc runtime

---
**Tiếp theo:** Command Pattern →
