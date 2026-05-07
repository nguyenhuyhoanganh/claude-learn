# Bài 1: Điều kiện `if` trên Step

## Hành vi mặc định khi step thất bại

Khi một step trong job thất bại, GitHub Actions **dừng ngay job đó** — các step phía sau không chạy. Các jobs phụ thuộc (qua `needs`) cũng bị hủy.

Đây là hành vi mặc định hợp lý nhưng **đôi khi không đủ linh hoạt**. Ví dụ: bạn muốn upload test report **chỉ khi** test bị fail — nếu test pass thì không cần report.

---

## `if` field

Thêm `if` vào một step để đặt điều kiện thực thi:

```yaml
steps:
  - name: Run tests
    id: run-tests           # ← phải có id để tham chiếu
    run: npm test

  - name: Upload test report
    if: ...                 # ← step này chỉ chạy nếu điều kiện đúng
    uses: actions/upload-artifact@v3
    with:
      name: test-report
      path: test-results.json
```

### Đặc điểm của `if`

Giá trị trong `if` là một **expression**. Khác với các trường khác, bạn **không cần** bọc trong `${{ }}` — GitHub Actions tự hiểu đây là expression:

```yaml
# Cả hai cách đều hợp lệ:
if: steps.run-tests.outcome == 'failure'
if: ${{ steps.run-tests.outcome == 'failure' }}
```

---

## `steps.<id>.outcome` — Kết quả của step

Khi một step có `id`, bạn có thể đọc kết quả của nó qua:

```
steps.<id>.outcome
```

Giá trị có thể là:
- `success` — bước thực hiện thành công
- `failure` — bước thất bại
- `cancelled` — bị hủy thủ công
- `skipped` — bị bỏ qua do `if` condition không thoả

---

## Vấn đề: `if` một mình chưa đủ

Nếu chỉ thêm `if: steps.run-tests.outcome == 'failure'`, step **vẫn không chạy** khi test fail vì GitHub Actions đã hủy job ngay khi test thất bại. Step phía sau không bao giờ được đánh giá.

Để nói với GitHub "hãy đánh giá step này ngay cả khi có step trước thất bại", bạn phải dùng hàm đặc biệt `failure()`:

```yaml
- name: Upload test report
  if: failure() && steps.run-tests.outcome == 'failure'
  uses: actions/upload-artifact@v3
  with:
    name: test-report
    path: test-results.json
```

`failure()` trả về `true` khi **bất kỳ step trước nào** trong job thất bại. Kết hợp với `&&`, ta đảm bảo:
1. `failure()` — bỏ qua hành vi mặc định "hủy hết sau khi fail"
2. `steps.run-tests.outcome == 'failure'` — chỉ upload khi đúng step test là nguyên nhân thất bại (không phải các bước setup trước đó)

---

## 4 hàm đặc biệt cho `if`

| Hàm | Trả về `true` khi |
|---|---|
| `failure()` | Bất kỳ step/job trước nào thất bại |
| `success()` | Tất cả step/job trước thành công (mặc định nếu không có `if`) |
| `always()` | Luôn luôn (bất kể kết quả) |
| `cancelled()` | Workflow bị hủy thủ công |

**Ví dụ `always()`** — step cleanup luôn chạy dù có lỗi hay không:

```yaml
- name: Cleanup temp files
  if: always()
  run: rm -rf /tmp/build-*
```

---

## Các operator trong `if`

```yaml
# Bằng nhau
if: steps.build.outcome == 'success'

# Không bằng
if: steps.build.outcome != 'skipped'

# Kết hợp AND
if: failure() && steps.run-tests.outcome == 'failure'

# Kết hợp OR
if: steps.lint.outcome == 'failure' || steps.test.outcome == 'failure'

# Lớn hơn / nhỏ hơn (dùng với số)
if: github.run_number > 10
```

---

## Ví dụ đầy đủ

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

      - name: Upload test report
        if: failure() && steps.run-tests.outcome == 'failure'
        uses: actions/upload-artifact@v3
        with:
          name: test-report
          path: test-results.json
```

Kết quả:
- Test pass → report **không** upload (không cần thiết)
- Test fail → report **được** upload (để debug)
- Bước trước test fail (ví dụ `npm ci`) → report **không** upload (test chưa chạy nên không có report)

---

**Tiếp theo:** `if` trên Job và `continue-on-error` →
