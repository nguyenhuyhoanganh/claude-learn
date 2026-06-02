# Bài 4: Encryption at Rest & Multi-Container Pods

## Phần 1: Encryption Secret Data at Rest

### Vấn đề: Secret default không an toàn

```text
[Pod tạo Secret]
        │
        ▼
   apiserver lưu vào etcd
        │
        ▼
   etcd ghi xuống disk
        │
        ▼
   [File trên disk]
   Secret value là plain text (hoặc base64)
        │
        ▼
   [Attacker access etcd]
   → Đọc value ngay không cần decrypt
```

→ Default K8s **không encrypt** Secret trong etcd. Ai access etcd = đọc Secret.

### Verify hiện trạng

```bash
# Check kube-apiserver có encryption không
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep encryption-provider-config

# Nếu không có output → chưa enable
```

### Demo: tìm Secret trong etcd

```bash
# Cài etcdctl
sudo apt-get install -y etcd-client

# Tạo Secret
kubectl create secret generic my-secret \
  --from-literal=key1=supersecret

# Đọc trực tiếp từ etcd
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/secrets/default/my-secret | hexdump -C

# Bạn sẽ thấy "supersecret" trong output → KHÔNG ENCRYPTED
```

### Setup Encryption at Rest

**Step 1**: Tạo encryption key (32-byte random):

```bash
ENC_KEY=$(head -c 32 /dev/urandom | base64)
echo $ENC_KEY
# vd: 8K9pq...= (32 byte base64)
```

**Step 2**: Tạo encryption config:

```yaml
# /etc/kubernetes/enc/enc.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets             # chỉ encrypt Secret object
    providers:
      - aescbc:             # ← thuật toán encrypt
          keys:
            - name: key1
              secret: <32-BYTE-KEY-BASE64>
      - identity: {}        # fallback: cho phép read plain text cũ
```

**Quan trọng**: thứ tự `providers` matter.
- Provider đầu tiên = dùng để **encrypt** writes mới.
- Mọi provider = thử **decrypt** reads.
- `identity` = không encrypt. Để cuối → đọc được Secret cũ trước khi enable.

Nếu để `identity` đầu → không encrypt cái gì cả.

**Step 3**: Mount vào apiserver:

Sửa `/etc/kubernetes/manifests/kube-apiserver.yaml`:

```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --encryption-provider-config=/etc/kubernetes/enc/enc.yaml    # ← thêm
    # ... other flags
    volumeMounts:
    - mountPath: /etc/kubernetes/enc                                # ← thêm
      name: enc
      readOnly: true
  volumes:
  - hostPath:
      path: /etc/kubernetes/enc                                     # ← thêm
      type: DirectoryOrCreate
    name: enc
```

Kubelet tự restart apiserver Pod khi file đổi.

**Step 4**: Verify

```bash
# Tạo Secret mới
kubectl create secret generic my-secret-2 --from-literal=key=topsecret

# Đọc từ etcd
sudo ETCDCTL_API=3 etcdctl ... get /registry/secrets/default/my-secret-2 | hexdump -C
# Output có "k8s:enc:aescbc:v1:key1:" ← ENCRYPTED
```

**Step 5**: Re-encrypt Secret cũ

Encryption chỉ áp dụng writes mới. Secret cũ vẫn plain text. Force re-write:

```bash
kubectl get secrets --all-namespaces -o json | kubectl replace -f -
```

→ Đọc tất cả → write lại → encrypt.

### Providers (thuật toán encryption)

| Provider | Specs |
|---|---|
| `identity` | Không encrypt (default) |
| `aescbc` | AES-CBC 256-bit, recommended |
| `aesgcm` | AES-GCM, fast, secure |
| `secretbox` | XSalsa20 + Poly1305 |
| `kms` | External KMS (AWS KMS, Azure Key Vault) — **production best** |

→ Production: dùng `kms` để key không nằm trên disk.

### Key rotation

```yaml
providers:
  - aescbc:
      keys:
        - name: key2                # key mới (encrypt write)
          secret: <NEW-KEY>
        - name: key1                # key cũ (vẫn decrypt được)
          secret: <OLD-KEY>
  - identity: {}
```

Sau đó force re-encrypt → mọi Secret mới ký bằng key2.
Cuối cùng có thể xoá `key1`.

## Phần 2: Multi-Container Pod Patterns

### Recap: Khi nào dùng multi-container

**Hiếm**. Đa số Pod = 1 container. Chỉ multi-container khi:
- 2 service quan hệ chặt: cần share network/storage + lifecycle.
- Tách microservice không phải lúc nào cũng tốt.

3 pattern chính:
1. **Sidecar (co-located)** — Helper bên cạnh.
2. **Init Container** — Setup trước main.
3. **Sidecar container** (K8s 1.28+ feature) — Init nhưng chạy mãi.

### Pattern 1: Co-located containers (truyền thống)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-log
spec:
  containers:
    - name: app                     # main
      image: my-app
      volumeMounts:
        - name: logs
          mountPath: /var/log
    - name: log-shipper             # sidecar
      image: fluentd
      volumeMounts:
        - name: logs
          mountPath: /var/log
          readOnly: true
  volumes:
    - name: logs
      emptyDir: {}
```

**Đặc điểm**:
- 2 container start **cùng lúc** (không có thứ tự).
- Cùng share network namespace → gọi `localhost`.
- Cùng share volume.
- Cùng chết khi Pod terminate.

**Hạn chế**: Không guarantee container nào start trước → app có thể chạy trước khi log-shipper sẵn sàng.

### Pattern 2: Init Container

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-init
spec:
  initContainers:                   # ← chạy TRƯỚC main containers
    - name: wait-for-db
      image: busybox
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 1; done']
    - name: api-checker
      image: busybox
      command: ['sh', '-c', 'until wget -q -O- http://api/health; do sleep 1; done']
  containers:
    - name: app
      image: my-app
```

