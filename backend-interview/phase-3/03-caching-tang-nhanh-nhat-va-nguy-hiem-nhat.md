# Bài 3: Caching — tầng nhanh nhất và nguy hiểm nhất

Trang chủ của bạn gọi database 4.000 lần mỗi giây để lấy đúng **một danh sách sản phẩm không đổi cả ngày**.

Bạn thêm cache. Độ trễ từ 180 ms xuống 3 ms. Tải database giảm 95%. Sếp khen.

Ba tuần sau, 2 giờ sáng, cache Redis khởi động lại. Trong 8 giây tiếp theo, **40.000 request cùng lúc phát hiện cache trống và cùng lao vào database**. Database sập. Và khi nó vừa hồi phục, 40.000 request đang chờ lại lao vào lần nữa.

Cache là tầng cho bạn hiệu năng lớn nhất với công sức nhỏ nhất. Nó cũng là tầng sinh ra loại bug khó chịu nhất: **dữ liệu cũ mà không ai biết**, và **sập dây chuyền khi cache biến mất**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Cache** | **Bộ nhớ đệm** — lưu tạm kết quả để lần sau khỏi tính lại |
| **Cache hit / miss** | **Trúng / trượt** — tìm thấy hay không tìm thấy trong cache |
| **Hit ratio** | **Tỉ lệ trúng** — phần trăm request được phục vụ từ cache |
| **TTL** (*Time To Live*) | **Thời gian sống** — sau bấy nhiêu giây thì tự hết hạn |
| **Eviction** | **Trục xuất** — bỏ bớt mục khi cache đầy |
| **Invalidation** | **Vô hiệu hoá** — xoá mục khi dữ liệu gốc đổi |
| **Stale data** | **Dữ liệu cũ** — cache còn giữ giá trị đã lỗi thời |
| **Thundering herd** | **Bầy đàn** — nhiều request cùng lao vào khi cache trượt |
| **Cache stampede** | **Giẫm đạp** — như trên, thường dùng thay thế nhau |
| **Hot key** | **Khoá nóng** — một khoá bị truy cập áp đảo |
| **Warm up** | **Làm nóng** — nạp sẵn cache trước khi mở cửa |

## Kiến trúc và cách hoạt động: cache có ở khắp mọi tầng

Đây là điều nhiều người không nhận ra — cache không phải một chỗ, nó là **cả một chuỗi**.

```text
   Người dùng
       │
   ┌───▼─────────────────────┐
   │ ① CACHE TRÌNH DUYỆT     │  Cache-Control, ETag      ~0 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ② CDN (biên)            │  Cloudflare, CloudFront   ~10 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ③ REVERSE PROXY         │  Nginx, gateway           ~1 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ④ CACHE ỨNG DỤNG        │  trong bộ nhớ tiến trình  ~0.01 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ⑤ CACHE PHÂN TÁN        │  Redis, Memcached         ~0.5 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ⑥ CACHE CỦA DATABASE    │  buffer pool, query cache ~0.1 ms
   └───┬─────────────────────┘
   ┌───▼─────────────────────┐
   │ ⑦ ĐĨA                   │                           ~5 ms
   └─────────────────────────┘

   Nguyên tắc: CACHE CÀNG GẦN NGƯỜI DÙNG CÀNG RẺ,
               nhưng CÀNG KHÓ VÔ HIỆU HOÁ.
```

Câu cuối là mấu chốt. Xoá cache Redis mất 1 mili giây. Xoá cache trong trình duyệt của 2 triệu người dùng thì... bạn không xoá được. Bạn chỉ có thể **chờ nó hết hạn**.

### So sánh hai loại cache ứng dụng

```text
CACHE TRONG BỘ NHỚ TIẾN TRÌNH (local)
   ✓ Nhanh nhất (~10 micro giây), không qua mạng
   ✗ Mỗi máy một bản → KHÔNG NHẤT QUÁN giữa các máy
   ✗ Restart là mất
   → Dùng cho: cấu hình ít đổi, bảng tra cứu nhỏ, kết quả tính toán nặng

CACHE PHÂN TÁN (Redis / Memcached)
   ✓ Mọi máy thấy cùng một giá trị
   ✓ Sống sót qua restart ứng dụng
   ✗ Qua mạng (~0,5 ms), và là một điểm phụ thuộc nữa
   → Dùng cho: hầu hết trường hợp

   MẪU HAI TẦNG (rất hiệu quả):
      local (TTL 5 giây) → Redis (TTL 5 phút) → database
      → Khoá nóng được phục vụ từ bộ nhớ tiến trình, Redis đỡ tải
      → Đổi lại: dữ liệu có thể cũ tối đa 5 giây trên một số máy
```

