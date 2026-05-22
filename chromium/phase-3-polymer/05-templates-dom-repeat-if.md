# Bài 5: Templates — dom-repeat, dom-if, dom-bind

Polymer dùng `<template>` element của Web Components để render conditional và list. Bài này dạy 3 element template **bạn sẽ dùng hằng ngày**:

- **`<template is="dom-repeat">`** — render list (giống `v-for`, `map()`).
- **`<template is="dom-if">`** — render conditional.
- **`<template is="dom-bind">`** — auto-binding ở top-level (page).

## `<template is="dom-repeat">` — list rendering

```html
<template is="dom-repeat" items="[[users]]">
  <div class="user">
    <strong>[[item.name]]</strong>
    <span>[[item.email]]</span>
  </div>
</template>
```

Polymer:
1. Đọc `items="[[users]]"` → lấy array `this.users`.
2. Với mỗi `user` trong array, clone template, set local variable `item` = `user`.
3. Render từng item.

Khi array thay đổi (qua `this.push/splice`), Polymer **smart update** — chỉ add/remove DOM nodes thay đổi.

### Local variables trong dom-repeat

Trong template content, **tự động** có 2 biến:
- **`item`** — phần tử hiện tại của array.
- **`index`** — index của item (số nguyên).

```html
<template is="dom-repeat" items="[[users]]">
  <div>
    [[index]]. [[item.name]] ([[item.email]])
  </div>
</template>
```

### Đổi tên `item` và `index`

Khi nested dom-repeat hoặc tên dễ hiểu hơn:

```html
<template is="dom-repeat" items="[[categories]]" as="category" index-as="catIndex">
  <h3>[[catIndex]]. [[category.name]]</h3>
  
  <template is="dom-repeat" items="[[category.products]]" as="product" index-as="prodIndex">
    <p>[[prodIndex]]. [[product.title]] ($[[product.price]])</p>
  </template>
</template>
```

→ `as="category"` đổi tên `item` → `category`. `index-as="catIndex"` đổi `index` → `catIndex`.

### Filter

```html
<template is="dom-repeat" items="[[users]]" filter="filterActiveUser_">
  <div>[[item.name]]</div>
</template>
```

```javascript
filterActiveUser_(user) {
  return user.isActive;
}
```

Polymer chỉ render items mà filter trả `true`. Khi filter function reference đổi, list re-evaluate.

### Sort

```html
<template is="dom-repeat" items="[[users]]" sort="sortByName_">
  <div>[[item.name]]</div>
</template>
```

```javascript
sortByName_(a, b) {
  return a.name.localeCompare(b.name);
}
```

Giống `Array.sort` compare function.

### Observed properties — re-filter / re-sort khi sub-property đổi

```html
<template 
    is="dom-repeat" 
    items="[[users]]"
    filter="filterActive_"
    observe="isActive online">
  <div>[[item.name]]</div>
</template>
```

`observe="isActive online"` = "re-evaluate filter/sort khi `item.isActive` hoặc `item.online` đổi".

Không có `observe`, Polymer chỉ re-evaluate khi top-level array đổi (push, splice, etc.) — không khi sub-properties đổi.

### Re-render manual

```javascript
// dom-repeat là một <template is="dom-repeat"> — query bằng template[is=dom-repeat]:
this.shadowRoot.querySelector('template[is=dom-repeat]').render();

// Hoặc nếu template có id, dùng this.$:
this.$.myRepeat.render();
```

Hữu ích khi data thay đổi mà Polymer không detect được (vd thay đổi external). `render()` flush pending updates ngay lập tức.

### Performance — Item update

```javascript
// SAI — replace toàn bộ array → re-render mọi item
this.users = this.users.map(u => 
  u.id === id ? {...u, name: 'NewName'} : u
);

// ĐÚNG — update item cụ thể, dom-repeat reuse DOM
const idx = this.users.findIndex(u => u.id === id);
this.set(`users.${idx}.name`, 'NewName');
```

Polymer's smart update phụ thuộc vào array mutation cụ thể. Replace toàn bộ = re-render toàn bộ.

### Tracking giữa các lần render

Polymer 3 dom-repeat **luôn track theo index** (mảng position). Khác với React `key` hay Vue `:key`, dom-repeat **không có** option tracking theo unique key. Khi insert/remove ở giữa array, các item phía sau có thể bị re-bind (Polymer dùng path-based change detection để giảm thiểu re-render thực sự).

→ Cho list lớn cần stable identity, xem `<iron-list>` (Bài 8) — có virtual scrolling.

