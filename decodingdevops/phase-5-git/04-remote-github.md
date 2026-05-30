# Bài 4: Remote, GitHub, push/pull/fetch và Pull Request workflow

Bài 1-3 làm việc **local**. Bài này nối local với **remote** (GitHub) — nơi cả team chia sẻ code.

## Remote là gì?

**Remote** = URL trỏ tới Git repo ở chỗ khác — GitHub, GitLab, server tự host.

```bash
git remote                           # List remote name
# origin

git remote -v                        # Với URL
# origin  https://github.com/me/repo.git (fetch)
# origin  https://github.com/me/repo.git (push)
```

`origin` = tên mặc định cho remote chính. Có thể có nhiều remote.

## Tạo remote và đẩy lên — 2 workflow

### Workflow 1: Tạo remote trước, clone về local

```bash
# 1. Tạo repo trên GitHub (web UI): myrepo
# 2. Clone về local
git clone https://github.com/me/myrepo.git
cd myrepo

# 3. Edit + commit
echo "Hello" > README.md
git add .
git commit -m "Initial commit"

# 4. Push
git push
```

### Workflow 2: Có local rồi, tạo remote sau

```bash
# 1. Local
mkdir myproject && cd myproject
git init
echo "Hello" > README.md
git add .
git commit -m "Initial commit"

# 2. Tạo repo trên GitHub (empty, không init README)

# 3. Add remote
git remote add origin https://github.com/me/myrepo.git

# 4. Đổi branch sang main (nếu cần)
git branch -M main

# 5. Push lần đầu
git push -u origin main
```

`-u` (= `--set-upstream`) thiết lập tracking giữa local `main` và `origin/main`. Sau lần này, `git push` không cần argument.

## Quản lý remote

```bash
git remote add origin URL
git remote add upstream URL          # Thêm remote thứ 2 (vd fork → upstream)
git remote rename origin github
git remote remove origin
git remote set-url origin NEW_URL    # Đổi URL
git remote show origin               # Chi tiết remote
```

## Push — local → remote

```bash
git push                             # Push branch hiện tại (nếu có upstream)
git push origin main                 # Push main lên origin
git push -u origin feature           # Lần đầu với upstream
git push --all origin                # Mọi branch
git push --tags                      # Mọi tag
git push --follow-tags               # Push commit + tag annotated
git push --force                     # ⚠️ Đè lên remote (NGUY HIỂM)
git push --force-with-lease          # ⚠️ An toàn hơn — fail nếu remote có thay đổi
git push origin --delete feature     # Xoá branch trên remote
```

### `--force` vs `--force-with-lease`

| | Force | Force-with-lease |
|---|---|---|
| Đè lên remote | Luôn | Chỉ nếu remote chưa có commit mới |
| An toàn | ✗ | ✓ |
| Khi nào | Sau rebase local (1 mình) | Sau rebase chia sẻ team |

**Không bao giờ `--force` vào `main`** trừ khi cực kỳ chắc chắn. Có thể xoá cả tuần công sức team.

## Fetch — tải về, không merge

```bash
git fetch                            # Tải thay đổi từ origin
git fetch origin
git fetch --all                      # Mọi remote
git fetch --prune                    # Xoá local ref tới branch đã xoá trên remote
```

`fetch` cập nhật `refs/remotes/origin/*` nhưng **không đụng** working dir hoặc branch local.

Xem khác biệt:

```bash
git fetch
git log main..origin/main            # Commit ở origin/main mà main local chưa có
git diff main origin/main            # Diff
```

## Pull — fetch + merge

```bash
git pull                             # = git fetch + git merge
git pull origin main                 # Tương đương
git pull --rebase                    # fetch + rebase thay vì merge
```

`pull` = `fetch` + `merge` (hoặc rebase nếu `--rebase`).

### Pull nên rebase hay merge?

Mặc định pull = merge → có thể tạo merge commit "dirty":

```text
*   Merge branch 'main' of github.com:me/repo
|\
| * Your local commit
* | Remote teammate commit
|/
* Previous commit
```

Để pull luôn rebase (lịch sử thẳng):

```bash
git config --global pull.rebase true
```

Sau đó `git pull` = `fetch + rebase`.

