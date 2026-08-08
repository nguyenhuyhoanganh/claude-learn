# Bài 5: ACID thực hành — nhìn thấy bốn chữ cái bằng mắt

Bốn bài trước là lý thuyết. Bài này là phòng thí nghiệm.

Bạn sẽ tự tay: giết một database đang giữa transaction rồi xem nó tự dọn dẹp; đo chính xác `fsync` trên máy mình mất bao nhiêu micro-giây; tái hiện đủ bốn hiện tượng đọc bất thường; và ép PostgreSQL ném ra lỗi `40001` — lỗi mà nếu bạn chưa từng thấy thì sẽ bối rối khi nó xuất hiện trên production lúc 2 giờ sáng.

Toàn bộ mất khoảng 40 phút. Gõ tay từng lệnh, đừng chỉ đọc — con số bạn tự chạy ra mới là con số bạn nhớ được.

## Dựng phòng thí nghiệm

```bash
docker run --name acid-lab \
  -e POSTGRES_PASSWORD=lab \
  -p 5440:5432 \
  -d postgres:16
```

Mở **ba** terminal. Hai terminal đầu là hai phiên psql chạy song song — ta sẽ gọi là **Phiên A** và **Phiên B**. Terminal thứ ba dùng cho lệnh shell.

```bash
# Terminal 1  →  Phiên A
docker exec -it acid-lab psql -U postgres

# Terminal 2  →  Phiên B
docker exec -it acid-lab psql -U postgres
```

Bật hiển thị thời gian ở cả hai phiên — sẽ dùng suốt bài:

```sql
\timing on
```

Dữ liệu dùng chung:

```sql
CREATE TABLE accounts (
    id      INT PRIMARY KEY,
    owner   TEXT NOT NULL,
    balance BIGINT NOT NULL CHECK (balance >= 0)
);

INSERT INTO accounts VALUES
    (1, 'Nam',  1000000),
    (2, 'Linh',  500000);
```

Chú ý `CHECK (balance >= 0)` — ta sẽ dùng nó để kích hoạt lỗi có chủ đích ở phần sau.

---

## Lab 0 — Chứng minh bạn luôn ở trong một transaction

Trước khi làm gì khác, hãy xác nhận điều đã nói ở [bài 1](01-acid-va-transaction.md): mọi câu lệnh đều nằm trong một transaction.

**Phiên A:**

```sql
SELECT txid_current();
SELECT txid_current();
SELECT txid_current();
```

```text
 txid_current
--------------
          748
 txid_current
--------------
          749
 txid_current
--------------
          750
```

Ba số khác nhau → ba transaction riêng biệt. Bây giờ bọc lại:

```sql
BEGIN;
SELECT txid_current();
SELECT txid_current();
SELECT txid_current();
COMMIT;
```

```text
 txid_current
--------------
          751
 txid_current
--------------
          751
 txid_current
--------------
          751
```

Cùng một số → một transaction. Đây là bằng chứng trực tiếp cho cơ chế **autocommit**.

### Đo cái giá của autocommit

Vẫn ở Phiên A. So sánh hai cách nạp 20.000 dòng:

```sql
CREATE TABLE logs (id SERIAL PRIMARY KEY, msg TEXT);

-- CÁCH 1: mỗi dòng một transaction (mô phỏng autocommit trong vòng lặp)
DO $$
BEGIN
    FOR i IN 1..20000 LOOP
        INSERT INTO logs (msg) VALUES ('dong ' || i);
        COMMIT;                       -- commit trong khối DO, từ PG11
    END LOOP;
END $$;
```

```text
Time: 8471.226 ms (00:08.471)
```

```sql
TRUNCATE logs;

-- CÁCH 2: tất cả trong một transaction
BEGIN;
INSERT INTO logs (msg)
SELECT 'dong ' || i FROM generate_series(1, 20000) AS i;
COMMIT;
```

```text
Time: 62.118 ms
```

```text
   8471 ms  /  62 ms  ≈  136 LẦN
```

