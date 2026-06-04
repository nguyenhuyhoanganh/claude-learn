# Bài 1: System Design Interview — Final Tips + Time Management

12 phases qua, bạn đã master process + apply qua 5 case studies. Bài cuối cùng: dùng kiến thức này để **crack system design interview** ở FAANG/big tech. Format, 5 tips quan trọng, time management cho 45-min interview. Đây là consolidation cho job application context.

## Interview format

```text
[Typical 45-min system design interview]

Setup:
- Interviewer: senior engineer or architect
- You: candidate
- Whiteboard / virtual whiteboard
- Prompt: vague, high-level

Example prompts:
- "Design a chat application"
- "Design Instagram"
- "Design a parking lot system"
- "Design a URL shortener"

Goal: simulate real-world scenario where you receive vague
brief from non-technical PM/executive and must:
1. Clarify requirements
2. Translate to technical
3. Design implementable architecture
```

→ Everything in this course **directly applies**. Only difference: 45-min limit.

## What's being assessed

```text
[Beyond final design quality]
- Communication skills
- Handling ambiguity
- Right level of abstraction (not too high, not too low)
- Trade-off awareness
- Time management
- Asking clarifying questions
- Documenting decisions

[NOT being assessed]
- Memorized specific architectures
- Perfect knowledge of every technology
- Optimal solution (no such thing exists)
```

## Tip 1: Don't Panic

```text
[Most common reaction]
"I've never designed X before, I'm screwed"

[Reality]
- Ambiguity is intentional
- Interviewer WANTS to see how you handle the unknown
- Memorization doesn't work in system design
- You have the 5-step process from this course

[Approach]
Treat it like "another day in the office":
1. Hear prompt
2. Apply 5-step process
3. Communicate as you go
4. Trade-offs explicit

You've done this 5 times in this course. Reflex now.
```

### What to say (not panic)

```text
[Bad — panicking]
"Uh, I've never designed Instagram. Let me think..."

[Good — confident]
"Great, let me start by understanding the requirements.
I want to ask a few clarifying questions before we dive
into the design."
```

## Tip 2: Communicate to clarify scope

```text
[Worst mistake]
Hear "Design Instagram" → start drawing boxes

[What you should do]
"Before I design, let me understand:
- Are we focused on photo sharing, or also Stories, Reels?
- Public profiles or private accounts?
- DMs in scope?
- Search by hashtag?
- Authentication already given or design that?
- What scale? 100M DAU? 1B DAU?"

→ Spend 5-7 min on clarifying questions
→ Shows seniority, avoids wrong direction
```

### Clarifying ask pattern

```text
[Template]
"Before I design, I want to clarify a few things:

[Feature scope]
1. Is X feature in scope?
2. Is Y feature in scope?
3. What about Z?

[Scale]
4. How many users?
5. Read/write ratio?
6. Latency target?

[Existing systems]
7. Is auth given to us?
8. Are external APIs we can call?

Any preferences I should be aware of?"
```

### Don't assume you understand

```text
[Trap]
"I've used Instagram, so I know what to design"

[Reality]
Interviewer's definition might differ:
- Maybe they want messaging-first
- Maybe limited to enterprise use
- Maybe specific compliance constraint

Even if you think you understand, GO THROUGH the clarifying step.
Worst case: 30 seconds wasted. Best case: avoid 30 min wrong direction.
```

## Tip 3: Distinguish large-scale vs OOP

```text
[Important distinction]
"System design interview" is overloaded term:

Type A: Large-scale distributed system design
- "Design Instagram" — what this course covers
- Focus: services, DBs, scaling, NFRs

Type B: Single-application object-oriented design
- "Design a parking lot system"
- "Design a vending machine"
- Focus: classes, interfaces, design patterns

These are DIFFERENT interviews.
Sometimes companies don't distinguish in the name.

[How to figure out which]
Ask: "Is this a single application or a large-scale distributed system?"
Or: "What's the scale we should design for? Tens of users or millions?"

If small scale: pivot to OOP design (class diagram, design patterns)
If large: this course applies
```

### Run numbers when large-scale

```text
[Why important]
Demonstrate you don't apply scale tools without justification.

[Example]
"Given 500M DAU and average user uploads 1 image/day:
- That's 500M images/day
- ~6K image uploads/sec peak
- At 5MB per image: 2.5 PB/day raw
- This justifies CDN, S3, sharding

Without these numbers, those decisions would be premature."
```

→ Shows engineering rigor.

## Tip 4: Document on whiteboard

