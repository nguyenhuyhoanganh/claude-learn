# Bài 2: Mười hai câu hỏi ngắn và đáp án 30 giây

Bài trước dạy **mô hình bốn tầng**. Bài này áp dụng nó vào 12 câu hỏi ngắn nhất — loại câu mà người phỏng vấn hỏi rồi ngồi im chờ.

Cách dùng bài này:

1. Đọc câu hỏi. **Dừng lại. Tự trả lời trong đầu 3 giây.**
2. Đọc phần "Ứng viên dừng ở đây" — nếu đó là câu bạn vừa nghĩ, bạn đang ở tầng 1.
3. Đọc **bản 30 giây**, học thuộc cấu trúc chứ đừng học thuộc chữ.

Mỗi bản mẫu đều có: **một con số**, **một đánh đổi có hai vế**, và **một quy trình hoặc ngưỡng**.

---

## 1. Index có làm chậm INSERT không?

**Ứng viên dừng ở đây:** *"Có, vì phải cập nhật thêm cây index."*

**Bản 30 giây:**
> Có — mỗi index thêm khoảng 10% thời gian ghi một dòng, em đo bằng cách chèn 100.000 dòng vào bảng có và không có index rồi lấy hiệu. Con số phình lên nhiều lần nếu khoá là chuỗi ngẫu nhiên vì mỗi dòng rơi vào một trang khác nhau. Đổi lại tra cứu nhanh hơn khoảng 140 lần trên bảng một triệu dòng — bảng đọc nhiều hơn ghi thì quá hời, còn bảng ghi nhật ký gần như không ai đọc thì mỗi index chỉ là tiền mất. Bảng ghi 5.000 dòng/giây thì em không đoán: mở `pg_stat_user_indexes` xem cái nào `idx_scan = 0` thì bỏ, và bỏ luôn index đơn nào đã là tiền tố của index gộp khác. Dưới 5 index cứ đánh, trên 10 thì phải đo.

*Chi tiết → [phase-3 bài 1](../phase-3/01-index-hoat-dong-the-nao-va-viet-query-dung-index.md)*

---

## 2. Transaction là gì?

**Ứng viên dừng ở đây:** *"Một nhóm lệnh, hoặc xong hết hoặc huỷ hết."*

**Bản 30 giây:**
> Đúng là một nhóm lệnh nguyên tử. Nhưng khi viết code em quan tâm hai thứ khác, vì chính chúng làm sập hệ thống chứ không phải cái định nghĩa. Một: nó **khoá những dòng nó vừa sửa và giữ tới tận lúc `COMMIT`**, không phải nhả khi câu lệnh chạy xong — nên thứ phải canh là khoảng cách từ `BEGIN` tới `COMMIT`, không phải thời gian câu lệnh. Hai: nó **giữ một kết nối trong pool** suốt thời gian đó, nên một transaction chờ API bên ngoài 30 giây có thể làm cạn pool và treo cả những trang không liên quan. Vì vậy em mở transaction sát lúc ghi, đóng ngay, và **không bao giờ gọi mạng ở giữa**. Còn mức isolation thì em kiểm mặc định của đúng hệ đang dùng — MySQL là `REPEATABLE READ`, Postgres là `READ COMMITTED`, cùng một đoạn code cho hai kết quả khác nhau.

*Chi tiết → [phase-4 bài 3](../phase-4/03-transaction-isolation-va-khoa-trong-phong-van.md), [phase-7 bài 6](../phase-7/06-connection-pool-job-queue-va-transaction-dai.md)*

---

## 3. Phân trang `LIMIT`/`OFFSET` có vấn đề gì?

**Ứng viên dừng ở đây:** *"Không có vấn đề gì, trang sau thì offset lớn hơn."*

**Bản 30 giây:**
> Trên bảng vài trăm dòng thì `OFFSET` là lựa chọn đúng, đừng đổi lấy thứ phức tạp hơn. Vấn đề là **`OFFSET` không nhảy, nó đếm**: muốn tới dòng thứ 100.000, database phải đọc đủ 100.000 dòng trước đó rồi vứt đi. Đo thật: trang 1 mất 20 ms, trang 5.000 mất 480 ms — gấp 240 lần, và bảng càng lớn càng xấu. Nhưng chậm thì người dùng còn chờ được; thứ giết người là **dữ liệu sai**: có người chèn dòng mới vào đầu danh sách thì mọi dòng phía dưới tụt xuống một bậc, dòng cuối trang 1 nhảy sang trang 2 và người dùng thấy nó hai lần — hoặc job quét 500 trang xử lý trùng và bỏ sót, mà không nhật ký nào báo. Em đổi sang **con trỏ (keyset)**: thay vì bỏ qua N dòng, nói "cho tôi 20 dòng đứng sau mốc này" — máy nhảy thẳng vào index, trang 5.000 cũng 20 ms. Cái giá là mất nút nhảy tới trang bất kỳ, chỉ còn tiếp và lùi. Nên ngưỡng: danh sách cuộn vô hạn dùng con trỏ, bảng quản trị cần nhảy trang thì `OFFSET` vẫn ổn nếu giới hạn độ sâu.

