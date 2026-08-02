# Bài 3: Ride Sharing — Post-Trip Choreography

Bài 2 đã design ride flow đến "finish_ride". Bài này design **4-service chain** sau trip end: trip pricing → payment processing → map generation (event sourcing!) → email notification. Pattern này = **choreography** trong microservices (vs orchestration). Bài cũng demonstrate **event sourcing replay** với location events lưu trong Kafka.

## Why post-trip is complex

```text
[Sequential steps]
1. Calculate fare from trip data
2. Charge rider's credit card (external API)
3. Pay driver's bank account (external API)
4. Generate map of trip path
5. Email rider with receipt + map
6. Email driver with payout confirmation + map

[Challenge]
- Steps 2 + 3 external calls (slow, can fail)
- Step 4 needs replay of all location events
- Steps 5 + 6 different emails, both need map

[Naive approach]
Synchronous chain in 1 service. If step 2 hangs, all blocks.

[Better: choreography]
Each service does its part, publishes event, next consumes.
```

## Choreography vs Orchestration

```text
[Orchestration — single conductor]
Conductor Service:
  charge() → wait → pay() → wait → genMap() → wait → email()

Pro: clear flow, easy to track
Con: conductor is bottleneck + SPOF
     Tight coupling: all services know each other
```

```text
[Choreography — distributed dance]
Service A: do work, publish "A.done" event
Service B: subscribe "A.done", do work, publish "B.done"
Service C: subscribe "B.done", do work, ...

Pro: decoupled, no SPOF
Con: harder to trace, no central view
```

For ride sharing post-trip, choreography wins (services independent).

## Post-trip flow

```text
[Trip ended]
Driver Service: receives "finish_ride"
        ↓
Location Service: marks driver available
Trip Service: marks trip "completed", records end time + final location
        ↓
Trip Service calculates: fare = base + (time × rate_t) + (distance × rate_d)
        ↓
Trip Service publishes "trip.fare_calculated" event
        {trip_id, rider_id, driver_id, fare, driver_payout, our_cut}

        ┌─────────────────────────────────┐
        │ Event consumed by 2 services    │
        ▼                                 ▼
[Payment Service]                  [Trip Map Generator]
  consumes event                    consumes event
  charges rider via Stripe          replays location events from Kafka
  pays driver via bank API          generates PNG of trip path
  
        ↓ on success                      ↓ when map ready
"payment.user.charged" event      "trip.map.generated" event
"payment.driver.paid" event             (map_url stored in cache)
        ↓                                 │
        ▼                                 │
[Notification Service]                   │
  consumes payment events                │
  fetches map from Trip Map Generator   ◄┘
  sends email to rider + driver
```

## Trip Service: Calculate fare

```text
Triggered: driver "finish_ride" event arrives at Location Service
which then publishes "trip.completed"

Trip Service consumer:
1. Read trip from DB by trip_id
2. Compute:
   time_seconds = ended_at - started_at
   distance_meters = computed from location events
   total_fare = BASE_FARE + (time_seconds * TIME_RATE) + (distance * DISTANCE_RATE)
   driver_payout = total_fare * DRIVER_SHARE  (e.g. 0.75)
   our_cut = total_fare - driver_payout
3. Update trip row with fares
4. Publish "trip.fare_calculated" event

Why async (event-driven)?
- Trip Service shouldn't block waiting for payment
- Multiple downstream consumers (Payment + Map Generator)
- Fire-and-forget pattern
```

## Payment Service: External API integrations

```text
Consumer of "trip.fare_calculated":

For rider:
1. Lookup payment method (Stripe customer ID)
2. Call Stripe API: charge $X
3. Handle Stripe response:
   - Success: store transaction ID, publish "payment.user.charged"
   - Failure: retry (3 attempts), then publish "payment.user.failed"
4. On final failure: alert admin, send rider apology email

For driver:
1. Lookup payout method (bank info encrypted)
2. Call bank API: payout $Y
3. Same retry pattern
4. Publish "payment.driver.paid" on success
```

### Why Payment Service separate

```text
- PCI compliance (payment data segregated)
- External API failures isolated (don't crash trip service)
- Retry logic specialized
- Audit log specific to financial transactions
```

## Trip Map Generator (event sourcing replay)

This is the elegant part.

```text
[Setup]
Recall bài 2: all location updates published to Kafka topic "driver.location"
Topic configured with 7-day retention.

[On "trip.fare_calculated"]
Trip Map Generator:
1. Read trip from Trip Service: get driver_id, started_at, ended_at
2. Replay Kafka events:
   - Consumer reads "driver.location" topic
   - Filter: events for driver_id, between started_at and ended_at
3. Reconstruct path: list of (lat, lng, timestamp)
4. Generate map image:
   - Call mapping library or service
   - Plot path on map background
   - Save as PNG
5. Store in cache (Redis):
   KEY: trip_map:{trip_id}
   VAL: PNG bytes (or S3 URL)
   TTL: 1 hour (only needed for emails)
6. Publish "trip.map.generated" event with map_url
```

### Why event sourcing here

```text
[Without event sourcing]
Would need to write every location to a "trip_paths" table
during trip → expensive, blocking

[With event sourcing]
Locations already in Kafka (cheap append-only)
Reconstruct path only when needed (post-trip)
1 query: filter Kafka events by driver + time range

[Trade-off]
Pro: no extra writes during trip
Con: must hold Kafka events long enough (7 days OK)
Con: replay takes time (acceptable for post-trip async)
```

