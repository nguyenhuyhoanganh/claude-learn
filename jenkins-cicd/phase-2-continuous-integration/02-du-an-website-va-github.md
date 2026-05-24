# Bài 2: Dự án website và GitHub

## Vì sao cần GitHub?

Phase 1 bạn viết pipeline trực tiếp trong UI Jenkins (textarea). Cách đó được, nhưng đi ngược nguyên tắc **Pipeline-as-Code**:

- Không ai biết ai sửa gì.
- Không versioning.
- Không nhân bản được sang Jenkins khác.

**Đúng cách**: pipeline phải nằm trong **file `Jenkinsfile`** ở **root của project repo**, commit cùng source code, Jenkins **đọc từ Git** mỗi lần build.

```text
your-project-repo/
├── src/                  ← Source code
├── package.json
├── README.md
└── Jenkinsfile           ← ← ← Pipeline ở đây
```

Lợi ích:
- Mỗi commit có **lịch sử pipeline đi kèm**. Rollback code = rollback pipeline tự động.
- Code review pipeline qua PR như code thường.
- Setup Jenkins mới: chỉ cần trỏ vào repo, không phải copy paste config.
- Đồng đội có thể đề xuất sửa pipeline → discussion qua GitHub.

→ Bài này tạo GitHub account, **fork** project mẫu, khám phá code trước khi đụng đến Jenkinsfile (bài 4 sẽ thêm Jenkinsfile).

## Tạo GitHub account (nếu chưa có)

1. Mở <https://github.com/signup>.
2. Điền email + password + username. Username sẽ xuất hiện trong URL repo (`github.com/<username>/<repo>`) → chọn tên dễ đọc.
3. Verify email.
4. (Optional) Setup SSH key: <https://docs.github.com/en/authentication/connecting-to-github-with-ssh>. Cho khoá học chỉ cần HTTPS là đủ.

> Đăng ký miễn phí, không cần thẻ tín dụng. GitHub Free đủ cho mọi nhu cầu cá nhân — repo công khai unlimited, repo private unlimited, CI/CD GitHub Actions 2000 phút/tháng.

## Fork project mẫu

Tác giả khoá đã chuẩn bị một website Node.js đơn giản: rotating Jenkins logo + chút text. Mục đích **không** phải để học React/Node.js, mà **dùng làm sample** để dựng pipeline.

> Repo gốc thường có dạng `github.com/<author>/learn-jenkins-app`. URL chính xác đính kèm trong resources khoá học.

### Vì sao **fork** chứ không clone?

- **Clone** = tải code về máy, vẫn liên kết với repo gốc. Bạn không có quyền push.
- **Fork** = tạo **bản copy của repo gốc về tài khoản bạn**. Bạn là owner, push thoải mái.

→ Trong khoá, bạn **phải fork** để có quyền sửa code + push lại.

### Cách fork

1. Mở repo gốc trên GitHub.
2. Góc trên phải, click nút **Fork**.
3. GitHub hỏi đặt tên + chọn owner (mặc định = bạn) + tick "**Copy only the main branch**".
4. Click **Create fork** → chờ 30 giây.

Sau khi xong, repo mới ở `github.com/<your-username>/learn-jenkins-app`, có badge nhỏ *"forked from <original>"*.

## Khám phá project: 2 cách

Có 2 cách để xem/sửa code:

### Cách 1: Clone về máy local (truyền thống)

```bash
git clone https://github.com/<your-username>/learn-jenkins-app.git
cd learn-jenkins-app
```

Mở thư mục bằng VS Code, IntelliJ, hoặc editor bạn dùng. Cần đã cài **Node.js** local.

### Cách 2: GitHub Codespaces (browser-based, không cần cài gì)

GitHub Codespaces = **VS Code chạy trên browser**, môi trường dev được provision sẵn (Node.js, npm, git, terminal...). Free 60 giờ/tháng cho tài khoản Free.

1. Vào trang repo fork của bạn trên GitHub.
2. Nút **Code** → tab **Codespaces** → **Create codespace on main**.
3. Đợi ~30 giây → một tab mới mở ra với VS Code đầy đủ.

→ Phù hợp nếu máy local thiếu công cụ. Khoá học không bắt buộc Codespaces nhưng đây là lựa chọn dễ nhất cho newbie.

> Khi không dùng, Codespaces sẽ auto-stop sau 30 phút idle. Hết phút free → có thể bị charge. Nhớ **Delete codespace** khi học xong.

## Khám phá cấu trúc project

Mở terminal trong VS Code / Codespaces:

```bash
ls -la
```

Output điển hình (project React/Node.js đơn giản):

