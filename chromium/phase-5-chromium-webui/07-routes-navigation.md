# Bài 7: Routes và Navigation trong WebUI

Settings page có nhiều sub-page: `/general`, `/privacy`, `/appearance`, `/sync/users`... Mỗi sub-page có URL riêng, back button work đúng, deep link work. Bài này dạy cách Chromium WebUI handle routing.

Routing trong WebUI khác web app thông thường (React Router/Vue Router) — nó **đồng bộ với browser URL bar**. User refresh page hay copy URL share đều giữ state.

## Tổng quan — `chrome://settings/{path}`

```text
URL                                Sub-page
─────────────────────────────────  ───────────────────────────
chrome://settings/                 Main settings page
chrome://settings/general          General settings
chrome://settings/appearance       Appearance settings
chrome://settings/privacy          Privacy settings
chrome://settings/sync             Sync (root)
chrome://settings/sync/users       Sync > Users sub-page
chrome://settings/search?q=cookies Search with query
chrome://settings/passwords?id=42  Password detail
```

→ **1 single-page app**, route bằng URL path + query. No full page reload khi navigate.

## Architecture — `Router` class

Chromium WebUI dùng class `Router` (`chrome/browser/resources/settings/router.ts`) singleton manage:

- Current route.
- Navigation methods.
- Browser back/forward sync.
- Query params.
- Route observers (component listen route changes).

```typescript
// router.ts (simplified)
export class Router {
  private currentRoute_: Route;
  private currentQueryParams_: URLSearchParams;
  
  // Singleton
  static instance_: Router|null = null;
  static getInstance(): Router {
    return Router.instance_ || (Router.instance_ = new Router());
  }
  
  // Get current
  getCurrentRoute(): Route { ... }
  getQueryParameters(): URLSearchParams { ... }
  
  // Navigate
  navigateTo(route: Route, params?: URLSearchParams): void { ... }
  navigateToPreviousRoute(): void { ... }   // Like back button
  
  // Subscribe to route changes
  addObserver(observer: RouteObserver): void { ... }
  removeObserver(observer: RouteObserver): void { ... }
}
```

## `Route` class — define các route

```typescript
// route.ts
export class Route {
  path: string;
  parent: Route|null;
  depth: number;
  
  constructor(path: string) {
    this.path = path;
    this.parent = null;
    this.depth = 0;
  }
  
  // Tạo sub-route
  createChild(subpath: string): Route {
    const child = new Route(`${this.path}${subpath}`);
    child.parent = this;
    child.depth = this.depth + 1;
    return child;
  }
  
  isSubpageOf(route: Route): boolean { ... }
}

// Define all routes — phải build top-level trước, sub-routes sau
// (không thể tham chiếu `routes.X` trong chính object literal của `routes`).
const BASIC = new Route('/');
const ABOUT = new Route('/about');
const APPEARANCE = new Route('/appearance');
const PRIVACY = new Route('/privacy');
const PEOPLE = new Route('/people');

export const routes = {
  BASIC, ABOUT, APPEARANCE, PRIVACY, PEOPLE,
  
  // Sub-routes — tham chiếu local consts ở trên
  PRIVACY_COOKIES: PRIVACY.createChild('/cookies'),
  PRIVACY_SECURITY: PRIVACY.createChild('/security'),
  SYNC: PEOPLE.createChild('/sync'),
};
// Sub-routes cấp sâu hơn: gán sau khi `routes` đã exist
routes.SYNC_ADVANCED = routes.SYNC.createChild('/advanced');
```

→ Routes là **tree structure**. Sub-page biết parent.

## Navigate — qua code

```typescript
import {Router, routes} from './route.js';

class SettingsPage extends PolymerElement {
  goToPrivacy_() {
    Router.getInstance().navigateTo(routes.PRIVACY);
  }
  
  goToCookies_() {
    Router.getInstance().navigateTo(routes.PRIVACY_COOKIES);
  }
  
  goToPasswordDetail_(passwordId) {
    const params = new URLSearchParams();
    params.set('id', String(passwordId));
    Router.getInstance().navigateTo(routes.PASSWORDS, params);
  }
  
  goBack_() {
    Router.getInstance().navigateToPreviousRoute();
  }
}
```

`navigateTo`:
1. Đổi `window.location.pathname` (qua `history.pushState`).
2. Update `Router.currentRoute_`.
3. Fire route change event → observers nhận.
4. Browser back button work (vì `pushState`).

## Listen route changes — `RouteObserver`

Component muốn react khi route đổi:

```typescript
import {RouteObserverMixin} from './route_observer_mixin.js';

class PrivacyPage extends RouteObserverMixin(PolymerElement) {
  static get is() { return 'privacy-page'; }
  
  // Implement RouteObserver interface
  currentRouteChanged(newRoute: Route, oldRoute: Route|undefined) {
    // Fire khi route đổi
    if (newRoute === routes.PRIVACY) {
      this.loadPrivacySettings_();
    } else if (newRoute === routes.PRIVACY_COOKIES) {
      this.scrollToCookies_();
    }
  }
}
```

Mixin tự subscribe/unsubscribe lifecycle.

## URL ↔ Route binding

```text
Browser URL bar  ──pushState────►  Router.currentRoute_
                     ▲
                     │ popState (browser back)
                     │
                  History API ◄── window.location.pathname
```

Pattern:
- Set route → URL bar update (via `history.pushState`).
- Browser back → `popstate` event → Router parse URL → set new route → fire observers.
- Refresh F5 → Router init từ `window.location.pathname` → restore state.

```typescript
class Router {
  private constructor() {
    // Listen browser back/forward
    window.addEventListener('popstate', () => {
      this.routeFromCurrentUrl_();
    });
    
    // Init from current URL
    this.routeFromCurrentUrl_();
  }
  
  private routeFromCurrentUrl_() {
    const path = window.location.pathname;
    const route = this.matchRoute_(path);
    const params = new URLSearchParams(window.location.search);
    this.setCurrentRoute_(route, params, /*pushState=*/false);  // đã từ URL
  }
  
  navigateTo(route: Route, params?: URLSearchParams) {
    this.setCurrentRoute_(route, params, /*pushState=*/true);
  }
  
  private setCurrentRoute_(route: Route,
                            params: URLSearchParams|undefined,
                            pushState: boolean) {
    if (pushState) {
      let url = route.path;
      if (params) url += `?${params.toString()}`;
      history.pushState(null, '', url);
    }
    this.currentRoute_ = route;
    this.currentQueryParams_ = params ?? new URLSearchParams();
    this.notifyObservers_();
  }
}
```

## Query parameters

```typescript
// URL: chrome://settings/search?q=cookies&depth=2

const params = Router.getInstance().getQueryParameters();
const query = params.get('q');           // "cookies"
const depth = params.get('depth');       // "2"

// Update query params (mà giữ same route)
const newParams = new URLSearchParams();
newParams.set('q', newQuery);
Router.getInstance().navigateTo(currentRoute, newParams);
```

## Route trong template

```html
<template is="dom-if" if="[[isCurrentRoute_(currentRoute, routes.PRIVACY)]]">
  <privacy-page></privacy-page>
</template>

<template is="dom-if" if="[[isCurrentRoute_(currentRoute, routes.APPEARANCE)]]">
  <appearance-page></appearance-page>
</template>
```

```typescript
class SettingsMain extends RouteObserverMixin(PolymerElement) {
  static get properties() {
    return {
      currentRoute: Object,
    };
  }
  
  currentRouteChanged(newRoute) {
    this.currentRoute = newRoute;
  }
  
  isCurrentRoute_(current, target) {
    return current === target;
  }
}
```

## Pattern: Master-detail navigation

Settings dạng master-detail:

```text
┌──────────┬────────────────┐
│ Menu     │ Content        │
│          │                │
│ General  │ Appearance     │
│ Privacy  │   settings     │
│ Apprnce← │ go here        │
│ Sync     │                │
└──────────┴────────────────┘
```

```html
<settings-menu 
    on-menu-item-click="onMenuClick_"
    selected="[[currentSection_]]">
</settings-menu>

<settings-content>
  <template is="dom-if" if="[[isSection_(currentSection_, 'appearance')]]">
    <appearance-page></appearance-page>
  </template>
  <template is="dom-if" if="[[isSection_(currentSection_, 'privacy')]]">
    <privacy-page></privacy-page>
  </template>
  <!-- ... -->
</settings-content>
```

```typescript
onMenuClick_(e) {
  const section = e.detail.section;
  Router.getInstance().navigateTo(routes[section.toUpperCase()]);
}

currentRouteChanged(newRoute) {
  // Update current section based on route
  if (newRoute.isSubpageOf(routes.APPEARANCE)) {
    this.currentSection_ = 'appearance';
  } else if (newRoute.isSubpageOf(routes.PRIVACY)) {
    this.currentSection_ = 'privacy';
  }
  // ...
}
```

## Pattern: Sub-page expand/collapse

