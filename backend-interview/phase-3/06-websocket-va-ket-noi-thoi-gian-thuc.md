# Bài 6: WebSocket và kết nối thời gian thực

20 giờ 03 phút, trọng tài thổi còi, trận chung kết bắt đầu. Trong đúng 40 giây đó, **120.000 người** cùng mở ứng dụng xem trực tiếp của bạn.

Server chết. Nhưng nhìn vào biểu đồ:

```text
   CPU:  4%
   RAM:  còn trống một nửa
   Lỗi 500: KHÔNG CÓ MỘT REQUEST NÀO

   Chỉ đơn giản là không ai kết nối vào được nữa.
```

Bạn mở log. Không stack trace, không exception, chỉ một dòng lặp đi lặp lại đến vô tận:

```text
EMFILE: too many open files (1024)
```

**1024.** Đó không phải giới hạn của RAM hay CPU. Đó là số **"sợi dây"** mà một tiến trình được phép cầm cùng lúc. Và bạn chưa bao giờ đếm chúng.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **WebSocket** | Kênh hai chiều luôn mở giữa client và server |
| **File Descriptor (FD)** | **Mô tả tệp** — con số hệ điều hành cấp cho mỗi socket/file đang mở |
| **EMFILE** | Lỗi "hết file descriptor" của tiến trình |
| **C10K** | Bài toán kinh điển 1999: giữ 10.000 kết nối trên một máy |
| **`epoll` / `kqueue`** | Cơ chế của kernel để theo dõi hàng vạn socket bằng một luồng |
| **Backplane** | **Cầu nối** giữa các máy chủ để tin nhắn đi được từ máy này sang máy kia |
| **Fan-out** | **Toả ra** — một tin nhắn phải ghi xuống N socket |
| **Backpressure** | **Áp lực ngược** — client nhận chậm hơn tốc độ server gửi |
| **Pre-encode** | **Mã hoá trước** — chuẩn bị sẵn gói byte một lần rồi bắn cho mọi người |
| **Batching / Coalescing** | **Gộp tin** — dồn nhiều tin nhỏ thành một khung |
| **Reconnect storm** | **Bão kết nối lại** — hàng vạn client cùng nối lại một lúc |
| **Sticky session** | **Phiên dính** — client luôn được đưa về đúng máy cũ |

## Kiến trúc và cách hoạt động: WebSocket khác HTTP ở đâu

```text
   HTTP REQUEST — như gửi một lá thư
   ┌────────┐  "cho tôi giá trận đấu"   ┌────────┐
   │ Client │ ─────────────────────────►│ Server │
   │        │◄──────── kết quả ─────────│        │
   └────────┘                            └────────┘
        → Xong. Server QUÊN BẠN NGAY LẬP TỨC (stateless).
        → Không giữ gì cả. Muốn biết tin mới? Hỏi lại.


   WEBSOCKET — như một đường dây điện thoại luôn mở
   ┌────────┐  GET /ws                            ┌────────┐
   │ Client │  Upgrade: websocket ───────────────►│ Server │
   │        │◄── HTTP 101 Switching Protocols ────│        │
   │        │                                      │        │
   │        │◄══════ ĐƯỜNG DÂY MỞ MÃI ═══════════►│        │
   │        │   hai đầu nói BẤT CỨ LÚC NÀO         │        │
   └────────┘                                      └────────┘
        → Bắt đầu bằng MỘT request HTTP xin nâng cấp,
          rồi KHÔNG BAO GIỜ CÚP MÁY.
```

**Và đây là chỗ trả giá.** Mỗi kết nối đang mở — **dù im lặng, dù không gửi gì** — vẫn chiếm:

```text
   ① 1 File Descriptor
   ② 2 vùng đệm trong kernel (một để nhận, một để gửi)
   ③ 1 đối tượng trong ứng dụng của bạn

   10.000 kết nối IM LẶNG vẫn ăn RAM.
   100.000 kết nối IM LẶNG vẫn ăn RAM.
```

Bài toán này cũ tới mức có tên riêng từ năm 1999: **C10K** — *làm sao giữ 10.000 kết nối trên một máy?*

