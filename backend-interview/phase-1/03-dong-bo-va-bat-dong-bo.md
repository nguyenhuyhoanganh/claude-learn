# Bài 3: Đồng bộ và bất đồng bộ — ùn tắc hay thông thoáng

Hai quán cà phê, cùng một lượng khách, cùng số nhân viên. Quán A xếp hàng dài ra tận cửa. Quán B mượt mà, không ai phải chờ.

Khác biệt duy nhất: **cách nhân viên xử lý lúc chờ máy pha cà phê chạy.**

Đây cũng chính xác là khác biệt giữa **đồng bộ** và **bất đồng bộ** — và là câu hỏi phỏng vấn backend mà rất nhiều người trả lời được định nghĩa nhưng không giải thích nổi *vì sao Node.js chỉ một luồng mà vẫn phục vụ được nhiều người hơn*.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt | Giải thích ngắn |
|---|---|---|
| **Synchronous** (sync) | **Đồng bộ** | Làm xong việc này mới làm việc kia |
| **Asynchronous** (async) | **Bất đồng bộ** | Giao việc rồi đi làm việc khác, xong thì quay lại |
| **Blocking** | **Chặn** | Luồng đứng im chờ, không làm gì được |
| **Non-blocking** | **Không chặn** | Luồng trả về ngay, kết quả tới sau |
| **Thread** | **Luồng** | Một dòng thực thi; mỗi luồng tốn ~1 MB RAM |
| **Process** | **Tiến trình** | Một chương trình đang chạy; nặng hơn luồng nhiều |
| **Concurrency** | **Đồng thời** | Xử lý nhiều việc **xen kẽ** (một người, nhiều việc) |
| **Parallelism** | **Song song** | Xử lý nhiều việc **cùng lúc thật** (nhiều người, nhiều việc) |
| **Event loop** | **Vòng lặp sự kiện** | Cơ chế điều phối việc trong mô hình bất đồng bộ |
| **Callback** | **Hàm gọi lại** | Hàm được chạy khi việc kia xong |
| **Promise / Future** | **Lời hứa** | Đối tượng đại diện cho kết quả *sẽ có* trong tương lai |
| **I/O** | **Vào/ra** | Đọc đĩa, gọi mạng, truy vấn database — thứ chờ lâu |
| **CPU-bound** | **Nặng tính toán** | Nút thắt là CPU (nén ảnh, mã hoá, tính toán) |
| **I/O-bound** | **Nặng chờ đợi** | Nút thắt là chờ mạng/đĩa — **đa số web app** |

## Khác biệt cốt lõi, bằng hình

```text
ĐỒNG BỘ (blocking) — nhân viên đứng nhìn máy pha cà phê

  Khách 1: gọi món ──► [pha 3 phút: NHÂN VIÊN ĐỨNG NHÌN] ──► giao
  Khách 2:            ...đợi...                              gọi món ──►
  Khách 3:            ...đợi... ...đợi...

  3 khách × 3 phút = 9 phút.  Nhân viên "bận" nhưng thực ra chỉ ĐỨNG NHÌN.


BẤT ĐỒNG BỘ (non-blocking) — nhân viên bấm máy rồi quay ra tiếp khách tiếp

  Khách 1: gọi món ──► [máy pha chạy nền]───────────► giao
  Khách 2:   gọi món ──► [máy pha chạy nền]─────────► giao
  Khách 3:     gọi món ──► [máy pha chạy nền]───────► giao
             ▲
       nhân viên KHÔNG ĐỨNG NHÌN, quay ra nhận đơn tiếp

  3 khách ≈ 3 phút. Cùng một nhân viên, cùng một cái máy.
```

**Điểm mấu chốt: bất đồng bộ không làm công việc chạy nhanh hơn.** Máy pha vẫn mất 3 phút. Nó chỉ giúp bạn **không lãng phí thời gian đứng nhìn**.

Từ đó suy ra hệ quả quan trọng nhất của cả bài:

