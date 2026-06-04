# Bài 2: Ride Sharing — Step 4 (Services Architecture)

Bài 1 đã lock scope + state. Bài này design **7 services** với boundaries rõ ràng và explain WHY mỗi service tồn tại. Pattern key: **Driver Service + Rider Service đều stateful** (WebSocket), **Location Service** dedicated cho geospatial queries, **Matching Service** chứa business logic. Bài 3 sẽ extend với choreography post-trip.

## Service map

```text
[Edge]
- API Gateway (REST endpoints)
- Web App (HTML for register)

[User-facing services]
- Users & Drivers Service (auth, profile)
- Rider Service (rider WebSocket)
- Driver Service (driver WebSocket)

[Backend logic]
- Location Service (geospatial)
- Matching Service (business)
- Trip Service (lifecycle + metrics)
- Payment Service (external integrations)

[Post-trip — bài 3]
- Trip Map Generator
- Notification Service

[Async]
- Message Brokers (Kafka)

[Data]
- SQL DBs per service
- NoSQL high-perf for Location
- Object Store (profile images)
```

## Service 1: Users & Drivers Service

```text
Role: auth + profile for both riders and drivers

DB: SQL (Postgres) — chosen because:
- Schema stable
- ACID for credentials
- Foreign key to payment info

Tables:
  users:
    user_id, username (unique idx), email, password_hash,
    name, age, profile_image_url, created_at
  
  drivers:
    driver_id, username (unique idx), email, password_hash,
    name, license_number, vehicle_info (make, model, plate, color),
    profile_image_url, status (active/suspended), background_check_date

Object Store: profile images (S3)
```

Login flow:
```text
Rider/Driver → API Gateway → Users & Drivers Service
1. Check username exists (bài 4 optimizes with Bloom filter)
2. Verify password hash
3. Generate JWT token
4. Return: {user_type, user_id, auth_token}
```

## Service 2: Payment Service

```text
Role: integrate external payment gateways

DB: SQL (Postgres) — financial data needs ACID
Tables:
  user_payment_methods:
    user_id, stripe_customer_id, last4, brand, default_method
  
  driver_payouts:
    driver_id, bank_routing, bank_account_encrypted, ...
  
  transactions:
    transaction_id, trip_id, user_id, driver_id,
    amount_charged, amount_paid_to_driver, our_cut,
    stripe_charge_id, payout_id, status, created_at

External integrations:
- Stripe API: charge user's card
- Bank API: payout driver

Why separate from Users service:
- Different security model (PCI compliance)
- Different update frequency
- Different DB schema needs
```

## Service 3: Driver Service (STATEFUL)

```text
Role: maintain WebSocket connections with active drivers

Each instance:
- Accepts WebSocket upgrades
- In-memory map: driver_id → ws_connection
- Receives: location updates, trip start/finish
- Pushes: trip assignments

Why stateful + bi-directional:
1. 5s interval location updates: re-establishing TCP every 5s wasteful
2. System needs to push trip assignment to driver
3. Driver app keeps connection alive while online
```

Connection lifecycle:
```text
Driver app → Driver Service: WS upgrade w/ auth_token
Driver Service: validate token
Driver Service: add to local map
Driver Service → Connection Manager: register {driver_id → my_address}

[Driver online, exchanging messages]

Driver app closes:
Driver Service: remove from local map
Driver Service → Connection Manager: deregister
```

## Service 4: Location Service

```text
Role: own geospatial state per driver

DB: NoSQL high-performance (Redis with Geo commands, or Cassandra + indexes)
Schema:
  driver_locations:
    driver_id,
    lat, lng (current),
    geohash (computed — see bài 5),
    state (available/matched/in_trip),
    matched_trip_id (nullable),
    last_update_ts
  
  Future locations queue:
    For matched driver going toward pickup,
    estimated arrival, etc.

Why separate from Driver Service:
- Driver Service = WS handler (stateful)
- Location Service = location data (queryable)
- Different scaling needs
```

