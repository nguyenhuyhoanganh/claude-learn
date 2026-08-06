# Bài 13: Cắt bớt kết nối để chạy nhanh hơn

**Cắt bớt kết nối thì database nhanh hơn.** Nghe ngược đời đúng không?

Một đội đã cắt từ **2048 xuống 96**. Thời gian phản hồi rớt từ khoảng **100 mili-giây xuống còn khoảng 2**.

Chuyện bắt đầu từ một câu hỏi phỏng vấn nghe rất ngon ăn:

> *"Hệ thống của em đang chậm, nghi là do database, em xử lý thế nào?"*

Ứng viên đáp ngay:

> *"Dạ dễ thôi anh, em tăng pool từ 100 lên hẳn 1000. Càng nhiều kết nối thì càng gánh được nhiều việc cùng lúc."*

Nghe xuôi tai. Đó đúng là cái bẫy.

> **Thêm kết nối không hề thêm sức mạnh. Nó chỉ băm nhỏ cái sức đang có ra thôi.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Connection** (kết nối) | Một đường liên lạc mở giữa ứng dụng và database | Một quầy giao dịch đang mở |
| **Connection Pool** | Tập kết nối được giữ sẵn và tái sử dụng, thay vì mở/đóng mỗi lần | Kho quầy dựng sẵn, ai cần thì mượn rồi trả |
| **Core / nhân CPU** | Một đơn vị xử lý — **tại một thời điểm chỉ chạy được đúng một việc** | Một người thợ. Một người chỉ làm được một việc một lúc |
| **Context Switch** (đổi ca) | Hệ điều hành dừng việc A, cất trạng thái, nạp trạng thái việc B | Thợ bỏ dở việc này, cất đồ, lấy đồ việc khác ra |
| **Idle connection** (kết nối ngồi không) | Kết nối đang mở nhưng không chạy câu lệnh nào | Quầy mở đèn nhưng không có khách |
| **Snapshot** | Bức ảnh "giao dịch này được thấy gì", dựng ở đầu mỗi câu lệnh | Danh sách những gì đã có lúc bạn bước vào |
| **Throughput** (thông lượng) | Số việc hoàn thành mỗi giây | Số khách phục vụ xong mỗi giờ |
| **Latency** (độ trễ) | Thời gian một việc hoàn thành | Một khách mất bao lâu từ lúc xếp hàng tới lúc xong |
| **Saturated** (bão hoà) | Mọi kết nối luôn bận, luôn có việc chờ | Mọi quầy luôn có khách, luôn có người xếp hàng |
| **PgBouncer** | Phần mềm trung gian gom nhiều kết nối ứng dụng thành ít kết nối database | Lễ tân điều phối: nhận 1000 khách, đưa vào 20 quầy theo lượt |

## Tầng 1 — Cơ chế: CPU đổi ca, và cú lừa mang tên "song song"

Người phỏng vấn hỏi ngược lại:

> *"Server database của em chỉ có 8 core thôi. 1000 truy vấn chạy cùng lúc thì kiểu gì cho vừa?"*

Thực ra chữ **"song song"** ở đây là một cú lừa.

```text
   MỘT CORE, TẠI MỘT THỜI ĐIỂM, CHỈ CHẠY ĐƯỢC ĐÚNG MỘT VIỆC.
```

Hệ điều hành phải **xé nhỏ thời gian** ra, cho mỗi việc chạy vài mili-giây rồi đổi ca. Nhìn từ ngoài thì tưởng chúng chạy song song:

```text
   Cái bạn TƯỞNG đang xảy ra:
      Core 1: ████████████████████  truy vấn A
      Core 2: ████████████████████  truy vấn B
      ...
      (1000 truy vấn chạy đồng thời)

   Cái THẬT SỰ xảy ra với 1000 truy vấn trên 8 core:
      Core 1: [A][↻][Q][↻][K][↻][C][↻][M][↻][B][↻][X][↻][F][↻]...
                  ↑ mỗi chỗ [↻] là một lần ĐỔI CA
```

### Mỗi lần đổi ca tốn những gì

Đổi ca **không hề miễn phí**, và nó tốn ở bốn chỗ — ba chỗ sau thường bị bỏ quên:

