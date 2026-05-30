# Bài 3: Branches và Merging — làm việc song song với nhiều luồng phát triển

Branch là **vũ khí chính** của Git. Cho phép nhiều dev làm song song mà không đụng nhau, test idea trước khi merge, giữ code production stable.

## Branch là gì?

> **Branch** trong Git = **pointer dịch chuyển được** tới một commit.

Không phải "copy folder" như trong SVN. Chỉ là pointer 41 byte. Tạo branch = tạo pointer mới. Cực rẻ và cực nhanh.

```text
                              feature
                                │
                                ▼
A ─── B ─── C ─── D ─── E ─── F
                                ▲
                                │
                              main (= HEAD)
```

Sau khi tạo `feature`, cả 2 branch trỏ cùng commit `F`. Bắt đầu commit từ feature → branch diverge:

```text
                              feature
                                │
                                ▼
                                G ─── H
                              /
A ─── B ─── C ─── D ─── E ─── F
                                ▲
                                │
                              main
```

## Vì sao branch?

Use case:
- **Feature branch** — dev 1 feature mới mà không phá main.
- **Bugfix branch** — hotfix urgent.
- **Release branch** — chuẩn bị version mới.
- **Experiment** — thử idea, nếu fail thì delete.
- **Multiple dev** — mỗi người 1 branch, không đạp lên nhau.

Branch trong Git nhẹ → "branch frequently" là norm.

## Tạo branch — `git branch`

```bash
git branch                           # List branch local
git branch -a                        # List cả remote branch
git branch -v                        # Với commit message mới nhất
git branch sprint1                   # Tạo branch sprint1 (vẫn ở HEAD)
git branch sprint1 a3f5b2c           # Tạo từ commit cụ thể
git branch -d feature                # Xoá branch (chỉ nếu đã merge)
git branch -D feature                # Force delete
git branch -m oldname newname        # Rename
```

`-d` an toàn — chỉ xoá nếu commit đã merge vào branch khác. `-D` force.

## Switch branch — `git checkout` / `git switch`

```bash
# Modern (Git 2.23+)
git switch sprint1                   # Đến branch sprint1
git switch -c sprint2                # Tạo + đến luôn
git switch -                         # Branch trước (như cd -)

# Cũ (vẫn dùng)
git checkout sprint1
git checkout -b sprint2              # Tạo + đến
```

`switch` mới hơn, dễ nhớ hơn. `checkout` mạnh hơn (làm nhiều thứ).

### Khi nào checkout vẫn cần?

```bash
git checkout file.py                 # Discard thay đổi file.py
git checkout HEAD~3 -- file.py       # Lấy file.py từ 3 commit trước
git checkout a3f5b2c                 # Detached HEAD ở commit cũ
```

Modern alternatives:
- `git restore file.py` — discard.
- `git restore --source=HEAD~3 file.py` — restore từ ref.

## Commit trên branch

```bash
git switch sprint1
# Edit file...
git add .
git commit -m "feat: add login"

# Switch về main thấy không có thay đổi
git switch main
ls                                   # Không có file mới
```

Branch tách riêng → commit ở 1 branch không ảnh hưởng branch khác.

## Visualizing branches — graph

```bash
git log --oneline --graph --all --decorate

# *   abc123 (HEAD -> feature) Add login
# | * def456 (main) Add README
# |/
# * 789ghi Initial commit
```

`--graph` vẽ cây ASCII. `--all` để show mọi branch. Đặt alias `git lg`.

## Merge — gộp branch

Sau khi xong feature, gộp về main:

```bash
git switch main
git merge feature
```

Có 3 kiểu merge:

### 1. Fast-forward merge

Nếu main không có commit mới sau khi tạo feature → main chỉ "trượt tới" commit của feature:

```text
Trước:
                        feature
                          │
                          ▼
A ─── B ─── C ─── D ─── E
              ▲
              │
            main

Sau merge:
                        feature
                          │
                          ▼
A ─── B ─── C ─── D ─── E
                          ▲
                          │
                        main (= HEAD)
```

Không tạo commit merge. Lịch sử thẳng.

### 2. Three-way merge

Nếu main đã có commit mới (diverged):

