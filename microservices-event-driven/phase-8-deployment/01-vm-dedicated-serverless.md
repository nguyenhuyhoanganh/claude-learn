# Bài 1: Lựa chọn infrastructure — VM, Dedicated Hosts, Serverless

50 microservice cần chạy ở đâu? Cloud VM rẻ, share hardware. Dedicated host = đắt nhưng isolated. Serverless = pay-per-use cho rare workloads.

Mỗi option có **trade-off rõ** về cost, security, performance. Chọn sai = cháy budget hoặc cháy SLA.

## Option 1: Cloud Virtual Machines (multi-tenant)

> **VM** = máy ảo chạy trên physical server, managed bởi **hypervisor**. Multiple VMs share 1 server.

```text
Physical Server (cloud provider's)
  +─────────────────────────────────────+
  │  Hypervisor (Xen, KVM, Hyper-V)     │
  +─────────────────────────────────────+
  │ VM-1     │ VM-2     │ VM-3     │ VM-4│
  │ Acme Co  │ Acme Co  │ XYZ Co   │YouCo│
  │ DB inst  │ App inst │ Web srv  │ App │
  +──────────┴──────────┴──────────┴─────+
```

Multiple **tenants** (different companies) share same hardware. Hypervisor isolate VMs.

### Examples

- AWS EC2 (t3.medium, m5.large, ...).
- Google Compute Engine.
- Azure VMs.
- DigitalOcean Droplets.
- Linode.

### Pricing

```text
Pay-per-use:
  - $0.05 / hour for small VM.
  - $0.50 / hour for large VM.
  - Charge while running.
  - Spot / preemptible cheaper (interruptible).
  - Reserved instances cheaper (1-3 year commitment).
```

Most cost-effective for typical microservices.

### Pros

- ✓ **Affordable**, flexible pricing.
- ✓ **On-demand** scale: spin up/down trong phút.
- ✓ **Variety**: 100+ instance types (CPU, mem, GPU, network).
- ✓ Mature ecosystem.

### Cons

#### Con 1: Multi-tenancy security risk

Hypervisor là software written by humans. Bugs exist. Theoretically isolated, but:

- 2018: **Meltdown / Spectre** CPU vulnerabilities → cross-VM data leak possible.
- 2021: AWS / Azure had hypervisor patches for various CVE.

Probability low, but **not zero**.

Industries that cannot tolerate this risk:
- **Banking** (PCI, SOX compliance).
- **Healthcare** (HIPAA).
- **Government / defense**.
- **Crypto exchanges**.

#### Con 2: Noisy neighbor — performance variance

Hypervisor splits CPU cores 8/8 cleanly. But:
- **Network bandwidth**: shared NIC.
- **Storage I/O bus**: shared.
- **CPU cache**: shared L3 cache.
- **Memory bandwidth**: shared.

Other tenant on same host runs CPU-heavy workload → your latency p99 spikes randomly.

Sensitive workloads:
- High-frequency trading.
- Real-time gaming.
- Live video streaming / WebRTC.

VMs noisy neighbor unacceptable.

## Option 2: Dedicated Instances / Dedicated Hosts (single-tenant)

> Cloud provider runs your VMs only on hardware your account owns. No other tenant.

### 2 levels:

**Dedicated Instance**: VM still managed by hypervisor, but only your VMs on the host.

**Dedicated Host**: you rent **entire physical server**. Direct hardware access. Can choose hypervisor or none.

### AWS examples

- EC2 Dedicated Instance: ~10% premium over regular.
- EC2 Dedicated Host: ~30-100% premium.

### Pros

- ✓ Multi-tenancy security risk eliminated (single tenant).
- ✓ Dedicated Host: no noisy neighbor (you control all workloads on host).
- ✓ Compliance: many regulations allow only dedicated.
- ✓ License optimization (Oracle, SQL Server licensed per core — dedicated host helps).

### Cons

