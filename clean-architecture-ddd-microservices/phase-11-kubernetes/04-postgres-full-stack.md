# Bài 48: Postgres trong K8s + chạy stack đầy đủ

> Microservice đã deploy. Còn Postgres. Bài này dùng `StatefulSet` chạy Postgres trong K8s, init schema 4 service, sau đó chạy toàn stack — POST order qua minikube IP, verify SAGA end-to-end trên K8s.

## Postgres StatefulSet

Khác Deployment, `StatefulSet`:
- Pod có **identity ổn định** (`postgres-0`).
- Mỗi pod có **PVC riêng**.
- Khởi tuần tự.

`infrastructure/k8s/postgres/statefulset.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: food-ordering-system
spec:
  serviceName: postgres-service
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
            - name: POSTGRES_DB
              value: postgres
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
            - name: postgres-init
              mountPath: /docker-entrypoint-initdb.d
          resources:
            requests:
              memory: 256Mi
              cpu: 100m
            limits:
              memory: 512Mi
              cpu: 500m
      volumes:
        - name: postgres-init
          configMap:
            name: postgres-init-scripts
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

`volumeClaimTemplates` — mỗi pod replica auto tạo PVC riêng.

## Postgres Service (Headless)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
  namespace: food-ordering-system
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None                                 # Headless
```

Headless → DNS resolve trực tiếp pod IP. Microservice connect `postgres-service:5432`.

## Init schema qua ConfigMap

`infrastructure/k8s/postgres/init-scripts.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init-scripts
  namespace: food-ordering-system
data:
  01-order-schema.sql: |
    CREATE SCHEMA "order";
    CREATE TYPE order_status AS ENUM (
        'PENDING', 'PAID', 'APPROVED', 'CANCELLING', 'CANCELLED'
    );

    CREATE TABLE "order".orders (
        id uuid NOT NULL PRIMARY KEY,
        customer_id uuid NOT NULL,
        restaurant_id uuid NOT NULL,
        tracking_id uuid NOT NULL,
        price numeric(10,2) NOT NULL,
        order_status order_status NOT NULL,
        failure_messages text
    );

    CREATE TABLE "order".order_items (
        id bigint NOT NULL,
        order_id uuid NOT NULL,
        product_id uuid NOT NULL,
        price numeric(10,2) NOT NULL,
        quantity integer NOT NULL,
        sub_total numeric(10,2) NOT NULL,
        PRIMARY KEY (id, order_id),
        FOREIGN KEY (order_id) REFERENCES "order".orders (id) ON DELETE CASCADE
    );

    CREATE TABLE "order".order_address (
        id uuid NOT NULL PRIMARY KEY,
        order_id uuid NOT NULL UNIQUE,
        street varchar NOT NULL,
        postal_code varchar NOT NULL,
        city varchar NOT NULL,
        FOREIGN KEY (order_id) REFERENCES "order".orders (id) ON DELETE CASCADE
    );

    CREATE TABLE "order".customers (
        id uuid NOT NULL PRIMARY KEY,
        username varchar NOT NULL,
        first_name varchar NOT NULL,
        last_name varchar NOT NULL
    );

    -- payment_outbox + restaurant_approval_outbox + restaurant materialized view
    CREATE TABLE "order".payment_outbox (...);
    CREATE TABLE "order".restaurant_approval_outbox (...);

  02-payment-schema.sql: |
    CREATE SCHEMA "payment";
    CREATE TABLE "payment".payments (...);
    CREATE TABLE "payment".credit_entry (...);
    CREATE TABLE "payment".credit_history (...);
    CREATE TABLE "payment".order_outbox (...);
    INSERT INTO "payment".credit_entry VALUES
      (gen_random_uuid(), 'd215b5f8-0249-4dc5-89a3-51fd148cfb41', 1000.00);

  03-restaurant-schema.sql: |
    CREATE SCHEMA "restaurant";
    CREATE TABLE "restaurant".restaurants (...);
    CREATE TABLE "restaurant".products (...);
    CREATE TABLE "restaurant".order_approval (...);
    CREATE TABLE "restaurant".order_outbox (...);
    INSERT INTO "restaurant".restaurants VALUES
      ('d215b5f8-0249-4dc5-89a3-51fd148cfb45', 'Pizza Hut', true);
    INSERT INTO "restaurant".products VALUES
      ('d215b5f8-0249-4dc5-89a3-51fd148cfb48',
       'd215b5f8-0249-4dc5-89a3-51fd148cfb45', 'Pizza', 50.00, true);

  04-customer-schema.sql: |
    CREATE SCHEMA "customer";
    CREATE TABLE "customer".customers (...);
    CREATE TABLE "customer".customer_outbox (...);
```

Postgres image tự run mọi `.sql` trong `/docker-entrypoint-initdb.d/` khi DB rỗng lần đầu.

## Apply Postgres

```text
$ kubectl apply -f infrastructure/k8s/postgres/init-scripts.yaml
$ kubectl apply -f infrastructure/k8s/postgres/statefulset.yaml
$ kubectl apply -f infrastructure/k8s/postgres/service.yaml

$ kubectl get pods
postgres-0   1/1   Running   0   2m
```

Check schema:
```text
$ kubectl exec -it postgres-0 -- psql -U postgres -d postgres -c '\dn'
   Name      | Owner
   -----------+----------
    customer  | postgres
    order     | postgres
    payment   | postgres
    public    | postgres
    restaurant| postgres
```

4 schema + public.

## Chạy 4 microservice

