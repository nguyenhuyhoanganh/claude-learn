# Bài 2: JSON và YAML — 2 format dữ liệu nuôi sống cloud-native

> **Quy tắc DevOps**: "Đọc được JSON, viết được YAML" = bare minimum nghề nghiệp.

JSON cho API, YAML cho config — hai format này xuất hiện **mọi nơi** trong DevOps modern.

## JSON — JavaScript Object Notation

> **JSON** = format text-based để biểu diễn data có cấu trúc. Tên xuất phát từ JS, nhưng giờ dùng độc lập với mọi ngôn ngữ.

### Cú pháp

```json
{
  "name": "Alice",
  "age": 30,
  "is_admin": true,
  "tags": ["devops", "engineer"],
  "address": {
    "city": "Hanoi",
    "country": "VN"
  },
  "phone": null
}
```

Rules:
- **Object** trong `{}` — key-value (như Python dict).
- **Array** trong `[]` — list ordered.
- **String** trong `"..."` (double quote BẮT BUỘC, không single).
- **Key BẮT BUỘC** quote.
- **Comma** tách items; **không** comma trailing.
- **Không có comment**.
- Boolean: `true`, `false` (lowercase). Null: `null`.

### Dùng để làm gì?

| Use case | Vd |
|---|---|
| API REST response | `GET /users/1` → JSON |
| Config file | `package.json`, `tsconfig.json` |
| CloudFormation template | AWS infrastructure |
| Webhook payload | GitHub, Stripe events |
| Log structured | App log JSON line |

### JSON từ command line

```bash
# Format đẹp
echo '{"name":"Alice","age":30}' | jq .

# Lấy field
curl https://api.github.com/users/torvalds | jq '.name'
# "Linus Torvalds"

# Lọc
curl https://api.github.com/users/torvalds/repos | jq '.[] | {name, language}' | head

# Multi-field
jq '.users[] | {name, email}' users.json
```

`jq` = CLI tool xử lý JSON, **bắt buộc** cài cho DevOps.

```bash
sudo apt install -y jq
sudo dnf install -y jq
brew install jq
```

## YAML — Yet Another Markup Language

> **YAML** = format **dễ đọc cho người**, được dùng cho file config trong hầu hết tool DevOps modern: Kubernetes, Ansible, Docker Compose, GitHub Actions.

### Cú pháp

```yaml
name: Alice
age: 30
is_admin: true
tags:
  - devops
  - engineer
address:
  city: Hanoi
  country: VN
phone: null
```

Rules:
- **Indentation** quyết định nesting (2 space chuẩn). **KHÔNG TAB**.
- **Key: value** với space sau `:`.
- **Array** dùng `-` đầu dòng hoặc `[a, b, c]` inline.
- **String** không cần quote (trừ khi có ký tự đặc biệt).
- **Comment** với `#`.
- Boolean: `true`/`false` (hoặc `yes`/`no`, `on`/`off`).

### Dùng để làm gì?

| Use case | Vd |
|---|---|
| Kubernetes manifest | `deployment.yaml`, `service.yaml` |
| Ansible playbook | `play.yml`, `vars.yml` |
| Docker Compose | `docker-compose.yml` |
| CI/CD pipeline | `.github/workflows/ci.yml`, `.gitlab-ci.yml` |
| App config | `application.yml` (Spring Boot) |
| Cloud config | `cloud-init.yaml` |

## So sánh JSON vs YAML

Cùng data:

### JSON

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "dependencies": ["nginx", "redis", "postgres"],
  "config": {
    "port": 8080,
    "debug": false
  }
}
```

### YAML

```yaml
name: myapp
version: 1.0.0
dependencies:
  - nginx
  - redis
  - postgres
config:
  port: 8080
  debug: false
```

| Tiêu chí | JSON | YAML |
|---|---|---|
| Readability | OK | **Tốt hơn** |
| Verbose | Nhiều bracket | Ít ký tự |
| Comment | ✗ | ✓ `#` |
| Indentation matter | ✗ | **✓** (critical) |
| Validate dễ | Strict | Hơi tricky |
| Phổ biến với API | **✓** | ✗ |
| Phổ biến với config | Ít | **✓** |

**Quy tắc**:
- API/data exchange → **JSON**.
- Config file người đọc/sửa → **YAML**.

## YAML nâng cao

### Multi-line string

```yaml
# Literal block (giữ newline)
message: |
  Line 1
  Line 2
  Line 3

# Folded block (gộp thành 1 dòng, paragraph mới khi 2 newline)
description: >
  This is a long
  description that
  becomes one paragraph.
```

### Array inline (flow style)

```yaml
tools: [git, docker, kubernetes]
# = Đồng nghĩa với:
tools:
  - git
  - docker
  - kubernetes
```

### Anchor và Alias — DRY

```yaml
defaults: &default
  timeout: 30
  retries: 3

production:
  <<: *default              # Inherit từ defaults
  endpoint: prod.acme.com

staging:
  <<: *default
  endpoint: staging.acme.com
```

`&name` define anchor, `*name` reference, `<<: *name` merge keys.

### Quoted string khi nào cần

```yaml
version: 1.0              # YAML parse là number 1.0
version: "1.0"            # String "1.0"
version: '1.0'            # String, single quote không expand

name: yes                 # YAML parse là boolean true!
name: "yes"               # String "yes"

# Đặc biệt nguy hiểm trong CI/CD:
country: NO               # Parsed as boolean false! (Norway)
country: "NO"             # String OK
```

