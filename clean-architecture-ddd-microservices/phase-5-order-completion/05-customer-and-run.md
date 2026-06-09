# Bài 24: Customer Service "lite" + chạy Order Service end-to-end

> Order service đã đủ module. Nhưng để chạy được, cần dữ liệu Customer và Restaurant tồn tại sẵn trong DB. Bài này tạo schema cho cả 4 service (`customer`, `restaurant`, `payment`, `order`), seed data mock, rồi chạy Order Service lần đầu — gửi REST request thật từ Postman.

## Customer Service "lite" — chỉ có schema + materialized view

Giai đoạn phase-1 đến phase-9, Customer **không** là microservice riêng — chỉ là **schema trong cùng Postgres instance** với trigger refresh materialized view.

```sql
CREATE SCHEMA "customer";

CREATE TABLE "customer".customers (
    id uuid NOT NULL,
    username character varying NOT NULL,
    first_name character varying NOT NULL,
    last_name character varying NOT NULL,
    CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- materialized view trong schema order
CREATE MATERIALIZED VIEW "order".order_customer_m_view
AS
SELECT id, username, first_name, last_name
  FROM "customer".customers;

REFRESH MATERIALIZED VIEW "order".order_customer_m_view;

-- trigger refresh
CREATE OR REPLACE FUNCTION "order".refresh_order_customer_m_view()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW "order".order_customer_m_view;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_order_customer_m_view
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON "customer".customers FOR EACH STATEMENT
EXECUTE PROCEDURE "order".refresh_order_customer_m_view();

-- Seed mock data
INSERT INTO "customer".customers VALUES 
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb41', 'user_1', 'Nam', 'Nguyen'),
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb42', 'user_2', 'Hoa', 'Tran');
```

`Order` service đọc qua `order.order_customer_m_view` — `CustomerRepositoryImpl` query view này.

Trigger thực ra **chưa thật sự cần** cho phase này — vì khoá học chỉ insert customer lúc start (seed). Trigger có ý nghĩa khi sau này thêm/xóa customer realtime.

## Restaurant data seed

```sql
CREATE SCHEMA "restaurant";

CREATE TABLE "restaurant".restaurants (
    id uuid NOT NULL,
    name character varying NOT NULL,
    active boolean NOT NULL,
    CONSTRAINT restaurants_pkey PRIMARY KEY (id)
);

CREATE TABLE "restaurant".products (
    id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    name character varying NOT NULL,
    price numeric(10,2) NOT NULL,
    available boolean NOT NULL,
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT FK_PRODUCT_RESTAURANT FOREIGN KEY (restaurant_id) 
        REFERENCES "restaurant".restaurants (id)
);

-- Seed mock
INSERT INTO "restaurant".restaurants VALUES 
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb45', 'Pizza Hut', true),
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb46', 'KFC', true);

INSERT INTO "restaurant".products VALUES 
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb48', 'd215b5f8-0249-4dc5-89a3-51fd148cfb45',
   'Pizza Margherita', 50.00, true),
  ('d215b5f8-0249-4dc5-89a3-51fd148cfb49', 'd215b5f8-0249-4dc5-89a3-51fd148cfb45',
   'Pizza Pepperoni', 60.00, true);

REFRESH MATERIALIZED VIEW "order".order_restaurant_m_view;
```

## Payment schema (sẽ implement ở phase-6)

```sql
CREATE SCHEMA "payment";

CREATE TABLE "payment".payments (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp WITH TIME ZONE NOT NULL,
    status character varying NOT NULL,
    CONSTRAINT payments_pkey PRIMARY KEY (id)
);

CREATE TABLE "payment".credit_entry (
    id uuid NOT NULL,
    customer_id uuid NOT NULL UNIQUE,
    total_credit_amount numeric(10,2) NOT NULL,
    CONSTRAINT credit_entry_pkey PRIMARY KEY (id)
);

CREATE TABLE "payment".credit_history (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    type character varying NOT NULL,    -- DEBIT, CREDIT
    CONSTRAINT credit_history_pkey PRIMARY KEY (id)
);

INSERT INTO "payment".credit_entry VALUES
  (gen_random_uuid(), 'd215b5f8-0249-4dc5-89a3-51fd148cfb41', 1000.00);
```

## Chạy Postgres + seed schema

```text
$ docker run -d --name postgres \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=admin \
    -e POSTGRES_DB=postgres \
    -p 5432:5432 \
    postgres:15

$ psql -h localhost -U postgres -d postgres -f init-schema.sql
```

Hoặc dùng `docker-compose`:

```yaml
# infrastructure/docker-compose/postgres.yml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    volumes:
      - "./volumes/postgres:/var/lib/postgresql/data"
      - "./init-schema.sql:/docker-entrypoint-initdb.d/init-schema.sql"
```

## Chạy Order Service

```text
$ cd food-ordering-system
$ mvn clean install -DskipTests
$ java -jar order-service/order-container/target/order-container.jar
```

Logs:

```text
... INFO Started OrderServiceApplication in 8.347 seconds
... INFO Tomcat started on port(s): 8181 (http)
... INFO Subscribed to topic(s): payment-response, restaurant-approval-response
... INFO Consumer config: {group.id=payment-topic-consumer, ...}
```

OK — service đang nghe REST 8181 + Kafka topic response.

## Test POST /orders

Postman:

```text
POST http://localhost:8181/orders
Accept: application/vnd.api.v1+json
Content-Type: application/json

{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
  "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
  "address": { "street": "1 Le Duan", "postalCode": "100000", "city": "Hanoi" },
  "price": 50.00,
  "items": [
    {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48",
     "quantity": 1, "price": 50.00, "subTotal": 50.00}
  ]
}
```

Response 200:

```json
{
  "orderTrackingId": "ab12cd34-...",
  "orderStatus": "PENDING",
  "message": "Order created successfully"
}
```

Log Order Service:

```text
INFO Sending message=... to topic=payment-request
INFO PaymentRequestAvroModel sent to Kafka for order id: ...
INFO Received successful response from Kafka for order id: ...
        Topic: payment-request Partition: 1 Offset: 0
```

DB check:

```text
$ psql -h localhost -U postgres -d postgres -c 'SELECT id, tracking_id, order_status FROM "order".orders;'
       id                | tracking_id              | order_status
-------------------------+-------------------------+--------------
 ab12cd34-...            | ab12cd34-...            | PENDING
```

Vì Payment service chưa implement → state mãi `PENDING`. Phase-6 sẽ build Payment, lúc đó SAGA chạy đến `PAID` và xa hơn.

## Test GET /orders/{trackingId}

```text
GET http://localhost:8181/orders/ab12cd34-...
Accept: application/vnd.api.v1+json
```

Response 200:

```json
{
  "orderTrackingId": "ab12cd34-...",
  "orderStatus": "PENDING",
  "failureMessages": []
}
```

## Test error cases

### Customer không tồn tại

```text
"customerId": "00000000-0000-0000-0000-000000000000"
```

Response 400:

```json
{ "code": "Bad Request",
  "message": "Could not find customer with id: 00000000-0000-0000-0000-000000000000" }
```

### Price lệch

```text
"price": 99.99   (items sum = 50.00)
```

Response 400:

```json
{ "code": "Bad Request",
  "message": "Total price 99.99 is not equal to Order items total 50.00!" }
```

### Restaurant inactive

Update DB:
```sql
UPDATE "restaurant".restaurants SET active=false WHERE id='d215b5f8-0249-4dc5-89a3-51fd148cfb45';
REFRESH MATERIALIZED VIEW "order".order_restaurant_m_view;
```

Response 400:

```json
{ "code": "Bad Request",
  "message": "Restaurant with id d215b5f8-... is currently not active!" }
```

## Inspect Kafka

Kafka UI (`localhost:9000`) → topic `payment-request` → thấy message vừa gửi. Format Avro decode tự động.

CLI:

```text
$ kcat -b localhost:19092 -t payment-request -C \
    -r http://localhost:8081 -s value=avro

{"id":"...", "sagaId":"...", "customerId":"...", "orderId":"...", "price":"50.00", 
 "createdAt":1717545600000, "paymentOrderStatus":"PENDING"}
```

## Bẫy thường gặp khi chạy lần đầu

| Triệu chứng | Nguyên nhân |
|---|---|
| Spring boot khởi báo "could not find Customer" | Materialized view chưa refresh hoặc chưa seed. `REFRESH MATERIALIZED VIEW order.order_customer_m_view;` |
| Kafka consumer report "no broker available" | `bootstrap-servers` trong yml sai (vd quên port 19092). |
| `OptimisticLockingException` ngay từ đầu | Phase-9 mới có, phase-5 chưa cần `@Version` — bug mapping. |
| Tomcat khởi nhưng REST 404 | `@RestController` chưa scan. `scanBasePackages` cover module application chưa? |
| Producer log "Schema not found" | Schema Registry chưa lên hoặc URL sai. Check `http://localhost:8081/subjects`. |
| `IDE chạy main class báo "no main class"` | Quên `@SpringBootApplication`. Hoặc IntelliJ chưa rebuild. |
| `@KafkaListener` không nhận message | Group ID sai trong yml. Topic name sai. |

## Tóm tắt bài 24

- Customer "lite" giai đoạn này: schema + materialized view trong Postgres, không phải microservice riêng.
- Schema SQL seed 4 schema (customer/restaurant/payment/order) + mock data.
- Order Service chạy port 8181, nghe `payment-response` + `restaurant-approval-response` topic.
- POST `/orders` thành công → status `PENDING`, message lên Kafka `payment-request`.
- 3 error case: customer không tồn tại, price lệch, restaurant inactive — đều trả 400 + message rõ ràng.
- Phase tiếp theo: build Payment Service để Order chuyển sang `PAID`.

**Bài kế tiếp** → [Bài 25 (phase-6): Payment Service — Domain Core](../phase-6-payment-service/01-payment-domain-core.md)
