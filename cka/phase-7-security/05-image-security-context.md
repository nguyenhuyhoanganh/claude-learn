# Bài 5: Image Security + Security Context

## Phần 1: Image Security

### Pull image từ private registry

Default Pod pull image từ Docker Hub. Khi image private (Docker Hub private repo, ECR, GCR, Harbor, ...) → cần credential.

### Tạo Docker registry Secret

```bash
kubectl create secret docker-registry myregistry-creds \
  --docker-server=myregistry.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=me@example.com
```

YAML alternative:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myregistry-creds
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64 encoded config>
```

Base64 content gốc (file `~/.docker/config.json`):
```json
{
  "auths": {
    "myregistry.com": {
      "username": "user",
      "password": "pass",
      "auth": "base64(user:pass)"
    }
  }
}
```

### Use trong Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  imagePullSecrets:                       # ← danh sách secret
    - name: myregistry-creds
  containers:
    - name: app
      image: myregistry.com/private/app:v1
```

Hoặc gắn vào ServiceAccount (mọi Pod dùng SA tự inherit):
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
imagePullSecrets:
  - name: myregistry-creds
```

### Image full address

```text
Format: <registry-host>/<repo>/<image>:<tag>

Default registry = docker.io (Docker Hub)
Default repo = library (cho image official)

Ví dụ:
- nginx                        → docker.io/library/nginx:latest
- nginx:1.25                   → docker.io/library/nginx:1.25
- bitnami/nginx                → docker.io/bitnami/nginx:latest
- gcr.io/google_containers/x   → gcr.io/google_containers/x:latest
- myregistry.com:5000/app:v1   → myregistry.com:5000/app:v1
```

### Image pull policy

```yaml
spec:
  containers:
    - name: app
      image: nginx:1.25
      imagePullPolicy: IfNotPresent       # default
```

| Policy | Khi nào pull |
|---|---|
| `Always` | Mỗi lần Pod start → pull mới (latest), check digest |
| `IfNotPresent` | Pull nếu image chưa có local (default) |
| `Never` | Không pull. Image phải có local (manual load) |

Default behavior dựa trên tag:
- Tag `:latest` hoặc không có tag → `Always`.
- Tag cụ thể (`:1.25`) → `IfNotPresent`.

→ Production luôn pin tag → `IfNotPresent` (faster startup).

### Image security best practices

```text
✓ Pin tag specific (nginx:1.25.3), không :latest
✓ Pin digest: nginx@sha256:abc123... (immutable)
✓ Scan vulnerability (Trivy, Snyk, Clair)
✓ Private registry với auth
✓ Image signing (Cosign, Notary)
✓ Distroless / minimal base (gcr.io/distroless/...)
✓ Non-root user trong image
✗ :latest tag — không reproducible
✗ Public Docker Hub không kiểm tra → image malicious
✗ Image chứa secret hardcode
```

## Phần 2: Security Context

`SecurityContext` định nghĩa security setting cho Pod hoặc Container:
- UID/GID chạy process.
- Capabilities (Linux).
- ReadOnly filesystem.
- Privilege escalation.
- SELinux / AppArmor.

### Pod-level vs Container-level

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  securityContext:                # Pod-level (áp dụng mọi container)
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
  containers:
    - name: app
      image: nginx
      securityContext:            # Container-level (override Pod-level)
        runAsUser: 2000
        capabilities:
          add: ["NET_ADMIN", "SYS_TIME"]
          drop: ["ALL"]
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
```

→ Container `app` chạy as UID 2000 (override). Pod-level chỉ áp dụng container không override.

### Common Settings

#### runAsUser, runAsGroup

```yaml
securityContext:
  runAsUser: 1000              # UID
  runAsGroup: 3000             # GID primary
  runAsNonRoot: true           # fail Pod nếu chạy root
```

→ Container chạy as user 1000, group 3000. Không chạy root.

**Best practice**: Luôn `runAsNonRoot: true`. Image build với non-root user.

#### fsGroup

```yaml
securityContext:
  fsGroup: 2000                # mọi file mount thuộc GID 2000
```

→ Volume mount có file ownership = GID 2000. Process trong container có thể write.

#### Capabilities

Linux capabilities cho phép fine-grained privilege:

```yaml
containers:
  - name: app
    securityContext:
      capabilities:
        drop:
          - ALL                # drop hết
        add:
          - NET_BIND_SERVICE   # cho bind port < 1024 (vd nginx port 80)
```

Common capabilities:
- `NET_ADMIN`: config network interface.
- `NET_BIND_SERVICE`: bind privileged port (<1024).
- `SYS_TIME`: set system time.
- `CAP_SYS_ADMIN`: như root (avoid).

#### allowPrivilegeEscalation

```yaml
securityContext:
  allowPrivilegeEscalation: false
```

→ Process không thể gain extra privilege qua setuid binary, capabilities.

#### readOnlyRootFilesystem

```yaml
securityContext:
  readOnlyRootFilesystem: true
```

→ Root filesystem read-only. Container không write được `/etc`, `/usr`, ... Chỉ write được volume mount.