### Click handler trong dom-repeat

```html
<template is="dom-repeat" items="[[users]]">
  <button on-click="onUserClick_">[[item.name]]</button>
</template>
```

```javascript
onUserClick_(e) {
  // Lấy item từ event model
  const user = e.model.item;
  const index = e.model.index;
  console.log(`Clicked ${user.name} at index ${index}`);
}
```

`e.model` chứa local variables của dom-repeat tại điểm event fire. **Đặc trưng quan trọng của Polymer**.

### Computed values per item

```html
<template is="dom-repeat" items="[[users]]">
  <div class$="user [[computeUserClass_(item)]]">
    [[item.name]]
    <span>[[computeUserStatus_(item.isActive, item.lastSeen)]]</span>
  </div>
</template>
```

```javascript
computeUserClass_(user) {
  return user.isActive ? 'active' : 'inactive';
}

computeUserStatus_(isActive, lastSeen) {
  if (isActive) return 'Online';
  return `Last seen ${this.formatTime_(lastSeen)}`;
}
```

→ Method được gọi cho mỗi item.

## `<template is="dom-if">` — conditional rendering

```html
<template is="dom-if" if="[[isLoading]]">
  <loading-spinner></loading-spinner>
</template>

<template is="dom-if" if="[[!isLoading]]">
  <div class="content">
    <h1>[[title]]</h1>
  </div>
</template>
```

Polymer:
- `if="[[expr]]"` truthy → render template content vào DOM.
- `if` falsy → remove content khỏi DOM.

### `restamp` — destroy vs hide

```html
<!-- Default: lazy destroy -->
<template is="dom-if" if="[[showDialog]]">
  <my-dialog></my-dialog>
</template>
```

Mặc định, khi `if` false, Polymer **hide** content (display:none) thay vì destroy. Tiết kiệm performance khi toggle nhiều.

```html
<!-- Force destroy when if=false -->
<template is="dom-if" if="[[showDialog]]" restamp>
  <my-dialog></my-dialog>
</template>
```

`restamp` = destroy DOM khi `if` false, re-create khi true. Dùng khi:
- Component có internal state nặng cần reset mỗi lần.
- Memory quan trọng hơn performance toggle.

### `[[!expr]]` — single `!` ở đầu binding HOẠT ĐỘNG

```html
<!-- WORK: Polymer support single ! ngay sau [[ hoặc {{ -->
<template is="dom-if" if="[[!isLoading]]">
  <div class="content">[[title]]</div>
</template>
```

Đây là **ngoại lệ duy nhất** Polymer cho expression trong binding. Mọi expression khác (`!!`, `>`, `?:`, `+`, ...) đều không work — phải dùng computed property:

```html
<!-- KHÔNG WORK: cần computed -->
<template is="dom-if" if="[[count > 0]]">

<!-- ĐÚNG: -->
<template is="dom-if" if="[[hasItems_]]">
```

```javascript
static get properties() {
  return {
    count: Number,
    hasItems_: {
      type: Boolean,
      computed: 'computeHasItems_(count)',
    },
  };
}

computeHasItems_(count) {
  return count > 0;
}
```

### Multiple dom-if như else-if

```html
<template is="dom-if" if="[[isLoading]]">
  <loading-spinner></loading-spinner>
</template>

<template is="dom-if" if="[[showError_]]">
  <error-message message="[[error]]"></error-message>
</template>

<template is="dom-if" if="[[showContent_]]">
  <div class="content">[[content]]</div>
</template>
```

```javascript
static get properties() {
  return {
    isLoading: Boolean,
    error: String,
    content: String,
    showError_: {
      type: Boolean,
      computed: 'computeShowError_(isLoading, error)',
    },
    showContent_: {
      type: Boolean,
      computed: 'computeShowContent_(isLoading, error)',
    },
  };
}

computeShowError_(loading, error) { return !loading && !!error; }
computeShowContent_(loading, error) { return !loading && !error; }
```

→ Verbose, nhưng explicit. Polymer không có `else` / `else-if` directive.

## `<template is="dom-bind">` — top-level auto-binding

Khi cần binding ở **page level** (không trong component), dùng `dom-bind`:

```html
<!-- Trong settings.html, không phải component -->
<template is="dom-bind" id="page">
  <h1>[[pageTitle]]</h1>
  <p>Welcome, [[user.name]]</p>
  
  <template is="dom-repeat" items="[[menuItems]]">
    <a href$="[[item.url]]">[[item.label]]</a>
  </template>
</template>

<script>
  // Truy cập dom-bind instance để set property
  const page = document.querySelector('#page');
  page.pageTitle = 'Settings';
  page.user = {name: 'Alice'};
  page.menuItems = [
    {label: 'General', url: '/general'},
    {label: 'Privacy', url: '/privacy'},
  ];
</script>
```