```text
BẤT ĐỒNG BỘ CHỈ CÓ ÍCH KHI BẠN ĐANG CHỜ THỨ GÌ ĐÓ.

  Chờ mạng, chờ đĩa, chờ database   → I/O-bound → async thắng lớn
  Nén một tấm ảnh, tính hash mật khẩu → CPU-bound → async KHÔNG giúp gì
```

Vì sao? Vì khi CPU đang bận tính toán, **không có "thời gian chờ" nào để tận dụng cả**. Chuyển sang async chỉ thêm độ phức tạp mà không được gì.

## Concurrency và Parallelism — hai từ hay bị dùng lẫn

Đây là câu hỏi vặn kinh điển:

```text
CONCURRENCY (đồng thời) — MỘT đầu bếp, BA món
   Ông xào món A, trong lúc chờ nồi sôi thì thái rau món B,
   trong lúc chờ lò nướng món C thì quay lại đảo món A.
   → Nhiều việc TIẾN TRIỂN xen kẽ. Chỉ cần 1 lõi CPU.

PARALLELISM (song song) — BA đầu bếp, BA món
   Ba người làm ba món cùng lúc thật.
   → Cần 3 lõi CPU vật lý.

   "Concurrency là cách CẤU TRÚC chương trình.
    Parallelism là cách CHẠY nó."  — Rob Pike
```

Async/await cho bạn **concurrency**. Muốn **parallelism** thì cần nhiều tiến trình hoặc nhiều lõi.

## Kiến trúc và cách hoạt động: hai mô hình máy chủ

### Mô hình 1: một luồng cho mỗi kết nối (thread-per-request)

Đây là cách PHP truyền thống, Java servlet cũ, Ruby, Python WSGI hoạt động.

```text
   Request 1 ──► [Luồng 1]  ──chờ DB 50ms──► trả lời
   Request 2 ──► [Luồng 2]  ──chờ DB 50ms──► trả lời
   Request 3 ──► [Luồng 3]  ──chờ DB 50ms──► trả lời
   ...
   Request N ──► [Luồng N]

   Mỗi luồng ~1 MB RAM (stack) + chi phí chuyển ngữ cảnh của hệ điều hành.
   10.000 kết nối đồng thời = 10 GB RAM chỉ để NGỒI CHỜ.

   Đây là "vấn đề C10K" — vì sao khó phục vụ 10.000 kết nối đồng thời.
```

**Chuyển ngữ cảnh** (*context switch*) là việc hệ điều hành cất trạng thái luồng này để chạy luồng kia. Mỗi lần tốn khoảng 1–5 micro giây. Với hàng nghìn luồng, thời gian chuyển ngữ cảnh bắt đầu áp đảo thời gian làm việc thật.

### Mô hình 2: vòng lặp sự kiện (event loop)

Đây là cách Node.js, Nginx, Redis, và Python asyncio hoạt động.

```text
        ┌──────────────────────────────────────┐
        │          HÀNG ĐỢI SỰ KIỆN            │
        │  [req1 xong DB][req5 có data][...]   │
        └───────────────┬──────────────────────┘
                        ▼
        ┌──────────────────────────────────────┐
        │        VÒNG LẶP SỰ KIỆN              │
        │        (MỘT luồng duy nhất)          │
        │                                      │
        │  while (true) {                      │
        │     lấy sự kiện đã sẵn sàng          │
        │     chạy hàm xử lý của nó            │
        │     nếu gặp I/O → GIAO cho HĐH,      │
        │                   quay lại vòng lặp  │
        │  }                                   │
        └───────────────┬──────────────────────┘
                        ▼
        ┌──────────────────────────────────────┐
        │   HỆ ĐIỀU HÀNH (epoll/kqueue/IOCP)   │
        │   theo dõi hàng nghìn socket cùng lúc│
        │   báo lại khi có cái nào sẵn sàng    │
        └──────────────────────────────────────┘

  MỘT luồng phục vụ được 10.000 kết nối, vì mỗi kết nối
  phần lớn thời gian chỉ đang CHỜ — và chờ thì không tốn CPU.
```

