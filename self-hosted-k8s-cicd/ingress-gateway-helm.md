# Expose & đóng gói ứng dụng: Ingress-nginx, Gateway API, và Helm (trên cụm đa máy ARM64)

> Tiếp nối [`setup-tu-macbook-m5-vmware-fusion-multi-vm.md`](./setup-tu-macbook-m5-vmware-fusion-multi-vm.md). Cụm đã chạy (master + 2 worker + registry riêng + runner riêng, ARM64), app BE + FE đã deploy bằng NodePort. Bài này nâng cấp 2 thứ:
> 1. **Cách lộ app ra ngoài cho "ra dáng"**: từ NodePort thô → **MetalLB + Ingress-nginx**, rồi giới thiệu **Gateway API** (chuẩn mới thay Ingress).
> 2. **Cách đóng gói & deploy**: từ đống YAML rời rạc → **Helm chart** (template tự sinh service/deployment/ingress), nối thẳng vào CI/CD.

Giữ nguyên giả định **mọi thứ là ARM64** (M5). Các image dùng ở đây (ingress-nginx, metallb, nginx-gateway-fabric...) đều multi-arch nên chạy arm64 bình thường.

---

## 0. Vì sao cần phần này?

### 0.1. NodePort thô ở chỗ nào?

Ở file trước, FE expose qua `http://<node-ip>:30080`. Vấn đề:

- **Phải nhớ port lẻ** (30000–32767) và **IP của node**.
- **Mỗi service một port** → 5 service là 5 port khác nhau, không có một "cửa trước" thống nhất.
- Không định tuyến theo **domain** (`app.local`, `api.local`) hay theo **đường dẫn** (`/api`, `/admin`).
- Không có chỗ tập trung làm **TLS**, rate-limit, redirect.

→ Cần một **reverse proxy ở tầng cụm** đứng trước mọi service. Đó là **Ingress** (cũ) hoặc **Gateway API** (mới).

### 0.2. Đống YAML rời rạc ở chỗ nào?

Ở file trước, `k8s/app.yaml` hardcode mọi thứ: tên image, số replica, tag... Khi có nhiều môi trường (dev/staging/prod) hoặc nhiều service, bạn phải copy-paste YAML và sửa tay → dễ sai, khó quản. → Cần **Helm** để *template hóa*: viết một bộ khuôn, truyền giá trị khác nhau cho từng môi trường.

### 0.3. Bức tranh sau khi xong

```text
   Mac browser
   http://app.local ─┐   http://api.local ─┐
                     ▼                      ▼
        ┌──────────────────────────────────────────┐
        │  MetalLB cấp 1 IP "LoadBalancer"          │
        │  (vd 192.168.184.200) trên dải NAT        │
        └───────────────────┬──────────────────────┘
                            ▼
        ┌──────────────────────────────────────────┐
        │  Ingress-nginx (HOẶC Gateway API)         │  ← "cửa trước" duy nhất
        │  app.local → Service frontend             │
        │  api.local → Service backend              │
        └──────────┬───────────────────┬────────────┘
                   ▼                    ▼
            Service frontend      Service backend
                   │                    │
              Pod FE (nginx)       Pod BE (node)
   ─────────────────────────────────────────────────
   Tất cả đóng gói & deploy bằng:  Helm chart
   (templates/deployment.yaml, service.yaml, ingress.yaml + values.yaml)
```

### 0.4. Làm rõ ngay một hiểu nhầm: "Helm tạo Dockerfile"?

> **KHÔNG.** Phân biệt hai việc:
>
> | Việc | Đầu vào → đầu ra | Công cụ |
> |---|---|---|
> | **Build image** (đóng gói code → image) | source code → Docker image | `docker build` + **Dockerfile**; hoặc **không cần Dockerfile**: Buildpacks (`pack`), Jib (Java), ko (Go), Skaffold |
> | **Deploy manifest** (mô tả cách chạy trên K8s) | values → các file YAML (Deployment/Service/Ingress) | **Helm**, Kustomize |
>
> **Helm chỉ làm việc thứ hai** — sinh ra **manifest YAML**, không sinh Dockerfile. Cái mà bạn nhớ "tự động tạo ra các file" chính là lệnh **`helm create`**: nó scaffold sẵn `deployment.yaml`, `service.yaml`, `ingress.yaml`, `hpa.yaml`... trong thư mục `templates/`. Còn thứ *tự sinh image mà không cần viết Dockerfile* là **Cloud Native Buildpacks / Skaffold** — sẽ nhắc ở Phần 5.4.

