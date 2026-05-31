# Bài 2: Git cơ bản — init, add, commit, log, diff

Bài này dạy **5 lệnh DevOps engineer gõ mỗi ngày**: `init`, `add`, `commit`, `status`, `log`. Cùng `diff` để xem thay đổi và `restore`/`rm` để hủy.

## Tạo repo mới — `git init`

```bash
mkdir titanwork && cd titanwork
git init
# Initialized empty Git repository in /home/.../titanwork/.git/
```

```bash
ls -la
# total 12
# drwxr-xr-x .
# drwxr-xr-x ..
# drwxr-xr-x .git/      ← Database Git
```

Sau lệnh này, folder = **Git repo**. Mọi file thêm vào đều có thể track.

### Default branch name

Modern Git (2.28+) cho phép set branch mặc định:

```bash
git config --global init.defaultBranch main
```

Trước đó là `master` — vì lý do lịch sử (master/slave terminology), GitHub đổi default sang `main` từ 2020. Khoá này dùng `main`.

Repo cũ vẫn ở `master`:

```bash
git branch -m master main            # Đổi master → main
```

## Check trạng thái — `git status`

Lệnh quan trọng nhất khi mơ hồ:

```bash
git status
```

Output thường thấy:

```text
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:           ← Đã staging
  (use "git restore --staged <file>..." to unstage)
        modified:   README.md

Changes not staged for commit:     ← Đã sửa, chưa staging
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   app.py

Untracked files:                   ← Mới, Git chưa biết
  (use "git add <file>..." to include in what will be committed)
        config/secret.txt
```

Output cho biết 3 trạng thái cùng lúc. Đây là **first command** chạy khi vào repo lạ.

Phiên bản gọn:

```bash
git status -s                        # Short
# M  README.md       ← Staging (uppercase)
#  M app.py          ← Modified (lowercase)
# ?? config/         ← Untracked
```

## Staging — `git add`

```bash
git add README.md                    # 1 file
git add file1 file2 dir/             # Nhiều file
git add .                            # Mọi file thay đổi trong pwd
git add -A                           # Mọi file thay đổi trong repo (kể cả deleted)
git add -u                           # Mọi file đã tracked (không add new)
git add -p                           # Interactive — pick từng phần
git add '*.py'                       # Mọi file .py
```

### `add .` vs `add -A`

- **`git add .`**: thay đổi trong pwd hiện tại (recursive).
- **`git add -A`** hoặc `git add --all`: mọi thay đổi trong repo từ root.

Trong repo nhỏ thường không khác. Trong subfolder lớn thì khác.

### Interactive add — `git add -p`

Mở từng chunk thay đổi, hỏi `y`/`n`/`s` (split chunk):

```bash
git add -p
# diff --git a/app.py b/app.py
# @@ ...
# Stage this hunk [y,n,q,a,d,e,?]?
```

Hữu ích khi 1 file có 2 thay đổi logic khác nhau → split thành 2 commit.

## Commit — `git commit`

```bash
git commit -m "Initial commit"
git commit -m "Fix login bug"

# Đa dòng (header + body)
git commit -m "Fix login bug" -m "Detailed explanation goes here..."

# Mở editor (vim mặc định) để viết message dài
git commit

# Add + commit cùng lúc (chỉ file đã tracked)
git commit -am "Quick fix"
```

### Commit message convention

Format phổ biến nhất — **Conventional Commits**:

```text
<type>(<scope>): <subject>

<body>

<footer>
```

Vd:

```text
feat(auth): add OAuth2 login flow

Implements Google and GitHub OAuth providers.
Token refresh handled in background.

Closes #234
```

Types:
- `feat`: new feature.
- `fix`: bug fix.
- `docs`: documentation.
- `style`: formatting (không đổi logic).
- `refactor`: cấu trúc lại code.
- `test`: test.
- `chore`: maintenance.
- `perf`: performance.
- `ci`: CI/CD config.

Vì sao quan trọng:
- Tự generate CHANGELOG.
- Semantic release tự bump version (`feat` → minor, `fix` → patch, `BREAKING CHANGE:` → major).
- Code reviewer hiểu nhanh.

### Rules viết commit message

