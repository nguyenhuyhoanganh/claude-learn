# Bài 3: Kết nối Containers với Docker Networks

## Tại sao cần Network?

Dùng IP/localhost để các containers giao tiếp qua host machine hoạt động được, nhưng không tối ưu:
- Phải publish port của tất cả containers
- MongoDB lộ ra ngoài (security risk)
- Mọi traffic đi qua host machine thay vì trực tiếp

**Giải pháp:** Tạo một Docker Network, đặt tất cả containers vào đó.

---

## Tạo Network và Chạy Containers

```bash
# Bước 1: Tạo network
docker network create goals-net

# Bước 2: MongoDB — KHÔNG cần publish port
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  mongo
# Không có -p 27017:27017 vì chỉ backend cần kết nối
# và backend cùng network → tự giao tiếp được

# Bước 3: Node Backend — vẫn cần publish port vì React (browser) cần gọi đến
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  goals-node

# Bước 4: React Frontend — publish port cho browser, KHÔNG cần network
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  goals-react
# Không cần --network vì React code chạy trong browser, không trong container
```

---

## Cập nhật Code để Dùng Container Names

### Backend (Node.js) → MongoDB

```javascript
// ❌ Trước: dùng host.docker.internal (khi MongoDB trên host)
mongoose.connect('mongodb://host.docker.internal:27017/mydb');

// ✅ Sau: dùng container name (cùng network)
mongoose.connect('mongodb://mongodb:27017/mydb');
//                       ↑
//                  Tên container MongoDB
//                  Docker resolve → IP tự động
```

### Backend cần rebuild sau khi đổi code

```bash
# Rebuild image sau khi đổi connection string
docker build -t goals-node ./backend

# Chạy lại container
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  goals-node
```

---

## Cái bẫy với React: Browser vs Container

### Lần thử đầu (sai)

```javascript
// Frontend App.js — thử dùng container name
fetch('http://goals-backend/goals')
//         ↑
//  Tưởng sẽ work như Node backend
```

```text
Kết quả: ERR_NAME_NOT_RESOLVED
```

### Lý do tại sao không hoạt động

```text
Node Backend (chạy TRONG container):
  Container → Docker Network → Resolve "mongodb" → Connect
  ✓ Docker xử lý DNS resolution

React Frontend:
  Dev server chạy trong container (chỉ serve files)
  ↓
  Browser download JavaScript
  ↓
  JavaScript chạy TRONG BROWSER (không trong container)
  Browser không biết "goals-backend" là gì
  ✗ Docker không thể giúp ở đây
```

