# Bài 4: Micro-frontends — chia frontend như chia backend

Backend migrate microservices xong. Sau 6 tháng, bạn nhận ra: **frontend team trở thành bottleneck mới**. Mỗi backend feature mới phải đợi frontend implement. Frontend codebase 1 triệu LoC — chậm, khó test, deploy 1 lần/tuần.

Đây là **monolithic frontend** — vấn đề lớn không kém monolithic backend. Solution: **Micro-frontends**.

## Setup case study — Online learning platform

```text
Frontend pages:
- Home (search bar + course recommendations)
- Course detail
- Enrollment + payment
- User profile

Backend (microservices đã chia tốt):
- CourseDiscovery service
- CourseRecommendation service
- Enrollment service
- Payment service
- User service

Frontend (1 codebase React, 1 team):
- Owns mọi page above
```

### Vấn đề bottleneck

Scenario 1:
- CourseDiscovery team thêm filter "course length" → BE API ready trong 1 ngày.
- Cần frontend update search UI → đợi frontend team 3 tuần (busy với 5 task khác).

Scenario 2:
- Frontend dev tune profile page → cần học User service API.
- Frontend dev tune enrollment → cần học Enrollment + Payment domain.
- → Frontend dev phải biết **mọi domain** company.

→ Bottleneck. Coupling cao.

Scenario 3:
- Frontend codebase 1M LoC → build 15 phút, test 30 phút, deploy weekly.
- 1 small UI fix → đợi tuần tới.

= **monolithic frontend** symptoms.

## Solution: Micro-frontends

> **Micro-frontends** = chia monolithic frontend thành nhiều **single-page applications nhỏ**, mỗi cái own bởi team riêng (full-stack với domain).

```text
Page "Home":
+──────────────────────────────────────────+
│ Container application (header, footer)   │
│ +─────────────────+ +─────────────────+ │
│ │ CourseDiscovery │ │ CourseRecomm    │ │
│ │  Micro-frontend │ │  Micro-frontend │ │
│ │ (Search team)   │ │ (Reco team)     │ │
│ +─────────────────+ +─────────────────+ │
+──────────────────────────────────────────+

Page "Profile":
+──────────────────────────────────────────+
│ Container application                     │
│ +─────────────────────────────────────+ │
│ │ User Profile Micro-frontend         │ │
│ │ (User team)                         │ │
│ +─────────────────────────────────────+ │
+──────────────────────────────────────────+

Page "Enrollment":
+──────────────────────────────────────────+
│ Container application                     │
│ +─────────────────────────────────────+ │
│ │ Enrollment Micro-frontend            │ │
│ │ (Enrollment team)                    │ │
│ +─────────────────────────────────────+ │
+──────────────────────────────────────────+
```

Mỗi micro-frontend:
- **Standalone single-page app** — chạy được mọi nơi.
- Own bởi **full-stack team** (full domain knowledge).
- **Independent codebase** — repo riêng, CI/CD riêng.
- **Independent deploy** — không cần rebuild container.

## Implementation

### Container application

Container = shell mỏng:
- Render header, footer, navigation.
- Handle authentication (1 chỗ duy nhất).
- Provide shared services (logger, analytics).
- **Dynamic load micro-frontends** dựa trên route.

```html
<!-- container.html -->
<div id="header"></div>
<div id="main-content">
  <!-- Micro-frontend loaded here -->
</div>
<div id="footer"></div>

<script>
  // Container's router
  if (route === '/home') {
    import('https://cdn.acme.com/course-discovery/main.js').then(mf => mf.mount('#main-content'));
    import('https://cdn.acme.com/course-recommendation/main.js').then(mf => mf.mount('#main-content'));
  } else if (route === '/profile') {
    import('https://cdn.acme.com/user-profile/main.js').then(mf => mf.mount('#main-content'));
  }
</script>
```

### Micro-frontend interface

Mỗi micro-frontend expose:

```typescript
// course-discovery/main.ts
export function mount(containerSelector: string): void {
  const root = document.querySelector(containerSelector);
  // Render React/Vue/whatever
  ReactDOM.render(<CourseDiscoveryApp />, root);
}

export function unmount(containerSelector: string): void {
  const root = document.querySelector(containerSelector);
  ReactDOM.unmountComponentAtNode(root);
}
```

Container call `mount()` khi navigate đến route, `unmount()` khi rời.

## Implementation techniques

### 1. Module Federation (Webpack 5)

Hot trend 2020+:

```javascript
// course-discovery/webpack.config.js
new ModuleFederationPlugin({
  name: 'courseDiscovery',
  filename: 'remoteEntry.js',
  exposes: {
    './App': './src/App'
  },
  shared: ['react', 'react-dom']
})

// container/webpack.config.js
new ModuleFederationPlugin({
  name: 'container',
  remotes: {
    courseDiscovery: 'courseDiscovery@http://cdn.acme.com/course-discovery/remoteEntry.js'
  }
})

// container code
const CourseDiscovery = React.lazy(() => import('courseDiscovery/App'));
```

Module Federation load remote module runtime. Update micro-frontend = update `remoteEntry.js` → container tự pick up.

### 2. iframe (cổ điển)

```html
<iframe src="https://courses.acme.com/discovery"></iframe>
```

- ✓ True isolation (CSS, JS, error).
- ✗ Hard to share state.
- ✗ Cumbersome UX.
- ✗ SEO issues.

Dùng cho legacy migration.