Đây là câu trả lời cho *"Node.js một luồng mà sao nhanh?"*: nó không nhanh hơn về mặt tính toán, nó chỉ **không lãng phí luồng vào việc đứng chờ**.

### Điểm chết của mô hình event loop

```javascript
// ❌ THẢM HOẠ trong Node.js — hàm CHẶN bên trong vòng lặp sự kiện
app.get('/hash', (req, res) => {
    const h = bcrypt.hashSync(req.body.password, 12);   // CPU chạy 300ms
    res.json({ h });
});
// Trong 300ms đó, vòng lặp ĐỨNG IM.
// TOÀN BỘ 10.000 kết nối khác bị treo — kể cả /health-check.
```

```javascript
// ✅ Dùng phiên bản bất đồng bộ (chạy trong thread pool của libuv)
app.get('/hash', async (req, res) => {
    const h = await bcrypt.hash(req.body.password, 12);
    res.json({ h });
});

// ✅ Hoặc đẩy hẳn việc nặng sang worker thread / tiến trình riêng
const { Worker } = require('worker_threads');
```

**Luật vàng của event loop: không bao giờ gọi hàm chặn bên trong vòng lặp sự kiện.**

Ba thủ phạm hay gặp ngoài `bcrypt.hashSync`:

```javascript
JSON.parse(chuoi10MB)          // parse đồng bộ, chặn
fs.readFileSync(...)            // đọc file đồng bộ
arr.sort()                      // mảng 10 triệu phần tử
/(a+)+b/.test(chuoiDai)         // regex bùng nổ (ReDoS)
```

## Bốn kiểu bất đồng bộ trong code

```javascript
// ① CALLBACK — kiểu cũ, dẫn tới "kim tự tháp tuyệt vọng"
layUser(id, (err, user) => {
    if (err) return xuLyLoi(err);
    layDonHang(user.id, (err, don) => {
        if (err) return xuLyLoi(err);
        layChiTiet(don.id, (err, ct) => {     // ← lồng mãi, xử lý lỗi lặp lại
            ...
        });
    });
});

// ② PROMISE — phẳng hơn
layUser(id)
  .then(user => layDonHang(user.id))
  .then(don  => layChiTiet(don.id))
  .catch(xuLyLoi);                             // một chỗ bắt lỗi

// ③ ASYNC/AWAIT — đọc như code đồng bộ, chạy như bất đồng bộ
try {
    const user = await layUser(id);
    const don  = await layDonHang(user.id);
    const ct   = await layChiTiet(don.id);
} catch (e) { xuLyLoi(e); }

// ④ SONG SONG khi các việc ĐỘC LẬP — điểm hay bị bỏ lỡ
// ❌ Tuần tự không cần thiết: 100 + 150 + 80 = 330ms
const user = await layUser(id);
const cauHinh = await layCauHinh();
const banner = await layBanner();

// ✅ Song song: max(100, 150, 80) = 150ms
const [user, cauHinh, banner] = await Promise.all([
    layUser(id), layCauHinh(), layBanner()
]);
```

### Tình huống thực tế và cách xử lý

> **Tình huống:** Trang chủ mất 2,4 giây để tải. Đo ra 8 lời gọi API, mỗi cái 300 ms, chạy nối đuôi nhau.

**Chẩn đoán:** đây là **waterfall** (thác nước) — chuỗi lời gọi tuần tự trong khi phần lớn chúng độc lập với nhau.

**Cách xử lý ba bước:**

```javascript
// Bước 1: vẽ ra cây phụ thuộc thật sự
//   layUser ──► layDonHang ──► layChiTiet    (phụ thuộc thật, phải tuần tự)
//   layCauHinh, layBanner, layThongBao       (độc lập hoàn toàn)

// Bước 2: gom nhóm độc lập chạy song song
const [user, cauHinh, banner, thongBao] = await Promise.all([
    layUser(id), layCauHinh(), layBanner(), layThongBao(id)
]);
const don = await layDonHang(user.id);       // buộc phải chờ user
const ct  = await layChiTiet(don.id);

// 2400ms → 900ms

// Bước 3: dùng allSettled nếu một phần được phép hỏng
const kq = await Promise.allSettled([layBanner(), layGoiY()]);
const banner = kq[0].status === 'fulfilled' ? kq[0].value : BANNER_MAC_DINH;
// → dịch vụ gợi ý chết thì trang vẫn hiện, chỉ thiếu phần gợi ý
```

