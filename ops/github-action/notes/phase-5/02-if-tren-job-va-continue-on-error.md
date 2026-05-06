# Bài 2: `if` trên Job và `continue-on-error`

## `if` trên Job

Giống như step, job cũng có thể có điều kiện. Ví dụ: chạy một job `report` để thông báo khi có job nào đó thất bại:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying..."

  report:
    needs: [test, deploy]       # ← phải có needs để chờ các jobs kia xong
    if: failure()               # ← chỉ chạy nếu có job nào thất bại
    runs-on: ubuntu-latest
    steps:
      - name: Output failure info
        run: echo "Something went wrong!"
```

### Lưu ý quan trọng về `needs` + `if: failure()`

Nếu thêm `if: failure()` vào job `report` mà **không có** `needs`, job `report` sẽ chạy ngay lập tức (song song) khi workflow bắt đầu. Lúc đó chưa có job nào fail, nên `failure()` trả về `false` → job bị skip.

Giải pháp: **luôn thêm `needs`** khi muốn job chạy có điều kiện dựa trên kết quả của jobs khác.

GitHub Actions đánh giá `failure()` cho toàn bộ **chuỗi job** trong `needs`, không chỉ các job được liệt kê trực tiếp. Nếu `deploy` cần `test`, và `test` bị fail → `deploy` bị skip → `report` vẫn thấy failure vì `test` thất bại.

---

## Ứng dụng thực tế: Cache với `if` trên step

Một use case hay của `if` trên step là tối ưu caching. Thay vì cache `~/.npm`, bạn cache toàn bộ `node_modules` và **bỏ qua bước install** nếu đã restore được cache:

```yaml
steps:
  - uses: actions/checkout@v3

  - name: Cache dependencies
    id: cache                       # ← cần id để đọc output
    uses: actions/cache@v3
    with:
      path: node_modules
      key: deps-node-${{ hashFiles('**/package-lock.json') }}

  - name: Install dependencies
    if: steps.cache.outputs.cache-hit != 'true'   # ← chỉ install nếu không có cache
    run: npm ci
```

`actions/cache` có output `cache-hit` (giá trị `'true'` hoặc `'false'` dạng string) để biết liệu cache có được restore hay không. Nếu cache hit, bỏ qua install hoàn toàn — nhanh hơn nhiều.

---

## `continue-on-error`

`continue-on-error: true` trên một step nói với GitHub Actions: "Dù step này có fail, hãy **tiếp tục** thực thi các bước tiếp theo và coi job này là **thành công**."

```yaml
steps:
  - name: Run tests
    continue-on-error: true    # ← job vẫn "succeed" dù tests fail
    run: npm test

  - name: Next step
    run: echo "This runs even if tests failed"
```

### `continue-on-error` vs `if: failure()`

| | `if: failure()` | `continue-on-error: true` |
|---|---|---|
| Step tiếp theo | Chạy nếu step trước fail | Chạy vì job được coi là "success" |
| Kết quả job | Job **vẫn fail** | Job được coi là **success** |
| Jobs phụ thuộc | Bị hủy (do job fail) | Tiếp tục chạy (do job "success") |

Chọn cái nào?
- Dùng `if: failure()` khi chỉ muốn chạy **một số step cụ thể** nếu fail, nhưng vẫn muốn job và workflow đánh dấu là failed.
- Dùng `continue-on-error: true` khi muốn **toàn bộ workflow tiếp tục** bất kể step này có lỗi (ví dụ: step kiểm tra non-critical mà bạn không muốn block deployment).

### `outcome` vs `conclusion`

Khi dùng `continue-on-error`, có sự khác biệt:
- `steps.<id>.outcome` — kết quả **thực tế** của step (trước khi `continue-on-error` áp dụng)
- `steps.<id>.conclusion` — kết quả **cuối cùng** (sau khi `continue-on-error` áp dụng)

```yaml
- name: Run tests
  id: run-tests
  continue-on-error: true
  run: npm test

- name: Check result
  run: |
    echo "Outcome: ${{ steps.run-tests.outcome }}"      # → failure
    echo "Conclusion: ${{ steps.run-tests.conclusion }}" # → success
```

---

## Ví dụ kết hợp

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      
      - name: Run tests
        id: run-tests
        run: npm test
      
      - name: Upload report (only on failure)
        if: failure() && steps.run-tests.outcome == 'failure'
        uses: actions/upload-artifact@v3
        with:
          name: test-report
          path: test-results.json

  report:
    needs: [test]
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - run: echo "Pipeline failed — check test-report artifact"
```

---

**Tiếp theo:** Matrix Jobs — Chạy cùng job với nhiều cấu hình →