## Ba bức tường: GIỮ — CHIA — PHÁT

Đây là bộ khung để nhớ cả bài, và cũng là bộ khung để trả lời phỏng vấn.

```text
   ① GIỮ  — một máy giữ được bao nhiêu sợi dây?
   ② CHIA — nhiều máy nói chuyện với nhau thế nào?
   ③ PHÁT — một tin nhắn nhân bản ra 100.000 lần mà không chết?
```

---

## Bức tường 1 — GIỮ

### ① Nâng trần File Descriptor

Linux mặc định cho mỗi tiến trình cầm **1024** file descriptor. Đó chính là con số trong log.

```bash
# Xem trần hiện tại
ulimit -n                    # 1024

# Nâng trần
ulimit -n 1048576
```

```ini
# Vĩnh viễn — /etc/security/limits.conf
*  soft  nofile  1048576
*  hard  nofile  1048576
```

```yaml
# Trong Docker / Kubernetes
# docker-compose.yml
ulimits:
  nofile: { soft: 1048576, hard: 1048576 }
```

```text
   Bức tường 1 đổ trong 3 giây.

   NHƯNG ĐỪNG MỪNG VỘI:
   nâng trần chỉ là GIẤY PHÉP, không có nghĩa là RAM theo kịp.
```

### ② Tối ưu vùng đệm

```text
   Mỗi kết nối ngốn vài chục KB vùng đệm trong kernel:

      100.000 kết nối × 40 KB = 4 GB RAM
      (chưa gửi một tin nhắn nào!)
```

```bash
# Giảm vùng đệm mặc định khi tin nhắn nhỏ (chat, tỉ số, thông báo)
sysctl -w net.ipv4.tcp_rmem="4096 16384 262144"
sysctl -w net.ipv4.tcp_wmem="4096 16384 262144"
sysctl -w net.core.somaxconn=65535
```

**Đây là bài toán đánh đổi:** vùng đệm nhỏ thì chứa được nhiều kết nối hơn, nhưng client mạng chậm sẽ bị nghẽn sớm hơn. Đo trước, đừng đoán.

### ③ Mô hình xử lý: luồng hay vòng lặp sự kiện

```text
   KIỂU CŨ — 1 kết nối = 1 luồng
      10.000 kết nối = 10.000 luồng
      → mỗi luồng ~1 MB stack = 10 GB
      → cộng chi phí chuyển ngữ cảnh của hệ điều hành
      → CHẾT trước khi tới 10.000

   LỜI GIẢI — vòng lặp sự kiện + epoll
      MỘT luồng cầm cả trăm nghìn sợi dây.
      Nó hỏi kernel một câu: epoll_wait() → "AI VỪA NÓI?"
      Kernel trả về danh sách socket đã sẵn sàng.
      → Không phải hỏi từng socket một.
```

Đây chính là cơ chế đã học ở phase-1 bài 3 — nay áp dụng vào bài toán thật.

### ④ Không được chặn vòng lặp sự kiện

Vòng lặp sự kiện có một **luật máu**:

```javascript
// ❌ THẢM HOẠ
ws.on('message', (data) => {
    const obj = JSON.parse(data);        // chuỗi 2 MB → chặn 200 ms
    const kq = tinhToanNang(obj);        // CPU 300 ms
    ws.send(JSON.stringify(kq));
});
```

```text
   Một tác vụ nặng 200 ms KHÔNG CHỈ làm một người chờ.
   Nó làm TẤT CẢ 100.000 NGƯỜI CÙNG KHỰNG LẠI 200 ms.

   Cả hệ thống đóng băng, và biểu đồ CPU vẫn hiện 4%.
```

```javascript
// ✅ Đẩy việc nặng sang worker thread
const { Worker } = require('worker_threads');
const pool = taoWorkerPool(4);

ws.on('message', async (data) => {
    const kq = await pool.run(data);     // vòng lặp vẫn quay
    ws.send(kq);
});
```

### ⑤ Dọn kết nối chết bằng Ping/Pong

