# Bài 1: Mojo IPC — Tổng quan

## Mojo là gì?

**Mojo** là IPC system của Chromium. Nó cung cấp:

1. **Message pipes** — Kênh giao tiếp hai chiều giữa processes
2. **Interfaces** — Type-safe APIs định nghĩa bằng IDL (`.mojom` files)
3. **Bindings** — Auto-generated code cho C++ và JavaScript
4. **Handles** — Cross-process handles cho OS resources

Mojo thay thế toàn bộ hệ thống IPC cũ của Chromium (IPC::Channel, legacy IPCMessages).

---

## Tại sao Mojo tốt hơn legacy IPC?

| | Legacy IPC | Mojo |
|--|-----------|------|
| Type safety | Không (manual serialization) | Có (IDL + codegen) |
| JS support | Không | Có (JS bindings) |
| Interface versioning | Không | Có |
| Pipe multiplexing | Không | Có |
| Async by design | Không | Có |
| Testability | Khó | Dễ (mock bindings) |

---

## Mojo Concepts Map

```
┌─────────────────────────────────────────────────────┐
│                    Mojo Ecosystem                    │
│                                                     │
│  .mojom files      →    IDL định nghĩa interfaces  │
│       ↓ codegen                                     │
│  C++ bindings      →    mojo::Remote<T>             │
│                         mojo::Receiver<T>           │
│                         mojo::PendingRemote<T>      │
│                         mojo::PendingReceiver<T>    │
│                                                     │
│  JS bindings       →    XxxRemote class             │
│                         XxxReceiver class           │
│                         XxxCallbackRouter class     │
│                                                     │
│  Transport         →    Message pipe (shared memory │
│                         hoặc domain socket)         │
└─────────────────────────────────────────────────────┘
```

---

## Flow: Từ .mojom đến running code

```
1. Viết interface definition:
   ─────────────────────────
   // calculator.mojom
   interface Calculator {
     Add(int32 a, int32 b) => (int32 result);
   };

2. Build system generates:
   ────────────────────────
   calculator.mojom.h          (C++ header)
   calculator.mojom.cc         (C++ implementation)
   calculator.mojom-webui.js   (JavaScript bindings)

3. C++ implements interface:
   ───────────────────────────
   class CalculatorImpl : public calculator::mojom::Calculator {
     void Add(int32_t a, int32_t b, AddCallback cb) override {
       std::move(cb).Run(a + b);
     }
   };

4. JS calls interface:
   ─────────────────────
   import {CalculatorRemote} from './calculator.mojom-webui.js';
   const calc = new CalculatorRemote();
   // ... setup pipe
   const {result} = await calc.add(3, 4);
   console.log(result); // 7
```

---

## Mojo trong Chromium WebUI — Big Picture

```
JS (Renderer Process)              C++ (Browser Process)
──────────────────────             ──────────────────────

// Page loads, JS runs:
import {PageHandlerFactory,        class WebUIController
        PageHandlerRemote,             : MojoWebUIController {
        PageCallbackRouter}            void BindInterface(
    from './foo.mojom-webui.js';       PendingReceiver<Factory>);
                                   }
// PageHandlerFactory.getRemote()
// là static method auto-gen: lấy
// Remote đã pre-bind qua interface
// broker của WebUI framework
// (WebUIController.BindInterface
// được gọi tự động bởi framework)
const factory =
    PageHandlerFactory.getRemote();

// Tạo 2 endpoint còn lại:
const router = new PageCallbackRouter();
const handler = new PageHandlerRemote();

factory.createPageHandler(         void CreatePageHandler(
  router.$.bindNewPipe                 PendingRemote<Page> page,
       AndPassRemote(),                PendingReceiver<Handler> h) {
  handler.$.bindNewPipe              handler_ = new HandlerImpl(
       AndPassReceiver(),               std::move(h),
);                                     std::move(page));
                                   }

// Now connected:
const {data} =                     void GetData(GetDataCallback cb) {
    await handler.getData();         std::move(cb).Run(ReadData());
                                   }

// Push from C++:
router.onDataChanged                 page_->OnDataChanged(newData);
    .addListener(d => {...});
```

---

## Mojo trong JavaScript: 3 generated classes

Khi compile `foo.mojom` cho JavaScript, bạn nhận được 3 classes chính:

### 1. `FooRemote` — Client (JS gọi C++)

```javascript
import {FooRemote, Foo} from './foo.mojom-webui.js';

// 2 cách tạo remote:

// Cách A — static getRemote() (cho top-level WebUI interface):
const remote = Foo.getRemote();
// Đã bind sẵn qua interface broker, dùng được luôn.

// Cách B — new + bindNew*, rồi PASS pending receiver sang đầu kia.
// Pending receiver chính là return value của bindNewPipeAndPassReceiver():
const remote = new FooRemote();
const pendingReceiver = remote.$.bindNewPipeAndPassReceiver();
factory.createSomething(pendingReceiver);  // pass cho C++ qua factory đã bind

// Sau khi connected (hoặc remote đã getRemote()):
const {result} = await remote.someMethod(arg1, arg2);
```

### 2. `FooReceiver` — Server (JS implement interface)

```javascript
import {FooReceiver} from './foo.mojom-webui.js';

// Object implement interface (có methods tương ứng)
const impl = {
  someMethod(arg1) {
    return {result: computeResult(arg1)};
  }
};

const receiver = new FooReceiver(impl);
// Lấy remote để gửi sang C++:
const pendingRemote = receiver.$.bindNewPipeAndPassRemote();
```

### 3. `FooCallbackRouter` — Observer (C++ gọi JS)

```javascript
import {FooCallbackRouter} from './foo.mojom-webui.js';

const router = new FooCallbackRouter();

// Đăng ký listeners
router.onSomethingHappened.addListener((arg1, arg2) => {
  console.log('Something happened:', arg1, arg2);
});

// Lấy remote để gửi sang C++:
const pendingRemote = router.$.bindNewPipeAndPassRemote();
// C++ sẽ giữ remote này và gọi onSomethingHappened() khi cần
```

---

## `$` property — Magic connection object

Mỗi Mojo binding object có `$` property với các methods quan trọng:

```javascript
const remote = new FooRemote();

// Tạo pipe, giữ remote end, trả pending receiver
const pendingReceiver = remote.$.bindNewPipeAndPassReceiver();

// Bind đến existing pipe
remote.$.bindToPipe(existingPipe);

// Check xem có connected chưa
if (remote.$.isBound()) { ... }

// Close connection
remote.$.close();

// Check khi connection bị đóng
remote.$.setConnectionErrorHandler(() => {
  console.log('Connection lost');
});
```

---

## Tóm tắt

```
.mojom file → định nghĩa interface (IDL)
FooRemote   → JS client, gọi C++ methods
FooReceiver → JS server, C++ gọi JS methods (ít dùng)
FooCallbackRouter → JS listener, nhận push từ C++
$.bindNewPipeAndPassReceiver() → tạo connection
```

→ [Bài tiếp theo: Mojom IDL — Cú pháp chi tiết](02-mojom-idl.md)
