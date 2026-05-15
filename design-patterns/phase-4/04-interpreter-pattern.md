# Bài 4: Interpreter Pattern

## Interpreter Pattern là gì?

Interpreter là một **Behavioral Design Pattern** định nghĩa một grammar (ngữ pháp) cho một ngôn ngữ và cung cấp interpreter để xử lý (interpret) các câu lệnh theo grammar đó.

**Ý tưởng cốt lõi:** Biểu diễn grammar thành class hierarchy. Mỗi rule trong grammar tương ứng với một class. Parse expression → build Abstract Syntax Tree → interpret tree.

**Ví dụ thực tế:**
- SQL query parser
- Regular expression engine
- Template engine (Thymeleaf, Velocity)
- Math expression evaluator
- Configuration file parser
- `java.util.regex.Pattern`

## UML Cấu trúc

```
Client ──────> AbstractExpression (interface)
                    |  + interpret(Context)
                    |
         ┌──────────┴──────────┐
         ↓                     ↓
  TerminalExpression      NonTerminalExpression
  (leaf - no sub-         (contains sub-expressions)
   expressions)           + left: Expression
                          + right: Expression
                          + interpret(ctx) {
                              left.interpret(ctx)
                              right.interpret(ctx)
                            }
```

## Ví dụ: Boolean Expression Evaluator

```java
// Context - môi trường chứa biến
public class ExpressionContext {
    private final Map<String, Boolean> variables = new HashMap<>();
    
    public void setVariable(String name, boolean value) {
        variables.put(name, value);
    }
    
    public boolean getVariable(String name) {
        if (!variables.containsKey(name)) {
            throw new IllegalArgumentException("Undefined variable: " + name);
        }
        return variables.get(name);
    }
}

// Abstract Expression
public interface BooleanExpression {
    boolean interpret(ExpressionContext context);
}

// Terminal Expressions (leaves)
public class VariableExpression implements BooleanExpression {
    private final String name;
    
    public VariableExpression(String name) {
        this.name = name;
    }
    
    @Override
    public boolean interpret(ExpressionContext context) {
        return context.getVariable(name);
    }
    
    @Override public String toString() { return name; }
}

public class LiteralExpression implements BooleanExpression {
    private final boolean value;
    
    public LiteralExpression(boolean value) {
        this.value = value;
    }
    
    @Override
    public boolean interpret(ExpressionContext context) {
        return value;
    }
    
    @Override public String toString() { return String.valueOf(value); }
}

// Non-Terminal Expressions (branches)
public class AndExpression implements BooleanExpression {
    private final BooleanExpression left;
    private final BooleanExpression right;
    
    public AndExpression(BooleanExpression left, BooleanExpression right) {
        this.left = left;
        this.right = right;
    }
    
    @Override
    public boolean interpret(ExpressionContext context) {
        return left.interpret(context) && right.interpret(context);
    }
    
    @Override
    public String toString() {
        return "(" + left + " AND " + right + ")";
    }
}

public class OrExpression implements BooleanExpression {
    private final BooleanExpression left;
    private final BooleanExpression right;
    
    public OrExpression(BooleanExpression left, BooleanExpression right) {
        this.left = left;
        this.right = right;
    }
    
    @Override
    public boolean interpret(ExpressionContext context) {
        return left.interpret(context) || right.interpret(context);
    }
    
    @Override
    public String toString() {
        return "(" + left + " OR " + right + ")";
    }
}

public class NotExpression implements BooleanExpression {
    private final BooleanExpression expression;
    
    public NotExpression(BooleanExpression expression) {
        this.expression = expression;
    }
    
    @Override
    public boolean interpret(ExpressionContext context) {
        return !expression.interpret(context);
    }
    
    @Override
    public String toString() { return "NOT " + expression; }
}

// Client - build Abstract Syntax Tree và interpret
public class Main {
    public static void main(String[] args) {
        // Biểu thức: (A AND B) OR (NOT C)
        BooleanExpression expr = new OrExpression(
            new AndExpression(
                new VariableExpression("A"),
                new VariableExpression("B")
            ),
            new NotExpression(
                new VariableExpression("C")
            )
        );
        
        System.out.println("Expression: " + expr);
        // Expression: ((A AND B) OR NOT C)
        
        ExpressionContext context = new ExpressionContext();
        
        // Test case 1: A=true, B=true, C=false
        context.setVariable("A", true);
        context.setVariable("B", true);
        context.setVariable("C", false);
        System.out.println("A=T, B=T, C=F: " + expr.interpret(context)); // true
        
        // Test case 2: A=true, B=false, C=true
        context.setVariable("A", true);
        context.setVariable("B", false);
        context.setVariable("C", true);
        System.out.println("A=T, B=F, C=T: " + expr.interpret(context)); // false
    }
}
```

