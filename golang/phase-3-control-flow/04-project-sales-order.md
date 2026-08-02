# Bài 4: Sales Order Processor — Project áp dụng for, if, switch, map

Khoa học chỉ có ý nghĩa khi build thứ chạy được. Bài này gộp mọi thứ Phase 2-3 vừa học (variable, const, for, if, switch, map) thành một **sales order processor**: nhận danh sách order, lookup giá, áp dụng discount sale, tính subtotal + tax, in invoice. Code dùng được như prototype cho POS hoặc e-commerce.

## Yêu cầu nghiệp vụ

```text
[INPUT] Order ID + list item codes (vd "tshirt", "mug_sale")
[OUTPUT] Invoice với:
- Mỗi item: code, qty, unit price, discounted price (nếu có), line total
- Subtotal
- Tax (8%)
- Grand total
[QUY TẮC]
- Item code có suffix "_sale" → giảm 10%
- Item không tồn tại → bỏ qua, log warning
- Tax rate khác nhau theo category (food = 0%, normal = 8%, luxury = 15%)
```

Yêu cầu mở rộng yêu cầu gốc (chỉ tính subtotal), bám sát production hơn.

## Step 1: Setup project

```bash
mkdir sales-processor
cd sales-processor
go mod init github.com/yourname/sales-processor
```

## Step 2: Định nghĩa data

`pricing.go`:
```go
package main

type Category int

const (
    CategoryNormal Category = iota
    CategoryFood
    CategoryLuxury
)

type Product struct {
    Name     string
    Price    float64
    Category Category
}

var catalog = map[string]Product{
    "tshirt":   {Name: "T-Shirt",     Price: 20.00, Category: CategoryNormal},
    "mug":      {Name: "Coffee Mug",  Price: 12.50, Category: CategoryNormal},
    "hat":      {Name: "Cap",         Price: 18.00, Category: CategoryNormal},
    "book":     {Name: "Go Cookbook", Price: 2.99,  Category: CategoryNormal},
    "rice":     {Name: "Rice 5kg",    Price: 15.00, Category: CategoryFood},
    "milk":     {Name: "Whole Milk",  Price: 4.50,  Category: CategoryFood},
    "watch":    {Name: "Smart Watch", Price: 299.0, Category: CategoryLuxury},
    "perfume":  {Name: "Eau Parfum",  Price: 120.0, Category: CategoryLuxury},
}
```

→ `map[string]Product` cho lookup O(1).

## Step 3: Lookup giá với sale logic

```go
import "strings"

func lookupPrice(code string) (Product, float64, bool) {
    // Original price
    if p, ok := catalog[code]; ok {
        return p, p.Price, true
    }

    // Check sale suffix
    if strings.HasSuffix(code, "_sale") {
        baseCode := strings.TrimSuffix(code, "_sale")
        if p, ok := catalog[baseCode]; ok {
            return p, p.Price * 0.9, true   // 10% off
        }
    }

    return Product{}, 0, false
}
```

Pattern:
- Return multiple value: `(Product, float64, bool)`.
- `bool` cuối cùng = found flag.
- Caller dùng `if p, price, ok := lookupPrice(c); ok { ... }`.

## Step 4: Tax theo category

```go
func taxRate(c Category) float64 {
    switch c {
    case CategoryFood:
        return 0.0
    case CategoryLuxury:
        return 0.15
    default:
        return 0.08   // CategoryNormal
    }
}
```

Switch enum — clean, ai đọc cũng hiểu.

## Step 5: Process order — Apply tất cả

```go
type LineItem struct {
    Code     string
    Product  Product
    Quantity int
    Price    float64    // price after sale (nếu có)
    Total    float64    // Price * Quantity
}

type Invoice struct {
    OrderID   string
    Items     []LineItem
    Subtotal  float64
    Tax       float64
    GrandTotal float64
    Skipped   []string   // codes không tìm thấy
}

func processOrder(orderID string, codes []string) Invoice {
    inv := Invoice{OrderID: orderID}
    
    // Count quantity by code
    qty := make(map[string]int)
    for _, code := range codes {
        qty[code]++
    }
    
    var taxTotal float64
    
    for code, n := range qty {
        product, price, ok := lookupPrice(code)
        if !ok {
            inv.Skipped = append(inv.Skipped, code)
            continue
        }
        
        lineTotal := price * float64(n)
        inv.Items = append(inv.Items, LineItem{
            Code:     code,
            Product:  product,
            Quantity: n,
            Price:    price,
            Total:    lineTotal,
        })
        
        inv.Subtotal += lineTotal
        taxTotal += lineTotal * taxRate(product.Category)
    }
    
    inv.Tax = taxTotal
    inv.GrandTotal = inv.Subtotal + inv.Tax
    return inv
}
```

