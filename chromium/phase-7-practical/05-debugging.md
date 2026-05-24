# Bài 5: Debugging WebUI và Mojo

## DevTools cho WebUI Pages

### Mở DevTools cho WebUI page

```
1. Trong Samsung Browser (development build):
   Right-click trên WebUI page → Inspect Element

2. Hoặc dùng remote debugging:
   chrome://inspect → Other → [tên page]

3. Hoặc command line:
   --remote-debugging-port=9222
   → Mở http://localhost:9222
```

### Điều cần check ngay khi có bug

```
1. Console tab → Errors, warnings
2. Network tab → Failed resource loads
3. Sources tab → Breakpoints trong Lit components
4. Elements tab → Inspect Shadow DOM
```

---

## Inspect Shadow DOM

DevTools có thể inspect Shadow DOM:

```
Elements panel → Tìm custom element
→ Expand "#shadow-root"
→ Xem DOM structure bên trong

Để force-select element trong shadow:
→ DevTools Settings → Elements → Show user agent shadow DOM
```

---

## Debug LitElement: Property Updates

```javascript
// Bật Lit DevTools extension (nếu có)
// Hoặc manual debugging:

// Trong component, thêm temporary logging
willUpdate(changedProperties) {
  console.log('[Debug] Changed:', Object.fromEntries(
    [...changedProperties.entries()].map(([k, v]) => [k, {
      old: v,
      new: this[k]
    }])
  ));
}

// Hoặc: xem tất cả property changes
updated(changedProperties) {
  changedProperties.forEach((oldValue, propName) => {
    console.log(`[Debug] ${propName}: ${oldValue} → ${this[propName]}`);
  });
}
```

---

## Debug Mojo Calls

### Logging Mojo calls

```javascript
// Wrap handler để log tất cả calls
function debugHandler(handler) {
  return new Proxy(handler, {
    get(target, prop) {
      const orig = target[prop];
      if (typeof orig !== 'function') return orig;
      return (...args) => {
        console.group(`[Mojo] ${String(prop)}`);
        console.log('Arguments:', args);
        const result = orig.apply(target, args);
        if (result?.then) {
          result.then(r => {
            console.log('Response:', r);
            console.groupEnd();
          }).catch(e => {
            console.error('Error:', e);
            console.groupEnd();
          });
        } else {
          console.groupEnd();
        }
        return result;
      };
    }
  });
}

// Dùng trong development:
constructor() {
  super();
  this.proxy_ = SamsungSettingsBrowserProxy.getInstance();
  if (DEBUG) {
    this.proxy_.handler = debugHandler(this.proxy_.handler);
  }
}
```

### Kiểm tra connection

```javascript
// Check xem Mojo pipe đã connected chưa
console.log('Handler bound:', this.proxy_.handler.$.isBound());

// Check connection error
this.proxy_.handler.$.setConnectionErrorHandler(() => {
  console.error('[Mojo] Connection to handler lost!');
  // Thử reconnect
});
```

---

## Common Bugs và Solutions

### Bug 1: Component không re-render sau Mojo callback

```javascript
// ❌ Sai: mutate array trực tiếp
this.items.push(newItem);  // LitElement không detect!

// ✅ Đúng
this.items = [...this.items, newItem];

// ❌ Sai: mutate object
this.settings.theme = 'dark';

// ✅ Đúng
this.settings = {...this.settings, theme: 'dark'};
```

### Bug 2: Mojo call fail silently

```javascript
// ❌ Sai: không handle rejection
async loadData() {
  const {data} = await this.handler.getData();
  this.data = data;
}

// ✅ Đúng
async loadData() {
  try {
    const {data} = await this.handler.getData();
    this.data = data;
  } catch (e) {
    // Mojo connection error, network error, etc.
    console.error('getData failed:', e);
    this.showError('Failed to load data');
  }
}
```

### Bug 3: Memory leak — quên cleanup listeners

