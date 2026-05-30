# Bài 1: AI for DevOps — Copilot, ChatGPT, Claude trong workflow

2026, AI-assisted coding là **chuẩn nghề nghiệp**. DevOps engineer dùng AI để: viết script, debug error, explain code legacy, generate config, review PR. Bài này dạy **dùng AI như tool, không thay thế kỹ năng**.

## Các AI tool phổ biến trong DevOps

| Tool | Strength | Cost |
|---|---|---|
| **GitHub Copilot** | Inline code completion, IDE integrated | $10/month personal |
| **ChatGPT / GPT-4** | Conversational, broad | Free + Plus $20/month |
| **Claude (Anthropic)** | Long context, reasoning sâu, strong coding | Free + Pro $20/month |
| **Codeium** | Free Copilot alternative | Free |
| **Cursor** | AI-first editor (fork VS Code) | $20/month |
| **Aider** | CLI pair-programming, git-aware | Free (BYOK) |
| **Continue** | Open-source Copilot clone | Free |

**Recommend cho khoá**:
- **Copilot** trong VS Code cho coding daily.
- **Claude** hoặc ChatGPT cho explain, planning, complex.

## Khi nào AI hữu ích?

✓ **Tốt cho**:
- Generate boilerplate (Dockerfile, Terraform module, K8s YAML).
- Explain code legacy không hiểu.
- Convert giữa format (JSON → YAML, Bash → Python).
- Debug error message obscure.
- Suggest pattern khi bạn mô tả problem.
- Write/improve documentation.
- Generate test case.

✗ **Không nên trust mù**:
- Security-critical config.
- Production deployment script (verify từng line).
- Code không hiểu — dùng → bug khó debug.
- Latest version syntax — AI có thể outdated.
- Performance-critical optimization.

## Pattern 1: Prompt cho Vagrantfile

Prompt:

> Generate a Vagrantfile with:
> - 3 VMs: web01 (Ubuntu 22.04), db01 (CentOS Stream 9), cache01 (Ubuntu 22.04)
> - Private network static IPs 192.168.56.41-43
> - 1 GB RAM, 1 CPU each
> - Provision web01 with nginx installed
> - Provision db01 with MariaDB
> - Use VirtualBox provider

AI sẽ trả Vagrantfile gần production-ready. Bạn **verify**:
- IP đúng range.
- Box names hợp lệ trên Vagrant Cloud.
- Provision script work với distro target.

## Pattern 2: Explain code legacy

```bash
# script.sh kế thừa từ team cũ, 500 dòng, không có comment
```

Prompt Claude:

> Explain this Bash script section by section:
>
> [paste code]
>
> What does it do, and identify any bugs or anti-patterns.

Claude phân tích từng block, gợi ý improvement. Tiết kiệm vài giờ đọc.

## Pattern 3: Convert format

```bash
# Có ChatGPT prompt
"Convert this JSON to YAML:
{
  "version": "3.9",
  "services": {
    "web": {
      "image": "nginx:1.25",
      "ports": ["80:80"]
    }
  }
}
"
```

Output YAML đúng syntax.

Hoặc convert ngôn ngữ:

> Rewrite this Bash script in Python with better error handling

## Pattern 4: Debug error

```text
Error trong terminal:
nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)
```

Prompt:

> nginx fails to start with this error. What's wrong and how to fix?

AI giải thích: port 80 đã dùng, suggest `ss -tlnp :80`, kill process hoặc đổi port.

## Pattern 5: Code review

Prompt:

> Review this Dockerfile for security and performance issues:
>
> [paste Dockerfile]

AI thường catch:
- Run as root (security).
- Cache deps không hiệu quả (performance).
- Image base outdated.
- Missing healthcheck.

## Prompt engineering — viết prompt tốt

### Bad prompt

> "make a script"

→ Kết quả random, không hữu ích.

### Good prompt

> "Write a Bash script that:
> - Takes 2 args: source folder and S3 bucket name
> - Validates both args exist
> - Tars + gzips source folder with timestamp
> - Uploads to S3 with `aws s3 cp`
> - Logs to /var/log/backup.log
> - Cleans up local tar after upload
> - Exits with error code if any step fails
> Use `set -euo pipefail` and shellcheck-clean style."

→ AI generate đúng requirements.

### Khung prompt CRISP

| Letter | Phần |
|---|---|
| **C**ontext | Tôi là DevOps engineer, dự án X, đang vận hành nginx + MySQL |
| **R**ole | Bạn là expert DevOps |
| **I**nstruction | Viết script làm Y |
| **S**pecifics | Yêu cầu cụ thể: Bash strict mode, shellcheck-clean, log format ABC |
| **P**arameters | Constraint: < 100 dòng, không dùng external tool |

## VS Code + Copilot setup

1. Install **GitHub Copilot** extension.
2. Sign in GitHub.
3. Activate Copilot subscription (free 30-day trial).

Workflow:

```bash
# Gõ comment mô tả intent
# Function to monitor disk usage and alert if > threshold

# Copilot auto-suggest function. Tab để accept.
monitor_disk() {
    local threshold=${1:-80}
    df -h | awk -v t=$threshold '$5+0 > t {print "Alert: "$6" "$5}'
}
```

Hoặc gõ tên function → Copilot fill body.

### Copilot Chat (sidebar)

- `@workspace` — ask về code project.
- `/explain` — explain selection.
- `/fix` — suggest fix.
- `/tests` — generate test.
- `/doc` — generate docstring.

## Claude Code

Anthropic Claude tích hợp CLI cho coding tasks:

```bash
# Cài
npm install -g @anthropic-ai/claude-code

# Chạy trong project folder
claude

# Trong REPL:
> implement a Bash script to check service health
> explain this error: [paste]
> refactor function in src/utils.sh
```

Claude Code agent đọc file, suggest edit, có thể chạy lệnh test.

## Verify AI output

**Quy tắc vàng**: AI generate ≠ production-ready.

```bash
# 1. Đọc từng line, hiểu logic
# 2. Test trên môi trường isolated
# 3. shellcheck cho Bash
shellcheck script.sh

# 4. Lint cho Python
ruff check script.py
mypy script.py

# 5. terraform validate / fmt
terraform validate
terraform fmt -check

# 6. yamllint
yamllint deploy.yaml

# 7. dry-run cho deploy
kubectl apply --dry-run=client -f manifest.yaml
ansible-playbook --check play.yml
```

## Bias và limitations

AI có thể:
- **Hallucinate**: invent flag không tồn tại.
- **Outdated**: dùng API deprecated.
- **Security-blind**: suggest credential hardcoded.
- **Verbose**: code quá dài, không idiomatic.

Mitigation:
- Cross-check docs official.
- Test trước deploy production.
- Review như review PR của junior.
- Cập nhật AI thường (model versions).

## AI cho specific DevOps task

### Kubernetes manifest

Prompt:

> Generate K8s Deployment + Service + Ingress for nginx with 3 replicas, port 80, basic resource limits, healthcheck on /health.

AI output 3 manifest valid. Verify với `kubectl apply --dry-run`.

### Terraform module

> Write Terraform module to create AWS VPC with public + private subnets across 2 AZs, NAT gateway, route tables.

Output module với variables, outputs, resources.

### Jenkinsfile

> Write Jenkinsfile for Java Maven project: checkout → build → test → SonarQube scan → push artifact to Nexus → deploy to staging.

Output declarative pipeline.

### Ansible playbook

> Convert this Bash provision script to Ansible playbook with idempotent tasks.

AI generate playbook với modules `apt`, `systemd`, `template`.

## Real workflow — pair với AI

```text
1. Bạn: viết comment mô tả task.
2. AI: suggest implementation.
3. Bạn: accept/reject, refine.
4. AI: handle edge case bạn missed.
5. Bạn: test, verify, deploy.
6. Both: faster than alone.
```

## Pricing nhanh

| Tool | Free tier | Paid |
|---|---|---|
| Copilot | Trial 30 ngày | $10/mo (personal), $19/mo (business) |
| ChatGPT | GPT-3.5 free | Plus $20/mo (GPT-4) |
| Claude | Sonnet free, limit | Pro $20/mo (Opus, more usage) |
| Cursor | Free 2k completion | Pro $20/mo |

Reimburse từ employer thường được.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Copy paste không hiểu | Bug khó debug | Đọc, hiểu trước accept |
| AI suggest credential hardcoded | Security leak | Code review luôn |
| Outdated API | Deprecation warning, fail | Verify docs official |
| Hallucinate flag | Command fail | Test trước deploy |
| Quá tin AI generate test | Test không cover edge case | Manual review test |
| Không version control AI session | Lose context | Save chat hữu ích |

## Skills vẫn quan trọng

AI **không** thay thế:
- Hiểu **fundamentals** (Linux, network, container).
- **Architecture** decision (microservice vs monolith).
- **Debugging** root cause systematic.
- **Communication** với team.
- **Tradeoff** evaluation.

AI = **multiplier** của skill bạn có. Không có base skill → AI output bạn không verify được → dangerous.

## Tóm tắt bài 1

- AI tool: **Copilot** (IDE), **ChatGPT** / **Claude** (conversational), **Cursor** (AI editor).
- Prompt tốt: **C**ontext + **R**ole + **I**nstruction + **S**pecifics + **P**arameters.
- AI hữu ích cho: boilerplate, explain, convert, debug, review.
- AI **không** thay thế: fundamentals, architecture, tradeoff.
- **Verify mọi output**: shellcheck, dry-run, test môi trường isolated.
- AI hallucinate, outdated — cross-check docs official.
- **Free** với base, **paid $10-20/mo** với unlimited features.

**Phase kế tiếp** → [Phase 13 — Bài 1: AWS overview](../phase-13-aws-part1/01-aws-overview.md)
