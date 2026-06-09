# Bài 43: Customer Service — Domain + Outbox + Publish

> Customer service đơn giản hơn Order/Payment/Restaurant — chỉ create customer + publish event. Bài này code đầy đủ: domain, application service, REST controller, outbox, scheduler.

## Customer domain core

```java
public class Customer extends AggregateRoot<CustomerId> {
    private String username;
    private String firstName;
    private String lastName;

    public Customer(CustomerId customerId, String username, String firstName, String lastName) {
        setId(customerId);
        this.username = username;
        this.firstName = firstName;
        this.lastName = lastName;
    }
    // getter
}
```

Không cần validation phức tạp — Customer service "thin", chỉ CRUD.

Domain Event:

```java
public class CustomerCreatedEvent implements DomainEvent<Customer> {
    private final Customer customer;
    private final ZonedDateTime createdAt;
    public CustomerCreatedEvent(Customer customer, ZonedDateTime createdAt) {
        this.customer = customer;
        this.createdAt = createdAt;
    }
    // getter
}
```

## Application service

### Input port — REST

```java
public interface CustomerApplicationService {
    CreateCustomerResponse createCustomer(@Valid CreateCustomerCommand command);
}
```

DTOs:

```java
public record CreateCustomerCommand(
    @NotNull UUID customerId,
    @NotBlank String username,
    @NotBlank String firstName,
    @NotBlank String lastName
) {}

public record CreateCustomerResponse(
    UUID customerId,
    String message
) {}
```

### Output ports

```java
public interface CustomerRepository {
    Customer createCustomer(Customer customer);
}

public interface CustomerOutboxRepository {
    CustomerOutboxMessage save(CustomerOutboxMessage outboxMessage);
    Optional<List<CustomerOutboxMessage>> findByOutboxStatus(OutboxStatus outboxStatus);
    void deleteByOutboxStatus(OutboxStatus outboxStatus);
}
```

### Implementation

```java
@Slf4j
@Service
@RequiredArgsConstructor
@Validated
public class CustomerCreateCommandHandler {

    private final CustomerRepository customerRepository;
    private final CustomerOutboxHelper customerOutboxHelper;
    private final CustomerDataMapper customerDataMapper;

    @Transactional
    public CreateCustomerResponse createCustomer(CreateCustomerCommand command) {
        Customer customer = customerDataMapper.createCustomerCommandToCustomer(command);
        Customer savedCustomer = customerRepository.createCustomer(customer);
        log.info("Customer created with id: {}", savedCustomer.getId().getValue());

        CustomerCreatedEvent event = new CustomerCreatedEvent(
            savedCustomer, ZonedDateTime.now(ZoneId.of("UTC")));

        customerOutboxHelper.saveCustomerOutboxMessage(
            customerDataMapper.customerCreatedEventToCustomerEventPayload(event),
            OutboxStatus.STARTED,
            UUID.randomUUID());            // sagaId không quan trọng — Customer fire-and-forget

        return CreateCustomerResponse.builder()
            .customerId(savedCustomer.getId().getValue())
            .message("Customer created successfully")
            .build();
    }
}
```

`@Transactional` bao 2 việc: save customer + save outbox → atomic.

```java
@Service
@RequiredArgsConstructor
public class CustomerApplicationServiceImpl implements CustomerApplicationService {
    private final CustomerCreateCommandHandler handler;

    @Override
    public CreateCustomerResponse createCustomer(CreateCustomerCommand command) {
        return handler.createCustomer(command);
    }
}
```

## Outbox helper

```java
@Component
@RequiredArgsConstructor
public class CustomerOutboxHelper {

    private final CustomerOutboxRepository customerOutboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void saveCustomerOutboxMessage(CustomerEventPayload payload,
                                          OutboxStatus outboxStatus,
                                          UUID sagaId) {
        save(CustomerOutboxMessage.builder()
            .id(UUID.randomUUID())
            .sagaId(sagaId)
            .createdAt(ZonedDateTime.now(ZoneId.of("UTC")))
            .type("CustomerCreated")
            .payload(createPayload(payload))
            .outboxStatus(outboxStatus)
            .build());
    }

    @Transactional(readOnly = true)
    public Optional<List<CustomerOutboxMessage>> getCustomerOutboxMessageByOutboxStatus(
            OutboxStatus outboxStatus) {
        return customerOutboxRepository.findByOutboxStatus(outboxStatus);
    }

    @Transactional
    public void save(CustomerOutboxMessage msg) {
        if (customerOutboxRepository.save(msg) == null) {
            throw new RuntimeException("Could not save CustomerOutboxMessage");
        }
    }

    @Transactional
    public void deleteCustomerOutboxMessageByOutboxStatus(OutboxStatus outboxStatus) {
        customerOutboxRepository.deleteByOutboxStatus(outboxStatus);
    }

    private String createPayload(CustomerEventPayload p) {
        try {
            return objectMapper.writeValueAsString(p);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
    }
}
```