Ba hàm cần phân biệt:

| Hàm | Hành vi | Dùng khi |
|---|---|---|
| `Promise.all` | Một cái hỏng → **hỏng cả cụm** | Mọi phần đều bắt buộc |
| `Promise.allSettled` | Chờ hết, trả về trạng thái từng cái | Một phần được phép hỏng |
| `Promise.race` | Trả về cái xong **đầu tiên** | Đua với timeout |
| `Promise.any` | Trả về cái **thành công** đầu tiên | Nhiều nguồn dự phòng |

```javascript
// Đua với timeout bằng Promise.race
const kq = await Promise.race([
    goiApiDoiTac(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
]);
```

## Đồng thời không kiểm soát — bẫy ngược lại

Sửa waterfall xong, rất nhiều người rơi vào bẫy đối diện:

```javascript
// ❌ 10.000 request bắn ra CÙNG LÚC
const kq = await Promise.all(ids.map(id => goiApi(id)));
// → cạn kết nối, đối tác trả 429 hàng loạt, hoặc chính bạn hết bộ nhớ
```

```javascript
// ✅ Giới hạn số việc chạy đồng thời
import pLimit from 'p-limit';
const gioiHan = pLimit(10);                    // tối đa 10 cùng lúc
const kq = await Promise.all(ids.map(id => gioiHan(() => goiApi(id))));
```

```python
# Python: Semaphore
sem = asyncio.Semaphore(10)

async def goi_co_gioi_han(id):
    async with sem:
        return await goi_api(id)

kq = await asyncio.gather(*[goi_co_gioi_han(i) for i in ids])
```

**Song song không phải con số bạn thích, mà là con số máy bạn chịu được** — và con số đối tác cho phép.

## So sánh các mô hình đồng thời

| Mô hình | Đại diện | Ưu | Nhược |
|---|---|---|---|
| **Thread-per-request** | PHP-FPM, Java servlet, Rails | Dễ hiểu, dễ debug, stack trace rõ | Tốn RAM, không lên nổi C10K |
| **Event loop** | Node.js, Nginx, Redis | Rất nhiều kết nối trên ít RAM | **Một hàm chặn treo cả tiến trình** |
| **Async/await + coroutine** | Python asyncio, FastAPI, C# | Code đọc như đồng bộ | Phải dùng thư viện async toàn tuyến |
| **Green threads / goroutine** | Go, Erlang/Elixir | Nhẹ như event loop, viết như đồng bộ | Runtime phức tạp hơn |
| **Virtual threads** | Java 21+ (Project Loom) | Code cũ chạy được, không tốn RAM | Rất mới, thư viện chưa theo kịp |

**Goroutine của Go** đáng nói riêng vì nó là mô hình được đánh giá cao nhất hiện nay: bạn viết code trông y hệt đồng bộ, nhưng runtime tự ánh xạ hàng trăm nghìn goroutine (mỗi cái chỉ ~2 KB stack) lên một số ít luồng hệ điều hành. Bạn được sự đơn giản của thread-per-request và hiệu năng của event loop.

### Tình huống thực tế và cách xử lý

> **Tình huống:** Dự án FastAPI (Python async). Một endpoint gọi thư viện `requests` để gọi API đối tác. Khi tải cao, mọi endpoint đều chậm, kể cả những cái không liên quan.

**Nguyên nhân:** `requests` là thư viện **đồng bộ**. Gọi nó bên trong hàm `async def` sẽ **chặn cả event loop** — y hệt lỗi `bcrypt.hashSync` ở trên.

```python
# ❌ Thư viện đồng bộ trong hàm async → chặn event loop
@app.get("/gia")
async def lay_gia():
    r = requests.get("https://api-doitac.com/gia", timeout=5)   # CHẶN
    return r.json()
```

