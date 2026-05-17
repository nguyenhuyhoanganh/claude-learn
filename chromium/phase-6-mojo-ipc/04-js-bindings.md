# Bài 4: JavaScript Mojo Bindings chi tiết

## Generated File: `.mojom-webui.js`

Khi build, từ `foo.mojom`, Chromium generate ra `foo.mojom-webui.js`. File này chứa tất cả JS bindings.

Ví dụ mojom:
```mojom
module example.mojom;

enum Color { kRed, kGreen, kBlue };

struct Point {
  int32 x;
  int32 y;
};

interface Canvas {
  DrawPoint(Point point, Color color);
  GetPixel(Point point) => (Color color);
};
```

Generated JS (simplified):
```javascript
// example.mojom-webui.js

// Enum
export const Color = {
  MIN_VALUE: 0, MAX_VALUE: 2,
  kRed: 0, kGreen: 1, kBlue: 2,
};

// Struct — plain JS object (no class needed)
// Structs trong Mojo JS chỉ là objects với field tương ứng

// Remote class (JS calls C++)
export class CanvasRemote {
  constructor() {
    this.$ = new mojo.internal.interfaceSupport.InterfaceRemoteBase(
        CanvasRemote,
        "example.mojom.Canvas");
    // ... internal setup
  }

  // Methods (async, return Promise)
  drawPoint(point, color) {
    return this.$.sendMessage_(
        0 /* ordinal */,
        Canvas_DrawPoint_Params,
        null,
        [point, color]
    );
  }

  getPixel(point) {
    return this.$.sendMessage_(
        1 /* ordinal */,
        Canvas_GetPixel_Params,
        Canvas_GetPixel_ResponseParams,
        [point]
    );
    // Trả Promise<{color: Color}>
  }
}

// Receiver class (C++ calls JS — JS implements interface)
export class CanvasReceiver {
  constructor(impl) {
    // impl là object với methods drawPoint, getPixel
  }
}

// CallbackRouter (C++ calls JS — event-based)
export class CanvasCallbackRouter {
  constructor() {
    this.drawPoint = new mojo.internal.interfaceSupport.InterfaceCallbackReceiver(...);
    this.getPixel = new mojo.internal.interfaceSupport.InterfaceCallbackReceiver(...);
  }
}
```

---

## Naming Convention: mojom → JavaScript

| Mojom | JavaScript |
|-------|-----------|
| `DrawPoint` (method) | `drawPoint` |
| `get_pixel` | `getPixel` |
| `Color::kRed` | `Color.kRed` |
| `Point { int32 x }` | `{x: 42}` |
| `is_enabled` (field) | `isEnabled` |
| `tab_id` | `tabId` |
| `FooInterface` | `FooRemote`, `FooReceiver`, `FooCallbackRouter` |

Rule: snake_case → camelCase, PascalCase giữ nguyên.

---

## Làm việc với Structs

```javascript
// Mojom struct tự động là plain JS object trong JS bindings
// Không cần 'new Point()'

// Khi gọi method:
const point = {x: 100, y: 200};        // Plain object
const color = Color.kRed;               // Enum value

await canvasRemote.drawPoint(point, color);

// Khi nhận response:
const {color: pixelColor} = await canvasRemote.getPixel({x: 50, y: 50});
// pixelColor là số (Color enum)
console.log(pixelColor === Color.kBlue); // true/false
```

---

## Làm việc với Arrays

```javascript
// Mojom: array<TabInfo> tabs
// JS:    tabs là Array bình thường

const {tabs} = await handler.getTabs();

// Làm việc bình thường
tabs.forEach(tab => {
  console.log(tab.title, tab.url);
});

const activeTab = tabs.find(t => t.isActive);

// Khi gửi array sang C++
const tabIds = [1, 2, 3];
await handler.closeTabs(tabIds);
```

---

## Làm việc với Enums

```javascript
import {ThemeType, FontSize} from './settings.mojom-webui.js';

// Dùng enum value
await handler.setTheme(ThemeType.kDark);
await handler.setFontSize(FontSize.kLarge);

// So sánh
const {settings} = await handler.getSettings();
if (settings.theme === ThemeType.kDark) {
  applyDarkMode();
}

// Switch statement
switch (settings.theme) {
  case ThemeType.kLight:
    applyLight();
    break;
  case ThemeType.kDark:
    applyDark();
    break;
  case ThemeType.kAuto:
    applySystem();
    break;
}
```

