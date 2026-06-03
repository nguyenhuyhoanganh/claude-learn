# Bài 5: Event-Driven với SQS, Watermill, Email worker

E-commerce có nhiều hành động "sau khi": user register → send welcome email; order placed → notify warehouse + email customer + update analytics. **Sync** trong handler = chậm + fragile. **Async event-driven** = scale + decouple. Bài này build pattern: event publisher trong API, queue qua SQS, worker consume + send email.

## Synchronous vs Event-Driven

```text
[Sync — không khuyên]
Handler.CreateOrder() {
    saveOrder()
    sendEmail()           ← 2s latency
    notifyWarehouse()     ← 1s
    updateAnalytics()     ← 500ms
}
→ Total 3.5s. Email fail → handler fail. Tight coupling.

[Event-Driven]
Handler.CreateOrder() {
    saveOrder()
    publish(OrderCreated{...})    ← 5ms
    return 201
}

Workers (separate process):
- EmailWorker.OnOrderCreated()
- WarehouseWorker.OnOrderCreated()
- AnalyticsWorker.OnOrderCreated()
→ Handler nhanh. Worker fail independent.
```

## Publisher interface

```go
// internal/events/publisher.go
package events

type Event interface {
    Type() string
}

type Publisher interface {
    Publish(ctx context.Context, event Event) error
}
```

Concrete event:
```go
type OrderCreated struct {
    OrderID    int       `json:"order_id"`
    UserID     int       `json:"user_id"`
    UserEmail  string    `json:"user_email"`
    Total      float64   `json:"total"`
    Items      []Item    `json:"items"`
    CreatedAt  time.Time `json:"created_at"`
}

func (e OrderCreated) Type() string { return "order.created" }

type UserRegistered struct {
    UserID    int       `json:"user_id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"created_at"`
}

func (e UserRegistered) Type() string { return "user.registered" }
```

## Watermill — Event-driven framework

```bash
go get github.com/ThreeDotsLabs/watermill
go get github.com/ThreeDotsLabs/watermill-aws/sqs
```

Watermill abstract: publisher + subscriber. Pluggable broker (Kafka, SQS, NATS, Redis, in-memory).

```go
import (
    "github.com/ThreeDotsLabs/watermill"
    "github.com/ThreeDotsLabs/watermill/message"
    wsqs "github.com/ThreeDotsLabs/watermill-aws/sqs"
)

type SQSPublisher struct {
    pub message.Publisher
    log watermill.LoggerAdapter
}

func NewSQSPublisher(cfg *aws.Config, log watermill.LoggerAdapter) (*SQSPublisher, error) {
    pub, err := wsqs.NewPublisher(wsqs.PublisherConfig{
        AWSConfig: *cfg,
    }, log)
    if err != nil {
        return nil, err
    }
    return &SQSPublisher{pub: pub, log: log}, nil
}

func (p *SQSPublisher) Publish(ctx context.Context, event Event) error {
    payload, err := json.Marshal(event)
    if err != nil {
        return fmt.Errorf("marshal event: %w", err)
    }
    
    msg := message.NewMessage(watermill.NewUUID(), payload)
    msg.Metadata.Set("type", event.Type())
    msg.Metadata.Set("published_at", time.Now().Format(time.RFC3339))
    
    return p.pub.Publish(event.Type(), msg)
}
```

## Sử dụng trong service

```go
type orderService struct {
    repo    OrderRepository
    cart    CartRepository
    events  events.Publisher
    log     *slog.Logger
}

