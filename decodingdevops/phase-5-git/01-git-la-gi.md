# Bài 1: Git là gì? Version Control System trong DevOps

## Vấn đề Git giải quyết

Bạn viết code mới: `app.py`. Cần backup → `app_v1.py`. Sửa nhỏ → `app_v2.py`. Hôm sau → `app_v2_final.py`, `app_v2_final_FIX.py`, `app_v2_REALLY_final.py`. Một tuần sau bạn không biết version nào ở đâu, ai sửa gì.

Đây là cách **không có version control** — và là sự thật của mọi team chưa biết Git.

> **Git** = phần mềm theo dõi **mọi thay đổi** của mọi file trong project, **không giới hạn số version**, biết ai sửa gì khi nào, cho phép quay lại bất kỳ thời điểm nào, và đồng bộ giữa nhiều người làm việc chung.

## Vì sao DevOps engineer phải master Git?

Mọi thứ trong DevOps **chạy trên Git**:

| Tài sản | Lưu ở đâu |
|---|---|
| Application source code | Git |
| Infrastructure-as-Code (Terraform, CloudFormation) | Git |
| Configuration management (Ansible playbook) | Git |
| CI/CD pipeline (Jenkinsfile, GitHub Actions YAML) | Git |
| Kubernetes manifest | Git |
| Documentation | Git |
| Dockerfile | Git |
| Database schema migration | Git |

Đây là khái niệm **GitOps** — mọi thay đổi production được drive bằng commit Git. Không có Git = không có DevOps.

## Lịch sử Git ngắn

- **1991-2005**: Linux kernel team dùng BitKeeper (commercial). 2005, BitKeeper rút free license → khủng hoảng.
- **2005**: Linus Torvalds viết Git trong **vài tuần**. Mục tiêu: nhanh, distributed, integrity-checked.
- **2008**: GitHub ra mắt — biến Git thành chuẩn ngành.
- **2024**: 95%+ dự án mới dùng Git.

Tên "Git" — Linus đùa: "I'm an egotistical bastard, and I name all my projects after myself. First Linux, now git."

## VCS — Version Control System

3 thế hệ:

### 1. Local VCS (1980s)

Lưu version trên 1 máy. Vd: RCS, SCCS. Vấn đề: máy hỏng = mất hết.

### 2. Centralized VCS (1990s-2000s)

Vd: **CVS**, **Subversion (SVN)**. Có server trung tâm chứa toàn bộ history.

```text
[Dev A] ──┐
[Dev B] ──┼─► [Central server] (lịch sử ở đây)
[Dev C] ──┘
```

Nhược:
- Server chết → cả team không làm được.
- Phải online để commit.
- Branching chậm và đau đớn.

### 3. Distributed VCS (2005+)

Vd: **Git**, Mercurial. Mỗi máy có **bản sao đầy đủ** repository.

```text
[Dev A repo (full)] ◄──► [Remote (GitHub)] ◄──► [Dev B repo (full)]
                              ▲
                              │
                         [Dev C repo (full)]
```

Ưu điểm:
- Commit offline.
- Server chết → ai cũng có backup full.
- Branch nhẹ, nhanh (milisecond).
- Operation đa số là **local** → cực nhanh.

## Git so với SVN

| | SVN | Git |
|---|---|---|
| Architecture | Centralized | Distributed |
| Offline commit | ✗ | ✓ |
| Branching | Chậm, đau | Tức thì |
| Merge | Khó | Tốt hơn |
| History storage | Per-file delta | Snapshot toàn project |
| Network usage | Nhiều | Ít (chỉ push/pull) |
| Curve học | Dễ hơn | Khó hơn (concept mới) |
| Hiện trạng (2024+) | Lụi tàn | Chuẩn de facto |

Dự án mới: **luôn chọn Git**. SVN chỉ gặp khi maintain legacy.

## Hosting platforms — nơi remote Git ở

Git có thể tự host (chạy `git daemon`), nhưng đa số dùng dịch vụ cloud:

| Platform | Đặc điểm |
|---|---|
| **GitHub** | Phổ biến nhất, ~95% dự án open-source |
| **GitLab** | Self-host mạnh, CI tích hợp |
| **Bitbucket** | Tích hợp Atlassian (Jira, Confluence) |
| **AWS CodeCommit** | Tích hợp AWS pipeline |
| **Gitea / Forgejo** | Open-source self-host nhẹ |