*Chi tiết → [phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md)*

---

## 4. `EXISTS` hay `IN`, chọn cái nào?

**Ứng viên dừng ở đây:** *"`EXISTS` nhanh hơn vì nó dừng ở dòng đầu tiên tìm được."*

**Bản 30 giây:**
> Trên Postgres, SQL Server, Oracle và MySQL từ bản 8, hai bên **cân bằng** — bộ tối ưu viết lại cả hai thành cùng một phép **semi-join**. Em từng mở `EXPLAIN` so hai câu trên bảng một triệu dòng: hai kế hoạch giống hệt nhau, 118 ms so với 121 ms, chạy lại thì con số đảo chiều — 3% đó là nhiễu, không phải tốc độ. Nhưng có **một chỗ chúng khác nhau về đúng-sai, không phải nhanh-chậm**: `NOT IN` mà danh sách con chứa một dòng `NULL` thì kết quả **luôn rỗng**, không lỗi, không cảnh báo — `NOT EXISTS` không dính vì nó chỉ hỏi có tồn tại hay không, không đi so bằng. Và có ba chỗ bộ tối ưu bó tay nên hai bên tách hẳn: danh sách trong `IN` là hằng số hàng chục nghìn giá trị dán tay, câu con có `LIMIT`/`ORDER BY`/hàm không đoán trước được, và cột nối không có index. Nên quy tắc của em không phải chọn từ khoá, mà là **đo, đừng đoán** — mở `EXPLAIN` ra trước khi tranh luận.

*Chi tiết → [phase-2 bài 1](../phase-2/01-subquery-toan-tap.md), [phase-2 bài 3](../phase-2/03-union-intersect-except-va-logic-3-tri.md)*

---

## 5. Soft delete hay xoá thật?

**Ứng viên dừng ở đây:** *"Soft delete, để còn khôi phục được."*

**Bản 30 giây:**
> Em tách làm hai loại. **Đơn hàng và chứng từ thì không xoá** — Luật Kế toán bắt giữ 10 năm, xoá thật là vi phạm. **Dữ liệu cá nhân thì phải có đường xoá thật**, chậm nhất 72 giờ theo Nghị định 13. Soft delete em chỉ dùng làm **thùng rác 30 ngày có job dọn**, không phải kho giữ mãi mãi vì không ai dám xoá. Điều kiện "chưa xoá" em đẩy xuống một lớp bên dưới bằng view hoặc row-level security khi có trên 10 chỗ đọc — không tin vào trí nhớ. Ràng buộc duy nhất chỉ đánh trên dòng còn sống bằng partial index, vì `UNIQUE(email, deleted_at)` không cứu được — hai `NULL` được coi là khác nhau nên hai tài khoản sống vẫn chung một email. Và **khôi phục là một lời hứa nên em có kiểm tra nó thật**: email có thể đã bị người khác lấy, bản ghi con đã cascade, subscription ở cổng thanh toán đã huỷ.

*Chi tiết → [phase-6 bài 3](../phase-6/03-soft-delete-hay-xoa-that.md)*

---

## 6. UUID hay auto increment làm khoá chính?

**Ứng viên dừng ở đây:** *"UUID, vì nó không trùng và sinh ở đâu cũng được."*

**Bản 30 giây:**
> Em hỏi lại: **ID có cần sinh ở ngoài database không?** Nếu chỉ một dịch vụ ghi thì `BIGINT IDENTITY` — gọn nhất, ghi tuần tự, không có lý do phức tạp hoá cái đang chạy tốt. Nếu nhiều dịch vụ ghi song song thì UUID, nhưng cái đắt của UUID **không nằm ở đĩa** mà ở chỗ nó ghi ngẫu nhiên khắp cây B+Tree: gây page split, làm trang chỉ đầy nửa vời nên index phình 1,5–2 lần. Ngưỡng lật là **RAM chứ không phải dung lượng đĩa** — index còn nằm gọn trong bộ nhớ đệm thì đo mãi không ra khác biệt, vượt RAM thì thông lượng ghi tụt vài lần. Nên em dùng **UUID v7** — nó nhét mốc thời gian lên đầu nên sinh ở bốn nơi vẫn tự xếp đúng thứ tự và lại ghi vào trang cuối như auto increment. Cái giá của v7 là **lộ thời điểm tạo**, nên nếu phơi ra API công khai thì em dùng v7 làm khoá nội bộ và một cột `public_id` v4 riêng. Và luôn lưu dạng nhị phân, không lưu `VARCHAR(36)`.