func (s *orderService) Create(ctx context.Context, userID int, items []CartItem) (*Order, error) {
    order := &Order{
        UserID: userID,
        Items:  items,
        Status: "pending",
    }
    
    if err := s.repo.Create(ctx, order); err != nil {
        return nil, fmt.Errorf("create order: %w", err)
    }
    
    // Publish event (async)
    user, _ := s.users.GetByID(ctx, userID)
    err := s.events.Publish(ctx, events.OrderCreated{
        OrderID:   order.ID,
        UserID:    userID,
        UserEmail: user.Email,
        Total:     order.Total,
        Items:     order.Items,
        CreatedAt: order.CreatedAt,
    })
    if err != nil {
        // Không fail order — chỉ log
        s.log.Error("publish OrderCreated", "error", err, "order", order.ID)
    }
    
    return order, nil
}
```

**Pattern**: publish fail → log + retry async (outbox pattern). Không fail handler vì event publishing.

## Outbox pattern — Reliable event publishing

Naive publish: order save → DB commit → publish event. Crash giữa → event mất.

Outbox pattern:
```text
[Transaction]
1. INSERT INTO orders ...
2. INSERT INTO outbox_events (type, payload) VALUES ('order.created', '{...}')
COMMIT
↓
[Background poller]
3. SELECT * FROM outbox_events WHERE published = false
4. Publish to SQS
5. UPDATE outbox_events SET published = true
```

Code:
```go
func (s *orderService) Create(ctx context.Context, userID int, items []CartItem) (*Order, error) {
    tx, err := s.db.Beginx()
    if err != nil { return nil, err }
    defer tx.Rollback()
    
    order, err := s.repo.CreateTx(ctx, tx, &Order{UserID: userID, Items: items})
    if err != nil { return nil, err }
    
    // Save event vào outbox table cùng transaction
    payload, _ := json.Marshal(events.OrderCreated{...})
    _, err = tx.ExecContext(ctx, `
        INSERT INTO outbox_events (event_type, payload)
        VALUES ($1, $2)
    `, "order.created", payload)
    if err != nil { return nil, err }
    
    return order, tx.Commit()
}

// Background worker
func (w *OutboxPoller) Run(ctx context.Context) {
    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            w.poll(ctx)
        }
    }
}

func (w *OutboxPoller) poll(ctx context.Context) {
    var events []OutboxEvent
    w.db.Select(&events, `
        SELECT id, event_type, payload FROM outbox_events
        WHERE published = false LIMIT 100
    `)
    
    for _, e := range events {
        msg := message.NewMessage(watermill.NewUUID(), e.Payload)
        if err := w.pub.Publish(e.EventType, msg); err != nil {
            w.log.Error("publish", "error", err)
            continue
        }
        w.db.Exec("UPDATE outbox_events SET published = true WHERE id = $1", e.ID)
    }
}
```

→ Guarantee at-least-once delivery. Consumer phải idempotent (xử lý duplicate OK).

## Worker (subscriber) — Email service

```go
// cmd/worker/main.go
package main

func main() {
    cfg, _ := config.Load()
    log := logger.New(cfg.Env)
    
    sub, err := wsqs.NewSubscriber(wsqs.SubscriberConfig{
        AWSConfig: cfg.AWSConfig,
    }, watermill.NewSlogLogger(log))
    if err != nil { log.Error("sub", "err", err); os.Exit(1) }
    
    emailSvc := email.NewService(cfg.SMTPHost, cfg.SMTPPort,
        cfg.SMTPUser, cfg.SMTPPassword)
    
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()
    
    // Subscribe to topic
    msgs, err := sub.Subscribe(ctx, "order.created")
    if err != nil { log.Error("subscribe", "err", err); os.Exit(1) }
    
    for msg := range msgs {
        var evt events.OrderCreated
        if err := json.Unmarshal(msg.Payload, &evt); err != nil {
            log.Error("unmarshal", "err", err)
            msg.Ack()    // skip malformed
            continue
        }
        
        if err := emailSvc.SendOrderConfirmation(evt); err != nil {
            log.Error("send email", "err", err, "order", evt.OrderID)
            msg.Nack()    // re-deliver
            continue
        }
        
        log.Info("order email sent", "order", evt.OrderID)
        msg.Ack()
    }
}
```

Worker pattern:
- `msg.Ack()` — success, remove from queue.
- `msg.Nack()` — fail, re-deliver (with retry).
- SQS dead-letter queue cho message fail nhiều lần.

## Email service

```go
package email

import (
    "fmt"
    "net/smtp"
)

type Service struct {
    host, port string
    user, pass string
    from       string
}

func NewService(host string, port int, user, pass string) *Service {
    return &Service{
        host: host, port: fmt.Sprintf("%d", port),
        user: user, pass: pass, from: user,
    }
}

func (s *Service) Send(to, subject, body string) error {
    auth := smtp.PlainAuth("", s.user, s.pass, s.host)
    
    msg := []byte("To: " + to + "\r\n" +
        "From: " + s.from + "\r\n" +
        "Subject: " + subject + "\r\n" +
        "MIME-Version: 1.0\r\n" +
        "Content-Type: text/html; charset=UTF-8\r\n" +
        "\r\n" +
        body)
    
    return smtp.SendMail(s.host+":"+s.port, auth, s.from, []string{to}, msg)
}

