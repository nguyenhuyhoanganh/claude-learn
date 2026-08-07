# Series: Database — sự cố thật và câu hỏi phỏng vấn có tầng dưới

> *"Câu trả lời của bạn ĐÚNG. Và bạn vẫn trượt."*
>
> *"Con số bạn nhìn không sai. Nó chỉ không phải con số mà máy dùng."*

Đây là khoá về **18 tình huống** — một nửa là câu hỏi phỏng vấn ngắn tới mức bạn tưởng mình trả lời được ngay, một nửa là sự cố production có thật, có bài mổ xẻ công khai, có số liệu đo được.

Cả 18 tình huống chia nhau **đúng một mạch**:

```text
   Thứ bạn nhìn thấy KHÔNG PHẢI thứ máy đang dùng.

   • Câu trả lời đúng dừng ở tầng định nghĩa    → vẫn trượt phỏng vấn
   • EXPLAIN giống hệt nhau                      → mà chênh 200 lần
   • tree_level vẫn báo 2                        → mà Postgres đọc con trỏ khác
   • Dashboard xanh, CPU ổn, RAM ổn              → mà cửa ghi sắp tự đóng
   • Cột bình luận chạy đầy màn hình             → mà không ai thấy dòng của bạn
```

## Khoá này khác gì các bài viết cùng chủ đề

**Mọi con số trong khoá đều được tra lại từ nguồn gốc**, không chép lại từ bài tóm tắt. Ba chỗ mà tài liệu trôi nổi ghi sai đã được đính chính thẳng trong bài, kèm mục *"Nguồn và kiểm chứng"* ở cuối để bạn tự kiểm.

**Mỗi bài đều có:**

- **Bảng giải nghĩa thuật ngữ ngay đầu bài** — mỗi từ chuyên ngành kèm **một cách hình dung đời thường**. Không giả định bạn đã biết gì.
- **Sơ đồ ASCII** vẽ luồng từng bước theo thời gian — để hiểu *vì sao*, không học vẹt.
- **Con số thật**: mili-giây, GB, số trang đọc, tỷ lệ phần trăm, kèm cách tự đo lại.
- **Bảng bẫy thường gặp** — mỗi bẫy kèm *vì sao hỏng* và *cách sửa*.
- **Câu lệnh chẩn đoán chạy được ngay** trên database của bạn.
- Với bài dạng phỏng vấn: **bản mẫu trả lời 30 giây giọng ứng viên**.

## Mục lục

### Phần I — Bảy câu hỏi có tầng dưới

Bảy câu hỏi phỏng vấn ngắn. Câu trả lời đầu tiên của bạn gần như chắc chắn **đúng** — và đó chính là chỗ bắt đầu.

