# Bài 2: Sharding thực hành — dựng 3 shard bằng Docker và Node.js

[Bài 1](01-database-sharding-la-gi.md) nói sharding mất `JOIN`, mất transaction, mất `UNIQUE`. Nghe thì trừu tượng. Bài này cho bạn **gõ tay và tự thấy** chúng mất ở đâu.

Chúng ta xây một hệ rút gọn URL: nhập URL dài, nhận về mã ngắn; nhập mã ngắn, nhận về URL dài. Dữ liệu chia ra ba máy chủ PostgreSQL.

Cố tình **không dùng ORM và không dùng thư viện sharding nào**, để mọi thứ hiện ra rõ ràng.

## Dựng ba shard

```yaml
# docker-compose.yml
services:
  shard1:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: lab }
    ports: ["5432:5432"]
  shard2:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: lab }
    ports: ["5433:5432"]
  shard3:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: lab }
    ports: ["5434:5432"]
```

```bash
docker compose up -d
docker compose ps
```

```text
NAME       IMAGE         STATUS         PORTS
shard1     postgres:16   Up 3 seconds   0.0.0.0:5432->5432/tcp
shard2     postgres:16   Up 3 seconds   0.0.0.0:5433->5432/tcp
shard3     postgres:16   Up 3 seconds   0.0.0.0:5434->5432/tcp
```

**Ba tiến trình database hoàn toàn độc lập.** Chúng không biết nhau tồn tại. Không có gì kết nối chúng lại — trừ code bạn sắp viết.

Tạo **cùng một cấu trúc bảng** trên cả ba:

```bash
for p in 5432 5433 5434; do
  PGPASSWORD=lab psql -h localhost -p $p -U postgres -c "
    CREATE TABLE urls (
        id       BIGSERIAL PRIMARY KEY,
        url_id   TEXT UNIQUE NOT NULL,
        long_url TEXT NOT NULL,
        created  TIMESTAMPTZ NOT NULL DEFAULT now()
    );"
done
```

> Chú ý điểm đầu tiên đã hiện ra: bạn phải chạy **cùng một lệnh DDL ba lần**. Với 20 shard là 20 lần, và nếu một lần thất bại thì các shard lệch cấu trúc nhau. Đây là thuế vận hành đầu tiên của sharding.

---

## Bước 1 — Hàm định tuyến

```javascript
// shard.js
const crypto = require('crypto');
const { Pool } = require('pg');

const SHARDS = [
    { ten: 'shard1', pool: new Pool({ host:'localhost', port:5432, user:'postgres', password:'lab' }) },
    { ten: 'shard2', pool: new Pool({ host:'localhost', port:5433, user:'postgres', password:'lab' }) },
    { ten: 'shard3', pool: new Pool({ host:'localhost', port:5434, user:'postgres', password:'lab' }) },
];

// PHIÊN BẢN 1 — định tuyến bằng phép chia lấy dư (sẽ thấy nó gãy ở bước 5)
function chonShard(khoa) {
    const bam = crypto.createHash('md5').update(khoa).digest();
    return SHARDS[bam.readUInt32BE(0) % SHARDS.length];
}

module.exports = { SHARDS, chonShard };
```

Toàn bộ "phép màu" của sharding nằm trong sáu dòng đó. Không có gì khác.

---

## Bước 2 — Ghi vào một shard

```javascript
// ghi.js
const { chonShard } = require('./shard');

const BANG_CHU = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function sinhMa(doDai = 7) {
    let s = '';
    for (let i = 0; i < doDai; i++)
        s += BANG_CHU[Math.floor(Math.random() * BANG_CHU.length)];
    return s;
}

async function rutGon(longUrl) {
    const urlId = sinhMa();
    const shard = chonShard(urlId);          // ← khoá phân tán là urlId

    await shard.pool.query(
        'INSERT INTO urls (url_id, long_url) VALUES ($1, $2)',
        [urlId, longUrl]
    );

    console.log(`  ${urlId}  →  ${shard.ten}`);
    return urlId;
}

module.exports = { rutGon };
```