```text
   KẾT NỐI CHẾT KHÔNG TỰ BÁO TỬ.

   Người dùng chui vào thang máy, mất sóng.
   TCP KHÔNG HỀ BIẾT — nó tưởng kết nối vẫn còn.
   File descriptor vẫn bị giữ. Vùng đệm vẫn bị chiếm.

   → Rò rỉ kết nối: sau vài giờ, bạn hết FD vì toàn "xác".
```

```javascript
// ✅ Ping mỗi 30 giây, ai không trả lời thì cắt
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.conSong === false) return ws.terminate();   // lượt trước không trả lời
        ws.conSong = false;
        ws.ping();
    });
}, 30_000);

wss.on('connection', (ws) => {
    ws.conSong = true;
    ws.on('pong', () => { ws.conSong = true; });
});
```

> **Chốt bức tường 1:** giới hạn của một máy nằm ở **file descriptor và RAM**, không phải CPU. Nâng trần FD, tinh chỉnh vùng đệm, **không chặn vòng lặp sự kiện**, và **tự dọn xác kết nối**.

---

## Bức tường 2 — CHIA

Một máy có trần thật — thường **60.000–80.000 kết nối**. Muốn hơn thì phải thêm máy và đặt load balancer phía trước.

```text
   VỚI HTTP: đơn giản. Request rơi vào máy nào cũng được.

   VỚI WEBSOCKET: BẮT TAY Ở ĐÂU PHẢI Ở LẠI ĐÓ.
   → cần sticky session (ip_hash, hoặc cookie dính)
```

```nginx
upstream ws_backend {
    ip_hash;                          # cùng IP → cùng máy
    server app1:8080;
    server app2:8080;
}
server {
    location /ws {
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;      # ◄── BẮT BUỘC
        proxy_set_header Connection "upgrade";          # ◄── BẮT BUỘC
        proxy_read_timeout 3600s;                       # ◄── nếu không, LB tự cắt sau 60s
    }
}
```

> Ba dòng cuối là chỗ hay quên nhất: thiếu `Upgrade`/`Connection` thì bắt tay thất bại; thiếu `proxy_read_timeout` thì load balancer tự cắt kết nối "im lặng quá lâu" — và bạn sẽ thấy client bị rớt đúng mỗi 60 giây mà không hiểu vì sao.

### Thách thức thật: tin nhắn không biết bơi

```text
   User A kết nối vào MÁY A.
   User B kết nối vào MÁY B.

   A gửi tin cho B.

   → MÁY A KHÔNG THỂ gửi tới B.
     Nó không giữ socket của B. Hai máy là HAI HÒN ĐẢO ĐỘC LẬP.
```

**Lời giải: Backplane (cầu nối) bằng Pub/Sub.**

```text
                   ┌──────────────────┐
                   │   REDIS Pub/Sub  │
                   └───┬──────────┬───┘
              publish  │          │  subscribe
                   ┌───▼───┐  ┌───▼───┐
      User A ─────►│ Máy A │  │ Máy B │◄───── User B
                   └───────┘  └───────┘

   ① Máy A KHÔNG gửi thẳng cho B. Nó PUBLISH lên Redis.
   ② TẤT CẢ các máy (kể cả A) đều SUBSCRIBE chủ đề đó.
   ③ Mỗi máy đẩy tin xuống những client thuộc quản lý của MÌNH.
```

```javascript
// Máy nào cũng chạy đoạn này
const sub = redis.duplicate();
await sub.subscribe('room:1042');

sub.on('message', (channel, payload) => {
    const roomId = channel.split(':')[1];
    for (const ws of phongCuaMayNay.get(roomId) ?? []) {
        if (ws.readyState === ws.OPEN) ws.send(payload);
    }
});

// Khi có tin mới
async function guiTin(roomId, tin) {
    await redis.publish(`room:${roomId}`, JSON.stringify(tin));
}
```

> **Chốt bức tường 2:** trạng thái **không thuộc về máy chủ, nó thuộc về kết nối**. Muốn nhân bản máy chủ phải làm hai việc: **dính đúng máy** (sticky) và **bắc cầu giữa các máy** (backplane).

---

## Bức tường 3 — PHÁT

Đây là bức tường **toán học**.

