# Bài 3: Service Containers — Chạy Database trong Workflow

## Vấn đề: Test cần database nhưng không muốn dùng database production

Khi chạy integration tests (test thực sự kết nối database), bạn không muốn:
- Dùng database production → rủi ro xóa/thay đổi data thật
- Tốn thêm tài nguyên trên server production
- Maintain một server database test riêng chạy 24/7 chỉ để dùng khi CI chạy

**Giải pháp:** Service Containers — spin up database trong container **chỉ trong lúc workflow đang chạy**, sau đó tự động xóa.

---

## Cú pháp Service Container

Thêm key `services` vào job (lưu ý là `services` số nhiều):

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:                          # ← các services chạy song song với job
      mongodb:                         # ← label, tự đặt tên
        image: mongo                   # ← image từ Docker Hub
        env:
          MONGO_INITDB_ROOT_USERNAME: root
          MONGO_INITDB_ROOT_PASSWORD: example
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
```

`services` cấu hình container **riêng biệt** chạy song song với các steps của job. Không phải bước trong job, mà là "dịch vụ nền".

---

## Kết nối đến Service Container

Cách kết nối phụ thuộc vào **job có chạy trong container không**:

### Trường hợp 1: Job chạy trong container (có `container:`)

GitHub tự động tạo network nội bộ. Dùng **label của service** như địa chỉ host:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:16             # job chạy trong container
    services:
      mongodb:                   # label = "mongodb"
        image: mongo
        env:
          MONGO_INITDB_ROOT_USERNAME: root
          MONGO_INITDB_ROOT_PASSWORD: example
    env:
      MONGODB_CLUSTER_ADDRESS: mongodb    # ← dùng label làm host
      MONGODB_USERNAME: root
      MONGODB_PASSWORD: example
    steps:
      - run: npm test
```

Địa chỉ `mongodb` (label) được resolve tự động thành IP của service container.

### Trường hợp 2: Job chạy trực tiếp trên runner (không có `container:`)

Phải dùng `localhost` và phải **mở port** trên service container:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    # KHÔNG có container: ở đây
    services:
      mongodb:
        image: mongo
        env:
          MONGO_INITDB_ROOT_USERNAME: root
          MONGO_INITDB_ROOT_PASSWORD: example
        ports:
          - 27017:27017          # ← mở port: <port trên runner>:<port trong container>
    env:
      MONGODB_CLUSTER_ADDRESS: localhost:27017    # ← dùng localhost
      MONGODB_USERNAME: root
      MONGODB_PASSWORD: example
    steps:
      - run: npm test
```

`27017` là port mặc định của MongoDB. `ports:` map port từ container ra runner machine.

---

## So sánh hai cách kết nối

| | Job trong container | Job trên runner |
|---|---|---|
| Địa chỉ host | Label của service (ví dụ: `mongodb`) | `localhost` |
| Cần `ports:` | Không | Có |
| Setup phức tạp | Đơn giản hơn | Cần thêm cấu hình port |

---

## Ví dụ đầy đủ (job trong container)

```yaml
name: Integration Tests

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:16
    
    services:
      mongodb:
        image: mongo
        env:
          MONGO_INITDB_ROOT_USERNAME: root
          MONGO_INITDB_ROOT_PASSWORD: example
    
    env:
      MONGODB_CLUSTER_ADDRESS: mongodb    # ← label = host
      MONGODB_USERNAME: root
      MONGODB_PASSWORD: example
      MONGODB_DB_NAME: gha-test
      PORT: 8080
    
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node server.js &             # chạy server nền
      - run: npm test                     # tests kết nối đến server và mongodb
```

---

## Credentials của Service Container

Khi dùng MongoDB hay PostgreSQL image, bạn phải set credentials qua `env` của service. Sau đó **dùng đúng credentials đó** trong code kết nối.

Vì đây là database test tạm thời, dùng credentials đơn giản (`root/example`) là okay. Database này **không expose ra ngoài** và chỉ sống trong lúc workflow chạy.

---

## Tóm tắt Phase 6

✅ **Container cho job**: Dùng key `container:` để chạy toàn bộ steps trong Docker container  
✅ **Docker Hub**: Nơi tìm images công khai (node, mongo, postgres, python...)  
✅ **Service containers**: Dùng key `services:` để chạy database/service phụ bên cạnh job  
✅ **Network**: Job trong container → dùng label làm host; Job trên runner → dùng localhost + ports  

---

**Phase 7:** Custom Actions — Tự xây dựng Actions →