```text
   ① Cất trạng thái cũ, nạp trạng thái mới
      (thanh ghi, con trỏ ngăn xếp, bản đồ bộ nhớ...)
      → khoảng 1–5 micro-giây mỗi lần. Nghe nhỏ.

   ② ĐÁ DỮ LIỆU RA KHỎI BỘ NHỚ ĐỆM CỦA CHÍNH CON CHIP
      Việc B nạp dữ liệu của nó vào cache L1/L2, đá dữ liệu của A ra.
      Khi A quay lại, nó phải đi lấy lại từ RAM — chậm hơn cache
      hàng chục tới hàng trăm lần.
      → Đây mới là phần đắt, và nó KHÔNG hiện trong con số 1–5 micro-giây.

   ③ TRANH GIÀNH KHOÁ
      1000 truy vấn tranh nhau các cấu trúc dùng chung bên trong database.
      Càng đông, càng nhiều thời gian chờ khoá thay vì làm việc.

   ④ Bảng ánh xạ địa chỉ bộ nhớ (TLB) cũng bị xoá sạch theo.
```

Kết quả: **CPU tốn một phần đáng kể sức lực chỉ để đổi ca**, thay vì chạy truy vấn thật.

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  20 truy vấn / 8 core                                        │
   │  ████████████████████░░  90% làm việc, 10% quản lý           │
   │                                                              │
   │  1000 truy vấn / 8 core                                      │
   │  ████████░░░░░░░░░░░░░░  40% làm việc, 60% quản lý + chờ khoá│
   └─────────────────────────────────────────────────────────────┘
```

## Tầng 2 — Con số: công thức tính pool size

> *"Thế đặt pool bằng đúng số core là xong chứ gì?"*

Câu hỏi hay, nhưng vẫn sai nốt.

Vì truy vấn đâu chỉ ngốn CPU — nó còn **ngồi chờ đọc đĩa, chờ mạng**. Trong lúc một kết nối đang chờ thì core rảnh, phải nhét việc khác vào cho nó làm chứ.

Thế nên cộng đồng PostgreSQL chốt một công thức (cũng chính là công thức mà tài liệu HikariCP dẫn lại):

```text
   pool ≈ (số nhân CPU × 2) + số đĩa quay hiệu dụng
```

```text
   Server 8 core, đĩa SSD:
      pool ≈ (8 × 2) + 1 = 17
      → tầm 16 đến 20 kết nối là đẹp.
      → KHÔNG PHẢI 1000.
```

Vì sao nhân 2? Vì đó là ước lượng thô cho tỷ lệ *thời gian chờ / thời gian tính*: khi một kết nối đang chờ I/O, một kết nối khác dùng core đó.

> Nền tảng lý thuyết của công thức này (định luật Little, lý thuyết hàng đợi) nằm ở [Định luật Little và cách tính pool size](../../backend-scaling-cases/phase-1-nen-tang/04-dinh-luat-little-tinh-pool-size.md).

### Đảo chiều: dùng SSD thì được mở thoáng tay hơn?

Đây là câu hỏi vặn kinh điển, và câu trả lời **ngược 180 độ** so với trực giác:

```text
   Đĩa quay chậm  →  truy vấn NGỒI CHỜ NHIỀU  →  core rảnh nhiều
                  →  cần NHIỀU kết nối để lấp chỗ rảnh

   SSD/NVMe nhanh →  truy vấn ÍT PHẢI CHỜ     →  core bận gần như liên tục
                  →  pool tối ưu còn PHẢI NHỎ HƠN NỮA
```

Phần cứng càng nhanh, pool tối ưu càng nhỏ. Vì công thức đo **tỷ lệ chờ**, không đo tốc độ tuyệt đối.

## Tầng 3 — Tác hại của kết nối ngồi không

> *"Nhưng cứ mở dư ra, cho 900 kết nối còn lại ngồi không thì có hại gì đâu?"*

**Hại to.** Và đây là phần ăn điểm nhất bài, vì hầu như không ai biết con số.

Với PostgreSQL, **mỗi kết nối mở ra là nó đẻ hẳn một tiến trình (process) riêng trên server**. Không phải một luồng nhẹ — một tiến trình đầy đủ của hệ điều hành.

### Phép đo của Andres Freund (một trong những người viết mã lõi PostgreSQL)

```text
   PostgreSQL 12, đo thông lượng của 48 KẾT NỐI ĐANG LÀM VIỆC:

      Với      0 kết nối ngồi không:  1.032.435 giao dịch/giây
      Với 10.000 kết nối ngồi không:    521.558 giao dịch/giây

                                        ↓
                        MẤT GẦN MỘT NỬA THÔNG LƯỢNG.

   Mà đám 10.000 kia CÓ LÀM GÌ ĐÂU. Chúng chỉ ngồi đó thôi.
