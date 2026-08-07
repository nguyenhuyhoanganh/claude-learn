# Bài 4: Consistency — hai loại nhất quán mà ai cũng nhầm thành một

Mở một bức ảnh trên mạng xã hội, thấy ghi **5 lượt thích**. Bấm vào xem danh sách người thích — chỉ có **2 người**.

Không ai hack. Không có bug logic. Chỉ là ở đâu đó, một transaction đã chết giữa chừng, hoặc một lượt thích được xoá mà quên trừ bộ đếm. Con số 5 đó bây giờ là **sai vĩnh viễn**, và sẽ sai mãi cho tới khi có người viết một job đi sửa.

Bây giờ tình huống thứ hai. Bạn bấm "Lưu" trên một biểu mẫu. Trang tự tải lại. Dữ liệu vừa lưu **không có ở đó**. Bạn F5 lần nữa — nó hiện ra.

Cả hai đều được gọi là "không nhất quán". Nhưng chúng là **hai loại bệnh hoàn toàn khác nhau**, chữa bằng hai cách khác nhau, và chỉ một trong hai tự khỏi. Nhầm lẫn giữa chúng là nguồn gốc của rất nhiều quyết định kiến trúc sai.

## Hai loại nhất quán

```text
   ┌────────────────────────────────────────────────────────────────────┐
   │  LOẠI 1 — NHẤT QUÁN TRONG DỮ LIỆU  (consistency in data)           │
   │                                                                    │
   │  Dữ liệu đang nằm trên đĩa có thoả các quy tắc mình đặt ra không?  │
   │                                                                    │
   │  Phạm vi  : MỘT database instance                                  │
   │  Ai định  : bạn — người thiết kế mô hình dữ liệu                   │
   │  Bảo vệ   : ràng buộc (khoá ngoại, CHECK, UNIQUE) + Atomicity + Isolation │
   │  Nếu hỏng : HỎNG VĨNH VIỄN. Không tự khỏi. Phải sửa bằng tay.      │
   │  Ví dụ    : bộ đếm like = 5 nhưng bảng likes chỉ có 2 dòng         │
   └────────────────────────────────────────────────────────────────────┘

   ┌────────────────────────────────────────────────────────────────────┐
   │  LOẠI 2 — NHẤT QUÁN TRONG ĐỌC  (consistency in read)               │
   │                                                                    │
   │  Ghi xong rồi đọc ngay, có thấy giá trị vừa ghi không?             │
   │                                                                    │
   │  Phạm vi  : CẢ HỆ THỐNG — nhiều máy, nhiều replica, nhiều shard    │
   │  Ai định  : kiến trúc triển khai                                   │
   │  Bảo vệ   : replication đồng bộ, định tuyến đọc, quorum            │
   │  Nếu hỏng : TỰ KHỎI sau vài mili-giây tới vài giây                 │
   │  Ví dụ    : lưu xong tải lại không thấy, F5 lần nữa thì thấy       │
   └────────────────────────────────────────────────────────────────────┘
```

Ghi nhớ một câu duy nhất từ bài này thì nên là câu này:

> **Loại 2 tự khỏi. Loại 1 thì không.**
>
> Cụm "eventual consistency" (nhất quán cuối cùng) chỉ áp dụng cho **loại 2**. Dữ liệu đã hỏng ở loại 1 sẽ không "eventual" thành đúng được — nó nằm đó sai mãi mãi.

---

## Phần I — Nhất quán trong dữ liệu

### Ai định nghĩa "đúng"?

Database không tự biết dữ liệu thế nào là đúng. Nó không hiểu "lượt thích" hay "số dư" nghĩa là gì. **Bạn** phải nói cho nó biết, bằng các quy tắc.

Chữ **C** trong ACID vì thế có một vị trí đặc biệt: nó không phải một cơ chế mà database tự có, nó là **lời hứa rằng database sẽ giữ đúng những quy tắc bạn khai báo**.

