# Bài 6: ZooKeeper từ A đến Z — nó làm gì cho Kafka và vì sao bị loại bỏ

Kafka 4.0 (tháng 3/2025) đã **gỡ bỏ hoàn toàn** ZooKeeper. Vậy học nó để làm gì?

Ba lý do rất thực tế:

1. **Phần lớn cụm Kafka đang chạy ở doanh nghiệp vẫn dùng ZooKeeper.** Nâng cấp một cụm Kafka production không phải chuyện đổi số phiên bản trong `docker-compose.yml`. Bạn sẽ gặp nó.
2. **Không hiểu ZooKeeper thì không hiểu nổi KRaft.** KRaft được thiết kế để chữa từng cơn đau cụ thể của ZooKeeper. Không biết cơn đau thì bài thuốc trở thành một mớ thuật ngữ vô nghĩa.
3. **Các mẫu thiết kế của ZooKeeper là kiến thức nền của hệ phân tán.** Khoá liên tiến trình, bầu trưởng nhóm, phát hiện thành viên chết — bạn sẽ gặp lại y hệt ở etcd (Kubernetes), Consul, HBase.

Bài này giải nghĩa ZooKeeper từ gốc, rồi chỉ chính xác Kafka nhờ nó những việc gì.

## ZooKeeper là cái gì

> **Apache ZooKeeper** là một **dịch vụ điều phối** (coordination service) cho hệ phân tán. Nó cung cấp một kho dữ liệu nhỏ, có cấu trúc cây, **được nhân bản và đảm bảo nhất quán mạnh**, cùng vài nguyên thuỷ để nhiều tiến trình trên nhiều máy thoả thuận với nhau.

Cách hiểu dễ nhất: **ZooKeeper là một hệ thống file rất nhỏ, rất đáng tin, dùng chung cho cả cụm.**

Nó **không** phải database. Nó không dùng để lưu dữ liệu nghiệp vụ. Mỗi node chứa tối đa 1 MB, và toàn bộ cây phải nằm gọn trong RAM của mỗi máy ZooKeeper. Nó chỉ để lưu **metadata và trạng thái phối hợp**.

```text
   ZooKeeper KHÔNG phải để lưu                ZooKeeper LÀ để lưu
   ═══════════════════════════                ═══════════════════
   ✗ đơn hàng của khách                       ✓ "ai đang là trưởng nhóm"
   ✗ nhật ký ứng dụng                         ✓ "những máy nào đang sống"
   ✗ file, ảnh                                ✓ "cấu hình chung của cụm"
   ✗ bất cứ thứ gì tính bằng GB               ✓ "ai đang giữ khoá X"
```

### Mô hình dữ liệu: cây znode

Dữ liệu trong ZooKeeper tổ chức thành cây, mỗi node gọi là **znode**.

```text
   /
   ├── brokers
   │   ├── ids
   │   │   ├── 1          ← znode, chứa {"host":"kafka1","port":9092,...}
   │   │   ├── 2
   │   │   └── 3
   │   ├── topics
   │   │   ├── order-events   ← chứa bản đồ partition → danh sách replica
   │   │   └── payment-events
   │   └── seqid
   ├── controller          ← chứa {"brokerid":1,"timestamp":...}
   ├── controller_epoch    ← số nhiệm kỳ của controller
   ├── config
   │   ├── topics
   │   └── clients
   ├── admin
   │   └── delete_topics
   └── isr_change_notification
```

Đặc điểm khác hệ thống file thường: **znode vừa là thư mục vừa là file**. Một znode có thể có con **và đồng thời** chứa dữ liệu.

### Bốn loại znode — và loại thứ hai là chìa khoá của mọi thứ

| Loại | Sống bao lâu | Dùng để |
|---|---|---|
| **PERSISTENT** (bền) | Tới khi bị xoá tường minh | Cấu hình, metadata topic |
| **EPHEMERAL** (tạm) | **Tự biến mất khi phiên kết nối của người tạo chấm dứt** | Phát hiện thành viên sống/chết |
| **PERSISTENT_SEQUENTIAL** | Như bền, nhưng tên được gắn thêm số tăng dần | Hàng đợi |
| **EPHEMERAL_SEQUENTIAL** | Như tạm + số tăng dần | **Bầu trưởng nhóm, khoá phân tán** |