## Bốn chiến lược cache

### ① Cache-Aside — ứng dụng tự quản lý (phổ biến nhất)

```python
def lay_san_pham(pid: int):
    khoa = f"sp:{pid}"
    du_lieu = cache.get(khoa)
    if du_lieu is not None:
        return json.loads(du_lieu)          # HIT

    du_lieu = db.query("SELECT * FROM products WHERE id=%s", pid)   # MISS
    cache.setex(khoa, 300, json.dumps(du_lieu))
    return du_lieu
```

```text
✓ Đơn giản, ứng dụng kiểm soát hoàn toàn
✓ Cache chết thì hệ thống vẫn chạy (chỉ chậm đi)
✗ Lần đầu luôn trượt
✗ Có cửa sổ dữ liệu cũ giữa lúc DB đổi và lúc cache hết hạn
```

### ② Write-Through — ghi vào cache và DB cùng lúc

```python
def cap_nhat_san_pham(pid, du_lieu):
    db.update(pid, du_lieu)
    cache.setex(f"sp:{pid}", 300, json.dumps(du_lieu))   # ghi luôn vào cache
```

```text
✓ Cache luôn tươi
✗ Mỗi lần ghi tốn thêm một thao tác
✗ Cache đầy những thứ không ai đọc
```

### ③ Write-Behind — ghi vào cache trước, DB sau

```text
✓ Ghi cực nhanh, gộp được nhiều lần ghi thành một
✗ RỦI RO MẤT DỮ LIỆU nếu cache chết trước khi kịp ghi xuống DB
→ Chỉ dùng cho dữ liệu chấp nhận mất: bộ đếm lượt xem, log hành vi
```

### ④ Refresh-Ahead — làm mới trước khi hết hạn

```text
✓ Người dùng gần như không bao giờ gặp cache trượt
✗ Tốn tài nguyên làm mới cả thứ không ai hỏi tới
→ Dùng cho khoá nóng đã biết trước (trang chủ, danh mục)
```

| | Cache-Aside | Write-Through | Write-Behind | Refresh-Ahead |
|---|---|---|---|---|
| Độ tươi | Trung bình | **Cao** | Cao | Cao |
| Tốc độ ghi | Nhanh | Chậm hơn | **Nhanh nhất** | Nhanh |
| Rủi ro mất dữ liệu | Không | Không | **Có** | Không |
| Độ phức tạp | **Thấp** | Thấp | Cao | Trung bình |
| Dùng khi | Mặc định | Đọc ngay sau ghi | Bộ đếm, log | Khoá nóng |

## Vấn đề khó nhất: vô hiệu hoá cache

> *"Trong khoa học máy tính chỉ có hai việc khó: vô hiệu hoá cache và đặt tên biến."* — Phil Karlton

### Xoá hay cập nhật? — thứ tự quyết định tính đúng đắn

```python
# ❌ SAI: cập nhật cache trước, DB sau
cache.set(khoa, gia_tri_moi)
db.update(...)                    # nếu bước này lỗi → cache SAI vĩnh viễn

# ❌ VẪN CÓ RACE: ghi DB rồi ghi cache
db.update(...)
cache.set(khoa, gia_tri_moi)
#   T1: db.update(A=1)
#   T2: db.update(A=2)
#   T2: cache.set(A=2)
#   T1: cache.set(A=1)   ← cache giữ giá trị CŨ, mãi mãi

# ✅ ĐÚNG: ghi DB rồi XOÁ cache (cache-aside invalidation)
db.update(...)
cache.delete(khoa)                # lần đọc sau sẽ nạp lại giá trị mới nhất
```

