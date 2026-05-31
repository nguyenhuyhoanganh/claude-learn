# Bài 6: SSH authentication và Git Credential

HTTPS login với password/PAT đủ dùng nhưng phải nhập credential mỗi lần. **SSH key** = không cần nhập, mạnh hơn, là chuẩn cho mọi automation.

## SSH key — cách hoạt động

```text
+──────────────+               +────────────+
│ Máy bạn      │               │ GitHub     │
│              │               │            │
│ ┌──────────┐ │               │ ┌────────┐ │
│ │ Private  │ │  ssh login    │ │ Public │ │
│ │  key (id │ │ ────────────► │ │  key   │ │
│ │  _ed25519│ │               │ │ list   │ │
│ │ )        │ │ ◄──────────── │ │        │ │
│ └──────────┘ │   verify       │ └────────┘ │
│              │                │            │
│ ┌──────────┐ │                │            │
│ │ Public   │ │ → upload qua   │            │
│ │  key (.  │ │   web 1 lần    │            │
│ │  pub)    │ │                │            │
│ └──────────┘ │                │            │
+──────────────+                +────────────+
```

Nguyên lý **asymmetric crypto**:
- **Private key**: ở máy bạn, KHÔNG chia sẻ.
- **Public key**: upload lên GitHub, public OK.
- Khi login: máy bạn sign challenge bằng private → GitHub verify bằng public → nếu khớp → cho phép.

## Tạo SSH key

Modern: dùng **Ed25519** (an toàn hơn RSA, ngắn hơn).

```bash
ssh-keygen -t ed25519 -C "your@email.com"
```

```text
Generating public/private ed25519 key pair.
Enter file in which to save the key (~/.ssh/id_ed25519):
Enter passphrase (empty for no passphrase): ********
Enter same passphrase again: ********
```

3 câu hỏi:
1. **Tên file**: enter mặc định `~/.ssh/id_ed25519`.
2. **Passphrase**: nên đặt (mất key vẫn an toàn). Có thể trống cho automation.
3. **Confirm passphrase**.

Output 2 file:

```bash
ls ~/.ssh/
# id_ed25519        ← Private (CHẰN nhất)
# id_ed25519.pub    ← Public (OK share)
# known_hosts
```

Permission **bắt buộc** — SSH refuse nếu sai:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

## Upload public key lên GitHub

```bash
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3Nz...nQv your@email.com

# macOS: copy luôn
pbcopy < ~/.ssh/id_ed25519.pub

# Linux:
xclip -sel clip < ~/.ssh/id_ed25519.pub

# Windows Git Bash:
cat ~/.ssh/id_ed25519.pub | clip
```

Vào GitHub:
1. Avatar (top-right) → **Settings**.
2. **SSH and GPG keys** → **New SSH key**.
3. Title: `Macbook Pro 2024` (mô tả máy).
4. Key type: **Authentication Key**.
5. Paste public key.
6. **Add SSH key**.

> Nếu có bật **SSO** trong tổ chức, phải **Configure SSO** cho key (button bên cạnh).

## Test SSH connection

```bash
ssh -T git@github.com
```

Lần đầu hỏi:

```text
The authenticity of host 'github.com (140.82.112.4)' can't be established.
ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
Are you sure you want to continue connecting (yes/no)?
```

Verify fingerprint với GitHub docs (nên match), gõ `yes`.

```text
Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```

✓ Hoạt động.

## Đổi remote URL từ HTTPS sang SSH

Repo cũ:

```bash
git remote -v
# origin  https://github.com/me/repo.git (fetch)
# origin  https://github.com/me/repo.git (push)

git remote set-url origin git@github.com:me/repo.git
git remote -v
# origin  git@github.com:me/repo.git (fetch)
# origin  git@github.com:me/repo.git (push)
```

Repo mới:

```bash
git clone git@github.com:me/repo.git
```

