# Bài 4: Testing WebUI — unit test, mock Mojo, browser test

Code chạy không = bug đang giấu. Bài này dạy cách test Polymer components + Mojo handlers trong Chromium WebUI:

- Unit tests cho components — mock BrowserProxy.
- Browser tests (end-to-end qua real browser).
- Snapshot testing cho UI.
- Best practices test naming, organization.

## Test types — pyramid

```text
        ┌───────────────────┐
        │  Browser tests    │  ← Slow, run với real browser
        │  (Selenium-like)   │
        └───────────────────┘
       ┌─────────────────────┐
       │  Integration tests   │  ← Component + real Mojo
       └─────────────────────┘
      ┌───────────────────────┐
      │   Unit tests          │  ← Fast, mock everything
      └───────────────────────┘
```

Đa số code: **unit tests** (90%). Browser tests cho critical paths (10%).

## Setup — Chromium test framework

Chromium dùng **Mocha-like** với assertion library riêng:

```typescript
suite('MyComponent', () => {
  let component: MyComponentElement;
  
  setup(async () => {
    // Trước mỗi test
    component = document.createElement('my-component') as MyComponentElement;
    document.body.appendChild(component);
    await component.updateComplete;
  });
  
  teardown(() => {
    // Sau mỗi test
    component.remove();
  });
  
  test('renders title', () => {
    const h1 = component.shadowRoot!.querySelector('h1');
    assertNotEquals(h1, null);
    assertEquals('Hello', h1!.textContent);
  });
  
  test('shows error on invalid input', async () => {
    component.value = '';
    await component.updateComplete;
    
    const error = component.shadowRoot!.querySelector('.error');
    assertNotEquals(error, null);
  });
});
```

API:
- `suite(name, fn)` — group of tests (= describe).
- `test(name, fn)` — single test (= it).
- `setup(fn)` / `teardown(fn)` — before/after each.
- `suiteSetup` / `suiteTeardown` — before/after entire suite.
- `assertEquals` / `assertTrue` / `assertNotEquals` / etc.

## Mock BrowserProxy — pattern chính

Component thường dùng `BrowserProxy.getInstance()`. Test:
1. Tạo mock proxy với expected returns.
2. `BrowserProxy.setInstance(mock)` trước test.
3. Verify proxy methods được gọi đúng.

```typescript
// test_browser_proxy.ts
import {BrowserProxy} from '../browser_proxy.js';

export class TestBrowserProxy {
  // Implement methods cần test
  handler = {
    getApps: () => Promise.resolve({
      apps: [
        {id: '1', name: 'Google', url: {url: 'https://google.com'}},
      ],
    }),
    addApp: (name: string, url: any) => Promise.resolve({
      success: true,
      newApp: {id: 'new-id', name, url, position: 0},
    }),
    deleteApp: (id: string) => Promise.resolve({success: true}),
  };
  
  callbackRouter = {
    onAppsChanged: {
      addListener: (fn: any) => {
        this.listeners.push(fn);
        return this.listeners.length - 1;
      },
      removeListener: (_: any) => {},
    },
    removeListener: (_: any) => {},
  };
  
  private listeners: Array<(apps: any[]) => void> = [];
  
  // Helper: simulate push từ C++
  simulateAppsChanged(apps: any[]) {
    this.listeners.forEach(fn => fn(apps));
  }
  
  // Track calls để verify
  callCount = new Map<string, number>();
  trackCall(method: string) {
    this.callCount.set(method, (this.callCount.get(method) || 0) + 1);
  }
}
```

Sử dụng:

```typescript
import {BrowserProxy} from '../browser_proxy.js';
import {TestBrowserProxy} from './test_browser_proxy.js';
import {QuickLauncherAppElement} from '../quick_launcher.js';

suite('QuickLauncherApp', () => {
  let proxy: TestBrowserProxy;
  let app: QuickLauncherAppElement;
  
  setup(async () => {
    proxy = new TestBrowserProxy();
    BrowserProxy.setInstance(proxy as any);  // Inject mock
    
    app = document.createElement('quick-launcher-app') as QuickLauncherAppElement;
    document.body.appendChild(app);
    await app.updateComplete;
    
    // Wait for initial load
    await flushTasks();
  });
  
  teardown(() => {
    app.remove();
  });
  
  test('loads apps on connect', () => {
    const cards = app.shadowRoot!.querySelectorAll('.app-card');
    assertEquals(1, cards.length);
    
    const name = cards[0].querySelector('.app-name');
    assertEquals('Google', name!.textContent);
  });
  
  test('add button opens dialog', async () => {
    const addButton = app.shadowRoot!.querySelector('cr-button.action-button')!;
    addButton.dispatchEvent(new MouseEvent('click'));
    await app.updateComplete;
    
    const dialog = app.shadowRoot!.querySelector('cr-dialog');
    assertTrue(dialog!.hasAttribute('open'));
  });
  
  test('simulating C++ push updates UI', async () => {
    proxy.simulateAppsChanged([
      {id: '1', name: 'Google', url: {url: 'https://google.com'}},
      {id: '2', name: 'GitHub', url: {url: 'https://github.com'}},
    ]);
    await app.updateComplete;
    
    const cards = app.shadowRoot!.querySelectorAll('.app-card');
    assertEquals(2, cards.length);
  });
});
```

`flushTasks()` helper:

```typescript
function flushTasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
```

## Test event handling

```typescript
test('clicking app launches it', () => {
  let launchedId: string|null = null;
  proxy.handler.launchApp = (id: string) => {
    launchedId = id;
    return Promise.resolve();
  };
  
  const card = app.shadowRoot!.querySelector('.app-card')!;
  card.dispatchEvent(new MouseEvent('click'));
  
  assertEquals('1', launchedId);
});

test('add app dispatches mojo call', async () => {
  let addedName: string|null = null;
  proxy.handler.addApp = (name: string, url: any) => {
    addedName = name;
    return Promise.resolve({success: true, newApp: {/* ... */}});
  };
  
  // Open dialog
  app.shadowRoot!.querySelector<HTMLElement>('.action-button')!.click();
  await app.updateComplete;
  
  // Fill form
  const nameInput = app.shadowRoot!.querySelector('cr-input#nameInput') as any;
  nameInput.value = 'Test App';
  const urlInput = app.shadowRoot!.querySelector('cr-input#urlInput') as any;
  urlInput.value = 'https://test.com';
  await app.updateComplete;
  
  // Submit
  const submitButton = app.shadowRoot!.querySelectorAll('cr-button')[1] as HTMLElement;
  submitButton.click();
  await flushTasks();
  
  assertEquals('Test App', addedName);
});
```

## Test computed properties

```typescript
test('isEmpty_ computed correctly', async () => {
  app.apps_ = [];
  await app.updateComplete;
  assertTrue(app.isEmpty_);
  
  app.apps_ = [{id: '1', name: 'X', url: {url: 'http://x.com'}, position: 0}];
  await app.updateComplete;
  assertFalse(app.isEmpty_);
});
```

## Test observers

```typescript
test('observer fire on property change', async () => {
  let observerCalls = 0;
  const original = (app as any).onAppsChanged_;
  (app as any).onAppsChanged_ = function(...args: any[]) {
    observerCalls++;
    return original.apply(this, args);
  };
  
  app.apps_ = [/* new array */];
  await app.updateComplete;
  
  assertEquals(1, observerCalls);
});
```

## Test i18n

I18nMixin uses `loadTimeData`. Mock trong tests:

```typescript
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

suite('i18n', () => {
  suiteSetup(() => {
    // Inject test strings
    loadTimeData.data = {
      ...loadTimeData.data,
      pageTitle: 'Test Title',
      addButton: 'Add Test',
      // ...
    };
  });
  
  test('renders translated title', () => {
    const h1 = app.shadowRoot!.querySelector('h1');
    assertEquals('Test Title', h1!.textContent);
  });
});
```

## Test async — Promise handling