*Chi tiết → [phase-5 bài 5](../phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md)*

---

## 7. Sao `LIKE '%abc%'` lại chậm?

**Ứng viên dừng ở đây:** *"Vì có dấu phần trăm ở đầu nên index không dùng được."*

**Bản 30 giây:**
> Đúng — index xếp theo **đầu chuỗi**, như từ điển sắp theo chữ cái, mà mất đầu thì mất luôn điểm neo để lật vào, nên database buộc phải đọc hết mọi dòng và dò từng chuỗi. Trên bảng 10 triệu dòng em đo được khoảng 2.400 ms, plan hiện `Seq Scan`. Nhưng **trước khi tối ưu em hỏi lại hai điều**: người dùng gõ đầu chuỗi hay giữa chuỗi, và bảng đó khoảng bao nhiêu dòng. Gõ đầu chuỗi thì chỉ cần bỏ dấu phần trăm phía trước là index dùng lại được ngay, gần như miễn phí. Giữa chuỗi thì đánh **trigram index** (`pg_trgm` GIN) — chịu index nặng hơn và ghi chậm hơn, đổi lại tìm chuỗi con dùng được index. Nếu là tìm theo **từ** thì dùng full-text `tsvector`. Còn trăm triệu dòng và cần xếp hạng liên quan thì tách hệ tìm kiếm riêng, đừng ép database quan hệ làm việc đó.

*Chi tiết → [phase-3 bài 3](../phase-3/03-muoi-lam-anti-pattern-lam-cham-query.md), [phase-5 bài 3](../phase-5/03-chuoi-varchar-text-va-do-dai-khoa-index.md)*

---

## 8. `SELECT *` có vấn đề gì không?

**Ứng viên dừng ở đây:** *"Lấy thừa cột, tốn băng thông."*

**Bản 30 giây:**
> Em hỏi lại trước: **chạy ở đâu, bao nhiêu lượt?** Chạy tay một lần thì không sao. Trong API thì có hai vấn đề, và chi phí **không tỷ lệ với số cột**. Thứ nhất, nó **phá index phủ** (covering index): nếu index đã chứa đủ ba cột em cần thì database đọc xong index là xong việc, thêm dấu sao thì mỗi dòng phải quay lại bảng lấy phần thiếu — em đo trên 10.000 dòng: 12 ms thành 380 ms, chậm 30 lần trong khi số cột chỉ tăng 4 lần. Thứ hai, và cái này quan trọng hơn: **dấu sao là chuyện hợp đồng dữ liệu**, không phải tốc độ. Nó nghĩa là "trả về mọi cột", tức kết quả đi theo lược đồ chứ không theo code — ai thêm cột `password_hash` vào bảng thì API tự nhả nó ra ngoài. Nên bảng nhỏ 6 cột toàn số em cũng vẫn liệt kê cột, vì em muốn biết chắc câu truy vấn của mình trả về cái gì.

*Chi tiết → [phase-3 bài 3](../phase-3/03-muoi-lam-anti-pattern-lam-cham-query.md)*

---

## 9. `VARCHAR(50)` hay `VARCHAR(255)`?

**Ứng viên dừng ở đây:** *"Nó là giới hạn số ký tự."*

**Bản 30 giây:**
> Trên đĩa gần như không khác — `VARCHAR` lưu theo **độ dài thật**, khai rộng chỉ thêm tối đa một byte tiền tố mỗi dòng, nên 10 triệu dòng tiết kiệm được khoảng 10 MB, bằng một tấm ảnh điện thoại. Khác biệt thật nằm ở **index**: index tính độ dài khoá theo **con số khai báo** nhân với số byte tối đa của một ký tự — utf8mb4 là 4 byte, nên `VARCHAR(255)` ăn 1.020 byte khoá, mà InnoDB row format cũ chỉ cho 767 byte. Đó chính là lý do Laravel từng phải hạ độ dài mặc định xuống 191, vì 767 chia 4 bằng 191. Row format `DYNAMIC` nới lên 3.072 byte nên ghép ba cột `VARCHAR(255)` là chạm trần. Nên nguyên tắc của em: cột **có index thì khai sát**, cột không index thì thoải mái. Và trong Postgres thì `TEXT` với `VARCHAR(n)` là cùng một kiểu, em dùng `TEXT` cộng `CHECK` vì nới `CHECK` không phải rewrite bảng như `ALTER TYPE`.

