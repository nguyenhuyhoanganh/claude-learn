# Bài 2: Giao Tiếp Bên Trong Pod (Pod-internal)

## Kịch Bản: Nhiều Containers Trong 1 Pod

Đôi khi 2 containers cần giao tiếp chặt chẽ với nhau, ví dụ:
- **Users API** cần gọi **Auth API** để validate token
- Cả 2 đặt trong cùng 1 Pod (tight coupling)

```yaml
# users-deployment.yaml
spec:
  template:
    spec:
      containers:
        - name: users        # Container 1
          image: users-image
          ports:
            - containerPort: 8080

        - name: auth         # Container 2
          image: auth-image
          ports:
            - containerPort: 80
```

---

## localhost — Địa Chỉ Ma Thuật

Khi 2 containers trong **cùng 1 Pod**, chúng giao tiếp qua **`localhost`**:

```javascript
// users-api code - gọi auth-api
const AUTH_ADDRESS = process.env.AUTH_ADDRESS;

// Trong Kubernetes pod-internal:
// AUTH_ADDRESS = 'localhost'
// → gửi request đến localhost:80 (port của auth container)

axios.get(`http://${AUTH_ADDRESS}/verify`);
```

### Config Env Var trong Deployment

```yaml
containers:
  - name: users
    image: users-image
    env:
      - name: AUTH_ADDRESS
        value: localhost     # ← localhost vì cùng Pod

  - name: auth
    image: auth-image
```

---

## So Sánh với Docker Compose

```
Docker Compose:
  services:
    users: ...
    auth: ...
  → Giao tiếp qua service name: "auth"
  → axios.get('http://auth/verify')

Kubernetes (same pod):
  → Giao tiếp qua localhost
  → axios.get('http://localhost/verify')

Kubernetes (different pods):
  → Giao tiếp qua ClusterIP service name (sẽ học ở bài tiếp)
```

---

## Service Expose Chỉ Public Container

```yaml
# users-service.yaml
spec:
  selector:
    app: users          # Chọn Pod có label app=users
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080  # Port của users container

# Không expose port 80 của auth container!
# Auth chỉ được gọi qua localhost từ bên trong Pod
```

```
Internet → users-service → Pod:8080 (users container)
                               ↓ localhost:80
                           Pod:80 (auth container)
                           [Không accessible từ ngoài]
```

---

## Khi Nào Đặt 2 Containers Trong 1 Pod?

```
✓ Dùng cùng 1 Pod khi:
  → Hai services phụ thuộc chặt chẽ
  → Luôn cần scale cùng nhau
  → Cần chia sẻ volumes
  → Cần localhost communication

✗ Không nên dùng 1 Pod khi:
  → Hai services có thể scale độc lập
  → Một service có thể dùng bởi nhiều services khác
  → Muốn kiểm soát lifecycle riêng biệt

→ Thường tốt hơn là dùng 2 Deployments riêng
  + ClusterIP service để communicate
```

---

## 2/2 — Xem Trạng Thái

```bash
kubectl get pods
# NAME                              READY   STATUS
# users-deployment-xxx-yyy          2/2     Running
#                                   ↑
#                               2 containers trong 1 Pod
```

---

**Tiếp theo:** Giao tiếp giữa các Pods khác nhau →
