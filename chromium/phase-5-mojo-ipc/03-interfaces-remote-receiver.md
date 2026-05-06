# Bài 3: Remote, Receiver và Connection Setup

## Sơ đồ kết nối đầy đủ

```
Renderer Process (JS)                Browser Process (C++)
─────────────────────────────        ──────────────────────────────

1. JS tạo factory remote:
   factory = new PageHandlerFactoryRemote()
   factoryReceiver = factory.$.bindNewPipeAndPassReceiver()
                                  ↓
                    Chromium WebUI framework nhận factoryReceiver
                    và gọi WebUIController.BindInterface()
                                  ↓
                    factory_receiver_.Bind(pending_receiver)

2. JS gọi CreatePageHandler:
   pageRouter = new PageCallbackRouter()
   pageRemote = pageRouter.$.bindNewPipeAndPassRemote()

   handlerRemote = new PageHandlerRemote()
   handlerReceiver = handlerRemote.$.bindNewPipeAndPassReceiver()

   factory.createPageHandler(pageRemote, handlerReceiver)
                                  ↓
                    WebUIController.CreatePageHandler(
                        pending_remote<Page> page,
                        pending_receiver<PageHandler> handler)
                                  ↓
                    handler_ = new PageHandlerImpl(handler, page)
                    // handler_ bind receiver
                    // handler_ giữ page remote

3. Connection established:
   handlerRemote.getSomething()  ───────────────────►  PageHandlerImpl.GetSomething()
   ◄───────────────────────────────────────────────     callback.Run(result)

   pageRouter.onSomethingChanged  ◄──────────────────  page_->OnSomethingChanged(data)
```

---

## JavaScript Connection Setup — Chi tiết

### Pattern 1: Standard WebUI Pattern (phổ biến nhất)

```javascript
// browser_proxy.js
import {
  PageHandlerFactory,
  PageHandlerFactoryRemote,
  PageHandlerRemote,
  PageCallbackRouter,
} from './foo.mojom-webui.js';

export class BrowserProxy {
  handler;
  callbackRouter;

  constructor() {
    this.handler = new PageHandlerRemote();
    this.callbackRouter = new PageCallbackRouter();

    // Tạo factory, bind nó với Chromium WebUI framework
    const factory = PageHandlerFactory.getRemote();

    // Kết nối: gửi cả 2 đầu sang C++
    factory.createPageHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }

  static instance_ = null;

  static getInstance() {
    return BrowserProxy.instance_ ||
        (BrowserProxy.instance_ = new BrowserProxy());
  }
}
```

### Pattern 2: Direct Remote (cho single interface, không cần factory)

```javascript
// Khi C++ tự setup binding mà không cần factory
import {SimpleServiceRemote} from './simple_service.mojom-webui.js';

const remote = SimpleServiceRemote.getRemote();
// getRemote() tự động bind và kết nối
const {data} = await remote.getData();
```

---

## `getRemote()` — Auto-connect

Nhiều Mojo interfaces trong Chromium WebUI có static `getRemote()` method:

```javascript
// Bên trong generated code (mojom-webui.js):
static getRemote() {
  let remote = new FooRemote();
  remote.$.bindNewPipeAndPassReceiver().handle.close();
  // Thực ra phức tạp hơn — nhờ Chromium infrastructure tự route
  return remote;
}
```

Pattern này được dùng khi interface được setup bởi Chromium (không cần Factory):

```javascript
import {BrowserProxy} from 'chrome://resources/js/cr.js';

// Một số interfaces có thể gọi trực tiếp
const proxy = BrowserProxy.getInstance();
```

---

## CallbackRouter — Nhận push từ C++

`CallbackRouter` là class đặc biệt giúp đăng ký nhiều listeners cho cùng interface:

```javascript
import {PageCallbackRouter} from './foo.mojom-webui.js';

const router = new PageCallbackRouter();

// Thêm listener — trả listener ID
const listenerId1 = router.onThemeChanged.addListener((theme) => {
  this._theme = theme;
  this.requestUpdate();
});

const listenerId2 = router.onThemeChanged.addListener((theme) => {
  logAnalytics('theme_changed', {theme});
});

// Remove listener khi không cần (dùng ID)
router.onThemeChanged.removeListener(listenerId1);
```

