# Bài 1: AI cho DevOps — Copilot, ChatGPT, Claude trong workflow

Năm 2026, AI-assisted coding đã trở thành **chuẩn nghề nghiệp**. DevOps engineer dùng AI để: viết script, debug lỗi, hiểu code legacy, generate config, review PR. Bài này dạy cách **dùng AI như công cụ — không phải thay thế kỹ năng**.

## Các AI tool phổ biến trong DevOps

| Tool | Thế mạnh | Cost |
|---|---|---|
| **GitHub Copilot** | Inline code completion, tích hợp IDE | $10/tháng (personal) |
| **ChatGPT / GPT-4** | Conversational, scope rộng | Free + Plus $20/tháng |
| **Claude (Anthropic)** | Long context, reasoning sâu, coding mạnh | Free + Pro $20/tháng |
| **Codeium** | Free alternative cho Copilot | Free |
| **Cursor** | AI-first editor (fork VS Code) | $20/tháng |
| **Aider** | Pair-programming qua CLI, hiểu git | Free (BYOK — bring your own key) |
| **Continue** | Open-source clone của Copilot | Free |

**Khuyến nghị cho khoá học:**
- **Copilot** trong VS Code cho coding hàng ngày.
- **Claude** hoặc ChatGPT cho explain, planning, task phức tạp.

## Khi nào AI hữu ích?

✓ **Tốt cho:**
- Generate boilerplate (Dockerfile, Terraform module, K8s YAML).
- Giải thích code legacy không hiểu.
- Convert giữa các format (JSON → YAML, Bash → Python).
- Debug error message khó hiểu.
- Suggest pattern khi bạn mô tả vấn đề.
- Viết / improve documentation.
- Generate test case.

✗ **Không nên trust mù:**
- Security-critical config.
- Production deployment script (verify từng dòng).
- Code không hiểu — copy paste → bug khó debug.
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

AI sẽ trả về Vagrantfile gần production-ready. Bạn **vẫn phải verify**:
- IP đúng range.
- Box name có hợp lệ trên Vagrant Cloud không.
- Provision script có chạy được với distro target không.

## Pattern 2: Giải thích code legacy

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

Hoặc convert giữa ngôn ngữ:

> Rewrite this Bash script in Python with better error handling

## Pattern 4: Debug error

```text
Error trên terminal:
nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)
```

Prompt:

> nginx fails to start with this error. What's wrong and how to fix?

AI giải thích: port 80 đã bị process khác chiếm, suggest dùng `ss -tlnp :80` để check, kill process đó hoặc đổi port của nginx.

## Pattern 5: Code review

Prompt:

> Review this Dockerfile for security and performance issues:
>
> [paste Dockerfile]

AI thường catch được:
- Run as root (security risk).
- Cache dependency không hiệu quả (performance).
- Image base outdated.
- Thiếu healthcheck.

## Prompt engineering — Viết prompt tốt

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

1. Cài extension **GitHub Copilot**.
2. Sign in GitHub.
3. Activate subscription Copilot (free 30 ngày trial).

Workflow:

```bash
# Gõ comment mô tả ý định
# Function to monitor disk usage and alert if > threshold

# Copilot tự suggest function. Tab để accept.
monitor_disk() {
    local threshold=${1:-80}
    df -h | awk -v t=$threshold '$5+0 > t {print "Alert: "$6" "$5}'
}
```

Hoặc gõ tên function → Copilot fill body cho bạn.

### Copilot Chat (sidebar)

Các slash command hữu ích:
- `@workspace` — hỏi về code project.
- `/explain` — explain phần đang select.
- `/fix` — suggest fix.
- `/tests` — generate test.
- `/doc` — generate docstring.

## Claude Code

Anthropic Claude tích hợp CLI cho coding task:

```bash
# Cài đặt
npm install -g @anthropic-ai/claude-code

# Chạy trong project folder
claude

# Trong REPL:
> implement a Bash script to check service health
> explain this error: [paste]
> refactor function in src/utils.sh
```

Claude Code agent đọc file, suggest edit, thậm chí chạy được lệnh test.

## Verify AI output (Quy tắc vàng)

**Quy tắc vàng**: AI generate ≠ production-ready.

```bash
# 1. Đọc từng dòng, hiểu logic
# 2. Test trong môi trường isolated
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

## Bias và limitations (Thiên kiến và hạn chế)

AI có thể:
- **Hallucinate** (bịa): invent flag không tồn tại.
- **Outdated** (cũ): dùng API đã deprecated.
- **Security-blind** (mù bảo mật): suggest hardcode credential.
- **Verbose**: code quá dài, không idiomatic (không đúng phong cách ngôn ngữ).

Mitigation (cách hạn chế):
- Cross-check với docs official.
- Test trước khi deploy production.
- Review như review PR của junior dev.
- Cập nhật AI thường xuyên (model version).

## AI cho từng task DevOps cụ thể

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

AI generate playbook với module `apt`, `systemd`, `template`.

## Real workflow — Pair programming với AI

```text
1. Bạn: viết comment mô tả task.
2. AI: suggest implementation.
3. Bạn: accept / reject, refine.
4. AI: handle edge case bạn missed.
5. Bạn: test, verify, deploy.
6. Both: faster than alone.
```

## Pricing nhanh

| Tool | Free tier | Paid |
|---|---|---|
| Copilot | Trial 30 ngày | $10/tháng (personal), $19/tháng (business) |
| ChatGPT | GPT-3.5 free | Plus $20/tháng (GPT-4) |
| Claude | Sonnet free, có limit | Pro $20/tháng (Opus, usage nhiều hơn) |
| Cursor | Free 2000 completion | Pro $20/tháng |

Thường được employer reimburse (chi trả lại).

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Copy paste mà không hiểu | Bug khó debug | Đọc, hiểu trước khi accept |
| AI suggest credential hardcoded | Security leak | Luôn code review |
| Outdated API | Deprecation warning, fail | Verify docs official |
| Hallucinate flag không tồn tại | Command fail | Test trước khi deploy |
| Quá tin test AI generate | Test không cover edge case | Manual review test |
| Không version control AI session | Mất context | Save chat hữu ích |

## Skill vẫn quan trọng — AI không thay thế

AI **không** thay thế:
- Hiểu **fundamental** (Linux, network, container).
- **Architecture decision** (microservice vs monolith).
- **Debugging** root cause có hệ thống.
- **Communication** với team.
- **Trade-off evaluation** (đánh giá đánh đổi).

AI = **multiplier** (số nhân) cho skill bạn đã có. Nếu không có base skill → AI output bạn không verify được → nguy hiểm.

## Tóm tắt bài 1

- AI tool: **Copilot** (IDE), **ChatGPT** / **Claude** (conversational), **Cursor** (AI editor).
- Prompt tốt theo CRISP: **C**ontext + **R**ole + **I**nstruction + **S**pecifics + **P**arameters.
- AI hữu ích cho: boilerplate, explain, convert, debug, review.
- AI **không** thay thế: fundamental, architecture, trade-off.
- **Verify mọi output**: shellcheck, dry-run, test trong môi trường isolated.
- AI hallucinate, outdated — cross-check với docs official.
- **Free** với mức cơ bản, **paid $10-20/tháng** cho feature unlimited.

**Phase kế tiếp** → [Phase 13 — Bài 1: AWS overview](../phase-13-aws-part1/01-aws-overview.md)