**Vì sao xoá an toàn hơn cập nhật?** Vì xoá là thao tác **bất biến khi lặp** — xoá hai lần cũng như xoá một lần. Còn cập nhật thì thứ tự quyết định giá trị cuối, và bạn không kiểm soát được thứ tự trong hệ thống đồng thời.

Vẫn còn một race hiếm nhưng có thật:

```text
   T1 (đọc):  cache miss → đọc DB được giá trị CŨ (v1)
   T2 (ghi):  ghi DB (v2) → xoá cache
   T1 (đọc):  ghi v1 vào cache        ← cache giữ giá trị CŨ

   Ba cách giảm nhẹ:
   ① Luôn đặt TTL — dù có bug, dữ liệu cũ cũng tự hết hạn
   ② Xoá cache HAI LẦN: ngay sau khi ghi, và lại sau ~500 ms (delayed double delete)
   ③ Dùng CDC: đọc WAL của database rồi xoá cache — chính xác nhất
```

### Ba cách vô hiệu hoá

```text
① THEO TTL — đơn giản nhất, và thường là đủ
      cache.setex(khoa, 300, giá_trị)
      ✓ Không phải làm gì cả
      ✗ Chấp nhận dữ liệu cũ tối đa 300 giây
      → LUÔN ĐẶT TTL, kể cả khi có cơ chế xoá chủ động.

② XOÁ CHỦ ĐỘNG khi dữ liệu đổi
      ✓ Tươi ngay
      ✗ Phải nhớ xoá ở MỌI chỗ có thể sửa dữ liệu
         → và chỗ bị quên sẽ là chỗ gây bug

③ THEO PHIÊN BẢN / THẺ (versioned key) — mẹo rất hay
      Thay vì đi tìm và xoá hàng nghìn khoá liên quan,
      ĐỔI KHOÁ luôn:

         ver = cache.get("sp:ver") or 1
         khoa = f"sp:v{ver}:{pid}"

      Muốn vô hiệu hoá TẤT CẢ: cache.incr("sp:ver")
      → Mọi khoá cũ trở thành mồ côi và tự bị trục xuất theo LRU.
      → Một thao tác, xoá sạch cả họ.
```

Cách ③ đặc biệt hữu ích khi bạn cache theo nhiều chiều (`sp:42:vi`, `sp:42:en`, `sp:42:mobile`) và không muốn liệt kê hết chúng.

## Ba sự cố kinh điển của cache

### ① Cache stampede — bầy đàn giẫm đạp

Đây là sự cố 2 giờ sáng ở đầu bài.

```text
   Một khoá nóng hết hạn lúc 02:00:00.
   Trong 50 ms tiếp theo, 40.000 request cùng thấy cache trượt.
   → 40.000 truy vấn giống hệt nhau lao vào database cùng lúc.
   → Database sập.
   → Cache vẫn trống → khi DB hồi phục, lại lao vào lần nữa.
```

**Ba lớp chữa:**

```python
# ✅ ① KHOÁ — chỉ MỘT request được nạp lại, số còn lại chờ hoặc dùng giá trị cũ
def lay_co_khoa(khoa, nap_lai, ttl=300):
    v = cache.get(khoa)
    if v is not None:
        return json.loads(v)

    khoa_lock = f"lock:{khoa}"
    if cache.set(khoa_lock, "1", nx=True, ex=10):     # chỉ 1 người lấy được
        try:
            v = nap_lai()
            cache.setex(khoa, ttl, json.dumps(v))
            return v
        finally:
            cache.delete(khoa_lock)
    else:
        time.sleep(0.05)                              # người khác đang nạp
        v = cache.get(khoa)
        return json.loads(v) if v else nap_lai()      # dự phòng
```

```python
# ✅ ② TTL CÓ NHIỄU — đừng để mọi khoá hết hạn cùng lúc
import random
ttl = 300 + random.randint(-30, 30)      # ±10%
cache.setex(khoa, ttl, gia_tri)
```

```python
# ✅ ③ LÀM MỚI SỚM (probabilistic early expiration) — mượt nhất
def lay_lam_moi_som(khoa, nap_lai, ttl=300, beta=1.0):
    goi = cache.get(khoa)
    if goi:
        d = json.loads(goi)
        con_lai = d["het_han"] - time.time()
        # càng gần hết hạn, xác suất tự làm mới càng cao
        if con_lai > 0 and random.random() > math.exp(-beta * (ttl - con_lai) / ttl):
            return d["gia_tri"]
    v = nap_lai()
    cache.setex(khoa, ttl + 60,
                json.dumps({"gia_tri": v, "het_han": time.time() + ttl}))
    return v
```

