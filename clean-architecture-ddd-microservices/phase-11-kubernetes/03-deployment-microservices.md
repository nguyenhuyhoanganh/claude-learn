# Bài 47: Deployment YAML cho 4 microservice

> Kafka đã có. Bây giờ build Docker image cho 4 service Spring Boot, tạo Deployment + Service + ConfigMap YAML, deploy vào K8s. Bài này code đầy đủ + chi tiết từng config.

## Dockerfile cho mỗi service

`order-service/order-container/Dockerfile`:

```dockerfile
FROM eclipse-temurin:17-jre-alpine

LABEL service="order-service"

WORKDIR /app

COPY target/order-container.jar app.jar

EXPOSE 8181

ENV JAVA_OPTS="-Xms256m -Xmx512m"

ENTRYPOINT exec java $JAVA_OPTS -jar app.jar
```

- `eclipse-temurin:17-jre-alpine` — base image nhẹ ~ 100 MB.
- Heap 256-512 MB phù hợp Spring Boot service nhỏ.
- `exec` cho phép JVM nhận signal SIGTERM khi K8s shutdown pod.

Build local:
```text
$ cd order-service/order-container
$ mvn clean package -DskipTests
$ docker build -t food-ordering/order-service:1.0 .
```

Push image vào minikube registry:
```text
$ minikube image load food-ordering/order-service:1.0
```

Hoặc dùng minikube's docker:
```text
$ eval $(minikube docker-env)
$ docker build -t food-ordering/order-service:1.0 .
```

Tương tự cho payment, restaurant, customer.

## ConfigMap chứa application.yml

`infrastructure/k8s/order-service/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
  namespace: food-ordering-system
data:
  application.yml: |
    server:
      port: 8181

    spring:
      jpa:
        open-in-view: false
        show-sql: false                          # tắt log SQL ở prod
        hibernate:
          ddl-auto: none
      datasource:
        url: jdbc:postgresql://postgres-service:5432/postgres?currentSchema=order&binaryTransfer=true&reWriteBatchedInserts=true
        username: postgres
        password: ${POSTGRES_PASSWORD}            # từ secret
        driver-class-name: org.postgresql.Driver

    logging:
      level:
        com.food.ordering.system: INFO

    order-service:
      payment-request-topic-name: payment-request
      payment-response-topic-name: payment-response
      restaurant-approval-request-topic-name: restaurant-approval-request
      restaurant-approval-response-topic-name: restaurant-approval-response
      customer-topic-name: customer
      outbox-scheduler-fixed-rate: 5000
      outbox-scheduler-initial-delay: 30000

    kafka-config:
      bootstrap-servers: kafka-cluster-cp-kafka-headless:9092
      schema-registry-url-key: schema.registry.url
      schema-registry-url: http://kafka-cluster-cp-schema-registry:8081
      num-of-partitions: 3
      replication-factor: 3

    kafka-producer-config:
      key-serializer-class: org.apache.kafka.common.serialization.StringSerializer
      value-serializer-class: io.confluent.kafka.serializers.KafkaAvroSerializer
      compression-type: snappy
      acks: all
      batch-size: 16384
      batch-size-boost-factor: 100
      linger-ms: 5
      request-timeout-ms: 60000
      retry-count: 5

    kafka-consumer-config:
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: io.confluent.kafka.serializers.KafkaAvroDeserializer
      payment-consumer-group-id: payment-topic-consumer
      restaurant-approval-consumer-group-id: restaurant-approval-topic-consumer
      customer-group-id: customer-topic-consumer
      auto-offset-reset: earliest
      specific-avro-reader-key: specific.avro.reader
      specific-avro-reader: true
      batch-listener: true
      auto-startup: true
      concurrency-level: 3
      session-timeout-ms: 10000
      heartbeat-interval-ms: 3000
      max-poll-interval-ms: 300000
      poll-timeout-ms: 150
      max-partition-fetch-bytes-default: 1048576
      max-partition-fetch-bytes-boost-factor: 1
```

## Secret cho password

```yaml
# infrastructure/k8s/postgres-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: food-ordering-system
type: Opaque
stringData:
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: admin                       # production dùng vault
```

## Deployment YAML — Order service

`infrastructure/k8s/order-service/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: food-ordering-system
  labels:
    app: order-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: food-ordering/order-service:1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8181
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: POSTGRES_PASSWORD
            - name: SPRING_CONFIG_LOCATION
              value: "file:/config/application.yml"
          volumeMounts:
            - name: config-volume
              mountPath: /config
          resources:
            requests:
              memory: "512Mi"
              cpu: "200m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8181
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8181
            initialDelaySeconds: 60
            periodSeconds: 30
      volumes:
        - name: config-volume
          configMap:
            name: order-service-config
            items:
              - key: application.yml
                path: application.yml
```

### Giải thích kỹ từng phần

**`resources.requests` vs `limits`**:
- Request: tối thiểu K8s reserve cho pod.
- Limit: tối đa pod được dùng. Vượt CPU → throttle; vượt memory → OOM kill.

**Readiness probe**:
- Pod chỉ nhận traffic khi probe pass.
- `initialDelaySeconds: 30` → đợi Spring Boot khởi.
- Spring Boot Actuator endpoint `/actuator/health/readiness`.