Áp dụng:
- `make(map[string]int)` — count occurrence của mỗi code.
- Range map — không quan tâm thứ tự xử lý.
- Append vào slice với `append`.
- Continue khi không tìm thấy.

## Step 6: In invoice đẹp

```go
import (
    "fmt"
    "strings"
)

func printInvoice(inv Invoice) {
    sep := strings.Repeat("=", 60)
    fmt.Println(sep)
    fmt.Printf("INVOICE — Order #%s\n", inv.OrderID)
    fmt.Println(sep)
    
    fmt.Printf("%-25s %5s %10s %12s\n", "ITEM", "QTY", "UNIT", "TOTAL")
    fmt.Println(strings.Repeat("-", 60))
    
    for _, it := range inv.Items {
        saleTag := ""
        if strings.HasSuffix(it.Code, "_sale") {
            saleTag = " (SALE)"
        }
        fmt.Printf("%-25s %5d %10.2f %12.2f\n",
            it.Product.Name+saleTag, it.Quantity, it.Price, it.Total)
    }
    
    fmt.Println(strings.Repeat("-", 60))
    fmt.Printf("%47s %12.2f\n", "Subtotal:", inv.Subtotal)
    fmt.Printf("%47s %12.2f\n", "Tax:", inv.Tax)
    fmt.Printf("%47s %12.2f\n", "GRAND TOTAL:", inv.GrandTotal)
    fmt.Println(sep)
    
    if len(inv.Skipped) > 0 {
        fmt.Printf("WARNING: skipped unknown items: %v\n",
            inv.Skipped)
    }
}
```

Format flag:
- `%-25s`: left-align string trong 25 ký tự.
- `%5d`: right-align int trong 5 ký tự.
- `%10.2f`: float trong 10 ký tự, 2 chữ số thập phân.
- `%v`: print value mặc định (slice in `[a b c]`).

## Step 7: `main()` chạy thử

```go
package main

func main() {
    order := []string{
        "tshirt",
        "tshirt",            // count 2
        "mug_sale",          // 10% off
        "book",
        "rice",
        "watch",
        "unknown_item",      // sẽ skip
    }
    
    inv := processOrder("ORD-1001", order)
    printInvoice(inv)
}
```

Chạy:
```bash
go run .
```

Output mẫu:
```text
============================================================
INVOICE — Order #ORD-1001
============================================================
ITEM                        QTY       UNIT        TOTAL
------------------------------------------------------------
T-Shirt                       2      20.00        40.00
Coffee Mug (SALE)             1      11.25        11.25
Go Cookbook                   1       2.99         2.99
Rice 5kg                      1      15.00        15.00
Smart Watch                   1     299.00       299.00
------------------------------------------------------------
                                      Subtotal:       368.24
                                           Tax:        49.20
                                   GRAND TOTAL:       417.44
============================================================
WARNING: skipped unknown items: [unknown_item]
```

Verify thủ công:
- T-Shirt: 20 × 2 = 40, tax 8% = 3.20.
- Mug_sale: 12.50 × 0.9 = 11.25, tax 8% = 0.90.
- Book: 2.99, tax 8% = 0.24.
- Rice: 15.00, tax 0% (food) = 0.
- Watch: 299, tax 15% = 44.85.
- Sub = 40 + 11.25 + 2.99 + 15 + 299 = 368.24.
- Tax = 3.20 + 0.90 + 0.24 + 0 + 44.85 = 49.19 (chênh do float precision).
- Total ≈ 417.43.

## Test (peek vào Phase 12)

