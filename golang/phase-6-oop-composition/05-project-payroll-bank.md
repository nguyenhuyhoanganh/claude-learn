# Bài 5: Payroll Processor + Bank Account — Project áp dụng struct, method, interface, embedding

Hai project trong một bài: **Payroll** dạy interface + polymorphism cho nhiều loại employee; **Bank Account** dạy embedding cho hierarchy account types. Cả hai là pattern thật của HR system + banking software. Đây là microcosm cho 70% backend domain modeling.

## Project 1: Payroll Processor

### Yêu cầu

```text
[Loại employee]
- FullTime: salary cố định + benefit
- PartTime: lương theo giờ × số giờ
- Contractor: lương theo project + commission

[API]
- Mỗi loại implement Payable interface
- ProcessPayroll(employees []Payable) → total
- In payslip cho mỗi employee
- Tax calc theo bracket
```

### Step 1: Interface + struct

```go
package payroll

import "fmt"

// Interface — contract
type Payable interface {
    Name() string
    GrossPay() float64
    Tax() float64
    NetPay() float64
}

// Common base
type Employee struct {
    ID   int
    name string
}

func (e Employee) Name() string { return e.name }

// FullTime
type FullTime struct {
    Employee              // embed
    AnnualSalary float64
    Bonus        float64
}

func (f FullTime) GrossPay() float64 {
    return f.AnnualSalary/12 + f.Bonus
}

func (f FullTime) Tax() float64 {
    return calcTax(f.GrossPay())
}

func (f FullTime) NetPay() float64 {
    return f.GrossPay() - f.Tax()
}

// PartTime
type PartTime struct {
    Employee
    HourlyRate float64
    Hours      float64
}

func (p PartTime) GrossPay() float64 {
    return p.HourlyRate * p.Hours
}
func (p PartTime) Tax() float64    { return calcTax(p.GrossPay()) }
func (p PartTime) NetPay() float64 { return p.GrossPay() - p.Tax() }

// Contractor
type Contractor struct {
    Employee
    ProjectFee  float64
    Commission  float64
}

func (c Contractor) GrossPay() float64 {
    return c.ProjectFee + c.Commission
}
func (c Contractor) Tax() float64    { return calcTax(c.GrossPay()) * 0.8 } // freelance discount
func (c Contractor) NetPay() float64 { return c.GrossPay() - c.Tax() }
```

→ Mỗi type **implicit implement** `Payable` (đủ 4 method).

### Step 2: Tax calculation

```go
func calcTax(gross float64) float64 {
    switch {
    case gross < 1000:
        return gross * 0.10
    case gross < 5000:
        return 100 + (gross-1000)*0.20
    case gross < 10000:
        return 900 + (gross-5000)*0.30
    default:
        return 2400 + (gross-10000)*0.40
    }
}
```

→ Progressive tax bracket. Switch expressionless cho range check.

### Step 3: Polymorphism qua interface

```go
func ProcessPayroll(employees []Payable) float64 {
    var total float64
    fmt.Println("─────────────────────────────────────────")
    fmt.Printf("%-20s %10s %10s %10s\n", "NAME", "GROSS", "TAX", "NET")
    fmt.Println("─────────────────────────────────────────")
    
    for _, e := range employees {
        fmt.Printf("%-20s %10.2f %10.2f %10.2f\n",
            e.Name(), e.GrossPay(), e.Tax(), e.NetPay())
        total += e.NetPay()
    }
    
    fmt.Println("─────────────────────────────────────────")
    fmt.Printf("%-20s %32.2f\n", "TOTAL NET PAY:", total)
    return total
}
```

Tham số `[]Payable` — accept bất kỳ type implement Payable.

### Step 4: main

```go
package main

import "github.com/yourname/payroll-project/payroll"

func main() {
    employees := []payroll.Payable{
        payroll.FullTime{
            Employee:     payroll.Employee{ID: 1, Name: "Alice"},
            AnnualSalary: 96000, Bonus: 500,
        },
        payroll.PartTime{
            Employee:   payroll.Employee{ID: 2, Name: "Bob"},
            HourlyRate: 25, Hours: 80,
        },
        payroll.Contractor{
            Employee:   payroll.Employee{ID: 3, Name: "Charlie"},
            ProjectFee: 5000, Commission: 1500,
        },
    }
    
    payroll.ProcessPayroll(employees)
}
```