**Ba cách xử lý, chọn theo hoàn cảnh:**

```python
# ✅ Cách 1 (tốt nhất): dùng thư viện BẤT ĐỒNG BỘ tương ứng
import httpx
@app.get("/gia")
async def lay_gia():
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get("https://api-doitac.com/gia")
    return r.json()

# ✅ Cách 2: đẩy hàm chặn ra thread pool
from fastapi.concurrency import run_in_threadpool
@app.get("/gia")
async def lay_gia():
    r = await run_in_threadpool(lambda: requests.get(URL, timeout=5))
    return r.json()

# ✅ Cách 3: bỏ async đi — FastAPI TỰ chạy hàm def thường trong thread pool
@app.get("/gia")
def lay_gia():                                  # không có async
    return requests.get(URL, timeout=5).json()
```

**Bài học chung: async là thuộc tính của cả tuyến, không phải của một hàm.** Chỉ cần một mắt xích đồng bộ là toàn bộ lợi ích biến mất — và tệ hơn, nó làm cả hệ thống chậm đi.

Bảng thư viện cần đổi khi làm async trong Python:

| Đồng bộ | Bất đồng bộ |
|---|---|
| `requests` | `httpx`, `aiohttp` |
| `psycopg2` | `asyncpg`, `psycopg` (v3 async) |
| `redis` | `redis.asyncio` |
| `time.sleep` | `asyncio.sleep` |
| `open()` | `aiofiles` |

## Khi nào KHÔNG cần bất đồng bộ

Để công bằng — async không phải lúc nào cũng đúng:

- **Script nhỏ, công cụ dòng lệnh, cron job** → cứ đồng bộ. Đơn giản là một tính năng.
- **Công việc nặng CPU** → async không giúp gì; cần **nhiều tiến trình** hoặc **worker thread**.
- **Ít người dùng đồng thời** → thread-per-request đủ tốt và dễ debug hơn nhiều.
- **Team chưa quen** → code async sai cách còn tệ hơn code đồng bộ đúng cách. Stack trace của async khó đọc, và bug "quên `await`" rất khó thấy.