```javascript
(async () => {
    for (const u of ['https://a.com', 'https://b.com', 'https://c.com',
                     'https://d.com', 'https://e.com', 'https://f.com'])
        await rutGon(u);
})();
```

```text
  kQ3mXpA  →  shard2
  7hLzR2w  →  shard1
  pT9vNbK  →  shard3
  X4mQ8zC  →  shard1
  bR7wYnH  →  shard3
  9tKpL3s  →  shard2
```

Xác nhận dữ liệu thật sự nằm rải ra:

```bash
for p in 5432 5433 5434; do
  echo -n "port $p: "
  PGPASSWORD=lab psql -h localhost -p $p -U postgres -tAc "SELECT count(*) FROM urls;"
done
```

```text
port 5432: 2
port 5433: 2
port 5434: 2
```

Ba máy chủ, mỗi máy giữ một phần. Không máy nào biết về hai máy kia.

---

## Bước 3 — Đọc: nhanh khi có shard key

```javascript
async function moRong(urlId) {
    const shard = chonShard(urlId);          // ← biết ngay đi đâu
    const kq = await shard.pool.query(
        'SELECT long_url FROM urls WHERE url_id = $1', [urlId]
    );
    return kq.rows[0]?.long_url ?? null;
}
```

```text
moRong('kQ3mXpA')  →  chi hoi shard2  →  8 ms
```

**Chỉ một máy được hỏi.** Đây là trường hợp tốt nhất, và cũng chính là lý do `url_id` được chọn làm shard key: nghiệp vụ chính (mở rộng URL) luôn có nó trong tay.

---

## Bước 4 — Đọc: chậm khi KHÔNG có shard key

Bây giờ đến phần đau. Tìm theo `long_url` — cột không phải shard key:

```javascript
async function timTheoUrlDai(longUrl) {
    const batDau = Date.now();

    // KHÔNG BIẾT nó ở shard nào → PHẢI HỎI TẤT CẢ
    const ketQua = await Promise.all(
        SHARDS.map(s =>
            s.pool.query('SELECT url_id FROM urls WHERE long_url = $1', [longUrl])
                  .then(r => r.rows.map(x => ({ ...x, shard: s.ten })))
        )
    );

    const gop = ketQua.flat();
    console.log(`  hoi ${SHARDS.length} shard, mat ${Date.now() - batDau} ms`);
    return gop;
}
```

```text
  hỏi 3 shard, mất 31 ms
```

So sánh:

```text
   Co shard key    :  1 shard,  8 ms
   Không có        :  3 shard, 31 ms      → CHẬM HƠN ~4 LẦN
```

Và điều tệ hơn con số: **độ trễ bằng shard chậm nhất**, không phải trung bình.

```javascript
// Mô phỏng một shard thỉnh thoảng chậm
async function moPhongDuoiTre(soLan = 1000) {
    let tong1 = 0, tongN = 0;
    for (let i = 0; i < soLan; i++) {
        const doTre = SHARDS.map(() => (Math.random() < 0.01 ? 200 : 5));  // 1% chậm 200ms
        tong1 += doTre[0];                    // hoi 1 shard
        tongN += Math.max(...doTre);          // hỏi tất cả → chờ cái chậm nhất
    }
    console.log(`Hỏi 1 shard : trung bình ${(tong1/soLan).toFixed(1)} ms`);
    console.log(`Hoi 3 shard : trung binh ${(tongN/soLan).toFixed(1)} ms`);
}
```

```text
Hoi 1 shard : trung binh 6.9 ms
Hoi 3 shard : trung binh 10.8 ms
```

Với 3 shard đã tệ hơn 56%. Với **20 shard**, xác suất ít nhất một shard chậm là `1 − 0,99²⁰ ≈ 18%` — nghĩa là gần một phần năm số truy vấn dính 200 ms.

> **Rút ra:** mỗi truy vấn rải-gom là một khoản nợ. Thiết kế mô hình dữ liệu sao cho chúng càng hiếm càng tốt.

