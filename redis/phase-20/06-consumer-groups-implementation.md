# Bài 6: Consumer Group thực chiến — code patterns

Implement đầy đủ Consumer Group cho app RB. Production-grade với: dead letter queue, error categorization, metrics, graceful shutdown.

## Use case: Order processing

Khi user checkout, push event vào stream. Workers consume + send email + update inventory + log analytics.

```text
Producer: checkout flow
   │
   ▼ XADD events:orders
events:orders stream
   │
   ├─► Consumer Group: email-senders
   │   ├─ worker-1: send confirmation email
   │   └─ worker-2: send confirmation email
   │
   ├─► Consumer Group: inventory
   │   └─ worker-1: decrement stock
   │
   └─► Consumer Group: analytics
       └─ worker-1: aggregate metric
```

## Producer

```ts
// src/services/queries/events.ts
import { client } from '../redis/client';

export async function publishOrderEvent(orderId: string, data: Record<string, string>) {
  await client.xAdd('events:orders', '*', {
    type: 'OrderCreated',
    orderId,
    ...data,
  });
}

// Trong checkout flow:
await createOrder(...);
await publishOrderEvent(orderId, {
  userId,
  amount: total.toString(),
  items: JSON.stringify(cartItems),
});
```

Trade-off: dùng XADD trong checkout flow → checkout slower. Acceptable nếu XADD ~ms.

## Consumer setup base class

```ts
// src/lib/stream-consumer.ts
import { client } from '../services/redis/client';
import type { RedisClientType } from 'redis';

export type Message = {
  id: string;
  fields: Record<string, string>;
};

export abstract class StreamConsumer {
  protected abstract streamKey: string;
  protected abstract groupName: string;
  protected consumerName: string;
  
  private running = false;
  private subClient: RedisClientType;
  
  constructor() {
    this.consumerName = `worker-${process.pid}`;
  }
  
  async start() {
    this.subClient = client.duplicate();
    await this.subClient.connect();
    
    await this.ensureGroup();
    this.running = true;
    
    // Recovery: process pending
    await this.processPending();
    
    // Main loop
    this.mainLoop();
    
    // Background reclaim
    setInterval(() => this.reclaim().catch(console.error), 60_000);
  }
  
  async stop() {
    this.running = false;
    await this.subClient.quit();
  }
  
  private async ensureGroup() {
    try {
      await this.subClient.xGroupCreate(this.streamKey, this.groupName, '$', {
        MKSTREAM: true,
      });
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) throw err;
    }
  }
  
  private async mainLoop() {
    while (this.running) {
      try {
        const result = await this.subClient.xReadGroup(
          this.groupName,
          this.consumerName,
          { key: this.streamKey, id: '>' },
          { BLOCK: 5000, COUNT: 10 }
        );
        
        if (!result) continue;
        
        for (const stream of result) {
          for (const msg of stream.messages) {
            await this.handleMessage({ id: msg.id, fields: msg.message });
          }
        }
      } catch (err) {
        console.error('Main loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));    // backoff
      }
    }
  }
  
  private async handleMessage(msg: Message) {
    try {
      await this.process(msg);
      await this.subClient.xAck(this.streamKey, this.groupName, msg.id);
    } catch (err) {
      console.error(`Process failed for ${msg.id}:`, err);
      // Leave in PEL for retry
    }
  }
  
  private async processPending() {
    // Read my pending (no new messages, just my history)
    const result = await this.subClient.xReadGroup(
      this.groupName,
      this.consumerName,
      { key: this.streamKey, id: '0' }    // 0 = my PEL
    );
    
    if (!result) return;
    
    for (const stream of result) {
      for (const msg of stream.messages) {
        await this.handleMessage({ id: msg.id, fields: msg.message });
      }
    }
  }
  
  private async reclaim() {
    try {
      const result = await this.subClient.xAutoClaim(
        this.streamKey,
        this.groupName,
        this.consumerName,
        60_000,    // 60s idle threshold
        '0'
      );
      
      for (const msg of result.messages) {
        await this.handleMessage({ id: msg.id, fields: msg.message });
      }
    } catch (err) {
      console.error('Reclaim error:', err);
    }
  }
  
  protected abstract process(msg: Message): Promise<void>;
}
```

## Email sender consumer

```ts
// src/workers/email-sender.ts
import { StreamConsumer, Message } from '../lib/stream-consumer';
import { sendEmail } from '../lib/email';

class EmailSenderConsumer extends StreamConsumer {
  protected streamKey = 'events:orders';
  protected groupName = 'email-senders';
  
  protected async process(msg: Message) {
    const { orderId, userId, amount } = msg.fields;
    
    const user = await getUserById(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    
    await sendEmail({
      to: user.email,
      subject: 'Order Confirmation',
      template: 'order-confirmation',
      data: { orderId, amount },
    });
  }
}

// Run:
const consumer = new EmailSenderConsumer();
await consumer.start();

process.on('SIGTERM', () => consumer.stop());
```