## Clone — copy repo về local

```bash
git clone URL
git clone URL myfolder               # Vào folder cụ thể
git clone --depth 1 URL              # Shallow — chỉ commit mới nhất (nhanh, ít data)
git clone --branch feature URL       # Clone với branch cụ thể
git clone --recurse-submodules URL   # Kéo cả submodule
```

`clone` = `init` + add remote + `fetch` + `checkout`.

### Shallow clone — tiết kiệm bandwidth

```bash
git clone --depth 1 https://github.com/torvalds/linux.git
```

Tải 1 commit thay vì 1 triệu → tiết kiệm GB. Hữu ích cho CI/CD chỉ cần build.

Hạn chế: không có history → không log, blame, bisect.

Convert shallow → full:

```bash
git fetch --unshallow
```

## Pull Request — collaboration workflow

**PR (GitHub)** hoặc **MR (GitLab)** = đề xuất merge branch của bạn vào branch chính, có review.

### Workflow điển hình

```bash
# 1. Clone repo về
git clone https://github.com/team/project.git
cd project

# 2. Tạo branch feature
git switch -c feature/add-login

# 3. Edit, commit
vim src/login.py
git add . && git commit -m "feat: add login"

# 4. Push branch lên remote
git push -u origin feature/add-login

# 5. Mở PR trên GitHub UI (link có sẵn trong output git push)
#    → Web browser → "Compare & Pull Request" → submit

# 6. Reviewer comment, request changes
#    Bạn sửa local:
vim src/login.py
git add . && git commit -m "fix: address review comments"
git push                             # PR tự cập nhật

# 7. Reviewer approve → merge qua GitHub UI
#    (Merge, Squash and Merge, hoặc Rebase and Merge)

# 8. Local cleanup
git switch main
git pull
git branch -d feature/add-login
```

### 3 cách merge PR trên GitHub

| | Merge commit | Squash | Rebase |
|---|---|---|---|
| Lịch sử | Có merge commit | 1 commit gộp | Linear, giữ từng commit |
| Mỗi commit của feature | Giữ | Mất chi tiết | Giữ |
| Hash | Giữ | Đổi (1 mới) | Đổi (tất cả mới) |
| Mặc định cho | Branch dài, có meaning | Feature nhỏ, nhiều WIP commit | Team thích lịch sử thẳng |

Team chọn 1 strategy và stick với nó.

### PR template

`.github/pull_request_template.md` trong repo:

```markdown
## Mô tả
<!-- Mô tả ngắn gọn thay đổi -->

## Loại thay đổi
- [ ] Bug fix
- [ ] Feature mới
- [ ] Breaking change
- [ ] Documentation

## Test plan
- [ ] Unit test pass
- [ ] Tested locally
- [ ] Reviewed self

## Related Issues
Closes #123
```

GitHub auto fill khi mở PR mới.

## Fork — copy repo của người khác về account mình

```text
github.com/torvalds/linux   ← Repo gốc
        │
        │ Fork (web UI)
        ▼
github.com/you/linux         ← Fork của bạn (full quyền)
        │
        │ git clone
        ▼
Local máy bạn
```

Use case:
- Contribute open source — fork → clone → branch → PR.
- Học code không có quyền write.

```bash
# Sau fork:
git clone https://github.com/you/linux.git
cd linux
git remote add upstream https://github.com/torvalds/linux.git

# Sync với upstream
git fetch upstream
git switch main
git merge upstream/main
git push origin main
```

## Issue, milestone, project — quản lý task

GitHub không chỉ host code:

- **Issues** — bug report, feature request.
- **Milestones** — gom issue theo release.
- **Projects** — Kanban board.
- **Discussions** — Q&A, idea.
- **Wiki** — docs.
- **Actions** — CI/CD (sẽ học section 18).
- **Pages** — host static site.

Link issue trong commit: `Closes #123` → khi PR merge, issue tự đóng.

## GitHub UI essentials