```text
┌────────────────────────────────────────────────────────┐
│  Docker Container (React dev server)                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │  npm start → serves index.html + bundle.js      │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │ HTTP (port 3000 published)
                 ▼
┌────────────────────────────────────────────────────────┐
│  Browser                                               │
│  ┌─────────────────────────────────────────────────┐  │
│  │  bundle.js chạy ở đây                           │  │
│  │  fetch('http://goals-backend/goals')            │  │
│  │  ← Browser không hiểu "goals-backend"!          │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Giải pháp đúng cho React

```javascript
// ✅ Dùng localhost — browser hiểu, backend đã publish port 80
fetch('http://localhost/goals')
//          ↑
//     Backend publish -p 80:80
//     Browser → localhost:80 → Docker → Backend container
```

**Quy tắc:**
- Code chạy **trong container** (Node, Python, etc.) → dùng container name
- Code chạy **trong browser** (React, Vue, Angular) → dùng `localhost` + published port

---

## Sơ đồ giao tiếp cuối cùng

```text
Browser (user's machine)
   │
   │ localhost:3000 (React frontend)
   ▼
┌──────────────────┐
│  React Container │  ← --network KHÔNG cần
│  (dev server)    │
└──────────────────┘

Browser JavaScript
   │
   │ localhost:80 (Backend API)    ← Phải publish port 80
   ▼
┌──────────────────┐     goals-net     ┌──────────────────┐
│  Node Backend    │ ───────────────▶  │    MongoDB       │
│  Container       │   "mongodb:27017" │    Container     │
│  --network       │   (container name)│  --network       │
│  goals-net       │                   │  goals-net       │
└──────────────────┘                   └──────────────────┘
   Port 80 published                   Port 27017 NOT published
```

---

## Tóm tắt: Khi nào publish port?

```text
MongoDB container:  KHÔNG publish
  → Chỉ backend cần, cùng network, giao tiếp nội bộ

Node Backend:       CÓ publish (-p 80:80)
  → Browser (React) cần gọi vào đây

React Frontend:     CÓ publish (-p 3000:3000)
  → Browser cần tải React app từ đây
```

---

## Quy tắc phân biệt: code chạy Ở ĐÂU

Bẫy React ở trên không phải chuyện riêng của React. Nó là một quy tắc chung, và nắm được thì bạn không bao giờ mắc lại:

```text
   CÂU HỎI DUY NHẤT CẦN HỎI:
   "Đoạn code này chạy trong CONTAINER, hay chạy trong TRÌNH DUYỆT?"

   ┌──────────────────────────────────────────────────────────┐
   │  Chạy trong CONTAINER                                     │
   │  → gọi được TÊN CONTAINER                                 │
   │                                                            │
   │  • Node.js server (index.js, routes)                      │
   │  • Next.js getServerSideProps, API routes                 │
   │  • React SSR ở phía máy chủ                               │
   │  • Câu lệnh kết nối database                              │
   ├──────────────────────────────────────────────────────────┤
   │  Chạy trong TRÌNH DUYỆT                                   │
   │  → CHỈ gọi được localhost hoặc tên miền công khai         │
   │                                                            │
   │  • fetch/axios trong component React                      │
   │  • Bất cứ gì trong thẻ <script>                           │
   │  • Next.js code phía client (useEffect)                   │
   └──────────────────────────────────────────────────────────┘
```

Điều gây nhầm lẫn: **cùng một dự án React có cả hai loại code**. Với Next.js thì thậm chí cùng một file có thể chứa cả hai:

```javascript
// Next.js — CÙNG MỘT FILE
export async function getServerSideProps() {
  // Chạy TRONG CONTAINER → dùng được tên container
  const res = await fetch('http://backend:80/goals');
  return { props: { goals: await res.json() } };
}

export default function Page({ goals }) {
  useEffect(() => {
    // Chạy TRONG TRÌNH DUYỆT → PHẢI dùng localhost hoặc tên miền
    fetch('http://localhost:80/goals');
  }, []);
}
```

Cách kiểm tra nhanh khi nghi ngờ: mở tab **Network** của trình duyệt. Nếu bạn thấy request đó ở đó, nó chạy ở trình duyệt.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng tên container trong code React | `ERR_NAME_NOT_RESOLVED` ở tab Network | Code trình duyệt phải gọi `localhost` hoặc tên miền công khai |
| Sửa code backend mà không build lại image | Vẫn kết nối `localhost` như cũ | Code nằm trong image — phải `docker build` lại |
| Quên `--network` cho một trong các container | `getaddrinfo ENOTFOUND mongodb` | Cả hai container phải cùng network |
| Gọi cổng đã publish thay vì cổng thật | Backend gọi `mongodb:27017` đúng, nhưng nếu publish `-p 27018:27017` mà gọi `27018` thì hỏng | Trong network dùng **cổng bên trong** |
| Vẫn publish cổng MongoDB sau khi đã có network | Database phơi ra ngoài không cần thiết | Bỏ `-p` cho MongoDB |
| Thứ tự khởi động sai | Backend chết vì database chưa sẵn sàng | Docker không đảm bảo thứ tự — cần logic thử lại, hoặc `depends_on` + healthcheck ở [Phase 6](../phase-6/03-cau-hinh-services-chi-tiet.md) |

Dòng cuối đáng lưu ý: **Docker không chờ database sẵn sàng rồi mới chạy backend**. Ngay cả `depends_on` của Compose cũng chỉ đảm bảo **thứ tự khởi động**, không đảm bảo dịch vụ đã **sẵn sàng nhận kết nối**. Cách đúng là để ứng dụng **tự thử lại**:

```javascript
async function ketNoiVoiThuLai(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      return await mongoose.connect(process.env.MONGODB_URI);
    } catch (e) {
      console.log(`Chưa kết nối được, thử lại sau 3 giây (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Không kết nối được database sau nhiều lần thử');
}
```

---

## Tóm tắt bài 3

- Docker network cho phép container gọi nhau **bằng tên**, không cần đi vòng qua máy thật và không cần `-p`.
- **Bẫy lớn nhất của phase này**: code React chạy ở **trình duyệt**, không chạy trong container — nên nó **không** phân giải được tên container.
- Quy tắc để không bao giờ nhầm lại: hỏi **"đoạn code này chạy trong container hay trong trình duyệt?"**. Cùng một dự án Next.js có thể có cả hai loại trong **cùng một file**.
- Kiểm tra nhanh: nếu request hiện ở tab **Network** của trình duyệt thì nó chạy ở trình duyệt.
- Chỉ publish cổng cho thứ **trình duyệt cần gọi**. Database thì không.
- **Docker không đảm bảo database sẵn sàng trước khi backend chạy.** Ứng dụng phải tự có logic thử lại.

---

**Bài kế tiếp** → [Bài 4: Data Persistence và Hot-Reload](04-persistence-va-hot-reload.md)