Note format khác HTTPS:
- HTTPS: `https://github.com/user/repo.git`
- SSH: `git@github.com:user/repo.git` (KHÔNG có `//`, có `:`)

## ssh-agent — cache passphrase

Mỗi `git push` hỏi passphrase → mệt. `ssh-agent` cache trong RAM:

```bash
# Khởi động agent (thường tự khởi với desktop session)
eval "$(ssh-agent -s)"
# Agent pid 12345

# Add key
ssh-add ~/.ssh/id_ed25519
# Enter passphrase: ********
# Identity added

# Verify
ssh-add -l
# 256 SHA256:... your@email (ED25519)
```

Sau đó mọi push không cần passphrase cho đến khi agent restart.

### Auto-add khi login

`~/.bashrc` hoặc `~/.zshrc`:

```bash
# Auto start ssh-agent
if ! pgrep -u "$USER" ssh-agent > /dev/null; then
    ssh-agent > "$XDG_RUNTIME_DIR/ssh-agent.env"
fi
if [[ ! "$SSH_AUTH_SOCK" ]]; then
    source "$XDG_RUNTIME_DIR/ssh-agent.env" >/dev/null
fi
```

macOS có **Keychain integration** — `ssh-add --apple-use-keychain` tự lưu passphrase trong Keychain.

## SSH config — quản lý nhiều key

`~/.ssh/config`:

```text
# Default GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519

# Work GitHub (account khác)
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work

# GitLab self-hosted
Host gitlab.internal
    HostName gitlab.internal.acme.com
    User git
    Port 2222
    IdentityFile ~/.ssh/id_ed25519_internal
```

Dùng:

```bash
# Repo cá nhân
git clone git@github.com:me/repo.git

# Repo công ty (alias github-work)
git clone git@github-work:acme/proj.git

# GitLab internal
git clone git@gitlab.internal:team/repo.git
```

Đây là cách quản nhiều account GitHub trên 1 máy.

## Personal Access Token (PAT) — cho HTTPS

Khi cần HTTPS (CI, script), dùng PAT thay password:

1. GitHub Settings → Developer settings → **Personal access tokens** → **Fine-grained tokens** (recommend) hoặc **Classic**.
2. **Generate new token**.
3. Set:
   - Name: `CI machine`, `laptop dev`, ...
   - Expiration: **không quá 90 ngày**.
   - Repository access: **chỉ repos cần thiết**.
   - Permission: **tối thiểu** (Contents: Read+Write).
4. **Generate** → copy token (hiện 1 lần).
5. Lưu vào password manager hoặc secret manager.

Dùng trong git:

```bash
# Khi push, prompt:
# Username: your-username
# Password: ghp_xxxxxxxxxxxxxxxxxxxx  ← Paste PAT, không phải GitHub password
```

## Credential Helper

Để không nhập PAT mỗi push, cache:

```bash
# Cache RAM 1 tiếng
git config --global credential.helper "cache --timeout=3600"

# Lưu plain text (KHÔNG bảo mật)
git config --global credential.helper store
# → ~/.git-credentials

# macOS Keychain
git config --global credential.helper osxkeychain

# Windows
git config --global credential.helper manager

# Linux libsecret (Gnome Keyring/KWallet)
git config --global credential.helper /usr/share/doc/git/contrib/credential/libsecret/git-credential-libsecret
```

## Signed commits — chứng minh là bạn commit

GitHub có thể fake author email. Để **prove** commit là bạn, dùng GPG signing:

```bash
# 1. Tạo GPG key
gpg --full-generate-key

# 2. List key
gpg --list-secret-keys --keyid-format LONG
# sec   rsa4096/3AA5C34371567BD2 ...

# 3. Add vào git config
git config --global user.signingkey 3AA5C34371567BD2
git config --global commit.gpgsign true

# 4. Upload public key lên GitHub
gpg --armor --export 3AA5C34371567BD2
# Copy → GitHub → SSH and GPG keys → New GPG key
```