---

## Bước 5 — Thêm shard thứ tư: chỗ mọi thứ sụp đổ

Nạp nhiều dữ liệu hơn để thấy rõ:

```javascript
// Nạp 30.000 bản ghi
const daTao = [];
for (let i = 0; i < 30000; i++) daTao.push(await rutGon(`https://site${i}.com`));
```

Bây giờ thêm shard thứ tư:

```javascript
SHARDS.push({ ten:'shard4', pool: new Pool({ host:'localhost', port:5435, ... }) });

let doiCho = 0;
for (const urlId of daTao) {
    // shard cũ (tính với 3) vs shard mới (tính với 4)
    const cu  = bamModulo(urlId, 3);
    const moi = bamModulo(urlId, 4);
    if (cu !== moi) doiCho++;
}
console.log(`Phải di chuyển: ${(100*doiCho/daTao.length).toFixed(1)}%`);
```

```text
Phải di chuyển: 74.8%
```

**Ba phần tư dữ liệu phải chuyển máy.** Và trong lúc chuyển, hệ thống ở trạng thái nửa vời: một khoá có thể ở máy cũ hoặc máy mới, và code phải hỏi cả hai.

### Sửa bằng băm nhất quán

```javascript
// vong-bam.js
const crypto = require('crypto');

class VongBam {
    constructor(soNutAo = 150) {
        this.soNutAo = soNutAo;
        this.vong = new Map();
        this.viTri = [];
    }
    bam(s) {
        return crypto.createHash('md5').update(s).digest().readUInt32BE(0);
    }
    themShard(ten) {
        for (let i = 0; i < this.soNutAo; i++) this.vong.set(this.bam(`${ten}#${i}`), ten);
        this.viTri = [...this.vong.keys()].sort((a, b) => a - b);
    }
    xoaShard(ten) {
        for (let i = 0; i < this.soNutAo; i++) this.vong.delete(this.bam(`${ten}#${i}`));
        this.viTri = [...this.vong.keys()].sort((a, b) => a - b);
    }
    timShard(khoa) {
        const h = this.bam(khoa);
        // tìm nhị phân: vị trí đầu tiên >= h
        let lo = 0, hi = this.viTri.length - 1, kq = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.viTri[mid] >= h) { kq = mid; hi = mid - 1; } else lo = mid + 1;
        }
        return this.vong.get(this.viTri[kq]);
    }
}
```

Chú ý `timShard` dùng **tìm kiếm nhị phân**, không duyệt tuyến tính — với 4 shard × 150 nút ảo = 600 vị trí, duyệt tuyến tính cho mỗi truy vấn là lãng phí rõ ràng.

Đo lại:

```javascript
const vong = new VongBam();
['shard1','shard2','shard3'].forEach(s => vong.themShard(s));

const truoc = new Map(daTao.map(k => [k, vong.timShard(k)]));
vong.themShard('shard4');

let doi = 0;
for (const [k, v] of truoc) if (vong.timShard(k) !== v) doi++;
console.log(`Phải di chuyển: ${(100*doi/daTao.length).toFixed(1)}%`);
```

```text
Phải di chuyển: 24.6%
```

```text
   Chia lấy dư     :  74,8%
   Băm nhất quán   :  24,6%     →  ÍT HƠN 3 LẦN
