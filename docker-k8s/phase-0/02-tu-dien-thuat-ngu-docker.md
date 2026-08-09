# Bài 0.2: Từ điển thuật ngữ Docker cho người mới

Khi mới học Docker, cảm giác khó chịu nhất không phải là lệnh khó, mà là **các từ nghe giống nhau mà nghĩa khác nhau**: image và container, volume và bind mount, `run` và `start`, `CMD` và `ENTRYPOINT`.

Bài này giải nghĩa từng từ theo cùng một khuôn: **nó là gì → ví dụ nhỏ nhất → bẫy của người mới**. Đọc xong bạn sẽ hiểu được một lệnh Docker lạ mà không phải tra từng cờ.

> Bài này giả định bạn đã đọc [Bài 0.1](01-kien-thuc-nen-truoc-khi-hoc-docker.md) — hoặc đã biết tiến trình, cổng, đường dẫn, biến môi trường là gì.

---

## Bốn từ cốt lõi, hiểu đúng là xong 80%

### Image — bản đóng gói, nằm im trên đĩa

> **Image** là một **gói** chứa đủ mọi thứ để chạy một ứng dụng: mã nguồn, runtime, thư viện, cấu hình. Nó **chỉ đọc** và **không tự chạy**.

```bash
docker images
```

```text
REPOSITORY   TAG       IMAGE ID       SIZE
node         18        a3f2b8c1d4e5   1.09GB
nginx        alpine    9d8c7b6a5f4e   43.2MB
```

**Ví von**: image giống **file cài đặt** của một phần mềm. Nó nằm đó, không làm gì, cho tới khi bạn chạy nó.

> **Bẫy người mới**: tải image về (`docker pull`) **không phải** là chạy nó. Nhiều người `docker pull nginx` rồi mở trình duyệt và thắc mắc sao không thấy gì.

### Container — image đang chạy

> **Container** là một **tiến trình** được tạo ra từ image, chạy trong môi trường cách ly.

```bash
docker ps
```

```text
CONTAINER ID   IMAGE          STATUS         PORTS                    NAMES
7f3a2b1c9d4e   node:18        Up 2 minutes   0.0.0.0:3000->3000/tcp   my-app
```

```text
   MỘT image  ──►  tạo được NHIỀU container

   image nginx
        ├──► container "web-1"   (đang chạy)
        ├──► container "web-2"   (đang chạy)
        └──► container "web-thu" (đã dừng)
```

> **Bẫy người mới**: `docker images` và `docker ps` là **hai danh sách khác nhau**. Không thấy gì ở `docker ps` không có nghĩa là chưa tải image.

### Dockerfile — công thức để tạo image

> **Dockerfile** là một **file văn bản** mô tả từng bước tạo ra image. Mỗi dòng là một chỉ thị.

```dockerfile
FROM node:18            # bắt đầu từ image có sẵn
WORKDIR /app            # đặt thư mục làm việc bên trong
COPY package.json .     # chép file từ máy bạn vào image
RUN npm install         # chạy lệnh LÚC BUILD
COPY . .
CMD ["node", "server.js"]   # lệnh chạy LÚC KHỞI ĐỘNG container
```

```text
   Dockerfile  ──docker build──►  Image  ──docker run──►  Container
   (công thức)                   (gói)                    (đang chạy)
```

> **Bẫy người mới**: `RUN` chạy **lúc build image**, `CMD` chạy **lúc khởi động container**. Nhầm hai cái này là lỗi Dockerfile phổ biến nhất.

### Registry — nơi lưu và chia sẻ image

> **Registry** là kho chứa image trên mạng. Docker Hub là registry công khai mặc định.

```bash
docker pull nginx           # tải VỀ máy
docker push myuser/myapp    # đẩy LÊN registry
```

```text
   Ví von: registry giống GitHub, nhưng cho image thay vì mã nguồn

   docker pull  ≈  git clone
   docker push  ≈  git push
```

---

## Bảng ba từ hay bị nhầm nhất

