# Bài 6: JUnit report, comments và HTML report

Stage Test bây giờ chỉ in PASS/FAIL trong log. Khi project có **100 test**, đọc log tìm test nào fail rất mệt. Bài này:

1. Publish **JUnit test report** — Jenkins parse XML, hiển thị bảng test pass/fail đẹp.
2. Dùng **comments** trong Jenkinsfile để tạm bỏ qua stage (tăng tốc develop).
3. Publish **HTML report** (báo cáo HTML do tool sinh ra).

## Phần 1: JUnit Test Report

### JUnit XML là gì?

**JUnit** ban đầu là framework test cho Java. Format **JUnit XML** mà nó sinh ra trở thành **chuẩn chung** cho mọi ngôn ngữ. Mọi tool test hiện đại (jest, pytest, mocha, playwright, go test...) đều **có thể xuất file kết quả theo format này**.

Mẫu file JUnit XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="jest tests" tests="3" failures="1" time="2.5">
  <testsuite name="App.test.js" tests="3" failures="1" time="2.5">
    <testcase name="renders learn react link" time="0.012" />
    <testcase name="button click increments counter" time="0.045" />
    <testcase name="invalid input shows error" time="0.080">
      <failure message="Expected 'Error' but got 'Success'">
        Stack trace here...
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

→ Có đủ tên test, thời gian, fail messages, stack trace. Jenkins đọc file này → render thành dashboard:

```text
Test Result : 1 failures, 2 passed
────────────────────────────────────────
App.test.js
  ✓ renders learn react link              0.012s
  ✓ button click increments counter       0.045s
  ✗ invalid input shows error             0.080s
    Expected 'Error' but got 'Success'
```

### Cấu hình test runner xuất JUnit XML

React-scripts (jest) không xuất XML mặc định. Cần plugin **jest-junit**:

```bash
# Trong project local
npm install --save-dev jest-junit
```

Sửa `package.json` thêm config:

```json
{
  "scripts": {
    "test": "react-scripts test"
  },
  "jest": {
    "reporters": ["default", "jest-junit"]
  },
  "jest-junit": {
    "outputDirectory": "test-results",
    "outputName": "junit.xml"
  }
}
```

Commit + push.

> **Cảnh báo**: cấu hình `jest` trong `package.json` có thể conflict với react-scripts. Nếu lỗi, dùng cách thứ 2: chạy jest qua flag:
> ```json
> "test": "react-scripts test --reporters=default --reporters=jest-junit"
> ```

### Sau khi chạy test, JUnit file ở đâu?

Sau khi `npm test` chạy xong, có thư mục `test-results/` với file `junit.xml`:

```text
test-results/
└── junit.xml
```

→ Đây là file Jenkins sẽ đọc.

### Cấu hình Jenkins publish JUnit