```javascript
// ❌ Sai: đăng ký listener nhưng không cleanup
connectedCallback() {
  super.connectedCallback();
  this.proxy_.callbackRouter.onEvent.addListener(
      this.handleEvent.bind(this));
  // handleEvent.bind(this) tạo function mới mỗi lần!
  // Không thể remove vì không có reference
}

// ✅ Đúng
connectedCallback() {
  super.connectedCallback();
  this._listenerId = this.proxy_.callbackRouter.onEvent.addListener(
      this.handleEvent_.bind(this));
}

disconnectedCallback() {
  super.disconnectedCallback();
  this.proxy_.callbackRouter.removeListener(this._listenerId);
}
```

### Bug 4: Race condition trong async connectedCallback

```javascript
// ❌ Tiềm ẩn bug: component có thể bị disconnect trước khi await xong
async connectedCallback() {
  super.connectedCallback();
  const {data} = await this.proxy_.handler.getData();
  this.data = data;  // Bug: component đã bị remove!
}

// ✅ Đúng: check vẫn còn connected
async connectedCallback() {
  super.connectedCallback();
  const {data} = await this.proxy_.handler.getData();
  if (!this.isConnected) return;  // Guard
  this.data = data;
}
```

### Bug 5: Attribute vs Property binding

```javascript
// ❌ Sai: truyền array qua attribute
html`<my-list items="${JSON.stringify(this.items)}">`
// → items là JSON string, không phải Array

// ✅ Đúng: dùng property binding
html`<my-list .items=${this.items}>`
// → items là Array thực
```

### Bug 6: `this` context trong event handlers

```javascript
// ❌ Sai: 'this' là undefined trong strict mode
static styles = css`...`;

connectedCallback() {
  super.connectedCallback();
  document.addEventListener('keydown', function(e) {
    this.handleKey(e);  // 'this' là undefined!
  });
}

// ✅ Đúng: dùng arrow function hoặc bind
connectedCallback() {
  super.connectedCallback();
  this._keyHandler = (e) => this.handleKey(e);  // arrow function giữ this
  document.addEventListener('keydown', this._keyHandler);
}
```

---

## Chrome DevTools: Network tab với WebUI

WebUI resources không xuất hiện trong Network tab thông thường. Để xem:

```
1. Mở DevTools trước khi navigate
2. Network tab → Filter: "chrome://" 
3. Hoặc: Uncheck "Hide extension URLs" nếu có

Để xem Mojo traffic:
chrome://tracing → Record → chọn "mojo" category
→ Xem message passing timeline
```

---

## Debugging trong IDE

### VS Code với Chromium

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug WebUI",
      "url": "samsung://quick-settings",
      "webRoot": "${workspaceFolder}/samsung/browser/resources",
      "sourceMaps": true,
      "sourceMapPathOverrides": {
        "gen/*": "${workspaceFolder}/out/Default/*"
      }
    }
  ]
}
```

---

## Logging ở C++ side

```cpp
// Chromium dùng LOG() macros
LOG(INFO) << "SettingsHandler: GetSettings called";
LOG(WARNING) << "Theme not found: " << theme_name;
LOG(ERROR) << "Failed to load preferences";

// DLOG: chỉ log trong debug builds
DLOG(INFO) << "Debug: " << value;

// DCHECK: assertion trong debug builds
DCHECK(page_.is_bound()) << "Page remote not connected";
DCHECK_GT(font_size, 0) << "Invalid font size: " << font_size;

// Xem logs:
chrome --enable-logging=stderr --vmodule=settings_handler*=2
# → Logs ra terminal. Nếu chỉ dùng --enable-logging, logs thường vào chrome_debug.log.
```

---

## Checklist khi debug WebUI issue

```
□ Console errors? (JavaScript, CSP violations)
□ Network errors? (resource not found)
□ Mojo connection established? (handler.$.isBound())
□ Properties có reactive không? ({state: true} hoặc {type: ...})
□ Array/object được replace thay vì mutate?
□ Listeners có được cleanup trong disconnectedCallback?
□ Async functions có try-catch?
□ C++ DCHECK failures? (crash trong debug build)
□ Type mismatch giữa mojom và JS? (enum values, int64 as BigInt)
```

---

## Tài nguyên hữu ích

- **Lit Playground**: lit.dev/playground — Test Lit code không cần build
- **Mojo docs**: chromium.googlesource.com (tìm "mojo README")
- **Chromium testing docs**: chromium.org/developers/testing
- **Samsung Browser internal wiki**: (nội bộ)