## Scheduler — publish outbox

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CustomerOutboxScheduler {

    private final CustomerOutboxHelper customerOutboxHelper;
    private final CustomerMessagePublisher publisher;

    @Transactional
    @Scheduled(fixedRateString = "${customer-service.outbox-scheduler-fixed-rate}",
               initialDelayString = "${customer-service.outbox-scheduler-initial-delay}")
    public void processOutboxMessage() {
        Optional<List<CustomerOutboxMessage>> response =
            customerOutboxHelper.getCustomerOutboxMessageByOutboxStatus(OutboxStatus.STARTED);

        if (response.isPresent() && !response.get().isEmpty()) {
            List<CustomerOutboxMessage> msgs = response.get();
            log.info("Received {} CustomerOutboxMessage", msgs.size());
            msgs.forEach(m -> publisher.publish(m, this::updateStatus));
        }
    }

    private void updateStatus(CustomerOutboxMessage msg, OutboxStatus status) {
        msg.setProcessedAt(ZonedDateTime.now(ZoneId.of("UTC")));
        msg.setOutboxStatus(status);
        customerOutboxHelper.save(msg);
    }
}
```

## Kafka publisher

```java
public interface CustomerMessagePublisher {
    void publish(CustomerOutboxMessage msg,
                 BiConsumer<CustomerOutboxMessage, OutboxStatus> outboxCallback);
}
```

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CustomerKafkaMessagePublisher implements CustomerMessagePublisher {

    private final CustomerMessagingDataMapper mapper;
    private final CustomerServiceConfigData configData;
    private final KafkaProducer<String, CustomerAvroModel> kafkaProducer;
    private final CustomerKafkaMessageHelper kafkaMessageHelper;

    @Override
    public void publish(CustomerOutboxMessage msg,
                        BiConsumer<CustomerOutboxMessage, OutboxStatus> outboxCallback) {
        CustomerEventPayload payload = kafkaMessageHelper.getPayload(msg.getPayload());

        try {
            CustomerAvroModel avroModel = mapper.customerEventPayloadToCustomerAvroModel(payload);
            kafkaProducer.send(
                configData.getCustomerTopicName(),
                payload.getId(),
                avroModel,
                kafkaMessageHelper.getKafkaCallback(
                    configData.getCustomerTopicName(),
                    avroModel, msg, outboxCallback,
                    "CustomerAvroModel"));
        } catch (Exception e) {
            log.error("Error sending CustomerAvroModel", e);
        }
    }
}
```

## REST Controller

```java
@RestController
@RequestMapping("/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerApplicationService customerApplicationService;

    @PostMapping
    public ResponseEntity<CreateCustomerResponse> createCustomer(
            @RequestBody CreateCustomerCommand command) {
        return ResponseEntity.ok(customerApplicationService.createCustomer(command));
    }
}
```

## Main + Bean Config

```java
@EnableScheduling
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class CustomerServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(CustomerServiceApplication.class, args);
    }
}

@Configuration
public class BeanConfiguration {
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }
}
```

## Test Customer service

```text
POST http://localhost:8484/customers
Content-Type: application/json

{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb43",
  "username": "user_new",
  "firstName": "Lan",
  "lastName": "Pham"
}
```

Response 200:
```json
{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb43",
  "message": "Customer created successfully"
}
```

DB:
```text
$ psql -c "SELECT * FROM \"customer\".customers WHERE id='d215...cb43';"
   id        | username | first_name | last_name
   ----------+----------+------------+-----------
   d215...   | user_new | Lan        | Pham

$ psql -c 'SELECT id, outbox_status, type FROM "customer".customer_outbox;'
   id        | outbox_status | type
   ----------+----------------+-----------------
   abc-789   | STARTED        | CustomerCreated
```

Sau 5s scheduler chạy:
```text
[Customer]  Received 1 CustomerOutboxMessage
[Customer]  Successfully sent CustomerAvroModel to topic customer at offset 0

$ psql -c 'SELECT id, outbox_status FROM "customer".customer_outbox;'
   id        | outbox_status
   ----------+---------------
   abc-789   | COMPLETED
```

Inspect Kafka:
```text
$ kcat -b localhost:19092 -t customer -C -r http://localhost:8081 -s value=avro
{"id":"d215...cb43", "username":"user_new", "firstName":"Lan", "lastName":"Pham"}
```

Message đã trên Kafka. Bài 44 sẽ làm Order consume.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Customer service không có scheduler — outbox phình | `@EnableScheduling` + `@Scheduled` ở scheduler class |
| Customer publish nhưng Order chưa consume | OK ở bài này. Bài 44 sẽ làm phía Order |
| Outbox không cleanup → bảng to dần | Thêm cleaner scheduler hàng ngày |
| Customer key Kafka không cố định | Dùng `customerId` để cùng customer cùng partition |
| Schema event customer thiếu username | Mapper không gửi field bắt buộc → consumer fail |

## Tóm tắt bài 43

- Customer domain core đơn giản: 1 entity `Customer`, 1 event `CustomerCreatedEvent`.
- Application service: command handler INSERT customer + save outbox trong cùng transaction.
- Outbox + scheduler publish event lên topic `customer` (key = customerId).
- REST endpoint `POST /customers` port 8484.
- Customer service như "publisher dữ liệu master" — không nhận event từ đâu, chỉ phát.

**Bài kế tiếp** → [Bài 44: Order Service consume Customer event + Query CQRS](04-order-consume-customer.md)