### Dùng trong LitElement:

```javascript
class SettingsPage extends LitElement {
  constructor() {
    super();
    this._proxy = BrowserProxy.getInstance();
    this._listenerIds = [];
  }

  connectedCallback() {
    super.connectedCallback();
    const router = this._proxy.callbackRouter;

    // Đăng ký và lưu IDs để cleanup
    this._listenerIds.push(
      router.onThemeChanged.addListener(
          this._onThemeChanged.bind(this)),
      router.onSettingsUpdated.addListener(
          this._onSettingsUpdated.bind(this)),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup: xóa listeners
    const router = this._proxy.callbackRouter;
    this._listenerIds.forEach(id => router.removeListener(id));
    this._listenerIds = [];
  }

  _onThemeChanged(theme) {
    this._theme = theme;
  }

  _onSettingsUpdated(settings) {
    this._settings = settings;
  }
}
```

---

## Error Handling và Connection Errors

```javascript
const remote = new FooRemote();
const receiver = remote.$.bindNewPipeAndPassReceiver();

// Xử lý khi connection bị đóng (browser crashed, page reload...)
remote.$.setConnectionErrorHandler(() => {
  console.error('Connection to browser process lost');
  // Có thể reconnect hoặc show error UI
  this._showConnectionError();
});

// Chromium cũng có pattern disconnect handler:
remote.onConnectionError = () => { ... };
```

---

## Testing với Mojo — Mock Pattern

Một trong những ưu điểm của pattern BrowserProxy là dễ mock trong tests:

```javascript
// test_browser_proxy.js
export class TestBrowserProxy {
  // Implement interface nhưng return test data
  handler = {
    getSettings: () => Promise.resolve({
      settings: {
        theme: 'dark',
        fontSize: 14,
        darkMode: false,
      }
    }),
    setTheme: (theme) => Promise.resolve({success: true}),
  };

  callbackRouter = {
    onThemeChanged: {
      addListener: (fn) => {
        this._listeners.push(fn);
        return this._listeners.length - 1;
      },
      removeListener: (id) => {
        this._listeners.splice(id, 1);
      },
    },
  };

  _listeners = [];

  // Helper để simulate C++ push
  simulateThemeChange(theme) {
    this._listeners.forEach(fn => fn(theme));
  }
}

// Trong test:
import {BrowserProxy} from '../browser_proxy.js';
import {TestBrowserProxy} from './test_browser_proxy.js';

suite('SettingsPage', () => {
  let proxy;

  setup(() => {
    proxy = new TestBrowserProxy();
    BrowserProxy.setInstance(proxy);  // Inject mock
  });

  test('loads settings on connect', async () => {
    const page = document.createElement('settings-page');
    document.body.appendChild(page);
    await page.updateComplete;

    assertEquals('dark', page.theme);
  });
});
```

---

## Quan trọng: Mojo là Async, JavaScript là Single-threaded

```javascript
// Sai pattern (dù JS cho phép):
connectedCallback() {
  super.connectedCallback();
  // Bắt đầu async operation nhưng không await
  this._proxy.handler.getSettings().then(({settings}) => {
    this._settings = settings;
    // OK nhưng không biết lỗi ở đâu nếu fail
  });
}

// Đúng pattern:
async connectedCallback() {
  super.connectedCallback();
  try {
    const {settings} = await this._proxy.handler.getSettings();
    this._settings = settings;
  } catch (e) {
    // Mojo pipe error
    this._loadError = true;
    console.error('Failed to load settings:', e);
  }
}
```

---

## Tóm tắt Connection Flow

```
1. JS tạo Remote + Receiver pair
2. JS tạo CallbackRouter
3. JS gọi Factory.createPageHandler(routerRemote, handlerReceiver)
4. C++ nhận, tạo PageHandler, bind receiver
5. C++ giữ Page remote để push updates
6. Connection established → có thể gọi methods
7. Cleanup: close pipes trong disconnectedCallback
```

→ [Bài tiếp theo: JavaScript Bindings chi tiết](04-js-bindings.md)
