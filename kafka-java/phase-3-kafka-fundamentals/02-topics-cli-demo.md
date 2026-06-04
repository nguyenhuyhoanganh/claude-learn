# Bài 2: Tạo topic + produce + consume bằng CLI

Lý thuyết xong. Giờ hands-on. 3 CLI tools cơ bản:
- `kafka-topics.sh` — create / list / describe / delete topic.
- `kafka-console-producer.sh` — gửi message tới topic.
- `kafka-console-consumer.sh` — đọc message từ topic.

Tất cả chỉ dùng cho **learning / testing / debugging**. Production app dùng Spring Cloud Stream (Phase 4).

## Setup mỗi command

Mọi CLI tool đều cần:
- `--bootstrap-server <host:port>` — broker để kết nối. **Bắt buộc**, không có default.

```bash
docker exec -it kafka bash
cd /opt/kafka/bin
```

> Lưu ý: gõ `kafka-topics.sh` báo "command not found". Phải `./kafka-topics.sh` (xem bài Phase 2).

## `kafka-topics.sh` — quản lý topic

```bash
./kafka-topics.sh
```

Hiện help (cắt gọn):

```text
Create, delete, describe, or change a topic.
--alter                Alter the number of partitions...
--create               Create a new topic.
--delete               Delete a topic.
--describe             List details for the given topics.
--list                 List all available topics.
--bootstrap-server     REQUIRED: The Kafka server to connect to.
--topic <name>         Topic to be created, altered, deleted, or described.
```

### Create

```bash
./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic order-events

# Output:
# Created topic order-events.
```

Tạo thêm vài topic:

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic payment-events
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic shipping-events
```

### List

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --list

# Output:
# order-events
# payment-events
# shipping-events
```

### Describe

```bash
./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic order-events

# Output (truncated):
# Topic: order-events  TopicId: abc123...  PartitionCount: 1  ReplicationFactor: 1
#   Topic: order-events  Partition: 0  Leader: 0  Replicas: 0  Isr: 0
```

Các field này (PartitionCount, ReplicationFactor, Leader, Replicas, ISR) sẽ học dần trong các bài sau. Tạm thời biết "describe trả về metadata về topic" là đủ.

### Delete

```bash
./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --delete \
  --topic order-events

# List → còn payment-events, shipping-events
```

## `kafka-console-producer.sh` — gửi message

Tạo topic test:

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic demo-topic
```

Launch producer:

```bash
./kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic
```

Output: prompt `>`. Mỗi line bạn gõ = 1 message, gửi lúc Enter:

```text
> hello world
> 1
> 2
> 3
```

Mỗi line trở thành 1 message trong topic. Đơn giản plain text. Ctrl-C để thoát.

> Trong producer thật (Java app), bạn có thể gửi JSON, Avro, Protobuf — không chỉ string. CLI chỉ dùng để smoke test.

## `kafka-console-consumer.sh` — đọc message

Mở **terminal mới** (producer giữ ở terminal khác):

```bash
docker exec -it kafka bash
cd /opt/kafka/bin

./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic
```

Output: **trống**. Đợi 1 tháng cũng vẫn trống.

### Tại sao consumer không thấy 4 message trước?

**Default behavior: consumer chỉ đọc message MỚI** kể từ khi nó bắt đầu chạy.

4 message `hello world`, `1`, `2`, `3` đã được produce **trước** khi consumer launch → consumer skip.

Verify: quay lại producer terminal, gõ `5`:

```text
# Producer:
> 5

# Consumer:
5
```

→ Consumer thấy ngay message mới. Nhưng vẫn không thấy 4 message cũ.

### Tại sao Kafka thiết kế default vậy?

Suy nghĩ business:

- **Weather feed**: app start lúc 10am → muốn current weather, không quan tâm weather của 3 ngày trước.
- **Stock ticker**: chỉ quan tâm giá hiện tại, không phải giá hôm qua.
- **Real-time notifications**: chỉ alert sự kiện mới.

Cho các case này, "đọc từ đầu" là **bug**, không phải feature.

### `--from-beginning` để đọc từ đầu

Ctrl-C terminate consumer cũ. Chạy lại với option:

```bash
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --from-beginning
```

Output:

```text
hello world
1
2
3
5
```

Tất cả message từ đầu. Sau đó vẫn nhận message mới khi producer publish thêm.

### Use case `--from-beginning`

- Debugging: "Tại sao consumer không nhận event X?" → đọc từ đầu để xem event có tồn tại không.
- New consumer joining → muốn replay full history (vd: build analytics view).
- Recovery: consumer bị bug → fix code → replay tất cả events.

Production app không dùng `--from-beginning` flag tuỳ tiện. Có cơ chế **offset tracking** chuẩn (bài sau).

## Lưu ý quan trọng — `--bootstrap-server` không default

Sai lầm phổ biến:

```bash
./kafka-topics.sh --list
# Báo lỗi: Missing required option(s) [bootstrap-server]
```

Kafka CLI **không assume localhost**, không như Spring Boot (smart defaults). Phải gõ tay mỗi lần.

Tip: alias trong container:

```bash
alias kt='./kafka-topics.sh --bootstrap-server localhost:9092'
alias kp='./kafka-console-producer.sh --bootstrap-server localhost:9092'
alias kc='./kafka-console-consumer.sh --bootstrap-server localhost:9092'

kt --list                      # ngắn gọn
kt --create --topic foo
kp --topic foo
kc --topic foo --from-beginning
```

Alias mất khi exit container. Persist bằng cách thêm vào `~/.bashrc` của image custom (production setup).

## Recap workflow

```text
1. Create topic:     kafka-topics.sh --create --topic X
2. Verify:           kafka-topics.sh --list
3. Produce:          kafka-console-producer.sh --topic X
                       > type messages
4. Consume new:      kafka-console-consumer.sh --topic X
5. Consume all:      kafka-console-consumer.sh --topic X --from-beginning
6. Inspect:          kafka-topics.sh --describe --topic X
7. Cleanup:          kafka-topics.sh --delete --topic X
```

## Khi nào KHÔNG dùng CLI tools

| Don't use for | Reason | Use instead |
|---|---|---|
| Production app code | Process spawn overhead, parse stdout brittle | Java client / Spring Cloud Stream |
| High-throughput producer | Single thread, no batching | Native client |
| Schema-validated messages | Plain text only | Avro/Protobuf with schema registry |
| Monitor topic continuously | No metrics export | Kafka UI tools (Kafdrop, AKHQ, Conduktor) |

CLI = swiss army knife cho dev + debug. Production stack khác.

## Tóm tắt bài 2

- 3 CLI tools chính: `kafka-topics.sh`, `kafka-console-producer.sh`, `kafka-console-consumer.sh`.
- Mọi command đều cần `--bootstrap-server` — không default, gõ tay.
- `--create` / `--list` / `--describe` / `--delete` quản lý topic.
- Producer: prompt `>`, Enter để send. Plain text.
- **Consumer default chỉ đọc message MỚI** từ lúc start. Lý do: real-time feeds (weather, stock) không cần history.
- `--from-beginning` đọc full history. Dùng cho debug, replay, new consumer init.
- CLI = learning + debug. Production dùng client library.

**Bài kế tiếp** → [Bài 3: Tuning producer — timeout, linger.ms, batch.size](03-producer-tuning.md)
