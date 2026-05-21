# Bài 2: Browser và Content Tests

Bài này dạy:
- `InProcessBrowserTest`: tests chạy in-process với real Chrome.
- `ContentBrowserTest`: lighter, không full chrome/.
- `*_browsertest.cc` naming.
- `EmbeddedTestServer`: serve test files.
- Headless mode, when to use.
- Khi nào unit test, khi nào browser test (rule of thumb).

Kết thúc bài: bạn biết khi nào browser test phù hợp, viết được browser test với real navigation, serve test page với EmbeddedTestServer.

Prerequisite: [Bài 1: Unit Tests](01-unit-tests-gtest.md), [chromium/phase-7/04-testing-webui](../../chromium/phase-7-practical/04-testing-webui.md).

## Browser test vs Unit test

| Aspect | Unit test | Browser test |
|---|---|---|
| Speed | Fast (ms) | Slow (sec to minutes) |
| Scope | Single class/function | Full browser process |
| Setup | Mock dependencies | Real Chrome with real services |
| Real browser? | No | Yes |
| Navigate URL? | No | Yes |
| JavaScript run? | No | Yes |
| Use case | Logic correctness | End-to-end integration |

→ **Default: unit test**. Browser test cho integration scenarios khó simulate trong unit.

## `InProcessBrowserTest` — chrome browser test

Run actual Chrome in-process (test binary IS Chrome).

```cpp
#include "chrome/test/base/in_process_browser_test.h"
#include "chrome/browser/ui/browser.h"

class MyBrowserTest : public InProcessBrowserTest {
 public:
  MyBrowserTest() = default;
  ~MyBrowserTest() override = default;
};

IN_PROC_BROWSER_TEST_F(MyBrowserTest, NavigateAndCheck) {
  GURL url("https://example.com");

  // Navigate
  ASSERT_TRUE(content::NavigateToURL(
      browser()->tab_strip_model()->GetActiveWebContents(),
      url));

  // Check
  EXPECT_EQ(browser()->tab_strip_model()->count(), 1);
}
```

`IN_PROC_BROWSER_TEST_F(Fixture, TestName)` (not `TEST_F`!) — register as browser test.

### `browser()`, `web_contents()`

Helper methods:

```cpp
Browser* browser_ = browser();
TabStripModel* tabs = browser_->tab_strip_model();
content::WebContents* wc = tabs->GetActiveWebContents();
```

### Pattern

```cpp
IN_PROC_BROWSER_TEST_F(MyTest, DoSomething) {
  // Setup
  ui_test_utils::NavigateToURL(browser(), embedded_test_server()->GetURL("/test.html"));
  content::WebContents* wc = browser()->tab_strip_model()->GetActiveWebContents();

  // Trigger action
  ASSERT_TRUE(content::ExecJs(wc, "doSomething()"));

  // Assert
  std::string result = content::EvalJs(wc, "getResult()").ExtractString();
  EXPECT_EQ(result, "expected");
}
```

## `ContentBrowserTest` — lighter

Without chrome/ (no Chrome UI, no tabs). Just `content::Shell` minimal wrapper.

```cpp
#include "content/public/test/content_browser_test.h"

class MyContentTest : public content::ContentBrowserTest {
 public:
  MyContentTest() = default;
};

IN_PROC_BROWSER_TEST_F(MyContentTest, Navigate) {
  GURL url = embedded_test_server()->GetURL("/test.html");
  ASSERT_TRUE(content::NavigateToURL(shell(), url));
}
```

`shell()` = `Shell*` (content shell window).

**Use case**: testing content layer features (navigation, IPC) without chrome dependencies.

## Embedded Test Server

Serves files for test. Lifetime: per-test.

```cpp
class MyBrowserTest : public InProcessBrowserTest {
 public:
  void SetUpOnMainThread() override {
    InProcessBrowserTest::SetUpOnMainThread();
    embedded_test_server()->ServeFilesFromDirectory(
        net::test::GetTestDataPath("my_feature"));
    ASSERT_TRUE(embedded_test_server()->Start());
  }
};

IN_PROC_BROWSER_TEST_F(MyBrowserTest, LoadPage) {
  GURL url = embedded_test_server()->GetURL("/test.html");
  ASSERT_TRUE(content::NavigateToURL(
      browser()->tab_strip_model()->GetActiveWebContents(), url));
}
```

`embedded_test_server()` serves files from local directory at `http://127.0.0.1:<port>/`.

