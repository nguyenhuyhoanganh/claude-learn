# Bài 58: Spring Boot 2.6 → 3.x migration

> Khoá học bắt đầu với Spring Boot 2.6 (2022). Đến 2026 đã có Spring Boot 3.3 (Java 21, native compile). Bài này dạy migrate qua từng major version: 2.6 → 2.7 → 3.0 → 3.1 → 3.3. Bài tập nhỏ nhưng quan trọng — production code phải up-to-date để có security patch.

## Vì sao update Spring Boot

3 lý do nghiêm túc:

1. **Security**: Spring Boot 2.x EOL November 2023. CVE không có patch sau ngày này. Production phải lên 3.x.
2. **Performance**: Spring Boot 3.2+ + Java 21 + Virtual Threads (Project Loom) — throughput 2-3x cho I/O bound.
3. **Native compile (GraalVM)**: image size từ 200MB → 70MB, startup từ 10s → 100ms. Quan trọng cho K8s autoscale + serverless.

## Roadmap migration

```text
Spring Boot 2.6.7  →  2.7.x  →  3.0.x  →  3.1.x  →  3.3.x
   Java 17 OK         Java 17 OK    Java 17       Java 17       Java 21 khuyến nghị
                                    + Jakarta EE  + AOT          + Virtual Threads
                                    breaking      improvements   + Native compile
```

Không nhảy thẳng 2.6 → 3.3 — qua từng major dễ debug.

## Step 1: 2.6.7 → 2.7.5

Nhỏ nhất. Sửa parent version:

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.5</version>           <!-- was 2.6.7 -->
</parent>
```

Change cơ bản:
- Spring Data Cassandra → CassandraRepository import path.
- `WebSecurityConfigurerAdapter` deprecated. Dùng `SecurityFilterChain` bean.
- `RedisConfiguration` interface đổi.

Build:
```text
$ mvn clean package -DskipTests
```

Test:
```text
$ mvn test
```

Pass → commit.

## Step 2: 2.7.5 → 3.0.5 (MAJOR breaking)

Lớn nhất. 3 breaking change:

### 2a. javax → jakarta package

Spring Boot 3 dùng Jakarta EE 10. Mọi `javax.*` → `jakarta.*`.

```diff
- import javax.persistence.Entity;
- import javax.persistence.Id;
- import javax.persistence.Table;
- import javax.validation.constraints.NotNull;
- import javax.servlet.http.HttpServletRequest;
+ import jakarta.persistence.Entity;
+ import jakarta.persistence.Id;
+ import jakarta.persistence.Table;
+ import jakarta.validation.constraints.NotNull;
+ import jakarta.servlet.http.HttpServletRequest;
```

Áp dụng cho **mọi** file dùng:
- JPA annotations (`@Entity`, `@Id`, `@Column`, ...).
- Validation (`@NotNull`, `@NotBlank`, `@Valid`, ...).
- Servlet API.
- JSON-B.
- Annotation `@Resource` (CDI).

```text
# Sửa nhanh trên macOS/Linux
$ find . -name "*.java" -exec sed -i 's/javax\./jakarta\./g' {} +

# Verify build
$ mvn clean package
```

> Cẩn thận: không phải mọi `javax.*` đều đổi. `javax.crypto`, `javax.net.ssl`, `javax.security` (Java SE) **giữ nguyên**. Chỉ Jakarta EE đổi.

### 2b. Spring Security new approach

```diff
- @EnableWebSecurity
- public class SecurityConfig extends WebSecurityConfigurerAdapter {
-     @Override
-     protected void configure(HttpSecurity http) throws Exception {
-         http.csrf().disable()
-             .authorizeRequests().antMatchers("/orders/**").permitAll();
-     }
- }

+ @EnableWebSecurity
+ public class SecurityConfig {
+     @Bean
+     public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
+         http.csrf(csrf -> csrf.disable())
+             .authorizeHttpRequests(auth -> auth
+                 .requestMatchers("/orders/**").permitAll());
+         return http.build();
+     }
+ }
```

Khoá học chưa có security config phức tạp — phần này skim qua.

### 2c. Hibernate 6, JPA 3

- Hibernate 5 → 6: lazy initialization stricter.
- JPA 3 (Jakarta Persistence 3.0): `@Entity`, query syntax giống — chỉ import đổi.
- Native query dùng `setParameter(int, Object)` thay `setParameter(String, Object)` cho positional.

### 2d. Logback config

`logback-spring.xml` syntax chặt hơn. Verify log vẫn hoạt động.

### Test full

```text
$ mvn clean install
$ java -jar order-service/order-container/target/order-container.jar
```

Spring Boot 3.0.5 yêu cầu Java 17+ — verify:
```text
$ java -version
openjdk version "17.0.10"
```

## Step 3: 3.0.5 → 3.1.5

Smooth update. Highlight:

### Native compile early access

```xml
<plugin>
    <groupId>org.graalvm.buildtools</groupId>
    <artifactId>native-maven-plugin</artifactId>
    <version>0.10.0</version>