```

### Vì sao ngồi không mà vẫn phá?

Lý do nằm ở một chỗ rất sâu trong cách PostgreSQL hoạt động:

```text
   Mỗi lần dựng một ẢNH CHỤP dữ liệu
   (tức là tính xem giao dịch này được thấy những gì),
   PostgreSQL phải LƯỚT QUA TOÀN BỘ DANH SÁCH KẾT NỐI.

   Bất kể kết nối đó đang bận hay đang ngồi chơi,
   nó VẪN NẰM TRONG DANH SÁCH PHẢI DUYỆT.

   Và ảnh chụp được dựng RẤT thường xuyên — gần như mỗi câu lệnh.
```

Đo bằng công cụ phân tích CPU cho thấy: với 1 kết nối làm việc và 5.000 kết nối ngồi không, **50% thời gian CPU nằm trong hàm `GetSnapshotData()`**.

> **Hệ thống tự vấp chân chính mình.** Nửa sức lực dùng để trả lời câu hỏi *"ai đang mở kết nối?"* thay vì chạy truy vấn.

### Bản vá ở PostgreSQL 14 — và vì sao đừng mừng vội

Chính Freund sau đó vá nút thắt này trong PostgreSQL 14, kéo thông lượng **về gần đúng mức chưa có kết nối nào ngồi không**.

Nhưng đọc kỹ điều kiện đo:

```text
   Con số đẹp đó đo khi 10.000 kết nối NẰM IM HOÀN TOÀN.

   Đo lại đúng kịch bản đời thật — kết nối thỉnh thoảng có động tĩnh,
   chứ không nằm im như tượng — bản đã vá VẪN MẤT khoảng 16% thông lượng.
```

Nghĩa là: nâng cấp lên PostgreSQL 14+ giúp thật, nhưng **không xoá được lý do phải giữ pool nhỏ**.

### Còn bộ nhớ thì sao?

Với cấu hình đúng — quan trọng nhất là bật `huge_pages` — chi phí bộ nhớ của mỗi kết nối **dưới 2 MiB**. Nghe không nhiều, nhưng 10.000 kết nối là ~20 GB RAM chỉ để **ngồi không**.

Và nếu **không** bật `huge_pages`, con số đó phình lên đáng kể vì mỗi tiến trình cần bảng ánh xạ trang riêng cho vùng nhớ chung.

## Tầng 4 — Bằng chứng thực tế: 2048 → 96

Bản lật kèo thuyết phục nhất là của nhóm **Real-World Performance bên Oracle**. Họ cầm một hệ đang mở **2048 kết nối**, thẳng tay cắt xuống còn đúng **96**. Mọi thứ khác giữ nguyên.

```text
   Thời gian phản hồi:  ~100 ms  →  ~2 ms

   Cắt hơn 20 LẦN số kết nối,
   đổi lại nhanh lên cỡ 50 LẦN.
```

Hai con số đi ngược nhau, và đó chính là điều đáng nhớ: **họ không thêm gì cả, họ chỉ bớt đi.**

## Đánh đổi: pool nhỏ quá thì sao?

> *"Vậy cứ để pool thật nhỏ là xong chứ gì?"*

**Không có gì miễn phí.** Pool nhỏ đẩy hàng đợi từ database sang ứng dụng:

```text
   Pool nhỏ  →  request thừa xếp hàng chờ lấy kết nối Ở PHÍA ỨNG DỤNG
             →  hàng đợi dài ra
             →  Nhỏ QUÁ so với tải thật thì thời gian chờ vượt
                30 GIÂY (mức mặc định của HikariCP)
             →  LỖI NÉM HÀNG LOẠT, đúng vào giờ cao điểm.