Toàn bộ khoảng cách này **không** nằm ở việc chèn dữ liệu. Nó nằm ở 20.000 lần `fsync` thay vì 1 lần. Lab 2 sẽ đo trực tiếp `fsync` để xác nhận.

---

## Lab 1 — Atomicity: giết database giữa chừng

### 1a. Rollback thủ công

**Phiên A:**

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;
SELECT id, owner, balance FROM accounts ORDER BY id;
```

```text
 id | owner | balance
----+-------+---------
  1 | Nam   |  900000     ← A thấy thay đổi của chính mình
  2 | Linh  |  500000
```

**Phiên B** (chạy ngay lúc A chưa commit):

```sql
SELECT id, owner, balance FROM accounts ORDER BY id;
```

```text
 id | owner | balance
----+-------+---------
  1 | Nam   | 1000000     ← B vẫn thấy giá trị cũ
  2 | Linh  |  500000
```

Hai phiên đang nhìn hai thực tại khác nhau trên cùng một dòng. **Phiên A:**

```sql
ROLLBACK;
SELECT balance FROM accounts WHERE id = 1;
```

```text
 balance
---------
 1000000     ← như chưa có gì xảy ra
```

### 1b. Rollback tự động do vi phạm ràng buộc

**Phiên A:**

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;   -- OK
UPDATE accounts SET balance = balance - 999999999 WHERE id = 2; -- vi phạm CHECK
```

```text
ERROR:  new row for relation "accounts" violates check constraint "accounts_balance_check"
DETAIL:  Failing row contains (2, Linh, -999499999).
```

Bây giờ thử làm ngơ lỗi và commit tiếp:

```sql
SELECT * FROM accounts;
```

```text
ERROR:  current transaction is aborted, commands ignored until end of transaction block
```

```sql
COMMIT;
```

```text
ROLLBACK          ← chú ý: gõ COMMIT nhưng Postgres trả về ROLLBACK
```

Đây là hành vi quan trọng cần biết: **một câu lệnh lỗi làm cả transaction rơi vào trạng thái huỷ**. Mọi lệnh sau đó bị từ chối, và `COMMIT` bị chuyển thành `ROLLBACK`. Câu `UPDATE` đầu tiên — dù thành công — cũng bị hoàn tác.

```sql
SELECT balance FROM accounts WHERE id = 1;
```

```text
 balance
---------
 1000000     ← câu UPDATE thành công cũng bị hoàn tác. Đó là atomicity.
```

### 1c. Giữ lại phần đã làm bằng `SAVEPOINT`

Nếu muốn "thử một việc, hỏng thì bỏ riêng việc đó":

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1;

SAVEPOINT truoc_khi_thu;
UPDATE accounts SET balance = balance - 999999999 WHERE id = 2;   -- lỗi
ROLLBACK TO SAVEPOINT truoc_khi_thu;                              -- chỉ bỏ phần này

UPDATE accounts SET balance = balance + 100000 WHERE id = 2;      -- làm lại cho đúng
COMMIT;

SELECT id, owner, balance FROM accounts ORDER BY id;
```

```text
 id | owner | balance
----+-------+---------
  1 | Nam   |  900000
  2 | Linh  |  600000     ← chuyển tiền thành công
