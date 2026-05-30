# Bài 7: Git Tags và Semantic Versioning

Khi software ra release `v2.1.6`, đó là **tag** Git. Bài cuối phase Git dạy cách **đánh version đúng quy chuẩn ngành**.

## Tag là gì?

> **Tag** = pointer cố định trỏ tới 1 commit, đặt tên thân thiện (vd `v1.0.0`).

Khác branch:
- **Branch**: pointer **dịch chuyển** khi commit mới.
- **Tag**: pointer **đông cứng** — không bao giờ thay đổi.

```text
                      v1.0.0 (tag)
                        │
                        ▼
A ─── B ─── C ─── D ─── E ─── F ─── G (main)
            │                     │
            ▼                     ▼
          v0.9.0                 v1.1.0
```

Use case:
- Đánh dấu release: `v1.0.0`, `v2.1.6`.
- Đánh dấu deploy: `prod-2025-01-10`.
- Đánh dấu milestone: `pre-migration`.

## 2 loại tag

### Lightweight tag — chỉ pointer

```bash
git tag v1.0.0
```

Tạo file ref trỏ tới HEAD. Đó là tất cả.

### Annotated tag — pointer + metadata

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
```

Chứa thêm:
- Tagger name + email.
- Tag date.
- Message.
- Có thể sign GPG.

**Annotated tag là chuẩn cho release**. Lightweight cho tag cá nhân, tạm thời.

## Tạo, xem, xoá tag

```bash
# Tạo annotated
git tag -a v1.0.0 -m "Initial release"

# Tag commit cũ
git tag -a v0.9.0 -m "RC" a3f5b2c

# List tag
git tag
# v0.9.0
# v1.0.0

# List với pattern
git tag -l "v1.*"

# Xem chi tiết
git show v1.0.0

# Xoá local tag
git tag -d v1.0.0

# Xoá tag remote
git push origin --delete v1.0.0
# Hoặc:
git push origin :refs/tags/v1.0.0
```

## Push tag lên remote

`git push` **mặc định KHÔNG push tag**. Phải explicit:

```bash
git push origin v1.0.0               # 1 tag cụ thể
git push origin --tags               # Mọi tag
git push --follow-tags               # Commit + annotated tag liên quan
```

Config push auto-follow:

```bash
git config --global push.followTags true
```

## Semantic Versioning (SemVer)

Chuẩn ngành cho version. Format:

```text
MAJOR.MINOR.PATCH

Vd: 2.1.6
    │ │ │
    │ │ └ Patch — bug fix, backward compatible
    │ └─── Minor — feature mới, backward compatible
    └───── Major — breaking change, KHÔNG backward compatible
```

Khi tăng số:

| Loại thay đổi | Bump | Ví dụ |
|---|---|---|
| Bug fix, không API mới | PATCH | 1.2.3 → 1.2.4 |
| Feature mới, không break user | MINOR | 1.2.3 → 1.3.0 |
| Breaking change | MAJOR | 1.2.3 → 2.0.0 |

Quy tắc bonus:
- Bump MINOR → reset PATCH về 0: `1.2.5 → 1.3.0`.
- Bump MAJOR → reset MINOR và PATCH: `1.5.3 → 2.0.0`.
- Bắt đầu `0.x.y` cho beta — ai cũng biết unstable.
- `1.0.0` = sản phẩm "stable" công khai.

### Pre-release versions

```text
1.0.0-alpha       Phiên bản alpha (sớm, có thể đổi)
1.0.0-alpha.1
1.0.0-beta.1
1.0.0-rc.1        Release candidate
1.0.0             Final
```

Pre-release **luôn nhỏ hơn** final theo SemVer:

```text
1.0.0-alpha < 1.0.0-beta < 1.0.0-rc.1 < 1.0.0
```

### Build metadata

```text
1.0.0+20250130-build.42
1.0.0-rc.1+exp.sha.5114f85
```

Sau `+` là metadata — **không tính vào ordering**, chỉ thông tin.

## Lý do SemVer quan trọng

Khi user dùng package của bạn:

```json
{
  "dependencies": {
    "my-lib": "^1.2.3"
  }
}
```

- `^1.2.3` = "≥ 1.2.3 và < 2.0.0" → npm tự update PATCH và MINOR, không MAJOR.
- `~1.2.3` = "≥ 1.2.3 và < 1.3.0" → chỉ update PATCH.
- `1.2.3` = exact.

Nếu bạn bump MAJOR khi không breaking → user upgrade phá vỡ. Nếu bạn không bump MAJOR khi breaking → user `^1.x` upgrade tự động → app họ vỡ. **SemVer là contract**.

## Tag + Release trên GitHub

GitHub UI: Repo → Releases → **Draft a new release**:

1. **Choose a tag**: tạo mới hoặc chọn tag đã có.
2. **Target**: branch (thường main).
3. **Release title**: `v1.0.0 - Initial Release`.
4. **Description**: changelog, breaking change, upgrade guide.
5. ☑ Pre-release nếu alpha/beta/rc.
6. ☑ Generate release notes (auto từ commit + PR).
7. Attach binary (Linux/Mac/Windows builds).
8. **Publish release**.

Khác Tag vs Release:
- **Tag**: chỉ Git pointer.
- **Release**: GitHub feature (tag + notes + binary + RSS feed).

## CHANGELOG.md — log thay đổi cho user

Convention:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-01-30

### Added
- OAuth2 login support
- API rate limiting

### Changed
- Upgrade Node.js to 20

### Fixed
- Login redirect bug (#234)

### Deprecated
- /api/v1/* endpoints (will be removed in 2.0)

### Removed
- Legacy XML parser

### Security
- Fix CVE-2025-001 in dependency
```