```text
[Often overlooked]
At end of interview:
- Interviewer takes whiteboard snapshot
- Sends to hiring committee
- They make decision WITHOUT seeing your verbal explanation

[Implication]
What's on the board matters as much as what you say.

[Document]
✓ Requirements list (FRs + NFRs)
✓ API endpoints
✓ Architecture diagram (boxes + arrows)
✓ Numbers (DAU, QPS, storage)
✓ Key trade-offs called out

[Side benefit]
Organizes your own thinking.
Prevents losing track of progress.
```

### Whiteboard structure suggestion

```text
[Top-left: Requirements]
Functional:
- Feature 1
- Feature 2
- ✗ Out: Feature X

Non-functional:
- 500M DAU
- 99.99% avail
- P99 < 1s

[Top-right: Numbers]
- Read QPS: 200K
- Write QPS: 6K
- Storage: 250 TB/day

[Center: Architecture diagram]
Components + arrows

[Bottom: Trade-offs and notes]
- Chose X over Y because Z
- Eventually consistent for feed
- ...
```

## Tip 5: Think out loud

```text
[Why critical]
System design has no single correct answer.
Interviewer can only assess your reasoning if you SHARE it.

[What to verbalize]
- Why this DB choice (SQL vs NoSQL)?
- Why this consistency model?
- Why this caching layer?
- Why this trade-off?
- What alternatives considered?

[Side benefit]
If you go wrong direction, interviewer can interrupt:
"Have you considered approach X?"
Course-correction saves time vs going deep in wrong direction.

[Hint balance]
Getting some hints is normal (ambiguity inherent).
Getting many hints = red flag.
Sweet spot: think out loud, accept gentle redirection.
```

### Verbalize trade-offs

```text
[At every decision point]

"For the user database, I'm choosing NoSQL document store
(MongoDB) over SQL.

Reason: schema has many optional fields that will evolve.
NoSQL handles schema evolution cleanly.

Trade-off: we lose JOINs and ACID transactions.
Mitigation: user data accessed by primary key only,
no relational queries needed."
```

→ This level of clarity = senior signal.

## Tip 6: Explicit trade-offs everywhere

```text
[Worst pattern]
"I'll use X."

[Best pattern]
"I'll use X because [reason]. The trade-off is [what we lose].
Alternative would be Y, but it doesn't fit because [reason]."

[Examples to internalize]
- Strong vs eventual consistency
- SQL vs NoSQL
- Push vs pull (feed, notifications)
- Sync vs async (writes, fanout)
- Sharding vs replication
- Cache vs DB lookup
- CDN vs origin
- Microservice vs monolith
```

### "Imperfect is OK"

```text
[Don't try for perfect]
In 45 min you cannot evaluate everything.
"Perfect design" doesn't exist anyway.

[Show signal]
Demonstrate you WOULD evaluate properly given time:
"For brevity, I'm assuming X. In production we'd validate
this with [profiling / load testing / data analysis]."

This shows engineering maturity.
```

## Time management for 45-min interview

```text
Recommended allocation:

[0-7 min] Step 1+2: Functional + Non-functional Requirements
- Clarify scope
- Get numbers (DAU, QPS, storage)
- Determine if large-scale

[7-15 min] Step 3: API + Sequence diagram
- Key endpoints
- 1-2 sequence diagrams for critical flows
- Don't need fully complete diagram

[15-30 min] Step 4: High-level architecture
- Boxes + arrows for main components
- Database choices justified
- 1-2 deep-dive areas if appropriate

[30-45 min] Step 5: Optimize for NFRs
- Sharding
- Caching
- HA + replication
- 1-2 specific bottleneck deep-dives

[Buffer: 5 min wrap-up if time]
- Discussion + Q&A
- Highlight what's missing
- Note future improvements
```

### Pacing self-check

```text
[At 7 min]
Should have: requirements + numbers on board
If still clarifying: move on, capture key items, proceed

[At 15 min]
Should be drawing architecture
If still on API: simplify, sketch architecture next

[At 30 min]
Should be optimizing
If still drawing initial: address NFRs verbally

[At 40 min]
Should be wrapping up
If deep in one area: surface back to summary
```

## Common interview mistakes

| Mistake | Fix |
|---|---|
| Skip clarifying questions | 5 min always for clarification |
| Jump to tech ("I'll use Kafka") | Justify first, name tech second |
| Single mega-DB | Service per domain, DB per service |
| Forget back-of-envelope | Numbers drive decisions |
| Don't verbalize | Continuous think-aloud |
| Over-engineer for small scale | Match complexity to scale |
| Strong consistency everywhere | Per-feature C/A decision |
| Stuck on one component 20 min | Move on, return if time |
| Don't acknowledge trade-offs | Always state pros + cons |
| Try to "win" debate with interviewer | Listen, integrate feedback |