```

`SAVEPOINT` hữu ích nhưng **không miễn phí** — mỗi savepoint tạo một sub-transaction, và có quá nhiều (hàng chục nghìn trong một transaction) sẽ làm chậm đáng kể. Dùng có chừng mực.

### 1d. Rút phích thật — atomicity khi tiến trình chết

Đây là thí nghiệm quan trọng nhất của Lab 1.

**Phiên A:**

```sql
BEGIN;
UPDATE accounts SET balance = 1 WHERE id = 1;
UPDATE accounts SET balance = 1 WHERE id = 2;
-- CỐ TÌNH KHÔNG COMMIT. Để nguyên cửa sổ này.
```

**Terminal 3** — giết không cho dọn dẹp:

```bash
docker kill acid-lab && docker start acid-lab
sleep 2 && docker logs acid-lab --tail 8
```

```text
LOG:  database system was interrupted; last known up at 2026-08-07 10:22:41 GMT
LOG:  database system was not properly shut down; automatic recovery in progress
LOG:  redo starts at 0/1901518
LOG:  invalid record length at 0/1938A70: wanted 24, got 0
LOG:  redo done at 0/1938A38 system usage: CPU: user: 0.00 s, ... elapsed: 0.00 s
LOG:  checkpoint starting: end-of-recovery immediate wait
LOG:  database system is ready to accept connections
```

Kết nối lại và kiểm tra:

```bash
docker exec -it acid-lab psql -U postgres -c "SELECT * FROM accounts ORDER BY id;"
```

```text
 id | owner | balance
----+-------+---------
  1 | Nam   |  900000
  2 | Linh  |  600000     ← transaction dang dở đã bị hoàn tác hoàn toàn
```

Không ai gõ `ROLLBACK`. Database tự đọc WAL, tự nhận ra transaction chưa commit, tự dọn. **Đó là atomicity trong đời thực.**

---

## Lab 2 — Durability: đo cái giá của lời hứa

### 2a. Đo `fsync` trên máy bạn

```bash
docker exec -it acid-lab pg_test_fsync
```

```text
5 seconds per test
O_DIRECT supported on this platform for open_datasync and open_sync.

Compare file sync methods using one 8kB write:
        open_datasync                     18325.331 ops/sec      55 usecs/op
        fdatasync                         17948.212 ops/sec      56 usecs/op
        fsync                             16104.775 ops/sec      62 usecs/op
        fsync_writethrough                            n/a
        open_sync                         16781.404 ops/sec      60 usecs/op
```

Đọc thành lời: *"`fsync` trên máy này mất ~62 µs. Một luồng ghi đơn lẻ có trần khoảng 16.000 transaction/giây."*

> Nếu con số ra hàng triệu ops/sec: ổ đĩa đang **nói dối** `fsync` (thường gặp ở ổ tiêu dùng hoặc lớp ảo hoá). Đó không phải tin vui — nó nghĩa là durability của bạn không được đảm bảo.

### 2b. Vặn nút durability và đo lại

```sql
SHOW synchronous_commit;
```

```text
 synchronous_commit
--------------------
 on
```

Đo với mức an toàn nhất:

```sql
TRUNCATE logs;
DO $$
BEGIN
    FOR i IN 1..5000 LOOP
        INSERT INTO logs (msg) VALUES ('x');
        COMMIT;
    END LOOP;
END $$;
```

```text
Time: 2134.775 ms (00:02.135)
```

Bây giờ tắt chờ `fsync`:

```sql
SET synchronous_commit = off;
TRUNCATE logs;
DO $$
BEGIN
    FOR i IN 1..5000 LOOP
        INSERT INTO logs (msg) VALUES ('x');
        COMMIT;
    END LOOP;
END $$;
```

```text
Time: 271.443 ms
```

```text
   2135 ms  →  271 ms   ≈  NHANH GẤP 7,9 LẦN
```

Đổi lại: nếu máy mất điện, bạn có thể mất các giao dịch trong khoảng vài trăm mili-giây cuối. **Dữ liệu không hỏng** — chỉ là mấy giao dịch cuối biến mất. Đây là đánh đổi hoàn toàn hợp lý cho log sự kiện, và hoàn toàn không chấp nhận được cho chuyển tiền.

Nhớ trả về mặc định:

```sql
RESET synchronous_commit;
```

### 2c. Nhìn thấy WAL bằng mắt

```sql
SELECT pg_current_wal_lsn();
```

```text
 pg_current_wal_lsn
--------------------
 0/1B4C7A8
```

`LSN` (*Log Sequence Number*) là vị trí hiện tại trong dòng WAL. Ghi thêm dữ liệu rồi xem nó nhích:

```sql
INSERT INTO logs (msg) SELECT 'x' FROM generate_series(1, 1000);
SELECT pg_current_wal_lsn();
```

```text
 pg_current_wal_lsn