Apply:
```text
$ kubectl apply -f infrastructure/k8s/order-service/
$ kubectl apply -f infrastructure/k8s/payment-service/
$ kubectl apply -f infrastructure/k8s/restaurant-service/
$ kubectl apply -f infrastructure/k8s/customer-service/

$ kubectl get pods
NAME                                  READY   STATUS    RESTARTS   AGE
customer-service-6d7c8b5f9d-mn5op     1/1     Running   0          1m
kafka-cluster-cp-kafka-0              2/2     Running   0          15m
kafka-cluster-cp-kafka-1              2/2     Running   0          15m
kafka-cluster-cp-kafka-2              2/2     Running   0          15m
kafka-cluster-cp-schema-registry      2/2     Running   0          15m
kafka-cluster-cp-zookeeper-0          2/2     Running   0          15m
order-service-5d8b6f9c8d-xz9p7        1/1     Running   0          1m
payment-service-789f5d7c8d-q3r4s      1/1     Running   0          1m
postgres-0                            1/1     Running   0          5m
restaurant-service-9c8d7e6f5d-ab12c   1/1     Running   0          1m
```

11 pod. Stack đầy đủ chạy trong K8s.

## Test end-to-end qua minikube IP

NodePort Order service:
```text
$ kubectl apply -f order-service-nodeport.yaml
$ minikube ip
192.168.49.2

$ curl -X POST http://192.168.49.2:30181/orders \
    -H 'Accept: application/vnd.api.v1+json' \
    -H 'Content-Type: application/json' \
    -d '{
      "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
      "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
      "address": { "street": "1 Le Duan", "postalCode": "100000", "city": "Hanoi" },
      "price": 50.00,
      "items": [
        {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48",
         "quantity": 1, "price": 50.00, "subTotal": 50.00}
      ]
    }'

{"orderTrackingId":"abc-123","orderStatus":"PENDING","message":"Order created successfully"}
```

Đợi 20-30s rồi GET:
```text
$ curl http://192.168.49.2:30181/orders/abc-123 \
    -H 'Accept: application/vnd.api.v1+json'

{"orderTrackingId":"abc-123","orderStatus":"APPROVED","failureMessages":[]}
```

SAGA chạy trên K8s thành công.

## Theo dõi log

```text
$ kubectl logs -f deployment/order-service
$ kubectl logs -f deployment/payment-service
$ kubectl logs -f deployment/restaurant-service
```

Log scheduler:
```text
[Order]  Received 1 OrderPaymentOutboxMessage with ids: ... sending to message bus!
[Order]  Successfully sent PaymentRequestAvroModel for order id: abc-123 to topic payment-request at offset 12
[Payment] Received payment request for order id: abc-123
...
```

## Multi-instance scale

```text
$ kubectl scale deployment order-service --replicas=3
$ kubectl get pods | grep order-service

order-service-5d8b6f9c8d-xz9p7   1/1   Running   0   10m
order-service-5d8b6f9c8d-ab12c   1/1   Running   0   30s
order-service-5d8b6f9c8d-de34f   1/1   Running   0   30s
```

POST nhiều order liên tiếp → service `order-service` (ClusterIP) tự round-robin → 3 instance chia tải.

```text
$ for i in {1..20}; do
    curl -X POST http://192.168.49.2:30181/orders -d @order.json &
  done
$ kubectl top pods | grep order-service

order-service-5d8b6f9c8d-xz9p7   180m   456Mi
order-service-5d8b6f9c8d-ab12c   170m   442Mi
order-service-5d8b6f9c8d-de34f   165m   438Mi
```

CPU phân bổ đều 3 pod.

## Resource summary trên minikube

```text
$ kubectl top pods --no-headers | awk '{sum_cpu+=$2; sum_mem+=$3} END {print "Total CPU: " sum_cpu "m, Memory: " sum_mem "Mi"}'

Total CPU: 850m, Memory: 4500Mi
```

~4.5 GB RAM cho full stack 11 pod. minikube 8 GB đủ thoải mái.

## Bẫy thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Postgres init script không chạy | DB đã có data → script skip. Xoá PVC rồi recreate StatefulSet. |
| Microservice connect Postgres fail | Service name trong YAML. Phải `postgres-service`, không `postgres`. |
| Kafka producer fail "no metadata" | Headless service name sai. Phải `kafka-cluster-cp-kafka-headless:9092`. |
| Scheduler 3 instance race → publish duplicate | `@Version` chống được. Production nên distributed lock. |
| Pod restart liên tục → message replay | At-least-once expected. Idempotent check ở phase-9 đảm bảo. |
| Pod start nhưng readiness fail vĩnh viễn | Spring Boot chưa khởi xong. Tăng `initialDelaySeconds`. |
| Ingress không hoạt động | Chưa enable `minikube addons enable ingress`. |
| /actuator/health/readiness 404 | Quên thêm dependency `spring-boot-starter-actuator`. |

## Cleanup

```text
$ kubectl delete namespace food-ordering-system
$ helm uninstall kafka-cluster -n food-ordering-system   # nếu chưa qua namespace
$ kubectl delete pvc --all -n food-ordering-system
$ minikube stop
```

Hoặc reset hoàn toàn:
```text
$ minikube delete
```

## Tóm tắt bài 48

- Postgres dùng StatefulSet với volumeClaimTemplates → mỗi replica có PVC riêng.
- Init schema 4 service qua ConfigMap mount `/docker-entrypoint-initdb.d/`.
- Headless service cho phép microservice connect Postgres qua DNS.
- Full stack chạy ~4.5 GB RAM trong K8s local.
- SAGA hoàn chỉnh trên K8s: POST order qua minikube IP → APPROVED sau 20-30s.
- Multi-instance scale: `kubectl scale --replicas=N`, K8s service tự load balance.

**Bài kế tiếp** → [Bài 49 (phase-12): Google Kubernetes Engine — deploy lên cloud thật](../phase-12-gke/01-gke-setup.md)
