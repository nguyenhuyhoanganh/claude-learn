# Bài 2: Contract testing + Production testing — escape E2E hell

Bài trước: 3 thách thức (E2E env vận hành khó, integration coupling, EDA test hard). Bài này: 3 solutions thực tế production-grade.

## Solution 1: Lightweight mocking (naive)

Scenario: TEAM A own ServiceA, consume ServiceB API.

Approach naive: mock B's API layer trong A's test.

```java
@Test
void shouldCallBWithCorrectParams() {
    // Mock B's API layer
    var mockB = mock(BServiceClient.class);
    when(mockB.getUserDetails("user-1"))
        .thenReturn(new User("user-1", "John"));
    
    var a = new ServiceA(mockB);
    a.processRequest("user-1");
    
    verify(mockB).getUserDetails("user-1");
}
```

Reverse direction: B mocks consumers.

### Lợi ích

- ✓ Decouple teams: A doesn't need B's deployment.
- ✓ Fast: no actual HTTP / Kafka.
- ✓ Reliable: no flaky network.

### Vấn đề lớn: contract drift

```text
Time T0:
  B API: GET /user/:id → {id, name, email}
  A mocks: {id, name, email}
  Both pass.

Time T1: 
  B team decides to rename "email" → "emailAddress". Updates B's API + B's mocks + B's tests. All pass.
  But A team doesn't get notified. A's mock still {id, name, email}. A's tests pass.

Time T1.1: Both deployed to prod.
  A calls B → gets {id, name, emailAddress}.
  A's code looks for "email" → null → broken feature.
```

Both sides green ✓ ✓. Prod red ✗. Classic disaster.

## Solution 2: Contract testing — sync 2 sides via shared contract

> **Contract test** = tool generate **shared contract file** từ consumer side, replay nó against real provider.

### Workflow

```text
┌─────────── CONSUMER SIDE (TEAM A) ────────────┐
│                                                │
│  Write test: "When I call B.getUser('u-1'),   │
│             expect {id, name, emailAddress}"   │
│                                                │
│  Tool (Pact, Spring Cloud Contract):           │
│   - Runs test against MOCK B.                  │
│   - Asserts A handles {id, name, emailAddress} │
│     correctly.                                 │
│   - Records the interaction to                 │
│     CONTRACT FILE (JSON/YAML).                 │
└────────────────────┬──────────────────────────┘
                     │ Contract file shared
                     │ via broker (Pact Broker)
                     ▼
┌─────────── PROVIDER SIDE (TEAM B) ────────────┐
│                                                │
│  Pull contracts from broker.                   │
│  For each contract:                            │
│   - Replay recorded request to REAL B.         │
│   - Assert real B returns matching response.   │
│                                                │
│  If response shape changes incompatibly        │
│  → contract test FAILS in B's CI.              │
│  → B knows A will break before deploy.         │
└────────────────────────────────────────────────┘
```

### Code example (Pact, Java)

Consumer side (TEAM A):
```java
@PactTestFor(providerName = "user-service")
class UserConsumerTest {
    
    @Pact(consumer = "service-a")
    public RequestResponsePact getUser(PactDslWithProvider builder) {
        return builder
            .given("user u-1 exists")
            .uponReceiving("a request for user u-1")
            .path("/users/u-1")
            .method("GET")
            .willRespondWith()
            .status(200)
            .body(newJsonBody(b -> {
                b.stringValue("id", "u-1");
                b.stringValue("name", "John");
                b.stringValue("emailAddress", "john@x.com");
            }).build())
            .toPact();
    }
    
    @Test
    @PactTestFor(pactMethod = "getUser")
    void testGetUser(MockServer mockServer) {
        var client = new UserClient(mockServer.getUrl());
        var user = client.getUser("u-1");
        
        assertEquals("John", user.getName());
        assertEquals("john@x.com", user.getEmailAddress());
    }
}
```

Run test → contract file `service-a-user-service.json` created. Push to Pact Broker.