```html
<settings-section section="privacy">
  <!-- Main page (route = /privacy) -->
  <cr-link-row 
      label="Cookies"
      on-click="goToCookies_">
  </cr-link-row>
  
  <cr-link-row 
      label="Security"
      on-click="goToSecurity_">
  </cr-link-row>
</settings-section>

<!-- Sub-page chỉ render khi navigate đến sub-route -->
<settings-subpage 
    route="[[routes.PRIVACY_COOKIES]]"
    page-title="Cookies">
  <privacy-cookies-page></privacy-cookies-page>
</settings-subpage>
```

`settings-subpage` là wrapper handle:
- Show only when on this route.
- Auto-render back button.
- Trap focus.
- Animate transitions.

## Deep linking — URL có ID cụ thể

```text
chrome://settings/passwords?id=42      → password detail
chrome://settings/extensions?id=abc    → extension detail
chrome://history?q=samsung             → history với search
```

Pattern:

```typescript
class PasswordsPage extends RouteObserverMixin(PolymerElement) {
  currentRouteChanged(newRoute) {
    if (newRoute === routes.PASSWORDS) {
      const params = Router.getInstance().getQueryParameters();
      const id = params.get('id');
      if (id) {
        this.scrollToPassword_(id);
        this.highlightPassword_(id);
      }
    }
  }
}
```

→ User share URL → người nhận mở thấy đúng password highlighted.

## Browser tab title sync với route

```typescript
class SettingsMain extends RouteObserverMixin(PolymerElement) {
  currentRouteChanged(newRoute) {
    // Update tab title
    if (newRoute === routes.PRIVACY) {
      document.title = this.i18n('privacyPageTitle');
    } else if (newRoute === routes.APPEARANCE) {
      document.title = this.i18n('appearancePageTitle');
    } else {
      document.title = this.i18n('settingsPageTitle');
    }
  }
}
```

## Search-as-you-navigate

```text
User gõ "cookie" vào search box:
- URL: chrome://settings/?search=cookie
- Page filter visible items chứa "cookie"
- Highlight match
```

```typescript
class SettingsMain extends PolymerElement {
  onSearchChange_(e) {
    const query = e.detail.value;
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    
    Router.getInstance().navigateTo(routes.BASIC, params);
    // Page → re-filter visible items based on query
  }
}
```

## Animation between routes

```css
settings-subpage {
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
  transform: translateX(0);
  opacity: 1;
}

settings-subpage[entering] {
  transform: translateX(100%);
  opacity: 0;
}

settings-subpage[leaving] {
  transform: translateX(-100%);
  opacity: 0;
}
```

Transition handle ở route observer:

```typescript
currentRouteChanged(newRoute, oldRoute) {
  if (newRoute.isSubpageOf(routes.PRIVACY) && 
      !oldRoute?.isSubpageOf(routes.PRIVACY)) {
    // Navigate INTO subpage → slide in
    this.animateIn_();
  } else if (oldRoute?.isSubpageOf(routes.PRIVACY) &&
             !newRoute.isSubpageOf(routes.PRIVACY)) {
    // Navigate OUT of subpage → slide out
    this.animateOut_();
  }
}
```

## Simpler approach cho Samsung Browser

Nếu Samsung WebUI page không phức tạp như `chrome://settings`, **không cần** custom Router. Simple state machine OK:

```javascript
class SamsungSettingsApp extends PolymerElement {
  static get is() { return 'samsung-settings-app'; }
  
  static get template() {
    return html`
      <!-- Top toolbar -->
      <cr-toolbar 
          page-name="[[currentPageTitle_]]"
          show-search
          on-search-changed="onSearch_">
      </cr-toolbar>
      
      <!-- Page content -->
      <template is="dom-if" if="[[isPage_(currentPage_, 'main')]]">
        <samsung-main-page on-navigate="onNavigate_"></samsung-main-page>
      </template>
      
      <template is="dom-if" if="[[isPage_(currentPage_, 'appearance')]]">
        <samsung-appearance-page on-back="onBack_"></samsung-appearance-page>
      </template>
      
      <template is="dom-if" if="[[isPage_(currentPage_, 'privacy')]]">
        <samsung-privacy-page on-back="onBack_"></samsung-privacy-page>
      </template>
    `;
  }
  
  static get properties() {
    return {
      currentPage_: {
        type: String,
        value: 'main',
      },
      currentPageTitle_: {
        type: String,
        computed: 'computeTitle_(currentPage_)',
      },
    };
  }
  
  computeTitle_(page) {
    return {
      main: 'Samsung Settings',
      appearance: 'Appearance',
      privacy: 'Privacy',
    }[page] || 'Samsung Settings';
  }
  
  isPage_(current, target) {
    return current === target;
  }
  
  ready() {
    super.ready();
    
    // Init from URL
    const path = window.location.pathname.replace(/^\//, '');
    if (path && ['appearance', 'privacy'].includes(path)) {
      this.currentPage_ = path;
    }
    
    // Listen browser back
    window.addEventListener('popstate', this.onPopState_.bind(this));
  }
  
  onPopState_() {
    const path = window.location.pathname.replace(/^\//, '');
    this.currentPage_ = path || 'main';
  }
  
  onNavigate_(e) {
    const page = e.detail.page;
    this.currentPage_ = page;
    history.pushState(null, '', `/${page}`);
  }
  
  onBack_() {
    history.back();  // browser handle popstate
  }
}
```

