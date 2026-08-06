# Bài 1: "Cập nhật xong rồi, cache xoá lúc nào?"

Người dùng vừa sửa giá một sản phẩm. Bấm lưu, hiện thông báo thành công. Mở lại trang chi tiết — vẫn giá cũ.

Người phỏng vấn xoay màn hình lại, hỏi đúng bảy chữ, giọng bình thường:

> *"Cập nhật xong rồi, cache xoá lúc nào?"*

Câu hỏi hiện đủ chữ, rồi họ ngồi im, không gợi ý thêm.

Bạn vừa trả lời trong đầu rồi. **Giữ nguyên câu đó.** Câu đó gần như chắc chắn đúng, và nó vẫn chưa cứu được bạn — vì câu hỏi không hỏi bạn *làm gì*, nó hỏi bạn làm **hai việc đó theo thứ tự nào**, và **chuyện gì xảy ra khi việc thứ hai thất bại**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa trong bài này |
|---|---|
| **Cache** | Bản sao dữ liệu để ở chỗ đọc nhanh (Redis, bộ nhớ trong tiến trình) nhằm khỏi phải hỏi database |
| **Cache-Aside** (Lazy Loading) | Ứng dụng tự quản cache: đọc thì tra cache trước, trượt thì xuống DB rồi nạp lên |
| **Invalidation** (vô hiệu hoá) | Làm cho bản sao trong cache không còn được dùng nữa — bằng cách **xoá** hoặc **ghi đè** |
| **Stale data** (dữ liệu ôi) | Bản trong cache đã khác bản trong DB — người dùng đang nhìn quá khứ |
| **TTL** (Time-To-Live) | Hạn dùng của một key. Hết hạn thì cache tự xoá, lần đọc sau nạp lại |
| **Race condition** | Hai tiến trình đan xen nhau đúng nhịp xấu, cho ra kết quả sai mà từng bước đều đúng |
| **Silent failure** (lỗi im lặng) | Lỗi không ai thấy, không ai báo — khách hàng phát hiện trước bạn |
| **Cửa sổ va chạm** | Khoảng thời gian mà hai tiến trình có thể đan vào nhau gây sai |

## Tầng 1 — Định nghĩa: xoá hay ghi đè, và ai làm trước

Đáp án 9/10 ứng viên nói ra, và nó **đúng**:

> *"Ghi vào database xong thì xoá cache đi, để lần đọc sau nó tự nạp lại giá mới."*

Người phỏng vấn gật đầu, ghi một dòng vào sổ. Bạn chưa được điểm nào — đây là tầng ai đọc tài liệu mười phút cũng nói được.

Nhưng câu đó vừa nói **hai việc** mà bỏ trống hai chỗ:

```text
① "Ghi DB xong thì xoá cache"  →  việc nào chạy TRƯỚC? (bạn có nói, nhưng nói vì sao chưa?)
② "xoá cache đi"               →  nếu lệnh xoá đó THẤT BẠI thì hệ thống ra sao?
```

Hai chỗ trống đó chính là tầng 2 và tầng 3 của câu hỏi.

### Vì sao xoá mà không ghi đè?

Trước khi nói tới thứ tự, phải chốt một chuyện: khi dữ liệu đổi, bạn có hai lựa chọn — **xoá** key khỏi cache, hay **ghi giá trị mới đè lên**. Gần như luôn chọn xoá:

| | Xoá key (invalidate) | Ghi đè key (update) |
|---|---|---|
| Hai lệnh ghi tới không đúng thứ tự | Vô hại — cả hai đều xoá, kết quả như nhau | **Hỏng** — lệnh cũ tới sau ghi đè lệnh mới, cache giữ giá cũ vĩnh viễn |
| Giá trị cache là kết quả tính toán nặng | Chỉ tính lại khi thật sự có người đọc | Tính lại mỗi lần ghi, kể cả key không ai đọc |
| Cache lưu bản ghép từ nhiều bảng | Xoá là xong, không cần biết ghép thế nào | Phải dựng lại đúng bản ghép ở tầng ghi — logic nhân đôi |
| Sau thao tác | Cache **trống** → lần đọc kế tiếp phải xuống DB (miss) | Cache **ấm** ngay |

