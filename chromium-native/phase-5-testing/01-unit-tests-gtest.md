# Bài 1: Unit Tests với gtest

Bài này dạy:
- gtest basics: `TEST`, `TEST_F`, assertions.
- gmock: `MOCK_METHOD`, `EXPECT_CALL`, matchers.
- Test target trong `BUILD.gn`: `test("foo_unittests") { ... }`.
- Naming convention: `*_unittest.cc`, suite CamelCase.
- Fixture pattern, SetUp/TearDown.
- Chromium-specific: `base::test::TaskEnvironment`, `content::BrowserTaskEnvironment`.

Kết thúc bài: bạn viết được unit test, mock dependency với gmock, biết test thread-aware code, hiểu BUILD.gn cho test target.

Prerequisite: [cpp/phase-6/03-build-debug-sanitize](../../cpp/phase-6-concurrency-and-tooling/03-build-debug-sanitize.md) (build tooling), [Phase 2 base/](../phase-2-base-library/01-callbacks-and-bind.md) (callback, task).

## gtest basics

```cpp
#include "testing/gtest/include/gtest/gtest.h"

TEST(MathTest, Add) {
  EXPECT_EQ(2 + 2, 4);
}

TEST(MathTest, Multiply) {
  EXPECT_EQ(3 * 4, 12);
  EXPECT_GT(10, 5);
  EXPECT_TRUE(IsPrime(7));
}
```

`TEST(SuiteName, TestName)` defines test case. Filename: `math_unittest.cc`.

### Assertions

```cpp
// Equality
EXPECT_EQ(a, b);    // a == b
EXPECT_NE(a, b);    // a != b
EXPECT_LT(a, b);    // a < b
EXPECT_LE(a, b);
EXPECT_GT(a, b);
EXPECT_GE(a, b);

// Boolean
EXPECT_TRUE(condition);
EXPECT_FALSE(condition);

// String
EXPECT_STREQ(s1, s2);   // const char* equal
EXPECT_STRNE(s1, s2);

// Float (approximate)
EXPECT_FLOAT_EQ(a, b);
EXPECT_DOUBLE_EQ(a, b);
EXPECT_NEAR(a, b, abs_error);

// Custom message
EXPECT_EQ(x, 5) << "x should be 5, got " << x;
```

### `EXPECT_*` vs `ASSERT_*`

- `EXPECT_*` — log fail, continue test.
- `ASSERT_*` — log fail, **return from function** (test continues to next line normally).

Use `ASSERT_*` for preconditions; `EXPECT_*` for verifications:

```cpp
TEST(VectorTest, IndexAccess) {
  std::vector<int> v = {1, 2, 3};
  ASSERT_EQ(v.size(), 3u);   // If size != 3, no point continuing
  EXPECT_EQ(v[0], 1);
  EXPECT_EQ(v[1], 2);
  EXPECT_EQ(v[2], 3);
}
```

## Fixture (`TEST_F`)

For tests with shared setup:

```cpp
class CalculatorTest : public ::testing::Test {
 public:
  void SetUp() override {
    calc_.Reset();
  }

  void TearDown() override {
    // Cleanup if needed
  }

 protected:
  Calculator calc_;
};

TEST_F(CalculatorTest, AddPositive) {
  EXPECT_EQ(calc_.Add(2, 3), 5);
}

TEST_F(CalculatorTest, AddNegative) {
  EXPECT_EQ(calc_.Add(-2, -3), -5);
}
```

Each test creates fresh `CalculatorTest` object — fresh `calc_`.

`SetUp` runs before each test; `TearDown` after.

## gmock — mock objects

```cpp
#include "testing/gmock/include/gmock/gmock.h"

class IDatabase {
 public:
  virtual ~IDatabase() = default;
  virtual std::string Read(const std::string& key) = 0;
  virtual bool Write(const std::string& key, const std::string& value) = 0;
};

class MockDatabase : public IDatabase {
 public:
  MOCK_METHOD(std::string, Read, (const std::string& key), (override));
  MOCK_METHOD(bool, Write,
              (const std::string& key, const std::string& value), (override));
};
```

`MOCK_METHOD(return_type, name, (args), (qualifiers))` defines mocked method.

### `EXPECT_CALL`

```cpp
TEST(DatabaseConsumerTest, ReadCalled) {
  MockDatabase mock;
  EXPECT_CALL(mock, Read("key"))
      .WillOnce(::testing::Return("value"));

  DatabaseConsumer consumer(&mock);
  EXPECT_EQ(consumer.GetValue("key"), "value");
}
```

`EXPECT_CALL(mock, Method(args))` expects method called. `.WillOnce(...)` specify return.

### Matchers

```cpp
using ::testing::_;        // Any
using ::testing::Ne;       // Not equal
using ::testing::Gt;       // Greater than
using ::testing::Contains;
using ::testing::HasSubstr;
using ::testing::ElementsAre;

EXPECT_CALL(mock, Method(_));                          // Any arg
EXPECT_CALL(mock, Method(Ne(5)));                       // Not 5
EXPECT_CALL(mock, Method(Gt(10)));                      // > 10
EXPECT_CALL(mock, Method(HasSubstr("foo")));            // String contains "foo"
EXPECT_CALL(mock, Method(ElementsAre(1, 2, 3)));        // Vector elements
```