### Event-driven location updates

```text
Driver → Driver Service (WS): location_update {lat, lng}
Driver Service → Kafka topic "driver.location": event

Multiple consumers:
1. Location Service: update DB (current position + geohash)
2. Trip Service: append to trip path (for map generation)
3. Forwarder: if driver in trip, forward to assigned rider
```

### Why event-sourcing the location

```text
[Benefit 1: Decoupling]
Driver service doesn't wait for DB write.
"Fire and forget" → low latency for driver.

[Benefit 2: Replay for trip map]
All location events for a trip stored in Kafka (retention).
Trip Map Generator (bài 3) can read all events for a trip_id
and reconstruct path → generate map.
```

## Service 5: Rider Service (STATEFUL)

```text
Role: maintain WebSocket with riders

Each instance:
- Accepts WS upgrades
- In-memory map: rider_id → ws_connection

Receives:
- request_ride

Pushes:
- driver_found
- driver_location_update (during pickup)
- trip_completed

Same pattern as Driver Service. Connection Manager tracks rider → server.
```

## Service 6: Matching Service

```text
Role: business logic for matching

Stateless (easy to scale).

Logic:
1. Receive request_ride from Rider Service
2. Query Location Service: "find drivers in 1km radius of rider"
3. Get back list of (driver_id, lat, lng) candidates
4. Call external ETA service (Google Maps API):
   "ETAs for these driver_lat,lng → rider_lat,lng (traffic-aware)"
5. Apply business rules:
   - Lowest ETA wins (default)
   - Or driver who's been waiting longest (fairness)
   - Or pool: existing in-trip driver close to dropping off + new rider en route
6. Send match to chosen driver via Driver Service
7. Send confirmation to rider via Rider Service
```

### Match flow detail

```text
Step A: Rider Service publishes "ride.requested" event with rider_id, pickup, dest
Step B: Matching Service consumes
Step C: Matching Service queries Location Service (geospatial query)
Step D: Matching Service calls external ETA API (batch)
Step E: Matching Service applies decision logic
Step F: Matching Service:
  - Creates trip record in Trip Service
  - Updates Location Service: "driver X assigned to trip Y, destination Z"
  - Notifies driver via Driver Service (lookup via Connection Manager)
  - Notifies rider via Rider Service
```

## Service 7: Trip Service

```text
Role: trip lifecycle state + analytics data

DB: SQL (Postgres) — relational, queries for billing
Tables:
  trips:
    trip_id, rider_id, driver_id,
    pickup_lat, pickup_lng, dest_lat, dest_lng,
    pickup_address, dest_address (geocoded),
    requested_at, matched_at, started_at, ended_at,
    base_fare, time_seconds, distance_meters,
    total_fare, driver_payout, our_cut,
    status (matched/in_progress/completed/canceled)
  
  trip_paths (cold storage):
    trip_id, path JSONB (list of {lat, lng, ts})
    -- Optionally reconstructed from Kafka events lazily
```

### Why separate Trip from Location Service

```text
[Location Service]
- Current state per driver
- Few records per driver, many writes per second
- Optimized for "find drivers near X"

[Trip Service]
- Historical trip records
- Many records, fewer writes per second
- Optimized for: list user's trips, billing query, analytics

Different access patterns → different storage strategy.
```

## Connection Manager Service (preview of bài 4)

Like messaging case study:
```text
Role: registry driver_id/rider_id → which server they're connected to

Tech: Redis (high-perf KV)

Used when Matching Service decides match:
- Lookup which Driver Service instance has driver D
- Send match message there
- That instance pushes via WS
```

Bài 4 deep dives this.

## Architecture diagram so far