| Trang | URL pattern | Hữu ích |
|---|---|---|
| Repo home | `/owner/repo` | README, file tree |
| Commits | `/owner/repo/commits/main` | Lịch sử |
| Branches | `/owner/repo/branches` | List branch |
| Pull requests | `/owner/repo/pulls` | PR mở/đóng |
| Issues | `/owner/repo/issues` | Bug tracker |
| Insights | `/owner/repo/pulse` | Activity stats |
| Settings | `/owner/repo/settings` | Config repo |

## Branch protection — bảo vệ main

GitHub UI: Settings → Branches → Add rule cho `main`:

- ✓ Require PR before merging
- ✓ Require approving reviews (1-2 reviewer)
- ✓ Require status checks (CI green)
- ✓ Require branches up to date
- ✓ Require signed commits
- ✓ Include administrators
- ✗ Allow force pushes (NEVER)
- ✗ Allow deletions (NEVER)

Đây là **bảo vệ cấp 1** chống commit thẳng vào main, đảm bảo quy trình review.

## Authentication — HTTPS vs SSH

### HTTPS

```text
https://github.com/user/repo.git
```

Login bằng username + **Personal Access Token (PAT)** (không phải password từ 2021).

Pros: dễ setup, qua firewall corporate.
Cons: phải nhập PAT mỗi push (trừ khi cache).

```bash
git config --global credential.helper store        # Lưu plain text (KHÔNG bảo mật)
git config --global credential.helper cache        # Cache 15 phút
git config --global credential.helper "cache --timeout=3600"
```

Tốt hơn: dùng Git Credential Manager hoặc keychain.

### SSH

```text
git@github.com:user/repo.git
```

Dùng SSH key thay password. Tự động hoá tốt, an toàn.

Bài 6 sẽ deep-dive SSH.

## Đổi URL từ HTTPS sang SSH

```bash
git remote set-url origin git@github.com:user/repo.git
git remote -v                        # Verify
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `git push -f main` | Đè commit team | Branch protection, `--force-with-lease` |
| Quên `git pull` trước push | "rejected, non-fast-forward" | `git pull --rebase` rồi push |
| Push branch chứa secret | Lộ credential | git-secrets pre-commit + revoke + rotate |
| Clone repo lớn lần đầu chậm | Mất thời gian | `--depth 1` nếu chỉ cần code mới |
| Tạo PR từ branch sai | Confused | Check `git branch` trước push |
| Merge conflict trong PR | PR bị block | Pull main, rebase/merge, resolve, push |
| Quên rebase trước merge | Lịch sử rối | Set `pull.rebase = true` |
| Đẩy lên fork chứ không upstream | Người maintainer không thấy | Mở PR từ fork → upstream |

## Pull workflow gọn

Daily routine khi đến văn phòng:

```bash
git switch main
git pull --rebase                    # Sync với team

git switch -c feature/today          # Branch mới
# ... work ...
git add . && git commit -m "feat: ..."
git push -u origin feature/today

# PR trên GitHub UI

# Sau khi merge:
git switch main
git pull --rebase
git branch -d feature/today
git remote prune origin              # Dọn remote ref đã xoá
```

## Quick reference

```text
git remote -v                Xem remote
git remote add NAME URL      Thêm remote
git clone URL                Clone repo về

git fetch                    Tải (không merge)
git fetch --prune            + dọn ref cũ
git pull                     Fetch + merge
git pull --rebase            Fetch + rebase

git push                     Push branch hiện tại
git push -u origin BRANCH    Push + set upstream
git push --tags              Push tag
git push --force-with-lease  Force an toàn
git push origin --delete BR  Xoá branch remote
```

## Tóm tắt bài 4

- **Remote** = URL repo ở chỗ khác. Mặc định tên `origin`.
- 2 workflow: clone từ remote về vs tạo local rồi push lên.
- **`fetch`** chỉ tải, **`pull`** = fetch + merge (hoặc rebase).
- **Pull Request** = quy trình review trước khi merge — đảm bảo chất lượng.
- 3 merge strategies: merge commit / squash / rebase.
- **Branch protection** chặn force push, yêu cầu review + CI pass.
- **HTTPS** dễ setup, **SSH** mạnh hơn cho automation.
- **Fork → clone → branch → PR** = workflow open source.

**Bài kế tiếp** → [Bài 5: Rollback — reset, revert, restore, stash, reflog](05-rollback-stash.md)
