# Bài 1: Variables và Data Structures — ngôn ngữ data của DevOps

DevOps engineer **đọc và viết data** mỗi ngày: config file YAML, API response JSON, env variable Bash, list trong Python. Bài này dạy **mental model** chung cho cả 3.

## Variable là gì?

> **Variable** = ô nhớ tạm thời có **tên** lưu **giá trị**. Bạn dùng tên để truy cập giá trị.

Tương tự "tên gọi của đồ vật". Variable `skill` = "DevOps" giống như "anh A" = một con người cụ thể.

### Bash variable

```bash
skill="DevOps"
echo $skill
# DevOps

echo "I am learning $skill"
# I am learning DevOps
```

Quy tắc Bash:
- **Không space** quanh `=`: `skill="DevOps"` đúng, `skill = "DevOps"` sai.
- **`$`** khi đọc value: `$skill`.
- **Double quote** giữ `$` expansion: `"I am $skill"` → "I am DevOps".
- **Single quote** không expand: `'I am $skill'` → "I am $skill" literal.

### Python variable

```python
skill = "DevOps"
print(skill)
# DevOps

print(f"I am learning {skill}")    # f-string
# I am learning DevOps
```

Khác Bash:
- **Có thể** có space quanh `=`: `skill = "DevOps"` OK.
- **Không cần `$`**: dùng tên trực tiếp.
- **F-string** với `{var}` để embed.

## Kiểu dữ liệu cơ bản — String, Integer

### String

```python
skill = "DevOps"
name = 'Alice'           # Single hoặc double — cùng nghĩa
desc = """Multi-line
string"""                # Triple-quote cho đa dòng
```

### Integer / Float

```python
year = 2026
pi = 3.14
```

### Boolean

```python
is_admin = True          # True/False — viết hoa
active = False
```

### None / null

```python
result = None            # Python None
# JS / JSON: null
```

## Data structure — 4 loại quan trọng

DevOps engineer phải hiểu 4 structure:

| Structure | Python syntax | Khi nào dùng |
|---|---|---|
| **List / Array** | `[1, 2, 3]` | Tập có thứ tự, có thể trùng |
| **Tuple** | `(1, 2, 3)` | Như list nhưng immutable |
| **Dictionary / Object** | `{"key": "value"}` | Key-value pairs |
| **Set** | `{1, 2, 3}` | Tập không trùng |

YAML và JSON dùng **list** và **dictionary** chủ yếu. Bash chủ yếu string + array đơn giản.

## List — danh sách

```python
tools = ["Jenkins", "Docker", "Kubernetes", "Terraform"]

print(tools)
# ['Jenkins', 'Docker', 'Kubernetes', 'Terraform']

# Index (0-based)
print(tools[0])          # Jenkins
print(tools[1])          # Docker
print(tools[-1])         # Terraform (cuối)

# Slice [start:end] (end exclusive)
print(tools[0:2])        # ['Jenkins', 'Docker']
print(tools[1:])         # ['Docker', 'Kubernetes', 'Terraform']
print(tools[:2])         # ['Jenkins', 'Docker']

# Length
print(len(tools))        # 4

# Append
tools.append("Ansible")  # ['Jenkins', 'Docker', 'Kubernetes', 'Terraform', 'Ansible']

# Có chứa?
print("Docker" in tools) # True
```

### List trong Bash

Bash 4+ có array:

```bash
tools=("Jenkins" "Docker" "Kubernetes")
echo ${tools[0]}              # Jenkins
echo ${tools[@]}              # All
echo ${#tools[@]}             # Length: 3

# Append
tools+=("Terraform")

# Loop
for tool in "${tools[@]}"; do
    echo "Learning $tool"
done
```

## Tuple — list immutable

```python
position = (10.5, 20.3)     # Coordinates
rgb = (255, 0, 128)         # Color

# Như list nhưng KHÔNG sửa được
# position[0] = 99            # TypeError
```

Use case: data không thay đổi (coordinates, version numbers, key composite).

## Dictionary — key-value

```python
user = {
    "name": "Alice",
    "age": 30,
    "is_admin": True,
    "email": "alice@acme.com"
}

# Access
print(user["name"])              # Alice
print(user.get("phone", "N/A"))  # N/A (default)

# Modify
user["age"] = 31
user["phone"] = "+84..."

# Loop
for key, value in user.items():
    print(f"{key}: {value}")
```

### Nested dictionary

```python
devops = {
    "skill": "DevOps",
    "year": 2026,
    "tech": {
        "cloud": "AWS",
        "container": "Kubernetes",
        "cicd": "Jenkins",
        "gitops": ["GitLab", "ArgoCD", "Tekton"]
    }
}

# Access nested
print(devops["tech"]["cloud"])              # AWS
print(devops["tech"]["gitops"][0])          # GitLab
```