*Chi tiết → [phase-5 bài 3](../phase-5/03-chuoi-varchar-text-va-do-dai-khoa-index.md)*

---

## 10. Lưu thời gian thì lưu UTC hay giờ địa phương?

**Ứng viên dừng ở đây:** *"Lưu UTC hết cho chuẩn."*

**Bản 30 giây:**
> Em hỏi lại một câu trước: **mốc này là quá khứ hay tương lai?** Chuyện **đã xảy ra rồi** thì lưu UTC bằng `TIMESTAMPTZ`, vì đó là một thời điểm duy nhất trên đời. Nhưng **lịch hẹn tương lai thì không** — "9 giờ sáng thứ Hai tuần sau" là một *ý định*, không phải một thời điểm; mỗi năm vẫn có vài nước đổi luật giờ, và cuộc hẹn quy đổi cứng sang UTC sẽ tự dịch đi một tiếng. Cái đó em lưu giờ địa phương kèm **tên vùng IANA**, không lưu offset — offset đúng hôm nay, sai sáu tháng sau. Và một chỗ nữa hay làm lệch báo cáo: **gom nhóm theo ngày phải quy về múi giờ người xem trước rồi mới cắt ngày**. Việt Nam là UTC+7, nên gom thẳng trên UTC thì 7 tiếng đầu mỗi ngày — gần 30% số giờ — bị đếm sang ngày hôm trước, và không ai nhìn ra cho tới lúc kế toán hỏi.

*Chi tiết → [phase-5 bài 4](../phase-5/04-thoi-gian-utc-mui-gio-va-gom-nhom-theo-ngay.md)*

---

## 11. Mật khẩu lưu vào database thế nào?

**Ứng viên dừng ở đây:** *"Không lưu mật khẩu thô, lưu chuỗi băm."*

**Bản 30 giây:**
> Đúng, và còn ba tầng nữa. Hàm băm **không có trí nhớ** — hai người cùng mật khẩu ra hai ô giống hệt nhau, nên kẻ trộm không bẻ từng người mà đếm chuỗi nào lặp nhiều nhất: mười triệu tài khoản thì cứ trăm người có một người đặt `123456`, bẻ một chuỗi mở được trăm nghìn tài khoản. Chặn nó rẻ thôi: **mỗi người một chuỗi muối ngẫu nhiên riêng**, trộn vào trước khi băm, lưu ngay cạnh — muối không cần bí mật, mục đích của nó là làm mỗi mật khẩu thành một bài toán riêng. Nhưng muối chỉ chặn bẻ hàng loạt, **tốc độ mỗi lượt thử mới quyết định tất cả**: một card đồ hoạ chơi game thử được khoảng 10 tỷ chuỗi SHA-256 mỗi giây, nên mật khẩu 8 ký tự chữ và số bị dò cạn trong vài giờ. Nên phải dùng hàm **cố tình chậm** — Argon2id hoặc bcrypt — chỉnh chi phí tới khi một lần kiểm mất khoảng 0,2 giây, đưa tốc độ bẻ từ 10 tỷ xuống còn vài lượt mỗi giây. Và **đo lại sau một hai năm** vì phần cứng nhanh dần.

*Chi tiết → [phase-6 bài 4](../phase-6/04-sql-injection-va-luu-mat-khau-dung-cach.md)*

---

## 12. Session lưu ở đâu?

**Ứng viên dừng ở đây:** *"Lưu trong bộ nhớ máy chủ, mã phiên để trong cookie."*

**Bản 30 giây:**
> Đúng với một máy chủ. Nhưng hệ thống chạy **hai máy sau bộ cân tải** thì lưu trong bộ nhớ máy nghĩa là request rơi vào máy kia sẽ **không tìm thấy phiên** — khoảng một nửa số lượt gọi bị đá ra, và mỗi lần deploy là mất sạch phiên của mọi người. Nên em tách hai thứ: **mã phiên nằm trong cookie**, còn **dữ liệu phiên nằm ở kho chung** như Redis hoặc bảng database, để thêm bao nhiêu máy cũng không ảnh hưởng. Cookie phải có `HttpOnly`, `Secure`, `SameSite`. Và một chi tiết bảo mật hay bị quên: **đăng nhập xong phải huỷ mã cũ và cấp mã mới** — nếu không, kẻ tấn công đưa trước cho nạn nhân một mã phiên rồi chờ họ đăng nhập là chiếm được tài khoản, gọi là session fixation. Nếu chọn JWT thay session thì phải nói rõ cái giá: nó **không thu hồi được** trước khi hết hạn, nên đổi mật khẩu không đá được kẻ đang giữ token — muốn thu hồi thì lại phải có kho chung, tức là quay về điểm xuất phát.

