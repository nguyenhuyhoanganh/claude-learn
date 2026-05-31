# Bài 1: Testing pyramid trong microservices — vì sao approach monolith không scale

Trong monolith, testing pyramid (unit → integration → e2e) là chuẩn. Áp dụng cho microservices = collapse vì:
- 50 microservices × pyramid mỗi cái = 50 pyramids.
- Plus 1 grand pyramid trên cùng để verify cross-service.
- End-to-end environment = ác mộng vận hành.

Bài này dạy 2 layer pyramid mới + 3 thách thức làm "traditional approach" bị thay thế bằng contract testing (bài tiếp).

## Recap: testing pyramid monolith

```text
            ▲
           ╱E2E╲       ← Functional / End-to-end tests
          ╱─────╲      ← Slowest, most expensive, fewest
         ╱       ╲
        ╱ Integ-  ╲   ← Integration tests (DB, broker, file IO)
       ╱ ration    ╲  ← Medium speed, medium count
      ╱─────────────╲
     ╱               ╲
    ╱     Unit        ╲ ← Unit tests (class/function isolated)
   ╱─────────────────  ╲ ← Fast, cheap, MANY
  ╱─────────────────────╲
```

Quy tắc:
- **Unit tests**: nhiều nhất, cheapest, isolated. Mock everything external. Test logic 1 class/function. Run trong ms.
- **Integration tests**: ít hơn. Test real DB, real broker, file IO. Run trong giây/chục giây.
- **E2E tests**: ít nhất. Spin up full app + UI + DB. Test user journey. Run trong phút.

Tại sao pyramid (không đảo ngược)?
- Cost: E2E expensive setup + slow + flaky.
- Confidence: nhưng E2E nhiều thực tế = realistic.
- Trade-off: write maximum cheap tests, minimum expensive ones.

## Áp dụng cho microservices — 2-level pyramid

### Level 1: Per-service pyramid (tương tự monolith)

Mỗi microservice có pyramid riêng của nó:

```text
For SERVICE A:
            ▲
           ╱E2E╲       ← Test A end-to-end (real DB, real broker, but no other services)
          ╱─────╲
         ╱ Integ ╲    ← Test A with its DB, its message handlers
        ╱─────────╲
       ╱   Unit    ╲  ← Test individual classes in A
      ╱─────────────╲
```

Mỗi service team own pyramid của mình. Mỗi commit triggers CI cho service đó.

### Level 2: System-level pyramid (cross-service)

Treat mỗi microservice là **unit của system-level pyramid**:

```text
SYSTEM-LEVEL:
            ▲
           ╱E2E╲       ← Full env: all services + UI + brokers + DBs
          ╱─────╲      ← Verify business user journeys
         ╱       ╲
        ╱ Cross   ╲   ← Pairwise integration: A↔B can talk
       ╱  service  ╲  ← Mock other services
      ╱─────────────╲
     ╱               ╲
    ╱   Microservice  ╲ ← Each service (pyramid above) = 1 "unit"
   ╱─────────────────  ╲
  ╱─────────────────────╲
```

- Cross-service integration: build A + B, no others, verify A→B works (HTTP API hoặc events).
- System E2E: build ALL services + UI + brokers + DBs in test env.

Sounds clean. Reality is hell.

## 3 thách thức của approach traditional này

### Thách thức 1: E2E environment = ác mộng vận hành

E2E env cần:
- Mọi microservice (50+) running.
- Mọi DB instance.
- Mọi message broker.
- Test data setup + teardown.
- Front-end build.
- Networking giữa các component.

```text
50 services × 100MB Docker image = 5GB.
Spin up time: 10-30 phút.
Cost: shadow environment ~= production cost / 10 = thousands $/month.
```

Vấn đề ownership:
- Team nào own E2E env? Infra team? Platform team?
- Service A team breaks build (commit bug) → E2E pipeline red → **all teams blocked**.
- Other teams cannot release because pipeline they rely on is broken.

Result trong thực tế:
- **Option A**: Invest disproportionate effort. Dedicated team chỉ maintain E2E. Cost cao, slow CI.
- **Option B**: Ignore E2E entirely. Devs skip, release anyway. E2E pass-rate drops to 30% → no one trust → liability.

**Tiered E2E** common compromise: critical paths only (login → checkout → pay), không cover mọi journey.

### Thách thức 2: Integration tests = tight coupling cross-team

Scenario: TEAM A own ServiceA, consume ServiceB's API.

TEAM A wants integration test cho A:
- Spin up A.
- Need to spin up B too (real, not mock).
- B has own dependencies: B-DB, B-broker, secrets.
- TEAM A không know how to spin up B reliably.

