# Tổng Kết Phase 12 — Kubernetes Core Concepts

## Những Gì Đã Học

### 1. Setup Môi Trường
```text
kubectl  → CLI giao tiếp với cluster
minikube → Cluster local trong VM (cho development)

minikube start --driver=virtualbox
kubectl version --client
minikube status
```

### 2. Kubernetes Objects

```text
Pod        = Đơn vị nhỏ nhất, bọc container(s)
           → Ephemeral, cluster-internal IP
           → Không tạo trực tiếp

Deployment = Controller quản lý Pods
           → Auto-restart, scaling, rolling update, rollback

Service    = Expose Pods ra ngoài
           → IP cố định, load balancing
           → ClusterIP / NodePort / LoadBalancer
```

### 3. Imperative vs Declarative

```bash
# Imperative (lệnh)
kubectl create deployment NAME --image=IMAGE
kubectl expose deployment NAME --port=PORT --type=LoadBalancer
kubectl scale deployment/NAME --replicas=3
kubectl set image deployment/NAME CONTAINER=IMAGE:TAG
kubectl rollout undo deployment/NAME

# Declarative (file)
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl delete -f deployment.yaml
```

### 4. YAML Structure

```yaml
apiVersion: apps/v1        # Deployment
kind: Deployment
metadata:
  name: my-app
  labels:
    group: my-group
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: USERNAME/my-app:v1
          imagePullPolicy: Always
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            periodSeconds: 10
            initialDelaySeconds: 5
---
apiVersion: v1             # Service
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer
```

### 5. Labels & Selectors

```text
Labels:    Metadata tags gắn vào objects (key: value)
Selectors: Cơ chế kết nối objects với nhau

Deployment → matchLabels → chọn Pods nào thuộc về mình
Service    → selector    → chọn Pods nào cần expose

matchExpressions: selector nâng cao với In/NotIn/Exists/DoesNotExist
```

### 6. Rolling Updates

```text
Khi deploy version mới:
  Old Pod (v1) tiếp tục chạy
  ↓
  New Pod (v2) tạo + start
  ↓ (v2 healthy)
  Old Pod (v1) bị xóa

→ Zero downtime!
→ kubectl rollout undo để rollback
```

---

## Cheat Sheet

```bash
# CLUSTER
minikube start --driver=virtualbox
minikube status
minikube dashboard
minikube service SERVICE-NAME    # Truy cập service (local only)

# CREATE
kubectl apply -f FILE.yaml
kubectl create deployment NAME --image=IMAGE

# READ
kubectl get deployments
kubectl get pods
kubectl get services
kubectl describe pod POD-NAME

# UPDATE
kubectl apply -f FILE.yaml       # Re-apply sau khi edit
kubectl set image deployment/NAME CONTAINER=IMAGE:TAG
kubectl scale deployment/NAME --replicas=N
kubectl rollout undo deployment/NAME
kubectl rollout history deployment/NAME

# DELETE
kubectl delete -f FILE.yaml
kubectl delete deployment NAME
kubectl delete service NAME
kubectl delete deployments,services -l group=example

# ROLLOUT
kubectl rollout status deployment/NAME
kubectl rollout history deployment/NAME --revision=2
kubectl rollout undo deployment/NAME --to-revision=1
```

---

## Key Takeaways

```text
1. Kubernetes works with Objects (Pod, Deployment, Service...)
2. Deployment manages Pods — tự restart, scale, rolling update
3. Service = stable endpoint cho Pods (LoadBalancer cho public access)
4. Labels + Selectors = cơ chế kết nối objects
5. Declarative (YAML) > Imperative (commands) cho production
6. imagePullPolicy: Always nếu dùng cùng tag
7. livenessProbe để tùy chỉnh health check
8. kubectl apply chỉ apply delta — không recreate từ đầu
```

---

---

## Tự kiểm tra — trả lời được hết thì phase này đã vững