Khoá này dùng **GitHub** (đã setup phase 2).

## Cài Git

Đã cài ở phase 2:

```bash
# Verify
git --version
# git version 2.x.y
```

Nếu chưa:

```bash
sudo apt install -y git              # Ubuntu/Debian
sudo dnf install -y git              # RHEL/CentOS
brew install git                     # macOS
choco install git -y                 # Windows
```

## Cấu hình lần đầu — `git config`

Trước commit đầu tiên, set tên + email:

```bash
git config --global user.name "Nguyen Hoang Anh"
git config --global user.email "hoanganh@example.com"

# Default editor
git config --global core.editor vim

# Default branch name (modern: main thay master)
git config --global init.defaultBranch main

# Color output
git config --global color.ui auto

# Line ending (Windows users)
git config --global core.autocrlf input

# Verify
git config --list
git config --global --list
```

`--global` = áp dụng cho mọi repo trên user này. `--local` = chỉ repo hiện tại. `--system` = toàn server.

Config file:
- Global: `~/.gitconfig`
- Local: `.git/config` trong repo
- System: `/etc/gitconfig`

## 3 trạng thái của file trong Git

```text
+──────────────+      git add       +──────────+      git commit     +───────────+
│  Working     │ ─────────────────► │ Staging  │ ──────────────────► │ Committed │
│  Directory   │                    │  Area    │                     │  (.git/)  │
│  (file thật) │ ◄───────────────── │  (index) │ ◄─────────────────  │           │
+──────────────+    git restore     +──────────+    git reset        +───────────+
```

| Trạng thái | Mô tả |
|---|---|
| **Working directory** | File trên disk bạn đang edit |
| **Staging area (index)** | "Đợi commit" — file bạn đã `git add` |
| **Committed** | Đã lưu vào `.git/` — version chính thức |

Đây là **mental model quan trọng nhất** của Git. Sai khái niệm này → confused mãi.

## Workflow Git cơ bản

```bash
# 1. Tạo repo mới
mkdir myproject && cd myproject
git init                             # Tạo .git/ folder

# 2. Tạo file
echo "Hello" > README.md

# 3. Check status
git status
# On branch main
# Untracked files: README.md

# 4. Add file vào staging
git add README.md
# Hoặc: git add . (mọi file thay đổi)

# 5. Commit
git commit -m "Initial commit"

# 6. Tiếp tục sửa, add, commit...
echo "World" >> README.md
git add README.md
git commit -m "Add World"

# 7. Xem lịch sử
git log
git log --oneline
git log --graph --oneline --all
```

## `.git/` — bên trong "magic"

Khi `git init`, folder `.git/` tạo ra:

```text
.git/
├── HEAD              ← Trỏ tới branch hiện tại
├── config            ← Repo config
├── description       ← Hiếm dùng
├── hooks/            ← Script chạy trước/sau commit, push...
├── index             ← Staging area (binary)
├── info/             ← Exclude patterns
├── objects/          ← Toàn bộ data (compressed)
│   ├── 1a/2b3c...    ← Mỗi commit/file là 1 object hash SHA-1
│   └── ...
├── refs/             ← Pointer → commit
│   ├── heads/        ← Branch local
│   └── remotes/      ← Branch remote
└── logs/             ← Lịch sử move của HEAD và branch
```

**Mọi version** của mọi file đều ở `objects/`. Xoá `.git/` = mất hết history. **Luôn backup `.git/`** (push lên remote = backup).

## Object types — 4 loại trong `.git/objects/`

| Type | Mô tả |
|---|---|
| **blob** | Nội dung file |
| **tree** | Cấu trúc folder (file + subfolder + permission) |
| **commit** | Snapshot tại 1 thời điểm + metadata (author, time, message, parent) |
| **tag** | Pointer cố định tới commit (cho version v1.0...) |

Mỗi object có **SHA-1 hash** (40 ký tự hex) làm ID. 7 ký tự đầu thường đủ unique cho repo nhỏ.

```bash
git log --oneline
# a3f5b2c (HEAD -> main) Latest commit
# 1d9e4f7 Previous commit
# 8c0a1b3 Initial commit
```