## Ví dụ: Math Expression Evaluator

```java
// Evaluate "(3 + 5) * 2"
public interface MathExpression {
    int evaluate();
}

// Terminals
public class NumberExpression implements MathExpression {
    private final int number;
    public NumberExpression(int n) { this.number = n; }
    @Override public int evaluate() { return number; }
}

// Non-terminals
public class AddExpression implements MathExpression {
    private final MathExpression left, right;
    public AddExpression(MathExpression l, MathExpression r) { left=l; right=r; }
    @Override public int evaluate() { return left.evaluate() + right.evaluate(); }
}

public class MultiplyExpression implements MathExpression {
    private final MathExpression left, right;
    public MultiplyExpression(MathExpression l, MathExpression r) { left=l; right=r; }
    @Override public int evaluate() { return left.evaluate() * right.evaluate(); }
}

// "(3 + 5) * 2"
MathExpression expr = new MultiplyExpression(
    new AddExpression(new NumberExpression(3), new NumberExpression(5)),
    new NumberExpression(2)
);
System.out.println(expr.evaluate()); // 16
```

## Ví dụ thực tế: Java Regex

```java
// java.util.regex.Pattern là Interpreter
Pattern pattern = Pattern.compile("\\d{3}-\\d{4}"); // compile grammar
Matcher matcher = pattern.matcher("Call 555-1234 now"); // context
if (matcher.find()) {
    System.out.println("Found: " + matcher.group()); // 555-1234
}

// Spring Expression Language (SpEL) là Interpreter
ExpressionParser parser = new SpelExpressionParser();
Expression exp = parser.parseExpression("'Hello World'.length()");
int length = (int) exp.getValue(); // 11
```

## Implementation Steps

```
1. Định nghĩa grammar (BNF notation)
   expression ::= literal | variable | and | or | not
   
2. Map mỗi rule → một class
   - literal → LiteralExpression
   - variable → VariableExpression
   - and → AndExpression (chứa 2 sub-expressions)
   - or → OrExpression (chứa 2 sub-expressions)
   - not → NotExpression (chứa 1 sub-expression)
   
3. Tạo Context class cho biến/state
4. Build AST (Abstract Syntax Tree) trong client
5. Gọi interpret(context) trên root
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Grammar size** | Grammar nhỏ (<10 rules): OK. Lớn hơn → dùng parser generator (ANTLR) |
| **Visitor kết hợp** | Dùng Visitor để thêm operations mà không sửa expression classes |
| **Iterator kết hợp** | Dùng Iterator để traverse AST |
| **Flyweight** | Terminal expressions giống nhau → có thể share |

## Pitfalls (Nhược điểm)

1. **Class explosion:** Mỗi grammar rule = 1 class → nhiều class khi grammar lớn
2. **Complex grammars:** Grammar phức tạp → khó maintain, nên dùng parser generator
3. **Performance:** Interpret từng node → chậm hơn compiled approach
4. **Maintenance:** Grammar thay đổi → phải sửa nhiều class

## Tóm lại

```
Interpreter = Grammar rules → class hierarchy → interpret AST
```

**Dùng Interpreter khi:**
- Grammar đơn giản (< 10 rules)
- Cần parse và evaluate custom language/expression
- Hiệu năng không phải ưu tiên hàng đầu

**Không dùng khi:**
- Grammar phức tạp → dùng ANTLR, JavaCC, hoặc parser combinator
- Cần hiệu năng cao

---
**Tiếp theo:** Mediator Pattern →