Categories chuẩn:
- **Added** — feature mới.
- **Changed** — đổi behavior.
- **Deprecated** — sẽ remove.
- **Removed** — đã remove.
- **Fixed** — bug.
- **Security** — vulnerability fix.

## Conventional Commits → tự generate version

Bài 2 đã dạy Conventional Commits. Kết hợp với SemVer:

| Commit type | Bump |
|---|---|
| `fix: ...` | PATCH (1.2.3 → 1.2.4) |
| `feat: ...` | MINOR (1.2.3 → 1.3.0) |
| `feat!: ...` hoặc `BREAKING CHANGE:` trong body | MAJOR (1.2.3 → 2.0.0) |

Tool **semantic-release** đọc commit, tự bump, tag, push, generate CHANGELOG:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Mỗi merge main → CI đọc commit → bump → tag → release → publish package. **Zero manual versioning**.

## Pattern thực tế

### App version trong code

```python
# version.py
__version__ = "1.2.3"
```

```javascript
// package.json
{
  "name": "my-app",
  "version": "1.2.3"
}
```

Source of truth phải sync với git tag.

### Build with version

```bash
# Đọc tag hiện tại
VERSION=$(git describe --tags --abbrev=0)
echo "Building version $VERSION"
docker build -t myapp:$VERSION .
```

### `git describe`

```bash
git describe --tags
# v1.2.3-5-g8c0a1b3
#  │     │  │
#  │     │  └ Hash commit hiện tại
#  │     └ 5 commit sau tag
#  └ Tag gần nhất
```

Cho biết "đang ở 5 commit sau v1.2.3". Dùng nhiều trong CI build name.

## Tag signing

```bash
git tag -s v1.0.0 -m "Release 1.0.0"   # Signed with GPG
git tag -v v1.0.0                       # Verify
```

Signed tag chứng minh tag được tạo bởi đúng người — quan trọng cho open source release.

## Tagging strategy

| Strategy | Tag format | Khi nào |
|---|---|---|
| Pure SemVer | `v1.2.3` | Library, package |
| CalVer | `2025.01.30` | Distro, browser (vd Ubuntu 24.04, Firefox 124) |
| Build number | `b1234` | Internal build (Jenkins build #) |
| Date + commit | `2025-01-30-a3f5b2c` | Deploy snapshot |
| Environment | `prod-2025-01-30` | Deploy event |

**SemVer** phổ biến nhất cho code library. **CalVer** cho product release theo lịch.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên `--tags` khi push | Tag không lên remote | `push.followTags = true` |
| Lightweight tag cho release | Mất metadata | Luôn `-a` cho release |
| Đổi tag (force) | Người clone trước có tag cũ | KHÔNG đổi tag đã push. Tạo tag mới. |
| Sai SemVer (bump MAJOR khi không break) | User confused | Đọc SemVer spec kỹ |
| Tag không match version trong code | Source of truth ambiguous | Auto-sync qua script CI |
| Tag commit dev | Release "broken" | Chỉ tag commit đã test |
| Quá nhiều tag | Repo nặng | Xoá tag cũ định kỳ |

## Quick reference

```text
git tag                              List tag
git tag -l "v1.*"                    Filter pattern
git tag -a v1.0.0 -m "msg"           Tạo annotated
git tag v1.0.0                       Tạo lightweight (avoid for release)
git tag -a v1.0.0 a3f5b2c -m "msg"   Tag commit cụ thể
git tag -d v1.0.0                    Xoá local
git show v1.0.0                      Chi tiết

git push origin v1.0.0               Push 1 tag
git push origin --tags               Push tất cả
git push --follow-tags               Push commit + tag
git push origin --delete v1.0.0      Xoá remote

git describe --tags                  Describe HEAD relative tag

# SemVer
MAJOR.MINOR.PATCH
fix → PATCH
feat → MINOR
feat! / BREAKING → MAJOR
```

## Tổng kết phase 5 (Git)

7 bài đã cover:

1. **Git là gì** — VCS, distributed, snapshot model.
2. **Git cơ bản** — init, add, commit, log, status, diff.
3. **Branches & merging** — branch, switch, merge (FF/3-way/squash), rebase, conflict.
4. **Remote & GitHub** — clone, push, pull, fetch, PR workflow.
5. **Rollback** — restore, reset, revert, stash, reflog, bisect.
6. **SSH & auth** — key, agent, PAT, signed commits, pre-commit hooks.
7. **Tags & SemVer** — annotated tag, MAJOR.MINOR.PATCH, GitHub Release, semantic-release.

Bạn giờ có đủ kỹ năng Git cho 99% workflow DevOps daily.

## Tóm tắt bài 7

- **Tag** = pointer cố định, không đổi sau khi đẩy.
- **Annotated tag** (`-a`) cho release; lightweight cho việc tạm.
- **SemVer**: `MAJOR.MINOR.PATCH` — break/feature/fix.
- **GitHub Release** = Git tag + notes + binary + RSS.
- **Conventional Commits + semantic-release** = zero-manual versioning.
- `git describe --tags` show vị trí relative tag.
- **Không đổi tag đã push** — tạo tag mới thay vì.

**Phase kế tiếp** → [Phase 6 — Bài 1: Vagrant nâng cao — multi-VM lab](../phase-6-vagrant-linux-servers/01-vagrant-nang-cao.md)

> Phase 6 sẽ được viết tiếp.