### ② Cache penetration — xuyên thủng

```text
   Kẻ tấn công hỏi liên tục những ID KHÔNG TỒN TẠI:
      /san-pham/-1, /san-pham/-2, /san-pham/-3 ...

   → Cache luôn trượt (vì không có gì để cache)
   → MỌI request đều lao xuống database
   → Cache trở nên vô dụng
```

```python
# ✅ ① CACHE CẢ KẾT QUẢ RỖNG, với TTL ngắn
v = db.query(...)
if v is None:
    cache.setex(khoa, 60, "NULL")      # TTL ngắn để không giữ lâu
    return None

# ✅ ② Bloom filter — chặn trước khi chạm cache
if not bloom.might_contain(pid):
    return None                         # chắc chắn KHÔNG tồn tại
```

**Bloom filter** là cấu trúc dữ liệu xác suất: nó trả lời *"chắc chắn không có"* hoặc *"có thể có"* — không bao giờ báo sai kiểu "không có" cho thứ thật sự có. Với vài MB bộ nhớ nó lọc được hàng chục triệu ID.

### ③ Cache avalanche — tuyết lở

```text
   Redis khởi động lại, hoặc HÀNG LOẠT khoá hết hạn cùng lúc
   (vì bạn nạp chúng cùng lúc với cùng TTL).
   → Toàn bộ tải dồn xuống database cùng một khoảnh khắc.
```

```text
   ✅ Cách chữa:
   ① TTL có nhiễu (như trên) — chống hết hạn đồng loạt
   ② Redis chạy cụm có bản sao (Sentinel / Cluster), có lưu bền
   ③ LÀM NÓNG cache trước khi mở cửa cho lưu lượng
   ④ CẦU DAO ở tầng truy cập database — thà trả dữ liệu suy giảm
      còn hơn để database sập
   ⑤ Giữ một bản cache CŨ (stale) để phục vụ khi nguồn chết:
```

```python
# Mẫu "stale-while-revalidate" — phục vụ dữ liệu cũ khi nguồn hỏng
def lay_ben_bi(khoa, nap_lai, ttl=300, ttl_cu=3600):
    v = cache.get(khoa)
    if v:
        return json.loads(v)
    cu = cache.get(f"stale:{khoa}")          # bản sao cũ, TTL dài hơn nhiều
    try:
        moi = nap_lai()
        cache.setex(khoa, ttl, json.dumps(moi))
        cache.setex(f"stale:{khoa}", ttl_cu, json.dumps(moi))
        return moi
    except Exception:
        if cu:
            return json.loads(cu)            # ◄── suy giảm êm
        raise
```

## Cache HTTP — tầng rẻ nhất mà nhiều người bỏ qua

```http
# Tài nguyên tĩnh có vân tay trong tên file (app.a3f9c1.js)
Cache-Control: public, max-age=31536000, immutable
# → cache 1 năm, không bao giờ hỏi lại. Đổi nội dung thì đổi tên file.

# Dữ liệu động, có thể cache ngắn
Cache-Control: private, max-age=60, stale-while-revalidate=300
# → dùng bản cũ trong 300s tiếp theo trong lúc âm thầm làm mới

# Không bao giờ cache
Cache-Control: no-store
# → dùng cho trang tài khoản, kết quả thanh toán
```

**ETag — xác thực lại mà không tải lại:**

```text
   Lần 1:  GET /api/products
           ← 200 OK
             ETag: "a3f9c1"
             [50 KB dữ liệu]

   Lần 2:  GET /api/products
           If-None-Match: "a3f9c1"
           ← 304 Not Modified        ◄── KHÔNG có body!
             [0 byte]

   → Vẫn tốn một vòng mạng, nhưng tiết kiệm 50 KB băng thông.
```

