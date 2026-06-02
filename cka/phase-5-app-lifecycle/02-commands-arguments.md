# Bài 2: Commands & Arguments — Override container entrypoint

## Vì sao bài này quan trọng?

Trong CKA exam, bạn sẽ được hỏi: "Tạo Pod nginx chạy lệnh `sleep 5000` thay vì serve web". Phải biết override entrypoint container.

Đây cũng là kiến thức cơ bản để debug container đang crash.

## Docker recap — ENTRYPOINT vs CMD

Container có **2 trường định nghĩa lệnh chạy**:

### Dockerfile

```dockerfile
FROM ubuntu
ENTRYPOINT ["sleep"]       # lệnh không đổi được khi docker run
CMD ["5"]                  # default args, có thể override
```

→ Container chạy `sleep 5` mặc định.

### Override khi `docker run`

```bash
# Run mặc định
docker run my-image
# Container chạy: sleep 5

# Override CMD (args)
docker run my-image 10
# Container chạy: sleep 10

# Override ENTRYPOINT
docker run --entrypoint echo my-image hello
# Container chạy: echo hello
```

## Mapping Docker → K8s YAML

Đây là **điểm dễ confuse nhất**:

| Docker | K8s YAML |
|---|---|
| **ENTRYPOINT** | `command` |
| **CMD** | `args` |

→ Đảo ngược tên! Trong K8s:
- `command` override ENTRYPOINT.
- `args` override CMD.

## Pod YAML với command + args

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ubuntu-sleeper
spec:
  containers:
    - name: ubuntu
      image: ubuntu
      command: ["sleep"]            # override ENTRYPOINT
      args: ["5000"]                # override CMD
```

→ Container chạy: `sleep 5000`.

### Cách viết khác (multi-line)

```yaml
spec:
  containers:
    - name: ubuntu
      image: ubuntu
      command:
        - sleep
      args:
        - "5000"
```

### Inline với multiple args

```yaml
command: ["sh", "-c"]
args: ["echo hello && sleep 100"]
```

→ Container chạy: `sh -c "echo hello && sleep 100"`.

## Ví dụ thực tế

### 1. Override entire command

```yaml
# Image nginx mặc định chạy nginx server
# Muốn nó chỉ chạy `sh` để debug:
spec:
  containers:
    - name: nginx
      image: nginx
      command: ["sh"]
      args: ["-c", "tail -f /dev/null"]
```

### 2. Chỉ thay args

```yaml
# Image base có ENTRYPOINT ["python", "/app.py"]
# Muốn pass arg:
spec:
  containers:
    - name: app
      image: my-app
      args: ["--port", "8080", "--debug"]
```

→ Container chạy: `python /app.py --port 8080 --debug`.

### 3. Pass env qua args

```yaml
spec:
  containers:
    - name: app
      image: alpine
      command: ["/bin/sh", "-c"]
      args:
        - |
          echo "Starting..."
          while true; do
            echo "Tick: $(date)"
            sleep 5
          done
```

`|` cho phép multi-line string trong YAML.

## Imperative tạo Pod với command

```bash
# kubectl run với --command + args
kubectl run ubuntu --image=ubuntu --command -- sleep 5000

# Cách 2: chỉ args
kubectl run ubuntu --image=ubuntu -- sleep 5000
# (cách này dùng args, không override entrypoint)
```

Sự khác biệt:
- `--command` flag → set `command` (override ENTRYPOINT).
- Không có `--command` → set `args` (override CMD).

→ Trong exam, dùng `--command` để chắc chắn.

Generate YAML:
```bash
kubectl run ubuntu --image=ubuntu --command \
  --dry-run=client -o yaml -- sleep 5000 > pod.yaml
```

## Behavior dựa trên ENTRYPOINT/CMD gốc

```text
Image có:
ENTRYPOINT ["sleep"]
CMD ["5"]

Pod spec:                                         Container chạy:
─────────────                                     ────────────────
(không khai gì)                                   sleep 5
args: ["10"]                                      sleep 10 (CMD bị thay)
command: ["echo"]                                 echo (ENTRYPOINT thay, CMD ignore)
command: ["echo"], args: ["hello"]                echo hello
```

→ Hiểu mapping này = pass exam.

## Tình huống debug

### Container crash ngay lập tức

```bash
kubectl get pods
# my-pod   0/1   CrashLoopBackOff   3   2m
```

```bash
kubectl logs my-pod
# (empty hoặc error)

kubectl describe pod my-pod
# State: Terminated
#   Reason: Completed       ← exit 0, không có gì sai
```

Có thể container chạy lệnh xong → exit. Dùng `command` override để giữ container alive:

```yaml
spec:
  containers:
    - name: debug
      image: ubuntu
      command: ["sleep", "infinity"]
```

→ Pod chạy mãi để debug.

### Chạy debug container

```bash
# Pod debug tạm thời
kubectl run debug --image=busybox --rm -it --command -- sh
# --rm: xoá Pod khi exit
# -it: interactive + TTY
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Nhầm `command` ⟷ `args` | Behavior khác mong đợi | `command`=ENTRYPOINT, `args`=CMD |
| Quên quote số trong args | YAML parse error | `args: ["5000"]` (string) |
| `command` không phải list | YAML invalid | Luôn `[...]` |
| Override command nhưng image ENTRYPOINT có shell | Vẫn chạy được | OK |
| Pod crash, log trống | Container exit 0 hoặc lỗi xa | Thử override với `sleep infinity` để debug |
| `kubectl run` không `--command` | Args set, không thay được entrypoint | Dùng `--command` flag |

## Tóm tắt bài 2

- Docker **ENTRYPOINT** = K8s `command`.
- Docker **CMD** = K8s `args`.
- Cả 2 dùng dạng **list** (`["sleep", "5000"]`).
- `--command` flag với `kubectl run` để set `command` thay vì `args`.
- Override entrypoint để debug Pod crash (`sleep infinity`).
- Hiểu mapping = thoát confusion lớn nhất K8s.

**Bài kế tiếp** → [Bài 3: Env Variables + ConfigMaps](03-env-configmap.md)