Loại **EPHEMERAL** là phát minh cốt lõi. Nó biến bài toán khó "làm sao biết máy kia còn sống" thành một chuyện hiển nhiên:

```text
   Broker 2 khởi động
      → tạo znode EPHEMERAL  /brokers/ids/2
      → giữ một phiên (session) kết nối tới ZooKeeper
      → gửi nhịp tim (heartbeat) đều đặn để phiên còn hiệu lực

   Broker 2 chết (crash, mất điện, đứt mạng)
      → nhịp tim ngừng
      → sau zookeeper.session.timeout.ms (Kafka mặc định 18 giây)
        ZooKeeper tuyên bố phiên hết hạn
      → ZooKeeper TỰ XOÁ /brokers/ids/2
      → mọi kẻ đang theo dõi node đó ĐƯỢC BÁO NGAY
```

Điểm đẹp: **không ai phải viết code kiểm tra sức khoẻ.** Sự tồn tại của znode **chính là** bằng chứng máy đó còn sống. Máy chết thì bằng chứng tự bốc hơi.

### Watch — báo động một lần

**Watch** (theo dõi) là cơ chế đăng ký: *"khi znode này thay đổi, báo cho tôi."*

Ba đặc tính cần nhớ, đặc tính thứ nhất hay làm người mới sập bẫy:

| Đặc tính | Nghĩa | Hệ quả |
|---|---|---|
| **Chỉ kích hoạt một lần** | Báo xong là watch bị gỡ | Muốn theo dõi tiếp thì **phải đăng ký lại** |
| **Chỉ báo "có thay đổi"** | Không kèm nội dung mới | Nhận báo xong phải **đọc lại** znode |
| **Đảm bảo thứ tự** | Client thấy sự kiện đúng thứ tự xảy ra | Không bị đảo lộn trạng thái |

Đặc tính "một lần" là cố ý: nó ngăn ZooKeeper phải giữ hàng triệu đăng ký thường trực, và ép ứng dụng phải đọc lại trạng thái thật thay vì tin vào thông báo — an toàn hơn nhiều trong hệ phân tán.

### ZAB — vì sao ZooKeeper đáng tin

ZooKeeper tự nó cũng là một cụm (gọi là **ensemble**), chạy giao thức đồng thuận riêng tên là **ZAB** (ZooKeeper Atomic Broadcast).

```text
   Ensemble 3 node ZooKeeper
   ═════════════════════════

           ┌──────────┐
   GHI ───►│ ZK LEADER│
           └────┬─────┘
                │ phát đề nghị (proposal) tới mọi follower
        ┌───────┴───────┐
        ▼               ▼
   ┌─────────┐    ┌─────────┐
   │ZK follo.│    │ZK follo.│
   └─────────┘    └─────────┘
        │               │
        └──── ACK ──────┘
                │
        Đủ QUÁ BÁN ACK → leader commit → trả về cho client

   ĐỌC: phục vụ được bởi BẤT KỲ node nào (nhanh)
   GHI: luôn qua leader + cần quá bán (chậm hơn)
```

Điểm cần nhớ: **ZooKeeper đọc nhanh, ghi chậm.** Đọc chỉ cần một node trả lời; ghi cần quá bán đồng ý. Đây chính là mầm mống của giới hạn sẽ nói ở phần sau.

Vì cần quá bán, ensemble luôn là **số lẻ**: 3 hoặc 5 — đúng phép toán quorum đã bàn ở [Bài 2](02-cluster-ha-va-scalability.md).

## Công thức bầu trưởng nhóm — và bẫy "đàn ong vỡ tổ"

Đây là phần transcript gốc mô tả đúng nhưng quá ngắn. Nó đáng được kể đầy đủ, vì đây là một trong những công thức kinh điển nhất của hệ phân tán.

### Cách ngây thơ, và vì sao nó hỏng