```

Nhưng chú ý sự khác nhau giữa hai kiểu hỏng:

| | Pool quá LỚN | Pool quá NHỎ |
|---|---|---|
| Hàng đợi nằm ở | **Trong database** | **Trong ứng dụng** |
| Triệu chứng | Mọi câu lệnh chậm đều nhau, CPU cao, thông lượng tụt | Một số request chờ lâu rồi lỗi timeout, phần còn lại nhanh |
| Có nhìn thấy không | Khó — trông như "database yếu" | Dễ — có metric `pending threads` rõ ràng |
| Có kiểm soát được không | **Không** — database không biết ưu tiên ai | **Có** — bạn chọn được ai chờ, chờ bao lâu, ai bị từ chối trước |
| Khi quá tải | Sập dây chuyền | Từ chối có kiểm soát |

Đây là lý do wiki của HikariCP có một câu cực thấm:

> ***"Pool nhỏ, và luôn bão hoà."***

**Thà để request xếp hàng ngoan ngoãn bên ứng dụng, còn hơn thả chúng vào dẫm đạp lên nhau trong database.**

## Bài toán nhân bản: cái bẫy của kiến trúc microservice

Đây là chỗ rất nhiều đội tính sai:

```text
   Bạn đặt pool = 20. Rất kỷ luật. Rất đúng công thức.

   Rồi bạn scale lên 50 bản sao service.

        20 × 50 = 1.000 KẾT NỐI đập vào database.

   → Bạn vừa quay lại đúng con số 1000 mà bạn tưởng mình đã tránh.
```

Và nó còn tệ hơn thế, vì bạn thường có nhiều service:

```text
   service-don-hang:   20 × 50 bản =   1.000
   service-thanh-toan: 20 × 20 bản =     400
   service-bao-cao:    10 ×  5 bản =      50
   job chạy nền:       10 ×  3 bản =      30
   ────────────────────────────────────────────
   TỔNG:                              1.480 kết nối
   Trong khi database 8 core chỉ cần ~20.
```

**Lúc đó thứ cần thêm là một pooler đứng giữa điều phối, không phải nới trần kết nối của database.**

### PgBouncer: lễ tân đứng giữa

```text
   ┌──────────┐
   │ 50 bản   │──┐
   │ service  │  │
   └──────────┘  │    ┌────────────┐         ┌──────────────┐
                 ├───►│ PgBouncer  │────────►│  PostgreSQL  │
   ┌──────────┐  │    │            │         │   8 core     │
   │ 20 bản   │──┤    │ nhận 1.480 │         │              │
   │ service  │  │    │ giữ    20  │         │  chỉ thấy 20 │
   └──────────┘  │    └────────────┘         └──────────────┘
                 │
   ┌──────────┐  │
   │ job nền  │──┘
   └──────────┘
```

PgBouncer có ba chế độ, và **chọn sai chế độ là hỏng ứng dụng theo cách rất khó tìm**:

| Chế độ | Kết nối database được trả lại khi nào | Gom được bao nhiêu | Cái gì hỏng |
|---|---|---|---|
| **Session** | Khi client đóng kết nối | Rất ít — gần như vô dụng | Không hỏng gì |
| **Transaction** | Khi mỗi giao dịch kết thúc | **Rất nhiều** — chế độ nên dùng | Xem danh sách bên dưới |
| **Statement** | Sau mỗi câu lệnh | Nhiều nhất | Không dùng được giao dịch nhiều câu lệnh |

**Những thứ hỏng ở chế độ transaction** — đây là danh sách phải thuộc trước khi bật:

```text
   ✗ Prepared statement ở phía server
     (câu lệnh chuẩn bị trên kết nối này, lần sau rơi vào kết nối khác)
     → Với JDBC: đặt prepareThreshold=0
     → PgBouncer 1.21+ có hỗ trợ một phần, cần bật max_prepared_statements

   ✗ Biến phiên: SET search_path, SET timezone, SET application_name
     → đặt xong là mất khi kết nối được trả lại

   ✗ Advisory lock giữ ngoài giao dịch
     → dùng bản gắn với giao dịch: pg_advisory_xact_lock()

   ✗ LISTEN / NOTIFY
     → không dùng được, phải đi đường kết nối riêng

   ✗ Bảng tạm (temporary table) sống qua nhiều giao dịch
   ✗ WITH HOLD cursor