### Times

```cpp
EXPECT_CALL(mock, Read(_)).Times(3);                   // Called 3 times
EXPECT_CALL(mock, Read(_)).Times(::testing::AtLeast(1));
EXPECT_CALL(mock, Read(_)).Times(::testing::AnyNumber());
```

### Sequence

```cpp
using ::testing::InSequence;

{
  InSequence seq;
  EXPECT_CALL(mock, Open());
  EXPECT_CALL(mock, Read(_)).Times(::testing::AtLeast(1));
  EXPECT_CALL(mock, Close());
}
```

Enforce call order.

## Chromium-specific test helpers

### `base::test::TaskEnvironment`

Test code uses tasks (`PostTask`, callback). Need fake task scheduler.

```cpp
#include "base/test/task_environment.h"

class MyTest : public ::testing::Test {
 protected:
  base::test::TaskEnvironment task_environment_;
};

TEST_F(MyTest, AsyncWork) {
  bool done = false;
  base::ThreadPool::PostTask(
      FROM_HERE,
      base::BindOnce([](bool* done) { *done = true; }, &done));

  task_environment_.RunUntilIdle();   // Run all pending tasks

  EXPECT_TRUE(done);
}
```

`TaskEnvironment` provides:

- Fake ThreadPool.
- `RunUntilIdle` — run pending tasks.
- `FastForwardBy(time)` — simulate time passing.
- Time mocking.

```cpp
base::test::TaskEnvironment task_environment_(
    base::test::TaskEnvironment::TimeSource::MOCK_TIME);

// Simulate 5 seconds
task_environment_.FastForwardBy(base::Seconds(5));
```

### `content::BrowserTaskEnvironment`

For tests needing UI/IO thread:

```cpp
#include "content/public/test/browser_task_environment.h"

class MyContentTest : public ::testing::Test {
 protected:
  content::BrowserTaskEnvironment browser_task_environment_;
};

TEST_F(MyContentTest, IORequest) {
  // Post to IO thread, run, etc.
}
```

Provides emulated UI thread + IO thread + ThreadPool.

### TestBrowserContext

For tests needing BrowserContext:

```cpp
#include "content/public/test/test_browser_context.h"

content::TestBrowserContext browser_context_;
```

Or `TestingProfile` for chrome/ tests:

```cpp
#include "chrome/test/base/testing_profile.h"

TestingProfile profile_;
```

## BUILD.gn for tests

```python
# chrome/browser/foo/BUILD.gn

source_set("foo") {
  sources = [
    "foo_service.cc",
    "foo_service.h",
  ]
  deps = [ "//base", ... ]
}

source_set("unit_tests") {
  testonly = true
  sources = [
    "foo_service_unittest.cc",
  ]
  deps = [
    ":foo",
    "//base/test:test_support",
    "//testing/gmock",
    "//testing/gtest",
  ]
}
```

Then aggregate to test binary:

```python
# chrome/test/BUILD.gn or similar
test("chrome_unit_tests") {
  deps = [
    "//chrome/browser/foo:unit_tests",
    # ... other unittest source_sets
  ]
}
```

`testonly = true` ensures only test code depend.

### Naming

| Type | Pattern |
|---|---|
| Unit test file | `<feature>_unittest.cc` |
| Browser test file | `<feature>_browsertest.cc` |
| Mock | `mock_<class>.h/cc` |
| Test util | `<thing>_test_util.h/cc` |
| Test class | `<Class>Test` or `<Class>UnitTest` |

## Running tests

```bash
# Build
autoninja -C out/Debug chrome_unit_tests

# Run all
out/Debug/chrome_unit_tests

# Run specific
out/Debug/chrome_unit_tests --gtest_filter=CalculatorTest.AddPositive
out/Debug/chrome_unit_tests --gtest_filter=CalculatorTest.*    # All in suite
out/Debug/chrome_unit_tests --gtest_filter=*Add*              # Pattern

# Verbose
out/Debug/chrome_unit_tests --gtest_filter=Foo.* --v=1

# Repeat
out/Debug/chrome_unit_tests --gtest_repeat=10  # Detect flake

# Random order
out/Debug/chrome_unit_tests --gtest_shuffle
```

## Common patterns

### Setup mock with expectations

```cpp
TEST_F(FooServiceTest, FetchesData) {
  MockNetworkClient mock_network;
  FooService service(&mock_network);

  EXPECT_CALL(mock_network, Fetch(GURL("https://example.com")))
      .WillOnce(::testing::Return("response_data"));

  std::string result = service.GetData();
  EXPECT_EQ(result, "processed_response_data");
}
```

### Async callback in test