Xoá là thao tác **luỹ đẳng** (idempotent — làm một lần hay mười lần đều cho cùng kết quả). Ghi đè thì không. Đó là lý do gần như mọi hệ chọn xoá, và chịu một lần cache miss.

## Tầng 2 — Con số và cơ chế: xoá trước khi ghi DB là một cái bẫy

Đây là chỗ ăn điểm đầu tiên. Rất nhiều codebase viết thế này vì nó "nghe sạch hơn" — dọn cache trước cho chắc:

```java
// SAI — đừng viết thế này
cache.delete("sanpham:42");                 // ① dọn cache trước cho sạch
sanPhamRepository.updateGia(42, 120_000);   // ② rồi mới ghi DB
```

Nó chạy đúng 999 lần trong 1000 lần. Lần thứ 1000 thì thế này:

```text
Thời gian ──────────────────────────────────────────────────────────────►

Tiến trình A (GHI)          Tiến trình B (ĐỌC)          Trạng thái
─────────────────────       ─────────────────────       ──────────────────
t0  xoá cache:42                                        cache: TRỐNG
                                                        DB:    100.000 (cũ)

t1                          đọc cache:42 → TRƯỢT        cache: TRỐNG
t2                          đọc DB → thấy 100.000       ← đọc trúng GIÁ CŨ
t3                          ghi cache:42 = 100.000      cache: 100.000  ✗

t4  ghi DB = 120.000                                    DB:    120.000 (mới)
                                                        cache: 100.000 (CŨ!)

    ────────── Từ đây trở đi, cache SAI cho tới khi TTL hết hạn ──────────
```

**Cửa sổ va chạm ở đây rộng bằng cả thời gian ghi DB** — thường 5 đến 50 mili-giây, và nếu lệnh ghi nằm trong một transaction dài thì nó rộng bằng cả transaction đó. Trên một key nóng đọc vài nghìn lượt mỗi giây, 20 ms là đủ cho **hàng chục** lượt đọc rơi đúng vào khe.

Hậu quả không phải "sai một lúc". Cache vừa bị **nạp lại** giá cũ, nghĩa là nó có TTL mới tinh. Đặt TTL 5 phút thì hệ thống hiển thị sai **trọn 5 phút**, và không có gì trong hệ thống biết chuyện đó.

> **Quy tắc tầng 2: GHI DATABASE TRƯỚC, XOÁ CACHE SAU.** Đảo lại là tự mở một cửa sổ để cache tự nạp giá cũ.

Đổi thứ tự thì cửa sổ hẹp lại rất nhiều:

```java
// ĐÚNG — thứ tự này thu hẹp cửa sổ va chạm xuống mức rất khó trúng
sanPhamRepository.updateGia(42, 120_000);   // ① nguồn sự thật đổi trước
cache.delete("sanpham:42");                 // ② rồi mới vô hiệu hoá bản sao
```

## Tầng 3 — Đánh đổi: lệnh xoá cache thất bại thì sao?

Người phỏng vấn hỏi tiếp, và đây là câu thật:

> *"Thế còn lệnh xoá cache đó bị thất bại thì sao?"*

Kịch bản:

```text
① DB cập nhật 120.000 → THÀNH CÔNG, transaction đã commit.
② Đúng lúc đó Redis rớt mạng / timeout / đang failover.
③ Lệnh delete BAY MẤT.
④ Không exception nào nổi lên tới người dùng — request vẫn trả 200 OK.
⑤ Giá cũ 100.000 nằm trong cache CHO TỚI KHI có ai đó sửa giá lần nữa.
```

Đây là **lỗi im lặng** đúng nghĩa: log sạch, monitor xanh, không alert nào kêu. Nó chỉ lộ ra khi khách hàng gọi lên hỏi vì sao giá hiển thị khác giá thanh toán.