→ Tăng security. Cần volume tmpfs cho `/tmp`, `/var/log`:
```yaml
spec:
  containers:
    - volumeMounts:
        - { name: tmp, mountPath: /tmp }
  volumes:
    - { name: tmp, emptyDir: {} }
```

#### Privileged

```yaml
securityContext:
  privileged: true             # NGUY HIỂM — full root
```

→ Container có full root permission như host. Dùng cho:
- CNI plugin Pod.
- Storage driver.
- Monitoring agent cần access /proc, /sys.

Cấm cho app user.

#### SELinux

```yaml
securityContext:
  seLinuxOptions:
    level: "s0:c123,c456"
```

→ SELinux label cho container. Chỉ apply trên host có SELinux (RHEL).

#### AppArmor

```yaml
metadata:
  annotations:
    container.apparmor.security.beta.kubernetes.io/<container-name>: runtime/default
```

→ AppArmor profile. Restrict syscalls.

#### Seccomp

```yaml
securityContext:
  seccompProfile:
    type: RuntimeDefault       # use runtime's default (containerd's)
    # hoặc: Localhost — file profile local
    # localhostProfile: profiles/my.json
```

→ Block dangerous syscall. `RuntimeDefault` recommended.

## Pod Security Standards (PSS)

K8s ship 3 chuẩn security:

| Level | Mục đích |
|---|---|
| **Privileged** | Không restrict (mọi thứ allow) |
| **Baseline** | Minimum restrict — chặn privilege escalation rõ ràng |
| **Restricted** | Strict — hardened, recommended cho prod |

Apply qua **Pod Security Admission** (built-in admission controller, K8s 1.25+):

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: prod
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

→ Pod tạo trong namespace `prod` phải tuân `restricted` standard. Vi phạm → reject + warn.

3 modes:
- `enforce`: block (reject).
- `audit`: log audit, vẫn cho phép.
- `warn`: warn user CLI, vẫn cho phép.

## Restricted standard yêu cầu

Pod phải có:
- `securityContext.runAsNonRoot: true`.
- `securityContext.allowPrivilegeEscalation: false`.
- `securityContext.capabilities.drop: ["ALL"]`.
- `securityContext.seccompProfile.type: RuntimeDefault` (or Localhost).
- `readOnlyRootFilesystem: true` (recommend).
- Không có hostPath, hostNetwork, hostPID.
- Không có privileged container.

## Example Pod production-grade

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
    runAsNonRoot: true
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: my-app:1.25
      imagePullPolicy: IfNotPresent
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        readOnlyRootFilesystem: true
      volumeMounts:
        - { name: tmp, mountPath: /tmp }
        - { name: cache, mountPath: /var/cache }
  volumes:
    - { name: tmp, emptyDir: {} }
    - { name: cache, emptyDir: {} }
  automountServiceAccountToken: false       # nếu không gọi K8s API
```

→ Production checklist:
- Non-root user.
- Drop all capabilities.
- No privilege escalation.
- Read-only root FS.
- Seccomp profile.
- No unnecessary mounts.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Image `:latest` | Không reproducible, surprise update | Pin tag |
| Privileged container | Pod compromise = host compromise | Bỏ privileged trừ khi cần |
| Run as root (UID 0) | Container escape ảnh hưởng host | `runAsNonRoot: true` |
| Quên drop capabilities | Container có quyền không cần | `drop: ["ALL"]` |
| App fail vì readOnlyRootFilesystem | App ghi /tmp | Mount emptyDir cho /tmp |
| imagePullSecret namespace khác | Pull fail | Secret cùng namespace với Pod |
| Distroless image nhưng app cần shell | Debug khó | Dùng debug container |
| Allow privilege escalation | Setuid binary nguy hiểm | `allowPrivilegeEscalation: false` |

## Quick reference

```yaml
# Pull private image
spec:
  imagePullSecrets:
    - name: my-secret
  containers:
    - image: private.com/app:1.0
      imagePullPolicy: Always | IfNotPresent | Never

# SecurityContext production
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
    runAsNonRoot: true
    fsGroup: 1000
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        readOnlyRootFilesystem: true

# Pod Security Standards
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted
```

```bash
# Tạo registry secret
kubectl create secret docker-registry name \
  --docker-server=... --docker-username=... --docker-password=...

# Verify Pod chạy non-root
kubectl exec pod -- id
# uid=1000(app) gid=1000(app)
```

## Tóm tắt bài 5

- **imagePullSecrets** cho private registry. Inject qua Pod hoặc SA.
- `imagePullPolicy`: `Always`, `IfNotPresent` (default), `Never`.
- Pin tag specific, không `:latest`.
- **SecurityContext**: Pod-level + Container-level. Container override Pod.
- Critical: `runAsNonRoot`, `allowPrivilegeEscalation: false`, `drop: ALL`, `readOnlyRootFilesystem`.
- **Pod Security Standards**: Privileged, Baseline, **Restricted** (recommend).
- Apply qua **Pod Security Admission** labels namespace.
- 3 modes: enforce, audit, warn.
- Production: minimal image (distroless), non-root, drop caps, RO filesystem.

**Bài kế tiếp** → [Bài 6: Network Policies](06-network-policies.md)