- ✗ **Expensive**: 30-100%+ premium.
- ✗ **Underutilized**: if your workload < host capacity, you pay for unused capacity.
- ✗ Less flexibility (can't fit any size into reserved host).

## Option 3: Serverless / Function-as-a-Service (FaaS)

> Cloud provider auto-manage deploy + scale + run. You give code + event trigger. Pay per execution.

### Examples

- **AWS Lambda**.
- **Google Cloud Functions** / **Cloud Run**.
- **Azure Functions**.
- **Cloudflare Workers** (edge).
- **Vercel / Netlify Functions** (frontend-focused).

### How it works

```text
1. You upload function code (Java JAR, Node.js, Python, Go, etc.).
2. Configure trigger: HTTP request, S3 upload, Kafka event, cron schedule.
3. Cloud provider:
   - On event: spin up runtime (container, microVM).
   - Run your function.
   - Tear down (or keep warm).
4. You pay per invocation + execution time + memory.
```

### Pricing example (AWS Lambda)

```text
$0.20 per million requests.
$0.0000166667 per GB-second.

Function: 128 MB RAM, runs 500ms.
= 0.128 GB × 0.5s = 0.064 GB-s per request.
× 1M requests = 64,000 GB-s × $0.0000166667 = $1.07.
+ $0.20 request fee.
= $1.27 per million requests.

For 0 traffic: $0.
```

vs always-on VM 24/7: small VM ~$30/month for nothing.

### When FaaS perfect — 2 patterns

#### Pattern A: Seasonal / spike workload

```text
Live event ticket reservation service:
  - 1 event / month.
  - 99% sales in 30 min when reservation opens.
  - Rest of month: ~0 traffic.

On VM:
  - Pay 24/7 for idle hardware.
  - Set up autoscaling + load balancer.
  - Cost: $500/month for capacity to handle peak.

On Lambda:
  - $0 idle.
  - Spike: Lambda auto-scales to thousands concurrent.
  - Cost: maybe $20-50 for entire month.
```

#### Pattern B: Rare batch processing

```text
Quarterly report generator for 1000 customers:
  - Triggered: 4 times/year per customer = 4000 invocations/year.
  - Each takes ~1 min.

On VM: $30/month always-on = $360/year for service that runs 67 hours total.
On Lambda: 4000 × 60s × small mem = ~$5/year.
```

### Pros

- ✓ **Zero idle cost**.
- ✓ **Auto-scale** infinite (handled by cloud).
- ✓ **Less ops**: no servers to patch.
- ✓ **Fast deployment**: upload code, configured.

### Cons

#### Con 1: Cost explosion for high-traffic

```text
Service grows 10× traffic:
  - Lambda cost: linear scale → 10× more.
  - VM cost: still same VM (or 2× VMs).
  
At certain threshold, Lambda becomes much more expensive.
```

Rough breakeven: ~30-40% utilization, Lambda ≥ VM cost.

#### Con 2: Cold start latency

```text
First request to inactive function:
  - Spin up runtime: 100ms - several seconds.
  - Run code.

Subsequent requests: fast (warm).
```

Unacceptable for latency-sensitive APIs. Mitigations:
- **Provisioned concurrency** (always-warm instances) → no longer "true serverless" cost-wise.
- Use **Cloud Run** (container-based, can stay warm).

#### Con 3: Performance unpredictable

Multi-tenant + cold-start + memory limits → latency p99 highly variable.

#### Con 4: Vendor lock-in

Lambda code uses AWS-specific APIs (DynamoDB SDK, S3, etc.). Hard to migrate to GCP / Azure.

Frameworks like **Serverless Framework** abstract somewhat, but business logic glue still locks in.

#### Con 5: Security

- Source code uploaded to cloud (provider sees it).
- Multi-tenant container runtime.
- Generally fine for typical workloads, not for crown-jewel secrets.

#### Con 6: Limited execution time

AWS Lambda max 15 min. Long-running jobs need other option.

#### Con 7: Cost predictability

Pay-per-use = unpredictable monthly bill. Hard for finance.

## Comparison table

| Dimension | VM (multi-tenant) | Dedicated host | FaaS (Lambda) |
|---|---|---|---|
| Pricing | $/hour, on-demand | $/hour, premium | $/invocation + $/time |
| Idle cost | Full (pay while running) | Full | Zero |
| Peak handling | Manual / autoscale | Manual / autoscale | Auto, infinite |
| Cold start | None (warm) | None | Yes (100ms-seconds) |
| Multi-tenant risk | Yes (small) | No | Yes (very small) |
| Noisy neighbor | Yes (mild) | No | Possible |
| Ops effort | Moderate (patching, scaling) | Moderate | Low |
| Latency p99 | Predictable | Most predictable | Variable |
| Vendor lock-in | Low | Low | High |
| Max runtime | Unlimited | Unlimited | 15 min (Lambda) |
| Best for | Most workloads | Compliance, perf-critical | Rare, spiky, event-driven |
| Cost predictability | Good | Excellent | Variable |

## Decision tree

```text
Compliance/regulation requires single-tenant? ──Yes──► Dedicated Host
                                                │
                                                No
                                                │
                                                ▼
Workload very rare / spike-heavy? ──Yes──► FaaS (Lambda)
                                  │
                                  No
                                  │
                                  ▼
Latency p99 critical < 100ms? ──Yes──► VM (with reserved + carefully tuned)
                              │
                              No
                              │
                              ▼
Default: VM (multi-tenant) cost-effective + flexible.
```

## Hybrid in practice

Real microservices system mixes:
- **Most services** on VMs (or containers on VMs — bài tiếp).
- **Background jobs / cron** on FaaS.
- **Spike-prone APIs** (sign-up, contest) on FaaS.
- **Latency-critical** (real-time gaming) on dedicated.
- **Regulated data** (PII processing) on dedicated.

No "one infrastructure fits all" rule. Match workload to infra.

## Real-world examples

- **Netflix**: most on AWS EC2 (multi-tenant), some workloads on dedicated for compliance.
- **Stripe**: mix of EC2 + Lambda for various jobs.
- **Coca-Cola**: Lambda heavily for marketing campaigns (seasonal traffic).
- **A Cloud Guru**: built entire SaaS on Lambda (proof of "serverless first").

## Anti-pattern: FaaS for chatty inter-service calls

```text
Service A calls Service B 1000 times/sec, each call simple.
Both on Lambda.
Cost: 1000 × 86400 = 86M invocations/day × $1/M = $86/day = $2580/month.
On 2 small VMs: $30/month.
```

For chatty microservices intercommunication, FaaS = wrong choice.

## Anti-pattern: VM for occasional 1/month cron

```text
Monthly report generator on dedicated $200/month VM.
Runs once monthly for 5 min.
Wasted: $199.99/month.
Solution: Lambda or scheduled task on existing VM.
```

## Tóm tắt bài 1

- **VM multi-tenant** = mặc định cho hầu hết workload: cheap, flexible, slight security risk + noisy neighbor.
- **Dedicated Host** = isolated, expensive, cho compliance (bank, health, gov) hoặc latency-critical.
- **FaaS / Lambda** = zero idle cost, perfect cho rare + spike workloads, nhưng cold start + vendor lock-in + expensive at high traffic.
- Decision: compliance → dedicated; rare/spike → FaaS; default → VM.
- Hybrid common: mix infra theo workload.
- Cost breakeven Lambda ≈ 30-40% VM utilization. Above → VM cheaper.
- Anti-patterns: FaaS cho chatty calls; VM cho rare cron.

**Bài kế tiếp** → [Bài 2: Containers cho microservices](02-containers.md)