```text
   CÁCH NGÂY THƠ
   ═════════════
   Mọi ứng viên cùng cố tạo một znode EPHEMERAL tên /leader
   Ai tạo được thì thắng (ZooKeeper đảm bảo chỉ một kẻ thành công)
   Những kẻ thua đặt watch lên /leader

   Leader chết → /leader biến mất
              → CẢ 1000 kẻ thua cùng nhận thông báo
              → CẢ 1000 kẻ cùng lao vào tạo /leader
              → 999 kẻ thất bại và đặt lại watch
              → ZooKeeper nhận 1000 request trong một khoảnh khắc
```

Hiện tượng này gọi là **herd effect** (hiệu ứng đàn — "đàn ong vỡ tổ"). Với 3 ứng viên thì không sao. Với 1.000 thì mỗi lần đổi leader là một đợt sóng thần request đánh vào ZooKeeper, và ZooKeeper vốn **ghi chậm**.

### Công thức đúng — mỗi kẻ chỉ nhìn người đứng ngay trước mình

```text
   BƯỚC 1 — mọi ứng viên tạo znode EPHEMERAL_SEQUENTIAL dưới /candidates
   ZooKeeper tự gắn số tăng dần, đảm bảo duy nhất:

   /candidates
   ├── c_0000000001   ← broker A
   ├── c_0000000002   ← broker B
   ├── c_0000000003   ← broker C
   └── c_0000000004   ← broker D

   BƯỚC 2 — ai có số NHỎ NHẤT thì làm leader
   → c_0000000001 (broker A) là leader

   BƯỚC 3 — mỗi kẻ còn lại đặt watch lên ĐÚNG MỘT node: kẻ ngay trước mình

   c_...001  ◄──watch── c_...002  ◄──watch── c_...003  ◄──watch── c_...004
   (LEADER)              (B nhìn A)           (C nhìn B)           (D nhìn C)
```

Bây giờ xem hai kịch bản:

```text
   KỊCH BẢN 1 — LEADER chết
   ════════════════════════
   c_...001 biến mất
   → CHỈ B nhận thông báo (chỉ mình B watch node đó)
   → B kiểm tra: mình có phải số nhỏ nhất không? → CÓ
   → B lên làm leader.  C và D KHÔNG BỊ ĐÁNH THỨC.

   Tổng số thông báo: 1.  (Cách ngây thơ: 999.)


   KỊCH BẢN 2 — một kẻ Ở GIỮA chết (đây là chỗ tinh tế)
   ═══════════════════════════════════════════════════
   c_...002 (B) chết, trong khi A vẫn đang làm leader
   → CHỈ C nhận thông báo
   → C kiểm tra: mình có phải số nhỏ nhất không? → KHÔNG (còn 001)
   → C KHÔNG lên leader. C chuyển watch sang c_...001

   c_...001  ◄────────── watch ────────── c_...003  ◄──watch── c_...004
   (LEADER)                              (C giờ nhìn A)

   Dây chuyền tự nối lại. Không ai khác bị đánh thức.
```

Đây chính xác là điều transcript mô tả: *"nếu node c_i+2 chết, node c_i+3 sẽ đổi hướng watch về node c_i+1"*. Mô tả đó **đúng**, chỉ thiếu phần giải thích **vì sao** phải làm vậy — và lý do là để tránh herd effect.

Tính chất chung của công thức: **mỗi sự kiện chết chỉ đánh thức đúng một tiến trình**, bất kể cụm có 3 hay 3.000 thành viên. Cùng công thức này được dùng cho **khoá phân tán** (distributed lock) — đổi "ai nhỏ nhất thì làm leader" thành "ai nhỏ nhất thì giữ khoá".

## Kafka nhờ ZooKeeper làm chính xác những việc gì

| Nhiệm vụ | Cách làm bằng ZooKeeper | Hỏng thì sao |
|---|---|---|
| **Danh sách thành viên** — broker nào đang sống | Mỗi broker tạo znode EPHEMERAL `/brokers/ids/<id>` | Không biết broker chết → không failover |
| **Bầu controller** | Broker đầu tiên tạo được `/controller` thì thắng | Không ai điều phối cụm |
| **Metadata topic** | `/brokers/topics/<tên>` chứa bản đồ partition → replica | Không biết dữ liệu nằm đâu |
| **Cấu hình động** | `/config/topics/<tên>` cho các giá trị ghi đè | Đổi cấu hình phải khởi động lại |
| **Danh sách ISR** | Ghi vào znode của topic mỗi lần ISR đổi | Không biết bản sao nào an toàn |
| **Danh sách quyền (ACL)** | `/kafka-acl` | Không kiểm soát được truy cập |
| **Offset của consumer** | `/consumers/<group>/offsets/...` — **chỉ ở Kafka rất cũ** | — |

