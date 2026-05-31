# Bài 5: Rollback — reset, revert, restore, stash, reflog

Mọi DevOps engineer phải biết **rollback**. Code lỗi, deploy hỏng, branch sai — Git cho hàng loạt cách quay lại. Bài này dạy **chọn đúng tool cho đúng tình huống**.

## Tổng quan — 4 cấp độ rollback

```text
            Working Dir         Staging          Committed (Local)         Pushed (Remote)
                │                  │                     │                       │
        ┌───────┘                  │                     │                       │
        ▼                          ▼                     ▼                       ▼
  git restore <f>      git restore --staged <f>      git reset / revert      git revert (only)
  git checkout <f>          git reset HEAD <f>        git commit --amend     ⚠️ NEVER reset+push
```

Quy tắc: **càng đẩy ra xa, rollback càng nguy hiểm**. Local thoải mái — pushed phải dùng `revert`.

## Hủy thay đổi chưa staging — `git restore`

Bạn edit `app.py`, nhận ra sai:

```bash
git status
# modified: app.py

git restore app.py                   # Discard, về như HEAD
git restore .                        # Tất cả file
```

Modern command. Cũ:

```bash
git checkout -- app.py               # Tương đương
```

**Mất luôn không lấy lại được** — cẩn thận. Stash trước nếu chưa chắc.

## Unstage — `git restore --staged`

Lỡ `git add` file không muốn:

```bash
git add secret.env                   # Lỡ
git restore --staged secret.env      # Bỏ khỏi staging
# Modified vẫn còn — file vẫn ở working dir
```

Cũ:

```bash
git reset HEAD secret.env
```

## Hủy commit chưa push — `git reset`

`reset` di chuyển HEAD và branch pointer về commit khác.

```text
A ─── B ─── C ─── D (HEAD, main)

git reset HEAD~2 (= reset về B)

A ─── B (HEAD, main)
              C ─── D (mất reference, sẽ GC)
```

3 chế độ:

| Mode | Effect |
|---|---|
| `--soft` | Move HEAD, GIỮ thay đổi ở staging |
| `--mixed` (default) | Move HEAD, thay đổi ở working dir (unstaged) |
| `--hard` | Move HEAD, **XOÁ** mọi thay đổi |

```bash
git reset --soft HEAD~1              # Hủy commit cuối, giữ thay đổi staged
git reset HEAD~1                     # = --mixed: hủy commit + unstage
git reset --hard HEAD~1              # Hủy commit + xoá thay đổi (cẩn thận)

git reset --hard a3f5b2c             # Về commit cụ thể (XOÁ mọi thứ sau)
git reset --hard origin/main         # Sync local với remote (vứt local commits)
```

### Use case `--soft`

Sửa message commit cuối:

```bash
git reset --soft HEAD~1
# Edit, add thêm nếu cần
git commit -m "Better message"
```

Tương đương `git commit --amend` nhưng linh hoạt hơn.

### Use case `--hard`

Vứt mọi thay đổi local, về như remote:

```bash
git fetch
git reset --hard origin/main
```

⚠️ **Cẩn thận** — `--hard` không hỏi gì, không undo dễ.

## Hủy commit đã push — `git revert`

`revert` **không xoá** commit cũ — mà tạo commit MỚI **đảo ngược** commit cũ.

```text
Trước:
A ─── B ─── C ─── D (HEAD)


git revert HEAD


Sau:
A ─── B ─── C ─── D ─── D' (HEAD)
                        ↑
                        D' = "undo D"
```

```bash
git revert HEAD                      # Revert commit cuối
git revert a3f5b2c                   # Revert commit cụ thể
git revert HEAD~3..HEAD              # Revert range (mới nhất 3)
git revert -n a3f5b2c                # No-commit (chỉ apply changes)
```

Git mở editor cho commit message:

```text
Revert "feat: add bug"

This reverts commit a3f5b2c.
```

Save → revert commit tạo ra. Push lên remote bình thường — **không phá history**.

### Khi nào dùng `reset` vs `revert`?