| | Là gì | Trạng thái | Lệnh liên quan |
|---|---|---|---|
| **Dockerfile** | Công thức (file văn bản) | Bạn viết bằng tay | `docker build` |
| **Image** | Gói đã đóng, chỉ đọc | Nằm trên đĩa | `docker images`, `docker pull` |
| **Container** | Tiến trình đang chạy | Trong RAM | `docker ps`, `docker run` |

Cách nhớ bằng một câu: **Dockerfile nấu ra Image, Image chạy thành Container.**

---

## Các chỉ thị trong Dockerfile

### `FROM` — bắt đầu từ image nào

```dockerfile
FROM node:18-alpine
```

Mọi Dockerfile **phải** bắt đầu bằng `FROM`. Bạn hầu như không bao giờ xây từ số không — luôn bắt đầu từ một image có sẵn.

> **Bẫy**: `FROM node:latest` nghe như "bản mới nhất" nhưng **`latest` chỉ là một cái tên tag**, có thể trỏ vào bản cũ. Luôn ghi phiên bản cụ thể.

### `WORKDIR` — đặt thư mục làm việc

```dockerfile
WORKDIR /app
```

Mọi lệnh sau đó chạy từ thư mục này. Tương đương `cd /app`, nhưng còn tự tạo thư mục nếu chưa có.

### `COPY` — chép file từ máy bạn vào image

```dockerfile
COPY package.json .        # chép một file
COPY . .                   # chép cả thư mục hiện tại
```

> **Bẫy**: `COPY . .` sẽ chép **cả `node_modules`, `.git`, `.env`** nếu bạn không có file `.dockerignore`. Đó là cách bí mật lọt vào image.

### `RUN` — chạy lệnh LÚC BUILD

```dockerfile
RUN npm install
RUN apt-get update && apt-get install -y curl
```

Kết quả của `RUN` được **đóng cứng vào image**. Chạy container lên là đã có sẵn.

### `CMD` — lệnh chạy LÚC KHỞI ĐỘNG container

```dockerfile
CMD ["node", "server.js"]
```

> **Bẫy quan trọng**: luôn viết dạng **mảng** `["node", "server.js"]`, đừng viết `CMD node server.js`. Dạng chuỗi khiến ứng dụng không nhận được tín hiệu dừng và bị giết cứng sau 10 giây ([Phase 2 bài 5](../phase-2/05-dockerfile-best-practices.md)).

### `EXPOSE` — chỉ là ghi chú

```dockerfile
EXPOSE 3000
```

> **Bẫy lớn nhất của người mới**: `EXPOSE` **KHÔNG mở cổng**. Nó chỉ là dòng ghi chú cho người đọc. Cổng thật mở bằng cờ `-p` lúc `docker run`.

### `ENV` và `ARG`

```dockerfile
ARG NODE_VERSION=18        # chỉ tồn tại LÚC BUILD
ENV NODE_ENV=production    # tồn tại LÚC CHẠY, trong container
```

| | `ARG` | `ENV` |
|---|---|---|
| Tồn tại lúc | Build | **Chạy** |
| Container thấy không | **Không** | Có |
| Truyền vào bằng | `--build-arg` | `-e` hoặc `--env-file` |

> **Bẫy**: **cả hai đều không giữ được bí mật** — `docker history` đọc được `ARG`, `docker inspect` đọc được `ENV`.

---

## Các cờ của `docker run` — giải nghĩa từng cái

Đây là lệnh bạn gõ nhiều nhất, và các cờ của nó gây bối rối nhất:

```bash
docker run -d -p 8080:3000 --name my-app -v $(pwd):/app -e NODE_ENV=dev myimage
#          ▲  ▲             ▲            ▲              ▲                 ▲
#          │  │             │            │              │                 └ image
#          │  │             │            │              └ biến môi trường
#          │  │             │            └ gắn thư mục
#          │  │             └ đặt tên container
#          │  └ ánh xạ cổng
#          └ chạy nền
```