```text
   BẠN KHAI BÁO QUY TẮC                DATABASE HỨA GIỮ ĐÚNG
   ────────────────────────            ──────────────────────────
   PRIMARY KEY (id)          ────▶     không có hai dòng cùng id
   FOREIGN KEY (user_id)     ────▶     không có like trỏ tới user không tồn tại
   CHECK (balance >= 0)      ────▶     không có số dư âm
   UNIQUE (email)            ────▶     không có hai tài khoản cùng email
   NOT NULL                  ────▶     ô này không bao giờ rỗng

   Quy tắc BẠN KHÔNG khai báo → database KHÔNG giữ giúp.
   Ví dụ: "like_count phải bằng số dòng trong bảng likes"
          → không có cú pháp nào khai báo được điều này
          → bạn phải tự bảo vệ
```

Dòng cuối cùng là chỗ phần lớn sự cố loại 1 sinh ra.

### Ví dụ mổ xẻ: bộ đếm lượt thích

Mô hình dữ liệu kiểu mạng xã hội, rút gọn tối đa:

```sql
CREATE TABLE pictures (
    id         INT PRIMARY KEY,
    blob_url   TEXT,
    like_count INT NOT NULL DEFAULT 0     -- ← cột PHI CHUẨN HOÁ
);

CREATE TABLE likes (
    user_name  TEXT,
    picture_id INT,
    PRIMARY KEY (user_name, picture_id)
);
```

Dữ liệu thực tế trong một hệ đã hỏng:

```text
   BẢNG pictures                        BẢNG likes
   ┌────┬──────────┬────────────┐      ┌───────────┬────────────┐
   │ id │ blob_url │ like_count │      │ user_name │ picture_id │
   ├────┼──────────┼────────────┤      ├───────────┼────────────┤
   │ 1  │ /p1.jpg  │     5      │ ⚠    │ John      │     1      │
   │ 2  │ /p2.jpg  │     1      │      │ Edmund    │     1      │
   │ 3  │ /p3.jpg  │     0      │      │ John      │     2      │
   └────┴──────────┴────────────┘      │ Edmund    │     4      │ ⚠
                                        └───────────┴────────────┘
```

Hai lỗi trong hình, và chúng là **hai loại lỗi khác nhau**:

**Lỗi A — bộ đếm lệch.** Ảnh 1 ghi `like_count = 5`, nhưng đếm trong bảng `likes` chỉ ra 2.

```sql
SELECT COUNT(*) FROM likes WHERE picture_id = 1;   -- → 2, không phải 5
```

**Lỗi B — bản ghi mồ côi.** Có dòng `(Edmund, 4)` nhưng bảng `pictures` không có ảnh nào `id = 4`. Ai đó đã xoá ảnh mà quên xoá các lượt thích của nó. Bây giờ có một lượt thích **trỏ vào hư không**.

### Ba nguồn sinh ra lỗi loại 1

```text
   NGUỒN 1 — THIẾU ATOMICITY
   ─────────────────────────
   UPDATE pictures SET like_count = like_count + 1 WHERE id = 1;   ✔
        ⚡ chết ở đây
   INSERT INTO likes VALUES ('John', 1);                            ✘ không chạy
   → bộ đếm tăng nhưng không có dòng like tương ứng

   NGUỒN 2 — THIẾU ISOLATION
   ─────────────────────────
   A: đọc like_count = 5 ─┐
   B: đọc like_count = 5 ─┤ cả hai cùng đọc 5
   A: ghi 6              ─┤
   B: ghi 6              ─┘ → hai lượt thích, bộ đếm chỉ tăng 1
   → chính là LOST UPDATE ở bài 3

   NGUỒN 3 — THIẾU RÀNG BUỘC
   ─────────────────────────
   DELETE FROM pictures WHERE id = 4;
   -- không có FOREIGN KEY, không có ON DELETE CASCADE
   → các dòng likes của ảnh 4 vẫn nằm đó, trỏ vào hư không
```

