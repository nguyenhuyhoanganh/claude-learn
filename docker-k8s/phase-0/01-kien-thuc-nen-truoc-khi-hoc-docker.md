# Bài 0.1: Kiến thức nền trước khi học Docker

Hầu hết tài liệu Docker mở đầu bằng câu *"Docker đóng gói ứng dụng cùng mọi thứ nó cần để chạy"*. Câu đó chỉ có nghĩa nếu bạn đã biết **"chạy" nghĩa là gì** ở mức hệ điều hành — tiến trình là gì, cổng là gì, vì sao phải cài thư viện.

Bài này lấp đúng khoảng trống đó. Nó **không nói gì về Docker cả**, mà giải thích bảy khái niệm nền mà mọi bài sau đều giả định bạn đã biết.

> Nếu bạn đã làm backend hoặc DevOps, có thể nhảy thẳng sang [Bài 0.2 — Từ điển Docker](02-tu-dien-thuat-ngu-docker.md). Nhưng phần **"Tiến trình"** và **"Cổng"** thì đáng đọc lướt, vì hai thứ đó giải thích phần lớn hành vi của container.

---

## 1. Chương trình và tiến trình — khác nhau như công thức và món ăn

Đây là khái niệm quan trọng nhất của cả bài. Không nắm nó thì mọi thứ về container đều mơ hồ.

```text
   CHƯƠNG TRÌNH (program)              TIẾN TRÌNH (process)
   ──────────────────────              ────────────────────
   Một FILE nằm trên đĩa               Chương trình ĐANG CHẠY trong RAM
   Tĩnh, không làm gì cả               Động, đang thực thi
   Ví dụ: /usr/bin/node                Ví dụ: node đang chạy server của bạn

   Ví von: công thức nấu ăn            Ví von: món đang nấu trên bếp
           (giấy, nằm im)                      (có thật, đang biến đổi)
```

Từ **một** file chương trình, bạn chạy được **nhiều** tiến trình cùng lúc:

```bash
node server.js &     # tiến trình 1
node server.js &     # tiến trình 2 — cùng file, khác tiến trình
```

Xem các tiến trình đang chạy trên máy:

```bash
ps aux | head -5
```

```text
USER       PID  %CPU %MEM    COMMAND
hoanganh  4821   0.3  1.2    node server.js
hoanganh  4835   0.0  0.4    /bin/zsh
```

**PID** (Process ID) là số định danh của tiến trình. Mỗi tiến trình có một số riêng, và số đó thay đổi mỗi lần chạy lại.

### Ba điều về tiến trình dùng suốt khoá học

**Một — tiến trình kết thúc thì nó biến mất hoàn toàn.** Mọi thứ nó giữ trong RAM mất theo. Đây là lý do sau này Docker cần **volume** để giữ dữ liệu.

**Hai — tiến trình có "mã thoát" khi kết thúc.**

```bash
ls /thu-muc-khong-ton-tai
echo $?          # in ra mã thoát của lệnh vừa chạy
```

```text
ls: /thu-muc-khong-ton-tai: No such file or directory
1
```

Quy ước phổ biến: **`0` là thành công, khác `0` là có lỗi**. Docker và Kubernetes dựa hoàn toàn vào quy ước này để biết container chạy đúng hay hỏng.

**Ba — tiến trình sinh ra tiến trình con, tạo thành cây.** Tiến trình đầu tiên khi máy khởi động có **PID 1**, và nó là tổ tiên của mọi tiến trình khác. Chi tiết này sẽ quan trọng ở [Phase 2 bài 5](../phase-2/05-dockerfile-best-practices.md).

---

## 2. Cổng — con số để nhiều chương trình dùng chung một địa chỉ

Máy tính của bạn có **một** địa chỉ mạng, nhưng có thể chạy nhiều dịch vụ cùng lúc. Cổng giải bài toán đó.