--------------------
 0/1B7DE30
```

Tính lượng WAL vừa sinh ra:

```sql
SELECT pg_size_pretty(
    pg_wal_lsn_diff('0/1B7DE30', '0/1B4C7A8')
) AS wal_sinh_ra;
```

```text
 wal_sinh_ra
-------------
 198 kB
```

1.000 dòng nhỏ xíu sinh ra 198 kB WAL. Con số này là gốc rễ của khái niệm **write amplification** (khuếch đại ghi) — chi tiết ở [phase-17 bài 6](../phase-17/06-nulls-va-write-amplification.md).

Và xem file WAL thật:

```bash
docker exec acid-lab ls -la /var/lib/postgresql/data/pg_wal/ | head -5
```

```text
total 32784
-rw------- 1 postgres postgres 16777216 Aug  7 10:31 000000010000000000000001
```

16 MB mỗi tệp — đây chính là "sổ nhật ký của thủ kho" ở [bài 2](02-atomicity-va-durability.md), tồn tại thật, sờ được.

---

## Lab 3 — Isolation: bốn hiện tượng, tái hiện từng cái

Đặt lại dữ liệu:

```sql
DROP TABLE IF EXISTS sales;
CREATE TABLE sales (product_id INT PRIMARY KEY, quantity INT, price INT);
INSERT INTO sales VALUES (1, 10, 5), (2, 20, 4);
```

### 3a. Dirty read — chứng minh Postgres KHÔNG cho phép

**Phiên A:**

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SHOW transaction_isolation;
```

```text
 transaction_isolation
-----------------------
 read committed          ← xin READ UNCOMMITTED, nhận READ COMMITTED
```

PostgreSQL **âm thầm nâng cấp**. Đây là bằng chứng cho khẳng định ở [bài 3](03-isolation-va-read-phenomena.md): dirty read không tồn tại trên PostgreSQL, dù bạn cố tình yêu cầu.

```sql
ROLLBACK;
```

### 3b. Non-repeatable read ở `READ COMMITTED`

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN;` | |
| 2 | `SELECT SUM(quantity*price) FROM sales;` | |
| 3 | | `UPDATE sales SET quantity=15 WHERE product_id=1;` |
| 4 | `SELECT SUM(quantity*price) FROM sales;` | |
| 5 | `COMMIT;` | |

```text
Bước 2 →  130
Bước 4 →  155        ⚠ cùng câu lệnh, cùng transaction, hai kết quả
```

### 3c. Chữa bằng `REPEATABLE READ`

```sql
UPDATE sales SET quantity = 10 WHERE product_id = 1;   -- đặt lại
```

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| 2 | `SELECT SUM(quantity*price) FROM sales;` → `130` | |
| 3 | | `UPDATE sales SET quantity=15 WHERE product_id=1;` |
| 4 | `SELECT SUM(quantity*price) FROM sales;` → **`130`** ✔ | |
| 5 | `COMMIT;` | |
| 6 | `SELECT SUM(quantity*price) FROM sales;` → `155` | |

Trong suốt transaction, A nhìn một thực tại ổn định. Chỉ sau `COMMIT` nó mới thấy thế giới đã đổi.

### 3d. Phantom read — và bằng chứng Postgres chặn được

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| 2 | `SELECT COUNT(*) FROM sales;` → `2` | |
| 3 | | `INSERT INTO sales VALUES (3, 10, 1);` |
| 4 | `SELECT COUNT(*) FROM sales;` → **`2`** ✔ | |
| 5 | `COMMIT;` | |
| 6 | `SELECT COUNT(*) FROM sales;` → `3` | |

Bóng ma không lọt vào. Chạy y kịch bản này trên MySQL InnoDB sẽ cho kết quả tương tự với `SELECT` thường, nhưng khác ngay khi đổi sang `SELECT ... FOR UPDATE` — đó là ranh giới giữa "đọc nhất quán" và "đọc hiện tại" của InnoDB.

### 3e. Lost update và cách chặn

```sql
DELETE FROM sales WHERE product_id = 3;
UPDATE sales SET quantity = 10 WHERE product_id = 1;
```

**Cách sai** — đọc ra rồi ghi lại:

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN;` | `BEGIN;` |
| 2 | `SELECT quantity FROM sales WHERE product_id=1;` → `10` | |
| 3 | | `SELECT quantity FROM sales WHERE product_id=1;` → `10` |
| 4 | `UPDATE sales SET quantity=20 WHERE product_id=1;` | |
| 5 | | `UPDATE sales SET quantity=15 WHERE product_id=1;` *(bị chặn, ngồi chờ)* |
| 6 | `COMMIT;` | *(hết chờ, chạy tiếp)* |
| 7 | | `COMMIT;` |
| 8 | `SELECT quantity FROM sales WHERE product_id=1;` → **`15`** ⚠ | |