```

Danh sách này là lý do việc bật PgBouncer thường "chạy được ngay" rồi vài ngày sau mới lộ ra lỗi lạ.

## Quy trình: tìm con số của chính bạn

Công thức chỉ cho bạn **điểm xuất phát**. Con số thật phải đo. Đây là quy trình:

```text
   ① Dựng một bài đo tải mô phỏng đúng kiểu truy vấn thật của bạn
      (đừng đo bằng SELECT 1 — nó không chạm đĩa, không chạm khoá).

   ② Chạy với pool = 5, 10, 20, 40, 80, 160. Với MỖI mức, ghi lại:
        • thông lượng (giao dịch/giây)
        • độ trễ p50 và p99
        • CPU của máy database

   ③ Vẽ ra thì bạn sẽ thấy một đường cong có ĐẦU GỐI:

      thông lượng
         │        ╭──────●──────╮ ← từ đây thêm kết nối
         │      ╭─╯             ╰─────╮   là THÔNG LƯỢNG GIẢM
         │    ╭─╯                      ╰──╮
         │  ╭─╯                            ╰──
         │╭─╯
         └──────────────────────────────────► pool size
              10   20   40   80   160

   ④ Chọn con số ở ĐẦU GỐI, không phải ở đỉnh. Chừa biên an toàn.

   ⑤ Nhân với số bản sao service → so với max_connections của database.
      Vượt thì dựng PgBouncer, ĐỪNG nới max_connections.
```

### Ba tham số pool hay bị bỏ quên

```properties
# HikariCP
maximumPoolSize=20
minimumIdle=20              # bằng maximumPoolSize: pool cố định, không co giãn
                            # → tránh cơn bão mở kết nối lúc tải tăng đột ngột

connectionTimeout=3000      # 3 giây, KHÔNG phải 30 giây mặc định.
                            # Chờ 30 giây rồi mới lỗi là đã quá muộn:
                            # người dùng bỏ đi từ lâu, còn request vẫn
                            # giữ chỗ trong hàng đợi.

maxLifetime=1800000         # 30 phút. Kết nối bị thay mới định kỳ.
                            # Quan trọng vì hai lý do: tránh kết nối bị
                            # đứt âm thầm bởi firewall/load balancer,
                            # và giải phóng bộ nhớ tích trên kết nối
                            # (xem Bài 14).

leakDetectionThreshold=60000 # cảnh báo khi có kết nối mượn quá 60s
                             # mà không trả — dấu hiệu quên đóng