`dom-bind` tạo ra một "container" có thể:
- Có properties (set qua JS).
- Có bindings trong template.
- Render khi properties đổi.

→ Hữu ích cho `<head>` của HTML page khi chưa có root component, hoặc demo nhanh.

**Trong Chromium**: ít dùng. Chromium thường wrap mọi thứ trong root component (`settings-ui`).

## Nested templates — quan trọng cho complex UI

```html
<!-- Outer dom-repeat: categories -->
<template is="dom-repeat" items="[[categories]]" as="cat">
  <section>
    <h2>[[cat.name]]</h2>
    
    <!-- Conditional: chỉ render nếu có items -->
    <template is="dom-if" if="[[cat.items.length]]">
      <!-- Inner dom-repeat: items in category -->
      <template is="dom-repeat" items="[[cat.items]]" as="item">
        <div class="item">[[item.title]]</div>
      </template>
    </template>
    
    <!-- Empty state -->
    <template is="dom-if" if="[[!cat.items.length]]">
      <p>No items</p>
    </template>
  </section>
</template>
```

Lưu ý: `[[!cat.items.length]]` — Polymer **chính thức support** single `!` ở đầu binding (làm boolean coerce + negate). Hoạt động với mọi value (number, string, object). Đây là operator duy nhất Polymer support trong template.

## Template trong dom-repeat — passing data

```html
<template is="dom-repeat" items="[[users]]">
  <!-- Truyền item xuống child component -->
  <user-card user="[[item]]"></user-card>
</template>
```

Child component (`user-card`):

```javascript
class UserCard extends PolymerElement {
  static get template() {
    return html`<div>[[user.name]]</div>`;
  }
  
  static get properties() {
    return {
      user: Object,
    };
  }
}
```

Đây là **pattern phổ biến nhất**: outer component có list, render mỗi item bằng component con.

## `dom-bind` trong static HTML page (real Chromium pattern)

Trong Chromium, đôi khi cần "stamp" template với data từ C++ (qua `loadTimeData`):

```html
<!-- chrome://settings/help.html -->
<template is="dom-bind">
  <h1>[[i18n('helpTitle')]]</h1>
  <p>Version: [[i18n('versionNumber')]]</p>
  <p>OS: [[i18n('osVersion')]]</p>
</template>

<script>
  // i18n function được attach từ load_time_data.js
  const tmpl = document.querySelector('template[is=dom-bind]');
  tmpl.i18n = (key) => loadTimeData.getString(key);
</script>
```

→ Page render text dịch trực tiếp từ C++ data, không cần JS components.

## Real example — Bookmark list component