Dòng cuối cần nói rõ vì hay gây hiểu lầm: **từ Kafka 0.9 (2015), offset của consumer đã chuyển sang topic nội bộ `__consumer_offsets`, không còn nằm ở ZooKeeper.** Nếu bạn đọc tài liệu cũ thấy `--zookeeper localhost:2181` trong lệnh consumer, đó là tài liệu đã lỗi thời cả chục năm.

### Kiến trúc thời ZooKeeper — nhìn cho rõ

```text
   ┌─────────────── ENSEMBLE ZOOKEEPER (cụm riêng, 3 máy) ───────────┐
   │   ┌────────┐      ┌────────┐      ┌────────┐                    │
   │   │ ZK 1   │      │ ZK 2   │      │ ZK 3   │                    │
   │   │(leader)│◄────►│follower│◄────►│follower│                    │
   │   └────────┘      └────────┘      └────────┘                    │
   └───────▲──────────────▲─────────────────▲───────────────────────┘
           │              │                 │
           │  Kafka broker nói chuyện với ZooKeeper
           │              │                 │
   ┌───────┴──────────────┴─────────────────┴───────────────────────┐
   │   ┌────────────┐   ┌────────┐   ┌────────┐                     │
   │   │  Kafka 1   │   │Kafka 2 │   │Kafka 3 │                     │
   │   │(controller)│   │        │   │        │                     │
   │   └────────────┘   └────────┘   └────────┘                     │
   │              CỤM KAFKA (cụm riêng, 3 máy khác)                  │
   └─────────────────────────────────────────────────────────────────┘
                              ▲
                              │  Producer / Consumer
                              │  CHỈ nói chuyện với Kafka
                              │  KHÔNG BAO GIỜ chạm ZooKeeper
```

Ba điểm đọc ra từ hình:

**Hai cụm riêng biệt.** Sáu máy, hai phần mềm khác nhau, hai bộ cấu hình, hai bộ giám sát, hai bộ cảnh báo, hai quy trình nâng cấp. Đây chính là "phải vận hành đồng thời 2 hệ thống phân tán" mà transcript nói — và đó là gánh nặng thật.

**Ứng dụng của bạn không chạm ZooKeeper.** Producer và consumer chỉ biết `bootstrap.servers`. Đây là lý do vì sao việc bỏ ZooKeeper **không đòi hỏi sửa một dòng code ứng dụng nào**.

**Chỉ controller ghi nhiều vào ZooKeeper.** Broker thường chỉ đọc và đăng ký. Đây là mấu chốt của giới hạn tiếp theo.

## Vì sao ZooKeeper bị loại bỏ — bốn cơn đau

### Cơn đau 1 — nghẽn cổ chai khi ghi metadata

ZooKeeper ghi chậm vì mỗi lệnh ghi cần quá bán đồng ý. Bình thường không sao, vì metadata hiếm khi đổi. Nhưng khi có sự cố lớn thì lượng ghi bùng nổ:

```text
   Cụm có 200.000 partition. Một broker giữ 50.000 leader bị chết.

   Controller phải:
     - chọn leader mới cho 50.000 partition
     - GHI 50.000 thay đổi vào ZooKeeper
     - mỗi lần ghi = một vòng đồng thuận quá bán

   ZooKeeper xử lý khoảng vài nghìn lệnh ghi mỗi giây
   → 50.000 lệnh ghi mất hàng chục giây tới hàng phút
   → suốt thời gian đó, các partition kia KHÔNG CÓ LEADER
   → producer và consumer đứng chờ
```

Cơn đau này **tăng theo số partition**, và số partition thì luôn tăng theo thời gian ở mọi công ty.

### Cơn đau 2 — controller phải nạp lại toàn bộ metadata khi khởi động