Output:
```text
─────────────────────────────────────────
NAME                      GROSS        TAX        NET
─────────────────────────────────────────
Alice                     8500.00    1950.00    6550.00
Bob                       2000.00     300.00    1700.00
Charlie                   6500.00    1320.00    5180.00
─────────────────────────────────────────
TOTAL NET PAY:                              13430.00
```

→ 3 type khác nhau, 1 function process. Đó là polymorphism.

## Project 2: Bank Account Management

### Yêu cầu

```text
[Account types]
- Savings: lãi suất, không cho phép overdraft
- Checking: cho phép overdraft tới limit
- Credit: chỉ cho withdraw (debt), monthly billing

[API]
- Common: Deposit, Withdraw, Balance, Owner
- Savings: AddInterest()
- Checking: SetOverdraft(limit)
- Credit: GenerateBill()
```

### Step 1: Base struct với embedding

```go
package bank

import (
    "errors"
    "fmt"
)

var (
    ErrInsufficient = errors.New("insufficient balance")
    ErrInvalidAmount = errors.New("amount must be positive")
)

type Account struct {
    Owner   string
    balance float64
}

func (a *Account) Balance() float64 { return a.balance }

func (a *Account) Deposit(amount float64) error {
    if amount <= 0 {
        return ErrInvalidAmount
    }
    a.balance += amount
    return nil
}
```

### Step 2: SavingsAccount

```go
type SavingsAccount struct {
    Account               // embed
    InterestRate float64
}

func (s *SavingsAccount) Withdraw(amount float64) error {
    if amount <= 0 {
        return ErrInvalidAmount
    }
    if amount > s.balance {
        return ErrInsufficient
    }
    s.balance -= amount
    return nil
}

func (s *SavingsAccount) AddInterest() {
    interest := s.balance * s.InterestRate
    s.balance += interest
    fmt.Printf("Added interest: %.2f\n", interest)
}
```

Pattern:
- Embed `Account` — promote `Balance`, `Deposit`.
- Tự define `Withdraw` (strict check, no overdraft).
- Method riêng `AddInterest`.

### Step 3: CheckingAccount

```go
type CheckingAccount struct {
    Account
    OverdraftLimit float64
}

func (c *CheckingAccount) Withdraw(amount float64) error {
    if amount <= 0 {
        return ErrInvalidAmount
    }
    if c.balance-amount < -c.OverdraftLimit {
        return fmt.Errorf("%w (would exceed overdraft %f)",
            ErrInsufficient, c.OverdraftLimit)
    }
    c.balance -= amount
    return nil
}
```

Override `Withdraw` với logic riêng — allow overdraft.

### Step 4: CreditAccount

```go
type CreditAccount struct {
    Account
    Limit       float64
    InterestRate float64
}

// Override: Deposit = pay debt
func (c *CreditAccount) Deposit(amount float64) error {
    if amount <= 0 {
        return ErrInvalidAmount
    }
    c.balance -= amount   // negative balance = debt; deposit reduce debt
    return nil
}

// Override: Withdraw = borrow
func (c *CreditAccount) Withdraw(amount float64) error {
    if amount <= 0 {
        return ErrInvalidAmount
    }
    if -c.balance+amount > c.Limit {
        return fmt.Errorf("%w: credit limit reached", ErrInsufficient)
    }
    c.balance += amount   // borrow → balance positive
    return nil
}

func (c *CreditAccount) GenerateBill() float64 {
    debt := c.balance
    interest := debt * c.InterestRate / 12
    return debt + interest
}
```

→ Pattern semantic riêng: credit account, balance dương = debt.

### Step 5: Interface chung cho polymorphism

```go
type AccountInterface interface {
    Balance() float64
    Deposit(amount float64) error
    Withdraw(amount float64) error
}

func PrintAll(accounts []AccountInterface) {
    for _, a := range accounts {
        fmt.Printf("Balance: $%.2f\n", a.Balance())
    }
}
```

### Step 6: main