```javascript
class BookmarkList extends PolymerElement {
  static get is() { return 'bookmark-list'; }
  
  static get template() {
    return html`
      <style>
        :host {
          display: block;
          font-family: 'Roboto', sans-serif;
        }
        .empty {
          padding: 40px;
          text-align: center;
          color: #999;
        }
        .group {
          margin-bottom: 24px;
        }
        .group-title {
          font-weight: 600;
          font-size: 13px;
          color: #666;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
        }
        .item:hover { background: #f5f5f5; }
        .item img {
          width: 16px;
          height: 16px;
          margin-right: 12px;
        }
        .item .title {
          flex: 1;
          font-size: 13px;
        }
        .item .actions {
          display: none;
        }
        .item:hover .actions { display: flex; }
      </style>
      
      <!-- Empty state -->
      <template is="dom-if" if="[[isEmpty_]]">
        <div class="empty">
          <p>Bạn chưa có bookmark nào</p>
          <button on-click="onAddSample_">Thêm bookmark mẫu</button>
        </div>
      </template>
      
      <!-- Group by category -->
      <template is="dom-if" if="[[hasItems_]]">
        <template is="dom-repeat" items="[[groupedItems_]]" as="group">
          <div class="group">
            <div class="group-title">[[group.category]] ([[group.items.length]])</div>
            
            <template is="dom-repeat" items="[[group.items]]" as="bookmark">
              <div class="item" on-click="onItemClick_">
                <img src$="[[bookmark.favicon]]" alt="">
                <span class="title">[[bookmark.title]]</span>
                <div class="actions">
                  <button on-click="onEdit_">Edit</button>
                  <button on-click="onDelete_">Delete</button>
                </div>
              </div>
            </template>
          </div>
        </template>
      </template>
    `;
  }
  
  static get properties() {
    return {
      bookmarks: {
        type: Array,
        value: () => [],
        notify: true,
      },
      isEmpty_: {
        type: Boolean,
        computed: 'computeEmpty_(bookmarks.length)',
      },
      hasItems_: {
        type: Boolean,
        computed: 'computeHasItems_(bookmarks.length)',
      },
      groupedItems_: {
        type: Array,
        computed: 'computeGrouped_(bookmarks.*)',
      },
    };
  }
  
  computeEmpty_(length) { return length === 0; }
  computeHasItems_(length) { return length > 0; }
  
  computeGrouped_(bookmarksChange) {
    if (!this.bookmarks) return [];
    
    const groups = {};
    this.bookmarks.forEach(b => {
      const cat = b.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(b);
    });
    
    return Object.keys(groups).map(category => ({
      category,
      items: groups[category],
    }));
  }
  
  onItemClick_(e) {
    const bookmark = e.model.bookmark;  // from inner dom-repeat
    window.open(bookmark.url);
  }
  
  onEdit_(e) {
    e.stopPropagation();
    const bookmark = e.model.bookmark;
    this.dispatchEvent(new CustomEvent('edit-bookmark', {
      detail: {bookmark},
      bubbles: true,
      composed: true,
    }));
  }
  
  onDelete_(e) {
    e.stopPropagation();
    const idx = e.model.index;
    const bookmark = e.model.bookmark;
    // Tìm absolute index trong bookmarks array
    const absIdx = this.bookmarks.findIndex(b => b.id === bookmark.id);
    if (absIdx !== -1) {
      this.splice('bookmarks', absIdx, 1);
    }
  }
  
  onAddSample_() {
    this.push('bookmarks', {
      id: Date.now(),
      title: 'Sample Bookmark',
      url: 'https://example.com',
      favicon: 'https://www.google.com/favicon.ico',
      category: 'Other',
    });
  }
}

customElements.define(BookmarkList.is, BookmarkList);
```

Trong example này:
- **Empty state** với `dom-if`.
- **Group by category** dùng computed `groupedItems_`.
- **Nested dom-repeat** — outer là groups, inner là items.
- **Event model** — `e.model.bookmark`, `e.model.index`.
- **Polymer array API** — `this.splice('bookmarks', ...)` cho proper notification.

## Khi nào template re-evaluate?

| Trigger | dom-repeat | dom-if |
|---|---|---|
| Top-level array replace | Re-render mọi item | N/A |
| `this.push/splice` | Smart update | N/A |
| Sub-property đổi (item.name) | Bindings trong template update | `if` re-evaluate nếu phụ thuộc |
| `if` đổi (cho dom-if) | N/A | Toggle render |
| `filter`/`sort` function đổi | Re-evaluate | N/A |
| `observe="prop"` sub-prop đổi | Re-filter/sort | N/A |

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `this.users.push(x)` thay vì `this.push('users', x)` | dom-repeat không update | Dùng Polymer array API |
| `[[count > 0]]` hoặc `[[a ? b : c]]` trong `dom-if` | Không hoạt động (Polymer không support expression, trừ single `!`) | Computed property như `hasItems_` |
| Quên `as="..."` khi nested dom-repeat | Inner override outer `item` | Đặt tên rõ ràng |
| `e.model` undefined khi handler trong native event handler | Event fire từ ngoài dom-repeat | Handler phải định nghĩa trong template của dom-repeat |
| Performance kém với list dài (>1000) | Polymer dom-repeat không virtualize | Dùng `iron-list` (virtual scrolling) |
| Forget `restamp` khi cần reset state | Component giữ state cũ khi `if` toggle | Add `restamp` cho one-time dialog |

## Tóm tắt bài 5

| Element | Mục đích |
|---|---|
| `<template is="dom-repeat" items="...">` | Render list. `item`, `index` local |
| `<template is="dom-if" if="...">` | Conditional render. `restamp` để destroy |
| `<template is="dom-bind">` | Top-level auto-binding (ngoài component) |

**Key APIs**:
- `as="newName"` `index-as="newIdx"` đổi tên local vars.
- `filter="method"` `sort="method"` `observe="path"`.
- `e.model.item`, `e.model.index` trong handler.
- `this.push/splice/pop/shift('arrayProp', ...)` cho array mutation.
- `this.set('a.b', value)` cho nested.

**Bài kế tiếp** → [Bài 6: Events và Gestures](06-events-gestures.md)