| | reset | revert |
|---|---|---|
| Xoá commit cũ | ✓ | ✗ |
| Tạo commit mới | ✗ | ✓ |
| An toàn cho pushed | ✗ | ✓ |
| Lịch sử thẳng | ✓ | ✗ (thêm commit) |
| Use case | Local cleanup | Production hotfix |

**Quy tắc**: pushed → `revert`. Local-only → `reset` được.

## `git restore --source` — lấy file từ commit cũ

```bash
git restore --source=HEAD~3 app.py   # File app.py 3 commit trước
git restore --source=a3f5b2c app.py  # Từ commit cụ thể
git restore --source=main app.py     # Từ main (đang ở branch khác)
```

Cũ:

```bash
git checkout HEAD~3 -- app.py
```

## Stash — cất tạm thay đổi

Đang dev feature, sếp gọi fix urgent bug:

```bash
git stash                            # Cất working dir + staging
# → working dir sạch như HEAD

git switch main
# Fix bug, commit, push

git switch feature
git stash pop                        # Lấy lại stash
```

### Lệnh stash

```bash
git stash                            # Cất + message tự động
git stash push -m "WIP: login UI"    # Có message
git stash -u                         # Bao gồm cả untracked file
git stash -a                         # Bao gồm cả ignored file

git stash list                       # Xem stash đang có
# stash@{0}: WIP on feature: ...
# stash@{1}: WIP on main: ...

git stash show stash@{0}             # Summary
git stash show -p stash@{0}          # Full diff

git stash pop                        # Apply stash@{0} + xoá khỏi list
git stash apply                      # Apply nhưng GIỮ trong list
git stash apply stash@{1}            # Stash cụ thể
git stash drop stash@{0}             # Xoá stash
git stash clear                      # Xoá hết

git stash branch new-branch stash@{0}    # Tạo branch từ stash
```

### Khi nào stash?

- Switch branch nhanh nhưng có WIP.
- Pull mà có thay đổi local → stash, pull, pop.
- Test thử idea, không muốn commit ngay.

> Stash chỉ là cách **tạm**. Long-term WIP nên là commit (vd commit message `wip: ...`).

## Reflog — "thời gian máy" của Git

`reflog` ghi lại MỌI di chuyển của HEAD — kể cả những commit đã "mất" sau reset.

```bash
git reflog
# a3f5b2c HEAD@{0}: commit: feat: add login
# 1d9e4f7 HEAD@{1}: reset: moving to HEAD~1
# 5b7c2d8 HEAD@{2}: commit: fix bug
# ...
```

### Recover commit "mất" sau `reset --hard`

```bash
git reset --hard HEAD~5              # Xoá 5 commit cuối — hoảng!
git reflog                           # Tìm hash trước reset
git reset --hard <hash-cũ>           # Khôi phục
```

Hoặc:

```bash
git checkout <hash-cũ>               # Detached HEAD
git switch -c recovered              # Tạo branch để giữ
```

`reflog` mặc định giữ 90 ngày. Sau đó GC xoá.

> **Reflog là cứu cánh khi panic**. Nhớ `git reflog` đầu tiên khi nghĩ "tôi mất hết rồi!"

## Cleanup — `git clean`

Xoá file untracked (chưa add bao giờ):

```bash
git clean -n                         # Dry run — xem sẽ xoá gì
git clean -f                         # Force xoá file untracked
git clean -fd                        # + folder untracked
git clean -fx                        # + ignored file
```

⚠️ Không undo được. Luôn `-n` trước.

## Bisect — tìm commit nào gây bug

```bash
git bisect start
git bisect bad                       # Commit hiện tại (HEAD) có bug
git bisect good v1.2.0               # Tag/commit chắc chắn OK

# Git checkout commit giữa, bạn test:
# ... test ...
git bisect good                      # Hoặc bad

# Git tiếp tục chia đôi → 10 commit thử trong < 4 bước
# Tìm ra commit gây bug

git bisect reset                     # Về HEAD ban đầu
```