## Notification Service: Email both parties

```text
[Two events arrive]
1. "payment.user.charged" → email rider receipt
2. "payment.driver.paid" → email driver payout confirmation

Both need the trip map.

[Race condition consideration]
Map generation might still be running when payment events arrive.
Or already done.

[Solution]
Notification consumes payment events:
- Tries to fetch map_url from cache
- If exists: include in email, send
- If not: wait + retry, or subscribe to "trip.map.generated" event

[Optimization: dual subscribe pattern]
Notification subscribes to BOTH:
- "trip.map.generated" — caches map URL by trip_id
- "payment.user.charged" + "payment.driver.paid"

When payment event arrives:
- Look up cached map URL (set by earlier map event)
- If not yet, wait for map event then send
```

### Email composition

```text
Rider email:
Subject: Your trip on [date] is complete
Body:
  Hi [name],
  Trip from [pickup_addr] to [dest_addr]
  Distance: [X] miles, Duration: [Y] min
  Total: $[total_fare]
  
  [Map image embedded]
  
  Card charged: ****[last4]

Driver email:
Subject: Trip payout - $[driver_payout]
Body:
  Hi [name],
  Trip from [pickup_addr] to [dest_addr]
  You earned: $[driver_payout]
  
  [Map image embedded]
  
  Deposit will appear in your bank within 1-2 days.
```

## Architecture diagram (post-trip)

```text
[Driver finish_ride]
        │
        ▼
[Location Service] → update DB
        │ publishes
        ▼
[Kafka: trip.completed]
        │
        ▼
[Trip Service]
        │ calculates fare
        │ publishes
        ▼
[Kafka: trip.fare_calculated]
        │
        ├──────────────────────────┐
        ▼                          ▼
[Payment Service]         [Trip Map Generator]
  charge user                replay location events
  pay driver                 generate map
        │ publishes                │ publishes
        │                          │
        ▼                          ▼
[Kafka: payment.*.done]    [Kafka: trip.map.generated]
        │                          │ stores in cache
        │                          ▼
        │                   [Redis cache]
        │                          ▲
        ▼                          │ lookup
[Notification Service] ────────────┘
        │
        ▼ send email
   [SES / SendGrid]
        │
        ▼
[Rider + Driver inboxes]
```

## Choreography pattern benefits

```text
[Decoupling]
Each service: knows what events to consume + publish
Doesn't know which other services exist

[Independent scaling]
Payment service slow? Doesn't block Map Generator.
Both processes their own queue at their own pace.

[Independent deployment]
Update Notification service without touching others.

[Resilience]
Payment service down: events queue up in Kafka
When back, processes backlog
```

## Choreography pattern challenges

```text
[Tracing]
Hard to see "all steps for trip X"
Solution: trace_id propagated through events
Tools: Jaeger, Zipkin

[Compensation]
What if payment succeeds but email fails?
Worst case: user charged but no receipt
Mitigation: idempotency on email send, retries

[Event ordering]
Map event vs payment event: order not guaranteed
Notification must handle both orderings
```

## Failure scenarios

### Payment fails permanently

```text
After 3 Stripe retry → "payment.user.failed" event
Notification Service:
- Don't send "receipt" email
- Send "We couldn't charge your card" email
- Customer service alerted to follow up
- Trip marked "payment_failed" in Trip Service
```

### Map generation fails

```text
Kafka event for location data corrupt?
Trip Map Generator: 
- Try fallback simple map (just pickup + dest pin)
- Mark map as "best-effort"
- Email still sent (notification continues)
```

### Notification email bounces

```text
Notification Service:
- Receives bounce notification from SES
- Update user record (email invalid)
- Send via alternate channel (push notification)
- Log for manual intervention
```

## What we have after bài 3

```text
✓ All functional flows complete
✓ Pre-trip: register, login, match, track
✓ During trip: location updates forwarded
✓ Post-trip: fare, payment, map, email

What's not yet:
✗ Scale to millions of users
✗ Multi-region
✗ Fast login (Bloom filter)
✗ Connection Manager service
✗ Geospatial indexing for matching

→ Bài 4 (scaling) + Bài 5 (Geohash)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Synchronous chain | Block on slow external | Choreography |
| Single orchestrator | SPOF | Event-driven |
| Lose location data | Map fail | Kafka retention |
| Sync email send during trip end | UX block | Async |
| Forget retry on payment | False failure | 3 retries + backoff |
| Map generated before locations stored | Empty | Kafka first, replay second |
| Notification before map ready | Email no map | Subscribe + cache pattern |
| No idempotency | Duplicate charges | Idempotency key in payment |

## Tóm tắt bài 3

- **Choreography pattern** for post-trip: 4 services chained via Kafka events.
- **Flow**: Trip → Payment + Map Generator → Notification.
- **Event sourcing** for map: replay location events from Kafka (7-day retention).
- **Dual subscribe** in Notification: cache map URL, send when payment event arrives.
- Map cached short TTL (only needed for emails).
- Failure handling: retries, fallbacks, compensation emails.
- Decoupled, independently scalable, resilient.
- Trade-off: harder tracing → trace_id in events.

**Bài kế tiếp** → [Bài 4: Scaling stateful + Bloom Filter](04-scaling-bloom-filter.md)