Đọc lại thì dễ gật đầu; tự trả lời mới biết mình hiểu tới đâu. Thử trả lời trước khi xem đáp án.

**1. Xoá một Pod do Deployment tạo ra thì chuyện gì xảy ra? Vì sao?**

<details><summary>Đáp án</summary>

Pod mới hiện lại gần như ngay lập tức. Vì **trạng thái mong muốn** vẫn là 3 bản sao, và **vòng lặp điều hoà** thấy thực tế chỉ còn 2 nên tạo bù. Muốn xoá thật phải đổi ý muốn: `kubectl scale --replicas=0` hoặc xoá Deployment. Chi tiết: [bài 2 phase-11](../phase-11/02-kubernetes-la-gi.md).
</details>

**2. Pod kẹt ở `Pending`. Bạn đọc log ứng dụng và thấy rỗng. Sai ở đâu?**

<details><summary>Đáp án</summary>

Sai ở chỗ đọc log. `Pending` nghĩa là **scheduler chưa tìm được node** — container còn chưa được tạo nên log **luôn rỗng**. Phải đọc `kubectl describe pod` mục Events, nó nói chính xác vì sao từng node bị loại. Chi tiết: [bài 3 phase-11](../phase-11/03-kien-truc-kubernetes.md).
</details>

**3. `kubectl apply` khác `kubectl create` chỗ nào?**

<details><summary>Đáp án</summary>

`create` **lỗi** nếu object đã tồn tại. `apply` **tạo mới nếu chưa có, gộp thay đổi nếu đã có** — nên dùng được cùng một lệnh cho cả hai trường hợp, điều kiện để đưa vào CI/CD. Nó nhớ được nhờ chú thích `last-applied-configuration`.
</details>

**4. Vì sao không nên trộn `kubectl scale` với `kubectl apply`?**

<details><summary>Đáp án</summary>

`apply` quản trường `replicas` (nếu file YAML có khai). Lần apply sau sẽ **ghi đè** con số bạn vừa scale bằng tay — thường vào lúc bất ngờ nhất. Chọn một cách: hoặc tất cả qua YAML, hoặc dùng HPA và **bỏ hẳn `replicas` khỏi file**.
</details>

**5. `livenessProbe` của bạn gọi `/health`, và endpoint đó có kiểm tra kết nối database. Điều gì xảy ra khi database chậm?**

<details><summary>Đáp án</summary>

**Mọi Pod bị giết cùng lúc**, dù bản thân chúng hoàn toàn khoẻ. Pod còn lại gánh nhiều hơn, chậm hơn, cũng bị giết — sập dây chuyền. `livenessProbe` chỉ được hỏi *"tiến trình này còn chạy không"*; kiểm tra phụ thuộc là việc của `readinessProbe`. Chi tiết: [bài 5](05-configuration-advanced.md) và [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md).
</details>

**6. Service của bạn trả 503. Lệnh đầu tiên nên gõ là gì?**

<details><summary>Đáp án</summary>

`kubectl get endpoints <ten-service>`. Rỗng thì chỉ có **hai** nguyên nhân: **selector lệch nhãn Pod**, hoặc **Pod chưa Ready**. Chi tiết: [Phase 14 bài 1](../phase-14/01-services-va-pod-communication.md).
</details>

**7. Vì sao Pod tồn tại thay vì Kubernetes quản container trực tiếp?**

<details><summary>Đáp án</summary>

Vì có những container cần **chung IP, chung dải cổng, chung volume** — mẫu sidecar (thu thập log, proxy mạng). Pod cũng đảm bảo cả nhóm được xếp lên **cùng một node** và cùng sống cùng chết. Chi tiết: [bài 2](02-kubernetes-objects.md).
</details>

---

**Phase kế tiếp** → [Bài 1: Volumes trong Kubernetes — Lý Thuyết & So Sánh](../phase-13/01-volumes-trong-kubernetes.md)