```text
   Một tin nhắn gửi vào phòng 100.000 người
   → Server phải GHI 100.000 LẦN xuống 100.000 socket.

   Đây là fan-out O(N). Không có cách nào tránh được N.
   Nhưng có ba cách làm cho mỗi lần ghi RẺ ĐI RẤT NHIỀU.
```

### ① Mã hoá một lần (pre-encode)

```javascript
// ❌ Gọi JSON.stringify 100.000 lần cho CÙNG MỘT nội dung
for (const ws of clients) {
    ws.send(JSON.stringify(tin));        // tốn CPU × 100.000
}

// ✅ Mã hoá MỘT LẦN, bắn đi khắp nơi
const goi = Buffer.from(JSON.stringify(tin));
for (const ws of clients) {
    ws.send(goi);                        // chỉ còn thao tác ghi
}
```

Thư viện `uWebSockets.js` còn đi xa hơn: nó cho phép **đóng khung WebSocket sẵn** (pre-framed) để bỏ luôn chi phí tạo khung cho mỗi client.

### ② Đo áp lực ngược (backpressure)

```text
   Client mạng chậm (3G, tàu điện ngầm) nhận không kịp.
   → Vùng đệm gửi trên RAM server PHÌNH TO.
   → 1.000 client chậm × 50 MB = server hết RAM và chết.

   ĐÂY LÀ CÁCH MỘT VÀI CLIENT YẾU GIẾT CẢ HỆ THỐNG.
```

```javascript
const NGUONG = 1 * 1024 * 1024;          // 1 MB

for (const ws of clients) {
    if (ws.bufferedAmount > NGUONG) {
        // client này không theo kịp
        ws.close(1013, 'quá tải');       // hoặc: bỏ qua tin này
        continue;
    }
    ws.send(goi);
}
```

> **Vứt tin cũ còn hơn chết cả server.** Với dữ liệu thời gian thực (tỉ số, giá cổ phiếu), tin cũ vốn đã vô giá trị — bỏ nó đi là quyết định đúng, không phải thoả hiệp.

### ③ Gộp tin (batching)

```text
   Đừng bắn 50 tin mỗi giây.
   MẮT NGƯỜI CHỈ NHÌN THẤY 10–60 khung hình mỗi giây.

   Gộp 50 tin thành 10 khung/giây
   → CẮT BỚT 80% số lần gọi hệ thống (system call)
   → mà người dùng KHÔNG NHẬN RA khác biệt nào.
```

```javascript
const hangCho = new Map();               // roomId → mảng tin

function xepHang(roomId, tin) {
    if (!hangCho.has(roomId)) hangCho.set(roomId, []);
    hangCho.get(roomId).push(tin);
}

setInterval(() => {                      // 10 khung/giây
    for (const [roomId, tins] of hangCho) {
        if (tins.length === 0) continue;
        const goi = Buffer.from(JSON.stringify({ batch: tins }));
        phatChoPhong(roomId, goi);
        tins.length = 0;
    }
}, 100);
```

> **Chốt bức tường 3:** một tin vào, trăm nghìn tin ra. **Mã hoá một lần**, **kiểm soát áp lực ngược**, **gộp tin**.

---

## Cơn bão kết nối lại (reconnect storm)

Bạn deploy bản vá và khởi động lại server. **100.000 kết nối đứt cùng một giây.**

```text
   Tất cả 100.000 client cùng tự động kết nối lại CÙNG LÚC
   → quật sập chính cái server vừa khởi động xong
   → nó chết → client lại thử lại → vòng lặp tử thần
```

```javascript
// ✅ Client phải có backoff mũ + jitter
let lanThu = 0;

function ketNoi() {
    const ws = new WebSocket(URL);

    ws.onopen  = () => { lanThu = 0; };            // thành công thì reset

    ws.onclose = () => {
        const cho = Math.min(1000 * 2 ** lanThu, 30_000);
        const jitter = cho * (0.5 + Math.random());  // ◄── 50%–150%
        lanThu++;
        setTimeout(ketNoi, jitter);
    };
}
```

**Ở phía server**, hai biện pháp đi kèm:

```text
① TẮT ÊM (graceful shutdown): gửi mã đóng 1012 "Service Restart"
   kèm gợi ý thời gian chờ, thay vì cắt phũ.
② TRIỂN KHAI CUỐN CHIẾU (rolling deploy): tắt từng máy một,
   không tắt cả cụm cùng lúc.
```

## Chọn công nghệ: WebSocket không phải lúc nào cũng đúng

| | WebSocket | SSE | Polling |
|---|---|---|---|
| Chiều | **Hai chiều** | Một chiều (server → client) | Một chiều (client hỏi) |
| Giao thức | Nâng cấp từ HTTP | **HTTP thường** | HTTP thường |
| Qua proxy/CDN | Hay bị chặn | ✅ Dễ | ✅ Dễ nhất |
| Tự kết nối lại | Phải tự viết | ✅ **Trình duyệt tự làm** | Không cần |
| Chi phí server | **Đắt nhất** | Rẻ hơn nhiều | Rẻ, nhưng tốn băng thông |
| Nén HTTP/2 | Không | ✅ Có | ✅ Có |
| Dùng cho | Chat, game, cộng tác | Thông báo, tiến độ, tỉ số | Dữ liệu ít đổi |

```text
   CÂY QUYẾT ĐỊNH

   Client có cần GỬI liên tục lên server không?
        │
        ├── KHÔNG → dữ liệu đổi nhanh không?
        │             ├── CÓ    → SSE          ◄── rẻ hơn nhiều, tự reconnect
        │             └── KHÔNG → Polling      ◄── đơn giản nhất
        │
        └── CÓ → WebSocket
                 (chat, game nhiều người, con trỏ cộng tác, gọi thoại)
```

> **Realtime là một khoản nợ vận hành.** Đừng lạm dụng WebSocket khi SSE hay polling là đủ — bạn đang mua thêm sticky session, backplane, quản lý vòng đời kết nối, và bão reconnect.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Kết nối WebSocket bị rớt đúng mỗi 60 giây, dù mạng client hoàn toàn ổn.

```text
   Nguyên nhân theo thứ tự cần kiểm:

   ① LOAD BALANCER / PROXY tự cắt kết nối "im lặng"
      → nginx: proxy_read_timeout 3600s
      → AWS ALB: Idle timeout mặc định 60s → tăng lên
      → Cloudflare: ~100s cho gói miễn phí

   ② THIẾU HEARTBEAT
      → Ping/Pong mỗi 30 giây giữ cho kết nối "có hoạt động"
      → và đây cũng là cơ chế dọn xác kết nối

   ③ THIẾU header nâng cấp ở proxy
      → proxy_set_header Upgrade / Connection
```

> **Tình huống 2:** Server chạy tốt với 5.000 kết nối, nhưng lên 20.000 thì RAM cạn dù mỗi kết nối gần như im lặng.

```text
   ✅ Ba việc đo theo thứ tự:

   ① ĐẾM FD THẬT — có bao nhiêu là kết nối SỐNG?
        ls /proc/<pid>/fd | wc -l
      Nếu số này lớn hơn nhiều số client thật → RÒ RỈ KẾT NỐI
      → thiếu Ping/Pong dọn xác

   ② ĐO VÙNG ĐỆM KERNEL
        ss -tm | grep -A1 ESTAB | head
      Vùng đệm mặc định quá lớn cho tin nhắn nhỏ → giảm xuống

   ③ ĐO BỘ NHỚ ỨNG DỤNG mỗi kết nối
      Bạn đang giữ gì trong đối tượng của mỗi client?
      Lịch sử tin nhắn? Hồ sơ đầy đủ? → chỉ giữ userId + roomId,
      phần còn lại tra từ Redis khi cần.
```

> **Tình huống 3:** Người phỏng vấn hỏi *"thiết kế hệ thống chat cho 1 triệu người dùng đồng thời"*.