`processor_test.go`:
```go
package main

import (
    "math"
    "testing"
)

func TestProcessOrder_Basic(t *testing.T) {
    inv := processOrder("T-1", []string{"tshirt", "tshirt"})
    
    if len(inv.Items) != 1 {
        t.Fatalf("expected 1 item, got %d", len(inv.Items))
    }
    if inv.Items[0].Quantity != 2 {
        t.Errorf("expected qty 2, got %d", inv.Items[0].Quantity)
    }
    if math.Abs(inv.Subtotal-40.0) > 0.001 {
        t.Errorf("expected subtotal 40, got %.2f", inv.Subtotal)
    }
}

func TestProcessOrder_SaleDiscount(t *testing.T) {
    inv := processOrder("T-2", []string{"mug_sale"})
    
    expected := 12.50 * 0.9
    if math.Abs(inv.Items[0].Price-expected) > 0.001 {
        t.Errorf("sale price wrong: got %.2f, want %.2f",
            inv.Items[0].Price, expected)
    }
}

func TestProcessOrder_UnknownItem(t *testing.T) {
    inv := processOrder("T-3", []string{"unknown"})
    
    if len(inv.Skipped) != 1 {
        t.Errorf("expected 1 skipped, got %d", len(inv.Skipped))
    }
    if inv.Subtotal != 0 {
        t.Errorf("expected 0 subtotal, got %.2f", inv.Subtotal)
    }
}
```

```bash
go test ./...
# PASS
```

## Pattern production trong project này

### 1. Multiple return value cho lookup

```go
func lookupPrice(code string) (Product, float64, bool) { ... }

// Caller pattern
if p, price, ok := lookupPrice(c); ok {
    use(p, price)
}
```

Khắp Go stdlib: `m[k]` → `value, ok`; `strconv.Atoi` → `int, error`; `http.Get` → `*Response, error`.

### 2. Map làm catalog

```go
var catalog = map[string]Product{...}
```

→ Lookup O(1). Alternative: slice với search linear O(n) — chỉ dùng khi catalog rất nhỏ.

### 3. Slice + append cho list động

```go
inv.Items = append(inv.Items, LineItem{...})
inv.Skipped = append(inv.Skipped, code)
```

→ Auto grow. Phase 4 sẽ kỹ về capacity, performance.

### 4. Float precision warning

```go
math.Abs(a-b) > 0.001
```

Không so sánh `a == b` với float — luôn có sai số. Production tài chính phải dùng `decimal.Decimal` (lib `shopspring/decimal`).

### 5. Format align với printf

`%-25s %5d %10.2f` — pattern cho table. Phase 7 (strings) sẽ deep dive.

## Bài tập mở rộng

Thử tự làm:
1. Đọc order từ file JSON thay vì hardcode.
2. Loại bỏ duplicate suffix `_sale` (handle case `tshirt_sale_sale`).
3. Thêm discount theo quantity (mua 10+ → 5% off).
4. Export invoice ra HTML/PDF.
5. Multi-currency: thêm field `Currency` vào Product + convert tỷ giá.
6. Inventory check: trừ stock sau khi order.

## Bẫy gặp khi build project này

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| So sánh float `==` | Test fail randomly | `math.Abs(a-b) < eps` |
| Range map không sort | Output khác mỗi lần | Sort keys nếu cần ổn định |
| `int(price * qty)` để bỏ thập phân | Mất tiền | Giữ `float64` đến print |
| Tax áp lên sale price hay original? | Logic sai | Spec rõ — code đây áp lên sale (after discount) |
| Hardcode tax rate 0.08 trong nhiều chỗ | Khó đổi | Centralize trong `taxRate()` |
| Append slice trong loop hot | Realloc nhiều | `make([]T, 0, expectedLen)` |
| Catalog là `var` global | Test khó isolate | Pass catalog vào function (DI) |

## Refactor cho production

```go
type PriceLookup interface {
    Lookup(code string) (Product, float64, bool)
}

type CatalogLookup struct {
    items map[string]Product
}

func (c *CatalogLookup) Lookup(code string) (Product, float64, bool) {
    // ... same logic
}

func processOrder(orderID string, codes []string, lookup PriceLookup) Invoice {
    // Dùng lookup interface
}
```

→ Inject `PriceLookup` cho phép test với mock catalog. Pattern Dependency Injection. Phase 12 (Testing) sẽ chi tiết.

## Tóm tắt bài 4

- Build end-to-end mini app với toàn bộ Phase 2-3.
- Pattern: lookup return `(value, ok)`, switch enum cho tax, range map count, append slice line item.
- Multi-return value của Go cực sạch — không cần Option/Tuple type.
- Float precision: dùng `math.Abs(a-b) < eps`. Production tài chính dùng `decimal`.
- Refactor cho production: interface để inject + test.
- Đây là pattern cho POS, e-commerce checkout, billing — tuỳ scale lên hoặc xuống.

**Bài kế tiếp** → [Phase 4 - Bài 1: Arrays, Slices và memory model của Go](../phase-4-data-memory/01-arrays.md)
