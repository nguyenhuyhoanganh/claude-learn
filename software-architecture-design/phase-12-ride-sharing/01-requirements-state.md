# Bài 1: Ride Sharing — Requirements + State Diagram

Đây là case study **phức tạp nhất** trong khóa: 5 parts. Tại sao? Vì ride sharing có **3 actor types** (rider, driver, system), **real-time location** (1.7B updates/day), **stateful matching** (driver progresses qua nhiều state), và **post-trip choreography** (payment + map + notification). Bài này lock scope với state diagram — pattern mới giúp document hành vi driver xuyên suốt lifecycle.

## Vấn đề

```text
"Design a ride sharing service (Uber/Lyft-like)"
```

Riders + Drivers + Payment + Real-time tracking. Ai cũng nhăn mặt nhìn khi nghe.

## Clarifying questions

```text
[Payment]
- Process credit card ourselves?
- Issue receipts? Handle payroll?

[ETA]
- Calculate ourselves or use external?

[Sharing]
- 1 driver = 1 rider? Or pool rides?

[Pricing]
- Time? Distance? Surge? Formula yet?

[Registration]
- Ad-hoc usage or require sign-up?

[Driver onboarding]
- We design that? Or out of scope?
```

## Step 1: Functional requirements (locked scope)

```text
[User-facing]
✓ Rider registration + login
✓ Real-time ride request matching
✓ Post-trip receipt + map by email
✓ Track driver location during trip

[Driver-facing]
✗ Driver registration (out of scope — done via background check + inspection)
✓ Driver login
✓ Join available pool
✓ Receive ride assignment
✓ Track + report location every 5-10s
✓ Start + finish ride

[Matching]
✓ Find drivers physically close
✓ Get real-time ETA (use external service)
✓ Match closest by traffic-aware ETA
✓ Support pool sharing (multiple riders, 1 driver)

[Pricing]
✓ Track time + distance accurately
✓ Formula: TBD — base + time + distance
✗ Surge pricing (v2)

[Payment]
✓ Charge rider (via external gateway)
✓ Pay driver (via external bank API)
✗ Implement credit card processing (use 3rd party)
✗ Build payroll system

[Maps]
✓ Generate trip path map
✓ Email to both rider + driver
```

## Step 2: Non-functional requirements

### Scale

```text
[Users]
- Millions of daily users (global)
- Hundreds of thousands of active drivers
- Operations in many countries + cities

[Traffic patterns]
- Peak (Friday evening, holidays, events): 10x average
- Off-peak (early morning): minimal
- Must scale BOTH up + down quickly

[Location updates]
- Every 5-10 seconds per active driver
- 200K drivers × 6 updates/min × 60 min × 24 hr = 1.7B updates/day
- ~20K location messages per second steady
```

### Availability

```text
[Target]
99.99% (4 nines)

[Why high]
- People depend on ride to airport (don't miss flight)
- No public transit alternative in many areas
- Competitors waiting to take share
- Outage = customer migration
```

### Performance

```text
[Login error response]
< 100ms when username mistyped
Reasoning: user can correct quickly, retry faster
This is super strict — bài 4 uses Bloom filter for this

[Match driver to rider]
- P50: < 5s
- P99: < 10s (busy times / crowded places)

[Why looser]
- User accepts "looking for driver..." spinner up to 10s
- Beyond 10s: user gives up, opens competitor app
- Sub-5s typical = good UX
```

## Step 3: Sequence + state diagrams

### Sequence diagram

```text
[Driver flow]
Driver → System: login
System → Driver: auth_token

Driver → System: join (now available)
Driver ↔ System: long bi-directional connection (WebSocket)
Driver → System (every 5s): location update {lat, lng}

[Rider flow]
Rider → System: register
Rider → System: login → auth_token

Rider → System: request ride {pickup_lat, pickup_lng, dest_lat, dest_lng}

[Matching]
System: find nearby drivers
System: get ETAs (external API)
System: pick best driver

System → Driver: trip assigned (rider info, pickup, destination)
System → Rider: driver found (vehicle info, ETA)

[En route]
Driver → System: location updates
System → Rider: forwards driver location

[Trip]
Driver → System: start ride
[trip in progress, location updates continue]
Driver → System: finish ride

[Post-trip async]
System: calculate fare
System → Payment Service: charge rider, pay driver
System → Map Service: generate trip map
System → Notification: email receipt + map to both
```