---

## 1. MetalLB — cấp IP LoadBalancer cho cụm bare-metal

> **Vì sao cần?** Trên cloud, Service kiểu `LoadBalancer` được cloud cấp một IP công khai. Cụm tự dựng (VM/bare-metal) **không có ai cấp IP** → Service `LoadBalancer` treo mãi ở trạng thái `<pending>`. **MetalLB** đóng vai "nhà cấp IP" đó: lấy một dải IP rảnh trong mạng NAT và gán cho các Service LoadBalancer (chế độ L2/ARP).

Chạy trên **master**:

```bash
# Cài MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml
kubectl -n metallb-system rollout status deploy/controller --timeout=120s
```

Cấp một dải IP **nằm trong subnet NAT nhưng KHÔNG trùng DHCP** (ví dụ NAT là `192.168.184.0/24`, ta lấy `.200–.210`):

```yaml
# metallb-pool.yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: lan-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.184.200-192.168.184.210     # dải rảnh, đừng đè IP tĩnh của VM (.10/.11/.20/.30)
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement           # quảng bá IP qua ARP trong mạng L2 (NAT)
metadata:
  name: lan-l2
  namespace: metallb-system
spec:
  ipAddressPools: [lan-pool]
```

```bash
kubectl apply -f metallb-pool.yaml
```

> **Bẫy đặc thù VMware Fusion NAT**: chế độ L2 của MetalLB dùng ARP. Mạng NAT của Fusion **thường cho ARP nội bộ hoạt động**, nên Mac (cùng vmnet) gọi được IP MetalLB. Nếu không gọi được, kiểm tra dải IP có nằm đúng subnet NAT không, và IP đó chưa bị VM nào chiếm.

---

## 2. Ingress-nginx — "cửa trước" cổ điển (tách riêng)

> **Ingress** = một tài nguyên K8s mô tả luật định tuyến HTTP (host/path → Service). Nhưng Ingress resource **chỉ là tờ khai** — cần một **Ingress Controller** thực thi nó. **ingress-nginx** là controller phổ biến nhất: bản chất là một con nginx chạy trong cụm, đọc các Ingress resource và tự sinh cấu hình nginx.

### 2.1. Cài ingress-nginx (dùng Helm — tiện thể làm quen Helm)

Cài Helm trên **runner** (và Mac nếu muốn) trước:

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

Cài controller, để nó xin IP từ MetalLB (Service type LoadBalancer):

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer

# Xem IP MetalLB đã cấp cho ingress:
kubectl -n ingress-nginx get svc ingress-nginx-controller
# EXTERNAL-IP sẽ là 192.168.184.200 (lấy từ pool) — đây là "cửa trước" của cụm
```

### 2.2. Khai báo luật định tuyến (Ingress resource)

Định tuyến **theo host**: `app.local` → frontend, `api.local` → backend.

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: app.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: frontend, port: { number: 80 } } }
    - host: api.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: backend, port: { number: 3000 } } }
```

```bash
kubectl apply -f ingress.yaml
```

Trên **Mac**, trỏ domain về IP MetalLB (sửa `/etc/hosts`):

```bash
# 192.168.184.200 = EXTERNAL-IP của ingress-nginx-controller
echo "192.168.184.200  app.local api.local" | sudo tee -a /etc/hosts
```

Mở trình duyệt Mac: `http://app.local` (FE), `http://api.local` (BE). **Không còn port lẻ, không còn IP node.**

> **Lúc này có thể bỏ NodePort của FE** — để Service frontend/backend về `ClusterIP`, mọi traffic vào qua ingress. Sạch hơn.