```text
   Ví von: toà nhà và số phòng

   Địa chỉ IP  =  địa chỉ toà nhà     (192.168.1.10)
   Cổng        =  số phòng             (3000, 5432, 80)

   Gửi thư tới "toà nhà A, phòng 3000" → đúng một người nhận
```

```text
   MÁY CỦA BẠN
   ├── cổng 3000  ← ứng dụng Node.js đang nghe
   ├── cổng 5432  ← PostgreSQL đang nghe
   ├── cổng 6379  ← Redis đang nghe
   └── cổng 27017 ← MongoDB đang nghe
```

Một số cổng có quy ước sẵn:

| Cổng | Thường là |
|---|---|
| 80 | HTTP (web không mã hoá) |
| 443 | HTTPS (web có mã hoá) |
| 22 | SSH (đăng nhập máy từ xa) |
| 3306 | MySQL |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 27017 | MongoDB |

Đây chỉ là **quy ước**, không phải luật. Bạn chạy web ở cổng 8080 hoàn toàn được — chỉ là trình duyệt mặc định thử cổng 80 nên phải gõ rõ `http://localhost:8080`.

### Quy tắc quan trọng nhất: một cổng, một tiến trình

```bash
node server.js       # đang nghe cổng 3000
node server.js       # chạy thêm cái nữa ở cổng 3000
```

```text
Error: listen EADDRINUSE: address already in use :::3000
```

**Hai tiến trình không thể cùng nghe một cổng.** Lỗi `address already in use` (hoặc `port is already allocated` với Docker) luôn có đúng một nguyên nhân: cổng đó đã có người dùng.

```bash
# Tìm ai đang chiếm cổng 3000
lsof -i :3000              # macOS / Linux
netstat -ano | findstr :3000   # Windows
```

---

## 3. Hệ thống file và đường dẫn

```text
   ĐƯỜNG DẪN TUYỆT ĐỐI — bắt đầu bằng /
   /Users/hoanganh/projects/myapp/server.js
   → chỉ đúng một chỗ, dù bạn đang đứng ở đâu

   ĐƯỜNG DẪN TƯƠNG ĐỐI — không bắt đầu bằng /
   ./server.js       → file server.js trong thư mục HIỆN TẠI
   ../config.json    → đi LÊN một cấp rồi tìm config.json
   → phụ thuộc bạn đang đứng ở đâu
```

```bash
pwd          # bạn đang đứng ở đâu (print working directory)
ls           # liệt kê file ở đây
cd /tmp      # đi tới thư mục khác
```

Vì sao điều này quan trọng: Docker có lệnh `docker run -v <đường dẫn máy>:<đường dẫn container>`, và **đường dẫn máy bắt buộc phải tuyệt đối**. Viết `./src` sẽ không chạy như bạn nghĩ ([Phase 3 bài 3](../phase-3/03-bind-mounts-va-dev-workflow.md)).

Mẹo lấy đường dẫn tuyệt đối của thư mục hiện tại:

```bash
echo $(pwd)          # macOS / Linux
```

### "Gắn" (mount) nghĩa là gì

Khái niệm này xuất hiện liên tục trong khoá học:

```text
   GẮN = làm cho một thư mục ở CHỖ NÀY xuất hiện Ở CHỖ KHÁC

   Ví von: cắm USB vào máy tính
   → nội dung USB xuất hiện ở /Volumes/USB (macOS) hoặc D:\ (Windows)
   → dữ liệu vẫn nằm trong USB, chỉ là bạn NHÌN THẤY nó ở đường dẫn đó
   → rút USB ra, đường dẫn đó rỗng

   Docker cũng vậy: gắn thư mục máy bạn vào bên trong container
   → container nhìn thấy file của bạn ở một đường dẫn nào đó
```

---

## 4. Biến môi trường — cách truyền cấu hình vào chương trình

**Biến môi trường** là các cặp `TÊN=giá trị` mà hệ điều hành đưa cho mọi tiến trình khi nó khởi động.

