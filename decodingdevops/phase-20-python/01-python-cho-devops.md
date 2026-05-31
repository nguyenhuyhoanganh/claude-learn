# Bài 1: Python cho DevOps — automation cấp 2

Bash hết tầm khi script > 200 dòng. Python = **ngôn ngữ automation cấp 2** của DevOps: parse JSON, gọi API REST, manage cloud (boto3), build CLI tool, write custom Ansible module.

## Vì sao Python cho DevOps?

| | Bash | Python |
|---|---|---|
| Script ngắn (< 100 dòng) | **Tốt** | OK |
| Script dài (> 200 dòng) | Khó maintain | **Tốt** |
| Parse JSON/YAML | Khó (jq/yq) | **Built-in** |
| HTTP request | `curl` shell | **requests lib** |
| Cloud SDK | CLI invoke | **boto3, gcloud, azure** |
| Data structure | Hạn chế | **list, dict, class** |
| Error handling | Manual | **try/except** |
| Test | Khó | **pytest** |
| Cross-platform | Linux chính | **Win/Mac/Linux** |
| Speed | Nhanh start | Slow start, fast run |

**Quy tắc**: Bash cho < 200 dòng, Python sau đó.

## Setup Python

Đã cài phase 2 (đã có sẵn trên Mac/Linux). Verify:

```bash
python3 --version
# Python 3.11.x

# pip
pip3 --version

# Virtual environment (recommend)
python3 -m venv .venv
source .venv/bin/activate     # Activate
deactivate                     # Exit
```

### `pipx` — install CLI tool isolated

```bash
sudo apt install -y pipx
pipx install ansible
pipx install aws-shell
pipx install yt-dlp
```

Mỗi tool có virtualenv riêng — không conflict.

## Python cơ bản DevOps

### Hello world

```python
#!/usr/bin/env python3

print("Hello DevOps")

import sys
print(f"Args: {sys.argv}")
print(f"Python version: {sys.version}")
```

```bash
chmod +x script.py
./script.py arg1 arg2
```

### Variable

```python
name = "Alice"
age = 30
is_admin = True
servers = ["web01", "web02", "web03"]
config = {"host": "localhost", "port": 8080}

print(f"User: {name} ({age})")
print(f"Servers: {', '.join(servers)}")
print(f"Port: {config['port']}")
```

### Control flow

```python
# If
if age >= 18:
    print("Adult")
elif age >= 13:
    print("Teen")
else:
    print("Child")

# For
for server in servers:
    print(f"Pinging {server}")

for i, server in enumerate(servers):
    print(f"{i}: {server}")

# Range
for i in range(5):
    print(i)

# While
counter = 0
while counter < 5:
    counter += 1
```

### Function

```python
def deploy(server: str, version: str = "latest") -> bool:
    """Deploy version to server. Return success bool."""
    print(f"Deploying {version} to {server}")
    return True

result = deploy("web01", "v1.2.3")
```

Type hint `: str`, `: bool` không enforce runtime nhưng giúp IDE + tool (mypy) check.

### Exception handling

```python
try:
    with open("/etc/config.yml") as f:
        content = f.read()
except FileNotFoundError:
    print("Config not found")
    sys.exit(1)
except PermissionError:
    print("Permission denied")
    sys.exit(2)
except Exception as e:
    print(f"Unexpected: {e}")
    raise
```

Bash không có try/except — Python win cho complex error handling.

## File operations

```python
from pathlib import Path

# Read
content = Path("/etc/hosts").read_text()

# Write
Path("/tmp/output.txt").write_text("Hello")

# Iterate dir
for f in Path("/var/log").glob("*.log"):
    print(f"{f.name}: {f.stat().st_size} bytes")

# Make dir
Path("/tmp/new").mkdir(parents=True, exist_ok=True)
```

## JSON

```python
import json

# Parse
data = json.loads('{"name": "Alice", "age": 30}')
print(data["name"])

# From file
with open("config.json") as f:
    data = json.load(f)

# Dump
config = {"port": 8080, "debug": True}
print(json.dumps(config, indent=2))

# Save to file
with open("output.json", "w") as f:
    json.dump(config, f, indent=2)
```