---

## Làm việc với Nullable Types

```javascript
// Mojom: string? optional_name
// JS: optional_name có thể là null hoặc undefined

const {name} = await handler.getOptionalName();

if (name !== null) {
  displayName(name);
} else {
  displayPlaceholder();
}

// Pattern phổ biến với optional chaining
const displayText = name ?? 'Unknown User';
```

---

## Int64 và BigInt — Cẩn thận!

```javascript
// Mojom: int64 timestamp
// JS: BigInt (vì Number không đủ chính xác cho 64-bit)

const {timestamp} = await handler.getTimestamp();
// timestamp là BigInt!
console.log(typeof timestamp); // "bigint"

// Phải convert để dùng với số thông thường
const date = new Date(Number(timestamp)); // Mất precision nếu > 2^53

// Phép tính với BigInt:
const future = timestamp + 1000n; // Dùng n suffix

// So sánh
if (timestamp > 1000000000000n) { ... }

// Pattern thực tế trong Chromium: timestamp thường là milliseconds
// dùng Number() vì không cần precision quá cao
```

---

## Pending Remote/Receiver trong JS

```javascript
// Khi mojom có: pending_remote<Observer> observer

// Tạo observer implementation
const observerImpl = {
  onEvent: (data) => { handleEvent(data); }
};

// Bọc trong Receiver
const observerReceiver = new ObserverReceiver(observerImpl);

// Lấy PendingRemote để gửi sang C++
const pendingRemote = observerReceiver.$.bindNewPipeAndPassRemote();

// Gửi sang C++
await handler.addObserver(pendingRemote);
```

---

## Xử lý Disconnect

```javascript
class BrowserProxy {
  constructor() {
    this.handler = new PageHandlerRemote();
    const receiver = this.handler.$.bindNewPipeAndPassReceiver();

    // Khi connection bị đóng (C++ side crash, page reload...)
    this.handler.$.setConnectionErrorHandler(() => {
      console.warn('Page handler connection lost');
      // Reset và reconnect nếu cần
      this.reconnect();
    });
  }

  reconnect() {
    // Tạo lại connection
    // ...
  }
}
```

---

## Debug Mojo calls trong DevTools

```javascript
// Enable Mojo logging (development builds)
// chrome://tracing → Mojo category

// Trong code, bạn có thể log mọi call:
class DebuggingProxy {
  constructor(realProxy) {
    this.handler = new Proxy(realProxy.handler, {
      get(target, prop) {
        if (typeof target[prop] === 'function') {
          return (...args) => {
            console.log(`[Mojo] ${prop}(`, ...args, ')');
            const result = target[prop](...args);
            result.then(r => console.log(`[Mojo] ${prop} →`, r));
            return result;
          };
        }
        return target[prop];
      }
    });
  }
}

// Trong development:
if (DEBUG) {
  BrowserProxy.setInstance(new DebuggingProxy(new BrowserProxy()));
}
```

---

## Complete Example: Putting it all together

```javascript
// samsung_settings_browser_proxy.js
import {
  SamsungSettingsHandlerFactory,
  SamsungSettingsHandlerRemote,
  SamsungSettingsPageCallbackRouter,
  ColorTheme,
  FontSize,
} from './samsung_settings.mojom-webui.js';

export class SamsungSettingsBrowserProxy {
  constructor() {
    this.handler = new SamsungSettingsHandlerRemote();
    this.callbackRouter = new SamsungSettingsPageCallbackRouter();

    const factory = SamsungSettingsHandlerFactory.getRemote();
    factory.createHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }

  // Convenience wrappers (optional but makes code cleaner)
  async getSettings() {
    return (await this.handler.getSettings()).settings;
  }

  setTheme(theme) {
    // Validate enum value
    console.assert(Object.values(ColorTheme).includes(theme));
    return this.handler.setTheme(theme);
  }

  static _instance = null;
  static getInstance() {
    if (!SamsungSettingsBrowserProxy._instance) {
      SamsungSettingsBrowserProxy._instance =
          new SamsungSettingsBrowserProxy();
    }
    return SamsungSettingsBrowserProxy._instance;
  }

  static setInstance(instance) {
    SamsungSettingsBrowserProxy._instance = instance;
  }
}

// Re-export enums for convenience
export {ColorTheme, FontSize};
```

---

→ [Bài tiếp theo: PageHandler Pattern — Complete Walkthrough](05-pagehandler-pattern.md)