```bash
echo $HOME           # /Users/hoanganh
echo $PATH           # danh sách thư mục hệ thống tìm lệnh
env | head -5        # xem tất cả
```

Đặt biến cho một lần chạy:

```bash
DATABASE_URL=postgres://localhost:5432/mydb node server.js
```

Trong code:

```javascript
const url = process.env.DATABASE_URL;      // Node.js
```
```python
url = os.environ["DATABASE_URL"]           # Python
```

### Vì sao dùng biến môi trường thay vì ghi thẳng vào code

```text
   GHI THẲNG TRONG CODE               DÙNG BIẾN MÔI TRƯỜNG
   ──────────────────────             ────────────────────
   const url = "postgres://           const url = process.env.DATABASE_URL
     prod-server:5432/db"
                                       Máy dev:  DATABASE_URL=localhost:5432
   → muốn chạy ở máy dev phải          Server:   DATABASE_URL=prod-server:5432
     SỬA CODE rồi commit
   → mật khẩu nằm trong Git            → CÙNG MỘT bản code, khác cấu hình
                                       → mật khẩu KHÔNG vào Git
```

Đây là nguyên tắc nền của mọi thứ về sau: **cùng một image chạy ở dev, staging, production — chỉ khác biến môi trường**.

Ba điều cần nhớ:

| Điều | Chi tiết |
|---|---|
| Biến môi trường **được kế thừa** | Tiến trình con thấy hết biến của tiến trình cha |
| Giá trị luôn là **chuỗi** | `PORT=3000` là chuỗi `"3000"`, không phải số |
| Đặt lúc khởi động, **không đổi được sau đó** | Muốn đổi thì phải khởi động lại tiến trình |

Dòng cuối giải thích một hành vi ở [Phase 13](../phase-13/05-environment-variables-configmaps.md): đổi cấu hình mà Pod không nhận giá trị mới.

---

## 5. Máy khách và máy chủ — mô hình của gần như mọi thứ

```text
   ┌──────────┐   yêu cầu (request)    ┌──────────┐
   │  CLIENT  │ ─────────────────────► │  SERVER  │
   │ (máy     │                        │ (máy chủ)│
   │  khách)  │ ◄───────────────────── │          │
   └──────────┘   phản hồi (response)  └──────────┘

   Client: bên HỎI     — trình duyệt, ứng dụng di động, lệnh curl
   Server: bên TRẢ LỜI — chờ sẵn ở một cổng, ai gọi thì trả lời
```

Điểm hay bị hiểu nhầm: **"server" không phải là một cái máy đặc biệt**. Nó chỉ là **vai trò**. Máy tính của bạn ngay lúc này vừa là client (khi mở trình duyệt) vừa có thể là server (nếu bạn chạy `node server.js`).

Và một chương trình có thể là **cả hai** cùng lúc: backend là server với trình duyệt, nhưng là client khi gọi database.

Thử ngay:

```bash
# Cửa sổ 1 — làm server, phục vụ thư mục hiện tại ở cổng 8000
python3 -m http.server 8000

# Cửa sổ 2 — làm client
curl http://localhost:8000
```

### `localhost` và `127.0.0.1`

```text
   localhost  =  127.0.0.1  =  "CHÍNH MÁY NÀY"

   Nó KHÔNG phải một địa chỉ trên Internet.
   Nó luôn trỏ về máy đang gõ lệnh.
```

Đây là khái niệm gây nhầm lẫn nhiều nhất khi bắt đầu học Docker, vì **bên trong container, `localhost` là chính container đó** — không phải máy bạn ([Phase 4 bài 1](../phase-4/01-ba-loai-giao-tiep-trong-docker.md)).

### Địa chỉ IP và tên miền

```text
   ĐỊA CHỈ IP   192.168.1.10       ← máy tính hiểu
   TÊN MIỀN     google.com          ← người nhớ được

   DNS = hệ thống dịch tên miền sang địa chỉ IP
```