**Liveness probe**:
- Pod tự restart nếu probe fail.
- `initialDelaySeconds: 60` lớn hơn readiness — vì healthy app vẫn có thể slow start.

**Volume mount ConfigMap**:
- ConfigMap mount as file `/config/application.yml`.
- Spring Boot đọc qua `SPRING_CONFIG_LOCATION` env var.

## Service YAML

```yaml
# infrastructure/k8s/order-service/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: food-ordering-system
spec:
  selector:
    app: order-service
  ports:
    - name: http
      port: 8181
      targetPort: 8181
  type: ClusterIP
```

Internal service. Để test từ ngoài → port-forward hoặc Ingress.

## NodePort hoặc Ingress cho expose REST

### Option A: NodePort (đơn giản)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service-nodeport
spec:
  selector:
    app: order-service
  ports:
    - port: 8181
      targetPort: 8181
      nodePort: 30181
  type: NodePort
```

Access từ host: `http://$(minikube ip):30181/orders`.

### Option B: Ingress (production)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: orders.food-ordering.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 8181
```

Cần ingress controller (nginx-ingress) cài trước:
```text
$ minikube addons enable ingress
```

Update `/etc/hosts`:
```text
192.168.49.2 orders.food-ordering.local       # IP từ minikube ip
```

## Apply tất cả

```text
$ kubectl apply -f infrastructure/k8s/postgres-secret.yaml
$ kubectl apply -f infrastructure/k8s/order-service/configmap.yaml
$ kubectl apply -f infrastructure/k8s/order-service/deployment.yaml
$ kubectl apply -f infrastructure/k8s/order-service/service.yaml

$ kubectl get pods
NAME                             READY   STATUS    RESTARTS   AGE
order-service-5d8b6f9c8d-xz9p7   1/1     Running   0          1m
```

Pattern lặp lại cho 3 service còn lại: payment, restaurant, customer.

## Spring Boot Actuator setup

Cần thêm dependency:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

Bật endpoint:
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info
  endpoint:
    health:
      probes:
        enabled: true
      show-details: when_authorized
```

`/actuator/health/readiness` + `/actuator/health/liveness` tự active.

## Scale microservice

```text
$ kubectl scale deployment order-service --replicas=3
$ kubectl get pods

order-service-5d8b6f9c8d-xz9p7   1/1     Running   0          5m
order-service-5d8b6f9c8d-ab12c   1/1     Running   0          30s
order-service-5d8b6f9c8d-de34f   1/1     Running   0          30s
```

3 instance Order service. Service `order-service` tự load balance round-robin.

Lưu ý: với Outbox + scheduler — 3 instance scheduler cùng poll outbox → race condition. `@Version` optimistic lock cứu được nhưng có waste publish. Production cân nhắc:
- Distributed lock (Redis) để chỉ 1 instance chạy scheduler.
- Hoặc deploy scheduler riêng (sidecar job).

## Rolling update không downtime

Image mới `food-ordering/order-service:1.1`:

```text
$ kubectl set image deployment/order-service order-service=food-ordering/order-service:1.1
$ kubectl rollout status deployment/order-service

Waiting for deployment "order-service" rollout to finish:
1 out of 3 new replicas have been updated...
2 out of 3 new replicas have been updated...
deployment "order-service" successfully rolled out
```

K8s tạo pod mới với image 1.1, đợi readiness, kill pod cũ tuần tự. Không downtime nếu replicas > 1.

Rollback nếu lỗi:
```text
$ kubectl rollout undo deployment/order-service
$ kubectl rollout history deployment/order-service
```

## Bẫy thường gặp

| Triệu chứng | Sửa |
|---|---|
| `ImagePullBackOff` | Image chưa load vào minikube. `minikube image load <image>` hoặc dùng minikube docker. |
| Pod up nhưng không nhận traffic | Readiness probe fail. `kubectl describe pod` xem reason. |
| `OOMKilled` | Heap tăng. Tăng `memory limit` hoặc giảm `JAVA_OPTS -Xmx`. |
| Pod connect Postgres timeout | Postgres service name sai. Phải là `postgres-service:5432`. |
| Pod cannot resolve Kafka | Headless service name: `kafka-cluster-cp-kafka-headless:9092`. |
| ConfigMap update không reflect | Pod phải restart manual: `kubectl rollout restart deployment/order-service`. |
| Scheduler chạy multi-instance race | `@Version` chống được, hoặc dùng distributed lock. |
| Spring config không load | `SPRING_CONFIG_LOCATION` syntax sai. Phải `file:/config/application.yml`. |

## Tóm tắt bài 47

- Dockerfile dùng `eclipse-temurin:17-jre-alpine` base, ENTRYPOINT exec để JVM nhận signal.
- ConfigMap chứa application.yml, mount vào pod qua volume + `SPRING_CONFIG_LOCATION`.
- Secret cho password Postgres, inject qua env var.
- Deployment với resource requests/limits + readiness + liveness probe Actuator.
- Service ClusterIP internal, NodePort hoặc Ingress cho external.
- Scale `kubectl scale --replicas=N`. Rolling update `kubectl set image`. Rollback `rollout undo`.

**Bài kế tiếp** → [Bài 48: Postgres trong K8s + chạy stack đầy đủ](04-postgres-full-stack.md)