```javascript
// Bug kinh điển: quên await — hàm trả về Promise chứ không phải giá trị
const user = layUser(id);          // ❌ user là Promise
if (user.isAdmin) { ... }          // luôn undefined → luôn false → lỗi âm thầm
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gọi hàm chặn trong event loop | Treo toàn bộ tiến trình | Dùng bản async, hoặc worker thread |
| Dùng `requests` trong hàm `async def` | Chặn event loop, mọi endpoint chậm | `httpx` / `run_in_threadpool` |
| `await` tuần tự cho việc độc lập | Waterfall, chậm gấp nhiều lần | `Promise.all` / `asyncio.gather` |
| `Promise.all` cho 10.000 việc | Cạn kết nối, 429, hết RAM | `p-limit` / `Semaphore` |
| `Promise.all` khi một phần được phép hỏng | Một lỗi làm hỏng cả trang | `Promise.allSettled` |
| Quên `await` | Nhận Promise thay vì giá trị, lỗi âm thầm | Bật lint `no-floating-promises` |
| Không có timeout cho việc async | Chờ vô tận | `Promise.race` với timeout |
| Dùng async cho việc nặng CPU | Không nhanh hơn, chỉ phức tạp hơn | Worker thread / nhiều tiến trình |
| Ngoại lệ trong async không bắt | `unhandledRejection`, tiến trình chết | `try/catch` quanh mọi `await` |
| `JSON.parse` chuỗi rất lớn | Chặn event loop | Parse theo luồng (streaming) |

## Câu hỏi phỏng vấn hay gặp

**H: Đồng bộ và bất đồng bộ khác gì nhau?**
Đồng bộ là làm xong việc này mới làm việc kia — luồng **đứng im chờ**. Bất đồng bộ là giao việc rồi đi làm việc khác, xong thì quay lại. Điểm quan trọng: **bất đồng bộ không làm công việc chạy nhanh hơn**, nó chỉ giúp không lãng phí thời gian đứng chờ. Vì thế nó chỉ có ích với việc **nặng chờ đợi** (gọi mạng, đọc đĩa, truy vấn database) chứ không giúp gì cho việc **nặng tính toán** — vì lúc CPU đang bận thì không có thời gian chờ nào để tận dụng.

**H: Node.js một luồng mà sao phục vụ được nhiều người?**
Vì phần lớn thời gian của một request là **chờ**, mà chờ thì không tốn CPU. Mô hình một-luồng-một-kết-nối tốn ~1 MB RAM cho mỗi kết nối chỉ để ngồi chờ, nên 10.000 kết nối là 10 GB. Node dùng **vòng lặp sự kiện**: khi gặp I/O nó giao cho hệ điều hành theo dõi qua `epoll` rồi quay lại phục vụ request khác, và chỉ xử lý khi có kết quả. Cái giá là **một hàm chặn sẽ treo toàn bộ tiến trình** — `bcrypt.hashSync` chạy 300 ms là 10.000 kết nối khác đứng im trong 300 ms đó.

**H: Concurrency và parallelism khác gì?**
Concurrency là **một** đầu bếp làm **ba** món xen kẽ — nhiều việc cùng tiến triển, chỉ cần một lõi. Parallelism là **ba** đầu bếp làm ba món cùng lúc thật — cần ba lõi. Async/await cho bạn concurrency; muốn parallelism thì cần nhiều tiến trình hoặc worker thread.

**H: Trang chủ có 8 lời gọi API tuần tự, sửa thế nào?**
Vẽ cây phụ thuộc thật để tách nhóm độc lập, rồi cho nhóm độc lập chạy song song bằng `Promise.all` — 8 lời gọi 300 ms tuần tự là 2,4 giây, song song còn 300 ms. Nhưng phải cẩn thận hai điều: **giới hạn số việc đồng thời** bằng `p-limit` hoặc `Semaphore` để không cạn kết nối, và dùng **`Promise.allSettled`** cho phần được phép hỏng để một dịch vụ chết không làm trắng cả trang.

**H: Dùng `requests` trong FastAPI async có sao không?**
Có, và đây là lỗi rất phổ biến. `requests` là thư viện đồng bộ, gọi nó trong `async def` sẽ chặn event loop, khiến **mọi** endpoint chậm theo — kể cả cái không liên quan. Ba cách chữa: đổi sang `httpx` bất đồng bộ (tốt nhất), bọc trong `run_in_threadpool`, hoặc đơn giản là bỏ `async` đi vì FastAPI tự chạy hàm `def` thường trong thread pool. Bài học chung: **async là thuộc tính của cả tuyến** — một mắt xích đồng bộ là mất hết lợi ích.

## Tóm tắt bài 3

- Bất đồng bộ **không làm việc chạy nhanh hơn** — nó chỉ giúp không lãng phí thời gian đứng chờ.
- Chỉ có ích với **I/O-bound** (chờ mạng, đĩa, database); **CPU-bound** thì cần nhiều tiến trình / worker thread.
- **Concurrency** = một người nhiều việc xen kẽ (một lõi đủ); **parallelism** = nhiều người nhiều việc cùng lúc (cần nhiều lõi).
- Mô hình **thread-per-request** dễ debug nhưng tốn ~1 MB/kết nối; **event loop** phục vụ vạn kết nối trên ít RAM nhưng **một hàm chặn treo cả tiến trình**.
- Sửa **waterfall** bằng `Promise.all`/`gather`, nhưng nhớ **giới hạn số việc đồng thời** — bẫy ngược lại cũng chết người.
- `all` (một hỏng là hỏng cả) vs `allSettled` (được phép hỏng một phần) vs `race` (đua timeout) vs `any` (nhiều nguồn dự phòng).
- **Async là thuộc tính của cả tuyến** — một thư viện đồng bộ lọt vào là mất sạch lợi ích và làm cả hệ thống chậm đi.

**Bài kế tiếp** → [Bài 4: REST, GraphQL và gRPC — chọn kiểu giao tiếp nào](04-rest-graphql-grpc-chon-kieu-nao.md)
