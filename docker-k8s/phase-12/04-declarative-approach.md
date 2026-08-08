# Bài 4: Declarative Approach — YAML Config Files

## Imperative vs Declarative

```text
Imperative (lệnh):
  kubectl create deployment ...
  kubectl expose deployment ...
  kubectl scale ...
  → Phải nhớ và gõ từng lệnh
  → Khó track thay đổi
  → Khó share với team

Declarative (file):
  kubectl apply -f deployment.yaml
  → Mọi thứ trong file YAML
  → Git-trackable
  → Dễ share, dễ review
  → Thay đổi chỉ cần edit file + re-apply
```

---

## Cấu Trúc File YAML

```yaml
apiVersion: apps/v1        # Version của API Kubernetes
kind: Deployment           # Loại object
metadata:
  name: my-app-deployment  # Tên object
spec:
  # ... cấu hình ...
```

**Cách tìm apiVersion:**
- Deployment: `apps/v1`
- Service: `v1`
- Tìm trong docs: kubernetes.io/docs → API Reference

---

## Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-deployment
spec:
  replicas: 1                    # Số Pods muốn chạy
  selector:
    matchLabels:
      app: my-app                # Chọn Pods có label này
  template:                      # Blueprint cho Pods
    metadata:
      labels:
        app: my-app              # Label gán cho Pods
    spec:
      containers:
        - name: my-app-container
          image: USERNAME/my-app:v1
          ports:
            - containerPort: 80
```

**Apply:**
```bash
kubectl apply -f deployment.yaml
# → deployment.apps/my-app-deployment created

kubectl get deployments
kubectl get pods
```

---

## Service YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app              # Chọn Pods có label app=my-app
  ports:
    - protocol: TCP
      port: 80               # Port expose ra ngoài
      targetPort: 80         # Port trong container
  type: LoadBalancer
```

**Apply:**
```bash
kubectl apply -f service.yaml
# → service/my-app-service created

minikube service my-app-service  # Truy cập
```

---

## Labels & Selectors — Cơ Chế Kết Nối

### Labels

```yaml
metadata:
  labels:
    app: my-app        # Key: Value, tự đặt
    tier: backend      # Có thể có nhiều labels
    version: "1.0"
```

Labels = Metadata tags gắn vào objects.

### Selectors

Dùng để một object "tìm" và "kiểm soát" objects khác.

```yaml
# Deployment selector (kiểu mới, dùng matchLabels):
spec:
  selector:
    matchLabels:
      app: my-app        # Deployment quản lý Pods có label này

# Service selector (kiểu cũ, đơn giản hơn):
spec:
  selector:
    app: my-app          # Service expose Pods có label này
```

**Vì sao cần selector?**
```text
Deployment tạo Pods → Nhưng nếu scale, có Pods mới xuất hiện
  → Deployment cần biết Pods nào THUỘC về nó
  → Dựa vào label matching

Service cũng không biết Pods nào cần expose
  → Dựa vào label selector để tìm đúng Pods
```

### matchExpressions (selector nâng cao)

```yaml
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In          # In, NotIn, Exists, DoesNotExist
        values:
          - my-app
          - other-app
```

---

## Cập Nhật Resource

```bash
# Thay đổi replicas trong file
# replicas: 3  (đổi từ 1 thành 3)

# Re-apply: chỉ apply phần đã thay đổi
kubectl apply -f deployment.yaml
# → deployment.apps/my-app-deployment configured
```

**Kubernetes chỉ apply delta (phần thay đổi)** — không recreate từ đầu.

---

## Xóa Resource

```bash
# Xóa theo tên (imperative)
kubectl delete deployment my-app-deployment
kubectl delete service my-app-service

# Xóa theo file (declarative)
kubectl delete -f deployment.yaml
kubectl delete -f deployment.yaml -f service.yaml

# Xóa theo label
kubectl delete deployments,services -l group=example
```

---

## Gộp Nhiều Resources Vào 1 File

```yaml
# master-deployment.yaml

apiVersion: v1
kind: Service              # Service trước (best practice)
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer

---                        # ← 3 dashes phân cách resources

apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: USERNAME/my-app:v1
```

```bash
kubectl apply -f master-deployment.yaml
# → Tạo cả Service lẫn Deployment cùng lúc
```

---

## Khi Nào Dùng Imperative vs Declarative?

```text
Imperative:
  ✓ Học, thử nghiệm nhanh
  ✓ One-off commands (scale, rollback)
  ✓ Debug và investigate

Declarative:
  ✓ Production deployments
  ✓ Team collaboration
  ✓ GitOps (config in Git)
  ✓ Reproducible deployments
  ✓ CI/CD pipelines
```

---

## `apply` khác `create` và `replace` chỗ nào

Ba lệnh này nhìn giống nhau nhưng hành xử rất khác:

| Lệnh | Object chưa tồn tại | Object đã tồn tại | Ghi nhớ thay đổi |
|---|---|---|---|
| `kubectl create -f` | Tạo mới | **Lỗi** `already exists` | Không |
| `kubectl replace -f` | **Lỗi** `not found` | **Thay toàn bộ** | Không |
| **`kubectl apply -f`** | **Tạo mới** | **Gộp thay đổi** | **Có** |

`apply` là lệnh bạn nên dùng gần như mọi lúc, vì nó **cùng một lệnh cho cả tạo mới lẫn cập nhật** — điều kiện để đưa vào CI/CD.

Cách `apply` biết phải gộp gì: nó lưu bản YAML bạn gửi lần trước vào một chú thích:

```bash
kubectl get deployment myapp -o jsonpath='{.metadata.annotations}' | head -c 200
```

```text
{"kubectl.kubernetes.io/last-applied-configuration":"{\"apiVersion\":\"apps/v1\"...
```

Nhờ bản lưu đó, `apply` **phân biệt được** giữa "trường này tôi cố ý bỏ đi" và "trường này tôi chưa bao giờ quản lý":

```text
   Lần 1 apply:  replicas: 3, image: v1
   Ai đó chạy:   kubectl scale --replicas=10      (không qua YAML)
   Lần 2 apply:  replicas: 3, image: v2

   → apply đặt lại replicas về 3 (vì nó CÓ quản trường này)
   → nhưng KHÔNG đụng tới các trường Kubernetes tự điền
```

Đây cũng là lý do **không nên trộn `kubectl scale`/`kubectl edit` với `apply`**: lần apply tiếp theo sẽ ghi đè thay đổi thủ công, thường vào lúc bạn không ngờ nhất.

### `kubectl diff` — xem trước khi áp dụng

```bash
kubectl diff -f deployment.yaml
```

```text
--- /tmp/LIVE-3847293/apps.v1.Deployment.default.myapp
+++ /tmp/MERGED-9182734/apps.v1.Deployment.default.myapp
@@ -28,7 +28,7 @@
       containers:
       - name: myapp
-        image: myapp:v1
+        image: myapp:v2
```

Lệnh này nên chạy **trước mỗi lần apply ở production**. Nó cho biết chính xác điều gì sắp thay đổi — nhiều sự cố bắt nguồn từ việc apply một file mà không biết nó khác gì với thực tế.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Trộn `kubectl scale`/`edit` với `apply` | Thay đổi thủ công bị ghi đè ở lần apply sau | Chọn một cách: hoặc tất cả qua YAML, hoặc tất cả thủ công |
| Sửa `selector` của Deployment đang chạy | Bị từ chối — **trường bất biến** | Phải xoá Deployment rồi tạo lại |
| `selector.matchLabels` không khớp `template.metadata.labels` | Deployment bị từ chối, hoặc tạo Pod mà không quản được | Hai chỗ phải khớp nhau |
| Thụt lề bằng tab trong YAML | `error converting YAML to JSON` | YAML chỉ chấp nhận **dấu cách** |
| Quên `---` giữa nhiều object trong một file | Chỉ object đầu được tạo | Ngăn cách bằng `---` |
| `apply` một thư mục mà quên `-R` | Bỏ sót file trong thư mục con | `kubectl apply -f ./k8s -R` |
| Xoá dòng khỏi YAML rồi tưởng đã gỡ cấu hình | Chỉ đúng nếu trường đó **do apply quản lý** | Kiểm tra bằng `kubectl diff` |
| Không dùng `kubectl diff` trước khi apply ở production | Áp dụng thay đổi ngoài dự tính | Luôn `diff` trước |

---

## Tóm tắt bài 4

- **Khai báo (declarative) là cách làm đúng cho production**: file YAML trong Git là nguồn sự thật duy nhất.
- **`apply` là lệnh dùng gần như mọi lúc** — cùng một lệnh cho cả tạo mới lẫn cập nhật, nên đưa được vào CI/CD. `create` lỗi khi object đã có; `replace` thay toàn bộ và lỗi khi chưa có.
- `apply` lưu bản YAML lần trước trong chú thích **`last-applied-configuration`** để biết trường nào nó quản lý — đó là cơ chế gộp thay đổi.
- **Đừng trộn `kubectl scale`/`kubectl edit` với `apply`** — thay đổi thủ công sẽ bị ghi đè.
- **`selector` của Deployment là bất biến.** Muốn đổi thì phải xoá và tạo lại.
- **`kubectl diff -f` trước mỗi lần apply ở production** — nó cho biết chính xác điều gì sắp đổi.

---

**Bài kế tiếp** → [Bài 5: Cấu Hình Nâng Cao — Liveness Probes & Image Pull Policy](05-configuration-advanced.md)