```cpp
TEST_F(FooServiceTest, AsyncFetch) {
  base::RunLoop run_loop;
  std::string result;

  service_.FetchAsync(
      base::BindLambdaForTesting([&](std::string data) {
        result = std::move(data);
        run_loop.Quit();
      }));

  run_loop.Run();   // Block until quit
  EXPECT_EQ(result, "expected");
}
```

`base::RunLoop` + `Quit` is standard async-to-sync pattern.

### `base::BindLambdaForTesting`

Allows lambda with capture in test (vs prod code prefer explicit binding):

```cpp
auto cb = base::BindLambdaForTesting([&captured](int x) {
  captured = x;
});
```

### Death test

```cpp
TEST(MyTest, CrashesOnNegative) {
  EXPECT_DEATH(ProcessValue(-1), "value must be non-negative");
}
```

Run subprocess, check crash + message. For testing `CHECK`/`NOTREACHED`.

### Parameterized test

```cpp
class FooParamTest : public ::testing::TestWithParam<int> {};

TEST_P(FooParamTest, Compute) {
  int input = GetParam();
  EXPECT_EQ(Compute(input), input * 2);
}

INSTANTIATE_TEST_SUITE_P(
    Various,
    FooParamTest,
    ::testing::Values(1, 2, 3, 4, 5));
```

Run same test với different parameter.

## Test fixture pattern for KeyedService

```cpp
class FooServiceTest : public ::testing::Test {
 public:
  FooServiceTest() = default;

  void SetUp() override {
    profile_ = std::make_unique<TestingProfile>();
    service_ = FooServiceFactory::GetForProfile(profile_.get());
  }

  void TearDown() override {
    service_ = nullptr;
    profile_.reset();
  }

 protected:
  content::BrowserTaskEnvironment task_environment_;
  std::unique_ptr<TestingProfile> profile_;
  FooService* service_ = nullptr;
};

TEST_F(FooServiceTest, Initial) {
  EXPECT_EQ(service_->GetState(), 0);
}
```

## Real example

```cpp
// chrome/browser/foo/foo_service_unittest.cc

#include "chrome/browser/foo/foo_service.h"

#include "base/test/task_environment.h"
#include "chrome/test/base/testing_profile.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "testing/gmock/include/gmock/gmock.h"

namespace foo {
namespace {

class FooServiceTest : public ::testing::Test {
 public:
  FooServiceTest() = default;
  ~FooServiceTest() override = default;

 protected:
  content::BrowserTaskEnvironment task_environment_;
  TestingProfile profile_;
};

TEST_F(FooServiceTest, InitialState) {
  FooService service(&profile_);
  EXPECT_FALSE(service.IsEnabled());
  EXPECT_EQ(service.GetCount(), 0);
}

TEST_F(FooServiceTest, EnableAndIncrement) {
  FooService service(&profile_);
  service.Enable();
  service.Increment();
  service.Increment();
  EXPECT_TRUE(service.IsEnabled());
  EXPECT_EQ(service.GetCount(), 2);
}

}  // namespace
}  // namespace foo
```

## Test coverage

- Happy path.
- Edge cases (empty, large, boundary values).
- Error cases.
- Concurrent / async cases.
- Regression (specific bug previously fixed).

Aim: each public method has ≥ 1 test. Branches covered.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Test depend on order | Flaky | `--gtest_shuffle`; SetUp/TearDown clean |
| Async test without RunLoop | Test pass before async work done | RunLoop + Quit |
| `EXPECT_*` after async | Race | Synchronize first |
| Memory leak in test | Test passes, ASan/leak detector fail | `unique_ptr` |
| Time-based test (real time) | Slow/flaky | Mock time via TaskEnvironment |
| Mock leak (Mock object outlive expectation) | Verify failed in dtor | `Mock::VerifyAndClearExpectations` |
| `*_unittest.cc` not listed in BUILD.gn | Test never runs | Add to source_set |
| Test depends on global state | Hidden coupling | Use TestingProfile / fresh env |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `TEST` | Standalone test |
| `TEST_F` | Test with fixture |
| `EXPECT_*` | Continue on fail |
| `ASSERT_*` | Return on fail |
| `gmock MOCK_METHOD` | Define mock |
| `EXPECT_CALL` | Set expectation on mock |
| `TaskEnvironment` | Fake task scheduler for unit test |
| `BrowserTaskEnvironment` | + UI/IO thread emulation |
| `TestingProfile` | Test-mode profile |
| `RunLoop` | Sync wait on async |
| `BindLambdaForTesting` | Lambda binding in test |

## Pattern

1. Fixture for shared state.
2. Mock dependencies.
3. `TaskEnvironment` for async.
4. Test happy path + edge cases.
5. Pass via `--gtest_filter` for fast iteration.

## Exercise (optional)

1. Find 1 `*_unittest.cc` trong chromium. Note structure.
2. Write a unit test for `FooService` từ Bài 1 phase 4.
3. Mock 1 interface. Use `EXPECT_CALL` to test behavior.
4. Add async test with `RunLoop` + `Quit`.

---

**Bài kế tiếp** → [Bài 2: Browser và Content Tests](02-browser-and-content-tests.md)