Provider side (TEAM B):
```java
@Provider("user-service")
@PactBroker(host = "pact-broker.acme.com")
class UserProviderTest {
    
    @BeforeEach
    void setup(PactVerificationContext context) {
        context.setTarget(new HttpTestTarget("localhost", 8080));
    }
    
    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void verifyPact(PactVerificationContext context) {
        context.verifyInteraction();  // Replay contract against real B
    }
    
    @State("user u-1 exists")
    void setupUserState() {
        userRepo.save(new User("u-1", "John", "john@x.com"));
    }
}
```

If B's API drift → test fail. CI red for B's team. B team knows BEFORE deploy.

### Tools

| Tool | Language | Note |
|---|---|---|
| **Pact** | Multi-language (Java, JS, Go, Ruby, Python) | De-facto standard. Pact Broker. |
| **Spring Cloud Contract** | JVM | Tight Spring integration |
| **Postman Contract Tests** | Any | GUI-friendly |
| **Schemathesis** | Python | OpenAPI-based |
| **Karate** | Java | DSL syntax, contracts + tests |

### Contract testing cho event-driven

Cùng ý tưởng, broker thay vì HTTP.

```text
Producer side:
  PaymentService publishes PaymentCompleted event.
  Test: "When I trigger billing, I publish event with schema { paymentId, amount, currency, userId }."
  → Contract: schema + sample payload.

Consumer side:
  ShippingService consumes PaymentCompleted.
  Test: "Given event with this schema, I correctly extract userId + create shipment."
  → Contract: expected schema.

Tool keeps both schemas matched.
```

Schema registry (Confluent Schema Registry với Avro/Protobuf) đóng role tương tự cho EDA.

```yaml
# Avro schema for PaymentCompleted
{
  "type": "record",
  "name": "PaymentCompleted",
  "fields": [
    {"name": "paymentId", "type": "string"},
    {"name": "amount", "type": "double"},
    {"name": "currency", "type": "string"},
    {"name": "userId", "type": "string"}
  ]
}
```

Producer publish → schema check at broker. Consumer reads → schema fetched, validated. Schema evolution rules (backward / forward compat) enforced.

### Trade-off contract test

✓ Pros:
- **Decouple teams**: each team runs own CI, no need to spin up others.
- **Detect drift early**: provider sees consumer expectations.
- **Fast**: no full integration env.
- **Reliable**: no flaky network.

✗ Cons:
- **Setup tooling**: Pact Broker, schema registry need infra.
- **Contract maintenance**: as APIs evolve, contracts evolve.
- **Doesn't catch business logic bugs**: only API shape compatibility.
- **Doesn't cover non-functional**: perf, security, edge cases.

→ Contract test **replace integration test for API compatibility**, không replace E2E for full system verification.

## Solution 3: Test in production

> Skip pre-prod E2E env entirely. Use deployment patterns để **safely test in real production**.

### Pattern A: Blue-Green deployment

2 identical production environments. **Blue** = current. **Green** = new version.

```text
            +────────────────+
   Users ──►│ Load Balancer  │
            +────────────────+
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   [BLUE env]               [GREEN env]
   v1.0                      v1.1 (new)
   100% traffic              0% traffic ← deploy here
```

Step 1: Deploy v1.1 to GREEN. Zero user traffic.
Step 2: Run smoke tests, manual QA against GREEN.
Step 3: Switch LB: GREEN 100%, BLUE 0%.
Step 4: Monitor. Issue? Switch back instantly.
Step 5: OK? Decommission BLUE.

✓ Zero-downtime release.
✓ Instant rollback.
✗ Need 2× infrastructure during transition.

### Pattern B: Canary deployment

Gradual traffic shift.

```text
Start:
  v1.0: 100% traffic, v1.1: 0%

Step 1: Deploy v1.1 alongside v1.0.
        LB shift: v1.0=99%, v1.1=1% (canary)
        
Step 2: Monitor metrics for canary:
        - Error rate.
        - Latency (p50/p99).
        - Business metrics (conversion, signup).
        
Step 3: If healthy: v1.0=90%, v1.1=10%.
        Then 50/50.
        Then 100% v1.1.
        
Step 4: If unhealthy at any step: rollback to 100% v1.0.
```