> **Norway bug** kinh điển. Luôn quote string ambiguous.

### Multi-document trong 1 file

```yaml
---
name: doc1
type: deployment
---
name: doc2
type: service
---
name: doc3
type: ingress
```

`---` tách document. Kubernetes manifest thường dùng để gom 3 resource vào 1 file.

## YAML trong Kubernetes — ví dụ thực tế

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
          env:
            - name: ENV
              value: production
          resources:
            requests:
              memory: "64Mi"
              cpu: "250m"
            limits:
              memory: "128Mi"
              cpu: "500m"
```

Đọc được file này = đọc được **mọi K8s manifest**. Pattern lặp lại.

## YAML trong GitHub Actions

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## YAML trong Ansible

```yaml
---
- name: Setup web server
  hosts: webservers
  become: yes

  vars:
    app_name: myapp
    app_port: 8080

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present

    - name: Start nginx
      systemd:
        name: nginx
        state: started
        enabled: yes

    - name: Deploy config
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/sites-enabled/{{ app_name }}.conf
      notify: reload nginx

  handlers:
    - name: reload nginx
      systemd:
        name: nginx
        state: reloaded
```

## Convert JSON ↔ YAML

```bash
# YAML → JSON
yq -o=json eval config.yaml > config.json

# JSON → YAML
yq -P eval config.json > config.yaml

# Hoặc Python:
python3 -c 'import yaml,json,sys; print(json.dumps(yaml.safe_load(sys.stdin)))' < in.yaml
python3 -c 'import yaml,json,sys; print(yaml.dump(json.load(sys.stdin)))' < in.json
```

`yq` = `jq` cho YAML — cài cùng.

```bash
sudo snap install yq         # Ubuntu
brew install yq              # macOS
```

## Validate YAML / JSON

```bash
# JSON
jq . config.json > /dev/null   # Exit 0 = valid

python3 -c 'import json; json.load(open("config.json"))'

# YAML
yq . config.yaml > /dev/null

python3 -c 'import yaml; yaml.safe_load(open("config.yaml"))'

# Kubernetes
kubectl apply --dry-run=client -f manifest.yaml
```

## VS Code extensions

| Extension | Cho |
|---|---|
| **YAML** (RedHat) | Schema validation, autocomplete |
| **Prettier** | Auto-format |
| **Kubernetes** | K8s schema |
| **GitHub Actions** | Workflow validation |
| **Ansible** | Ansible syntax |

Cài → tự highlight lỗi indent, gợi ý key tên.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Tab thay space trong YAML | Parse error | Dùng **space only**, editor convert |
| Indent không đồng nhất | Logic sai | 2 space chuẩn, không mix |
| String "yes", "no", "on", "off" | Parsed boolean | Quote: `"yes"` |
| Number leading zero `010` | Parsed octal 8 | Quote |
| Comma trailing trong JSON | Parse error | Bỏ comma cuối |
| Single quote trong JSON | Invalid | Chỉ double quote |
| Comment trong JSON | Invalid | JSON không có comment |
| Forget `---` separator | 2 doc thành 1 | Add `---` |
| `<<: *anchor` chỉ một item | Không merge | Phải mapping merge syntax |

## Tool nhanh cho terminal

```bash
# JSON
jq .                              Pretty print
jq '.name'                        Lấy field
jq '.users | length'              Đếm
jq -r '.name'                     Raw output (no quote)

# YAML
yq .                              Pretty print
yq '.metadata.name' deploy.yaml
yq -i '.spec.replicas = 5' deploy.yaml   In-place edit

# Convert
yq -o=json eval . file.yaml       YAML → JSON
yq -P eval file.json              JSON → YAML

# Validate
python3 -m json.tool file.json    JSON pretty + validate
```

## Online tools

- **jsonlint.com** — validate JSON.
- **yamllint.com** — validate YAML.
- **json2yaml.com** — convert.
- **app.quicktype.io** — JSON → code (Python class, TS interface).

## Schema và validation

Cho file lớn, dùng **JSON Schema** hoặc **OpenAPI** để validate:

```yaml
# schema.yaml — định nghĩa structure
type: object
required: [name, port]
properties:
  name:
    type: string
    pattern: ^[a-z][a-z0-9-]*$
  port:
    type: integer
    minimum: 1
    maximum: 65535
```

```bash
# Validate
ajv validate -s schema.yaml -d config.yaml
```

K8s built-in: `kubectl apply --dry-run=server -f manifest.yaml` — server validate.

## Tóm tắt bài 2

- **JSON** cho API, data exchange. Strict syntax, không comment.
- **YAML** cho config file người sửa. Indentation matter (space, không tab).
- Tương đương: dict/list/string/number/boolean — 2 format biểu diễn cùng data.
- **Quote string ambiguous** trong YAML (`"yes"`, `"NO"`, version `"1.0"`).
- **`jq`** xử lý JSON, **`yq`** xử lý YAML từ CLI.
- VS Code extension RedHat YAML cho schema validation.
- Kubernetes, Ansible, GitHub Actions, Docker Compose — đều YAML.

**Phase kế tiếp** → [Phase 8 — Bài 1: vProfile project — kiến trúc multi-tier thực tế](../phase-8-vprofile-project/01-vprofile-architecture.md)

> Phase 8 sẽ được viết tiếp.