### Lưới an toàn: TTL không phải để cắm cho vui

Rất nhiều người đặt TTL theo cảm giác, hoặc tệ hơn — không đặt TTL vì "đã có invalidation rồi". **Không đặt TTL nghĩa là bạn cược rằng lệnh xoá cache không bao giờ hỏng.**

TTL là **cận trên của thiệt hại** khi mọi cơ chế invalidation đều thất bại:

```text
TTL = 60s   →  "Nếu mọi lệnh xoá cache đều hỏng, tôi chấp nhận tối đa
                1 phút dữ liệu ôi, rồi hệ thống TỰ chữa."
```

Cách chọn con số đó, theo nghiệp vụ chứ không theo cảm giác:

| Loại dữ liệu | TTL gợi ý | Lý do |
|---|---|---|
| Giá, tồn kho, hạn mức | 30–60s | Sai một phút còn cãi được; sai một giờ là mất tiền |
| Hồ sơ người dùng, cấu hình | 5–15 phút | Đổi hiếm, sai vài phút không ai chết |
| Danh mục, cây phân loại | 1–6 giờ | Gần như tĩnh, đổi thì chủ động xoá |
| Kết quả tính nặng (báo cáo) | 5–30 phút | Chi phí dựng lại cao, chấp nhận ôi |
| Phiên đăng nhập, token | Bằng hạn của chính nó | TTL ở đây là ngữ nghĩa nghiệp vụ, không phải lưới an toàn |

Và luôn cộng thêm một chút ngẫu nhiên (jitter) để cả đám key không hết hạn cùng một giây:

```java
// Không có jitter: 10.000 key nạp cùng lúc lúc 09:00:00 sẽ cùng hết hạn lúc 09:01:00
// → 10.000 lượt trượt cache đập vào DB trong một giây (cache stampede)
Duration ttl = Duration.ofSeconds(60 + ThreadLocalRandom.current().nextInt(0, 15));
cache.set(key, value, ttl);
```

> Chi tiết về hiệu ứng đám đông khi cache hết hạn đồng loạt: [Case cache stampede](../../backend-scaling-cases/phase-4-cascading-failure/02-case-cache-stampede.md).

### Ba lớp phòng thủ, không phải một

Một hệ nghiêm túc không chỉ dựa vào lệnh delete:

```text
LỚP 1 — Xoá chủ động sau khi ghi DB
        Bắt được 99,9% trường hợp. Nhanh, rẻ, nhưng CÓ THỂ HỎNG.

LỚP 2 — TTL
        Cận trên của thiệt hại khi lớp 1 hỏng. Luôn luôn phải có.
        Chi phí: một lần cache miss mỗi TTL cho mỗi key.

LỚP 3 — Hàng đợi xoá / CDC đọc từ nhật ký ghi của DB
        Lệnh xoá không mất vì nó được retry. Đắt hơn, dựng cho hệ lớn.
```

## Tầng 4 — Quy trình: sự thật là không có cách nào đúng 100%

Đây là chỗ phân biệt người đã vận hành thật. **Ngay cả khi bạn ghi DB trước, xoá cache sau, và lệnh xoá thành công — cache vẫn có thể lệch.**

Kịch bản này hiếm hơn nhiều nhưng có thật:

```text
Thời gian ──────────────────────────────────────────────────────────────►

Tiến trình B (ĐỌC)              Tiến trình A (GHI)          Trạng thái
─────────────────────           ─────────────────────       ──────────────
t0  đọc cache:42 → TRƯỢT                                    cache: TRỐNG
t1  đọc DB → thấy 100.000                                   ← cầm giá CŨ trong tay
        (B bị hoãn ở đây: GC pause, chờ mạng, OS descheduled)

t2                              ghi DB = 120.000            DB: 120.000
t3                              xoá cache:42                cache: TRỐNG (xoá đúng!)

t4  ghi cache:42 = 100.000                                  cache: 100.000  ✗
        ↑ B ghi con số nó đọc được từ t1 — đã ôi từ lâu
```