| Cờ | Nghĩa | Không có thì |
|---|---|---|
| `-d` | Chạy nền (detached) | Container chiếm terminal, đóng cửa sổ là nó dừng |
| `-p 8080:3000` | Cổng **máy bạn**:cổng **container** | Không truy cập được từ trình duyệt |
| `--name` | Đặt tên | Docker tự đặt tên ngẫu nhiên kiểu `nifty_bell` |
| `-v` | Gắn thư mục hoặc volume | Dữ liệu mất khi xoá container |
| `-e` | Đặt biến môi trường | Ứng dụng dùng giá trị mặc định |
| `-it` | Tương tác + terminal giả | Lệnh cần nhập liệu sẽ treo hoặc thoát ngay |
| `--rm` | Tự xoá container khi dừng | Container dừng tích tụ lại |

### Thứ tự của `-p` — nhớ bằng một câu

```text
   -p <cổng máy thật>:<cổng trong container>
      ▲                ▲
      NGOÀI vào        TRONG ra

   -p 8080:3000  →  vào http://localhost:8080
                    container nghe ở cổng 3000
```

Cách nhớ: **ngoài trước, trong sau** — giống địa chỉ viết từ ngoài vào trong.

---

## Nơi lưu dữ liệu — ba loại, đừng nhầm

```bash
docker run -v ten-volume:/data     myimage   # 1. named volume
docker run -v /Users/toi/app:/app  myimage   # 2. bind mount
docker run -v /data                myimage   # 3. anonymous volume
```

| Loại | Cú pháp | Dữ liệu nằm ở | Dùng cho |
|---|---|---|---|
| **Named volume** | `-v tên:/đường/dẫn` | Docker quản, trong `/var/lib/docker/volumes/` | **Dữ liệu cần giữ** (database) |
| **Bind mount** | `-v /đường/dẫn/thật:/đường/dẫn` | Thư mục **trên máy bạn** | **Lúc dev** — sửa code thấy ngay |
| **Anonymous volume** | `-v /đường/dẫn` | Docker quản, tên ngẫu nhiên | Che một thư mục khỏi bị bind mount đè |

Cách phân biệt nhanh chỉ bằng cách nhìn phần **trước dấu hai chấm**:

```text
   Bắt đầu bằng /  hoặc $(pwd)  →  BIND MOUNT (thư mục máy bạn)
   Là một cái tên               →  NAMED VOLUME
   Không có gì trước dấu :      →  ANONYMOUS VOLUME
```

> **Bẫy**: viết `-v ./src:/app` (đường dẫn tương đối) với `docker run` sẽ **không** tạo bind mount như bạn nghĩ. Phải dùng `$(pwd)/src`. (Riêng trong file Compose thì đường dẫn tương đối lại hợp lệ.)

---

## Docker Compose — chạy nhiều container bằng một file

> **Docker Compose** thay nhiều lệnh `docker run` dài bằng **một file YAML**.

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16
    volumes:
      - du-lieu-db:/var/lib/postgresql/data

volumes:
  du-lieu-db:
```

```bash
docker compose up -d       # khởi động tất cả
docker compose logs -f     # xem log
docker compose down        # dừng và xoá container (GIỮ dữ liệu)
docker compose down -v     # ⚠ xoá cả dữ liệu
```

Ba điều đáng nhớ ngay:

| Điều | Chi tiết |
|---|---|
| Các service **tự thấy nhau bằng tên** | Trong `web`, gọi `db:5432` là tới service `db` — không cần biết địa chỉ IP |
| **`down -v` xoá dữ liệu thật** | Không có hoàn tác. Đừng gõ theo phản xạ |
| `depends_on` **chỉ đảm bảo thứ tự khởi động** | Không đảm bảo database đã sẵn sàng nhận kết nối |

---

## Đọc một lệnh Docker lạ trong bốn bước

Gặp lệnh dài không hiểu, làm theo thứ tự này:

```bash
docker run -d --rm --name api -p 8080:3000 -v $(pwd)/data:/app/data \
  -e NODE_ENV=production --network mang-cua-toi node:18-alpine npm start