```text
   ⚠️ BA BẪY CỦA CACHE HTTP:

   ① `private` vs `public`
      Quên `private` cho dữ liệu cá nhân → CDN cache lại
      → NGƯỜI KHÁC NHẬN ĐƯỢC DỮ LIỆU CỦA BẠN. Sự cố nghiêm trọng có thật.

   ② Header `Vary`
      Nếu response khác nhau theo `Accept-Language` hay `Authorization`
      mà không khai `Vary`, CDN sẽ trả nhầm bản cho người khác.
         Vary: Accept-Language, Accept-Encoding

   ③ Cache poisoning
      Kẻ tấn công gửi header lạ làm CDN cache một response độc hại
      rồi phục vụ nó cho mọi người.
      → Chuẩn hoá khoá cache, bỏ qua header không cần thiết.
```

## Chính sách trục xuất và đo lường

```text
   Khi Redis đầy, nó bỏ mục nào?

   allkeys-lru      bỏ mục ÍT ĐƯỢC DÙNG GẦN ĐÂY nhất   ← mặc định tốt cho cache
   allkeys-lfu      bỏ mục ÍT ĐƯỢC DÙNG THƯỜNG XUYÊN   ← tốt khi có khoá nóng rõ rệt
   volatile-lru     chỉ bỏ mục CÓ TTL
   noeviction       KHÔNG bỏ, trả LỖI khi ghi           ← mặc định của Redis!
```

> **Cảnh báo:** mặc định của Redis là `noeviction` — khi đầy, mọi lệnh ghi **báo lỗi** thay vì dọn chỗ. Nếu dùng Redis làm cache, phải đổi sang `allkeys-lru`.

```bash
redis-cli CONFIG SET maxmemory 4gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Ba chỉ số phải treo lên dashboard:**

```text
① TỈ LỆ TRÚNG (hit ratio) = hits / (hits + misses)
   < 80%  → cache đang không hiệu quả, xem lại TTL và khoá
   > 99%  → có thể đang cache quá nhiều thứ không cần

② ĐỘ TRỄ p99 CỦA CHÍNH CACHE
   Redis chậm còn tệ hơn không có cache (thêm một chặng mà không được gì)

③ TỈ LỆ TRỤC XUẤT (eviction rate)
   Tăng đột ngột = cache quá nhỏ, hoặc có ai đó đang ghi rác vào
```

```bash
redis-cli INFO stats | grep -E 'keyspace_hits|keyspace_misses|evicted_keys'
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Người dùng sửa hồ sơ, bấm lưu, màn hình hiện thông báo thành công. Nhưng tải lại trang thì vẫn thấy thông tin cũ.

**Đây là read-after-write trên tầng cache.** Ba nguyên nhân có thể:

```text
① Quên xoá cache sau khi ghi        → thêm cache.delete(khoa)
② Xoá cache nhưng CDN vẫn giữ bản cũ → dữ liệu cá nhân phải Cache-Control: private
③ Cache local ở máy khác chưa biết  → mẫu hai tầng có TTL local ngắn (5s),
                                       hoặc dùng pub/sub để báo mọi máy xoá
```

```python
# Báo mọi máy xoá cache local — dùng Redis pub/sub
r.publish("cache:invalidate", json.dumps({"khoa": f"user:{uid}"}))

# Ở mỗi máy: nghe và xoá cache trong bộ nhớ tiến trình
def nghe():
    for msg in r.pubsub().listen():
        local_cache.pop(json.loads(msg["data"])["khoa"], None)
```

**Cách đơn giản và chắc chắn nhất:** ngay sau khi ghi, **đọc thẳng từ nguồn** cho request đó, đừng qua cache — giống mẫu `RETURNING` ở tầng database.

> **Tình huống 2:** Một sản phẩm viral. Khoá `sp:42` nhận 80.000 request/giây và một node Redis bị nghẽn.

**Đây là hot key.** Chia tải không giúp gì vì mọi request đều hỏi **cùng một khoá**.

```python
# ✅ ① Cache hai tầng — chặn ở tầng local trước khi tới Redis
def lay_hai_tang(pid):
    khoa = f"sp:{pid}"
    v = local_cache.get(khoa)              # TTL 5 giây, trong bộ nhớ tiến trình
    if v: return v
    v = redis.get(khoa)                    # chỉ ~1/1000 request tới đây
    if v: local_cache.set(khoa, v, ttl=5)
    return v

# ✅ ② Nhân bản khoá nóng ra nhiều bản để rải qua nhiều node
i = random.randint(0, 9)
v = redis.get(f"sp:42:copy{i}")            # 10 bản trên 10 slot khác nhau
```