10 đơn hàng của A biến mất, không có lỗi nào được báo.

**Cách đúng** — biểu thức tự tham chiếu:

```sql
UPDATE sales SET quantity = 10 WHERE product_id = 1;   -- đặt lại
```

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN;` `UPDATE sales SET quantity=quantity+10 WHERE product_id=1;` | |
| 2 | | `BEGIN;` `UPDATE sales SET quantity=quantity+5 WHERE product_id=1;` *(chờ)* |
| 3 | `COMMIT;` | *(hết chờ, đọc lại giá trị MỚI)* |
| 4 | | `COMMIT;` |
| 5 | `SELECT quantity FROM sales WHERE product_id=1;` → **`25`** ✔ | |

### 3f. Nhìn thấy ai đang chặn ai

Trong lúc Phiên B đang chờ ở bước 2 phía trên, mở terminal 3:

```bash
docker exec -it acid-lab psql -U postgres
```

```sql
SELECT pid,
       state,
       wait_event_type,
       pg_blocking_pids(pid) AS bi_chan_boi,
       left(query, 55)       AS cau_lenh
FROM pg_stat_activity
WHERE datname = 'postgres' AND state <> 'idle';
```

```text
  pid | state  | wait_event_type | bi_chan_boi |               cau_lenh
------+--------+-----------------+-------------+----------------------------------------
  112 | idle in transaction |    |    {}       | UPDATE sales SET quantity=quantity+10 ...
  118 | active | Lock            | {112}       | UPDATE sales SET quantity=quantity+5 ...
```

Cột `bi_chan_boi = {112}` nói thẳng: tiến trình 118 đang bị tiến trình 112 chặn. Đây là câu lệnh chẩn đoán quan trọng nhất khi hệ thống "tự nhiên đứng" — thuộc nó.

---

## Lab 4 — `SERIALIZABLE` vs `REPEATABLE READ`: thí nghiệm hoán đổi A/B

Đây là thí nghiệm hay nhất của cả bài, vì nó phơi ra một bất thường mà `REPEATABLE READ` **không** chặn được.

```sql
DROP TABLE IF EXISTS test;
CREATE TABLE test (id SERIAL PRIMARY KEY, field TEXT);
INSERT INTO test (field) VALUES ('A'), ('A'), ('B'), ('B');
SELECT field FROM test ORDER BY id;
```

```text
 field
-------
 A
 A
 B
 B
```

Hai transaction chạy song song, mỗi cái đổi một chữ thành chữ kia:

- Phiên A: đổi mọi `A` thành `B`
- Phiên B: đổi mọi `B` thành `A`

Nếu chúng chạy **lần lượt**, kết quả chỉ có thể là **toàn A** hoặc **toàn B**:

```text
   NẾU A CHẠY TRƯỚC              NẾU B CHẠY TRƯỚC
   ───────────────────           ───────────────────
   A,A,B,B                       A,A,B,B
   → A đổi A→B: B,B,B,B          → B đổi B→A: A,A,A,A
   → B đổi B→A: A,A,A,A          → A đổi A→B: B,B,B,B
   KẾT QUẢ: toàn A               KẾT QUẢ: toàn B