```text
.
├── .git/
├── .gitignore
├── README.md
├── public/                       ← Static assets (HTML, favicon, logo)
│   └── index.html
├── src/                          ← Source code React
│   ├── App.js
│   ├── App.test.js               ← ← ← Unit test có sẵn
│   ├── index.js
│   └── ...
├── package.json                  ← Manifest npm (deps + scripts)
└── package-lock.json             ← Lock file (deps version cố định)
```

### `package.json` quan trọng nhất

Mở `package.json`:

```json
{
  "name": "learn-jenkins-app",
  "version": "0.1.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  }
}
```

Phần quan trọng:

- **`dependencies`** — các thư viện npm project cần. **Không** commit vào Git (sẽ ngon hơn cho tốc độ).
- **`scripts`** — các lệnh CLI bạn có thể chạy:
  - `npm start` — chạy dev server (port 3000).
  - `npm run build` — build production (output vào `build/`).
  - `npm test` — chạy unit tests.

→ Đây là 3 lệnh **trọng tâm** mà Jenkinsfile sẽ dùng.

## Chạy thử local

Trước khi đẩy lên Jenkins, **luôn chạy thử local trước**. Nguyên tắc: cái gì không chạy được local → đừng nhét vào pipeline. Sẽ debug khó gấp 10 lần.

### Bước 1: Cài dependencies

```bash
npm install
```

→ Đọc `package.json`, tải mọi dependency vào thư mục `node_modules/`. Lần đầu mất 1-3 phút.

Warnings như `npm WARN deprecated ...` — bỏ qua. Errors mới cần fix.

### Bước 2: Chạy dev server

```bash
npm start
```

→ Mở browser tại `http://localhost:3000`. Trên Codespaces sẽ tự forward port → có popup hỏi "Open in browser".

Nhấn **Ctrl+C** trong terminal để dừng server.

### Bước 3: Chạy unit test thử

```bash
npm test
```

→ React script chạy test ở **watch mode** (chờ file change để re-run). Nhấn `a` để chạy tất cả test, `q` để thoát.

> **Note**: trong CI, không có ai gõ `a` → cần biến môi trường `CI=true` để chạy 1 lần rồi thoát. Bài 5 sẽ dùng.

### Bước 4: Build production

```bash
npm run build
```

→ Tạo thư mục `build/` chứa file HTML/CSS/JS đã minify, sẵn sàng host. Output có dòng cuối:

```text
The build folder is ready to be deployed.
You may serve it with a static server:

  npm install -g serve
  serve -s build
```

→ Đây chính là cách host **production build** mà bài 7 (E2E test) sẽ dùng.

## Ý nghĩa quan trọng

Bạn vừa gõ tay 4 lệnh: `npm install`, `npm start`, `npm test`, `npm run build`. **Đây là 4 việc mà Jenkins sẽ tự động làm** trong pipeline. Không có gì "ma thuật" — Jenkins chỉ gọi đúng những lệnh này, trong môi trường chuẩn hoá.

```text
Manual (bạn làm tay):                       Automated (Jenkins làm):
─────────────────────                       ────────────────────────
npm install                  ─────────►     stage('Build') {
npm run build                ─────────►       sh '''
npm test                     ─────────►         npm ci
                                                npm run build
                                              '''
                                            }
                                            stage('Test') {
                                              sh 'npm test'
                                            }
```

→ Hiểu **lệnh thủ công làm gì** thì Jenkinsfile chỉ là wrapper.

## Lưu ý về dependencies & Git

- **`node_modules/`** **không bao giờ** commit. Đã có sẵn trong `.gitignore`.
- **`build/`** **không bao giờ** commit. Là output, sinh lại được.
- **`package-lock.json`** **phải** commit. Đảm bảo team & CI cài đúng version.
- **`.env`** chứa secrets → **không** commit.

> Trong CI, ta dùng `npm ci` thay `npm install`. Khác biệt:
> - `npm install` — đọc `package.json`, có thể update `package-lock.json`. Phù hợp dev.
> - `npm ci` — đọc `package-lock.json`, cài **đúng version đã lock**, không sửa lock file. Reproducible 100% → phù hợp CI.

## Tóm tắt

- **Pipeline-as-Code**: Jenkinsfile commit vào repo cùng source.
- **GitHub Free** đủ cho mọi nhu cầu cá nhân. Fork = tạo bản copy có quyền sửa.
- **Codespaces** là VS Code in-browser, dev environment không cần setup local.
- Project sample là React/Node.js với `npm start | build | test`.
- 4 lệnh local = nền tảng cho 4 stage Jenkins sau này.
- `npm ci` chuẩn cho CI (deterministic); `npm install` cho dev.
- Đừng commit `node_modules/`, `build/`, `.env`.

---

→ [Bài tiếp theo: Docker làm build environment cho pipeline](03-docker-lam-build-environment.md)