```text
Trước:
                        feature
                          │
                          ▼
              D ─── E ─── F
            /
A ─── B ─── C
            \
              G ─── H
                    ▲
                    │
                  main


Sau merge:
                        feature
                          │
                          ▼
              D ─── E ─── F
            /              \
A ─── B ─── C               M (merge commit, 2 parents)
            \              /     ▲
              G ─── H ────       │
                                main
```

Tạo **merge commit M** có **2 parent**.

### 3. Squash merge

Gộp mọi commit của feature thành **1 commit** trên main:

```bash
git merge --squash feature
git commit -m "feat: add login flow"
```

Lịch sử main sạch hơn — chỉ thấy 1 commit "add login flow" thay vì 10 commit nhỏ. Trade-off: mất chi tiết.

## Conflict — khi 2 branch sửa cùng vùng code

```bash
git merge feature
# Auto-merging app.py
# CONFLICT (content): Merge conflict in app.py
# Automatic merge failed; fix conflicts and then commit.
```

File `app.py` chứa marker:

```python
def login(user):
<<<<<<< HEAD
    return validate_v2(user)
=======
    return check_credentials(user)
>>>>>>> feature
```

- `<<<<<<< HEAD` đến `=======`: code ở branch hiện tại (main).
- `=======` đến `>>>>>>> feature`: code ở branch merge.

### Giải quyết

1. **Edit file** — quyết định giữ gì, xoá gì, kết hợp ra sao.
2. **Xoá marker** `<<<`, `===`, `>>>`.
3. `git add file` — đánh dấu đã giải quyết.
4. `git commit` — hoàn thành merge.

### Tool hỗ trợ

```bash
git mergetool                        # Mở merge tool (vimdiff, meld, kdiff3)
git diff                             # Xem conflict
git status                           # File nào còn conflict
```

VS Code có built-in 3-way merge UI tốt.

### Abort

```bash
git merge --abort                    # Hủy merge, về trạng thái trước
```

## Cherry-pick — lấy 1 commit từ branch khác

```bash
git switch main
git cherry-pick a3f5b2c              # Apply commit a3f5b2c vào main
git cherry-pick a3f5b2c..b7c1d8e     # Range
git cherry-pick -n a3f5b2c           # No-commit (chỉ áp dụng, không commit)
```

Use case: hotfix ở branch `release-v1`, cần apply vào `main` mà không merge cả release branch.

## Rebase — viết lại lịch sử

```bash
git switch feature
git rebase main
```

Khác merge: thay vì tạo merge commit, **di chuyển commit của feature lên trên main**:

```text
Trước:
              D ─── E ─── F (feature)
            /
A ─── B ─── C ─── G ─── H (main)


Sau rebase:
                            D' ─── E' ─── F' (feature)
                          /
A ─── B ─── C ─── G ─── H (main)
```

`D'`, `E'`, `F'` là **commit mới** (hash khác) nhưng content giống.

Lịch sử **thẳng tắp** không có "diamond" merge commit.

### Khi nào rebase, khi nào merge?

| | Merge | Rebase |
|---|---|---|
| Lịch sử | Có merge commit, diverged | Thẳng tắp |
| Hash commit | Giữ nguyên | Đổi |
| An toàn cho public branch | ✓ | ✗ |
| Dễ debug history | Khó (nhiều branch) | Dễ |
| Conflict | 1 lần | Có thể nhiều lần (mỗi commit) |

**Quy tắc vàng**: **NEVER rebase commit đã push public**. Rebase đổi hash → người khác đã pull bị conflict không thể giải.

Pattern phổ biến:
- Local feature branch: rebase OK.
- Branch shared trên remote: chỉ merge.

## Interactive rebase — squash + reorder

```bash
git rebase -i HEAD~5                 # Edit 5 commit gần nhất
```

Mở editor:

```text
pick a3f5b2c feat: add login
pick b7c1d8e fix typo
pick c1d8e7c fix another typo
pick d8e7c1d refactor login
pick e7c1d8e add tests
```

Đổi `pick` thành:
- `squash` (`s`) — gộp commit này vào commit phía trên.
- `fixup` (`f`) — như squash nhưng bỏ message.
- `edit` (`e`) — pause để amend.
- `drop` (`d`) — bỏ commit.
- `reword` (`r`) — chỉ đổi message.

Save → Git apply theo thứ tự bạn xếp.

Use case: gộp 5 commit "fix typo" thành 1 commit gọn trước khi push.

## Git workflow phổ biến trong team