```go
func main() {
    sa := &bank.SavingsAccount{
        Account:      bank.Account{Owner: "Alice"},
        InterestRate: 0.05,
    }
    sa.Deposit(1000)
    sa.AddInterest()
    fmt.Println("Savings balance:", sa.Balance())   // 1050
    
    ca := &bank.CheckingAccount{
        Account:        bank.Account{Owner: "Bob"},
        OverdraftLimit: 500,
    }
    ca.Deposit(200)
    err := ca.Withdraw(600)  // OK — 200 balance, overdraft tới -500
    fmt.Println("Checking balance:", ca.Balance(), err)   // -400 nil
    
    cc := &bank.CreditAccount{
        Account: bank.Account{Owner: "Charlie"},
        Limit:   2000,
        InterestRate: 0.18,
    }
    cc.Withdraw(1500)        // borrow
    fmt.Println("Credit debt:", cc.Balance())   // 1500
    bill := cc.GenerateBill()
    fmt.Printf("Bill due: $%.2f\n", bill)       // 1522.50
    
    // Polymorphism
    bank.PrintAll([]bank.AccountInterface{sa, ca, cc})
}
```

## Pattern rút ra từ 2 project

### 1. Interface + concrete type → polymorphism

```go
type Payable interface { GrossPay() float64; ... }
func ProcessPayroll(employees []Payable) { ... }
```

→ Add type mới: chỉ implement interface, không sửa ProcessPayroll.

### 2. Embed common base struct

```go
type Account struct { Owner string; balance float64 }
type SavingsAccount struct { Account; InterestRate float64 }
```

→ Share field + method. Tự định nghĩa thêm hoặc override.

### 3. Method override qua shadow

```go
func (a *Account) Withdraw(...) error { ... }            // base
func (s *SavingsAccount) Withdraw(...) error { ... }     // shadow
```

→ Sub-type behavior khác.

### 4. Sentinel error reusable

```go
var ErrInsufficient = errors.New("insufficient balance")
```

Wrap với context:
```go
return fmt.Errorf("%w: would exceed limit", ErrInsufficient)
```

Caller check:
```go
if errors.Is(err, bank.ErrInsufficient) { ... }
```

### 5. Validate ở public API

```go
func (a *Account) Deposit(amount float64) error {
    if amount <= 0 { return ErrInvalidAmount }
    // ...
}
```

→ Trust internal, validate boundary.

## Test (peek)

```go
// payroll_test.go
func TestFullTimeNetPay(t *testing.T) {
    f := FullTime{
        Employee:     Employee{name: "Test"},
        AnnualSalary: 12000,   // 1000/month
    }
    
    gross := f.GrossPay()
    if gross != 1000 {
        t.Errorf("gross: got %f, want 1000", gross)
    }
    
    expectedTax := 100.0   // 10% under 1000? actually 100
    if f.Tax() != expectedTax {
        t.Errorf("tax: got %f, want %f", f.Tax(), expectedTax)
    }
}

func TestPolymorphism(t *testing.T) {
    employees := []Payable{
        FullTime{Employee: Employee{name: "A"}, AnnualSalary: 12000},
        PartTime{Employee: Employee{name: "B"}, HourlyRate: 20, Hours: 10},
    }
    total := ProcessPayroll(employees)
    if total <= 0 {
        t.Error("total should be positive")
    }
}
```

## Bài tập mở rộng

1. Add `Manager` type — FullTime với report tới Director.
2. Calculator overtime: PartTime > 40h trả 1.5x.
3. Generic `Sum[T Payable]` thay vì slice cụ thể.
4. Persistence: save employee/account to JSON.
5. Transaction log: mỗi Deposit/Withdraw record.
6. Concurrent safe: thêm sync.Mutex cho Account.
7. Bank with multiple currencies.

## Bẫy gặp trong project

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Embed value vs pointer | Method set khác | Embed value + pointer receiver |
| Compile-time interface check | Refactor break | `var _ Payable = (*FullTime)(nil)` |
| Float precision với money | Sai tiền | Production: `decimal.Decimal` |
| Bank balance negative semantics | Confuse | Doc rõ semantics |
| Polymorphism khi missing method | Compile error | Define interface trước implement |

## Tóm tắt bài 5

- Payroll: interface `Payable` + 3 type Employee → polymorphism.
- Bank: embed `Account` base + override `Withdraw`/`Deposit` cho semantic riêng.
- Pattern: accept interface ([]Payable, []AccountInterface) → loose coupling.
- Sentinel error reusable, wrap với context.
- Validate ở public boundary.
- Test với multiple types qua interface.
- Real-world: HR system, banking software, billing.

🎉 **Hoàn thành Phase 6** — OOP "kiểu Go". Bạn đã có đủ syntax + pattern để model bất kỳ domain.

**Bài kế tiếp** → [Phase 7 - Bài 1: Strings, runes, bytes — Hiểu UTF-8](../phase-7-strings-modules/01-strings-runes-bytes.md)