```bash
nslookup google.com
```

Sau này, Docker và Kubernetes đều có **DNS nội bộ** riêng, cho phép gọi container bằng **tên** thay vì địa chỉ IP — vì địa chỉ IP của container đổi liên tục.

---

## 6. Hệ điều hành và nhân — vì sao container nhẹ

Phần này giải thích khác biệt cốt lõi giữa container và máy ảo, nên đáng đọc kỹ dù nghe hơi kỹ thuật.

```text
   ┌───────────────────────────────────────────────┐
   │  ỨNG DỤNG CỦA BẠN                             │
   │  (Node.js, Python, trình duyệt...)            │
   ├───────────────────────────────────────────────┤
   │  NHÂN (kernel)                                 │
   │  Phần lõi của hệ điều hành. Nó quản:           │
   │   • đọc/ghi file                               │
   │   • gửi/nhận gói tin mạng                      │
   │   • cấp phát bộ nhớ                            │
   │   • tạo và dừng tiến trình                     │
   ├───────────────────────────────────────────────┤
   │  PHẦN CỨNG (CPU, RAM, đĩa, card mạng)         │
   └───────────────────────────────────────────────┘
```

Điểm cần nhớ: **ứng dụng không bao giờ chạm thẳng vào phần cứng**. Muốn mở file, nó phải **nhờ nhân**. Đây gọi là **lời gọi hệ thống** (system call).

Hệ quả trực tiếp:

```text
   Nếu nhiều ứng dụng có thể DÙNG CHUNG một nhân
   → không cần mỗi ứng dụng một hệ điều hành riêng
   → đó chính là ý tưởng của CONTAINER
```

Còn **máy ảo** thì mang theo nhân riêng — nên nặng hơn nhiều. Chi tiết ở [Phase 1 bài 2](../phase-1/02-containers-vs-virtual-machines.md).

### "Chương trình chạy nền" (daemon)

```text
   Chương trình THƯỜNG:  chạy → làm việc → kết thúc → biến mất
   Chương trình CHẠY NỀN: khởi động → chạy MÃI, chờ có việc thì làm

   Ví dụ: máy chủ web, database, và... Docker
```

Docker có một chương trình chạy nền tên là `dockerd`. Khi bạn gõ `docker run`, lệnh `docker` chỉ **gửi yêu cầu** cho `dockerd` làm. Đây là lý do lỗi *"Cannot connect to the Docker daemon"* nghĩa là **Docker chưa chạy**, chứ không phải chưa cài ([Phase 1 bài 3](../phase-1/03-cai-dat-docker.md)).

---

## 7. YAML — định dạng file cấu hình dùng suốt khoá

Từ Phase 6 trở đi, gần như mọi file cấu hình đều viết bằng YAML. Nó chỉ có vài quy tắc.

```yaml
# Dấu thăng là chú thích

ten: myapp                    # cặp khoá - giá trị
phien_ban: 3                  # số
dang_chay: true               # đúng/sai

# Danh sách — mỗi mục một dấu gạch ngang
cong:
  - 3000
  - 8080

# Lồng nhau — THỤT LỀ để thể hiện cấp
database:
  host: localhost
  port: 5432
  thong_tin:
    user: admin
    password: bimat
```

Cấu trúc trên nghĩa là:

```text
   ten           = "myapp"
   phien_ban     = 3
   cong          = danh sách [3000, 8080]
   database.host = "localhost"
   database.thong_tin.user = "admin"
```

### Bốn quy tắc, và cả bốn đều gây lỗi cho người mới

**1. Chỉ dùng DẤU CÁCH để thụt lề, không dùng tab.**

```text
   error: found character '\t' that cannot start any token
```

Đây là lỗi YAML phổ biến nhất. Nhiều trình soạn thảo chèn tab tự động — hãy bật chế độ "chuyển tab thành dấu cách".