Controller mới lên chức phải **đọc lại toàn bộ trạng thái cụm từ ZooKeeper** trước khi làm được việc:

```text
   Controller mới khởi động
   → đọc /brokers/ids/*        (mọi broker)
   → đọc /brokers/topics/*     (MỌI topic, MỌI partition, MỌI danh sách replica)
   → dựng lại toàn bộ bản đồ trong bộ nhớ
   → chỉ khi đó mới bắt đầu điều phối được

   Với 200.000 partition: hàng chục giây tới vài phút.
   Suốt thời gian đó cụm KHÔNG CÓ AI ĐIỀU PHỐI.
```

Điểm chí mạng: **đây là thao tác toàn phần, không phải gia tăng.** Không có cách nào chỉ đọc phần thay đổi, vì ZooKeeper không giữ nhật ký thay đổi cho Kafka dùng.

### Cơn đau 3 — hai nguồn sự thật, và chúng lệch nhau

Metadata sống ở ZooKeeper, nhưng mỗi broker cũng giữ một bản trong RAM để phục vụ client nhanh. Hai bản này đồng bộ bằng thông báo — mà thông báo thì có thể mất, có thể tới muộn.

```text
   Nguồn sự thật:  ZooKeeper nói "leader của P0 là broker 3"
   Bản trong RAM của broker 5 (cũ):  "leader của P0 là broker 1"

   → Client hỏi broker 5, nhận thông tin sai
   → Client gửi request tới broker 1
   → Broker 1 trả lỗi NOT_LEADER_OR_FOLLOWER
   → Client phải làm mới metadata rồi thử lại

   Trường hợp xấu: metadata lệch kéo dài
   → client quay vòng giữa các broker, không ai nhận request
```

Đây là nguồn gốc của cả một lớp lỗi khó tái hiện trong Kafka thời ZooKeeper.

### Cơn đau 4 — gánh nặng vận hành

Phần này không phải kỹ thuật nhưng là lý do quyết định trong thực tế:

| Việc phải làm | Chi phí |
|---|---|
| Cài và cấu hình cụm ZooKeeper riêng | 3 hoặc 5 máy nữa |
| Giám sát riêng | Bộ chỉ số hoàn toàn khác Kafka |
| Tinh chỉnh riêng | JVM heap, `tickTime`, `initLimit`, `syncLimit`, đĩa riêng cho snapshot |
| Bảo mật riêng | SASL/Kerberos cho ZooKeeper, khác hẳn cấu hình của Kafka |
| Nâng cấp riêng | Thứ tự nâng cấp ZooKeeper trước hay Kafka trước là cả một quy trình |
| Đội ngũ phải biết cả hai | Sự cố ZooKeeper cần kỹ năng khác sự cố Kafka |

Nói ngắn: **bạn muốn chạy một hệ phân tán, nhưng bị bắt phải chạy hai.**

## Bảng đối chiếu ZooKeeper và KRaft

| Tiêu chí | ZooKeeper | KRaft |
|---|---|---|
| Số hệ thống phải vận hành | **2** | **1** |
| Metadata lưu ở đâu | Cây znode trong ensemble riêng | Topic nội bộ `__cluster_metadata` **bên trong Kafka** |
| Cách metadata lan truyền | Thông báo + đọc lại toàn phần | **Nhật ký gia tăng** — broker chỉ đọc phần mới |
| Controller khởi động | Nạp lại **toàn bộ** trạng thái | Đọc tiếp từ offset cuối cùng |
| Giới hạn số partition thực dụng | Khoảng vài chục nghìn tới 200 nghìn | **Hàng triệu** (mục tiêu của KIP-500) |
| Thời gian đổi controller | Chục giây trở lên | Dưới một giây tới vài giây |
| Đường bảo mật | Hai bộ cấu hình khác nhau | Một bộ duy nhất |
| Trạng thái hiện tại | **Đã bị gỡ ở Kafka 4.0** | Mặc định từ Kafka 3.3 |

Cột "cách metadata lan truyền" là khác biệt sâu nhất về mặt kiến trúc, đáng nói rõ:

```text
   ZOOKEEPER — mô hình "trạng thái"
   ════════════════════════════════
   ZooKeeper giữ TRẠNG THÁI HIỆN TẠI.
   Muốn biết đã thay đổi gì → phải so sánh với bản mình đang có
   → thực tế là đọc lại toàn bộ.

   KRAFT — mô hình "nhật ký sự kiện"
   ═════════════════════════════════
   Metadata là một LOG các thay đổi, có offset, y hệt topic thường.
   Broker chỉ cần nói "tôi đang ở offset 88421, cho tôi phần sau đó"
   → đọc gia tăng, rẻ, và có thể tiếp tục sau khi chết.

   ĐÂY LÀ CHÍNH TRIẾT LÝ CỦA KAFKA, ÁP DỤNG NGƯỢC LẠI CHO CHÍNH NÓ.
```

Nói cách khác: Kafka đã dành mười năm thuyết phục cả ngành rằng "log là một cách biểu diễn trạng thái tốt hơn", rồi cuối cùng áp dụng đúng bài học đó cho hệ thống metadata của chính mình. Chi tiết ở [Bài 7](07-kraft-va-thuat-toan-raft.md).

## Đính chính transcript: KRaft thì KHÔNG CÒN znode

Transcript gốc có một chỗ tự mâu thuẫn:

> *"môi trường Docker Compose gồm 3 Broker chạy KRaft mode... broker 3 được khởi tạo và tạo znode thành công sớm nhất **trên Zookeeper**"*

Hai vế này loại trừ nhau. Ở chế độ KRaft **không có ZooKeeper, không có znode, không có phiên ZooKeeper**. Cách nhận biết cụm bạn đang chạy chế độ nào:

```bash
# Có process.roles → KRaft
grep -E "^(process\.roles|controller\.quorum)" /opt/kafka/config/server.properties
```

```text
process.roles=broker,controller
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
```

```bash
# Có zookeeper.connect → chế độ ZooKeeper
grep "^zookeeper.connect" /opt/kafka/config/server.properties
```

| Dấu hiệu | Chế độ |
|---|---|
| Có `process.roles` và `controller.quorum.voters` | **KRaft** |
| Có `zookeeper.connect` | **ZooKeeper** |
| Có cả hai | Đang trong quá trình chuyển đổi (migration) |
| Có container tên `zookeeper` trong `docker-compose.yml` | **ZooKeeper** |
| Cổng 2181 đang mở | **ZooKeeper** |

Ở môi trường học của khoá này ([Phase 2](../phase-2-environment/01-kafka-docker-setup.md) và [Phase 9](../phase-9-kafka-cluster/02-docker-compose-cluster.md)), bạn đang chạy **KRaft** — không có ZooKeeper ở đâu cả.

## Nếu bạn đang phải vận hành cụm ZooKeeper

Vài điều thực dụng đáng biết:

```bash
# Kiểm tra sức khoẻ nhanh (lệnh "four-letter word")
echo ruok | nc localhost 2181        # trả lời "imok" nếu ổn
echo stat | nc localhost 2181        # xem vai trò leader/follower, số kết nối
echo mntr | nc localhost 2181        # bộ chỉ số để đẩy vào hệ giám sát

# Duyệt cây bằng shell
/opt/zookeeper/bin/zkCli.sh -server localhost:2181
> ls /brokers/ids                    # những broker đang sống
> get /controller                    # ai đang là controller
> get /brokers/topics/order-events   # bản đồ partition → replica
```

| Chỉ số cần cảnh báo | Ngưỡng đáng lo | Ý nghĩa |
|---|---|---|
| `zk_avg_latency` | > 10 ms | ZooKeeper đang chậm → controller sẽ chậm theo |
| `zk_outstanding_requests` | > 10 kéo dài | Đang nghẽn |
| `zk_followers` | < số dự kiến | Mất node → sắp mất quorum |
| Dung lượng ổ chứa snapshot | > 80% | ZooKeeper **dừng ghi** khi hết đĩa |

Hai bẫy vận hành phổ biến nhất:

**Một — đặt dữ liệu ZooKeeper chung đĩa với thứ khác.** ZooKeeper rất nhạy với độ trễ `fsync`. Chung đĩa với log ứng dụng là công thức gây `zk_avg_latency` tăng vọt rồi kéo cả cụm Kafka chậm theo.

**Hai — quên dọn snapshot.** ZooKeeper **không tự xoá** snapshot và file transaction log cũ ở các phiên bản cũ. Đĩa đầy dần rồi ZooKeeper ngừng ghi, và cụm Kafka đứng hình. Phải bật `autopurge.snapRetainCount` và `autopurge.purgeInterval`, hoặc chạy `zkCleanup.sh` định kỳ.

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "ZooKeeper lưu message của Kafka" | Không. ZooKeeper **chỉ lưu metadata**. Message nằm trên đĩa của broker |
| "Producer/Consumer kết nối ZooKeeper" | Không (từ Kafka 0.9). Client chỉ biết `bootstrap.servers` |
| "Offset consumer nằm ở ZooKeeper" | Chỉ đúng với Kafka rất cũ. Từ 0.9 nằm ở topic `__consumer_offsets` |
| "Chạy KRaft mà vẫn tạo znode" | Mâu thuẫn. KRaft **không có** ZooKeeper |
| "Ensemble 2 hoặc 4 node cho chắc" | Số chẵn không tăng khả năng chịu đựng. Dùng **3 hoặc 5** |
| "ZooKeeper chết là mất dữ liệu Kafka" | Không mất dữ liệu, nhưng cụm **không thay đổi được metadata**: không bầu leader mới, không tạo topic |
| "Watch báo liên tục" | Watch **chỉ kích hoạt một lần**, phải đăng ký lại |
| "Kafka 4.0 vẫn chạy được ZooKeeper" | Không. Kafka 4.0 đã **gỡ bỏ hoàn toàn**. Phải chuyển sang KRaft trước khi nâng cấp |

## Tóm tắt bài 6

- **ZooKeeper** là dịch vụ điều phối: một kho dữ liệu nhỏ dạng cây, nhất quán mạnh, dùng chung cho cả cụm. **Không phải database**, không lưu dữ liệu nghiệp vụ.
- **znode EPHEMERAL** là phát minh cốt lõi: znode tự biến mất khi phiên của người tạo hết hạn → biến "phát hiện máy chết" thành chuyện hiển nhiên, không cần viết code kiểm tra.
- **Watch chỉ kích hoạt một lần** và **không kèm nội dung** — phải đăng ký lại và đọc lại.
- Công thức bầu trưởng nhóm dùng **EPHEMERAL_SEQUENTIAL** + **mỗi kẻ chỉ watch người đứng ngay trước mình**, để tránh **herd effect**. Mỗi sự kiện chết chỉ đánh thức đúng một tiến trình, dù cụm có 3 hay 3.000 thành viên.
- Kafka nhờ ZooKeeper: danh sách broker sống, bầu controller, metadata topic, cấu hình động, danh sách ISR, ACL. **Offset consumer đã chuyển sang `__consumer_offsets` từ Kafka 0.9.**
- **Ứng dụng của bạn không bao giờ chạm ZooKeeper** — đó là lý do bỏ ZooKeeper không cần sửa code ứng dụng.
- Bốn cơn đau khiến ZooKeeper bị loại: **ghi metadata nghẽn** khi có sự cố lớn, **controller phải nạp lại toàn bộ** trạng thái khi khởi động, **hai nguồn sự thật lệch nhau**, và **gánh nặng vận hành hai hệ phân tán**.
- Khác biệt kiến trúc sâu nhất: ZooKeeper lưu **trạng thái**, KRaft lưu **nhật ký thay đổi** — chính triết lý của Kafka, áp dụng cho bản thân Kafka.
- **Đính chính**: chạy KRaft thì **không có znode, không có ZooKeeper**. Nhận biết bằng `process.roles` (KRaft) so với `zookeeper.connect` (ZooKeeper).
- **Kafka 4.0 đã gỡ bỏ ZooKeeper hoàn toàn.**

**Bài kế tiếp** → [Bài 7: KRaft và thuật toán Raft — bầu cử, nhiệm kỳ, nhật ký metadata](07-kraft-va-thuat-toan-raft.md)