Ba nguồn này giải thích vì sao [bài 1](01-acid-va-transaction.md) nói **C là hệ quả của A và I**. Không có A thì dữ liệu nửa vời; không có I thì cập nhật giẫm lên nhau; cả hai đều đổ ra thành dữ liệu không nhất quán.

### Chữa nguồn 3: để database tự giữ tham chiếu

```sql
CREATE TABLE likes (
    user_name  TEXT,
    picture_id INT REFERENCES pictures(id) ON DELETE CASCADE,
    PRIMARY KEY (user_name, picture_id)
);
```

Thử vi phạm:

```sql
INSERT INTO likes VALUES ('Edmund', 4);
```

```text
ERROR:  insert or update on table "likes" violates foreign key constraint
        "likes_picture_id_fkey"
DETAIL:  Key (picture_id)=(4) is not present in table "pictures".
```

Database **từ chối** tạo ra dữ liệu mồ côi. Và với `ON DELETE CASCADE`, xoá ảnh sẽ tự xoá luôn các lượt thích:

```sql
DELETE FROM pictures WHERE id = 2;
SELECT * FROM likes WHERE picture_id = 2;
```

```text
(0 rows)     ← tự dọn theo
```

> **Lưu ý cho người đến từ NoSQL:** nhiều người nghĩ "chúng tôi dùng MongoDB nên không có khoá ngoại, không dính vấn đề này". Ngược lại hoàn toàn. Chỉ cần một document tham chiếu tới document khác là **đã có tham chiếu**, và đã có tham chiếu thì phải có toàn vẹn tham chiếu. Khác biệt duy nhất là: hệ quan hệ giữ giúp bạn, còn hệ tài liệu bắt **bạn** tự giữ ở tầng ứng dụng. Bài toán không biến mất, nó chỉ đổi chỗ.

### Chữa nguồn 1 và 2: bọc trong một transaction

```sql
BEGIN;
  INSERT INTO likes VALUES ('John', 1);
  UPDATE pictures SET like_count = like_count + 1 WHERE id = 1;
COMMIT;
```

Chú ý dùng `like_count + 1` chứ không phải đọc ra rồi ghi lại — chống lost update như [bài 3](03-isolation-va-read-phenomena.md) đã phân tích.

Chắc chắn hơn nữa thì để database tự làm bằng trigger, để không lập trình viên nào quên được:

```sql
CREATE FUNCTION cap_nhat_bo_dem() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE pictures SET like_count = like_count + 1 WHERE id = NEW.picture_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE pictures SET like_count = like_count - 1 WHERE id = OLD.picture_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dem_like
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION cap_nhat_bo_dem();
```

Đánh đổi phải biết trước khi dùng trigger:

| Ưu | Nhược |
|---|---|
| Không lập trình viên nào quên được | Logic ẩn — đọc code ứng dụng không thấy nó tồn tại |
| Chạy trong cùng transaction, đảm bảo nguyên tử | Mọi `INSERT` vào `likes` phải khoá dòng `pictures` → điểm nóng nếu ảnh viral |
| Không phụ thuộc ngôn ngữ ứng dụng | Khó gỡ lỗi, khó kiểm thử |

### Vì sao cột `like_count` tồn tại — và vì sao nó nguy hiểm

Câu hỏi hiển nhiên: nếu cột đó dễ sai đến vậy, sao không bỏ đi mà đếm trực tiếp?

```sql
SELECT COUNT(*) FROM likes WHERE picture_id = 1;
```

Vì với một bức ảnh có **1,8 triệu** lượt thích, câu lệnh đó phải đọc 1,8 triệu dòng. Mỗi lần có ai mở ảnh. Trên một trang có 20 ảnh thì thành 20 câu như vậy.