</plugin>
```

Build native:
```text
$ mvn -Pnative native:compile
```

Output: 70MB executable, không cần JRE.

### Observability built-in

Spring Boot 3.1 tích hợp Micrometer + OpenTelemetry. Không cần config tay:

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-zipkin</artifactId>
</dependency>
```

Auto trace REST → service → DB.

### Spring Cloud compat

Spring Cloud 2022.0.x cần Spring Boot 3.0+. Khoá không dùng Spring Cloud nên skip.

## Step 4: 3.1.5 → 3.3.2 + Kafka KRaft

### Virtual Threads (Java 21)

Java 21 LTS có Virtual Threads (Loom). Spring Boot 3.2+ tự enable:

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

Mỗi request handle bằng virtual thread thay platform thread. I/O wait không block carrier thread → throughput tăng vọt cho service nhiều DB call / HTTP call (Spring Boot service kiểu Order/Payment).

### Kafka KRaft (no Zookeeper)

Kafka 3.3+ chính thức support **KRaft** (Kafka Raft) — bỏ Zookeeper. Kafka tự quản metadata qua Raft consensus.

Docker compose mới:
```yaml
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_LISTENERS: 'PLAINTEXT://kafka:9092,CONTROLLER://kafka:9093'
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093'
      KAFKA_LOG_DIRS: '/var/lib/kafka/data'
      CLUSTER_ID: 'food-ordering-cluster-id'
    ports:
      - "9092:9092"
```

Một broker = `broker` + `controller` role. Production 3+ broker, 1 controller quorum.

Lợi:
- Bỏ Zookeeper service.
- Startup nhanh hơn ~30s → ~5s.
- Metadata ops nhanh hơn.

### Spring Kafka 3.x

Same API. Chỉ cần update version:
```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
    <version>3.1.0</version>
</dependency>
```

## Full migration checklist

- [ ] Java 17 verify (`java -version`).
- [ ] Parent pom update `2.6.7 → 2.7.5`.
- [ ] Build pass + test pass.
- [ ] Parent pom update `2.7.5 → 3.0.5`.
- [ ] `javax → jakarta` find + replace.
- [ ] Spring Security migrate (nếu có).
- [ ] Hibernate 6 issues fix.
- [ ] Build pass + test pass.
- [ ] Parent pom update `3.0.5 → 3.1.5`.
- [ ] Enable observability (optional).
- [ ] Parent pom update `3.1.5 → 3.3.2`.
- [ ] Java 21 install (LTS).
- [ ] `spring.threads.virtual.enabled=true`.
- [ ] Kafka 3.5+ image, KRaft mode.
- [ ] Update Avro plugin version.
- [ ] Update lombok version (delombok cho Java 21).
- [ ] All service smoke test.

## Bẫy thường gặp khi migrate

| Bẫy | Sửa |
|---|---|
| `ClassNotFoundException javax.persistence.Entity` | Đã update Spring Boot 3 nhưng quên đổi javax → jakarta |
| `ConfigurationProperties not creating bean` | Spring Boot 3 strict, cần `@ConfigurationPropertiesScan` |
| `MultipartFile cannot be resolved` | `javax.servlet.http.Part` → `jakarta.servlet.http.Part` |
| Lombok generated code dùng javax | Update Lombok 1.18.30+ |
| Hibernate 6 lazy fail | Add `@Transactional` hoặc fetch EAGER |
| Native compile fail | Reflection registry config thiếu. `@RegisterReflectionForBinding`. |
| Virtual Thread + Spring Sleuth incompat | Spring Boot 3.x dùng Micrometer Observation thay Sleuth |
| Kafka KRaft cluster.id mismatch | Generate UUID mới, không reuse Zookeeper era |
| Tests slow trên Java 21 native | JVM mode test, native test riêng |

## Tóm tắt bài 58

- Migration path: 2.6.7 → 2.7.5 → 3.0.5 → 3.1.5 → 3.3.2.
- Breaking change lớn nhất: 3.0 với `javax → jakarta` package rename + Jakarta EE 10.
- Spring Boot 3.2+ + Java 21 + Virtual Threads = throughput 2-3x cho I/O bound service.
- Kafka KRaft bỏ Zookeeper từ 3.3+ — đơn giản hoá operational.
- Native compile (GraalVM) ready production từ Spring Boot 3.2+ — image 70MB, startup 100ms.
- Update từng major, test kỹ — không skip.

**Bài kế tiếp** → [Bài 59: Tổng kết khoá học + roadmap kế tiếp](02-course-summary.md)