| Rule | Lý do |
|---|---|
| Subject ≤ 50 ký tự | Đọc nhanh trên Git UI |
| Imperative mood ("Add", không "Added") | Tự nhiên như "this commit will: Add ..." |
| Không dấu chấm cuối | Convention |
| Body wrap 72 ký tự | Đọc trong terminal |
| Giải thích **WHY** ở body, không WHAT | Diff đã cho biết WHAT |
| 1 commit = 1 logical change | Bisect và revert dễ |

## Xem lịch sử — `git log`

```bash
git log                              # Full log
git log --oneline                    # 1 dòng / commit
git log --oneline -10                # 10 commit gần nhất
git log --graph --oneline --all      # Graph mọi branch
git log -p file.py                   # Diff mỗi commit của file.py
git log --stat                       # Summary file đổi mỗi commit
git log --since="2 weeks ago"
git log --until="2025-01-01"
git log --author="Alice"
git log --grep="bug"                 # Search message
git log -S "function_name"           # Search code change

# Format custom
git log --pretty=format:"%h %an %ar %s"
```

Format placeholder:
- `%H` / `%h`: full / short hash.
- `%an` / `%ae`: author name / email.
- `%ar`: relative time ("2 hours ago").
- `%ad`: absolute date.
- `%s`: subject.

### Pretty alias hữu ích

Thêm vào `~/.gitconfig`:

```ini
[alias]
    lg = log --graph --pretty=format:'%C(yellow)%h%Creset -%C(red)%d%Creset %s %C(green)(%cr) %C(blue)<%an>%Creset' --abbrev-commit
    ll = log --oneline --graph --all
    co = checkout
    br = branch
    st = status -s
    df = diff
    dc = diff --cached
```

Sau đó: `git lg`, `git co main`, `git br -a`, ...

## Xem chi tiết 1 commit — `git show`

```bash
git show                             # Commit cuối (HEAD)
git show HEAD                        # Tương tự
git show HEAD~1                      # Commit trước HEAD 1 bước
git show HEAD~5                      # Commit trước 5 bước
git show a3f5b2c                     # Theo hash
git show main                        # Latest của branch main
git show HEAD --stat                 # Chỉ stat
git show HEAD:file.py                # Phiên bản file.py ở HEAD
```

## Xem khác biệt — `git diff`

```bash
git diff                             # Working dir vs staging
git diff --staged                    # Staging vs last commit
git diff --cached                    # = --staged
git diff HEAD                        # Working dir vs last commit
git diff main feature                # Giữa 2 branch
git diff a3f5b2c b7c1d8e             # Giữa 2 commit
git diff HEAD~3 HEAD                 # 3 commit trở lại đến giờ
git diff --stat                      # Chỉ summary
git diff file.py                     # Chỉ 1 file
git diff -- '*.py'                   # Chỉ .py
```

### Output diff đọc thế nào

```text
diff --git a/app.py b/app.py
index abc1234..def5678 100644
--- a/app.py
+++ b/app.py
@@ -10,7 +10,7 @@ def login(user):
     if not user:
         return False
-    password = "hardcoded"     ← Dòng cũ (- = bị xoá)
+    password = get_secret()    ← Dòng mới (+ = thêm)
     return validate(user, password)
```

- `a/` = phiên bản cũ, `b/` = mới.
- `@@ -10,7 +10,7 @@` = bắt đầu dòng 10, 7 dòng context.
- Dòng `-` đỏ = xoá, `+` xanh = thêm.

## Hủy thay đổi — `git restore`, `git rm`

### Hủy thay đổi chưa staging

```bash
git restore file.py                  # Mất thay đổi ở file.py (về như HEAD)
git restore .                        # Mọi file
```

> Modern: `git restore`. Cũ: `git checkout -- file.py`.

### Unstage (bỏ khỏi staging)

```bash
git restore --staged file.py         # Bỏ khỏi staging (giữ thay đổi)
# Cũ: git reset HEAD file.py
```

### Xoá file (track removal)

```bash
git rm file.py                       # Xoá file + stage removal
git rm -r dir/                       # Xoá folder
git rm --cached file.py              # Bỏ track nhưng giữ file local
```

`--cached` hữu ích khi lỡ commit file lẽ ra nên ignore:

```bash
# Lỡ commit .env
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Untrack .env"
```