```typescript
test('shows error when load fails', async () => {
  proxy.handler.getApps = () => Promise.reject(new Error('Network error'));
  
  app = document.createElement('quick-launcher-app') as any;
  document.body.appendChild(app);
  await app.updateComplete;
  await flushTasks();
  
  // Verify error UI shown
  // (Component cần handle error trong loadApps_)
});
```

## Browser tests — end-to-end

Browser tests chạy với **real browser** instance. Phức tạp hơn, slower nhưng test integration thật.

```cpp
// quick_launcher_browsertest.cc
#include "samsung/common/samsung_url_constants.h"
#include "chrome/test/base/in_process_browser_test.h"
#include "content/public/test/browser_test.h"
#include "content/public/test/test_navigation_observer.h"

class QuickLauncherBrowserTest : public InProcessBrowserTest {};

IN_PROC_BROWSER_TEST_F(QuickLauncherBrowserTest, LoadPage) {
  GURL url(samsung::kSamsungQuickLauncherURL);
  ASSERT_TRUE(ui_test_utils::NavigateToURL(browser(), url));
  
  content::WebContents* contents = 
      browser()->tab_strip_model()->GetActiveWebContents();
  
  // Verify page loaded
  EXPECT_EQ(url, contents->GetLastCommittedURL());
  
  // Execute JS to verify component rendered
  std::string title = content::EvalJs(
      contents,
      "document.querySelector('quick-launcher-app')"
      "  .shadowRoot.querySelector('h1').textContent").ExtractString();
  EXPECT_EQ("Quick Launcher", title);
}

IN_PROC_BROWSER_TEST_F(QuickLauncherBrowserTest, AddApp) {
  GURL url(samsung::kSamsungQuickLauncherURL);
  ASSERT_TRUE(ui_test_utils::NavigateToURL(browser(), url));
  
  content::WebContents* contents = 
      browser()->tab_strip_model()->GetActiveWebContents();
  
  // Click "Add" button via JS
  content::EvalJs(contents, R"(
    document.querySelector('quick-launcher-app')
      .shadowRoot.querySelector('.action-button').click();
  )");
  
  // Verify dialog opened
  bool dialogOpen = content::EvalJs(contents, R"(
    document.querySelector('quick-launcher-app')
      .shadowRoot.querySelector('cr-dialog').open
  )").ExtractBool();
  EXPECT_TRUE(dialogOpen);
}
```

Run:

```bash
out/Default/browser_tests --gtest_filter="QuickLauncherBrowserTest*"
```

## Snapshot testing

Capture DOM/style snapshot, compare:

```typescript
test('matches snapshot', async () => {
  const html = app.shadowRoot!.innerHTML;
  // Compare với stored snapshot
  expect(html).toMatchSnapshot();
});
```

Chromium ít dùng snapshot testing. Phổ biến hơn là explicit assertions.

## Common test utilities

```typescript
// chrome/test/data/webui/test_util.ts
export function fakeMethod() { /* ... */ }
export function eventToPromise(eventName: string, target: EventTarget): Promise<Event>;
export function flushTasks(): Promise<void>;
export function waitAfterNextRender(target: HTMLElement): Promise<void>;
```

Pattern phổ biến:

```typescript
test('button click triggers event', async () => {
  const promise = eventToPromise('app-added', app);
  
  // Trigger
  app.shadowRoot!.querySelector('.action-button')!.click();
  
  // Wait + assert event fired
  const event = await promise as CustomEvent;
  assertEquals('Google', event.detail.name);
});
```

## Test naming convention

```typescript
suite('QuickLauncherApp', () => {
  suite('loading state', () => {
    test('shows spinner while loading', () => {});
    test('hides spinner after load', () => {});
  });
  
  suite('add flow', () => {
    test('opens dialog on add button click', () => {});
    test('disables submit if form invalid', () => {});
    test('closes dialog after submit', () => {});
    test('shows error if submit fails', () => {});
  });
});
```

→ Nested `suite` cho group related tests.

## Running tests