`a3f5b2c` = 7 ký tự đầu của SHA-1.

## Snapshot vs delta — khác biệt cốt lõi

SVN lưu **delta** (sự khác biệt giữa version). Git lưu **snapshot** (toàn bộ file mỗi version) — nhưng compressed và dedup.

```text
File A v1: hello
File A v2: hello world
File A v3: hello world!

SVN:    [v1: hello] [Δ v2: +" world"] [Δ v3: +"!"]
Git:    [v1: blob hash1] [v2: blob hash2] [v3: blob hash3]
        (file không đổi → cùng hash, không tốn disk)
```

Snapshot model giúp Git:
- Branch siêu nhanh (chỉ tạo pointer).
- Restore version tức thì.
- Integrity check (SHA-1 → corrupt phát hiện ngay).

## Integrity — SHA-1 mọi nơi

Mọi object trong Git có SHA-1 hash. Nội dung file đổi 1 byte → hash đổi hoàn toàn → Git biết ngay.

```bash
git fsck                             # Check integrity
```

Bonus: hash chain → blockchain. Git là tổ tiên kỹ thuật của blockchain (Linus và Satoshi không liên quan, nhưng concept giống).

## Local vs Remote

```text
LOCAL                              REMOTE (GitHub)
+────────────+                     +──────────────+
│ Working    │                     │              │
│ directory  │                     │              │
├────────────┤   git push          │   Server     │
│ Staging    │ ──────────────────► │   side       │
├────────────┤                     │              │
│ .git/      │ ◄────────────────── │              │
│ (local DB) │   git fetch / pull  │              │
+────────────+                     +──────────────+
```

Lệnh **local-only**: `init`, `add`, `commit`, `status`, `log`, `branch`, `checkout`, `merge`, `reset`.

Lệnh **kết nối remote**: `clone`, `push`, `pull`, `fetch`, `remote`.

## .gitignore — file không muốn track

Trong root repo, tạo `.gitignore`:

```text
# Bash style comments
*.log
*.tmp
.env
.DS_Store
node_modules/
__pycache__/
*.pyc
build/
dist/
.idea/
.vscode/
```

Git **bỏ qua** mọi file/folder match. Hữu ích cho:
- Secret (`.env`).
- Build artifact (`build/`, `dist/`).
- Editor metadata (`.idea/`, `.vscode/`).
- Dependency (`node_modules/`).

Templates `.gitignore` cho mọi ngôn ngữ: [github.com/github/gitignore](https://github.com/github/gitignore).

> **Đã track rồi mới thêm vào `.gitignore` → không hiệu lực**. Phải `git rm --cached file` trước.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên `git config user.email` | Commit fail | Set global config |
| Commit secret (.env, .pem) | Lộ credential trên public repo | `.gitignore` + git-secrets tool |
| `git add .` add hết kể cả file rác | Repo lớn lên | `.gitignore` + add file cụ thể |
| Xoá `.git/` | Mất history | Push remote = backup |
| Edit `.git/` thủ công | Corrupt repo | Dùng lệnh git, không edit |
| Commit binary file (image, video) | Repo phình | Git LFS |
| Push key SSH/AWS lên public | Tài khoản bị hack | Pre-commit hook check secret |

## Câu hỏi gợi ý

- VCS centralized vs distributed khác nhau ra sao?
- 3 trạng thái file trong Git?
- Snapshot vs delta — Git chọn cái nào? Vì sao?
- `.git/objects/` chứa gì?
- Khi nào dùng `.gitignore`?

## Tóm tắt bài 1

- **Git** = distributed VCS, mỗi máy có bản sao đầy đủ.
- Linus viết Git 2005 cho Linux kernel — nay là chuẩn ngành.
- **3 trạng thái**: Working directory → Staging → Committed (qua `git add` → `git commit`).
- Mọi object trong `.git/objects/` có **SHA-1 hash** → integrity tuyệt đối.
- Git lưu **snapshot** (không phải delta) — branch nhẹ, restore nhanh.
- `.gitignore` cho file không track. Set `user.name`/`user.email` trước commit đầu.

**Bài kế tiếp** → [Bài 2: Git cơ bản — init, add, commit, log, diff](02-git-co-ban.md)