```text
   ĐẾM TRỰC TIẾP                       DÙNG CỘT ĐẾM SẴN
   ═════════════                       ══════════════════
   COUNT(*) trên 1,8 triệu dòng        đọc 1 số nguyên
   ≈ 200-800 ms                        ≈ 0,05 ms
   × 20 ảnh mỗi trang                  × 20 ảnh mỗi trang
   = 4-16 GIÂY mỗi lần tải trang       = 1 ms

   → Không dùng được.                  → Dùng được.
```

Đây gọi là **phi chuẩn hoá** (*denormalization*): cố tình lưu dữ liệu thừa để đọc nhanh. Và cái giá của nó **luôn luôn** là:

> Bạn vừa tạo ra một quy tắc mà database **không tự giữ giúp**, nên bạn phải tự giữ. Và mỗi chỗ tự giữ là một chỗ có thể sai.

Điều đáng nói: với bộ đếm lượt thích, người ta **chấp nhận** sai. Không ai ngồi đếm tay 1,8 triệu lượt thích để bắt lỗi. Đó là một quyết định kinh doanh hợp lý.

Nhưng nếu cột đó là **số dư tài khoản** thì hoàn toàn khác. Đây là ranh giới cần phân biệt rõ:

| Loại dữ liệu | Chấp nhận lệch? | Cách bảo vệ |
|---|---|---|
| Lượt thích, lượt xem, lượt chia sẻ | Có | Đối soát định kỳ là đủ |
| Tồn kho | Không (bán quá số lượng) | Transaction + khoá |
| Số dư tài khoản | **Tuyệt đối không** | Sổ cái chỉ ghi thêm, không có cột tổng đáng tin |
| Điểm thưởng | Không | Transaction + đối soát |

### Job đối soát — lưới an toàn cuối cùng

Vì phi chuẩn hoá luôn có khả năng lệch, hệ nghiêm túc nào cũng có một job chạy nền so lại:

```sql
SELECT p.id,
       p.like_count            AS so_ghi_trong_bang,
       COUNT(l.user_name)      AS so_dem_that,
       p.like_count - COUNT(l.user_name) AS chenh_lech
FROM pictures p
LEFT JOIN likes l ON l.picture_id = p.id
GROUP BY p.id, p.like_count
HAVING p.like_count <> COUNT(l.user_name);
```

```text
 id | so_ghi_trong_bang | so_dem_that | chenh_lech
----+-------------------+-------------+------------
  1 |                 5 |           2 |          3
```

Hai lời khuyên khi viết job kiểu này:

1. **Chạy đối soát trước, sửa sau.** Chạy vài ngày ở chế độ chỉ báo cáo để biết mức lệch bình thường là bao nhiêu. Nếu lệch tăng đột biến, gốc rễ nằm ở chỗ khác và sửa số chỉ là che triệu chứng.
2. **Đặt phanh.** Nếu số dòng lệch vượt ngưỡng (ví dụ 1% tổng số), dừng lại và báo động thay vì sửa hàng loạt — vì rất có thể chính job đối soát mới là cái sai.

---

## Phần II — Nhất quán trong đọc

### Vấn đề sinh ra từ đâu

Loại 1 là chuyện bên trong một database. Loại 2 chỉ xuất hiện khi có **nhiều bản sao dữ liệu**, và điều đó gần như luôn xảy ra khi hệ thống lớn lên.

```text
                     ┌──────────────┐
        GHI ────────▶│  PRIMARY     │
                     │  (nhận ghi)  │
                     └──────┬───────┘
                            │ nhân bản (bất đồng bộ, trễ 5-500 ms)
                 ┌──────────┼──────────┐
                 ▼          ▼          ▼
           ┌─────────┐┌─────────┐┌─────────┐
           │REPLICA 1││REPLICA 2││REPLICA 3│
           └────┬────┘└────┬────┘└────┬────┘
                └──────────┴──────────┘
                           ▲
                         ĐỌC
```