Limit blast radius: 1% users see bug → not 100%.

Tools: **Argo Rollouts**, **Flagger**, **Istio**, **Linkerd**, **AWS CodeDeploy**.

### Pattern C: Feature flags / dark launches

Code deployed but **not activated**. Controlled by config:

```java
if (featureFlag.isEnabled("new-checkout-flow", user)) {
    return newCheckoutFlow.execute();
} else {
    return oldCheckoutFlow.execute();
}
```

Enable cho:
- Internal employees first.
- 1% users.
- 10% then 100%.

Tools: **LaunchDarkly**, **Split.io**, **Unleash**, **Flipt**.

✓ Decouple deploy from release.
✓ Kill-switch instant.
✓ A/B testing built-in.

### Pattern D: Shadow traffic

Real prod traffic mirrored to new version, response discarded:

```text
User → LB → v1.0 (real response)
         │
         └──► v1.1 (shadow, response ignored)

Compare v1.0 and v1.1 responses offline.
Detect regressions before traffic switch.
```

Useful cho refactoring, không cho new features (no real user feedback).

### Test in prod necessities

| Component | Note |
|---|---|
| **Monitoring** | Real-time metrics (latency, error rate) |
| **Alerting** | Auto rollback on threshold breach |
| **Distributed tracing** | Identify which service failed |
| **Feature flags infra** | LaunchDarkly etc. |
| **Service mesh** | Istio for traffic split |
| **Synthetic tests** | Continuously probe prod with fake user journeys |

Test in prod = production observability is mandatory (Phase 7).

## Combined strategy — real-world recipe

Production-grade microservices testing:

```text
1. Unit tests per service          (95% of test count)
2. Service integration tests       (DB, broker, in-service)
3. Contract tests for cross-service API     ← replaces integration cross-service
4. Smoke tests (5-10 critical journeys)     ← replaces giant E2E suite
5. Canary deployment for safety
6. Feature flags for kill-switch
7. Synthetic monitoring in prod
```

Spectrum: shift testing left (contract), shift release-safety right (canary).

## When STILL need full E2E?

Some cases warrant E2E despite cost:

- **Regulated industries** (banking, healthcare): regulators want pre-prod testing.
- **Critical business flow** (checkout, payment): blast radius too big for canary alone.
- **Major architectural change**: contract tests don't cover behavior change.

But limit scope: 10-30 E2E covering critical paths, not 500.

## Anti-pattern: Contract tests as substitute for unit tests

Contract test = "B's API returns this shape". Doesn't test B's business logic.

❌ Wrong:
```text
Only contract tests + 0 unit tests.
B's internal logic broken? Contract still passes (response shape OK).
Bug ships.
```

✓ Right:
```text
Service B's pyramid (unit + integration + service E2E).
+ Contract tests cross-service.
```

Contract tests complement, not replace.

## Anti-pattern: Test in prod without observability

Canary without monitoring = blind canary. By the time you notice, 10% users already affected.

**Test in prod requires investment in observability first**. Phase 7 covers logs/metrics/traces.

## Tóm tắt bài 2

- **Lightweight mocking** dễ nhưng risk contract drift.
- **Contract testing** = tool sync mock + real qua shared contract file. Tools: **Pact**, **Spring Cloud Contract**.
- Schema registry (Avro, Protobuf) = contract testing cho EDA events.
- **Test in production** thay E2E env: **blue-green**, **canary**, **feature flags**, **shadow traffic**.
- Tools: **Argo Rollouts**, **Flagger**, **LaunchDarkly**, **Istio**.
- Real-world recipe: unit + service integration + contract + smoke + canary + flags.
- E2E vẫn cần cho regulated industries hoặc business-critical paths, nhưng limit scope.
- Test in prod **requires observability** (Phase 7).

**Bài kế tiếp** → [Phase 7 — Bài 1: 3 pillars of observability](../phase-7-observability/01-3-pillars.md)