### 1. GitHub Flow — đơn giản

```text
main ────────────────────────►
       \                    /
        feature ──────────►
            commits        PR/merge
```

Mọi feature trên branch riêng. Mở PR. Merge vào main. Deploy.

Phù hợp: SaaS continuous deployment.

### 2. Git Flow — phức tạp

5 loại branch: `main`, `develop`, `feature/*`, `release/*`, `hotfix/*`.

Phù hợp: product với release version, mobile app.

### 3. Trunk-Based Development

Mọi người commit thẳng vào `main` (qua PR ngắn < 1 ngày). Branch hiếm dùng.

Phù hợp: team senior, test automation mạnh (Google, Facebook).

### 4. GitLab Flow

Như GitHub Flow + environment branch (`pre-production`, `production`).

Khoá này dùng **GitHub Flow** mặc định.

## Naming convention cho branch

```text
feature/add-payment-gateway
bugfix/login-redirect-error
hotfix/security-patch-cve-2025-001
release/v1.2.0
refactor/extract-user-service
docs/update-readme
chore/upgrade-dependencies
```

Tiền tố giúp filter trong UI và pipeline.

## .gitignore khi merge / branch

```text
# /etc/gitignore_global hoặc .git/info/exclude
*.merge_backup
*.orig
*~
```

Khi conflict, Git tạo `.orig` backup. Bỏ qua trong git status.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên `git switch` trước commit | Commit vào branch sai | Luôn `git status` xem đang ở branch nào |
| `git branch -D feature` chưa merge | Mất công sức | Dùng `-d`, phải merge trước |
| Rebase commit đã push | Người khác conflict không giải được | Chỉ rebase local |
| Merge conflict → giữ cả 2 marker | Code không build | Xoá `<<<`, `===`, `>>>` |
| Merge `develop` vào `feature` rồi rebase | Commit lặp | Hoặc merge, hoặc rebase, không cả hai |
| Branch dài lâu | Conflict khi merge | Branch ngắn (< 1 tuần), rebase từ main thường xuyên |
| Force push (`git push -f`) vào shared branch | Đè commit của người khác | Dùng `--force-with-lease` |
| Detached HEAD không commit | Mất commit khi switch | Tạo branch trước khi commit |

## Detached HEAD

```bash
git checkout a3f5b2c
# Note: switching to 'a3f5b2c'.
# You are in 'detached HEAD' state.
```

Bạn đang ở commit cũ, không trên branch nào. Commit ở đây "lơ lửng" — switch branch khác = mất.

Để giữ:

```bash
git switch -c new-branch              # Tạo branch từ detached HEAD
```

## Branch trên remote

```bash
git branch -a                        # Local + remote
# * main
#   feature
#   remotes/origin/main
#   remotes/origin/feature
#   remotes/origin/another-feature
```

Remote branch là **snapshot** của branch trên server. Update bằng `git fetch` (bài 4).

## Quick reference

```text
git branch                  List local branch
git branch -a               List local + remote
git branch -v               + commit message
git branch new              Tạo branch
git switch new              Đến branch
git switch -c new           Tạo + đến
git branch -d feature       Xoá (an toàn)
git branch -D feature       Force xoá
git branch -m old new       Rename

git merge feature           Merge
git merge --squash feature  Squash merge
git merge --abort           Hủy

git rebase main             Rebase lên main
git rebase -i HEAD~5        Interactive rebase

git cherry-pick HASH        Lấy 1 commit
git log --graph --all       Xem branch tree
```

## Tóm tắt bài 3

- **Branch** = pointer 41 byte trỏ tới commit, cực nhẹ.
- `git switch -c feature` tạo và đến branch mới.
- **3 kiểu merge**: fast-forward (linear), three-way (merge commit), squash (1 commit).
- **Conflict** = Git không biết giữ phần nào → bạn quyết định, xoá marker `<<<===>>>`, `add`, `commit`.
- **Rebase** viết lại lịch sử — chỉ local, đừng rebase public branch.
- **`git cherry-pick`** copy 1 commit sang branch khác.
- **GitHub Flow** đơn giản nhất: feature branch → PR → merge main. Phù hợp đa số dự án.

**Bài kế tiếp** → [Bài 4: Remote, GitHub, push/pull/fetch và Pull Request workflow](04-remote-github.md)