→ Đơn giản hơn nhiều, work cho small WebUI.

## CSS: scroll position management

Khi navigate sub-page rồi back, user mong vị trí scroll restored:

```typescript
class SettingsMain extends RouteObserverMixin(PolymerElement) {
  private scrollPositions_ = new Map<string, number>();
  
  currentRouteChanged(newRoute, oldRoute) {
    // Save scroll của old route
    if (oldRoute) {
      this.scrollPositions_.set(oldRoute.path, window.scrollY);
    }
    
    // Restore scroll cho new route (sau khi DOM render)
    requestAnimationFrame(() => {
      const savedY = this.scrollPositions_.get(newRoute.path) || 0;
      window.scrollTo(0, savedY);
    });
  }
}
```

## Mobile back button

Trên mobile, hardware/gesture back button maps to `history.back()`. Pattern này work natural — không cần code thêm.

Đối với Samsung Browser trên Android, browser tự handle gesture back → `popstate` event fire → Router catch và navigate đúng.

## Open in new tab

```html
<a href="chrome://settings/privacy" target="_blank">
  Open privacy in new tab
</a>
```

→ Tab mới load `chrome://settings/privacy`. Router init từ URL → render correct sub-page.

## Best practices

### 1. URL phải reflect state

```text
SAI:
  URL: chrome://settings/
  Content: viewing privacy → URL không nói gì
  
ĐÚNG:
  URL: chrome://settings/privacy
  Content: viewing privacy ✓
```

### 2. Refresh phải work

```typescript
// Init từ URL trong constructor / ready
ready() {
  super.ready();
  const path = window.location.pathname;
  this.currentPage_ = this.parsePath_(path);
}
```

User refresh F5 → page restore state.

### 3. Deep link work

Mọi URL nên navigate được trực tiếp. User share link → đối tác mở đúng state.

### 4. Browser back/forward work

Dùng `history.pushState` thay vì `window.location = ...` để back work.

```typescript
// SAI - full page reload
window.location = '/privacy';

// ĐÚNG - SPA navigation
history.pushState(null, '', '/privacy');
this.currentPage_ = 'privacy';
```

### 5. Title sync

```typescript
currentRouteChanged(newRoute) {
  document.title = this.computeTitle_(newRoute);
}
```

### 6. Loading state khi navigate vào page nặng

```typescript
async currentRouteChanged(newRoute) {
  if (newRoute === routes.PASSWORDS) {
    this.isLoading_ = true;
    await this.loadPasswords_();
    this.isLoading_ = false;
  }
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `window.location = ...` | Full page reload, mất state | `history.pushState` + manual state update |
| Quên listen `popstate` | Browser back không work | Add listener trong constructor |
| Init state không từ URL | Refresh mất state | Parse URL trong `ready()` |
| Document title không update | Tab name lạ | Update `document.title` khi route change |
| Memory leak với route observer | Component destroy nhưng vẫn nhận events | Cleanup trong `disconnectedCallback` (mixin auto) |
| Race condition khi navigate quickly | UI flicker | Debounce navigation hoặc cancel old loads |

## Tóm tắt bài 7

- WebUI routing đồng bộ với browser URL bar (`history.pushState`).
- **`Router` singleton** manage current route + navigation.
- **`Route` class** define paths, support tree structure (sub-routes).
- **`RouteObserverMixin`** cho component listen route changes.
- Query params qua `URLSearchParams`.
- Deep linking + refresh + back/forward work natural khi dùng URL state.
- Samsung Browser simple WebUI: state machine `currentPage_` + manual history.pushState đủ.

**Bài kế tiếp** → [Bài 8: Build System (GN) — đầy đủ pipeline](08-build-system-gn.md)
