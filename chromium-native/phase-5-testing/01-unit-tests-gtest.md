# Bài 1: Unit Tests với gtest

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- gtest basics: `TEST(SuiteName, TestName)`, `TEST_F(FixtureName, TestName)`.
- gmock: `MOCK_METHOD`, `EXPECT_CALL`, matcher cơ bản.
- Test target trong BUILD.gn: `test("foo_unittests") { ... }`.
- Naming convention: `*_unittest.cc`, suite name CamelCase.
- Fixture pattern, SetUp/TearDown, common base fixture.
- Chromium-specific: `base::test::TaskEnvironment`, `content::BrowserTaskEnvironment`.

---

**Bài kế tiếp** → [Bài 2: Browser và Content Tests](02-browser-and-content-tests.md)