Cách ① là cách nên làm trước: nó giảm tải Redis hàng nghìn lần, và cái giá chỉ là dữ liệu có thể cũ tối đa 5 giây trên một số máy — hoàn toàn chấp nhận được với danh sách sản phẩm.

> **Tình huống 3:** Sếp hỏi "cache thứ gì cho hiệu quả nhất?"

```text
   CÔNG THỨC ƯU TIÊN:

      Giá trị = (tần suất đọc) × (chi phí tính lại) ÷ (tần suất thay đổi)

   ✅ CACHE MẠNH:
      • Danh mục, cấu hình, bảng tra cứu     (đọc nhiều, đổi hiếm)
      • Kết quả tổng hợp/báo cáo nặng        (chi phí tính rất cao)
      • Trang chủ, trang danh sách           (tần suất đọc khổng lồ)
      • Kết quả xác thực token               (đọc mỗi request)

   ❌ ĐỪNG CACHE:
      • Số dư tài khoản, tồn kho khi đặt hàng (sai một ly là mất tiền)
      • Dữ liệu đọc một lần rồi thôi          (không ai hỏi lại)
      • Thứ đổi mỗi giây                      (cache trượt liên tục)
      • Dữ liệu cá nhân ở tầng CDN            (rò rỉ chéo người dùng)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không đặt TTL | Dữ liệu cũ tồn tại vĩnh viễn | **Luôn** có TTL, kể cả khi xoá chủ động |
| Cập nhật cache thay vì xoá | Race condition → cache giữ giá trị cũ mãi | Ghi DB rồi **xoá** cache |
| Mọi khoá cùng TTL | **Cache avalanche** | TTL có nhiễu ±10% |
| Không chống stampede | 40.000 request lao vào DB cùng lúc | Khoá + làm mới sớm |
| Không cache kết quả rỗng | **Cache penetration** | Cache `NULL` với TTL ngắn + Bloom filter |
| Redis `noeviction` (mặc định) | Đầy là **lỗi ghi**, không dọn chỗ | `allkeys-lru` |
| Quên `Cache-Control: private` | **CDN phục vụ dữ liệu cá nhân cho người khác** | `private` cho mọi thứ có `Authorization` |
| Quên header `Vary` | CDN trả nhầm ngôn ngữ/bản cho người khác | `Vary: Accept-Language` |
| Cache trong bộ nhớ nhiều máy | Mỗi máy một giá trị khác nhau | Redis, hoặc TTL local rất ngắn |
| Cache dữ liệu tiền/tồn kho | Bán quá hàng, số dư sai | Đừng cache thứ sai một ly là mất tiền |
| Hệ thống chết khi cache chết | Cache thành phụ thuộc bắt buộc | Cache-aside + stale fallback |
| Không đo tỉ lệ trúng | Cache vô dụng mà không ai biết | Dashboard hit ratio, p99, eviction |
| Cache khoá không có tiền tố phiên bản | Đổi cấu trúc dữ liệu → lỗi giải mã | `app:v2:sp:42` |

## Câu hỏi phỏng vấn hay gặp

**H: Cache-aside hoạt động thế nào và vì sao nó phổ biến nhất?**
Ứng dụng tự hỏi cache trước; trượt thì đọc database rồi ghi vào cache. Nó phổ biến vì đơn giản, ứng dụng kiểm soát hoàn toàn, và quan trọng nhất là **cache chết thì hệ thống vẫn chạy** — chỉ chậm đi chứ không sai. Cái giá là lần đầu luôn trượt và có cửa sổ dữ liệu cũ.

**H: Sau khi cập nhật database thì nên xoá cache hay cập nhật cache?**
**Xoá.** Vì xoá là thao tác **bất biến khi lặp** — xoá hai lần cũng như một lần. Còn cập nhật thì thứ tự quyết định giá trị cuối: hai luồng cùng ghi, luồng ghi DB sau lại ghi cache trước, và cache giữ giá trị cũ mãi mãi. Vẫn còn một race hiếm khi luồng đọc ghi giá trị cũ vào cache sau khi luồng ghi đã xoá — giảm nhẹ bằng TTL bắt buộc, xoá hai lần có độ trễ, hoặc dùng CDC đọc WAL của database.

**H: Cache stampede là gì và chặn thế nào?**
Là khi một khoá nóng hết hạn và hàng chục nghìn request cùng thấy cache trượt, cùng lao vào database — database sập, và khi hồi phục thì lại bị lao vào lần nữa. Ba lớp chữa: **khoá** để chỉ một request được nạp lại còn số kia chờ hoặc dùng giá trị cũ; **TTL có nhiễu** để các khoá không hết hạn đồng loạt; và **làm mới sớm theo xác suất** — càng gần hết hạn thì xác suất một request tự đi làm mới càng cao, nên cache gần như không bao giờ thật sự trống.

**H: Cache HTTP có bẫy gì nguy hiểm?**
Nguy hiểm nhất là **quên `Cache-Control: private`** cho dữ liệu cá nhân — CDN sẽ cache lại và **phục vụ dữ liệu của người này cho người khác**. Đây là sự cố có thật ở nhiều công ty lớn. Bẫy thứ hai là quên header **`Vary`**: nếu response khác nhau theo `Accept-Language` mà không khai, CDN trả nhầm bản. Nguyên tắc: mọi response có liên quan tới `Authorization` đều phải `private` hoặc `no-store`.

**H: Một khoá nóng nhận 80.000 request/giây làm nghẽn Redis, xử lý sao?**
Chia tải không giúp vì mọi request hỏi **cùng một khoá**. Cách nên làm trước là **cache hai tầng**: thêm một tầng cache trong bộ nhớ tiến trình với TTL rất ngắn (5 giây) — chỉ khoảng một phần nghìn request đi tới Redis. Cái giá là dữ liệu có thể cũ tối đa 5 giây trên một số máy, hoàn toàn chấp nhận được với danh sách sản phẩm. Cách thứ hai là nhân bản khoá nóng thành nhiều bản để rải qua nhiều node.

**H: Cache thứ gì cho hiệu quả?**
Công thức: **(tần suất đọc × chi phí tính lại) ÷ (tần suất thay đổi)**. Cache mạnh cho danh mục, cấu hình, kết quả tổng hợp nặng, và kết quả xác thực token. **Đừng cache** số dư tài khoản hay tồn kho lúc đặt hàng — sai một ly là mất tiền; đừng cache dữ liệu đọc một lần rồi thôi; và tuyệt đối đừng cache dữ liệu cá nhân ở tầng CDN.

## Tóm tắt bài 3

- Cache là **cả một chuỗi tầng** từ trình duyệt tới đĩa — càng gần người dùng càng rẻ nhưng **càng khó vô hiệu hoá**.
- Bốn chiến lược: **cache-aside** (mặc định), write-through, write-behind (có rủi ro mất dữ liệu), refresh-ahead.
- Sau khi ghi DB thì **xoá** cache chứ đừng cập nhật — vì xoá là thao tác **bất biến khi lặp**.
- Ba sự cố kinh điển: **stampede** (khoá + TTL nhiễu + làm mới sớm), **penetration** (cache `NULL` + Bloom filter), **avalanche** (TTL nhiễu + làm nóng + stale fallback).
- **Luôn đặt TTL**, kể cả khi đã có cơ chế xoá chủ động — nó là lưới an toàn cho mọi bug bạn chưa biết.
- Redis mặc định là **`noeviction`** — phải đổi sang `allkeys-lru` khi dùng làm cache.
- Bẫy nguy hiểm nhất của cache HTTP: **quên `private`** → CDN phục vụ dữ liệu cá nhân cho người khác; và quên **`Vary`**.
- Đo **tỉ lệ trúng**, **p99 của chính cache**, và **tỉ lệ trục xuất** — cache không đo được thì không biết nó có tác dụng hay không.

**Bài kế tiếp** → [Bài 4: Job Queue và Worker — đưa việc nặng ra khỏi request](04-job-queue-va-worker.md)