→ Coupling: A's tests depend on B's deploy mechanism.

**Mặt khác**, TEAM B owns ServiceB:
- B's API consumed by A, C, D, E (4 services).
- Change B's API → must verify A, C, D, E still work.
- Spin up A, C, D, E in B's test pipeline = build B's team owning others' deploy.

→ Mọi team end up maintaining mọi team's deploy. Anti-microservices.

### Thách thức 3: Event-driven test cực khó

```text
ServiceA → publish event → Broker → ServiceB consume.

A integration test: 
  - "When I do X, I publish event Y to topic Z."
  - Need real broker? Real consumer? Mock broker?

A doesn't know consumers — that's the point of decoupling.
But to test A end-to-end, need at least 1 consumer.
```

Same on consumer side: B test needs producer A or fake producer + broker.

→ Spin up Kafka + producer + consumer trong CI = slow + flaky.

Decoupling at runtime (great) ↔ coupling at test time (painful).

## Solutions overview (preview bài 2)

3 alternative để giảm pain:

### Solution 1: Lightweight mocking

```text
Service A's test:
  - Mock B's API layer.
  - "When A receives X, A calls B with Y. Assert mock B got Y."
  
  → Fast, no B deployment.
```

Risk: mock drift from reality. B changes API → A's mock outdated → tests pass but prod broken.

### Solution 2: Contract testing (bài tiếp deep)

Tool keep mock + real provider in sync via shared contract file.

```text
A's test generates contract: "I call B with X, expect Y back."
Contract shared with B's team.
B replays contract against real B: verifies B still returns Y for X.

→ Both sides test against same contract.
```

Tool: **Pact**, **Spring Cloud Contract**, **Postman contracts**.

### Solution 3: Test in production (bài tiếp deep)

Skip E2E env entirely. Use:
- **Blue-green deployment**: 2 identical env (blue=old, green=new). Deploy new to green, no traffic. Test green. Cut traffic over.
- **Canary**: route 1% real traffic to new version. Monitor. Expand to 100% if OK.
- **Feature flags / dark launches**.

Risk shifted: tests run against real prod traffic, fewer pre-prod tests.

## Bảng so sánh layers cho microservices

| Layer | Scope | Speed | Cost | Confidence | Frequency |
|---|---|---|---|---|---|
| Unit | 1 class | < 100ms | Low | Low (per unit) | Every save |
| Service integration | 1 service + its dependencies | < 30s | Low | Medium | Every commit |
| Service E2E | 1 service in isolation, mock external | < 2min | Low | Medium | Every commit |
| Cross-service integration | 2 services + their interaction | < 5min | Medium | High (pair) | Pre-merge |
| Contract test | Mock + contract sync | < 1min | Low | High (API compat) | Pre-merge |
| System E2E | All services + UI + DB + broker | 15+ min | HIGH | Highest | Pre-prod release (or rare) |
| Production testing | Real users, controlled exposure | N/A | Low | Real | Continuous |

## Anti-pattern: 100% E2E coverage attempt

Some teams: "Let's E2E test everything." Result:
- 500 E2E tests, run 6 hours.
- Flaky rate 30%.
- Dev wait, frustrated.
- No one fixes flakies.
- Pipeline ignored.

**Inverted pyramid** = guaranteed disaster.

## Anti-pattern: No tests at all

Other extreme: "Let's just deploy and watch." 
- Outage on Friday 5pm.
- Customer trust drops.
- Tech debt accumulates.

Pyramid + contract + production testing = balanced.

## Self-check: pyramid health

| Question | Healthy answer |
|---|---|
| Run time of all tests for 1 service? | < 5 min |
| Flaky rate? | < 2% |
| E2E test count? | < 50 (critical journeys only) |
| Contract test exists? | Yes for every cross-service API |
| Production deployment safety? | Blue-green / canary in place |
| Time from commit to prod? | < 1 hour (continuous deployment) |

If any answer fails → testing strategy needs rework.

## Tóm tắt bài 1

- Monolith pyramid: unit (many) → integration (some) → E2E (few). Apply to **mỗi microservice**.
- Cross-service pyramid level 2: service unit → pair integration → system E2E.
- 3 challenges của traditional approach:
  1. **E2E env vận hành cực khó**: cost, ownership, broken build = all blocked.
  2. **Integration test = cross-team coupling**: A test cần spin up B's stack.
  3. **Event-driven test extra hard**: producer không know consumer, broker setup heavy.
- Solutions: **lightweight mock**, **contract test**, **production testing** (next lesson).
- Anti-pattern: 100% E2E coverage hoặc 0% — cả 2 đều thua.

**Bài kế tiếp** → [Bài 2: Contract testing và production testing](02-contract-production-testing.md)