| Bài | Nội dung |
|---|---|
| [01](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) | **"Cập nhật xong rồi, cache xoá lúc nào?"** — vì sao **xoá cache trước khi ghi DB** mở cửa sổ nạp lại giá cũ trọn TTL; xoá vs ghi đè; xoá ở `afterCommit`; **TTL là cận trên của thiệt hại** chứ không phải tuỳ chọn; và khe hẹp mà **không cách nào đóng kín được** — chỗ này mới là chỗ ăn điểm |
| [02](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md) | **"Hai người sửa cùng một dòng, ai thắng?"** — *"người sau thắng"* đúng mà chưa trả lời câu hỏi; mất **giá trị** vs mất **phép tính**; **transaction KHÔNG chống được Lost Update**; MySQL `Repeatable Read` vẫn mất cập nhật; bốn cách chữa theo thứ tự; **cái bẫy ORM ghi đè cả dòng**; và câu hỏi ngược *"cùng cột hay khác cột?"* |
| [03](phase-1-cau-hoi-co-tang-duoi/03-anh-nguoi-dung-luu-o-dau.md) | **"Ảnh người dùng lưu ở đâu?"** — bốn chỗ đau khi để trong bảng (sao lưu, **buffer pool bị chiếm nên truy vấn không liên quan cũng chậm**, WAL phình, TOAST nén vô ích); **kho ảnh và database không chung transaction**; file mồ côi vs ảnh vỡ — chọn loại rác rẻ hơn; job dọn rác có **ngưỡng tuổi, khu cách ly và phanh** |
| [04](phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md) | **"Dùng khoá ngoại có làm chậm không?"** — thêm dòng con **+5–10%**, xoá dòng cha thiếu index **~1.300 lần**; **PostgreSQL không tự tạo index cho FK, MySQL thì có**; `INSERT` con **khoá nhẹ dòng cha** gây kẹt bí ẩn; `NOT VALID` + `VALIDATE`; khi nào bỏ FK là hợp lý |
| [05](phase-1-cau-hoi-co-tang-duoi/05-sinh-ma-don-hang-the-nao.md) | **"Bạn sinh mã đơn hàng thế nào?"** — vì sao bộ đếm **phải** nhả số ngoài giao dịch; bốn nguồn sinh lỗ số; **mã liên tục hoặc bán nhiều đơn cùng lúc — chọn một**; trần **25 đơn/giây** và mẹo đẩy lệnh đếm xuống sát `COMMIT` để lên **333**; tách mã kỹ thuật và mã nghiệp vụ; mã tăng dần **lộ doanh số** |
| [06](phase-1-cau-hoi-co-tang-duoi/06-ban-sao-luu-database-the-nao.md) | **"Bạn sao lưu database thế nào?"** — **chọn con số trước, chọn công cụ sau**: RPO vs RTO; dump hàng đêm = mất tới 11 tiếng = 900 khách đã trả tiền; WAL archiving và phục hồi về **đúng một giây trước tai nạn**; **replica không phải backup** (lệnh xoá nhầm sang replica trong 200ms); **replica trễ**; **bản sao lưu chưa phục hồi thử không phải bản sao lưu** |
| [07](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) | **"Lưu số dư tiền kiểu gì?"** — ba vết nứt của ô số dư (hàng nóng, cộng trùng khi thử lại, mất dấu vết); sổ cái chỉ ghi thêm + khoá luỹ đẳng; **chốt sổ** giảm nghìn lần số dòng phải đọc, và **cái bẫy neo dòng chốt vào thời gian gây mất tiền âm thầm**; **một hệ nuôi hai con số cho cùng một thứ** |

### Phần II — Bộ máy ngầm của PostgreSQL

Năm sự cố mà nguyên nhân nằm ở tầng bạn chưa từng mở ra xem.