**Đặc điểm**:
- Init container chạy **trước** main container.
- Nhiều init container chạy **tuần tự** (item 1 xong, mới đến item 2).
- Mỗi init container phải **exit thành công** (exit code 0). Fail → Pod fail.
- Main container chỉ start khi mọi init xong.

**Use case**:
- Đợi dependency (DB, API) ready.
- Pre-populate volume (clone Git repo, download config).
- Set permission cho volume.

```text
Timeline:
   init-1 (wait-for-db) ──────► xong
                                ↓
                          init-2 (api-checker) ──► xong
                                                    ↓
                                              main container start
```

### Pattern 3: Sidecar container (K8s 1.28+)

K8s 1.28 thêm "sidecar" thật — **init container nhưng restart=Always → chạy mãi**:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  initContainers:
    - name: log-shipper             # sidecar pattern
      image: fluentd
      restartPolicy: Always         # ← khác init thường
      volumeMounts:
        - name: logs
          mountPath: /var/log
          readOnly: true
  containers:
    - name: app
      image: my-app
      volumeMounts:
        - name: logs
          mountPath: /var/log
  volumes:
    - name: logs
      emptyDir: {}
```

**Đặc điểm so với co-located**:
- Sidecar **start trước** main container.
- Sidecar **terminate sau** main container.
- → Có thể catch log startup + shutdown của main.

| | Co-located | Init Container | Sidecar (1.28+) |
|---|---|---|---|
| Start order | Random | Tuần tự, trước main | Trước main |
| Stop order | Random | (exit khi xong) | Sau main |
| Lifecycle | Chạy cả thời gian Pod | Exit khi xong | Chạy cả thời gian Pod |
| restartPolicy | (Pod-level) | Default OnFailure | Always |
| Use case | Helper song song | Pre-setup | Log shipper với guarantee order |

### Use case thực tế

#### Sidecar pattern (co-located hoặc 1.28 sidecar)

```text
Log shipper:
[App container] → ghi log /var/log/app.log
[Log shipper] → đọc /var/log/app.log → ship Elasticsearch

Ambassador:
[App container] → kết nối localhost:5000 (đơn giản)
[Ambassador] → proxy localhost:5000 → Redis cluster ngoài (logic phức tạp)

Adapter:
[Legacy app] → output log format cũ
[Adapter] → convert log → format Prometheus
```

#### Init Container

```text
Wait for DB:
[Init container] → ping DB until ready → exit 0
[Main app] → connect DB ngay không lo retry

Clone Git repo:
[Init container] → git clone repo → /shared
[Main nginx] → serve /shared/static

Volume permission:
[Init container] → chown -R 1000:1000 /data → exit
[Main app (uid 1000)] → write /data OK
```

### Logs cho init/sidecar

```bash
# List Pod, đếm Ready
kubectl get pod my-pod
# NAME     READY   STATUS     RESTARTS   AGE
# my-pod   0/1     Init:0/2   0          10s
                  ─────────
                  Init 0/2 = đang chạy init 1, chưa xong cả 2

# Log init container
kubectl logs my-pod -c wait-for-db
kubectl logs my-pod -c api-checker

# Sau khi xong
kubectl get pod my-pod
# NAME     READY   STATUS    RESTARTS   AGE
# my-pod   1/1     Running   0          30s

# Log main
kubectl logs my-pod
```

## Bẫy thường gặp

### Encryption

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `identity` đầu tiên trong providers | Không encrypt | aescbc/kms đầu, identity cuối |
| Quên re-encrypt Secret cũ | Vẫn plain text | `kubectl replace` để force re-write |
| Mount enc.yaml sai path | apiserver fail start | Verify volumeMount + hostPath |
| Key trong file plain | Lộ khi mất file | Dùng KMS provider |
| Không backup key | Mất key = mất Secret | Backup key an toàn |

### Multi-container

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Co-located cho dependency cần order | App start trước dependency → fail | Dùng init container |
| Init container vô hạn (infinite loop) | Main không bao giờ start | Set timeout, exit eventually |
| Quên `-c` khi xem log multi-container | `kubectl logs` báo error | `kubectl logs pod -c container-name` |
| Multi-container quá nhiều | Khó manage, debug | Tách thành nhiều Pod hoặc microservice |
| Volume share readWrite cho cả 2 → race condition | Data corrupt | Set 1 reader (readOnly) |

## Tóm tắt bài 4

- **Default Secret KHÔNG encrypt** trong etcd — chỉ base64.
- **EncryptionConfiguration** + apiserver flag `--encryption-provider-config` để encrypt at rest.
- Provider: `aescbc` (default secure), `kms` (production best).
- Thứ tự providers matter: cái đầu encrypt, cái cuối là `identity` cho backward compat.
- Force re-encrypt Secret cũ: `kubectl get secrets -A -o json | kubectl replace -f -`.
- **3 multi-container pattern**:
  - **Co-located**: 2+ container song song, không order.
  - **Init container**: chạy tuần tự trước main, exit khi xong.
  - **Sidecar (1.28+)**: init nhưng restart=Always, chạy mãi với main.
- Use case init: wait dependency, clone repo, set permission.
- Use case sidecar: log shipper, ambassador, adapter.

**Bài kế tiếp** → [Bài 5: HPA, VPA, In-Place Resize](05-autoscaling.md)