```text
   ✅ Trả lời theo khung GIỮ – CHIA – PHÁT, và bắt đầu bằng CON SỐ:

   "Trước hết em ước lượng: 1 triệu kết nối đồng thời, một máy giữ được
    khoảng 60–80 nghìn, nên cần khoảng 15–20 máy cho tầng kết nối.

    GIỮ: mỗi máy nâng trần file descriptor, dùng vòng lặp sự kiện chứ
    không phải một luồng một kết nối, đẩy việc nặng sang worker thread,
    và Ping/Pong 30 giây để dọn xác kết nối — vì TCP không báo tử khi
    người dùng mất sóng.

    CHIA: load balancer với sticky session, vì bắt tay ở máy nào phải ở
    lại máy đó. Hai máy là hai hòn đảo nên cần backplane — em dùng Redis
    Pub/Sub: máy gửi publish lên kênh của phòng, mọi máy subscribe rồi
    đẩy xuống client của mình.

    PHÁT: mã hoá gói tin một lần rồi bắn đi, kiểm bufferedAmount để ngắt
    client nhận không kịp, và gộp tin thành 10 khung mỗi giây vì mắt người
    không thấy nhanh hơn thế.

    Và hai thứ em sẽ nói thêm nếu còn thời gian: bão reconnect khi deploy —
    client phải có backoff mũ kèm jitter, server thì rolling deploy. Còn
    lịch sử tin nhắn thì em KHÔNG để trên tầng WebSocket — nó nằm ở
    database, WebSocket chỉ lo đường truyền."
```

Câu cuối là câu ăn điểm: **tách tầng truyền tin khỏi tầng lưu trữ**. Rất nhiều thiết kế sai vì gộp hai thứ đó.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không nâng trần file descriptor | `EMFILE` ở đúng 1024 kết nối | `ulimit -n` + `limits.conf` |
| Không có Ping/Pong | Xác kết nối tích luỹ, hết FD sau vài giờ | Ping 30s, ai không `pong` thì cắt |
| Gọi hàm chặn trong vòng lặp sự kiện | **100.000 người cùng đóng băng** | Worker thread cho việc nặng |
| Thiếu `proxy_read_timeout` | Rớt kết nối đúng mỗi 60 giây | Tăng timeout ở mọi proxy trên đường |
| Thiếu header `Upgrade`/`Connection` | Bắt tay thất bại qua proxy | Cấu hình đủ ở nginx/ALB |
| Không sticky session | Client nhảy máy, mất trạng thái | `ip_hash` hoặc cookie dính |
| Không có backplane | Tin nhắn không sang được máy khác | Redis Pub/Sub |
| `JSON.stringify` cho từng client | Tốn CPU × N | **Mã hoá một lần** |
| Không kiểm `bufferedAmount` | Vài client 3G làm hết RAM server | Ngưỡng + ngắt hoặc bỏ tin |
| Bắn từng tin một | Quá nhiều system call | **Gộp 10 khung/giây** |
| Client reconnect không jitter | **Bão reconnect** quật sập server vừa lên | Backoff mũ + jitter |
| Tắt cả cụm khi deploy | 100.000 kết nối đứt cùng lúc | Rolling deploy + mã đóng 1012 |
| Giữ lịch sử tin nhắn trong bộ nhớ WS | Mất khi restart, không scale | Database lo lưu, WS lo truyền |
| Dùng WebSocket cho thông báo một chiều | Phức tạp không cần thiết | **SSE** rẻ hơn nhiều |

## Câu hỏi phỏng vấn hay gặp

**H: WebSocket khác HTTP thế nào?**
HTTP là gửi một lá thư — hỏi, trả lời, rồi server **quên bạn ngay**. WebSocket bắt đầu bằng một request HTTP xin nâng cấp (`101 Switching Protocols`) rồi **không bao giờ cúp máy**: một đường dây mở, hai đầu nói bất cứ lúc nào. Cái giá là mỗi kết nối **dù im lặng** vẫn chiếm một file descriptor, hai vùng đệm kernel, và một đối tượng trong ứng dụng — nên 100.000 kết nối im lặng vẫn ăn hàng GB RAM.