**2. Thụt lề phải nhất quán.** Hai dấu cách là quy ước phổ biến. Sai một dấu cách là sai cấu trúc.

```yaml
database:
  host: localhost
   port: 5432          # ✗ thụt lề khác dòng trên → lỗi
```

**3. Sau dấu hai chấm phải có một dấu cách.**

```yaml
ten:myapp              # ✗
ten: myapp             # ✓
```

**4. Cẩn thận với giá trị trông giống số hoặc đúng/sai.**

```yaml
phien_ban: 3.10        # YAML đọc là SỐ 3.1  (mất số 0!)
phien_ban: "3.10"      # ✓ chuỗi

bat: yes               # YAML cũ đọc "yes" thành true
bat: "yes"             # ✓ nếu bạn muốn chữ "yes"

cong: 56:80            # YAML đọc thành số phút giây!
cong: "56:80"          # ✓
```

> **Quy tắc an toàn cho người mới**: khi nghi ngờ, **để giá trị trong nháy kép**. Nó không bao giờ sai.

Kiểm tra file YAML có hợp lệ không trước khi dùng:

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('docker-compose.yml')); print('YAML hop le')"
```

---

## Bảng tra nhanh: gặp từ này thì hiểu là gì

| Từ tiếng Anh | Tiếng Việt | Nghĩa ngắn |
|---|---|---|
| process | tiến trình | chương trình đang chạy |
| port | cổng | con số để phân biệt dịch vụ trên cùng một máy |
| host | máy chủ / máy thật | máy đang chạy Docker (phân biệt với bên trong container) |
| mount | gắn | làm thư mục chỗ này xuất hiện ở chỗ khác |
| path | đường dẫn | vị trí file trong hệ thống file |
| environment variable | biến môi trường | cặp `TÊN=giá trị` truyền vào chương trình |
| daemon | chương trình chạy nền | chạy mãi, chờ việc |
| kernel | nhân | phần lõi hệ điều hành, quản phần cứng |
| client / server | máy khách / máy chủ | bên hỏi / bên trả lời |
| localhost | — | chính máy này (`127.0.0.1`) |
| DNS | — | dịch tên miền sang địa chỉ IP |
| exit code | mã thoát | số báo chương trình chạy đúng (`0`) hay lỗi (khác `0`) |
| stdout / stderr | đầu ra chuẩn / lỗi chuẩn | nơi chương trình in ra màn hình |
| CLI | giao diện dòng lệnh | gõ lệnh thay vì bấm chuột |
| YAML | — | định dạng file cấu hình dựa vào thụt lề |

---

## Mười lỗi người mới hay gặp — và chúng đều bắt nguồn từ bài này

| Lỗi | Khái niệm liên quan |
|---|---|
| `port is already allocated` | **Cổng** — một cổng chỉ một tiến trình |
| `Cannot connect to the Docker daemon` | **Daemon** — Docker chưa chạy, không phải chưa cài |
| Gọi `localhost` trong container không thấy database trên máy | **localhost** = chính container đó |
| Gắn thư mục bằng đường dẫn tương đối, container thấy rỗng | **Đường dẫn tuyệt đối** |
| YAML báo lỗi `cannot start any token` | **Tab thay vì dấu cách** |
| `ports: 56:80` cho kết quả lạ | **YAML đọc thành số phút giây** |
| Đổi biến môi trường mà chương trình không nhận | Biến đặt **lúc khởi động**, không đổi được sau |
| Container `Exited (0)` và tưởng là hỏng | **Mã thoát 0 = thành công**, chỉ là tiến trình đã xong |
| Sửa file trong container xong mất hết | **Tiến trình kết thúc là RAM mất** |
| Không thấy log dù ứng dụng có ghi | Kubernetes chỉ đọc **stdout/stderr**, không đọc file |

Không cần thuộc bảng này bây giờ. Khi gặp lỗi ở các phase sau, quay lại đây tra là được.

---

## Tự kiểm tra

**1. Chương trình khác tiến trình chỗ nào?**

<details><summary>Đáp án</summary>

Chương trình là **file trên đĩa** (tĩnh). Tiến trình là chương trình **đang chạy trong RAM** (động). Một file chạy được nhiều tiến trình cùng lúc.
</details>

**2. Vì sao hai ứng dụng không cùng nghe một cổng được?**

<details><summary>Đáp án</summary>

Vì cổng là **địa chỉ đích** để hệ điều hành biết chuyển gói tin cho ai. Hai người cùng một địa chỉ thì không biết đưa cho ai. Lỗi là `address already in use`.
</details>

**3. `localhost` trỏ tới đâu?**

<details><summary>Đáp án</summary>

**Chính máy đang gõ lệnh** (`127.0.0.1`). Không phải một địa chỉ trên Internet. Quan trọng: bên trong container, `localhost` là **chính container đó**, không phải máy bạn.
</details>

**4. Vì sao dùng biến môi trường thay vì ghi cấu hình thẳng vào code?**

<details><summary>Đáp án</summary>

Để **cùng một bản code chạy được ở mọi môi trường** — chỉ khác giá trị biến. Và để mật khẩu **không nằm trong Git**.
</details>

**5. Nhân (kernel) làm gì, và vì sao điều đó liên quan tới container?**

<details><summary>Đáp án</summary>

Nhân quản **mọi truy cập tới phần cứng**: file, mạng, bộ nhớ, tiến trình. Ứng dụng phải nhờ nhân chứ không chạm thẳng phần cứng. Vì nhiều ứng dụng **dùng chung được một nhân**, nên không cần mỗi cái một hệ điều hành riêng — đó chính là container.
</details>

**6. Trong YAML, vì sao nên để `"3.10"` trong nháy kép?**

<details><summary>Đáp án</summary>

Không có nháy kép, YAML đọc `3.10` thành **số 3.1** — mất số 0. Với phiên bản phần mềm thì đó là giá trị sai hoàn toàn. Quy tắc an toàn: nghi ngờ thì để nháy kép.
</details>

---

## Tóm tắt bài 0.1

- **Chương trình là file trên đĩa; tiến trình là nó đang chạy trong RAM.** Tiến trình kết thúc là mọi thứ trong RAM mất — đây là gốc rễ của việc cần volume sau này.
- **Mã thoát `0` là thành công, khác `0` là lỗi.** Docker và Kubernetes dựa hoàn toàn vào quy ước này.
- **Cổng là con số phân biệt dịch vụ trên cùng một máy**, và **một cổng chỉ một tiến trình** — nguồn của lỗi `address already in use`.
- **Đường dẫn tuyệt đối bắt đầu bằng `/`**; Docker yêu cầu đường dẫn tuyệt đối khi gắn thư mục.
- **Gắn (mount)** = làm thư mục ở chỗ này xuất hiện ở chỗ khác, giống cắm USB.
- **Biến môi trường** cho phép cùng một bản code chạy ở mọi môi trường, và giữ mật khẩu ngoài Git. Nó **đặt lúc khởi động và không đổi được sau đó**.
- **`localhost` = chính máy này.** Bên trong container, nó là **chính container đó** — nhầm chỗ này là lỗi phổ biến nhất khi mới học Docker.
- **Nhân (kernel)** quản mọi truy cập phần cứng. Vì nhiều ứng dụng dùng chung được một nhân nên container mới nhẹ được.
- **Daemon** là chương trình chạy nền; `dockerd` là daemon của Docker, và lỗi *"cannot connect to daemon"* nghĩa là **Docker chưa chạy**.
- **YAML**: chỉ dùng dấu cách (không tab), thụt lề nhất quán, sau dấu hai chấm có dấu cách, và **nghi ngờ thì để nháy kép**.

---

**Bài kế tiếp** → [Bài 0.2: Từ điển thuật ngữ Docker cho người mới](02-tu-dien-thuat-ngu-docker.md)