B đọc DB **trước** khi A ghi, nhưng ghi cache **sau** khi A xoá. Không ai làm sai thứ tự cả. Cửa sổ ở đây hẹp hơn nhiều (chỉ trúng khi tiến trình đọc bị hoãn đúng lúc giữa hai bước của nó), nhưng ở quy mô đủ lớn thì "hiếm" nghĩa là "mỗi ngày vài lần".

**Đây chính là điều người phỏng vấn muốn nghe.** Không phải để bạn giải nó — mà để xem bạn có biết nó tồn tại không, và bạn chặn nó bằng gì.

### Bốn cách xử lý phần dư, kèm cái giá

| Cách | Cơ chế | Bắt được gì | Cái giá |
|---|---|---|---|
| **Chỉ TTL** (mặc định nên chọn) | Chấp nhận lệch, giới hạn thiệt hại bằng hạn dùng | Mọi loại lệch, sau tối đa TTL | Dữ liệu ôi tối đa TTL |
| **Xoá hai lần có độ trễ** (delayed double delete) | Xoá → ghi DB → chờ ~500ms → xoá lần nữa | Lượt đọc bị hoãn trong cửa sổ đó | Phức tạp, chọn độ trễ bằng cảm giác, vẫn không kín |
| **Khoá theo key khi nạp cache** | Chỉ một tiến trình được nạp lại một key; kèm kiểm tra phiên bản trước khi ghi | Gần kín | Thêm một vòng khoá vào đường đọc nóng |
| **CDC / đọc binlog–WAL** (Debezium) | Nguồn xoá cache là chính nhật ký ghi của DB, không phải code ứng dụng | Kín gần như tuyệt đối, kể cả khi có người sửa DB bằng tay | Thêm một hệ thống phải nuôi; trễ vài trăm ms |

Cách thứ tư đáng nói kỹ vì đó là thứ các hệ lớn thật sự chạy: thay vì tin vào một dòng `cache.delete()` nằm trong code ứng dụng — dòng có thể bị quên khi ai đó viết một đường ghi mới, có thể hỏng khi mạng chập, và hoàn toàn vô hiệu khi DBA sửa dữ liệu bằng tay — bạn để **nhật ký ghi của chính database** làm nguồn sự kiện:

```text
   App A ──┐
   App B ──┼──► PostgreSQL ──► WAL ──► Debezium ──► Kafka ──► Consumer ──► xoá cache
   DBA  ──┘                    (mọi thay đổi đều đi qua đây, không sót đường nào)
```

Đổi lại: cache ôi thêm vài trăm mili-giây (thời gian sự kiện đi qua đường ống), và bạn phải nuôi thêm Kafka + Debezium.

### Mã production: Cache-Aside làm cho đúng

```java
@Service
public class SanPhamService {

    private static final Duration TTL_CO_BAN = Duration.ofSeconds(60);

    public SanPham layTheoId(long id) {
        String key = "sanpham:" + id;

        SanPham tuCache = cache.get(key, SanPham.class);
        if (tuCache != null) return tuCache;

        SanPham tuDb = repository.findById(id).orElseThrow();
        cache.set(key, tuDb, ttlCoJitter());
        return tuDb;
    }

    @Transactional
    public void doiGia(long id, BigDecimal giaMoi) {
        repository.updateGia(id, giaMoi);

        // Đăng ký lệnh xoá chạy SAU KHI transaction commit thành công.
        // Xoá bên trong transaction là một cái bẫy riêng: nếu transaction
        // rollback thì cache đã bị xoá oan, và tệ hơn — trong khoảng giữa
        // xoá và commit, lượt đọc sẽ nạp lại đúng giá trị cũ.
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override public void afterCommit() {
                    xoaCacheKhongLamVoRequest("sanpham:" + id);
                }
            });
    }

    private void xoaCacheKhongLamVoRequest(String key) {
        try {
            cache.delete(key);
        } catch (Exception e) {
            // Không ném lỗi ra ngoài: DB đã commit, đơn hàng đã thành công.
            // Nhưng PHẢI để lại dấu vết đo được, nếu không đây là lỗi im lặng.
            meterRegistry.counter("cache.invalidate.that_bai").increment();
            log.warn("Xoá cache thất bại, dựa vào TTL để tự chữa. key={}", key, e);
            hangDoiXoaLai.day(key);   // lớp 3: thử lại bất đồng bộ
        }
    }
}
```