```

Và kiểm tra phân bố có đều không:

```javascript
const dem = {};
for (const k of daTao) dem[vong.timShard(k)] = (dem[vong.timShard(k)] || 0) + 1;
console.log(dem);
```

```text
{ shard1: 7418, shard2: 7602, shard3: 7511, shard4: 7469 }
```

Lệch dưới 2% — đúng như kỳ vọng với 150 nút ảo.

---

## Bước 6 — Di chuyển dữ liệu khi thêm shard

Biết 24,6% cần chuyển là một chuyện; chuyển chúng **trong lúc hệ thống đang chạy** là chuyện khác. Quy trình an toàn:

```javascript
async function themShardAnToan(vong, shardMoi) {
    // GIAI ĐOẠN 1 — chế độ ĐỌC KÉP
    //   Thêm shard mới vào vòng, nhưng khi ĐỌC thì thử cả vị trí MỚI lẫn CŨ
    vong.themShard(shardMoi.ten);
    cheDoDocKep = true;

    // GIAI ĐOẠN 2 — di chuyển theo lô, chạy nền
    for (const shardCu of SHARDS) {
        let offset = 0;
        while (true) {
            const lo = await shardCu.pool.query(
                'SELECT * FROM urls ORDER BY id LIMIT 1000 OFFSET $1', [offset]);
            if (lo.rows.length === 0) break;

            for (const dong of lo.rows) {
                if (vong.timShard(dong.url_id) === shardMoi.ten) {
                    await shardMoi.pool.query(
                        `INSERT INTO urls (url_id, long_url, created) VALUES ($1,$2,$3)
                         ON CONFLICT (url_id) DO NOTHING`,          // ← BẮT BUỘC idempotent
                        [dong.url_id, dong.long_url, dong.created]);
                    await shardCu.pool.query('DELETE FROM urls WHERE url_id = $1',
                                             [dong.url_id]);
                }
            }
            offset += 1000;
        }
    }

    // GIAI ĐOẠN 3 — tắt đọc kép
    cheDoDocKep = false;
}
```

Ba chi tiết trong đoạn code này đều là bài học đắt giá:

| Chi tiết | Vì sao bắt buộc |
|---|---|
| **Đọc kép** trong lúc di chuyển | Một khoá có thể đang ở máy cũ **hoặc** máy mới. Không đọc cả hai thì mất dữ liệu |
| `ON CONFLICT DO NOTHING` | Job có thể chạy lại từ đầu sau khi lỗi — phải **bất biến trước lặp lại** |
| Chép **trước**, xoá **sau** | Ngược lại thì lỗi giữa chừng làm mất dữ liệu vĩnh viễn |

Và một chi tiết chưa xử lý trong code trên: nếu người dùng **ghi** vào một khoá đang được di chuyển thì sao? Lời giải thực tế thường là: **ghi vào cả hai nơi** trong giai đoạn di chuyển, hoặc khoá khoá đó trong vài mili-giây. Không có lời giải nào đơn giản.

> Đây là lý do người ta nói sharding là quyết định một chiều. Bạn không "thêm một máy" — bạn chạy một dự án di chuyển dữ liệu có rủi ro.

---

## Bước 7 — Tự thấy những gì đã mất

### `JOIN` xuyên shard

Thêm bảng người dùng, shard theo `user_id`:

```bash
for p in 5432 5433 5434; do
  PGPASSWORD=lab psql -h localhost -p $p -U postgres -c "
    CREATE TABLE users (user_id BIGINT PRIMARY KEY, name TEXT);
    ALTER TABLE urls ADD COLUMN user_id BIGINT;"
done
```

```javascript
// Muon: SELECT u.name, count(*) FROM users u JOIN urls ON ... GROUP BY u.name
// Nhưng urls shard theo url_id, users shard theo user_id
// → một người dùng và các URL của họ có thể ở BA MÁY KHÁC NHAU

async function joinBangTay(userId) {
    // 1. Lấy user từ shard của user_id
    const shardUser = vong.timShard(String(userId));
    const u = await shardUser.pool.query('SELECT * FROM users WHERE user_id=$1', [userId]);

    // 2. Lấy urls: KHÔNG biết ở đâu → hỏi TẤT CẢ
    const urls = (await Promise.all(
        SHARDS.map(s => s.pool.query('SELECT * FROM urls WHERE user_id=$1', [userId]))
    )).flatMap(r => r.rows);

    // 3. Tự ghép trong bộ nhớ ứng dụng
    return { ...u.rows[0], urls };
}
```

Ba lần gọi mạng, tự gộp trong RAM, không dùng được thuật toán join nào của database.

**Cách chữa đúng — nhóm cùng vị trí:** shard bảng `urls` theo `user_id` thay vì theo `url_id`.

```text
   → JOIN trở thành CỤC BỘ, chạy bình thường          ✔
   → Nhưng: moRong(urlId) không còn biết đi đâu       ✘
             → phải thêm một bảng tra urlId → userId