```text
                          [Client apps]
                             │   │
                  HTTP REST  │   │  WebSocket
                             ▼   ▼
                       [API Gateway]   [WS Load Balancer]
                             │              │
        ┌───────┬──────┬─────┘     ┌────────┴────────┐
        ▼       ▼      ▼           ▼                 ▼
   [Users  [Payment] [Web   [Driver Svc x N]   [Rider Svc x N]
   /Driver  Svc]      App]   (stateful WS)     (stateful WS)
    Svc]                          │                 │
        │                         └────────┬────────┘
        ▼                                  │
   [Postgres]                              ▼
                                  [Kafka driver.location
                                          ride.requested]
                                            │
                          ┌─────────────────┼─────────────┐
                          ▼                 ▼             ▼
                  [Location Service]  [Matching Svc]  [Trip Svc]
                       │                 │              │
                       ▼                 │              ▼
                 [Redis/Cassandra]       │           [Postgres]
                  geospatial              │
                                          ▼ external
                                  [Google Maps ETA API]
```

## What's not here yet

```text
- Post-trip workflow (Bài 3)
- Bloom filter for fast login (Bài 4)
- Connection Manager service detail (Bài 4)
- Geohash for fast nearby search (Bài 5)
- Multi-region (Bài 4)
```

## Trade-offs in this architecture

### Stateful services vs stateless

```text
[Driver Service stateful — required]
Need to push messages from system to specific driver.
Map driver_id → connection only exists in memory of one server.
Alternative: bus all messages everywhere (broadcast) → wasteful.

[Matching Service stateless — choice]
Could be stateful (cache driver list).
But: state changes rapidly (drivers join/leave).
Better: query Location Service per request.
```

### Location data on every event

```text
[Choice: append every location update]
1.7B/day events to Kafka
Cost: Kafka storage + processing

[Alternative: only on state change]
Lower volume, but loses trip path reconstruction ability

→ Chose append-every. Storage cheap (Kafka retains 7 days).
```

### Separate Trip + Location service

```text
Could merge into 1 service.
But: vastly different access patterns + storage tech.
Separation = each tuned independently.
```

## API summary (so far)

```text
[Rider HTTP]
POST /api/v1/auth/register
POST /api/v1/auth/login
PUT  /api/v1/users/me/payment   → set credit card

[Driver HTTP]
POST /api/v1/auth/login
PUT  /api/v1/drivers/me/payout  → set bank info

[Rider WS]
WS  /ws/rider
Send: {type: "request_ride", pickup, dest}
Recv: {type: "driver_found", driver_info, eta_seconds}
Recv: {type: "driver_location", lat, lng}
Recv: {type: "trip_completed", fare, receipt_url}

[Driver WS]
WS  /ws/driver
Send: {type: "join"}
Send: {type: "location", lat, lng}
Send: {type: "start_ride"}
Send: {type: "finish_ride"}
Recv: {type: "trip_assigned", rider_info, pickup, dest}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Single mega-service | Hard to scale | Service per domain |
| Merge Driver + Rider svc | Coupling | Separate stateful svcs |
| Sync DB write blocking driver | Latency hit | Kafka event |
| Strong consistency match | Performance hit | Async matching |
| Forget multi-rider pool | Missed revenue | Match logic supports |
| Hardcode ETA | No traffic awareness | External API |
| Trip in Location Service | Mixed responsibility | Separate Trip Service |

## Tóm tắt bài 2

- **7 services**: Users/Drivers, Payment, Driver, Rider, Location, Matching, Trip.
- **Stateful**: Driver Service + Rider Service (WebSocket connections).
- **Location Service**: dedicated geospatial state, Redis/Cassandra optimized.
- **Matching Service**: stateless business logic, queries Location + calls external ETA.
- **Trip Service**: lifecycle + analytics + billing source of truth.
- Event-driven via Kafka: driver.location, ride.requested.
- Trip path reconstructable from Kafka events.
- Connection Manager needed (bài 4) for routing in stateful WS world.

**Bài kế tiếp** → [Bài 3: Post-Trip Choreography](03-post-trip-choreography.md)