```

### 4a. Với `REPEATABLE READ`

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL REPEATABLE READ;` | `BEGIN ISOLATION LEVEL REPEATABLE READ;` |
| 2 | `UPDATE test SET field='B' WHERE field='A';` | |
| 3 | | `UPDATE test SET field='A' WHERE field='B';` |
| 4 | `COMMIT;` | |
| 5 | | `COMMIT;` |

```sql
SELECT field FROM test ORDER BY id;
```

```text
 field
-------
 B
 B
 A
 A
```

**Kết quả bị hoán đổi**, không phải toàn A cũng không phải toàn B. Đây là một trạng thái **không thể đạt được** nếu hai transaction chạy lần lượt.

Vì sao `REPEATABLE READ` không bắt được? Vì nó chỉ kiểm tra *"hai transaction có sửa cùng một dòng không?"* — và câu trả lời là **không**. A sửa hai dòng đầu, B sửa hai dòng cuối. Chúng không giẫm lên nhau. Không có lost update. Nhưng kết quả tổng thể vẫn sai.

Đây chính là **write skew** (lệch ghi) đã nhắc ở [bài 3](03-isolation-va-read-phenomena.md): mỗi transaction đọc đúng, ghi đúng dòng của mình, nhưng phối hợp lại thì phá vỡ quy tắc.

### 4b. Với `SERIALIZABLE`

Đặt lại:

```sql
TRUNCATE test;
INSERT INTO test (field) VALUES ('A'), ('A'), ('B'), ('B');
```

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL SERIALIZABLE;` | `BEGIN ISOLATION LEVEL SERIALIZABLE;` |
| 2 | `UPDATE test SET field='B' WHERE field='A';` | |
| 3 | | `UPDATE test SET field='A' WHERE field='B';` |
| 4 | `COMMIT;` → `COMMIT` | |
| 5 | | `COMMIT;` → **lỗi** |

```text
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.
HINT:  The transaction might succeed if retried.
```

```sql
SELECT field FROM test ORDER BY id;
```

```text
 field
-------
 B
 B
 B
 B
```

PostgreSQL đã **phát hiện phụ thuộc đọc-ghi** giữa hai transaction, xác định rằng không có thứ tự tuần tự nào cho ra kết quả này, và **huỷ một cái**. Kết quả cuối là toàn `B` — đúng bằng kết quả nếu A chạy trước rồi B chạy sau (và B khi đó không tìm thấy `B` nào... thực ra B đã bị huỷ nên không chạy gì cả, tương đương "chỉ A chạy").

Đọc lại dòng `HINT`: *"The transaction might succeed if retried."* Database đang nói thẳng với ứng dụng: **hãy chạy lại**.

### 4c. Vòng lặp thử lại — bắt buộc phải có nếu dùng `SERIALIZABLE`

```python
import time
import random
import psycopg2
from psycopg2 import errors

SO_LAN_THU_TOI_DA = 5

def chay_co_thu_lai(conn, cong_viec):
    for lan in range(SO_LAN_THU_TOI_DA):
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
                    cong_viec(cur)
            return
        except errors.SerializationFailure:
            # backoff có nhiễu ngẫu nhiên: tránh mọi client cùng thử lại một nhịp
            cho = (2 ** lan) * 0.05 * (1 + random.random())
            time.sleep(cho)
    raise RuntimeError(f"Thất bại sau {SO_LAN_THU_TOI_DA} lần thử")