| Bài | Nội dung |
|---|---|
| [08](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) | **Kế hoạch dùng chung và bẫy điều kiện OR** — cùng câu lệnh, **0,042 ms vs 71,971 ms**; `PREPARE` chỉ cắt 3 chặng đầu, **chặng lập kế hoạch vẫn chạy lại**; luật 5 lần và dòng chú thích `arbitrary` trong mã nguồn; **`Index Cond` vs `Filter`**; `Rows Removed by Filter` = 525.600 = số phút một năm; **Postgres so ước tính với ước tính, không bao giờ đo thật**; vụ BMC 2019 và câu của Tom Lane; **gốc rễ không phải prepared statement** |
| [09](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) | **Bảng thống kê mà planner đọc** — planner **không đọc dữ liệu, nó đọc bản tóm tắt lấy mẫu**; cỡ mẫu **30.000 dòng và không tăng theo cỡ bảng**; giả định các cột độc lập → hụt 100 lần; sai số **nhân dồn theo số phép ghép** (16% → 32% → 52%); **vụ Clerk sập 90 phút ngày 19/02/2026** vì một cột 99,99996% NULL; `CREATE STATISTICS` **chưa dùng được cho ghép bảng**; và vì sao AI viết SQL không cứu được chỗ này |
| [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) | **Báo cáo tháng chạy 40 giây** — vụ án bốn mẩu bằng chứng, loại trừ ba nghi phạm; **`EXPLAIN` in kế hoạch, `EXPLAIN ANALYZE` in cái giá**; `quicksort Memory` vs `external merge Disk`; **CPU 12% mà đèn đĩa sáng**; `work_mem` là hạn mức **mỗi thao tác, mỗi phiên** → 4 × 50 × 512MB = 100 GB → OOM; `hash_mem_multiplier`; `log_temp_files = 0` |
| [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) | **Chiều cao index và con số Postgres không dùng** — vì sao xoá dữ liệu **không bao giờ** làm cây thấp lại; mẹo **Fast Root** và hai cặp con trỏ trong Metapage; `pgstatindex.tree_level` trả **gốc thật** — con số nằm ngoài mọi đường đi của Postgres; **`avg_leaf_density` càng rác càng đẹp**; kiểu xoá quyết định kết quả; `VACUUM` **không** trả dung lượng index; cái giá của `REINDEX CONCURRENTLY` |
| [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) | **Bộ đếm 32 bit và cánh cửa ghi tự đóng** — MVCC và vì sao cần một bộ đếm; **so sánh theo vòng tròn**, không có "cũ hơn tuyệt đối"; ba ngưỡng và cửa ghi tự đóng ở ~3 triệu; **sự cố Sentry 2015** và con số 24 tiếng; **ba kẻ thù vô hình chặn VACUUM**; giao dịch chỉ đọc không tiêu XID **nhưng vẫn chặn dọn**; **MultiXact — bộ đếm thứ hai không ai theo dõi** |

### Phần III — Tài nguyên và vòng đời

Ba ca mà nguyên nhân không nằm trong câu lệnh nào cả.

| Bài | Nội dung |
|---|---|
| [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) | **Cắt bớt kết nối để chạy nhanh hơn** — vì sao "song song" là cú lừa; đổi ca đắt nhất ở chỗ **đá cache của nhau**; công thức `(core × 2) + đĩa`; **SSD thì pool tối ưu còn nhỏ hơn**; **10.000 kết nối ngồi không làm mất ~50% thông lượng** (1.032.435 → 521.558 TPS), PG14 vá lại nhưng đời thật vẫn mất 16%; Oracle cắt **2048 → 96**, 100ms → 2ms; bài toán nhân bản và **những gì PgBouncer làm hỏng** |
| [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) | **MySQL phình bộ nhớ mà không hề rò** — máy 187 GiB bị OOM; **ba tầng mà ai cũng gộp làm một**; vì sao đổi bộ cấp phát — mẹo ai cũng nghĩ tới đầu tiên — **chắc chắn vô dụng ở ca này**; `MEM_ROOT` và mặt trái ghi thẳng trong mã nguồn; **cursor bắt buộc có kho riêng**; 87.831 MB = **94,3%** phần bộ nhớ tăng thêm; **cần đủ hai điều kiện mới sập**, và nửa mili-giây nghỉ là hết; ba chỗ Postgres làm khác |
| [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) | **Redis 100 GB xuống 60 GB** — vì sao thêm máy/bật nén/xoá bớt đều trượt; **kiểu dữ liệu là thứ bạn thấy, cách lưu mới là thứ trả tiền**; bậc thang **104 → 120 → 212 byte** (+76,67% chỉ vì thêm một ký tự); mẹo gom nhóm cứu Instagram 2011 (70 MB → 16 MB); **chuyển đổi một chiều — đường quay về chưa từng được viết**; cái giá của việc nâng ngưỡng; **đính chính `OBJECT ENCODING` vs `MEMORY USAGE`** |

### Phần IV — Thứ tự và quy mô