## Set — tập không trùng

```python
permissions = {"read", "write", "execute"}

# Add (no duplicate)
permissions.add("read")                # Bỏ qua, đã có
permissions.add("admin")               # Add mới

# Operations
admin = {"read", "write", "execute", "admin"}
print(permissions & admin)             # Intersection: {read, write, execute, admin}
print(permissions | admin)             # Union
print(admin - permissions)             # Difference: {admin}
```

Use case: deduplicate list, check membership nhanh.

## Visual ASCII representation

```text
String:    "DevOps"

Integer:   2026

List:      [ "Jenkins", "Docker", "Kubernetes" ]
            └─ [0] ──┘ └─ [1] ─┘ └────[2]─────┘

Tuple:     ( 10.5, 20.3 )

Set:       { "read", "write", "execute" }

Dict:      { "name": "Alice", "age": 30 }
              └─ key ──┘ └ val ┘
              key      value
                       │
                       ▼
Nested:    {
             "user": {
               "name": "Alice",
               "tools": ["git", "docker"]
             }
           }
```

## Variables environment — đặc biệt cho DevOps

Bash có **environment variable** — share giữa process:

```bash
# Set local (chỉ shell hiện tại)
NAME="Alice"
echo $NAME

# Set environment (children process kế thừa)
export NAME="Alice"
bash -c 'echo $NAME'           # Alice — process con đọc được

# Unset
unset NAME

# List
env                            # Mọi env variable
printenv NAME
```

Quan trọng cho DevOps:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export DATABASE_URL="postgres://..."

# Lưu vào .env, source khi cần
cat .env
# DB_HOST=localhost
# DB_PORT=5432

source .env                    # Load vào current shell
```

> Đừng commit `.env` vào git. Luôn `.gitignore` nó.

## Variables trong tool DevOps

### Vagrant

```ruby
ip = "192.168.56.10"
config.vm.network "private_network", ip: ip
```

### Ansible

```yaml
vars:
  app_name: myapp
  port: 8080
tasks:
  - name: Start {{ app_name }} on port {{ port }}
```

### Terraform

```hcl
variable "instance_type" {
  type    = string
  default = "t3.micro"
}

resource "aws_instance" "web" {
  instance_type = var.instance_type
}
```

### Jenkins

```groovy
pipeline {
    environment {
        DOCKER_REGISTRY = 'ghcr.io/acme'
    }
}
```

Mỗi tool có syntax riêng — concept variable giống nhau.

## Bẫy thường gặp

| Bẫy | Bash | Python |
|---|---|---|
| Space quanh `=` | Sai: `x = 1` | OK |
| Variable không tồn tại | Empty string (silent) | `NameError` exception |
| Reference biến chưa định nghĩa | `$undefined` → empty | Error |
| Quote sai loại | `'$var'` không expand | N/A |
| List index out of range | N/A (Bash array linh hoạt) | `IndexError` |
| Dict key không có | N/A | `KeyError` (dùng `.get()`) |

## Quy ước đặt tên

| Style | Vd | Khi nào |
|---|---|---|
| `snake_case` | `user_name` | Python, Ruby, Rust |
| `camelCase` | `userName` | JS, Java |
| `PascalCase` | `UserName` | Class name |
| `UPPER_SNAKE` | `MAX_RETRIES` | Constant, env var |
| `kebab-case` | `user-name` | HTML attr, file name |

DevOps env variable: **UPPER_SNAKE** (`AWS_REGION`, `DATABASE_URL`).

## Quick reference

```text
# Bash
var="value"               No space around =
echo $var                 Read
echo "${var}"             With braces (safer)
export var="value"        Environment
unset var                 Delete

# Python
var = "value"             OK with space
print(var)                Read
list_x = [1, 2, 3]
list_x[0]                 First element
list_x[-1]                Last
dict_x = {"k": "v"}
dict_x["k"]               Access value
dict_x.get("k", "default")  Safe access
"k" in dict_x             Check exists
```

## Tóm tắt bài 1

- **Variable** = tên trỏ tới giá trị. `$var` trong Bash, `var` trong Python.
- 4 data structures: **list** `[]`, **tuple** `()`, **dict** `{}`, **set** `{}`.
- List: index 0-based, slice `[start:end]`.
- Dict: key-value, access `d["key"]` hoặc `d.get("key", default)`.
- **Nested** structures = list trong dict trong list... — base cho YAML/JSON.
- Bash quote: **double** expand, **single** literal.
- Convention DevOps: `UPPER_SNAKE` cho env variable.

**Bài kế tiếp** → [Bài 2: JSON và YAML — 2 format dữ liệu nuôi sống cloud-native](02-json-yaml.md)