```

Ba chi tiết trong đoạn code này đều quan trọng:

| Chi tiết | Vì sao cần |
|---|---|
| Bắt đúng `SerializationFailure` (SQLSTATE `40001`) | Bắt `Exception` chung sẽ nuốt luôn cả lỗi nghiệp vụ thật |
| **Backoff luỹ thừa** | Thử lại ngay lập tức sẽ đâm vào đúng transaction vừa gây xung đột |
| **Nhiễu ngẫu nhiên** (*jitter*) | Không có nó, mọi client cùng thử lại đúng một thời điểm — tạo sóng xung đột mới |
| Thử lại **cả transaction** | Không được chỉ chạy lại câu lệnh lỗi; ảnh chụp cũ đã hết hiệu lực |

Chi tiết cơ chế này ở [phase-17 bài 7](../phase-17/07-concurrency-control-va-innodb-locking.md).

---

## Lab 5 — Consistency: để database từ chối dữ liệu sai

```sql
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS pictures;

CREATE TABLE pictures (
    id         INT PRIMARY KEY,
    like_count INT NOT NULL DEFAULT 0
);

CREATE TABLE likes (
    user_name  TEXT,
    picture_id INT REFERENCES pictures(id) ON DELETE CASCADE,
    PRIMARY KEY (user_name, picture_id)
);

INSERT INTO pictures VALUES (1, 0), (2, 0);
```

### 5a. Khoá ngoại chặn dữ liệu mồ côi

```sql
INSERT INTO likes VALUES ('Edmund', 4);
```

```text
ERROR:  insert or update on table "likes" violates foreign key constraint "likes_picture_id_fkey"
DETAIL:  Key (picture_id)=(4) is not present in table "pictures".
```

### 5b. `ON DELETE CASCADE` tự dọn theo

```sql
INSERT INTO likes VALUES ('John', 1), ('Edmund', 1), ('John', 2);
DELETE FROM pictures WHERE id = 2;
SELECT * FROM likes;
```

```text
 user_name | picture_id
-----------+------------
 John      |          1
 Edmund    |          1
```

Dòng `(John, 2)` tự biến mất theo ảnh bị xoá. Không cần code ứng dụng nhớ làm việc đó.

### 5c. Bộ đếm phi chuẩn hoá — quy tắc database KHÔNG giữ giúp

```sql
UPDATE pictures SET like_count = 5 WHERE id = 1;   -- cố tình đặt sai
```

Không có lỗi nào. Database không biết `like_count` phải bằng số dòng trong `likes` — vì bạn chưa hề nói với nó, và cũng **không có cú pháp nào để nói**.

Đây là lý do phải có job đối soát:

```sql
SELECT p.id,
       p.like_count                       AS ghi_trong_bang,
       COUNT(l.user_name)                 AS dem_that,
       p.like_count - COUNT(l.user_name)  AS chenh_lech
FROM pictures p
LEFT JOIN likes l ON l.picture_id = p.id
GROUP BY p.id, p.like_count
HAVING p.like_count <> COUNT(l.user_name);
```

```text
 id | ghi_trong_bang | dem_that | chenh_lech
----+----------------+----------+------------
  1 |              5 |        2 |          3
```

---

## Lab 6 — Săn transaction bị bỏ quên

Đây là lệnh nên đưa vào bảng theo dõi của mọi hệ thống production.

**Phiên A** — mô phỏng một transaction bị quên đóng:

```sql
BEGIN;
SELECT 1;
-- rồi bỏ đó, đi ăn trưa
```

**Terminal 3:**

```sql
SELECT pid,
       now() - xact_start AS mo_bao_lau,
       state,
       left(query, 40)    AS cau_lenh_cuoi
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND state = 'idle in transaction'
ORDER BY xact_start;
```

```text
 pid |   mo_bao_lau    |        state        | cau_lenh_cuoi
-----+-----------------+---------------------+----------------
 112 | 00:03:41.882917 | idle in transaction | SELECT 1
```

Một transaction ở trạng thái `idle in transaction` suốt 3 phút 41 giây đang **chặn `VACUUM` dọn rác trên toàn bộ database**. Để lâu vài giờ trên hệ có tải cao là bảng phình lên hàng chục GB.

Cách phòng thủ — đặt hạn mức để database tự cắt:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
SELECT pg_reload_conf();
```

Sau 5 phút, PostgreSQL tự ngắt kết nối đó và hoàn tác transaction. Đây là một trong những cấu hình đáng bật nhất mà ít người bật.

