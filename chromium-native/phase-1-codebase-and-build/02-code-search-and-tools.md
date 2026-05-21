# Bài 2: Code Search và Tools

Bài này dạy:
- `cs.chromium.org` (Code Search): search syntax, navigation, refs.
- `chromium-review.googlesource.com` (Gerrit): CL workflow.
- `depot_tools`: `gclient`, `git cl`, `cipd`, các tool chính.
- Local checkout layout.
- `gn` và `git` tooling cho exploration.

Kết thúc bài: bạn navigate được Chromium codebase qua web (cs.chromium.org) và CLI (git grep, gn), submit được CL qua Gerrit.

## `cs.chromium.org` — Code Search

Code Search là tool **chính** của Chromium dev. Mọi developer Chromium dùng hàng ngày.

URL: <https://source.chromium.org/chromium/chromium/src>

### Search syntax

```text
class WebContents          ← Tìm "WebContents class"
NavigationController       ← Tìm class hoặc symbol tên này
"specific phrase"          ← Phrase exact

f:web_contents             ← File matching "web_contents"
f:^chrome/browser/         ← File path regex
path:base/                 ← Path bắt đầu với base/

lang:cpp                   ← Only C++ files
lang:python                ← Only Python

class:WebContents          ← Class declaration
function:CreateRenderFrame  ← Function declaration

case:yes Foo               ← Case-sensitive

-bar                       ← Exclude "bar"
foo -test                  ← "foo" but not in test
```

Combinations:

```text
class:WebContents lang:cpp -f:test     ← Class WebContents, C++, not in test files
"PostTask" path:base/task               ← Phrase in base/task/
```

### Navigation

Khi mở 1 file:

- Click symbol → see declaration / definition.
- "References" tab → mọi nơi gọi/dùng symbol này.
- "Cross-references" panel — explore caller, callee.
- Blame button → git blame inline.
- "Open in Gerrit" → see CL history.

### Examples

Tìm function `RenderFrameHost::CreateChildFrame`:

```
class:RenderFrameHost function:CreateChildFrame
```

Tìm mọi nơi gọi `PostTask`:

```
"PostTask" lang:cpp -f:test
```

Find usage cụ thể của `base::OnceClosure`:

```
"base::OnceClosure" path:chrome/browser/
```

### Khi không có Chromium local checkout

Code Search là **đủ** để đọc code, hiểu codebase. Bạn không cần download 30GB Chromium source để study. Phần lớn bài trong course này dùng cs.chromium.org để quote code.

## Gerrit — `chromium-review.googlesource.com`

Chromium dùng **Gerrit** cho code review (không phải GitHub PR).

### CL workflow

CL = "Change List" = Gerrit's term cho 1 PR/patch.

```bash
# Sửa code...
git add .
git commit -m "Fix bug X"

# Upload to Gerrit
git cl upload

# Output: link tới CL trên Gerrit
# Reviewer comment, request change
# Address feedback:
git add .
git commit --amend                # Modify existing commit
git cl upload                      # Re-upload patch set 2

# When approved + CI green: submit
git cl land   # Merge to main
```

`git cl` là wrapper trong `depot_tools` — script Chromium-specific.

### Gerrit interface

CL có:

- **Description**: title + body.
- **Files**: diff view.
- **Patchsets**: history (mỗi `git cl upload` = patchset mới).
- **Comments**: line-level + general.
- **Reviewers**: assigned người review.
- **Labels**: `Code-Review +2`, `Commit-Queue +2`, `Verified +1`.
- **Trybots**: CI status (Win/Mac/Linux/Android/iOS).

### Labels

| Label | Meaning |
|---|---|
| `Code-Review +1` | "I'm happy" (non-blocking) |
| `Code-Review +2` | "Approved, can land" (need ≥1 from owner) |
| `Commit-Queue +1` | "Try" — dry run CI |
| `Commit-Queue +2` | "Submit" — land after CI green |

### Reviewers and OWNERS

Mỗi directory có `OWNERS` file liệt kê người approve được code đó:

```
# chrome/browser/bookmarks/OWNERS
alice@chromium.org
bob@chromium.org

per-file *_browsertest.cc=*
```

Cần ≥1 OWNER `Code-Review +2` để land.

## `depot_tools`

Tool chính cho Chromium dev:

```bash
# Install
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:/path/to/depot_tools"
```

Provides:

| Tool | Purpose |
|---|---|
| `gclient` | Sync source (download src/ + dependencies) |
| `git cl` | CL workflow (upload, patch, land) |
| `gn` | Build configuration |
| `autoninja` | Wrapper around ninja với jobs auto |
| `presubmit_*` | Pre-submit check |
| `cipd` | Binary package manager (toolchain, etc.) |
| `vpython3` | Python với Chromium-specific deps |
| `clang-format` | Code formatter |

### `gclient` — sync source

```bash
mkdir chromium && cd chromium
fetch chromium               # Initial clone (long — 30+GB)

# Later updates
gclient sync                 # Update src + deps
gclient sync --no-history    # Faster, no full git history
```

### Local checkout layout

```text
chromium/
├── src/                         ← Main source tree
│   ├── .gclient_entries
│   ├── chrome/, content/, ...
│   ├── out/                     ← Build outputs (gitignored)
│   │   ├── Debug/
│   │   ├── Release/
│   │   └── ...
│   ├── third_party/
│   ├── tools/
│   └── buildtools/              ← gn, clang, etc.
├── .gclient                     ← gclient config
└── .cipd/                       ← cipd packages
```