Files stored typically trong `chrome/test/data/` or `content/test/data/`.

## Custom test setup

```cpp
class MyTest : public InProcessBrowserTest {
 public:
  // Called once for whole test class
  static void SetUpTestSuite() {
    // ...
  }

  // Called before each test, before browser created
  void SetUp() override {
    // ...
    InProcessBrowserTest::SetUp();
  }

  // Called before each test, after browser created (browser() works here)
  void SetUpOnMainThread() override {
    InProcessBrowserTest::SetUpOnMainThread();
    ASSERT_TRUE(embedded_test_server()->Start());
  }

  // Called after each test
  void TearDownOnMainThread() override {
    // Cleanup
    InProcessBrowserTest::TearDownOnMainThread();
  }
};
```

## Helper functions for browser test

### Navigation

```cpp
// Navigate + wait for load
content::NavigateToURL(web_contents, url);

// Older API
ui_test_utils::NavigateToURL(browser(), url);

// Open new tab + navigate
ui_test_utils::NavigateToURLWithDisposition(
    browser(), url, WindowOpenDisposition::NEW_FOREGROUND_TAB, ...);
```

### JS execution

```cpp
// Execute JS
content::ExecJs(web_contents, "doSomething()");

// Evaluate + get result
content::EvalJsResult result = content::EvalJs(web_contents, "getValue()");
std::string s = result.ExtractString();
int n = result.ExtractInt();
bool b = result.ExtractBool();

// With await (async)
content::EvalJs(web_contents, R"((async () => {
  const data = await fetch('/api');
  return data.json();
})())");
```

### Wait

```cpp
// Wait for condition (poll)
ASSERT_TRUE(base::test::RunUntil([&]() {
  return some_condition;
}));

// Wait for navigation to finish
content::TestNavigationObserver nav_observer(web_contents, /*expected=*/1);
// ... trigger navigation ...
nav_observer.Wait();
```

## Headless mode

Browser tests typically run **headless** trên bot:

```bash
out/Debug/browser_tests --headless --gtest_filter=MyTest.*
```

Same code, no UI render. Faster on bots.

## When unit test vs browser test?

| Question | Test |
|---|---|
| Single class logic | Unit |
| Multiple class interaction | Unit (with mocks) or browser |
| Real UI interaction | Browser |
| Real navigation, JS execution | Browser |
| Network behavior | Browser (with EmbeddedTestServer) |
| Threading model | Unit (with TaskEnvironment) hoặc browser |
| Mojo interface across process | Browser |
| Performance | Browser (or specialized perf test) |

**Rule of thumb**:

- Default unit.
- Browser if real browser context needed.

## BUILD.gn cho browser test

```python
source_set("browser_tests") {
  testonly = true
  sources = [
    "my_feature_browsertest.cc",
  ]
  deps = [
    ":my_feature",
    "//chrome/test:test_support",
    "//chrome/test:test_support_ui",
    "//content/test:test_support",
    "//testing/gtest",
  ]
}
```

Aggregated to:

```python
test("browser_tests") {
  deps = [
    "//chrome/browser/foo:browser_tests",
    # ... other browser test source_sets
  ]
}
```

## Running browser tests

```bash
autoninja -C out/Debug browser_tests
out/Debug/browser_tests --gtest_filter=MyTest.*
```

Each test launches Chrome. **Slow** — 5-30 seconds per test.

Run in parallel (bot does):

```bash
out/Debug/browser_tests --test-launcher-jobs=4 --gtest_filter=MyTest.*
```

## Test data

Test files (HTML, JS) stored:

```text
chrome/test/data/
├── my_feature/
│   ├── test.html
│   └── helper.js
└── ...

content/test/data/
├── navigation/
│   └── ...
```

In test:

```cpp
embedded_test_server()->ServeFilesFromDirectory(
    net::test::GetTestDataPath("my_feature"));
```

## Real example