```bash
# Unit tests (run trong browser_tests harness)
out/Default/browser_tests --gtest_filter="WebUIMochaBrowserTest.QuickLauncher*"

# Browser tests
out/Default/browser_tests --gtest_filter="QuickLauncherBrowserTest*"

# Single test
out/Default/browser_tests --gtest_filter="*.AddApp"

# With logging
out/Default/browser_tests --gtest_filter="*Quick*" --enable-logging --vmodule="quick_launcher*=2"
```

## Coverage report

```bash
# Build with coverage
gn args out/Coverage
# In args:
#   is_component_build = false
#   use_clang_coverage = true

ninja -C out/Coverage browser_tests
# Run tests
LLVM_PROFILE_FILE="cov/%p.profraw" out/Coverage/browser_tests ...

# Generate report
llvm-cov show out/Coverage/browser_tests \
    -instr-profile=cov.profdata \
    -format=html > coverage.html
```

## Best practices

### 1. Test the user behavior, không implementation

```typescript
// SAI - test private method
test('_computeIsEmpty returns true for empty array', () => {
  assertEquals(true, (app as any)._computeIsEmpty(0));
});

// ĐÚNG - test visible behavior
test('shows empty state when no apps', async () => {
  app.apps_ = [];
  await app.updateComplete;
  const empty = app.shadowRoot!.querySelector('.empty');
  assertNotEquals(empty, null);
});
```

### 2. One assertion per test (mostly)

```typescript
// SAI - hard to debug
test('renders correctly', () => {
  assertEquals('Title', getTitle());
  assertEquals(2, getButtons().length);
  assertTrue(isEnabled());
  // Nếu fail, không biết cái nào fail
});

// ĐÚNG - separate tests
test('renders title', () => { assertEquals('Title', getTitle()); });
test('has 2 buttons', () => { assertEquals(2, getButtons().length); });
test('is enabled by default', () => { assertTrue(isEnabled()); });
```

### 3. Setup/teardown clean

```typescript
setup(() => {
  proxy = new TestBrowserProxy();
  BrowserProxy.setInstance(proxy);
});

teardown(() => {
  BrowserProxy.setInstance(null as any);  // Reset
});
```

### 4. Async test phải `await` updateComplete

```typescript
// SAI - test có thể fail vì DOM chưa update
test('shows value', () => {
  app.value = 'New';
  const span = app.shadowRoot!.querySelector('span');
  assertEquals('New', span.textContent);  // Có thể fail!
});

// ĐÚNG
test('shows value', async () => {
  app.value = 'New';
  await app.updateComplete;
  const span = app.shadowRoot!.querySelector('span');
  assertEquals('New', span!.textContent);
});
```

### 5. Mock at boundary, không internal

```typescript
// SAI - mock internal method
test('handles save', () => {
  app._saveToBackend = sinon.spy();  // ← internal!
  ...
});

// ĐÚNG - mock BrowserProxy (boundary)
test('handles save', () => {
  proxy.handler.save = sinon.spy();
  ...
});
```

## Bẫy thường gặp

| Bẫy | Cách tránh |
|---|---|
| Quên `await updateComplete` | DOM stale, test flaky |
| Test order-dependent | Cleanup trong `teardown` |
| Mock không khớp interface thật | TypeScript types để catch |
| Test private method | Test public behavior |
| Forget reset singleton | `BrowserProxy.setInstance(null)` trong teardown |
| Hard-code timing | Dùng `eventToPromise`, không `setTimeout` |

## Tóm tắt bài 4

- **Unit tests**: mock BrowserProxy, test component behavior in isolation.
- **Browser tests** (C++): integration với real browser.
- Mock `BrowserProxy` qua `setInstance` injection.
- Test patterns: setup/teardown, `await updateComplete`, dispatch events, assert DOM.
- `loadTimeData.data` override cho i18n testing.
- Best practice: test user behavior, không implementation.

**Bài kế tiếp** → [Bài 5: Debugging WebUI và Mojo](05-debugging.md)