## Inventory consumer

```ts
class InventoryConsumer extends StreamConsumer {
  protected streamKey = 'events:orders';
  protected groupName = 'inventory-updaters';
  
  protected async process(msg: Message) {
    const items = JSON.parse(msg.fields.items);
    
    for (const item of items) {
      await client.hIncrBy(`items#${item.id}`, 'stock', -item.quantity);
    }
  }
}
```

→ Independent group. Receive same events. Different processing.

## Error categorization

Errors thường có 2 types:

### Transient (retry)
- Network timeout.
- DB temporary unavailable.
- Rate limit hit.

→ Don't ack. Will retry via reclaim.

### Permanent (don't retry)
- Invalid data (validation).
- Resource deleted (user no longer exists).
- Business rule violation.

→ Ack (đã "process" — fail permanently). Move to DLQ.

Implementation:

```ts
class CategoryError extends Error {
  constructor(public category: 'transient' | 'permanent', message: string) {
    super(message);
  }
}

private async handleMessage(msg: Message) {
  try {
    await this.process(msg);
    await this.subClient.xAck(this.streamKey, this.groupName, msg.id);
  } catch (err) {
    if (err instanceof CategoryError && err.category === 'permanent') {
      // Move to DLQ + ack
      await this.subClient.xAdd(`${this.streamKey}:dlq`, '*', {
        originalId: msg.id,
        error: err.message,
        ...msg.fields,
      });
      await this.subClient.xAck(this.streamKey, this.groupName, msg.id);
    }
    // Transient: leave in PEL, will retry
  }
}
```

## Dead letter queue (DLQ)

Stream riêng cho failed messages. Admin review thủ công.

```ts
// In process:
if (!user) {
  throw new CategoryError('permanent', `User ${userId} not found`);
}
```

→ Message vào DLQ. Admin team check, fix data, optionally re-publish.

## Retry count

Limit retries để avoid infinite loop:

```ts
async function getPendingDetails(id: string) {
  const result = await client.xPending(STREAM, GROUP, { idle: 0, start: id, end: id, count: 1 });
  return result[0];     // { id, consumer, idleTime, deliveryCount }
}

private async handleMessage(msg: Message) {
  const pending = await getPendingDetails(msg.id);
  const retries = pending?.deliveryCount ?? 0;
  
  if (retries > 5) {
    // Max retries — DLQ + ack
    await moveToDLQ(msg, 'max-retries-exceeded');
    await this.subClient.xAck(this.streamKey, this.groupName, msg.id);
    return;
  }
  
  try {
    await this.process(msg);
    await this.subClient.xAck(...);
  } catch (err) {
    // Leave for retry (will count as another delivery)
  }
}
```

## Graceful shutdown

Khi process gets SIGTERM (deploy, scale-in):

```ts
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await consumer.stop();
  await client.quit();
  process.exit(0);
});
```

`stop()` set `running = false`. Current `xReadGroup` resolves after BLOCK timeout. Next iteration exits loop.

In-flight messages: complete or leave in PEL (will be reclaimed by other workers later).

## Metrics

```ts
const metrics = {
  processed: 0,
  failed: 0,
  retried: 0,
  dlq: 0,
};

private async handleMessage(msg: Message) {
  const start = Date.now();
  try {
    await this.process(msg);
    metrics.processed++;
    metrics.latency.observe(Date.now() - start);
    await this.subClient.xAck(...);
  } catch (err) {
    if (isPermanent(err)) {
      metrics.dlq++;
      await moveToDLQ(...);
      await this.subClient.xAck(...);
    } else {
      metrics.retried++;
    }
  }
}
```

Export to Prometheus/Datadog.

## Scaling workers

Want more throughput? Add workers:

```bash
# Run 5 instances of email-sender
pm2 start email-sender.ts -i 5
# Or docker-compose:
# replicas: 5
```

Mỗi instance có process.pid khác → consumer name khác → load balance trong cùng group.

→ Horizontal scale instant.

## Tóm tắt bài 6

- Abstract `StreamConsumer` base class với main loop + recovery + reclaim.
- Subclass cho specific business (Email, Inventory, Analytics).
- Error categorization: transient (retry) vs permanent (DLQ).
- Retry count limit để avoid infinite loop.
- Graceful shutdown SIGTERM.
- Metrics + horizontal scale với multiple worker processes.

**Bài kế tiếp** → [Bài 7: Tổng kết phase-20 + khoá học hoàn thành](07-tong-ket-khoa-hoc.md)
