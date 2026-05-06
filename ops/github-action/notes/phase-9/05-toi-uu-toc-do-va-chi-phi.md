# Bài 5: Tối ưu Tốc độ và Chi phí

## Tại sao cần tối ưu

GitHub Actions tính phí theo **phút chạy** (với private repos). Ubuntu runner: $0.008/phút. Với pipeline 20 phút × 50 lần push/ngày = 1000 phút/ngày = ~$8/ngày. Cải thiện từ 20 phút xuống 5 phút tiết kiệm 75% chi phí.

Với public repos miễn phí, tối ưu vẫn quan trọng vì tốc độ feedback nhanh hơn giúp team làm việc hiệu quả hơn.

---

## 1. Cache đúng cách — Điểm tối ưu lớn nhất

### Cache `node_modules` thay vì `~/.npm`

```yaml
# ✅ Tốt hơn — cache trực tiếp node_modules, bỏ qua npm ci nếu hit
- uses: actions/cache@v3
  id: cache
  with:
    path: node_modules
    key: deps-${{ hashFiles('**/package-lock.json') }}

- name: Install
  if: steps.cache.outputs.cache-hit != 'true'
  run: npm ci
```

### Cache nhiều thứ cùng lúc

```yaml
- uses: actions/cache@v3
  with:
    path: |
      ~/.cache/pip          # Python pip cache
      ~/.cargo/registry     # Rust cargo cache
      node_modules
    key: multi-${{ runner.os }}-${{ hashFiles('**/package-lock.json', '**/Cargo.lock') }}
```

### `restore-keys` — Fallback cache

Khi không tìm thấy cache key chính xác, thử key cũ hơn:

```yaml
- uses: actions/cache@v3
  with:
    path: node_modules
    key: deps-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      deps-                   # ← fallback: dùng cache deps bất kỳ dù key khác
```

Lần đầu không có cache → cài từ đầu.  
Lần hai thêm 1 package → `package-lock.json` thay đổi → key mới không match → fallback dùng cache cũ → `npm ci` chỉ cài thêm 1 package.

---

## 2. Chạy Jobs Song Song

Thiết kế pipeline để jobs không phụ thuộc nhau chạy cùng lúc:

```yaml
jobs:
  lint:                     # ┐
    ...                     # ├── Chạy song song
  test:                     # │
    ...                     # ┘
  
  build:
    needs: [lint, test]     # Chờ cả hai xong mới chạy
    ...
```

Tránh chain `needs: a → b → c → d` khi không thực sự cần thiết — mỗi bước phải chờ bước trước dù không phụ thuộc.

---

## 3. Timeout — Tránh job treo vô tận

Job bị treo (chờ input, network timeout...) sẽ chạy đến hết 6 tiếng mặc định:

```yaml
jobs:
  test:
    timeout-minutes: 15     # ← job tự fail sau 15 phút nếu chưa xong
    ...
```

Thiết lập timeout thực tế hơn thời gian job thường chạy. Ví dụ job thường 5 phút thì đặt 15 phút — đủ buffer nhưng không treo quá lâu.

---

## 4. Skip jobs không cần thiết

### Chỉ build artifact một lần, tái dùng ở nhiều nơi

```yaml
jobs:
  build:                              # Chạy 1 lần
    steps:
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with: { name: dist, path: dist }

  deploy-staging:
    needs: build
    steps:
      - uses: actions/download-artifact@v3    # Dùng artifact đã build
        with: { name: dist }

  deploy-production:
    needs: build                              # Cùng artifact
    steps:
      - uses: actions/download-artifact@v3
        with: { name: dist }
```

Thay vì mỗi job build lại từ đầu.

### Không deploy nếu chỉ đổi docs

```yaml
on:
  push:
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '.github/ISSUE_TEMPLATE/**'
```

---

## 5. Chọn runner phù hợp

| Runner | Chi phí | Khi dùng |
|---|---|---|
| `ubuntu-latest` | Thấp nhất | Mặc định cho hầu hết |
| `windows-latest` | Cao gấp 2 | Chỉ khi test Windows-specific |
| `macos-latest` | Cao gấp 10 | Build iOS app, macOS-specific test |

macOS runners đắt gấp 10 lần Ubuntu — chỉ dùng khi thực sự cần.

---

## 6. Self-hosted Runners — Khi GitHub runners không đủ

Tự host runner trên máy của bạn:

```yaml
jobs:
  build:
    runs-on: self-hosted    # ← thay vì ubuntu-latest
```

**Khi nào dùng:**
- Cần hardware đặc biệt (GPU, nhiều RAM)
- Cần truy cập internal network (database, services nội bộ)
- Muốn tiết kiệm chi phí với private repos chạy nhiều (sau khi setup cost thu hồi được)
- Cần cache liên tục giữa runs (runner không reset sau mỗi run)

**Nhược điểm:** Phải tự maintain máy, lo về security (code của PR từ người ngoài sẽ chạy trên máy bạn).

---

## 7. Giảm kích thước Docker build (nếu build Docker image)

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v2

- name: Build image
  uses: docker/build-push-action@v4
  with:
    cache-from: type=gha        # ← dùng GitHub Actions cache cho Docker layers
    cache-to: type=gha,mode=max
    push: true
    tags: myapp:latest
```

---

## 8. Fail fast để không lãng phí

Khi test fail, bạn muốn biết ngay lập tức, không phải đợi 15 phút deploy xong rồi mới thấy:

```yaml
jobs:
  quick-checks:              # Chạy đầu tiên, nhanh nhất
    steps:
      - run: npm run lint    # 30 giây

  tests:
    needs: quick-checks      # Chỉ chạy nếu lint pass
    steps:
      - run: npm test        # 3 phút

  build:
    needs: tests             # Chỉ build nếu test pass
    steps:
      - run: npm run build   # 5 phút
```

Lint fail → dừng ngay, không mất thêm 8 phút cho test + build.

---

## Checklist tối ưu

- [ ] Cache dependencies với `cache-hit` condition để skip install
- [ ] `timeout-minutes` trên các jobs dài
- [ ] Chạy song song khi jobs không phụ thuộc nhau
- [ ] `paths-ignore` để bỏ qua commit không cần CI
- [ ] Build artifact một lần, dùng nhiều lần qua upload/download
- [ ] Chỉ dùng macOS/Windows runner khi thực sự cần

---

## Tóm tắt Phase 9

✅ **Concurrency control**: `concurrency:` key tránh deploy song song, `cancel-in-progress` để xử lý push liên tiếp  
✅ **Debug**: Debug logging, `toJSON()`, `workflow_dispatch`, tool `act` để test local  
✅ **Deployment strategy**: Dev/Staging/Production với Environments + Required reviewers  
✅ **Monorepo**: `paths` filter, dynamic matrix từ changed files, `fromJSON()`  
✅ **Tối ưu**: Cache đúng chỗ, song song hóa, timeout, `restore-keys` fallback  