```cpp
// chrome/browser/foo/foo_browsertest.cc

#include "chrome/browser/foo/foo_service.h"
#include "chrome/browser/foo/foo_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/test/base/in_process_browser_test.h"
#include "content/public/browser/web_contents.h"
#include "content/public/test/browser_test.h"
#include "content/public/test/browser_test_utils.h"
#include "net/dns/mock_host_resolver.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace {

class FooBrowserTest : public InProcessBrowserTest {
 public:
  FooBrowserTest() = default;

  void SetUpOnMainThread() override {
    InProcessBrowserTest::SetUpOnMainThread();
    host_resolver()->AddRule("*", "127.0.0.1");
    ASSERT_TRUE(embedded_test_server()->Start());
  }
};

IN_PROC_BROWSER_TEST_F(FooBrowserTest, ServiceTriggersOnNavigation) {
  GURL url = embedded_test_server()->GetURL("/title1.html");
  content::WebContents* wc = browser()->tab_strip_model()->GetActiveWebContents();

  ASSERT_TRUE(content::NavigateToURL(wc, url));

  FooService* service = FooServiceFactory::GetForProfile(browser()->profile());
  EXPECT_GT(service->GetNavigationCount(), 0);
}

IN_PROC_BROWSER_TEST_F(FooBrowserTest, ServiceUpdatesOnUserAction) {
  GURL url = embedded_test_server()->GetURL("/foo_test.html");
  content::WebContents* wc = browser()->tab_strip_model()->GetActiveWebContents();
  ASSERT_TRUE(content::NavigateToURL(wc, url));

  // Trigger via JS
  ASSERT_TRUE(content::ExecJs(wc, "document.getElementById('btn').click()"));

  FooService* service = FooServiceFactory::GetForProfile(browser()->profile());
  EXPECT_TRUE(service->IsActive());
}

}  // namespace
```

## Best practices

1. **Prefer unit tests**. Browser test slower.
2. **Avoid sleeps**. Use `Wait` helpers / observers.
3. **Use observers** for async event detection.
4. **`ASSERT_*` for prerequisites** (e.g., navigation succeed).
5. **`EXPECT_*` for behavior** (post-state check).
6. **Each test independent** (SetUp/TearDown).
7. **Use real-world URLs sparingly** — EmbeddedTestServer for control.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Sleep instead of wait | Flaky | Use observer / poll |
| External URL in test | Flake / slow | EmbeddedTestServer |
| Test depend on internet | Bot fail | EmbeddedTestServer |
| Forget `host_resolver()->AddRule("*", "127.0.0.1")` | Real DNS lookup | Mock resolver |
| ExecJs run on wrong frame | Wrong state | `EvalJs(rfh, ...)` for specific frame |
| Assume timing | Flake | Wait for actual signal |
| Forget `embedded_test_server()->Start()` | URL gen fails | Start in SetUpOnMainThread |
| Race in fixture setup | Hang | Synchronize properly |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `InProcessBrowserTest` | Full Chrome browser test |
| `ContentBrowserTest` | Lighter, no chrome/ |
| `IN_PROC_BROWSER_TEST_F` | Register macro |
| `browser()` | Browser instance |
| `embedded_test_server()` | Local HTTP server for test files |
| `content::NavigateToURL` | Navigate + wait |
| `content::ExecJs`, `EvalJs` | Run/evaluate JS |
| `host_resolver()->AddRule` | Mock DNS |
| Headless | Bot mode |

## Khi nào dùng cái nào — recap

```text
┌─────────────────────────────────────────────────┐
│ Test logic of 1 class? → Unit test               │
│ Multiple classes, can mock? → Unit test           │
│ Test threading? → Unit test with TaskEnvironment  │
│ Test real UI? → Browser test                      │
│ Test real navigation? → Browser test              │
│ Test JavaScript interaction? → Browser test       │
│ Test cross-process? → Browser test                │
└─────────────────────────────────────────────────┘
```

## Exercise (optional)

1. Find 1 browser test (`*_browsertest.cc`). Note structure.
2. Write a browser test: navigate to test page, verify navigation count incremented.
3. Use `ExecJs` to trigger action, `EvalJs` to read state.
4. Compare run time: unit test (~ms) vs same logic browser test (~seconds).

---

**Course kết thúc.** 🎉

Quay về [README](../README.md) hoặc tham khảo [chromium/phase-7-practical](../../chromium/phase-7-practical/01-reading-source.md) để áp dụng vào project thực tế.

Bạn đã hoàn thành cả 3 course:

- ✅ [chromium/](../../chromium/README.md) — Samsung Browser WebUI (Polymer, LitElement, WebUI framework, Mojo)
- ✅ [cpp/](../../cpp/README.md) — C++ Foundation (modern C++17/20, RAII, STL, concurrency)
- ✅ [chromium-native/](../README.md) — Native Chromium development (base/, content/, services, testing)