**H: Vì sao server chết mà CPU chỉ 4%?**
Vì nút thắt không phải CPU mà là **file descriptor**. Linux mặc định cho mỗi tiến trình 1024 FD, và mỗi kết nối ăn một cái — hết là `EMFILE: too many open files`, không có request nào lỗi 500 vì **không ai vào được tới ứng dụng**. Nâng trần bằng `ulimit -n` giải quyết trong 3 giây, nhưng đó chỉ là giấy phép — sau đó RAM cho vùng đệm mới là trần thật.

**H: Nhiều máy chủ WebSocket thì tin nhắn đi từ máy này sang máy kia thế nào?**
Không đi được — hai máy là hai hòn đảo, máy A không giữ socket của client đang nối vào máy B. Cần hai thứ: **sticky session** để client luôn về đúng máy đã bắt tay, và **backplane** để bắc cầu — thường là Redis Pub/Sub. Máy gửi không gửi thẳng mà **publish** lên kênh của phòng; mọi máy **subscribe** kênh đó rồi đẩy xuống client thuộc quản lý của mình.

**H: Một tin nhắn gửi cho 100.000 người, tối ưu thế nào?**
Fan-out là O(N), không tránh được N — nhưng làm mỗi lần ghi rẻ đi được. Ba kỹ thuật: **mã hoá một lần** thay vì gọi `JSON.stringify` 100.000 lần cho cùng nội dung; **kiểm `bufferedAmount`** để ngắt client nhận không kịp, vì vài client 3G có thể làm phình vùng đệm và giết cả server — vứt tin cũ còn hơn chết cả server; và **gộp tin** thành 10 khung mỗi giây, vì mắt người không thấy nhanh hơn thế mà lại cắt được 80% số lần gọi hệ thống.

**H: Deploy lại thì 100.000 kết nối đứt cùng lúc, xử lý sao?**
Đó là **bão reconnect** — tất cả cùng nối lại một giây và quật sập chính server vừa khởi động. Phía client phải có **backoff mũ kèm jitter**, không phải thử lại ngay. Phía server thì **rolling deploy** tắt từng máy một, và gửi mã đóng `1012 Service Restart` thay vì cắt phũ để client biết đường chờ.

**H: Khi nào KHÔNG nên dùng WebSocket?**
Khi client không cần **gửi** liên tục lên server. Thông báo, tiến độ job, tỉ số trận đấu, cập nhật trạng thái đơn — tất cả đều một chiều, và **SSE** rẻ hơn nhiều: nó chạy trên HTTP thường nên qua proxy/CDN dễ, được nén HTTP/2, và **trình duyệt tự kết nối lại** giúp bạn. Realtime là một khoản nợ vận hành — WebSocket bắt bạn mua thêm sticky session, backplane, quản lý vòng đời kết nối và bão reconnect.

## Tóm tắt bài 6

- WebSocket giữ **đường dây mở mãi** — mỗi kết nối **dù im lặng** vẫn ăn 1 file descriptor + 2 vùng đệm kernel + 1 đối tượng ứng dụng.
- Nút thắt là **FD và RAM, không phải CPU** — server chết với CPU 4% và log chỉ có `EMFILE`.
- Ba bức tường: **GIỮ** (nâng trần FD, tinh chỉnh buffer, event loop, không chặn, Ping/Pong dọn xác) — **CHIA** (sticky session + **backplane** Redis Pub/Sub) — **PHÁT** (pre-encode, backpressure, batching).
- **Kết nối chết không tự báo tử** — TCP không biết người dùng mất sóng, nên phải có heartbeat.
- **Một hàm chặn treo cả 100.000 người**; và **vài client 3G có thể giết server** qua vùng đệm phình to.
- **Bão reconnect** khi deploy: client cần backoff mũ + jitter, server cần rolling deploy.
- **Realtime là khoản nợ vận hành** — SSE đủ cho mọi thứ một chiều và rẻ hơn nhiều.
- Tách **tầng truyền tin** khỏi **tầng lưu trữ**: WebSocket lo đường truyền, database lo lịch sử.

**Bài kế tiếp** → [Phase 4, Bài 1: Big O — thước đo của một lập trình viên giỏi](../phase-4/01-big-o-thuoc-do-cua-lap-trinh-vien-gioi.md)
