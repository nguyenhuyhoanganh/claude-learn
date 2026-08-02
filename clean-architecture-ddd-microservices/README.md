# Clean Architecture Ddd Microservices

> Xây một hệ thống đặt đồ ăn 4 microservice — từ Clean Architecture tới SAGA, Outbox, CQRS và GKE.

59 bài **code-along** dựng một hệ thống thật: Order, Payment, Restaurant, Customer. Bắt đầu từ Clean/Hexagonal Architecture và DDD, rồi Kafka, SAGA cho giao dịch phân tán, Outbox pattern vá lỗ hổng dual-write, CQRS, Kubernetes, GKE và cuối cùng là CDC với Debezium.

**59 bài** trong 14 phần.

## Mục lục

### Phase 1 — introduction

| Bài | Nội dung |
|---|---|
| [01](phase-1-introduction/01-tong-quan-khoa-hoc.md) | Bài 1: Bản đồ kiến trúc và pattern bạn sẽ học |
| [02](phase-1-introduction/02-bai-toan-food-ordering.md) | Bài 2: Food Ordering System — bài toán bạn sẽ build |
| [03](phase-1-introduction/03-thiet-lap-moi-truong.md) | Bài 3: Thiết lập môi trường — Java, Maven, IntelliJ, Docker, Postgres, Kafka |

### Phase 2 — clean hexagonal

| Bài | Nội dung |
|---|---|
| [01](phase-2-clean-hexagonal/01-clean-hexagonal-architecture-la-gi.md) | Bài 4: Clean và Hexagonal Architecture — vì sao và như thế nào |
| [02](phase-2-clean-hexagonal/02-thiet-ke-order-service.md) | Bài 5: Thiết kế Order Service — từ 3-tier đến Port & Adapter, từng bước |
| [03](phase-2-clean-hexagonal/03-build-maven-modules.md) | Bài 6: Tạo Maven multi-module project — biến kiến trúc thành code |

### Phase 3 — ddd

| Bài | Nội dung |
|---|---|
| [01](phase-3-ddd/01-ddd-tu-tu-vung-business.md) | Bài 7: Domain-Driven Design — bắt đầu từ ngôn ngữ business |
| [02](phase-3-ddd/02-thiet-ke-order-aggregate.md) | Bài 8: Thiết kế Order Aggregate — fields, relationships, invariant |
| [03](phase-3-ddd/03-common-domain-base-classes.md) | Bài 9: Common-domain module — base classes dùng chung cho mọi service |
| [04](phase-3-ddd/04-order-aggregate-state-machine.md) | Bài 10: Order Aggregate Root — code thật state machine |
| [05](phase-3-ddd/05-domain-events-domain-service.md) | Bài 11: Domain Events và Order Domain Service |
| [06](phase-3-ddd/06-application-service-ports.md) | Bài 12: Application Service — DTO, ports, command handlers |
| [07](phase-3-ddd/07-message-publisher.md) | Bài 13: Message Publisher trong Application Service — refactor "publish event option-1" |
| [08](phase-3-ddd/08-domain-tests.md) | Bài 14: Test toàn bộ domain logic — JUnit, Mockito, không Spring |

### Phase 4 — kafka

| Bài | Nội dung |
|---|---|
| [01](phase-4-kafka/01-kafka-co-ban.md) | Bài 15: Apache Kafka — kiến trúc, topic, partition, consumer group |
| [02](phase-4-kafka/02-chay-kafka-docker.md) | Bài 16: Chạy Kafka cluster local với Docker Compose |
| [03](phase-4-kafka/03-kafka-config-model.md) | Bài 17: Module `kafka-config-data` + `kafka-model` (Avro) |
| [04](phase-4-kafka/04-kafka-producer.md) | Bài 18: Generic Kafka Producer module |
| [05](phase-4-kafka/05-kafka-consumer.md) | Bài 19: Generic Kafka Consumer module |

### Phase 5 — order completion

| Bài | Nội dung |
|---|---|
| [01](phase-5-order-completion/01-web-controller-advice.md) | Bài 20: REST Controller + ControllerAdvice |
| [02](phase-5-order-completion/02-jpa-data-access.md) | Bài 21: JPA Entity + Repository Adapter (Postgres) |
| [03](phase-5-order-completion/03-messaging-module.md) | Bài 22: Messaging module — Kafka publisher + listener implementation |
| [04](phase-5-order-completion/04-container-module.md) | Bài 23: Container module — Spring Boot main, @Bean, application.yml |
| [05](phase-5-order-completion/05-customer-and-run.md) | Bài 24: Customer Service "lite" + chạy Order Service end-to-end |

### Phase 6 — payment service

| Bài | Nội dung |
|---|---|
| [01](phase-6-payment-service/01-payment-domain-core.md) | Bài 25: Payment Service — Domain Core |
| [02](phase-6-payment-service/02-payment-application-data.md) | Bài 26: Payment Application Service + Data Access |
| [03](phase-6-payment-service/03-payment-messaging-container.md) | Bài 27: Payment Messaging + Container + chạy thử |

### Phase 7 — restaurant service

| Bài | Nội dung |
|---|---|
| [01](phase-7-restaurant-service/01-restaurant-domain.md) | Bài 28: Restaurant Service — Domain Core |
| [02](phase-7-restaurant-service/02-restaurant-application.md) | Bài 29: Restaurant Application Service + Data Access + Messaging |