Kiến trúc này rất hợp lý: đọc thường nhiều gấp 10-100 lần ghi, nên tách ra là cách rẻ nhất để chịu tải. Nhưng nó đẻ ra một khe hở thời gian:

```text
   t=0 ms    Người dùng bấm "Lưu"
             → UPDATE profile SET bio='Xin chao' → PRIMARY   ✔ commit
   t=2 ms    Ứng dụng trả về "Đã lưu!"
   t=5 ms    Trình duyệt tải lại trang
             → SELECT bio FROM profile → REPLICA 2
   t=6 ms    REPLICA 2 trả về bio CŨ      ⚠
             (bản ghi mới chưa nhân bản tới, còn 40 ms nữa)
   t=46 ms   REPLICA 2 nhận được thay đổi
   t=???     Người dùng F5 → bây giờ mới thấy
```

Trải nghiệm của người dùng: *"Tôi bấm Lưu, nó bảo lưu rồi, mà nó không lưu."* Họ sẽ bấm Lưu lại lần nữa. Rồi lần nữa. Nếu nghiệp vụ là "tạo đơn hàng" thì bạn vừa có ba đơn hàng trùng.

Đây gọi là bài toán **read-your-own-writes** (đọc được cái mình vừa ghi) — trường hợp riêng quan trọng nhất của nhất quán trong đọc.

### Bốn cách chữa, từ rẻ tới đắt

| Cách | Làm gì | Ưu | Nhược |
|---|---|---|---|
| **1. Đọc từ primary sau khi ghi** | Trong N giây sau một lệnh ghi, mọi lệnh đọc của **người đó** đi thẳng vào primary | Đơn giản, hiệu quả ngay | Primary gánh thêm tải; phải theo dõi "ai vừa ghi" |
| **2. Dính phiên** (*sticky session*) | Một người dùng luôn đọc từ cùng một replica | Dễ triển khai ở tầng cân bằng tải | Replica đó chết là mất; vẫn trễ so với primary |
| **3. Đọc theo phiên bản** | Ghi xong lưu lại vị trí WAL (LSN); khi đọc, bắt replica chờ tới vị trí đó | Chính xác nhất | Phức tạp; ứng dụng phải mang theo LSN |
| **4. Nhân bản đồng bộ** | Primary chờ replica xác nhận rồi mới báo commit | Không bao giờ đọc phải dữ liệu cũ | Mỗi lần ghi cộng thêm một vòng mạng; replica chết thì ghi bị chặn |

Trong thực tế, cách 1 giải quyết 90% trường hợp với 10% công sức. Cách 4 dành cho dữ liệu tiền bạc.

PostgreSQL hỗ trợ cách 4 ở mức từng transaction:

```sql
SET synchronous_commit = remote_apply;
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;
COMMIT;   -- chỉ trả về khi replica đã ÁP DỤNG xong thay đổi
```

Nghĩa là bạn có thể để chuyển tiền chạy đồng bộ còn cập nhật ảnh đại diện chạy bất đồng bộ, trong cùng một hệ. Chi tiết ở [phase-9](../phase-9/01-database-replication-la-gi.md).

### Eventual consistency — thuật ngữ bị lạm dụng nhất

**Eventual consistency** (nhất quán cuối cùng): *nếu ngừng ghi mới, thì sau một khoảng thời gian hữu hạn, mọi bản sao sẽ hội tụ về cùng một giá trị.*

Đọc kỹ định nghĩa sẽ thấy nó hứa **rất ít**:

```text
   NÓ HỨA                              NÓ KHÔNG HỨA
   ──────────                          ──────────────
   Cuối cùng sẽ giống nhau             Bao lâu — "cuối cùng" có thể là 1s hoặc 1 giờ
                                       Thứ tự — bạn có thể thấy giá trị nhảy lung tung
                                       Bạn thấy được cái bạn vừa ghi
                                       Dữ liệu hỏng sẽ được sửa
```