## YAML

```python
import yaml          # pip install pyyaml

# Parse
with open("config.yml") as f:
    data = yaml.safe_load(f)

# Dump
yaml.safe_dump(data, sys.stdout)
```

## Subprocess — chạy shell command

```python
import subprocess

# Run + capture output
result = subprocess.run(
    ["ls", "-la", "/tmp"],
    capture_output=True,
    text=True,
    check=True              # Raise nếu exit code ≠ 0
)
print(result.stdout)

# Shell pipe (cẩn thận inject)
result = subprocess.run(
    "ps aux | grep nginx",
    shell=True,
    capture_output=True,
    text=True
)

# Stream output
process = subprocess.Popen(
    ["tail", "-f", "/var/log/syslog"],
    stdout=subprocess.PIPE,
    text=True
)
for line in process.stdout:
    print(line.strip())
```

## HTTP — `requests`

```bash
pip install requests
```

```python
import requests

# GET
r = requests.get("https://api.github.com/users/torvalds")
print(r.status_code)
print(r.json()["name"])

# POST
r = requests.post(
    "https://api.example.com/users",
    json={"name": "Alice", "email": "a@b.com"},
    headers={"Authorization": "Bearer xxx"}
)
r.raise_for_status()

# Session (connection reuse)
s = requests.Session()
s.headers.update({"Authorization": "Bearer xxx"})
r = s.get("https://api.example.com/users")
```

## AWS — `boto3`

```bash
pip install boto3
```

```python
import boto3

# EC2
ec2 = boto3.client("ec2", region_name="us-east-1")

# List instances
response = ec2.describe_instances()
for reservation in response["Reservations"]:
    for inst in reservation["Instances"]:
        print(f"{inst['InstanceId']}: {inst['State']['Name']}")

# Start
ec2.start_instances(InstanceIds=["i-xxx"])

# S3 — high-level resource
s3 = boto3.resource("s3")
bucket = s3.Bucket("my-bucket")

# Upload
bucket.upload_file("local.txt", "remote.txt")

# Download
bucket.download_file("remote.txt", "local.txt")

# List
for obj in bucket.objects.all():
    print(obj.key)
```

## Argparse — CLI args

```python
import argparse

parser = argparse.ArgumentParser(description="Deploy app")
parser.add_argument("--env", choices=["dev", "staging", "prod"], required=True)
parser.add_argument("--version", default="latest")
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("servers", nargs="+", help="Target servers")

args = parser.parse_args()
print(f"Deploy {args.version} to {args.env}: {args.servers}")
```

```bash
./deploy.py --env prod --version v1.2.3 web01 web02 web03
```

## Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("/var/log/myapp.log"),
        logging.StreamHandler()
    ]
)

log = logging.getLogger(__name__)

log.info("Starting deploy")
log.warning("Disk usage 80%")
log.error("Deploy failed")
```

5 level: DEBUG < INFO < WARNING < ERROR < CRITICAL.

## Project structure

```text
my-tool/
├── pyproject.toml          ← Package config
├── README.md
├── src/
│   └── my_tool/
│       ├── __init__.py
│       ├── cli.py          ← Entry point
│       ├── aws.py
│       └── utils.py
├── tests/
│   ├── test_aws.py
│   └── test_utils.py
└── .venv/                  ← (gitignored)
```

`pyproject.toml`:

```toml
[project]
name = "my-tool"
version = "0.1.0"
dependencies = [
    "boto3>=1.26",
    "requests>=2.28",
    "pyyaml>=6.0",
]

[project.scripts]
my-tool = "my_tool.cli:main"
```

Install local:

```bash
pip install -e .
my-tool --help
```

## Testing — pytest

```bash
pip install pytest
```

```python
# tests/test_utils.py
from my_tool.utils import normalize

def test_normalize():
    assert normalize("Hello World") == "hello-world"
    assert normalize("ABC") == "abc"

def test_normalize_empty():
    assert normalize("") == ""