Ba chi tiết trong đoạn code trên là thứ phân biệt code đã chạy production:

1. **`afterCommit`, không phải trong transaction.** Xoá cache khi transaction chưa commit là quay lại đúng cái bẫy tầng 2 — chỉ khác là bây giờ cửa sổ nằm giữa lệnh xoá và lệnh commit.
2. **Nuốt exception, nhưng đếm nó.** Lỗi xoá cache không được làm hỏng request đã thành công. Nhưng nuốt mà không đếm thì bạn vừa tạo ra lỗi im lặng bằng chính tay mình.
3. **Có đường thử lại.** Đó là lớp 3.

### Bốn chỗ hay quên xoá

Sau khi hỏi hết ba tầng, câu tình huống thường là: *"Hệ thống của bạn có bao nhiêu đường ghi vào bảng đó?"*

```text
① API sửa hàng thường   → hầu như ai cũng nhớ xoá
② Job chạy nền / cron   → thường quên
③ Consumer đọc từ queue → thường quên
④ DBA chạy tay lúc 2h sáng để chữa cháy → không có cách nào nhớ
```

Đường ① được xoá cache, ba đường còn lại thì không. Đây là lý do thật sự khiến CDC hấp dẫn: nó không quan tâm ai ghi, nó chỉ đọc nhật ký.

Nếu chưa dựng CDC, cách rẻ tiền là gom mọi đường ghi vào **một cửa duy nhất** ở tầng repository, và cấm ghi thẳng ở nơi khác bằng kiểm tra kiến trúc tự động (ArchUnit) — cùng một tinh thần với [luật kiến trúc trong khoá ORM](../../orm-n-plus-1/06-kien-truc-thuc-te-va-lo-trinh-chuyen-doi.md).

## Bốn kiểu cache và chỗ đứng của từng kiểu

Cache-Aside là kiểu phổ biến nhất nhưng không phải kiểu duy nhất. Biết ba kiểu còn lại giúp bạn trả lời câu *"có cách nào khỏi phải xoá không?"*:

| Kiểu | Ai ghi vào cache | Ưu | Nhược |
|---|---|---|---|
| **Cache-Aside** | Ứng dụng, lúc đọc trượt | Đơn giản, cache chết thì hệ vẫn chạy | Lệch như cả bài này mô tả; lần đọc đầu luôn chậm |
| **Read-Through** | Thư viện cache, lúc đọc trượt | Code ứng dụng sạch | Phụ thuộc thư viện; cache chết là đường đọc chết |
| **Write-Through** | Ghi cache và DB cùng lúc, đồng bộ | Cache luôn ấm và gần như luôn đúng | Mỗi lệnh ghi chậm thêm; vẫn cần xử lý khi một trong hai hỏng |
| **Write-Behind** | Ghi cache trước, đẩy xuống DB sau | Ghi rất nhanh | **Mất dữ liệu nếu cache chết trước khi kịp đẩy** — không dùng cho tiền |