`out/` là build output directory. Bạn có thể có nhiều `out/<name>/` cho config khác nhau.

## `git` commands hữu ích

Chromium dùng git, nhưng có vài command Chromium-specific:

```bash
# Branch management
git new-branch feature_x         # Create + checkout new branch tracking main
git rebase-update                # Rebase all local branches on top of main

# Status check
git cl issue                     # Show CL number for current branch
git cl status                    # All branches with CL status
git cl format                    # Format C++/Python with clang-format/yapf

# Try a CL on bots
git cl try                       # Trigger try jobs

# Apply CL from Gerrit
git cl patch 1234567             # Apply CL #1234567
```

### `git grep` — search source

```bash
cd src/

git grep "PostTask" content/browser/
git grep -n "WebContents::" chrome/browser/   # With line numbers
git grep -l "OnceCallback"                     # Only file names

git grep --untracked "TODO"                    # Include untracked
```

`git grep` rất nhanh — search 30GB code trong vài giây. Faster than `grep -r`.

## `gn` tools

GN là build configuration tool (sẽ học sâu Bài 3). Đây là commands cho exploration:

### `gn ls`

List targets trong build:

```bash
cd src/out/Debug
gn ls //chrome/browser:*               # All targets in chrome/browser/
gn ls //base:*                          # All targets in base/
gn ls //chrome/browser/ui/webui/settings:*
```

### `gn desc`

Describe target:

```bash
gn desc //chrome/browser:browser
# Shows: sources, deps, include_dirs, etc.

gn desc //chrome/browser:browser deps   # Just dependencies
gn desc //chrome/browser:browser sources # Just sources
```

### `gn refs` — who depends on this?

```bash
gn refs //base:base_features            # Tìm targets dùng base_features
gn refs //chrome/browser/bookmarks:*    # Dependents
```

Hữu ích khi rename/modify target → biết được ai bị ảnh hưởng.

### `gn args` — edit args.gn

```bash
gn args out/Debug
# Opens args.gn in $EDITOR
```

## Pattern thực tế

### Workflow tìm hiểu feature

1. **Web search "Chromium <feature> source"** → blog post, design doc.
2. **cs.chromium.org search**:
   - `class:<FeatureClass>`
   - `path:<feature_dir>`
3. **Read header** trước, implementation sau.
4. **Trace usage**: click symbol → see callers.
5. **Local checkout** nếu cần modify hoặc debug.

### Workflow fix bug

1. **Reproduce locally** với checkout.
2. **Identify culprit** với debugger / log.
3. **Read related code** (cs.chromium.org cho big-picture).
4. **Fix locally**.
5. **`git cl format`** — format.
6. **`git cl upload`** — submit CL.
7. **`git cl try`** — pre-submit CI.
8. **Iterate** based on review.
9. **`git cl land`** — submit.

### Workflow add new feature

1. **Design doc** (small feature: discuss in CL; big: separate doc).
2. **Get OWNER approval** for direction.
3. **Implement + test**.
4. **CL chain** nếu lớn (multiple CL theo sequential).
5. **Land**.

## CIPD và toolchain

`cipd` = Chrome Infrastructure Package Deployment — binary package manager.

```bash
cipd ensure -root buildtools/ ...
```

Chromium dùng cipd để fetch:

- `clang` (Chromium's pinned version).
- `gn` (Chromium's pinned version).
- Android NDK.
- iOS toolchain.
- Etc.

Khi `gclient sync`, cipd auto run để ensure toolchain up-to-date.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Forget `depot_tools` in PATH | Tools not found | Add to PATH permanently |
| `gclient sync` skip → ABI mismatch | Build break, weird errors | Always `gclient sync` after pull |
| Edit `out/.../` files manually | Lost on rebuild | Never edit generated files |
| `git push` direct (not `git cl upload`) | Bypass Gerrit | Always use `git cl upload` |
| Multi-CL on 1 branch | Confusing | Use separate branch per CL |
| `git rebase main` instead of `git rebase-update` | Miss out other branches | Use `git rebase-update` |
| Manual `clang-format` on whole file | Excessive diff | `git cl format` on changed files |
| Forget `git cl try` before send for review | Reviewer find CI fails | Always try first |

## Tóm tắt

| Tool | Use case |
|---|---|
| `cs.chromium.org` | Web code search + navigation |
| `chromium-review.googlesource.com` | Gerrit code review |
| `depot_tools` | Chromium CLI tool collection |
| `gclient sync` | Update source + deps |
| `git cl upload` | Submit CL |
| `git cl land` | Land approved CL |
| `gn ls`, `gn desc`, `gn refs` | Build config exploration |
| `git grep` | Fast code search in checkout |
| `cipd` | Binary package manager (auto via gclient) |

## Pattern Samsung Browser

Samsung Browser thường có:

- Internal git hosting + review system (không phải public Gerrit).
- Internal Code Search (mirror cs.chromium.org cho Samsung code).
- Build system tương tự — vẫn GN + ninja.
- Sync với upstream Chromium periodically.

→ Workflow tương tự nhưng tools nội bộ.

## Exercise (optional)

1. Mở cs.chromium.org. Tìm `class:WebContents`. Đọc declaration.
2. Tìm mọi nơi `base::PostTask` được gọi (`"base::PostTask" lang:cpp -f:test`).
3. Tìm OWNERS của `chrome/browser/bookmarks/`.
4. Nếu có checkout: `git grep "TODO"` đếm số TODO. `gn ls //base:*` xem targets của base.

---

**Bài kế tiếp** → [Bài 3: GN + Ninja Deep](03-gn-ninja-deep.md)
