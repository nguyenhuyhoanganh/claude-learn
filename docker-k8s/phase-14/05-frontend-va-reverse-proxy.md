# Bài 5: Frontend & Reverse Proxy trong Kubernetes

## Vấn Đề: Frontend Chạy Ở Đâu?

React/Vue/Angular app = **JavaScript chạy trong browser**, không chạy trong container.

```
Container (nginx)          Browser (người dùng)
  └── Serve React files →  └── JS code chạy tại đây
                                  │
                                  └── Gọi API đến?
                                      → Không thể dùng
                                        cluster-internal domains!
                                        (auth-service.default không resolve
                                         từ browser, chỉ từ trong cluster)
```

---

## Giải Pháp Sai: Hard-code Public URL

```javascript
// app.js - Frontend code
const API_URL = 'http://12.34.56.78/api/tasks';  // IP của LoadBalancer
// → Phải hard-code IP, sẽ thay đổi khi redeploy
// → Không portable
```

---

## Giải Pháp Đúng: Reverse Proxy

Dùng nginx (server serve React app) như một **reverse proxy**:

```
Browser → http://frontend-url/api/tasks
                ↓ (nginx trong container nhận request)
nginx config → forward đến tasks-service.default:8000
                ↓ (request đi trong cluster)
Tasks Service Pod
```

### nginx.conf Config

```nginx
# conf/nginx.conf
server {
    listen 80;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html =404;
    }

    # Reverse proxy cho API requests
    location /api/ {
        proxy_pass http://tasks-service.default:8000/;
        # requests đến /api/... được forward đến tasks-service.default:8000/...
        # Trailing slash quan trọng!
    }
}
```

### Frontend Code (Không Hard-code URL)

```javascript
// App.js - React code
async function fetchTasks() {
    // Gửi đến CÙNG server đang serve frontend này
    // nginx sẽ forward đến tasks-service.default:8000
    const response = await fetch('/api/tasks');
    const data = await response.json();
    return data;
}

async function addTask(text) {
    await fetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ text }),
        headers: { 'Content-Type': 'application/json' }
    });
}
```

---

## Tại Sao Reverse Proxy Hoạt Động?

```
Browser gọi:  /api/tasks (cùng domain với frontend)
                ↓
nginx server (trong container, trong cluster) nhận
                ↓
nginx forward đến: tasks-service.default:8000/tasks
  → Đây là cluster-internal request!
  → CoreDNS resolve được tasks-service.default
  → Request tới Tasks API Pod
                ↓
Response trả về browser qua nginx
```

**Key insight**: nginx chạy **trong cluster** nên có thể dùng CoreDNS domains. Browser code không bao giờ thấy cluster-internal domains.

---

## Dockerfile cho Frontend (Multi-stage)

```dockerfile
# Stage 1: Build React app
FROM node:14-alpine as build

WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve với nginx
FROM nginx:stable-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY conf/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## Deployment cho Frontend

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: USERNAME/my-frontend:v1

---

apiVersion: v1
kind: Service
metadata:
  name: frontend-service
spec:
  selector:
    app: frontend
  type: LoadBalancer    # Public-facing
  ports:
    - port: 80
      targetPort: 80
```

---

## Toàn Bộ Architecture

```
Internet
  │
  ▼
LoadBalancer: frontend-service (port 80)
  │
  ▼
Frontend Pod (nginx)
  │  serve React files cho browser
  │  reverse proxy /api/* → tasks-service.default:8000
  │
  ├──(cluster-internal)──▶ tasks-service.default:8000
  │                              │
  │                              ▼
  │                         Tasks API Pod
  │
  └──(browser calls)──▶  [Không có gì - chỉ dùng /api/...]
```

---

## Lợi Ích của Reverse Proxy Pattern

```
✓ Frontend code không chứa IP/domain của backend
✓ Dùng cluster-internal DNS từ nginx
✓ Không cần CORS config (cùng origin)
✓ Dễ thay đổi backend URL (chỉ edit nginx.conf)
✓ Pattern phổ biến, không phải Kubernetes-specific
  (cũng dùng được với ECS, bare metal, v.v.)
```

---

**Tiếp theo:** Tổng kết Phase 14 →