```

Dòng `connectionTimeout=3000` đáng nhấn mạnh. Mặc định 30 giây nghe như "rộng rãi cho chắc", nhưng thực tế nó biến một sự cố nhỏ thành sự cố lớn: request giữ chỗ trong hàng đợi 30 giây trong khi người dùng đã bỏ đi và bấm lại — nhân đôi tải vào đúng lúc hệ đang yếu.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Tăng pool khi thấy chậm | Băm nhỏ sức đang có, thông lượng tụt thêm | Đo đường cong, chọn điểm đầu gối |
| Đặt pool bằng số core | Bỏ qua thời gian chờ I/O — core sẽ rảnh | `(core × 2) + số đĩa` làm điểm xuất phát |
| Nghĩ kết nối ngồi không thì vô hại | PG12: 10.000 kết nối ngồi không làm mất ~50% thông lượng | Giữ pool nhỏ; nâng lên PG14+ |
| Tưởng PG14 đã giải quyết xong | Kịch bản đời thật vẫn mất ~16% | Vẫn phải giữ pool nhỏ |
| Quên nhân với số bản sao service | 20 × 50 = 1.000 kết nối vào database | Tính tổng toàn hệ; dựng PgBouncer |
| Nới `max_connections` cho hết lỗi | Chữa triệu chứng, làm nguyên nhân nặng thêm | PgBouncer, không nới trần |
| Bật PgBouncer chế độ transaction mà không kiểm | Prepared statement, `SET`, advisory lock, `LISTEN` đều hỏng | Đọc kỹ danh sách; đặt `prepareThreshold=0` |
| Để `connectionTimeout` 30 giây | Request chết giữ chỗ, người dùng bấm lại → nhân đôi tải | 2–5 giây |
| Dùng SSD rồi mở pool to hơn | SSD ít phải chờ hơn → pool tối ưu **nhỏ hơn** | Đo lại, đừng suy diễn |
| `minimumIdle` nhỏ hơn `maximumPoolSize` | Tải tăng đột ngột gây cơn bão mở kết nối | Đặt bằng nhau cho dịch vụ chạy liên tục |
| Đo bằng `SELECT 1` | Không chạm đĩa, không chạm khoá — kết quả vô nghĩa | Đo bằng truy vấn thật |

## Bản mẫu 30 giây

> *"Em không tăng pool. Ở phần lớn trường hợp, tăng pool làm chậm thêm chứ không nhanh lên — vì một core tại một thời điểm chỉ chạy được một việc, nên thêm kết nối chỉ khiến CPU tốn sức đổi ca và đá dữ liệu của nhau ra khỏi cache thay vì chạy truy vấn.*
>
> *Điểm xuất phát của em là công thức `(số core × 2) + số đĩa` — server 8 core thì tầm 16 đến 20 kết nối. Rồi em đo đường cong thông lượng theo pool size và chọn điểm đầu gối, chứ không tin công thức tuyệt đối.*
>
> *Kết nối ngồi không cũng không hề vô hại: trên PostgreSQL 12, 10.000 kết nối ngồi không làm 48 kết nối đang làm việc mất gần một nửa thông lượng — từ hơn 1 triệu xuống khoảng 520 nghìn giao dịch một giây. Lý do là mỗi lần dựng ảnh chụp dữ liệu, Postgres phải lướt qua toàn bộ danh sách kết nối. PostgreSQL 14 có vá chỗ đó, nhưng đo lại theo kịch bản đời thật thì vẫn mất khoảng 16%.*
>
> *Bằng chứng em hay dẫn là của nhóm Real-World Performance bên Oracle: họ cắt từ 2048 xuống 96 kết nối, mọi thứ khác giữ nguyên, thời gian phản hồi rớt từ khoảng 100 mili-giây xuống khoảng 2.*
>
> *Nhưng em cũng nói vế còn lại: pool nhỏ quá thì request xếp hàng ở phía ứng dụng, và với mặc định 30 giây của HikariCP thì đúng giờ cao điểm sẽ lỗi hàng loạt. Em hạ `connectionTimeout` xuống 2–3 giây để hỏng nhanh và có kiểm soát. Và em luôn nhân pool với số bản sao service — pool 20 nhân 50 bản là 1.000 kết nối vào database; lúc đó thứ cần thêm là PgBouncer chứ không phải nới `max_connections`."*

## Tóm tắt bài 13

- **Thêm kết nối không thêm sức mạnh** — một core tại một thời điểm chỉ chạy một việc. Thêm kết nối chỉ băm nhỏ sức đang có.
- Đổi ca tốn nhất **không phải** ở việc cất/nạp trạng thái, mà ở chỗ **đá dữ liệu của nhau ra khỏi cache của con chip** và **tranh giành khoá**.
- Công thức xuất phát: **`(số core × 2) + số đĩa hiệu dụng`**. Server 8 core → khoảng 16–20 kết nối.
- **SSD nhanh thì pool tối ưu còn nhỏ hơn**, vì truy vấn ít phải chờ nên core ít rảnh.
- **Kết nối ngồi không vẫn phá:** PostgreSQL 12, 10.000 kết nối ngồi không làm mất **~50% thông lượng** (1.032.435 → 521.558 giao dịch/giây), vì mỗi lần dựng ảnh chụp phải lướt toàn bộ danh sách kết nối. PostgreSQL 14 vá lại nhưng đời thật vẫn mất **~16%**.
- Bằng chứng đảo chiều: Oracle cắt **2048 → 96**, độ trễ **~100 ms → ~2 ms**.
- **Pool nhỏ đẩy hàng đợi sang ứng dụng — đó là điều tốt**, vì ở đó bạn kiểm soát được ai chờ và ai bị từ chối. *"Pool nhỏ, và luôn bão hoà."*
- **Luôn nhân pool với số bản sao service.** Vượt trần thì dựng **PgBouncer**, đừng nới `max_connections`.
- PgBouncer chế độ transaction làm hỏng **prepared statement, biến phiên, advisory lock, `LISTEN/NOTIFY`, bảng tạm** — đọc danh sách trước khi bật.

**Bài kế tiếp** → [Bài 14: MySQL phình bộ nhớ mà không hề rò](02-mysql-phinh-bo-nho-khong-phai-ro.md)