```

```text
   BƯỚC 1 — Tìm TÊN IMAGE. Nó luôn đứng SAU tất cả các cờ.
            → node:18-alpine

   BƯỚC 2 — Xem có gì SAU tên image không.
            → npm start   (ghi đè lệnh mặc định CMD của image)

   BƯỚC 3 — Đọc các cờ từ trái sang phải:
            -d                     chạy nền
            --rm                   xong thì tự xoá
            --name api             tên container là "api"
            -p 8080:3000           localhost:8080 → cổng 3000 trong container
            -v $(pwd)/data:/app/data   gắn thư mục data của máy vào container
            -e NODE_ENV=production biến môi trường
            --network mang-cua-toi tham gia mạng tên "mang-cua-toi"

   BƯỚC 4 — Ghép lại thành một câu:
            "Chạy nền một container tên api từ image node:18-alpine,
             chạy lệnh npm start, mở cổng 8080 về cổng 3000,
             gắn thư mục data, đặt NODE_ENV=production,
             nối vào mạng mang-cua-toi, xong thì tự xoá."
```

Quy tắc vàng: **mọi thứ trước tên image là cờ của Docker; mọi thứ sau tên image là lệnh chạy bên trong container.**

---

## Bảng tra thuật ngữ

| Thuật ngữ | Tiếng Việt | Nghĩa ngắn gọn |
|---|---|---|
| **image** | ảnh / gói | Gói chỉ đọc, chứa app + mọi thứ cần chạy |
| **container** | vùng chứa | Image đang chạy — một tiến trình bị cách ly |
| **Dockerfile** | — | File văn bản mô tả cách tạo image |
| **build** | dựng | Biến Dockerfile thành image |
| **layer** | lớp | Mỗi dòng Dockerfile tạo một lớp, xếp chồng lên nhau |
| **registry** | kho image | Nơi lưu và chia sẻ image (Docker Hub, ECR) |
| **tag** | nhãn | Tên phiên bản của image (`node:18`) |
| **pull / push** | tải về / đẩy lên | Lấy image từ registry / đưa lên registry |
| **volume** | ổ lưu trữ | Nơi giữ dữ liệu sống lâu hơn container |
| **bind mount** | gắn thư mục | Nối thư mục máy bạn vào container |
| **port mapping** | ánh xạ cổng | Nối cổng máy thật với cổng container (`-p`) |
| **network** | mạng | Cho phép container gọi nhau bằng tên |
| **Compose** | — | Chạy nhiều container bằng một file YAML |
| **daemon** | tiến trình nền | `dockerd` — thứ thật sự tạo và chạy container |
| **build context** | ngữ cảnh build | Thư mục Docker gửi cho daemon khi build (dấu `.` cuối lệnh) |
| **detached** | chạy nền | Cờ `-d`, container chạy mà không chiếm terminal |
| **prune** | dọn dẹp | Xoá thứ không dùng (**cẩn thận với `--volumes`**) |

---

## Mười lăm bẫy của người mới, gom một chỗ

| Bẫy | Sự thật |
|---|---|
| Tải image xong tưởng đã chạy | `pull` chỉ tải về, phải `run` mới có container |
| Nhầm `docker images` với `docker ps` | Hai danh sách khác nhau: gói trên đĩa và tiến trình đang chạy |
| Tưởng `EXPOSE` mở cổng | Nó chỉ là ghi chú. `-p` mới mở cổng |
| Viết ngược `-p 3000:8080` | Luôn là **cổng máy thật : cổng container** |
| Sửa code xong không thấy đổi | Code nằm trong image từ lúc build — phải build lại |
| Chạy `docker run` hai lần cùng `--name` | Lỗi trùng tên. Dùng `docker start`, hoặc `--rm` |
| Thấy `Exited (0)` tưởng hỏng | `0` = thành công. Container đã làm xong việc |
| Quên `-d`, đóng terminal là app chết | Thêm `-d` |
| Quên `-it` với lệnh hỏi tương tác | Lệnh treo hoặc bỏ qua mọi câu hỏi |
| `docker exec ... bash` báo không tìm thấy | Image tối giản (alpine) chỉ có `sh` |
| Dùng `-v ./src:/app` với `docker run` | Phải là đường dẫn tuyệt đối: `$(pwd)/src` |
| Xoá container xong mất hết dữ liệu | Cần **volume** cho dữ liệu cần giữ |
| `docker system prune --volumes` cho gọn | **Xoá dữ liệu thật**, không hoàn tác |
| `COPY . .` mà không có `.dockerignore` | `.git`, `.env`, `node_modules` vào thẳng image |
| Dùng `latest` rồi tưởng luôn mới nhất | `latest` chỉ là tên tag, có thể là bản cũ |

---

## Tự kiểm tra

**1. Sắp xếp đúng thứ tự: Container, Dockerfile, Image.**

<details><summary>Đáp án</summary>

**Dockerfile → Image → Container.** Dockerfile là công thức, `docker build` nấu ra Image, `docker run` chạy Image thành Container.
</details>

**2. `RUN npm install` và `CMD ["node","server.js"]` chạy vào lúc nào?**

<details><summary>Đáp án</summary>

`RUN` chạy **lúc build image** — kết quả đóng cứng vào image. `CMD` chạy **lúc khởi động container**. Nhầm hai cái này là lỗi Dockerfile phổ biến nhất.
</details>

**3. `-p 8080:3000` nghĩa là gì?**

<details><summary>Đáp án</summary>

Truy cập `http://localhost:8080` trên **máy bạn** sẽ được chuyển vào **cổng 3000 bên trong container**. Thứ tự luôn là **ngoài trước, trong sau**.
</details>