```

Đây là bản chất của thiết kế sharding: **mọi lựa chọn đều đánh đổi một mẫu truy vấn lấy một mẫu khác**. Không có shard key nào tốt cho mọi thứ.

### Transaction xuyên shard

```javascript
// KHÔNG thể làm nguyên tử — hai tiến trình database khác nhau
async function chuyenSoHuu(urlId, tuUser, sangUser) {
    const s1 = vong.timShard(String(tuUser));
    const s2 = vong.timShard(String(sangUser));

    await s1.pool.query('UPDATE users SET so_url = so_url - 1 WHERE user_id=$1', [tuUser]);
    // ⚡ NẾU CHẾT Ở ĐÂY: trừ rồi mà không cộng → dữ liệu SAI VĨNH VIỄN
    await s2.pool.query('UPDATE users SET so_url = so_url + 1 WHERE user_id=$1', [sangUser]);
}
```

Không có `BEGIN`/`COMMIT` nào bao được hai máy. Đây chính xác là tình huống "100 nghìn bốc hơi" ở [phase-2 bài 1](../phase-2/01-acid-va-transaction.md), nhưng lần này **database không cứu được**.

Mẫu Saga tối giản có bù trừ:

```javascript
async function chuyenSoHuuSaga(urlId, tuUser, sangUser) {
    const s1 = vong.timShard(String(tuUser));
    const s2 = vong.timShard(String(sangUser));

    await s1.pool.query('UPDATE users SET so_url = so_url - 1 WHERE user_id=$1', [tuUser]);
    try {
        await s2.pool.query('UPDATE users SET so_url = so_url + 1 WHERE user_id=$1', [sangUser]);
    } catch (e) {
        // BƯỚC BÙ TRỪ — và bước này CŨNG CÓ THỂ THẤT BẠI
        await s1.pool.query('UPDATE users SET so_url = so_url + 1 WHERE user_id=$1', [tuUser]);
        throw e;
    }
}
```

Chú ý bình luận cuối: **bước bù trừ cũng có thể thất bại**. Hệ nghiêm túc phải ghi các bước bù trừ vào một hàng đợi bền vững để thử lại. Đây là lúc độ phức tạp bắt đầu tăng vọt.

### `UNIQUE` toàn cục

```javascript
// url_id UNIQUE trên từng shard, KHÔNG duy nhất toàn cục
// Nếu hàm sinh mã tình cờ tạo ra trùng, hai shard khác nhau đều chấp nhận
```

Với `url_id` sinh ngẫu nhiên 7 ký tự từ 62 ký tự thì không gian là `62⁷ ≈ 3,5 × 10¹²`. Nghịch lý ngày sinh cho biết xác suất trùng đạt 50% ở khoảng **2 triệu** bản ghi — không hề xa.

Ba cách xử lý:

```text
   1. Shard THEO CHÍNH cột cần duy nhất (url_id)
      → đảm bảo duy nhất, vì mỗi giá trị chỉ có MỘT shard hợp lệ  ✔
      → đây chính là lý do bài này chọn url_id làm shard key

   2. Dịch vụ sinh ID tập trung (Snowflake, ULID)
      → đảm bảo duy nhất khi sinh, không cần kiểm tra

   3. Kiểm tra trước khi ghi trên mọi shard
      → chậm, và vẫn có điều kiện tranh chấp