## What separates senior from mid-level

```text
[Mid-level signals]
- Knows the tools (Kafka, Redis, Cassandra)
- Can draw architecture diagrams
- Mentions sharding + replication

[Senior signals]
- Asks clarifying questions automatically
- Justifies every tech choice
- States trade-offs explicitly
- Distinguishes scale tiers (10K, 1M, 1B users)
- Identifies bottlenecks before they're problems
- Comfortable saying "I'd validate this with data"
- Calls out what's NOT in scope
- Considers cost, operability, not just functionality
```

→ This course gives you senior signals. Practice = reflex.

## Practice plan

```text
[For upcoming interview prep]

Week 1: Re-read this course phases 1-6 (foundations)
Week 2: Re-do Phase 8 (Image Sharing) WITHOUT looking at solution
Week 3: Re-do Phase 9 (VOD) and Phase 10 (Messaging)
Week 4: Re-do Phase 11 (Typeahead) and Phase 12 (Ride Sharing)

For each:
- 45 min timed
- Whiteboard physical or virtual
- Talk out loud (record yourself)
- Compare with course solution at end

[Also practice common problems]
- URL shortener (TinyURL)
- Twitter feed
- Notification system
- Distributed cache
- Web crawler
- Search engine (high-level)
- Payment processing
- Recommender system

[Mock interview]
- Schedule with peer or service (Pramp, interviewing.io)
- Get feedback from real engineers
```

## Mental model

```text
[Throughout interview]

Mind shift 1:
"They want to see my thinking, not perfect design."

Mind shift 2:
"Ambiguity is intentional, not adversarial."

Mind shift 3:
"Trade-offs are the point, not bugs to hide."

Mind shift 4:
"Communication > correctness."

Mind shift 5:
"I have a process. Use it."
```

## Final words

```text
After this course you have:
✓ 5-step design process
✓ Quality attributes mental model
✓ API + sequence diagram fluency
✓ Architecture pattern catalog
✓ 5 case studies practiced
✓ Scaling tools (sharding, replication, caching, CDN)
✓ Specialized patterns (CQRS, MapReduce, event sourcing, choreography)
✓ Bloom filter, Geohash, advanced data structures
✓ Interview-specific strategies

This is the foundation of a senior software architect.

Build a few hobby projects applying these.
Read engineering blogs (Uber, Netflix, Discord, Stripe).
Watch system design talks (InfoQ, QCon).
Keep practicing.

The skills compound. Senior in 1-2 years if you practice deliberately.
```

## Tóm tắt bài 1

- 45-min interview, same process as course.
- **5 tips**:
  1. Don't panic — ambiguity is intentional.
  2. Communicate to clarify — 5-7 min on requirements.
  3. Distinguish large-scale vs OOP — ask early.
  4. Document everything on whiteboard.
  5. Think out loud — trade-offs explicit.
- **Time budget**: 7 min Req → 8 min API → 15 min HLA → 15 min Optimize.
- Common mistakes: skip clarification, tech without justify, strong consistency everywhere.
- Senior signal: ask clarifying, justify all choices, explicit trade-offs.
- Practice plan: re-do case studies + common problems + mock interviews.

🎉 **PHASE 13 + COURSE COMPLETE** 🎉

---

## 🏆 Toàn bộ Software Architecture & System Design Curriculum

```text
[Phase 1] Requirements + Architectural Drivers
[Phase 2] Quality Attributes (perf, scale, avail, fault tolerance, SLA)
[Phase 3] API Design (REST, RPC)
[Phase 4] Infrastructure (DNS, LB, GSLB, broker, API GW, CDN)
[Phase 5] Databases (SQL, NoSQL, CAP, sharding, unstructured)
[Phase 6] Architecture Patterns (multi-tier, microservice, event-driven, lambda)

[Phase 7] Case Study Methodology (3 mindsets, 5-step process)
[Phase 8] Image Sharing (Instagram-scale, materialized view, celebrity hybrid)
[Phase 9] VOD Streaming (Netflix-scale, pipes-filters, ABR, multi-CDN)
[Phase 10] Real-Time Messaging (WhatsApp-scale, WebSocket, Connection Mgr)
[Phase 11] Typeahead (Google-scale, CQRS + MapReduce, Shard Manager)
[Phase 12] Ride Sharing (Uber-scale, state diagram, Bloom Filter, Geohash)
[Phase 13] Interview Tips + Time Management
```

You've completed the most comprehensive Vietnamese-first system design curriculum.

**Build, ship, design.** Future projects you architect rest on this foundation.

🚀 Chúc mừng — bạn đã trở thành senior architect material.