---

## Bảng tra cứu nhanh

```sql
-- Xem mình đang ở transaction nào
SELECT txid_current();

-- Xem isolation level hiện tại
SHOW transaction_isolation;

-- Đặt isolation level cho transaction sắp tới
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- Đặt mức mặc định cho phiên
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- Ai đang chặn ai
SELECT pid, pg_blocking_pids(pid), left(query,50)
FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- Transaction bị bỏ quên
SELECT pid, now() - xact_start, state FROM pg_stat_activity
WHERE state = 'idle in transaction' ORDER BY xact_start;

-- Vị trí WAL hiện tại và lượng WAL sinh ra
SELECT pg_current_wal_lsn();
SELECT pg_size_pretty(pg_wal_lsn_diff('LSN_SAU', 'LSN_TRUOC'));

-- Nút vặn durability (cho từng transaction)
BEGIN; SET LOCAL synchronous_commit = off; ... COMMIT;

-- Giết một kết nối đang giữ khoá
SELECT pg_terminate_backend(112);
```

## Bẫy khi thực hành

| Bẫy | Triệu chứng | Cách tránh |
|---|---|---|
| Chỉ mở một phiên psql | Không hiện tượng nào xảy ra, tưởng lý thuyết sai | Bắt buộc hai phiên trở lên |
| Quên `COMMIT`/`ROLLBACK` ở phiên trước | Thí nghiệm sau bị chặn không rõ lý do | Gõ `ROLLBACK;` trước mỗi thí nghiệm mới |
| Thử trên bảng vài dòng rồi đo hiệu năng | Mọi thứ nằm trong RAM, con số vô nghĩa | Hiệu năng thì dùng bảng ≥ 1 triệu dòng |
| Đo lần chạy đầu tiên | Cache lạnh, chậm hơn nhiều lần | Chạy 3 lần, lấy lần ổn định |
| Dùng `docker stop` để mô phỏng mất điện | `stop` gửi tín hiệu dọn dẹp, Postgres tắt sạch sẽ | Dùng `docker kill` (SIGKILL) |
| Để `synchronous_commit = off` rồi quên | Vô tình chạy production ở chế độ có thể mất dữ liệu | Luôn `RESET` sau thí nghiệm; ưu tiên `SET LOCAL` |

## Tóm tắt bài 5

- `txid_current()` chứng minh **mọi câu lệnh đều ở trong một transaction**; gộp lô làm nhanh hơn ~136 lần trong thí nghiệm 20.000 dòng, và toàn bộ khoảng cách đó là chi phí `fsync`.
- **Một câu lệnh lỗi làm cả transaction vào trạng thái huỷ** — `COMMIT` sau đó bị chuyển thành `ROLLBACK`. `SAVEPOINT` là cách giữ lại phần đã làm.
- `docker kill` rồi `docker start` cho thấy **crash recovery** hoạt động thật: database tự đọc WAL, tự hoàn tác transaction dang dở, không cần ai can thiệp.
- `pg_test_fsync` cho biết trần TPS của một luồng ghi. Tắt `synchronous_commit` nhanh gấp ~8 lần, đổi lấy nguy cơ mất vài trăm mili-giây giao dịch cuối.
- PostgreSQL **âm thầm nâng `READ UNCOMMITTED` thành `READ COMMITTED`** — dirty read không tồn tại ở đây.
- Thí nghiệm **hoán đổi A/B** phơi ra **write skew**: `REPEATABLE READ` không bắt được, chỉ `SERIALIZABLE` bắt được — và nó bắt bằng cách ném lỗi `40001`, nên **bắt buộc phải có vòng lặp thử lại có backoff và jitter**.
- `pg_blocking_pids()` và câu truy vấn `idle in transaction` là hai lệnh chẩn đoán nên thuộc lòng.

**Bài kế tiếp** → [Phase 3 — Bài 1: Page, Heap và I/O](../phase-3/01-page-heap-va-io.md)