func (s *Service) SendOrderConfirmation(evt events.OrderCreated) error {
    body := fmt.Sprintf(`
        <h2>Order #%d confirmed</h2>
        <p>Total: $%.2f</p>
        <p>Items:</p>
        <ul>
            %s
        </ul>
    `, evt.OrderID, evt.Total, formatItems(evt.Items))
    
    return s.Send(evt.UserEmail, "Order Confirmation", body)
}
```

Production: dùng template engine (Hermes, gomail) thay vì string concat.

## MailHog cho dev

```yaml
mailhog:
  image: mailhog/mailhog
  ports:
    - "1025:1025"    # SMTP
    - "8025:8025"    # Web UI
```

App config:
```text
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
```

→ Email gửi tới `localhost:1025` → xem ở `http://localhost:8025`. Không gửi thật khi dev.

## Multi-binary build

```dockerfile
FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 go build -o /bin/worker ./cmd/worker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/api /bin/api
COPY --from=builder /bin/worker /bin/worker
```

Docker compose run 2 container từ cùng image:
```yaml
api:
  build: .
  command: ["/bin/api"]
  ports: ["8080:8080"]

worker:
  build: .
  command: ["/bin/worker"]
  depends_on: [postgres, localstack]
```

→ 1 codebase, multiple binaries, scale independent.

## Patterns event-driven

### 1. Idempotent consumer

```go
func (h *EmailHandler) OnOrderCreated(evt events.OrderCreated) error {
    // Check đã xử lý chưa
    if h.cache.Exists("email_sent:" + strconv.Itoa(evt.OrderID)) {
        return nil
    }
    
    if err := h.email.Send(...); err != nil {
        return err
    }
    
    h.cache.Set("email_sent:"+strconv.Itoa(evt.OrderID), "1", 24*time.Hour)
    return nil
}
```

→ Duplicate delivery? OK, không gửi 2 lần.

### 2. Fan-out

```text
[OrderCreated event]
       │
       ├──→ Email service (welcome email)
       ├──→ Warehouse service (notify pickup)
       ├──→ Analytics service (track conversion)
       └──→ Loyalty service (add points)
```

→ 1 event, N consumer độc lập.

### 3. Dead-letter queue (DLQ)

SQS auto move message fail nhiều lần → DLQ. Worker alert + manual triage.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Publish event sync trong handler | Slow + tight coupling | Outbox pattern |
| Publish event fail = order fail | Bad UX | Log + retry |
| Consumer không idempotent | Duplicate side effect | Cache + check |
| No DLQ | Bad message block queue | Setup DLQ |
| Ack quá sớm | Message lost khi crash | Ack sau process xong |
| Event schema không versioned | Break consumer | Schema version field |
| Email gửi thẳng từ handler | Fail = order fail | Async |
| Hard-code event type | Typo bug | Constant hoặc enum |

## Quick reference

```go
// Publisher
type Event interface { Type() string }
type Publisher interface { Publish(ctx, Event) error }

// Watermill
import "github.com/ThreeDotsLabs/watermill"
pub, _ := wsqs.NewPublisher(...)
sub, _ := wsqs.NewSubscriber(...)

msg := message.NewMessage(uuid, payload)
pub.Publish(topic, msg)
msgs, _ := sub.Subscribe(ctx, topic)
for msg := range msgs {
    process(msg)
    msg.Ack()    // hoặc msg.Nack()
}

// Outbox pattern
INSERT INTO outbox_events (type, payload)  // trong transaction
SELECT FROM outbox_events WHERE published = false  // poller
UPDATE outbox_events SET published = true

// Multi-binary
cmd/api/main.go     → API server
cmd/worker/main.go  → Background worker
```

## Tóm tắt bài 5

- Event-driven decouple service, async, scale.
- Publisher interface + Event interface.
- Watermill abstract broker (SQS, Kafka, NATS, Redis, in-memory).
- **Outbox pattern** cho reliable delivery: insert event cùng transaction → poller publish.
- Consumer phải **idempotent** — duplicate delivery OK.
- Dead-letter queue (DLQ) cho message fail.
- Email service tách thành worker binary.
- MailHog dev: không gửi thật.
- Multi-binary: 1 codebase, `cmd/api` + `cmd/worker`, deploy độc lập.

**Bài kế tiếp** → [Bài 6: Swagger documentation + Postman + production deploy](06-swagger-deploy.md)