Dòng cuối cùng là điểm quan trọng nhất và hay bị bỏ qua nhất:

> **Eventual consistency chỉ áp dụng cho loại 2 (nhất quán trong đọc).**
>
> Nếu `like_count = 5` mà bảng `likes` chỉ có 2 dòng, thì **không có "eventual" nào** cả. Dữ liệu đó sẽ sai vĩnh viễn, trừ khi có một job đối soát đi sửa. Đó là **hỏng dữ liệu**, không phải trễ đồng bộ.

Trên thang từ mạnh tới yếu, "eventual" nằm ở đáy:

```text
   MẠNH ────────────────────────────────────────────────────▶ YẾU

   Strong          Read-your-        Monotonic         Eventual
   consistency     writes            reads             consistency
   ───────────     ──────────        ─────────         ────────────
   Mọi người       Mình luôn         Đã thấy giá trị   Cuối cùng sẽ
   luôn thấy       thấy được         mới rồi thì       giống nhau.
   giá trị mới     cái mình          không bị lùi      Không hứa gì
   nhất.           vừa ghi.          về giá trị cũ.    thêm.

   Đắt nhất                                            Rẻ nhất
   (chờ đồng bộ)                                       (không chờ ai)
```

Ba mức ở giữa ít được nhắc nhưng rất hữu dụng — đặc biệt **monotonic reads** (đọc đơn điệu). Không có nó, người dùng có thể gặp cảnh: F5 thấy dữ liệu mới, F5 lần nữa thấy dữ liệu cũ trở lại (vì lần này rơi vào replica khác, trễ hơn). Trải nghiệm này còn khó chịu hơn cả việc luôn thấy dữ liệu cũ.

### Cả SQL lẫn NoSQL đều dính cả hai loại

Một hiểu lầm phổ biến: "hệ quan hệ thì nhất quán mạnh, NoSQL thì eventual".

Sai ở cả hai vế:

```text
   POSTGRESQL VỚI REPLICA ĐỌC            MONGODB VỚI writeConcern: majority
   ══════════════════════════            ═══════════════════════════════════
   → Nhất quán trong đọc chỉ ở mức       → Nhất quán mạnh hơn nhiều
     EVENTUAL nếu đọc từ replica           một Postgres có replica bất đồng bộ

   → Vẫn dính LOẠI 1 nếu bạn phi         → Vẫn dính LOẠI 1 y hệt: document
     chuẩn hoá mà không bảo vệ             tham chiếu tới document đã bị xoá
```

Kết luận đúng: **mức nhất quán là thuộc tính của cách bạn cấu hình và triển khai, không phải nhãn dán trên tên sản phẩm.**

Chủ đề này nối thẳng sang định lý CAP — vì sao khi mạng bị chia cắt thì buộc phải chọn giữa nhất quán và khả dụng. Chi tiết ở [phase-13 bài 3](../phase-13/03-redis-va-cap-theorem.md).

---

## Bảng chẩn đoán: gặp triệu chứng thì đó là loại nào

| Triệu chứng | Loại | Có tự khỏi? | Hướng xử lý |
|---|---|---|---|
| Bộ đếm không khớp bảng chi tiết | 1 | Không | Job đối soát + transaction/trigger |
| Bản ghi trỏ tới bản ghi đã bị xoá | 1 | Không | Khoá ngoại + `ON DELETE CASCADE` |
| Số dư âm dù code có kiểm tra | 1 | Không | Ràng buộc `CHECK` + khoá dòng |
| Vừa lưu, tải lại không thấy, F5 thì thấy | 2 | Có | Đọc từ primary sau khi ghi |
| F5 thấy mới, F5 nữa thấy cũ | 2 | Có | Dính phiên hoặc monotonic reads |
| Hai máy chủ trả hai kết quả khác nhau | 2 | Có | Kiểm tra độ trễ nhân bản |
| Báo cáo có tổng không khớp chi tiết | **Không phải cả hai** | — | Đây là isolation, xem [bài 3](03-isolation-va-read-phenomena.md) |