**4. `docker ps` không thấy container nào. Có phải Docker hỏng không?**

<details><summary>Đáp án</summary>

Không. `docker ps` chỉ hiện container **đang chạy**. Container đã dừng thì xem bằng `docker ps -a`. Và nếu bạn chỉ mới `docker pull` thì chưa có container nào cả.
</details>

**5. Muốn dữ liệu database còn nguyên sau khi xoá container thì làm gì?**

<details><summary>Đáp án</summary>

Dùng **named volume**: `-v ten-volume:/var/lib/postgresql/data`. Dữ liệu ghi vào lớp container sẽ mất khi `docker rm`.
</details>

**6. Nhìn `-v abc:/data` và `-v /home/toi/abc:/data`, làm sao biết cái nào là bind mount?**

<details><summary>Đáp án</summary>

Nhìn phần **trước dấu hai chấm**. Bắt đầu bằng `/` (hoặc `$(pwd)`) là **bind mount** — thư mục thật trên máy bạn. Là một cái tên thường là **named volume** do Docker quản.
</details>

---

## Tóm tắt bài 0.2

- Một câu để nhớ cả bốn khái niệm cốt lõi: **Dockerfile nấu ra Image, Image chạy thành Container, Registry là nơi cất Image.**
- **`RUN` chạy lúc build; `CMD` chạy lúc khởi động container.** Nhầm hai cái này là lỗi Dockerfile phổ biến nhất.
- **`EXPOSE` không mở cổng** — nó chỉ là ghi chú. Cờ **`-p`** mới mở, và thứ tự luôn là **cổng máy thật : cổng container**.
- Ba loại lưu trữ phân biệt bằng phần **trước dấu hai chấm**: bắt đầu bằng `/` là **bind mount**, là một cái tên là **named volume**, không có gì là **anonymous volume**.
- **Đường dẫn tương đối không dùng được với `docker run -v`** — phải `$(pwd)/...`. (Trong Compose thì được.)
- **Docker Compose** thay nhiều lệnh dài bằng một file YAML, và các service **tự gọi nhau bằng tên**. Nhưng **`down -v` xoá dữ liệu thật**.
- Quy tắc đọc mọi lệnh Docker: **trước tên image là cờ của Docker, sau tên image là lệnh chạy bên trong container**.
- **`latest` không có nghĩa là mới nhất** — nó chỉ là một cái tên tag.

---

**Bài kế tiếp** → [Bài 0.3: Từ điển thuật ngữ Kubernetes cho người mới](03-tu-dien-thuat-ngu-kubernetes.md)