```

---

## Bảng tổng kết những gì phải tự viết

Sau bài lab này, đây là danh sách những thứ database **từng làm giúp bạn** mà giờ bạn phải tự làm:

| Việc | Trước khi shard | Sau khi shard |
|---|---|---|
| Định tuyến truy vấn | Database lo | **Tự viết** hàm băm + vòng băm |
| `JOIN` | Database lo | **Tự viết** gộp trong RAM ứng dụng |
| Transaction | `BEGIN`/`COMMIT` | **Tự viết** Saga + bù trừ + hàng đợi thử lại |
| `UNIQUE` | Ràng buộc | **Tự thiết kế** shard key hoặc dịch vụ sinh ID |
| Khoá ngoại | Ràng buộc | **Tự kiểm tra** + job đối soát |
| Đổi cấu trúc bảng | Một lệnh `ALTER` | **Tự điều phối** N lệnh, xử lý khi lệch |
| Thêm dung lượng | Gắn thêm đĩa | **Dự án di chuyển dữ liệu** |
| Sao lưu | Một lệnh | N lệnh + đảm bảo cùng thời điểm |
| Theo dõi | Một hệ | N hệ + phát hiện shard nóng |

Danh sách này là câu trả lời đầy đủ nhất cho câu hỏi *"vì sao sharding là lựa chọn cuối cùng"*.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `hash % N` trong code production | Thêm shard = di chuyển 75% dữ liệu | Băm nhất quán + nút ảo ngay từ đầu |
| Duyệt tuyến tính vòng băm | Chậm với nhiều nút ảo | Tìm kiếm nhị phân trên mảng đã sắp |
| Di chuyển dữ liệu mà không đọc kép | Mất dữ liệu trong lúc di chuyển | Đọc cả vị trí cũ lẫn mới suốt quá trình |
| Job di chuyển không bất biến trước lặp lại | Chạy lại sau lỗi làm hỏng dữ liệu | `ON CONFLICT DO NOTHING`, chép trước xoá sau |
| Quên rằng bước bù trừ của Saga cũng lỗi được | Dữ liệu kẹt ở trạng thái nửa vời | Ghi bước bù trừ vào hàng đợi bền vững |
| Không có công cụ chạy DDL trên mọi shard | Các shard lệch cấu trúc, lỗi khó hiểu | Viết công cụ migration đa shard ngay từ đầu |
| Đặt kết nối tới mỗi shard mà không dùng pool | Cạn file descriptor rất nhanh | Pool cho từng shard, kích thước tính theo [phase-8 bài 3](../phase-8/03-connection-pooling.md) |

## Tóm tắt bài 2

- Ba shard là **ba tiến trình database hoàn toàn độc lập** — không có gì nối chúng ngoài code bạn viết. Ngay cả lệnh `CREATE TABLE` cũng phải chạy N lần.
- Truy vấn **có shard key** chỉ hỏi một máy (8 ms); truy vấn **không có** phải rải-gom (31 ms), và **độ trễ bằng shard chậm nhất** — càng nhiều shard thì đuôi trễ càng tệ.
- Đo thật: thêm shard thứ tư khiến **74,8%** dữ liệu phải di chuyển với `hash % N`, nhưng chỉ **24,6%** với **băm nhất quán** — và phân bố lệch dưới 2% nhờ 150 nút ảo.
- Di chuyển dữ liệu khi thêm shard cần **ba điều bắt buộc**: đọc kép trong lúc di chuyển, job bất biến trước lặp lại, và chép trước xoá sau.
- **Nhóm cùng vị trí** giữ lại được `JOIN` và transaction — nhưng nó đánh đổi: shard theo `user_id` thì mất khả năng tra trực tiếp theo `url_id`. **Không shard key nào tốt cho mọi mẫu truy vấn.**
- Saga thay thế transaction, nhưng **bước bù trừ cũng có thể thất bại** — phải có hàng đợi bền vững để thử lại.
- Bảng cuối bài liệt kê **chín thứ database từng làm giúp bạn** mà sau khi shard bạn phải tự viết. Đó là câu trả lời đầy đủ nhất cho "vì sao sharding là lựa chọn cuối cùng".

**Bài kế tiếp** → [Bài 3: Ưu nhược điểm và khi nào nên dùng Sharding](03-pros-cons-va-khi-nao-dung-sharding.md)