### 2.3. TLS (HTTPS) — nhắc nhanh

Production thật dùng **cert-manager** tự xin/gia hạn cert (Let's Encrypt nếu có domain public, hoặc CA nội bộ). Trong lab, tạo TLS Secret từ cert tự ký rồi tham chiếu trong `spec.tls` của Ingress. (Có thể tách thành bài riêng — báo nếu cần.)

---

## 3. Gateway API — chuẩn mới thay thế Ingress

> **Gateway API** (`gateway.networking.k8s.io`) là thế hệ kế tiếp của Ingress, được cộng đồng K8s đẩy làm chuẩn chính. Lý do ra đời: Ingress quá đơn giản, mọi tính năng nâng cao (split traffic, header match, gRPC, TLS phức tạp) đều phải nhét vào **annotation** của riêng từng controller → không chuẩn hóa, khó port. Gateway API tách vai trò rõ ràng và biểu đạt bằng **CRD thật**, không dùng annotation.

### 3.1. Mô hình 3 lớp (khác hẳn Ingress một-file)

```text
GatewayClass   (ai cung cấp? — vd nginx-gateway-fabric)   ← admin cụm định nghĩa 1 lần
     ▲
Gateway        (mở listener: cổng 80/443, host nào)         ← team hạ tầng tạo
     ▲
HTTPRoute      (luật: host/path → Service)                  ← team ứng dụng tạo, nhiều route
```

> **Vì sao tách 3 lớp?** Trong tổ chức lớn: admin chọn *công nghệ* (GatewayClass), team platform mở *cổng* (Gateway), còn dev chỉ khai *route của app mình* (HTTPRoute) mà không đụng cấu hình hạ tầng. Ingress gộp hết vào một resource → khó phân quyền.

### 3.2. Cài Gateway API + một implementation (NGINX Gateway Fabric)

Gateway API chỉ là **bộ CRD chuẩn**; phải có một controller hiện thực nó. Ở đây dùng **NGINX Gateway Fabric** cho liền mạch với nginx.

```bash
# 1) Cài CRD chuẩn Gateway API
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml

# 2) Cài NGINX Gateway Fabric (image multi-arch → chạy arm64) qua Helm
helm install ngf oci://ghcr.io/nginxinc/charts/nginx-gateway-fabric \
  --create-namespace -n nginx-gateway \
  --set service.type=LoadBalancer       # lấy IP từ MetalLB
```

### 3.3. Khai báo Gateway + HTTPRoute (tương đương Ingress ở Phần 2)

```yaml
# gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: app-gateway
spec:
  gatewayClassName: nginx          # do NGINX Gateway Fabric cung cấp
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes: { namespaces: { from: All } }
---
# route-frontend.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: frontend-route }
spec:
  parentRefs: [{ name: app-gateway }]
  hostnames: ["app.local"]
  rules:
    - backendRefs: [{ name: frontend, port: 80 }]
---
# route-backend.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: backend-route }
spec:
  parentRefs: [{ name: app-gateway }]
  hostnames: ["api.local"]
  rules:
    - backendRefs: [{ name: backend, port: 3000 }]
```

```bash
kubectl apply -f gateway.yaml -f route-frontend.yaml -f route-backend.yaml
kubectl get gateway app-gateway       # ADDRESS = IP MetalLB cấp cho gateway
# Trỏ app.local/api.local trên Mac về IP đó (như Phần 2.2)
```

### 3.4. Ingress hay Gateway API — chọn cái nào?

| | Ingress (+nginx) | Gateway API |
|---|---|---|
| Độ chín / tài liệu | Rất nhiều, lâu đời | Mới nhưng đã GA, đang là tương lai |
| Tính năng nâng cao | Qua annotation (không chuẩn) | Built-in, chuẩn hóa (traffic split, header match...) |
| Phân quyền team | Gộp 1 resource | Tách 3 lớp, rõ vai trò |
| Khuyến nghị | Đang chạy ổn thì giữ | Dự án mới nên cân nhắc |

> **Cho lab này**: dùng **một trong hai**, đừng cài cả hai cùng tranh IP/cổng. Ingress-nginx (Phần 2) đủ dùng và đơn giản hơn. Gateway API (Phần 3) để bạn biết hướng đi mới. Phần Helm dưới đây minh họa bằng Ingress (phổ biến hơn).

---

## 4. Helm — đóng gói app thành chart (tự sinh các file deployment/service/ingress)

> **Helm** = trình quản lý gói cho Kubernetes ("apt/brew của K8s"). Khái niệm cốt lõi:
>
> - **Chart**: một gói chứa các *template* manifest + giá trị mặc định.
> - **Values** (`values.yaml`): tham số (image, tag, replica, host...) bơm vào template.
> - **Template** (`templates/*.yaml`): manifest có chỗ trống `{{ .Values.xxx }}`.
> - **Release**: một lần cài chart vào cụm (có tên, có lịch sử để rollback).

### 4.1. `helm create` — đây chính là "tự động tạo ra các file"

```bash
helm create backend
```

Lệnh này scaffold sẵn cả cây thư mục — **đây là các file** mà bạn nhớ:

```text
backend/
├── Chart.yaml              # metadata chart (tên, version)
├── values.yaml            # ⭐ giá trị mặc định (image, replica, service, ingress...)
├── charts/                # subchart phụ thuộc (nếu có)
└── templates/
    ├── deployment.yaml     # ⭐ Deployment đã template sẵn
    ├── service.yaml        # ⭐ Service đã template sẵn
    ├── ingress.yaml        # ⭐ Ingress (bật/tắt qua values)
    ├── hpa.yaml            # auto-scaling
    ├── serviceaccount.yaml
    ├── _helpers.tpl        # hàm tạo tên/label dùng chung
    └── NOTES.txt           # lời nhắc in ra sau khi cài
```

> Vậy "installer tự tạo file" = `helm create`. Bạn không phải viết `deployment.yaml`/`service.yaml` từ đầu — Helm sinh khung, bạn chỉ chỉnh `values.yaml`.

### 4.2. Cấu hình chart cho Backend

Sửa `backend/values.yaml` trỏ vào registry riêng (ARM64) của ta:

```yaml
# backend/values.yaml (rút gọn phần quan trọng)
replicaCount: 2

image:
  repository: registry.local:5000/backend
  tag: "latest"                 # CI sẽ override bằng commit SHA
  pullPolicy: IfNotPresent

imagePullSecrets:
  - name: regcred               # secret pull từ registry riêng

service:
  type: ClusterIP               # BE kín, chỉ FE/ingress gọi
  port: 3000

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.local
      paths:
        - path: /
          pathType: Prefix

resources:
  limits:   { cpu: 500m, memory: 256Mi }
  requests: { cpu: 100m, memory: 128Mi }

livenessProbe:
  httpGet: { path: /health, port: 3000 }
readinessProbe:
  httpGet: { path: /health, port: 3000 }
```

Một đoạn template tiêu biểu (`templates/deployment.yaml`) trông như sau — thấy rõ chỗ "điền giá trị":

```yaml
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: {{ .Values.service.port }}
```

### 4.3. Cài / nâng cấp / rollback

```bash
# Cài lần đầu (hoặc nâng cấp nếu đã có) — idempotent:
helm upgrade --install backend ./backend --namespace default

# Xem các release:
helm list

# Đổi 1 giá trị mà không sửa file (vd tag image):
helm upgrade backend ./backend --set image.tag=a1b2c3d --wait

# Lịch sử & rollback (giống kubectl rollout undo nhưng cấp chart):
helm history backend
helm rollback backend 1
```

> **Vì sao Helm hơn `kubectl apply` rời rạc?**
> - **Một lệnh ra nhiều manifest** nhất quán (deployment + service + ingress + hpa).
> - **Đa môi trường**: `-f values-dev.yaml` / `-f values-prod.yaml` cùng một chart, khác giá trị.
> - **Release có version + rollback** ở cấp toàn bộ ứng dụng.
> - **Tái sử dụng**: FE chỉ cần một `values` khác (image frontend, host app.local, service port 80), dùng lại cùng khuôn.

### 4.4. Frontend — tái dùng cùng khuôn

```bash
helm create frontend
```

Chỉnh `frontend/values.yaml`: `image.repository: registry.local:5000/frontend`, `service.port: 80`, ingress host `app.local`, bỏ `livenessProbe` path `/health` (FE nginx dùng `/`). Rồi `helm upgrade --install frontend ./frontend`.

> **Gọn hơn nữa (umbrella chart)**: tạo một chart cha `myapp` khai báo `backend` và `frontend` là **dependencies** trong `Chart.yaml`, deploy cả hệ thống bằng một `helm upgrade --install myapp ./myapp`. Phù hợp khi BE + FE luôn release cùng nhau.

---

## 5. Nối Helm vào CI/CD (cập nhật workflow của file trước)

### 5.1. Cài Helm trên runner

Đã làm ở Phần 2.1. Helm dùng `~/.kube/config` của user `ubuntu` (đã cấu hình ở file trước) nên deploy được ngay.

### 5.2. Workflow mới — build rồi `helm upgrade`

Thay bước `kubectl set image` bằng `helm upgrade`:

```yaml
# .github/workflows/deploy.yml — phần thay đổi ở step Deploy
      - name: Build & push backend
        run: |
          docker build -t $REGISTRY/backend:${{ steps.vars.outputs.tag }} ./backend
          docker push   $REGISTRY/backend:${{ steps.vars.outputs.tag }}
      - name: Build & push frontend
        run: |
          docker build -t $REGISTRY/frontend:${{ steps.vars.outputs.tag }} ./frontend
          docker push   $REGISTRY/frontend:${{ steps.vars.outputs.tag }}

      - name: Deploy via Helm
        run: |
          helm upgrade --install backend ./charts/backend \
            --set image.repository=$REGISTRY/backend \
            --set image.tag=${{ steps.vars.outputs.tag }} \
            --wait --timeout 120s
          helm upgrade --install frontend ./charts/frontend \
            --set image.repository=$REGISTRY/frontend \
            --set image.tag=${{ steps.vars.outputs.tag }} \
            --wait --timeout 120s
```

> `--wait` làm Helm **chờ** pod mới `Ready` (giống `rollout status`); pod lỗi → job đỏ. `--install` khiến lệnh chạy được cả lần đầu (chưa có release) lẫn các lần sau. Tag = commit SHA bất biến, y như nguyên tắc ở các file trước.

### 5.3. Luồng hoàn chỉnh

```text
git push → runner: build BE+FE (arm64) → push registry.local:5000
         → helm upgrade --install (--set image.tag=SHA)
         → Helm render deployment/service/ingress → apply → chờ Ready
         → http://app.local trên Mac thấy bản mới ✅   (rollback: helm rollback)
```

### 5.4. "Tự sinh image không cần Dockerfile" — nếu đó là thứ bạn nhớ

Nếu cái bạn nhớ là *khỏi viết Dockerfile*, thì đó **không phải Helm** mà là các công cụ build:

| Công cụ | Làm gì | Khi nào |
|---|---|---|
| **Cloud Native Buildpacks** (`pack build`) | Dò ngôn ngữ, tự build image, **không cần Dockerfile** | Muốn chuẩn hóa build nhiều app |
| **Jib** | Build image Java **không cần Docker daemon/Dockerfile** | App Java/Maven/Gradle |
| **ko** | Build image Go cực nhanh, không Dockerfile | App Go |
| **Skaffold** | Điều phối build (Docker/Buildpacks) + deploy (Helm/kustomize), watch & redeploy | Dev loop nhanh trên K8s |

→ Trong bài này ta vẫn dùng **Dockerfile + docker build** (rõ ràng, dễ debug, hợp BE Node + FE nginx). Helm lo phần *deploy*. Đừng trộn lẫn hai vai trò.

---

## 6. Troubleshooting riêng phần Ingress / Gateway / Helm

| Tình huống | Triệu chứng | Xử lý |
|---|---|---|
| Service LoadBalancer `<pending>` mãi | `kubectl get svc` EXTERNAL-IP `<pending>` | Chưa cài MetalLB / dải IP sai subnet → Phần 1 |
| Gọi IP MetalLB không vào | Timeout từ Mac | IP không thuộc subnet NAT, hoặc ARP bị chặn → đổi dải, kiểm tra Fusion NAT |
| Ingress trả **404** | Vào ingress nhưng không tới app | Sai `host`/`path`, hoặc `ingressClassName` không khớp controller; `kubectl describe ingress` |
| Ingress trả **502/503** | Tới ingress, không tới pod | Service `endpoints` rỗng (selector sai) hoặc pod chưa Ready → `kubectl get endpoints <svc>` |
| Domain không phân giải | `app.local` không mở được | Chưa thêm vào `/etc/hosts` của **Mac**, hoặc trỏ sai IP |
| Gateway `PROGRAMMED=False` | HTTPRoute không hiệu lực | Thiếu implementation (NGINX Gateway Fabric chưa cài), hoặc `gatewayClassName` sai → Phần 3.2 |
| `helm upgrade` báo `another operation in progress` | Release kẹt ở `pending-upgrade` | `helm rollback <rel> <rev-tốt>`; nặng thì `helm uninstall` rồi cài lại |
| Helm render sai/thiếu giá trị | Pod sai image/thiếu env | `helm template ./chart --set ...` để xem YAML *trước khi* apply; `helm get values <rel>` xem giá trị đang chạy |
| Đổi values nhưng pod không cập nhật | Helm báo deployed nhưng pod cũ | Giá trị không làm đổi template (vd chỉ đổi configmap) → thêm checksum annotation, hoặc `kubectl rollout restart` |
| `exec format error` sau deploy | Pod CrashLoop | Image build nhầm amd64 — xem [bài VM, Phần 15](./setup-tu-macbook-m5-vmware-fusion-multi-vm.md) (build trên runner ARM) |

Lệnh chẩn đoán hay dùng:

```bash
kubectl get svc -A | grep LoadBalancer        # IP đã cấp chưa
kubectl describe ingress app-ingress          # luật + Events
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller   # log nginx ingress
kubectl get httproute,gateway -A              # trạng thái Gateway API
helm template ./backend --set image.tag=test  # render thử, không apply
helm get manifest backend                      # YAML thực Helm đã apply
```

---

## 7. Tóm tắt

1. **MetalLB** cấp IP `LoadBalancer` cho cụm bare-metal (dải IP rảnh trong subnet NAT) — nếu thiếu, Service LoadBalancer treo `<pending>` (Phần 1).
2. **Ingress-nginx** = controller (con nginx trong cụm) thực thi **Ingress resource** → một "cửa trước" định tuyến theo host/path; bỏ được NodePort thô (Phần 2).
3. **Gateway API** = chuẩn mới thay Ingress, tách 3 lớp **GatewayClass → Gateway → HTTPRoute**, cần một implementation (NGINX Gateway Fabric) (Phần 3).
4. **Helm** đóng gói app thành **chart**: `helm create` tự sinh `deployment.yaml`/`service.yaml`/`ingress.yaml` trong `templates/`, `values.yaml` chứa tham số; deploy bằng `helm upgrade --install`, rollback bằng `helm rollback` (Phần 4).
5. **CI/CD**: thay `kubectl set image` bằng `helm upgrade --install --set image.tag=$SHA --wait` (Phần 5).

> **3 điều cốt lõi:**
> 1. **Ingress/Gateway cần một "IP ngoài"** — trên bare-metal đó là việc của **MetalLB**.
> 2. **Helm sinh *manifest*, KHÔNG sinh *Dockerfile*.** Muốn build image không cần Dockerfile là chuyện của Buildpacks/Skaffold/ko/Jib — vai trò khác hẳn.
> 3. **`helm create` = "installer tự tạo file"** bạn nhớ: nó scaffold sẵn deployment/service/ingress để bạn chỉ chỉnh `values.yaml`.