### Đổi tên / di chuyển

```bash
git mv old.py new.py                 # Rename + stage
git mv src/file.py lib/file.py       # Move
```

Tương đương `mv + git add + git rm` nhưng gọn hơn.

## Amend — sửa commit gần nhất

```bash
# Đổi message
git commit --amend -m "Better message"

# Thêm file vào commit cuối
git add forgotten-file.py
git commit --amend --no-edit         # Giữ message cũ
```

> **Chỉ amend commit chưa push lên public branch**. Amend đổi hash → người khác đã pull sẽ bị đánh nhau.

## Empty commit — đôi khi hữu ích

```bash
git commit --allow-empty -m "Trigger CI pipeline"
```

Use case: trigger CI/CD pipeline mà không thay đổi code.

## Workflow đầy đủ

```bash
# 1. Setup lần đầu trên máy
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main

# 2. Tạo repo
mkdir myproject && cd myproject
git init

# 3. Viết .gitignore
cat > .gitignore <<EOF
*.log
.env
node_modules/
EOF

# 4. Tạo code
echo "# My Project" > README.md
mkdir src && echo "print('hello')" > src/main.py

# 5. Initial commit
git add .
git status                           # Check trước commit
git commit -m "Initial commit"

# 6. Tiếp tục dev — pattern lặp lại:
vim src/main.py                      # Edit
git status                           # Xem gì đổi
git diff                             # Chi tiết
git add src/main.py
git commit -m "feat: add greeting"

# 7. Xem lịch sử
git log --oneline
```

## Commit thường xuyên — best practice

**Mỗi commit = một thay đổi logic nhỏ**:

- ❌ Commit 1: "Implement entire feature X + fix bug + update docs"
- ✓ Commit 1: "feat: add User model"
- ✓ Commit 2: "feat: add user signup endpoint"
- ✓ Commit 3: "fix: typo in error message"
- ✓ Commit 4: "docs: add signup example to README"

Lợi ích:
- `git bisect` tìm bug nhanh.
- `git revert` 1 commit không kéo theo cái khác.
- Code review dễ hơn.
- History đọc như tài liệu.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `git commit` không message | Vim mở, bạn không biết thoát | `:q!` thoát, dùng `-m` |
| Quên `.gitignore` trước commit | Secret lộ | `.gitignore` trước commit đầu |
| `git add .` add file rác | Repo bẩn | Check `git status` trước commit |
| Commit message vague ("update", "fix") | Không track được | Conventional Commits |
| `git commit --amend` sau khi push | Lịch sử mâu thuẫn | Chỉ amend trước push |
| Quên save file → commit thiếu | Code in commit không build | Save trước `git add` |
| Add file binary lớn | Repo phình | Git LFS hoặc external storage |
| `git restore` mất việc | Thay đổi không recover | Trước restore: stash hoặc commit WIP |

## Quick reference

```text
git init                 Khởi tạo repo
git status / git st      Trạng thái
git add file             Stage
git add .                Stage mọi thay đổi
git add -p               Interactive
git commit -m "msg"      Commit
git commit -am "msg"     Add + commit (file tracked)
git commit --amend       Sửa commit cuối
git log --oneline        Lịch sử ngắn gọn
git log --graph --all    Lịch sử graph
git show HEAD            Chi tiết commit
git diff                 Working vs staging
git diff --staged        Staging vs commit
git restore file         Hủy thay đổi
git restore --staged file Unstage
git rm file              Xoá file (tracked)
git mv old new           Rename
```

## Tóm tắt bài 2

- `git init` → folder thành repo (tạo `.git/`).
- **`git status`** = lệnh đầu tiên gọi khi mơ hồ.
- Workflow: **edit → add → commit**. Lặp lại.
- **`git log --oneline --graph --all`** để xem lịch sử dạng cây.
- Commit message theo **Conventional Commits** giúp tự động hoá CHANGELOG, semantic release.
- **`git restore`** hủy thay đổi chưa commit. **`git rm --cached`** bỏ track giữ file.
- **`git commit --amend`** chỉ dùng cho commit chưa push.

**Bài kế tiếp** → [Bài 3: Branches và Merging — làm việc song song với nhiều luồng phát triển](03-branches-merging.md)