Với dữ liệu tiền bạc, Write-Behind là câu trả lời sai trong mọi buổi phỏng vấn — và nếu bạn tự nêu ra rồi tự loại nó vì lý do đó, bạn vừa ghi điểm.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Xoá cache trước khi ghi DB | Mở cửa sổ cho lượt đọc nạp lại giá cũ, kéo dài trọn TTL | Ghi DB trước, xoá sau |
| Xoá cache bên trong transaction | Rollback thì xoá oan; chưa commit thì nạp lại giá cũ | Xoá ở `afterCommit` |
| Không đặt TTL vì "đã có invalidation" | Một lệnh xoá hỏng là ôi vĩnh viễn | Luôn có TTL, coi nó là cận trên thiệt hại |
| Ghi đè giá trị mới thay vì xoá | Hai lệnh ghi tới sai thứ tự là cache kẹt giá cũ | Xoá — thao tác luỹ đẳng |
| Nuốt lỗi xoá cache không đếm | Tự tay tạo ra lỗi im lặng | `try/catch` + counter + log + retry |
| Mọi key cùng TTL, không jitter | Hết hạn đồng loạt → đám đông đập vào DB | Cộng ngẫu nhiên 10–25% |
| Chỉ xoá ở đường API, quên job/consumer/DBA | Ba đường còn lại vẫn làm lệch | Gom một cửa ghi, hoặc dùng CDC |
| Cache lưu cả object rỗng khi DB không có dòng | Không phân biệt "chưa cache" và "không tồn tại" | Cache negative có TTL ngắn riêng |

## Nguồn và kiểm chứng

- Cửa sổ va chạm ở kịch bản "đọc bị hoãn" là hạn chế đã biết của Cache-Aside, được mô tả trong bài *Scaling Memcache at Facebook* (NSDI 2013) — nơi Facebook giải bằng cơ chế **leases** thay vì cố xoá cho kín.
- Con số TTL trong bài là **khuyến nghị theo loại dữ liệu**, không phải hằng số của hệ nào. Hãy chọn nó từ câu hỏi *"sai bao lâu thì có người mất tiền?"*.

## Bản mẫu 30 giây

> *"Ghi database trước, xoá cache sau — đây là Cache-Aside. Không bao giờ xoá trước, vì trong lúc mình chưa ghi xong thì một lượt đọc sẽ trượt cache, xuống DB lấy đúng giá cũ rồi nạp ngược lên, và cache kẹt giá cũ trọn TTL. Lệnh xoá đó cũng có thể hỏng do mạng, nên em luôn đặt TTL — em coi TTL là cận trên của thiệt hại, thường 60 giây cho giá và tồn kho, cộng jitter để không hết hạn đồng loạt. Em cũng xoá ở `afterCommit` chứ không xoá trong transaction. Và em nói thật là kể cả làm đúng hết thì vẫn còn một khe hẹp: lượt đọc lấy dữ liệu trước khi mình ghi nhưng ghi cache sau khi mình xoá. Em chặn nó bằng TTL ngắn; nếu nghiệp vụ không chịu được thì phải chuyển sang xoá cache theo CDC đọc từ WAL."*

Ba mươi giây đó có: một thứ tự kèm lý do, một cơ chế hỏng kèm lưới an toàn, một con số, và **một chỗ thừa nhận hệ vẫn có thể vỡ kèm cách chặn**. Chính vế cuối mới là vế được điểm.

## Tóm tắt bài 1

- **Ghi database trước, xoá cache sau.** Đảo lại là mở cửa sổ cho lượt đọc nạp lại giá cũ và giữ nó trọn TTL.
- **Xoá, đừng ghi đè.** Xoá là thao tác luỹ đẳng, không sợ hai lệnh tới sai thứ tự.
- **Xoá ở `afterCommit`**, không xoá trong transaction.
- **TTL là lưới an toàn cuối cùng**, không phải tuỳ chọn. Nó là câu trả lời cho *"nếu mọi lệnh xoá đều hỏng thì tôi ôi tối đa bao lâu?"*.
- Lỗi xoá cache phải **nuốt nhưng có đếm** — nuốt im lặng là tự tạo ra lỗi khách hàng phát hiện trước.
- **Không có cách nào đúng 100%.** Người giỏi nói ra chỗ hệ vẫn có thể vỡ và nói rõ mình chặn nó bằng gì.

**Bài kế tiếp** → [Bài 2: "Hai người sửa cùng một dòng, ai thắng?"](02-hai-nguoi-sua-cung-mot-dong-ai-thang.md)