| Bài | Nội dung |
|---|---|
| [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md) | **Khoá xoắn vào nhau** — kẹt khoá **không phải chậm**, nó **không bao giờ tự qua**; database **để kẹt xảy ra rồi mới gỡ**; dòng lỗi trong log là chỗ máy **tiết kiệm cho bạn 50 giây**; MySQL dò ngay vs Postgres đợi `deadlock_timeout` 1 giây; **gốc là THỨ TỰ, không phải số lượng**; **một câu `UPDATE` duy nhất vẫn kẹt được** vì thứ tự do máy tự chọn; bốn nguồn kẹt ít ngờ tới |
| [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) | **Hàng đợi trên Postgres hỏng ở đâu** — **ba cái trần, ba cơ chế**: giành việc (`SKIP LOCKED`), giới hạn đồng thời (**`REPEATABLE READ` là Snapshot Isolation** → *khoá nhả theo thời gian thật, ảnh chụp thì đông cứng*), và **rác** (nhận việc = `UPDATE status` mà `status` nằm trong index → mất HOT có hệ thống); **index từng phần** là thuốc mạnh nhất; Kafka né bằng **một con số offset**; và **50% cụm Kafka trên đời ghi dưới 10 MB/giây** |
| [18](phase-4-thu-tu-va-quy-mo/03-40-nghin-binh-luan-mot-giay.md) | **40 nghìn bình luận một giây** — **84 tỷ bản sao mỗi giây**, gấp 10 lần dân số Trái Đất; ba cửa **Nhân → Phễu → Vọng**; **có 2,1 triệu cột bình luận khác nhau**, không cột nào đầy đủ; Optimistic UI và vì sao bạn thấy chữ mình trên **1 trong 2,1 triệu** màn hình; **màn hình thay mới nhanh hơn khả năng đọc gần 700 lần** → bỏ bớt là điều kiện để con người còn đọc được; fan-out theo tầng, gom lô, backpressure |

## Ba cách dùng khoá này

**① Ôn phỏng vấn (2–3 buổi tối).** Đọc Phần I theo thứ tự. Với mỗi bài: che phần đáp án, tự trả lời trong đầu trước, rồi đọc xem mình dừng ở tầng mấy. Học thuộc **bản mẫu 30 giây** ở cuối mỗi bài — không phải để đọc thuộc lòng, mà để nhớ **cấu trúc**: một con số, một đánh đổi đủ hai vế, một quy trình.

**② Đi tìm quả bom trong hệ của mình (một buổi chiều).** Mở database production ra và chạy theo thứ tự:

```text
   ① Bài 12 → age(datfrozenxid) và mxid_age(relminmxid)   ← nguy hiểm nhất, chạy trước
   ② Bài 4  → liệt kê khoá ngoại thiếu index
   ③ Bài 9  → n_mod_since_analyze và pg_stats của bảng lớn
   ④ Bài 10 → temp_files / temp_bytes trong pg_stat_database
   ⑤ Bài 8  → pg_stat_statements sắp theo max/min thời gian chạy
   ⑥ Bài 11 → kích thước index theo thời gian + index INVALID
   ⑦ Bài 13 → tổng pool × số bản sao service so với max_connections
```

Gần như chắc chắn bạn sẽ tìm được ít nhất hai chỗ đáng sửa.

**③ Tra cứu khi đang cháy.** Mỗi bài đều tự đứng được. Nhảy thẳng vào bài đúng triệu chứng:

| Triệu chứng | Đọc bài |
|---|---|
| Mọi lệnh ghi bỗng fail, log nói "not accepting commands" | [12](phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md) |
| Chậm đột ngột, không ai deploy gì | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md), [9](phase-2-bo-may-ngam-cua-postgres/02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md) |
| Nhanh trên dev, chậm trên production, cùng dữ liệu | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md), [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| CPU thấp mà đèn đĩa sáng liên tục | [10](phase-2-bo-may-ngam-cua-postgres/03-bao-cao-thang-chay-40-giay-work-mem.md) |
| Bộ nhớ chỉ đi một chiều lên rồi OOM | [14](phase-3-tai-nguyen-va-vong-doi/02-mysql-phinh-bo-nho-khong-phai-ro.md) |
| Tăng pool mà càng chậm | [13](phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md) |
| Log đầy "Deadlock found" / "could not serialize" | [16](phase-4-thu-tu-va-quy-mo/01-khoa-xoan-nhau-goc-la-thu-tu.md), [17](phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md) |
| Số liệu tồn kho / số dư lệch mà không ai biết vì sao | [2](phase-1-cau-hoi-co-tang-duoi/02-hai-nguoi-sua-cung-mot-dong-ai-thang.md), [7](phase-1-cau-hoi-co-tang-duoi/07-luu-so-du-tien-kieu-gi.md) |
| Cache trả giá cũ dù đã cập nhật | [1](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md) |
| Xoá một dòng mất 4 giây | [4](phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md) |
| Redis ăn RAM gấp nhiều lần dữ liệu thật | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| Index phình mãi, không biết có nên `REINDEX` | [11](phase-2-bo-may-ngam-cua-postgres/04-chieu-cao-index-va-con-so-postgres-khong-dung.md) |

## Ba chỗ khoá này đính chính so với tài liệu trôi nổi

Vì mọi số liệu đều được tra lại từ nguồn gốc, có ba chỗ mà bản tóm tắt phổ biến ghi sai:

| Chỗ sai thường gặp | Sự thật | Bài |
|---|---|---|
| *"`OBJECT ENCODING` đo bộ nhớ và lấy mẫu 5 phần tử"* | `OBJECT ENCODING` trả về **tên cách lưu**, không trả byte. Lệnh trả byte và lấy mẫu là **`MEMORY USAGE ... SAMPLES n`** | [15](phase-3-tai-nguyen-va-vong-doi/03-redis-100gb-xuong-60gb.md) |
| Vụ BMC 2019: *"thời gian chạy từ 3.497 ms lên 5.544.701 ms"* | Con số đúng là **3,497 ms → 5.544,701 ms** (chậm ~1.586 lần, không phải triệu lần) | [8](phase-2-bo-may-ngam-cua-postgres/01-ke-hoach-dung-chung-va-bay-dieu-kien-or.md) |
| *"Postgres không tự tạo index cho khoá ngoại"* — nói chung chung cho mọi hệ | Đúng với **PostgreSQL**, nhưng **MySQL/InnoDB tự tạo**. Trả lời thiếu vế này là mất điểm | [4](phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md) |

## Khoá liên quan trong workspace

| Khoá | Khi nào đọc |
|---|---|
| [`sql-interview/`](../sql-interview/README.md) | Nền tảng SQL và **mô hình bốn tầng của câu hỏi phỏng vấn** — nên đọc trước Phần I |
| [`backend-scaling-cases/`](../backend-scaling-cases/README.md) | 50 ca sự cố về tải, khoá, sập dây chuyền — bổ sung góc nhìn vận hành |
| [`orm-n-plus-1/`](../orm-n-plus-1/README.md) | N+1, ORM trong production, và kiến trúc truy cập dữ liệu |
| [`banking-fintech-domain/`](../banking-fintech-domain/README.md) | Sổ cái, idempotency, đối soát — đào sâu Bài 7 |
| [`con-so-ma-thuat/`](../con-so-ma-thuat/README.md) | Vì sao những con số kỳ lạ (32 bit, 1500 byte) lại quyết định hệ thống của bạn |
| [`redis/`](../redis/README.md) | Redis từ đầu — nền cho Bài 15 |

**Từ điển thuật ngữ toàn khoá** → [TU-DIEN-THUAT-NGU.md](TU-DIEN-THUAT-NGU.md)

**Bắt đầu** → [Bài 1: "Cập nhật xong rồi, cache xoá lúc nào?"](phase-1-cau-hoi-co-tang-duoi/01-cap-nhat-xong-xoa-cache-luc-nao.md)