Bisect dùng **binary search** — 1000 commit chỉ cần ~10 lần test.

Có thể automate:

```bash
git bisect run ./test.sh
# Git chạy test.sh ở mỗi step, exit 0 = good, ≠0 = bad
```

## Workflow rollback thực tế

### Tình huống 1: Vừa edit, muốn vứt

```bash
git restore app.py
```

### Tình huống 2: Lỡ `git add`

```bash
git restore --staged app.py
```

### Tình huống 3: Vừa commit, muốn sửa message

```bash
git commit --amend -m "Better message"
```

### Tình huống 4: Vừa commit, muốn thêm file

```bash
git add forgotten.py
git commit --amend --no-edit
```

### Tình huống 5: 3 commit local cần undo

```bash
git reset HEAD~3                     # Giữ thay đổi
# Edit thêm
git commit -m "Combined fix"
```

### Tình huống 6: Local broken, muốn = remote

```bash
git fetch
git reset --hard origin/main
```

### Tình huống 7: Commit lỗi đã push, cần revert

```bash
git revert HEAD
git push
```

### Tình huống 8: Branch chứa secret push lên public

```bash
# 1. Rotate secret NGAY (revoke API key trên dashboard)
# 2. Force push để xoá khỏi history
git rebase -i HEAD~5                  # Xoá commit chứa secret
git push --force-with-lease

# 3. Notify team — họ phải re-clone
# 4. Tốt nhất: dùng git-filter-repo cho clean history
pip install git-filter-repo
git filter-repo --path secret.env --invert-paths
git push --force --all
```

> **Lưu ý**: secret đã push public coi như **đã lộ**, kể cả sau khi xoá history. Bot scan trong vài giây. **Rotate ngay là việc đầu tiên**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `reset --hard` lỡ tay | Mất thay đổi | `git reflog` recover |
| `revert` commit merge | Lỗi "merge commit but no -m" | `git revert -m 1 <hash>` |
| Stash quên xoá | Stash list dài | `git stash drop` sau dùng |
| `git clean -fd` ở /tmp git repo | Xoá thư file system | Luôn `-n` trước |
| `reset` rồi push | Lỗi non-fast-forward | `--force-with-lease` (cẩn thận) |
| Reflog hết hạn | Không recover được | Backup repo (push remote) |

## Quick reference

```text
# Hủy thay đổi
git restore file                    Working dir
git restore --staged file           Unstage
git restore --source=HEAD~3 file    File từ commit cũ

# Hủy commit (local)
git commit --amend                  Sửa commit cuối
git reset --soft HEAD~1             Hủy commit, giữ staged
git reset HEAD~1                    Hủy commit + staged → unstaged
git reset --hard HEAD~1             Hủy hết (CẨN THẬN)

# Hủy commit (pushed)
git revert HEAD                     Tạo commit đảo ngược
git revert <hash>

# Stash
git stash                           Cất WIP
git stash list
git stash pop                       Lấy lại + xoá
git stash apply                     Lấy lại, giữ

# Recover
git reflog                          Lịch sử HEAD
git reset --hard <reflog-hash>      Recover
git checkout <reflog-hash>          Detached, xem

# Cleanup
git clean -n / -f / -fd             Xoá untracked

# Tìm bug
git bisect start / good / bad / reset
git bisect run script.sh
```

## Tóm tắt bài 5

- **`git restore`** = hủy thay đổi working dir / staging.
- **`git reset`** = di chuyển HEAD. 3 mode: soft (giữ staged), mixed (default), hard (xoá).
- **`git revert`** = tạo commit MỚI đảo ngược — an toàn cho pushed branch.
- **`git stash`** = cất tạm WIP khi cần switch context.
- **`git reflog`** = lịch sử mọi di chuyển HEAD — cứu cánh khi panic.
- **`git bisect`** = binary search tìm commit gây bug.
- **Pushed → revert, local → reset**.

**Bài kế tiếp** → [Bài 6: SSH authentication và Git Credential](06-ssh-authentication.md)