```

```bash
pytest
pytest -v                 # Verbose
pytest -k "normalize"     # Filter
pytest --cov=src          # Coverage
```

## Code quality

```bash
# Linter + formatter
pip install ruff black mypy

ruff check src/
ruff format src/
black src/
mypy src/
```

Pre-commit hook:

```yaml
- repo: https://github.com/astral-sh/ruff-pre-commit
  rev: v0.1.0
  hooks:
    - id: ruff
    - id: ruff-format
```

## Real-world script — deploy tool

```python
#!/usr/bin/env python3
"""
Deploy script for vProfile

Usage:
    deploy.py --env prod --version v1.2.3
"""
import argparse
import logging
import subprocess
import sys
from pathlib import Path

import boto3
import requests

log = logging.getLogger(__name__)


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
    )


def get_servers(env: str) -> list[str]:
    """Get server list from AWS by tag."""
    ec2 = boto3.client("ec2")
    resp = ec2.describe_instances(
        Filters=[
            {"Name": "tag:Environment", "Values": [env]},
            {"Name": "tag:Role", "Values": ["app"]},
            {"Name": "instance-state-name", "Values": ["running"]},
        ]
    )
    return [
        inst["PrivateIpAddress"]
        for r in resp["Reservations"]
        for inst in r["Instances"]
    ]


def health_check(server: str) -> bool:
    """Curl /health endpoint."""
    try:
        r = requests.get(f"http://{server}:8080/health", timeout=5)
        return r.status_code == 200
    except requests.RequestException:
        return False


def deploy_server(server: str, version: str) -> bool:
    """Deploy to one server."""
    log.info(f"Deploying {version} to {server}")
    try:
        subprocess.run(
            ["scp", f"target/vprofile-{version}.war",
             f"ubuntu@{server}:/opt/tomcat/webapps/ROOT.war"],
            check=True
        )
        subprocess.run(
            ["ssh", f"ubuntu@{server}", "sudo systemctl restart tomcat"],
            check=True
        )
        return True
    except subprocess.CalledProcessError as e:
        log.error(f"Deploy {server} failed: {e}")
        return False


def main() -> int:
    setup_logging()

    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True, choices=["staging", "prod"])
    parser.add_argument("--version", required=True)
    parser.add_argument("--skip-health", action="store_true")
    args = parser.parse_args()

    log.info(f"Starting deploy {args.version} to {args.env}")

    servers = get_servers(args.env)
    if not servers:
        log.error("No servers found")
        return 1

    log.info(f"Found {len(servers)} servers")

    failed = []
    for srv in servers:
        if not deploy_server(srv, args.version):
            failed.append(srv)
            continue
        if not args.skip_health and not health_check(srv):
            failed.append(srv)
            log.error(f"{srv} health check failed")

    if failed:
        log.error(f"Failed: {failed}")
        return 1

    log.info("Deploy complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Production-grade pattern.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `sudo pip install` | Phá Python hệ thống | virtualenv hoặc pipx |
| Python 2 deprecated | Code fail | Luôn `python3` |
| Quên `chmod +x` | Permission denied | `chmod +x script.py` |
| `subprocess.shell=True` với user input | Code injection | Escape hoặc `shell=False` |
| Global mutable default arg | Bug subtle | Dùng `None` + check |
| Quên handle exception | Crash silent | try/except chiến lược |
| Hardcode credential | Lộ | env var hoặc secret manager |
| Forget timeout | Hang | `timeout=N` cho HTTP |

## Tóm tắt bài 1

- Python = **automation cấp 2** khi Bash đuối.
- **virtualenv** isolate dependency. **pipx** cho CLI tool.
- **`requests`** HTTP, **`boto3`** AWS, **`pyyaml`** YAML.
- **`subprocess.run(check=True)`** chạy shell.
- **`argparse`** parse CLI args.
- **`logging`** structured log với level.
- **`pytest`** test, **`ruff`** lint, **`black`** format, **`mypy`** type check.
- Script Python > 200 dòng = chuẩn DevOps tooling.

**Phase kế tiếp** → [Phase 21 — Bài 1: Terraform — Infrastructure as Code](../phase-21-terraform/01-terraform-basics.md)