Sau đó commit có badge **Verified** trên GitHub.

Modern alternative: **SSH signing** (Git 2.34+) — dùng SSH key thay GPG:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

## Pre-commit hooks — chặn lỗi trước commit

`.git/hooks/pre-commit` (script bash) chạy trước mỗi commit. Fail → commit cancel.

Tool phổ biến: **pre-commit framework**:

```bash
pip install pre-commit
```

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files

  - repo: https://github.com/awslabs/git-secrets
    rev: 1.3.0
    hooks:
      - id: git-secrets

  - repo: https://github.com/psf/black
    rev: 24.1.1
    hooks:
      - id: black
```

```bash
pre-commit install                   # Set up hook
pre-commit run --all-files           # Test
```

Mọi `git commit` từ giờ chạy check tự động.

### Common pre-commit checks

| Check | Mục đích |
|---|---|
| trailing-whitespace | Xoá space cuối dòng |
| end-of-file-fixer | Thêm newline cuối file |
| check-yaml / json | Validate syntax |
| check-added-large-files | Chặn file > 500 KB |
| detect-private-key | Phát hiện key |
| git-secrets | Phát hiện AWS, GCP credentials |
| black / prettier / rustfmt | Format code |
| eslint / flake8 / clippy | Lint |
| commitlint | Validate message format |

## SSH key types — RSA vs Ed25519

| | RSA 2048 | RSA 4096 | Ed25519 |
|---|---|---|---|
| Security | OK | Tốt | Tốt nhất |
| Size | ~400 byte public | ~750 byte | **~100 byte** |
| Speed | Trung bình | Chậm | **Nhanh nhất** |
| Quantum-resistant | ✗ | ✗ | ✗ (cả 2 đều chưa) |
| Recommend | Avoid | Legacy | **Default** |

Dùng **Ed25519** trừ khi server cũ không support.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Permission `.ssh/` quá rộng | SSH refuse | `chmod 700 ~/.ssh; chmod 600 ~/.ssh/id_ed25519` |
| Upload private key thay public | Critical security | Upload chỉ `.pub` |
| Quên agent → nhập passphrase mỗi push | Khó chịu | `ssh-add` lúc login |
| Multiple GitHub account | Conflict key | SSH config với alias |
| Push HTTPS với password (deprecated) | Fail | Dùng PAT hoặc SSH |
| PAT có scope quá rộng | 1 lần lộ = mất account | Fine-grained, scope tối thiểu |
| Commit message không sign | Có thể bị fake | GPG/SSH signing |
| Commit secret rồi nhớ ra | Bot scan public ngay | Pre-commit hook chặn |

## Quick reference

```text
ssh-keygen -t ed25519 -C "email"     Tạo key
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub            Public key để paste GitHub

ssh -T git@github.com                Test
ssh-add ~/.ssh/id_ed25519            Add vào agent
ssh-add -l                           List agent keys

git remote set-url origin SSH_URL    Đổi HTTPS → SSH

# Signed commits
git config --global user.signingkey KEY_ID
git config --global commit.gpgsign true

# Pre-commit
pre-commit install
```

## Tóm tắt bài 6

- **Ed25519** modern default — `ssh-keygen -t ed25519`.
- Public key (`*.pub`) upload GitHub — Private giữ máy.
- Permission `700` cho `.ssh/`, `600` cho private key — **bắt buộc**.
- **ssh-agent** cache passphrase, đỡ nhập mỗi push.
- **SSH config** quản nhiều account/key.
- **PAT** thay password cho HTTPS, scope tối thiểu, expire 90 ngày.
- **GPG/SSH signed commits** prove tính xác thực — badge Verified.
- **Pre-commit hooks** chặn lỗi (secret, format, lint) trước commit.

**Bài kế tiếp** → [Bài 7: Git Tags và Semantic Versioning](07-tags-versioning.md)