*Chi tiết → [phase-7 bài 1](../phase-7/01-sql-vs-nosql-chon-dung-loai-database.md) (phần Redis), [phase-6 bài 4](../phase-6/04-sql-injection-va-luu-mat-khau-dung-cach.md)*

---

## Bảng tra nhanh: mỗi câu một con số

Học thuộc bảng này là đủ để không bao giờ trả lời "còn tuỳ".

| Câu hỏi | Con số neo | Ngưỡng lật |
|---|---|---|
| Index chậm INSERT? | ~10% mỗi index; đọc nhanh ~140× | <5 index cứ đánh, >10 phải đo |
| Transaction | Khoá giữ tới `COMMIT`, chiếm 1 kết nối | Không gọi mạng trong transaction |
| `OFFSET` | Trang 1: 20 ms → trang 5.000: 480 ms | Cuộn vô hạn → keyset; nhảy trang → `OFFSET` giới hạn độ sâu |
| `EXISTS` vs `IN` | Chênh 3% = nhiễu; cùng semi-join | Khác nhau khi có `NULL` hoặc optimizer bó tay |
| Soft delete | 72 giờ (NĐ 13) vs 10 năm (Luật KT) | >10 chỗ đọc → đẩy xuống view/RLS |
| UUID vs auto inc | Index phình 1,5–2×; ghi tụt 2–5× | Ngưỡng là **RAM**, không phải đĩa |
| `LIKE '%abc%'` | 2.400 ms trên 10 triệu dòng | Đầu chuỗi → bỏ `%`; giữa chuỗi → trigram |
| `SELECT *` | 12 ms → 380 ms (mất index phủ) | Chạy tay OK; trong API thì không |
| `VARCHAR(50/255)` | Đĩa: +1 byte/dòng. Index: 255×4 = 1.020 byte | Trần 767 / 3.072 byte |
| UTC hay local | UTC+7 → 30% số giờ bị đếm nhầm ngày | Quá khứ → UTC; tương lai → local + tên vùng |
| Mật khẩu | SHA-256: 10 tỷ lượt/giây trên 1 GPU | Chỉnh Argon2 tới 0,2 giây/lần kiểm |
| Session | 2 máy → ~50% request mất phiên | Nhiều máy → kho chung, bắt buộc |

## Ba câu chốt dùng được cho mọi câu hỏi

Khi bí, ba câu này luôn ghi điểm:

```text
① "Cho em hỏi lại: bảng đó khoảng bao nhiêu dòng, và tỷ lệ đọc/ghi thế nào?"
   → Nhận ra mình thiếu dữ kiện là điểm cao nhất trong bài.

② "Em chưa đo cái này trên hệ đang dùng. Em sẽ đo thế này: ..."
   → Câu này ĐƯỢC điểm. Đoán bừa mới mất điểm.

③ "Được X, mất Y, và ngưỡng lật là ở Z."
   → Thay cho "còn tuỳ" — câu của người chưa từng phải chọn.
```

## Tóm tắt bài 2

- Mười hai câu hỏi này chiếm phần lớn thời lượng vòng SQL — và **đáp án tầng 1 của cả 12 câu đều đúng mà vẫn trượt**.
- Mỗi bản 30 giây có đúng ba thành phần: **một con số**, **một đánh đổi hai vế**, **một quy trình hoặc ngưỡng**.
- Học **cấu trúc**, đừng học chữ. Con số của bạn phải là con số bạn tự đo trên hệ của bạn.
- Ba câu chốt luôn dùng được: **hỏi ngược khi thiếu dữ kiện**, **"em chưa đo, em sẽ đo thế này"**, và **"được X mất Y, ngưỡng ở Z"**.
- Câu trả lời sai không giết bạn. **Đoán bừa thì có.**

**Quay lại** → [Mục lục series](../README.md) · **Ôn tập** → [Checklist trước buổi phỏng vấn](../phase-4/05-checklist-on-tap-truoc-buoi-phong-van.md)