### State diagram — Driver lifecycle

State diagrams supplement sequence diagrams for entities with **multiple states + transitions**:

```text
                  [Logged Out]
                       │ login
                       ▼
              [Logged In / Available]    ← not paid, can match
                       │ matched
                       ▼
              [Matched / En Route]       ← not paid yet, exclusive
                       │ start_ride
                       ▼
                  [In Trip]              ← getting paid
                       │ finish_ride
                       ▼
             [Logged In / Available]
                       │ logout
                       ▼
                  [Logged Out]
```

**Insight**: in "In Trip" state, driver is **eligible for next match** if close to finishing. System uses this for "back-to-back" rides — driver stays earning continuously.

### Why state diagram matters here

```text
[Without state model]
- Code: nested if-else "is driver online? in_trip? paid?"
- Bugs: edge cases miss (matched + receive duplicate match)
- Hard to evolve

[With state model]
- Clear allowed transitions
- Each state has clear payment rules
- New state added cleanly (e.g. "Break" between rides)
```

## API outline (full detail in bài 2)

```text
[Auth]
POST /api/v1/auth/login
POST /api/v1/auth/register (riders only)

[Driver — via WebSocket]
WS  /ws/driver
Messages:
- {type: "join"}
- {type: "location_update", lat, lng}
- {type: "trip_started"}
- {type: "trip_finished"}
Receive:
- {type: "trip_assigned", rider_info, ...}

[Rider — via WebSocket]
WS  /ws/rider
Messages:
- {type: "request_ride", pickup, destination}
Receive:
- {type: "driver_found", driver_info, eta}
- {type: "driver_location_update", lat, lng}
- {type: "trip_completed", fare}
```

## Trade-offs locked

```text
[Bi-directional protocol — required]
Both rider + driver need pushed updates.
HTTP polling impractical at 5s interval × 200K drivers.
WebSocket (or similar) mandatory.

[External services]
- ETA: Google Maps API or similar
- Payment: Stripe / Adyen
- Bank payout: bank-specific APIs
We don't build these. We integrate.

[Real-time matching]
Strong consistency NOT required for matching.
"Found this driver" is acceptable even if another driver
became available 100ms ago.

[Pricing flexibility]
Formula will change. Architecture must allow without rebuild.
Trip Service stores raw data (time, distance, locations).
Formula computed at trip end, not stored eagerly.
```

## What's hard about this design

```text
[Challenge 1: Real-time location at scale]
1.7B updates/day → 20K msgs/sec steady
Each update needs storage + processing
Bài 5 solves with Geohash

[Challenge 2: Stateful driver connections]
WebSocket = stateful (already saw in messaging)
Routing matched ride to right driver server
Bài 4 solves with Connection Manager Service

[Challenge 3: Match latency]
Within 10s: find nearby + ETA + decide
At peak: thousands of concurrent requests
Bài 5: spatial index makes O(few) instead of O(N)

[Challenge 4: Login under 100ms]
Even DB miss = 50-100ms
Bài 4 uses Bloom filter for fast reject

[Challenge 5: Post-trip workflow]
4 services chain: trip → payment → map → notification
Failure handling required
Bài 3: choreography pattern
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Build payment processing | Months wasted | Use Stripe |
| Build ETA calculation | Data scale impossible | Google Maps API |
| Skip state diagram | Edge case bugs | Document states |
| HTTP polling for location | Server melt | WebSocket |
| Strong consistency match | Over-engineered | Eventually OK |
| Hardcode pricing formula | Can't iterate | Store raw, compute at end |
| In-trip = no matching | Driver idle time | Match if close to dest |

## Tóm tắt bài 1

- Scope: rider register/login, driver login, matching, real-time tracking, post-trip email receipt + map.
- Out: payment processing (Stripe), ETA (Google Maps), driver onboarding.
- Scale: 1M+ riders, 200K active drivers, 1.7B location updates/day, 10x peak.
- SLA: 99.99% availability, login error < 100ms, match P50 < 5s P99 < 10s.
- **State diagram** documents driver lifecycle: Logged Out → Available → Matched → In Trip → Available → Logged Out.
- **Key insight**: "In Trip" driver still eligible for back-to-back match if close to dest.
- 5 hard challenges → 5 bài.

**Bài kế tiếp** → [Bài 2: Services Architecture (Step 4)](02-services-architecture.md)