### Phase 8 — saga pattern

| Bài | Nội dung |
|---|---|
| [01](phase-8-saga-pattern/01-saga-intro.md) | Bài 30: SAGA Pattern — distributed transaction xuyên service |
| [02](phase-8-saga-pattern/02-implement-sagas.md) | Bài 31: Code OrderPaymentSaga + OrderApprovalSaga |
| [03](phase-8-saga-pattern/03-test-saga-e2e.md) | Bài 32: Test end-to-end SAGA — happy path và failure scenarios |

### Phase 9 — outbox pattern

| Bài | Nội dung |
|---|---|
| [01](phase-9-outbox-pattern/01-outbox-intro.md) | Bài 33: Outbox Pattern — vá lỗ hổng dual-write một lần và mãi mãi |
| [02](phase-9-outbox-pattern/02-outbox-schema-model.md) | Bài 34: Schema + model cho Outbox table |
| [03](phase-9-outbox-pattern/03-outbox-helper-save.md) | Bài 35: Outbox helper — INSERT outbox cùng transaction với Order |
| [04](phase-9-outbox-pattern/04-outbox-scheduler.md) | Bài 36: Outbox Scheduler — polling pattern + cleanup |
| [05](phase-9-outbox-pattern/05-refactor-saga-outbox.md) | Bài 37: Refactor OrderPaymentSaga + OrderApprovalSaga cho Outbox |
| [06](phase-9-outbox-pattern/06-outbox-payment-restaurant.md) | Bài 38: Outbox cho Payment + Restaurant service |
| [07](phase-9-outbox-pattern/07-test-outbox-e2e.md) | Bài 39: Test end-to-end Outbox — chứng minh chống dual-write |
| [08](phase-9-outbox-pattern/08-outbox-summary.md) | Bài 40: Outbox checklist + tổng kết phase 9 |

### Phase 10 — cqrs pattern

| Bài | Nội dung |
|---|---|
| [01](phase-10-cqrs-pattern/01-cqrs-intro.md) | Bài 41: CQRS Pattern — vì sao tách read và write |
| [02](phase-10-cqrs-pattern/02-customer-setup.md) | Bài 42: Setup Customer Kafka topic + Customer service module |
| [03](phase-10-cqrs-pattern/03-customer-domain.md) | Bài 43: Customer Service — Domain + Outbox + Publish |
| [04](phase-10-cqrs-pattern/04-order-consume-customer.md) | Bài 44: Order Service consume Customer event + Query CQRS |

### Phase 11 — kubernetes

| Bài | Nội dung |
|---|---|
| [01](phase-11-kubernetes/01-kubernetes-intro.md) | Bài 45: Kubernetes — chạy 4 microservice + Kafka + Postgres |
| [02](phase-11-kubernetes/02-deploy-kafka-helm.md) | Bài 46: Deploy Kafka stack vào K8s qua Helm |
| [03](phase-11-kubernetes/03-deployment-microservices.md) | Bài 47: Deployment YAML cho 4 microservice |
| [04](phase-11-kubernetes/04-postgres-full-stack.md) | Bài 48: Postgres trong K8s + chạy stack đầy đủ |

### Phase 12 — gke

| Bài | Nội dung |
|---|---|
| [01](phase-12-gke/01-gke-setup.md) | Bài 49: Google Cloud + Tạo GKE Cluster |
| [02](phase-12-gke/02-push-images-artifact-registry.md) | Bài 50: Push Docker image lên Artifact Registry |
| [03](phase-12-gke/03-deploy-app-gke.md) | Bài 51: Deploy app lên GKE + verify SAGA cloud-native |
| [04](phase-12-gke/04-horizontal-autoscaler.md) | Bài 52: Horizontal Pod Autoscaler — scale service theo tải |

### Phase 13 — cdc debezium

| Bài | Nội dung |
|---|---|
| [01](phase-13-cdc-debezium/01-cdc-intro.md) | Bài 53: Change Data Capture với Debezium — nâng cấp Outbox polling sang push |
| [02](phase-13-cdc-debezium/02-postgres-debezium-config.md) | Bài 54: Configure Postgres + cài Debezium Connector |
| [03](phase-13-cdc-debezium/03-source-connector-config.md) | Bài 55: Source connector configuration — đọc 5 outbox table |
| [04](phase-13-cdc-debezium/04-migrate-to-cdc.md) | Bài 56: Migrate Order service từ polling sang CDC |
| [05](phase-13-cdc-debezium/05-benchmark-comparison.md) | Bài 57: Benchmark polling vs CDC + lessons learned |

### Phase 14 — version updates

| Bài | Nội dung |
|---|---|
| [01](phase-14-version-updates/01-spring-boot-3-migration.md) | Bài 58: Spring Boot 2.6 → 3.x migration |
| [02](phase-14-version-updates/02-course-summary.md) | Bài 59: Tổng kết khoá học + roadmap kế tiếp |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Muốn học Clean Architecture bằng code thật | phase-2 và phase-3 |
| Cần hiểu SAGA và Outbox | phase-8 và phase-9 — phần giá trị nhất khoá |
| Đã có hệ thống, muốn đưa lên K8s | phase-11 và phase-12 |
| Outbox polling đang chậm | phase-13 — chuyển sang CDC |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