### 3. Web Components

```javascript
// course-discovery/element.js
class CourseDiscoveryElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<div id="root"></div>';
    ReactDOM.render(<App />, this.querySelector('#root'));
  }
}
customElements.define('course-discovery', CourseDiscoveryElement);

// Container
<course-discovery></course-discovery>
```

Standard browser API. Framework-agnostic.

### 4. Single-SPA framework

Library orchestrate multiple SPAs:

```javascript
import { registerApplication, start } from 'single-spa';

registerApplication({
  name: '@acme/course-discovery',
  app: () => System.import('@acme/course-discovery'),
  activeWhen: '/home'
});

start();
```

Mature, production-proven.

## Best practice 1: Runtime composition, NOT build-time

❌ Build-time composition:

```javascript
// container's package.json
"dependencies": {
  "@acme/course-discovery": "1.2.3",
  "@acme/course-recommendation": "1.0.5"
}
```

Container import compile-time → micro-frontend version updated → container phải rebuild + redeploy.

→ **Monolithic frontend trá hình**. Mất lợi ích deploy độc lập.

✓ Runtime composition:

```javascript
// Container fetch micro-frontend tại runtime
const App = await import(`https://cdn.acme.com/course-discovery/${getCurrentVersion()}/main.js`);
```

Update micro-frontend = update CDN → container đọc version mới ngay.

## Best practice 2: Không share state

❌ Share global state:

```javascript
window.appState = { user: ..., cart: ... };
// CourseDiscovery dùng
// Profile dùng
// UserProfile dùng
```

Tight coupling. Đổi shape state ở 1 micro-frontend → break khác.

✓ Communication patterns:

### Pattern A: Custom events

```javascript
// In CourseDiscovery — publish
window.dispatchEvent(new CustomEvent('course-selected', {
  detail: { courseId: '123' }
}));

// In Recommendation — subscribe
window.addEventListener('course-selected', (e) => {
  updateRecommendations(e.detail.courseId);
});
```

Loose coupling — publisher không biết subscriber.

### Pattern B: Callback từ container

```javascript
// Container pass callback
mf.mount('#main-content', {
  onCourseSelected: (courseId) => {
    // Container handles
  }
});
```

### Pattern C: URL params

```text
/course/123 → CourseDetail micro-frontend reads URL → state
```

URL = shared state đơn giản, debug dễ.

## Best practice 3: Mỗi MF chạy standalone

Micro-frontend phải chạy **không cần container**:

```bash
cd course-discovery
npm run dev
# Open http://localhost:3000 → CourseDiscovery render standalone
```

Lợi:
- Test isolated.
- Debug nhanh.
- Onboard dev không cần spin lên full stack.

Implement: container có **stub mode** simulate auth, header, dependencies.

## Anti-pattern: Generic UI component ≠ micro-frontend

**Confusion phổ biến**: 1 button reusable across pages = micro-frontend?

**Không**. Button = **shared web component**.

| Khái niệm | Scope | Use case |
|---|---|---|
| **Shared Web Component** | UI element nhỏ (button, modal) | Reuse across micro-frontends |
| **Micro-frontend** | Single-page app, 1 business capability | Một full feature (search, profile, checkout) |

Reuse component OK. Reuse business logic = sai abstraction.

## Khi nào KHÔNG dùng micro-frontends?

- **Frontend team < 10 dev**: overhead micro-frontends > benefit.
- **App đơn giản, ít page**: tách feature ra micro-frontend = over-engineer.
- **Performance critical** (mobile bandwidth low): load nhiều bundle = slow first paint.
- **Pre-render SEO heavy site**: SSR + micro-frontends khó.

Start với monolith frontend → tách micro-frontend khi pain xuất hiện (cùng Strangler approach của backend).

## Benefits tổng kết

| Benefit | Mechanism |
|---|---|
| Independent deploy | Mỗi MF own pipeline |
| Smaller codebase | Mỗi MF 30-100k LoC thay 1M |
| Team autonomy | Full-stack team own end-to-end |
| Tech freedom (limited) | React micro-frontend cạnh Vue OK (nhưng tốn) |
| Faster onboarding | Dev hiểu 1 domain |
| Easier rewrite | Rewrite 1 MF dễ hơn rewrite app |

## Real-world examples

- **Spotify**: micro-frontends cho web player + dashboard.
- **IKEA**: split e-commerce frontend (search, product, cart, checkout).
- **Zalando** (one of pioneers): "Project Mosaic" → micro-frontends 2016.
- **DAZN** (streaming): micro-frontends cho mọi page.

Read: **Micro Frontends** by Luca Mezzalira (book, 2022).

## Tóm tắt bài 4

- **Monolithic frontend** = bottleneck mới sau khi backend đã microservices.
- **Micro-frontends** = chia frontend thành SPAs nhỏ, mỗi cái own bởi full-stack team.
- **Container application** = shell load micro-frontends dynamic.
- 4 implementation: **Module Federation**, **iframe**, **Web Components**, **Single-SPA**.
- Best practice: **runtime composition**, **không share state**, **MF standalone runnable**.
- Communication giữa MF: **custom events**, **callbacks**, **URL params**.
- **Shared component ≠ micro-frontend** — component nhỏ, MF cả page.
- Không dùng khi team < 10 dev hoặc app đơn giản.

**Bài kế tiếp** → [Bài 5: API Management + Gateway pattern](05-api-gateway-management.md)