Trong Jenkinsfile, thêm `post { always { junit '...' } }`:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') { ... }
        stage('Test')  { ... }
    }
    post {
        always {
            junit 'test-results/junit.xml'
        }
    }
}
```

> **`always`** quan trọng: dù build fail hay success vẫn publish report. Khi test fail, ta vẫn muốn biết test nào fail → phải publish.

### Lần build đầu sau khi cấu hình

Push + Build Now. Mong đợi log:

```text
[Pipeline] { (Test)
+ npm test
PASS src/App.test.js
  ✓ renders learn react link (15ms)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total

[Pipeline] // stage
[Pipeline] junit
Recording test results
[Checks API] No suitable checks publisher found.
```

Warning *"No suitable checks publisher found"* — bỏ qua, không phải error. (Liên quan plugin GitHub Checks API, không cần cho khoá.)

### Xem report trên Jenkins UI

Vào trang job → sau vài build → bên trái panel xuất hiện **Test Result Trend** (biểu đồ).

Vào trang một build cụ thể → bên phải có panel **Test Result** → click → bảng chi tiết:

```text
Test Result        1 tests (1 passed)
────────────────────────────────────────
src.App
  + renders learn react link    0.015 sec  PASS
```

Khi có nhiều test fail, click vào test fail → xem stack trace + diff.

### Xu hướng test

Sau 5-10 build, **Test Result Trend** vẽ biểu đồ:

```text
Pass count
   ▲
 50│                ████████████████
   │           ████
 40│      ████
   │ ████
 30│
   └────────────────────────────────►
     1  2  3  4  5  6  7  8  9 10  build#
```

→ Hữu ích để spot regression (số test pass giảm đột ngột).

---

## Phần 2: Comments trong Jenkinsfile

Khi development, bạn thay đổi pipeline liên tục. Nếu mỗi lần test đều phải chạy `npm ci` (~1 phút) → tốc độ thử nghiệm chậm. Comment giúp **tạm disable** stage hoặc command.

### Cú pháp comment

Jenkinsfile dùng Groovy → có 2 dạng comment giống Java/JavaScript:

```groovy
// Single-line comment

/*
  Multi-line
  comment
*/

pipeline {
    agent any
    // Đây cũng là comment
    stages { ... }
}
```

### Use case 1: comment một dòng config

```groovy
stage('Build') {
    steps {
        sh '''
            set -euo pipefail
            npm ci
            # npm run build         <-- Comment trong shell (dấu #)
            ls -la
        '''
    }
}
```

→ Tạm bỏ build step, test với `node_modules` đã có. Lưu ý: comment trong **shell** dùng `#`, không phải `//`.

### Use case 2: comment cả stage

```groovy
pipeline {
    agent any
    stages {
        /*
        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh 'npm ci && npm run build'
            }
        }
        */
        stage('Test') {
            ...
        }
    }
}
```

→ Bỏ stage Build, đi thẳng Test. Vẫn pass vì workspace đã có `node_modules/` từ build trước (Jenkins không clean giữa các build).

### Pitfall

- **Phải comment cả block hoàn chỉnh**. Nếu comment lửng giữa `{ ... }` → syntax invalid → pipeline fail trước cả khi chạy.
- **Đừng quên uncomment** trước khi merge code production. Có team thắt chặt: PR có comment block bị reject.

> Cá nhân tôi khuyên: comment chỉ dùng khi **debug local**, đừng push lên Git. Nếu thật sự cần disable stage chính thức, dùng `when { expression { false } }` hoặc parameter.

---

## Phần 3: HTML Report

Nhiều test framework sinh ra **HTML report đẹp** (Playwright, Allure, Mocha Reports...). Để xem qua Jenkins UI, cần plugin **HTML Publisher**.

### Cài plugin

Manage Jenkins → Plugins → Available → tìm `HTML Publisher` → Install.

### Use case: publish Playwright HTML (preview cho bài 7)

Bài 7 sẽ dùng Playwright cho E2E test. Playwright sinh report dạng HTML đẹp ở `playwright-report/index.html`. Để publish:

```groovy
post {
    always {
        publishHTML([
            allowMissing: false,
            alwaysLinkToLastBuild: false,
            keepAll: true,
            reportDir: 'playwright-report',
            reportFiles: 'index.html',
            reportName: 'Playwright HTML Report',
            reportTitles: 'E2E Test Report'
        ])
    }
}
```

Các option:

- **`reportDir`** — thư mục chứa HTML.
- **`reportFiles`** — file index, thường `index.html`.
- **`reportName`** — tên link hiển thị bên trái UI Jenkins.
- **`keepAll: true`** — giữ report của mọi build, không chỉ build cuối.
- **`allowMissing: false`** — fail post step nếu không tìm thấy file (giúp catch lỗi).

### Cách generate snippet này nhanh

Jenkins có **Snippet Generator** (Pipeline Syntax helper):

1. Vào trang job (Configure) → cuộn xuống cuối → link **Pipeline Syntax**.
2. Trong dropdown **Sample Step**, chọn `publishHTML: Publish HTML reports`.
3. Điền form (reportDir, reportFiles...).
4. Click **Generate Pipeline Script** → copy snippet → paste vào Jenkinsfile.

→ Cực hữu ích khi không nhớ option của step. Bookmark URL `<jenkins>/pipeline-syntax`.

### Pitfall: Content Security Policy (CSP)

Lần đầu mở HTML report trong Jenkins → có thể thấy **trang trống**. Mở DevTools Console → có error:

```text
Refused to apply inline style because it violates the following Content
Security Policy directive: "default-src 'self'; ...style-src 'self';"
```

→ Jenkins set CSP **rất chặt** cho file workspace để tránh XSS (Cross-Site Scripting) attacks từ artifact độc hại.

**Fix tạm**: chạy script Groovy trong Jenkins Script Console (Manage Jenkins → Script Console):

```groovy
System.setProperty("hudson.model.DirectoryBrowserSupport.CSP", "")
```

→ Tắt CSP cho directory browse. **Cảnh báo**: chỉ làm với Jenkins local / sandbox. **Tuyệt đối không** làm với Jenkins production company-wide vì sẽ giảm an ninh.

Script này không persist — sau khi restart Jenkins phải chạy lại. Để persist, đặt trong file init.groovy.

> Best practice production: thay vì tắt CSP, hãy upload HTML report lên S3 / dedicated server và link đến từ Jenkins.

---

## Jenkinsfile sau bài 6 (dùng JUnit)

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            agent {
                docker {
                    image 'node:18-alpine'
                    reuseNode true
                }
            }
            steps {
                sh '''
                    set -euo pipefail
                    npm ci
                    npm run build
                '''
            }
        }
        stage('Test') {
            agent {
                docker {
                    image 'node:18-alpine'
                    reuseNode true
                }
            }
            steps {
                sh '''
                    set -euo pipefail
                    test -f build/index.html
                    CI=true npm test
                '''
            }
        }
    }
    post {
        always {
            junit 'test-results/junit.xml'
        }
    }
}
```

---

## Tóm tắt

- **JUnit XML** là format universal cho test report. Mọi test framework hiện đại đều có thể xuất.
- Cài `jest-junit` (cho React/Node) → cấu hình `package.json` → `npm test` tạo `test-results/junit.xml`.
- Trong Jenkinsfile: `post { always { junit 'path/to/junit.xml' } }`.
- Jenkins parse XML → hiển thị Test Result panel + Trend chart qua các build.
- **Comments**: `//` single-line, `/* */` multi-line trong Jenkinsfile. `#` trong shell scripts.
- Tạm comment stage để debug nhanh — nhưng đừng push code có stage bị comment.
- **HTML Publisher plugin** → `publishHTML(...)` để link report HTML. Snippet Generator tại `<jenkins>/pipeline-syntax`.
- HTML report có thể bị CSP block — tắt qua Script Console (chỉ local!).

---

→ [Bài tiếp theo: E2E test với Playwright](07-e2e-tests-voi-playwright.md)