Dòng cuối rất đáng chú ý: triệu chứng "tổng không khớp chi tiết" có thể đến từ **ba** nguyên nhân khác nhau — hỏng dữ liệu (loại 1), đọc từ replica trễ (loại 2), hoặc thiếu isolation (bài 3). Phân biệt bằng cách chạy lại: nếu chạy lại vẫn sai y hệt thì là loại 1; nếu chạy lại thì đúng thì là loại 2 hoặc isolation.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Nghĩ "eventual consistency" sẽ tự sửa dữ liệu hỏng | Nó chỉ nói về **độ trễ nhân bản**, không nói gì về tính đúng đắn của dữ liệu | Phân biệt rõ hai loại; loại 1 phải có job đối soát |
| Bỏ khoá ngoại "cho nhanh" | Tăng tốc ghi vài phần trăm, đổi lấy dữ liệu mồ côi không phát hiện được | Giữ khoá ngoại; nếu thật sự nghẽn thì đo trước, xem [phase-17 bài 5](../phase-17/05-indexing-postgres-vs-mysql.md) |
| Phi chuẩn hoá mà không có job đối soát | Lệch tích tụ âm thầm hàng tháng, tới lúc phát hiện thì không dựng lại được | Mỗi cột phi chuẩn hoá phải đi kèm một truy vấn đối soát |
| Cho toàn bộ lệnh đọc đi vào replica | Người dùng không thấy được cái mình vừa ghi | Định tuyến đọc-sau-ghi về primary trong vài giây |
| Dùng `COUNT(*)` cho bộ đếm hiển thị ở trang nóng | Chậm tuyến tính theo số dòng | Cột phi chuẩn hoá + đối soát, hoặc bộ đếm xấp xỉ |
| Coi số dư tài khoản như bộ đếm lượt thích | Lượt thích lệch thì không sao, tiền lệch là mất tiền | Dùng sổ cái chỉ ghi thêm, tính số dư từ sổ cái |
| Nghĩ NoSQL không có vấn đề toàn vẹn tham chiếu | Tham chiếu vẫn tồn tại, chỉ là không ai giữ giúp | Tự kiểm tra ở tầng ứng dụng, và tự viết job đối soát |

## Tóm tắt bài 4

- Có **hai loại nhất quán** hoàn toàn khác nhau: **trong dữ liệu** (một database, hỏng là hỏng vĩnh viễn) và **trong đọc** (nhiều bản sao, tự khỏi sau vài mili-giây).
- **C trong ACID không phải một cơ chế riêng** — nó là lời hứa giữ đúng các quy tắc *bạn* khai báo, và nó là **hệ quả** của Atomicity + Isolation + ràng buộc.
- Quy tắc nào bạn **không khai báo được** (như "bộ đếm phải bằng số dòng") thì database **không giữ giúp** — đó là nơi phần lớn hỏng dữ liệu sinh ra.
- **Phi chuẩn hoá luôn có giá**: mỗi cột dữ liệu thừa là một quy tắc bạn phải tự giữ. Kèm theo nó **bắt buộc** phải có job đối soát.
- **Eventual consistency chỉ nói về loại 2.** Dữ liệu đã hỏng ở loại 1 không bao giờ "eventual" thành đúng.
- Bài toán **read-your-own-writes** giải được rẻ nhất bằng cách cho lệnh đọc đi vào primary trong vài giây sau khi ghi.
- **Mức nhất quán là thuộc tính của cấu hình và triển khai**, không phải nhãn dán trên tên sản phẩm — SQL cũng eventual được, NoSQL cũng mạnh được.

**Bài kế tiếp** → [Bài 5: ACID thực hành với PostgreSQL](05-acid-thuc-hanh-voi-postgres.md)
