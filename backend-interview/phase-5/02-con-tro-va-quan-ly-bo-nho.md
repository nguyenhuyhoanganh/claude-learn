# Bài 2: Con trỏ và quản lý bộ nhớ

Kẻ chống sổ mở ra. Người đối diện hỏi đúng một câu về C++ rồi im lặng chờ. Cả buổi phỏng vấn nằm gọn trong câu đó:

> *"Con trỏ hoạt động như thế nào?"*

Chỉ vậy thôi. Không có vế sau, không có gợi ý. **Câu hỏi ngắn nhất thường là câu khó nhất.**

Bài này dùng chính mô hình bốn tầng của bài trước. Và dù bạn không viết C++, phần cuối bài áp dụng cho **mọi ngôn ngữ** — vì rò rỉ bộ nhớ trong Java, Python, Go, JavaScript đều có cùng bản chất.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Pointer** | **Con trỏ** — biến giữ **địa chỉ** của một ô nhớ khác |
| **Dereference** | **Truy xuất qua con trỏ** — đi tới địa chỉ đó lấy giá trị (`*p`) |
| **Stack** | **Ngăn xếp** — vùng nhớ tự dọn khi hàm chạy xong |
| **Heap** | **Vùng cấp phát động** — bạn xin, và bạn phải tự trả |
| **Memory leak** | **Rò rỉ bộ nhớ** — xin mà quên trả |
| **Dangling pointer** | **Con trỏ treo** — trỏ vào ô nhớ đã bị trả lại |
| **Double free** | **Giải phóng hai lần** — trả cùng một ô hai lần |
| **Ownership** | **Quyền sở hữu** — ai chịu trách nhiệm giải phóng |
| **Smart pointer** | **Con trỏ thông minh** — tự động giải phóng |
| **RAII** | Tài nguyên gắn với vòng đời đối tượng — xin lúc tạo, trả lúc huỷ |
| **GC** (*Garbage Collector*) | **Bộ thu gom rác** — tự dọn bộ nhớ không còn ai dùng |

## Tầng 1: Định nghĩa

**Bạn trả lời ngay, không cần nghĩ:**

> *"Con trỏ là một biến, nhưng nó không giữ số liệu. Nó giữ **địa chỉ** của một biến khác trong bộ nhớ."*

```text
   Hình dung một dãy ô nhớ, mỗi ô có SỐ NHÀ riêng:

   Địa chỉ:   0x1000   0x1004   0x1008   0x100C
             ┌────────┬────────┬────────┬────────┐
             │   42   │        │ 0x1000 │        │
             └────────┴────────┴────────┴────────┘
                 ▲                  │
                 │                  │
                 x                  p    ← p GIỮ SỐ NHÀ của x

   int x = 42;
   int* p = &x;      // & = "lấy số nhà của"
   cout << *p;       // * = "đi tới số nhà đó, mở cửa, lấy thứ bên trong" → 42
```

Đúng hoàn toàn. Sách nào cũng in y như vậy. Người phỏng vấn gật đầu, ghi một dòng ngắn rồi gạch chân.

**Nhưng họ vẫn chưa biết thứ họ thật sự cần biết.** Nên họ hỏi tiếp.

## Tầng 2: "Ai cấp ô nhớ đó ra, và ai có nhiệm vụ trả lại?"

Bộ nhớ chia làm hai vùng, và **hai vùng đó có luật dọn dẹp khác hẳn nhau**.

```text
   ┌──────────────────────────────────────────────────────────┐
   │  STACK (ngăn xếp)                                        │
   │                                                          │
   │  Biến khai bên trong một hàm nằm ở đây.                  │
   │  Hàm chạy xong → CẢ NGĂN BỊ XOÁ SẠCH trong một nhịp.     │
   │  Bạn KHÔNG PHẢI LÀM GÌ CẢ.                               │
   │                                                          │
   │  ✓ Cực nhanh (chỉ dịch một con trỏ)                      │
   │  ✗ Kích thước cố định, biết trước lúc biên dịch           │
   │  ✗ Nhỏ (thường 1–8 MB) → đệ quy sâu = tràn ngăn xếp      │
   ├──────────────────────────────────────────────────────────┤
   │  HEAP (vùng cấp phát động)                               │
   │                                                          │
   │  Bạn XIN bằng `new` / `malloc`.                          │
   │  Từ giây đó, ô nhớ này LÀ CỦA RIÊNG BẠN.                 │
   │  KHÔNG AI DỌN HỘ.                                        │
   │                                                          │
   │  ✓ Kích thước tuỳ ý, sống lâu hơn hàm tạo ra nó          │
   │  ✗ Chậm hơn, phân mảnh, và BẠN PHẢI TỰ TRẢ               │
   └──────────────────────────────────────────────────────────┘
```

```cpp
void ham() {
    int a = 42;              // STACK — hàm xong là tự biến mất
    int* b = new int(42);    // HEAP  — của bạn, không ai dọn hộ
}   // ← a biến mất. b MẤT ĐỊA CHỈ nhưng ô nhớ trên heap VẪN CÒN ĐÓ.
    //   → RÒ RỈ BỘ NHỚ
```

### Vì sao rò rỉ đáng sợ — nó không sập, nó phình

```text
   "Xin xong mà quên trả" nghe nhẹ nhàng. Làm phép nhân đi:

      Mỗi tin nhắn rò 32 byte
      × 10.000 tin/giây
      = 320 KB/giây
      = 1,1 GB sau MỘT GIỜ
      = 27 GB sau MỘT ĐÊM

   VÀ ĐÂY LÀ CÁI ĐAU:
      Nó KHÔNG SẬP NGAY.
      Biểu đồ bộ nhớ chỉ đi lên đều đặn suốt đêm.
      Tới sáng thì máy chủ hết chỗ, tự khởi động lại,
      và NHẬT KÝ KHÔNG GHI LỖI NÀO CẢ.

   Sáng hôm sau bạn nhìn dashboard và không hiểu chuyện gì đã xảy ra.
```

Đó là lý do rò rỉ bộ nhớ khó chẩn đoán hơn nhiều so với sập ngay: **nó không để lại dấu vết ở thời điểm gây lỗi.**

Người phỏng vấn ghi dòng thứ hai vào sổ.

## Tầng 3: "Bạn đã gọi `delete`. Vậy giờ con trỏ đó đang trỏ vào đâu?"

Câu hỏi rất ngắn, và ứng viên khựng lại.

**Đáp án:** nó vẫn trỏ vào **chỗ cũ**.

```text
   `delete` TRẢ Ô NHỚ VỀ CHO HỆ THỐNG.
   Nó KHÔNG ĐỤNG TỚI CON TRỎ.
   Địa chỉ vẫn nằm nguyên đó.
```

```cpp
int* p = new int(42);
delete p;              // trả ô nhớ về cho hệ thống
                       // p VẪN giữ địa chỉ cũ  ← "con trỏ treo"
```

### Và đây mới là chỗ ác

```cpp
cout << *p;            // vẫn in ra 42 !!!
```

```text
   Vì sao vẫn ra 42?
      Vì hệ thống mới chỉ ĐÁNH DẤU ô đó là "trống",
      nó CHƯA GHI ĐÈ gì lên. Dữ liệu cũ còn nguyên.

   → Chương trình chạy ĐÚNG. Không một lời cảnh báo.
   → Test pass. Trên máy bạn thì KHÔNG BAO GIỜ xảy ra lỗi.

   CHO TỚI LÚC hệ thống CẤP LẠI đúng ô đó cho thứ khác.
   Lúc đó con trỏ của bạn:
      • đọc ra RÁC, hoặc
      • GHI ĐÈ LÊN DỮ LIỆU CỦA NGƯỜI KHÁC

   Đây là loại lỗi tệ nhất: nó xảy ra ở NƠI KHÁC, LÚC KHÁC,
   và không có mối liên hệ nào nhìn thấy được với chỗ gây ra nó.
```

**Và còn một cách nữa để nó phát nổ:**

```cpp
delete p;              // lần một — ổn
delete p;              // lần hai — SẬP NGAY TẠI CHỖ
                       // và thường là sập trên MÁY CHỦ THẬT lúc 3 giờ sáng
```

### Cách chữa tốn đúng một dòng

```cpp
delete p;
p = nullptr;           // ◄── một dòng này
```

```text
   Từ đó:
      • mọi câu kiểm tra `if (p)` đều BẮT ĐƯỢC nó
      • gọi `delete nullptr` là HOÀN TOÀN VÔ HẠI theo chuẩn C++

   ĐÁNH ĐỔI RẤT RÕ:
      MỘT DÒNG GÁN
      đổi lấy việc KHÔNG PHẢI THỨC ĐÊM đi tìm một lỗi
      mà máy bạn không tài nào tái hiện được.
```

Người phỏng vấn ghi dòng thứ ba.

## Tầng 4: "Trong dự án thật, bạn quản lý bộ nhớ thế nào?"

Đây là chỗ phân biệt người đọc sách với người đã đi làm.

**Câu trả lời hiện đại: bạn gần như KHÔNG tự gọi `new`/`delete` nữa.**

```cpp
// ❌ C++ kiểu cũ — bạn phải tự nhớ
Ket_noi* kn = new Ket_noi();
xu_ly(kn);
delete kn;              // quên → rò rỉ; ngoại lệ ném ở giữa → CŨNG rò rỉ

// ✅ C++ hiện đại — RAII + smart pointer
auto kn = std::make_unique<Ket_noi>();
xu_ly(kn.get());
// hết phạm vi → TỰ ĐỘNG giải phóng, KỂ CẢ khi có ngoại lệ
```

**RAII** (*Resource Acquisition Is Initialization*) là ý tưởng nền tảng: **tài nguyên gắn với vòng đời của đối tượng** — xin lúc tạo, trả lúc huỷ. Và vì đối tượng trên stack **luôn** được huỷ khi ra khỏi phạm vi (kể cả khi ném ngoại lệ), tài nguyên **luôn** được trả.

### Ba loại con trỏ thông minh — chọn theo QUYỀN SỞ HỮU

```text
   Câu hỏi quyết định KHÔNG PHẢI "dùng con trỏ nào"
   mà là "AI SỞ HỮU Ô NHỚ NÀY?"

   ① unique_ptr — MỘT chủ sở hữu duy nhất
        Không sao chép được, chỉ chuyển nhượng (move).
        → MẶC ĐỊNH NÊN DÙNG. Không tốn thêm chi phí nào so với con trỏ thô.

   ② shared_ptr — NHIỀU chủ cùng sở hữu
        Đếm số người đang giữ; về 0 thì giải phóng.
        → Tốn thêm bộ đếm và phải đồng bộ hoá nó (nguyên tử).
        → CHỈ dùng khi thật sự cần chia sẻ quyền sở hữu.

   ③ weak_ptr — QUAN SÁT mà KHÔNG sở hữu
        → Dùng để PHÁ VÒNG THAM CHIẾU của shared_ptr.
```

### Vòng tham chiếu — bẫy của `shared_ptr`

```cpp
struct Node {
    std::shared_ptr<Node> tiep;
    std::shared_ptr<Node> truoc;     // ❌ tạo VÒNG
};
```

```text
   A giữ B, B giữ A.
   Bộ đếm của cả hai KHÔNG BAO GIỜ về 0.
   → RÒ RỈ, dù bạn đã dùng smart pointer.

   ✅ Chữa: một chiều dùng weak_ptr
      std::weak_ptr<Node> truoc;   // quan sát, không tính vào bộ đếm
```

**Đây chính xác là bẫy tồn tại ở mọi ngôn ngữ dùng đếm tham chiếu** — Python, Swift, PHP đều có. Xem phần sau.

## Nhìn lại cái thang

```text
   Ba câu đã hỏi, theo đúng thứ tự:

      ① "Con trỏ là gì?"
      ② "Ai cấp ô nhớ, ai trả?"
      ③ "Xoá xong thì con trỏ trỏ vào đâu?"

   Câu ① lấy ra từ SÁCH.
   Câu ② lấy ra từ LẦN ĐẦU BẠN LÀM RÒ BỘ NHỚ.
   Câu ③ lấy ra từ MỘT ĐÊM NGỒI TÌM LỖI KHÔNG TÁI HIỆN ĐƯỢC.

   Không câu nào hỏi cú pháp. Không câu nào bắt định nghĩa lại lần hai.
   Cả ba xoay quanh đúng một chuyện:
      BẠN ĐÃ TRẢ GIÁ CHO CON TRỎ BAO GIỜ CHƯA?

   Câu hỏi thật nằm DƯỚI câu hỏi được hỏi.
   Họ không hỏi bạn biết gì. Họ hỏi BẠN ĐÃ MẤT GÌ.
```

### Bản mẫu 30 giây

> *"Con trỏ là một biến lưu **địa chỉ** của một ô nhớ. Nhưng thứ đáng nói hơn là **ai đang sở hữu** ô nhớ đó. Cấp bằng `new` thì phải trả bằng `delete` **đúng một lần**. Xoá xong phải gán lại `nullptr`, vì `delete` dọn ô nhớ chứ **không dọn con trỏ** — và con trỏ treo thì vẫn đọc ra giá trị cũ nên chương trình chạy đúng cho tới lúc ô nhớ đó được cấp lại cho thứ khác. Còn trong dự án thật thì em để `unique_ptr` đứng ra giữ quyền sở hữu, dùng `shared_ptr` chỉ khi thật sự cần chia sẻ, và nhớ `weak_ptr` để phá vòng tham chiếu."*

**Năm câu. Có một cơ chế, một luật, một cái bẫy, và một thực hành.**

## Phần áp dụng cho mọi ngôn ngữ

Nếu bạn không viết C++, đây là phần đáng mang theo nhất.

### Rò rỉ bộ nhớ vẫn xảy ra trong ngôn ngữ có GC

```text
   HIỂU LẦM PHỔ BIẾN:
      "Java/Python/Go có bộ thu gom rác nên không rò rỉ được."

   SỰ THẬT:
      GC chỉ dọn thứ KHÔNG CÒN AI THAM CHIẾU TỚI.
      Nếu bạn VÔ TÌNH GIỮ tham chiếu, GC KHÔNG DÁM DỌN.
      → Vẫn rò rỉ, chỉ là dưới cái tên khác: "unintentional retention".
```

**Năm nguồn rò rỉ hàng đầu trong ngôn ngữ có GC:**

```java
// ① Collection tĩnh chỉ thêm mà không bao giờ xoá
static Map<String, User> cache = new HashMap<>();      // ❌ phình mãi mãi
static Map<String, User> cache = Caffeine.newBuilder()  // ✅ có TTL + giới hạn
        .maximumSize(10_000).expireAfterWrite(10, MINUTES).build();
```

```javascript
// ② Listener đăng ký mà không gỡ
window.addEventListener('resize', handler);
// ✅ phải gỡ khi component bị huỷ
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);   // ◄── dọn
}, []);
```

```java
// ③ Closure / inner class giữ tham chiếu tới đối tượng lớn
// Một lambda nhỏ có thể giữ sống cả một Activity/Service
```

```python
# ④ Vòng tham chiếu — GIỐNG HỆT bẫy shared_ptr ở trên
class Node:
    def __init__(self):
        self.con = []
        self.cha = None        # ❌ con trỏ ngược tạo vòng

# Python có GC theo chu kỳ nên vẫn dọn được, nhưng CHẬM và tốn CPU
# ✅ dùng weakref cho chiều ngược
import weakref
self.cha = weakref.ref(cha)
```

```go
// ⑤ Goroutine bị rò — Go không có GC cho goroutine đang chờ
go func() {
    for v := range ch {   // ❌ nếu không ai đóng ch, goroutine sống mãi
        xu_ly(v)
    }
}()
// ✅ luôn có đường thoát
go func() {
    for {
        select {
        case v, ok := <-ch:
            if !ok { return }
            xu_ly(v)
        case <-ctx.Done():
            return                 // ◄── đường thoát
        }
    }
}()
```

### Ba mô hình quản lý bộ nhớ

| Mô hình | Ngôn ngữ | Ưu | Nhược |
|---|---|---|---|
| **Thủ công** | C, C++ cũ | Kiểm soát tuyệt đối, không có độ trễ bất ngờ | Rò rỉ, con trỏ treo, double free |
| **RAII / Ownership** | C++ hiện đại, **Rust** | An toàn **lúc biên dịch**, không có GC | Đường học dốc |
| **Thu gom rác** | Java, Go, Python, JS | Không phải nghĩ | **Tạm dừng GC**, tốn RAM, vẫn rò được |

**Rust đáng nói riêng** vì nó là câu trả lời hiện đại nhất cho bài toán này:

```rust
// Trình biên dịch KIỂM TRA quyền sở hữu — sai là KHÔNG BIÊN DỊCH ĐƯỢC
let a = String::from("xin chào");
let b = a;                  // quyền sở hữu CHUYỂN sang b
println!("{}", a);          // ❌ LỖI BIÊN DỊCH: a đã bị chuyển nhượng

// → Không có rò rỉ, không có con trỏ treo, không có double free,
//   VÀ KHÔNG CÓ GC. An toàn mà không trả giá lúc chạy.
```

### GC pause — cái giá mà backend phải biết

```text
   Bộ thu gom rác phải DỪNG chương trình để dọn ("stop-the-world").

      Java G1GC:    ~10–200 ms cho heap lớn
      Java ZGC:     < 1 ms (đánh đổi bằng thông lượng)
      Go:           < 1 ms, nhưng chạy thường xuyên hơn
      Python:       đếm tham chiếu tức thì + GC chu kỳ cho vòng

   HỆ QUẢ VỚI BACKEND:
      Độ trễ p99 của API có thể bị GC pause chi phối,
      chứ không phải bởi code của bạn.

   → Nếu p99 nhảy vọt mà p50 vẫn đẹp, hãy nhìn vào GC log
     TRƯỚC KHI đi tối ưu thuật toán.
```

Đây là chi tiết rất ăn điểm khi phỏng vấn backend: **hiểu rằng độ trễ đuôi thường đến từ hạ tầng runtime, không phải từ logic.**

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Dịch vụ Java chạy ổn 6 tiếng rồi bị OOM killer giết. Khởi động lại thì lặp lại. Log không có lỗi nào.

**Đây là kịch bản rò rỉ kinh điển.** Quy trình chẩn đoán:

```text
① XÁC NHẬN đó là rò rỉ, không phải tải tăng
   → biểu đồ heap: sau MỖI lần GC, đáy có CAO DẦN không?
      đáy đi ngang → không rò, chỉ là tải cao
      đáy đi lên   → RÒ RỈ

② CHỤP ẢNH HEAP tại thời điểm gần đầy
   jmap -dump:live,format=b,file=heap.hprof <pid>

③ MỞ BẰNG CÔNG CỤ (Eclipse MAT, VisualVM)
   → tìm "Dominator Tree": đối tượng nào giữ nhiều bộ nhớ nhất
   → tìm "Path to GC Root": AI ĐANG GIỮ nó

④ 90% trường hợp là một trong năm nguồn ở trên:
   collection tĩnh, listener chưa gỡ, closure, vòng tham chiếu, thread/goroutine
```

Công cụ tương đương cho ngôn ngữ khác: `pprof` (Go), `tracemalloc` + `objgraph` (Python), Chrome DevTools Memory (JS), `valgrind`/`heaptrack`/AddressSanitizer (C++).

> **Tình huống 2:** Người phỏng vấn hỏi *"tại sao Go và Java lại chọn GC còn Rust thì không?"*

```text
   ✅ Câu trả lời cho thấy hiểu đánh đổi:

   "Đó là đánh đổi giữa NĂNG SUẤT LẬP TRÌNH VIÊN và
    KIỂM SOÁT ĐỘ TRỄ.

    GC giúp lập trình viên không phải nghĩ về vòng đời bộ nhớ,
    nên viết nhanh hơn và ít lỗi hơn — đúng cho phần lớn ứng dụng
    web và dịch vụ. Cái giá là tạm dừng GC và tốn RAM nhiều hơn,
    và với hệ thống cần độ trễ ổn định ở đuôi thì cái giá đó đáng kể.

    Rust chọn kiểm tra quyền sở hữu ở LÚC BIÊN DỊCH — nên không có
    GC, không có tạm dừng, và vẫn an toàn bộ nhớ. Cái giá là
    đường học dốc và viết chậm hơn lúc đầu.

    Nên em chọn theo bài toán: dịch vụ web thông thường thì Go/Java
    đủ tốt và team đi nhanh hơn; còn thành phần cần độ trễ ổn định
    tuyệt đối — proxy, database engine, hệ nhúng — thì Rust/C++ hợp hơn."
```

> **Tình huống 3:** Bạn không viết C++ mà phỏng vấn vẫn hỏi về con trỏ.

**Đừng giả vờ.** Trả lời trung thực và bắc cầu sang thứ bạn có:

> *"Em chủ yếu làm với Java và Go nên không dùng con trỏ thô hằng ngày. Nhưng bản chất thì em hiểu: con trỏ là biến lưu địa chỉ, và vấn đề thật không phải cú pháp mà là **ai sở hữu ô nhớ đó**. Trong ngôn ngữ có GC thì vấn đề tương đương là **vô tình giữ tham chiếu** — collection tĩnh không bao giờ xoá, listener chưa gỡ, hay goroutine không có đường thoát. Em từng gặp một dịch vụ bị OOM sau sáu tiếng, chụp heap dump ra thì thấy một `HashMap` static dùng làm cache mà không có giới hạn kích thước lẫn TTL."*

**Câu cuối là câu ăn điểm** — nó chứng minh bạn hiểu **bản chất** chứ không phải cú pháp, và bạn có vết sẹo thật.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `new` mà quên `delete` | Rò rỉ — phình dần, không sập ngay | RAII + `unique_ptr` |
| `delete` mà không gán `nullptr` | **Con trỏ treo** — chạy đúng cho tới lúc nổ ở nơi khác | `p = nullptr;` |
| `delete` hai lần | Sập ngay, thường trên máy chủ thật | Gán `nullptr` sau lần đầu |
| Ngoại lệ ném giữa `new` và `delete` | Rò rỉ dù code trông đúng | RAII — dọn tự động khi thoát phạm vi |
| Dùng `shared_ptr` cho mọi thứ | Tốn bộ đếm nguyên tử, và **vòng tham chiếu** | `unique_ptr` là mặc định |
| Vòng tham chiếu `shared_ptr` | Rò rỉ dù đã dùng smart pointer | `weak_ptr` cho chiều ngược |
| Nghĩ "có GC thì không rò được" | Rò dưới tên "vô tình giữ tham chiếu" | Cache có giới hạn + TTL |
| Collection tĩnh làm cache | Phình mãi mãi tới OOM | Caffeine/LRU có `maximumSize` |
| Listener đăng ký không gỡ | Giữ sống cả cây đối tượng | Luôn có hàm dọn |
| Goroutine không có đường thoát | Rò goroutine, GC không dọn được | `select` với `ctx.Done()` |
| Tối ưu thuật toán khi p99 nhảy vọt | Sửa nhầm chỗ — thủ phạm là GC pause | Xem GC log trước |
| Trả về con trỏ tới biến trên stack | Con trỏ treo ngay lập tức | Trả về giá trị, hoặc cấp trên heap |

## Câu hỏi phỏng vấn hay gặp

**H: Con trỏ hoạt động thế nào?**
Nó là một biến lưu **địa chỉ** của một ô nhớ khác; `&` lấy địa chỉ, `*` đi tới địa chỉ đó lấy giá trị. Nhưng thứ đáng nói hơn cú pháp là **ai sở hữu ô nhớ đó** — cấp bằng `new` thì phải trả bằng `delete` đúng một lần, và trong dự án thật thì em để `unique_ptr` đứng ra giữ quyền sở hữu chứ không tự quản lý.

**H: Stack và heap khác gì?**
Biến khai bên trong hàm nằm ở **stack** — hàm chạy xong là cả ngăn bị xoá sạch trong một nhịp, bạn không phải làm gì. Cấp phát bằng `new` nằm ở **heap** — ô nhớ đó là của riêng bạn và **không ai dọn hộ**. Stack rất nhanh nhưng nhỏ (1–8 MB, nên đệ quy sâu là tràn) và kích thước phải biết trước; heap thì tuỳ ý và sống lâu hơn hàm tạo ra nó, nhưng chậm hơn và bạn phải tự trả.

**H: Gọi `delete` xong thì con trỏ trỏ vào đâu?**
Vẫn trỏ vào **chỗ cũ** — `delete` trả ô nhớ về cho hệ thống nhưng **không đụng tới con trỏ**. Và đây mới là chỗ ác: đọc lại nó vẫn ra giá trị cũ, vì hệ thống mới chỉ đánh dấu ô đó là trống chứ chưa ghi đè. Nên chương trình chạy đúng, test pass, trên máy bạn không bao giờ lỗi — cho tới lúc hệ thống cấp lại đúng ô đó cho thứ khác. Cách chữa tốn đúng một dòng: gán `nullptr` sau khi xoá, và gọi `delete nullptr` là hoàn toàn vô hại.

**H: Vì sao rò rỉ bộ nhớ khó phát hiện?**
Vì nó **không sập ngay**. Mỗi lần rò 32 byte, nhân với 10.000 lần mỗi giây là 1,1 GB sau một giờ — biểu đồ bộ nhớ chỉ đi lên đều đặn suốt đêm, tới sáng thì máy chủ hết chỗ và tự khởi động lại, mà **nhật ký không ghi lỗi nào**. Nó không để lại dấu vết ở thời điểm gây lỗi. Cách chẩn đoán là nhìn heap sau mỗi lần GC — nếu **đáy cao dần** thì là rò rỉ, còn đáy đi ngang thì chỉ là tải cao.

**H: Ngôn ngữ có GC thì không rò rỉ được, đúng không?**
Không đúng. GC chỉ dọn thứ **không còn ai tham chiếu tới** — nếu bạn vô tình giữ tham chiếu thì GC không dám dọn. Năm nguồn phổ biến: collection tĩnh chỉ thêm không xoá, listener đăng ký mà quên gỡ, closure giữ sống đối tượng lớn, vòng tham chiếu, và goroutine/thread không có đường thoát. Bản chất giống hệt C++, chỉ khác cái tên.

**H: GC ảnh hưởng gì tới backend?**
Bộ thu gom rác phải **dừng chương trình** để dọn — G1GC có thể tạm dừng 10–200 ms với heap lớn, ZGC dưới 1 ms nhưng đánh đổi thông lượng. Hệ quả là **độ trễ p99 của API có thể bị GC pause chi phối chứ không phải bởi code của bạn**. Nên nếu p99 nhảy vọt mà p50 vẫn đẹp, em nhìn vào GC log **trước khi** đi tối ưu thuật toán.

## Tóm tắt bài 2

- Con trỏ là biến lưu **địa chỉ**; nhưng câu hỏi thật luôn là **ai sở hữu ô nhớ đó**.
- **Stack** tự dọn khi hàm xong (nhanh, nhỏ, cố định); **heap** bạn xin thì bạn phải trả (tuỳ ý, sống lâu, không ai dọn hộ).
- Rò rỉ **không sập ngay** — nó phình dần suốt đêm và không ghi lỗi nào; chẩn đoán bằng cách xem **đáy heap sau mỗi lần GC có cao dần không**.
- `delete` **dọn ô nhớ chứ không dọn con trỏ** → con trỏ treo vẫn đọc ra giá trị cũ nên chương trình chạy đúng cho tới lúc nổ ở nơi khác. Chữa bằng **một dòng `nullptr`**.
- C++ hiện đại: **RAII + `unique_ptr`** là mặc định; `shared_ptr` chỉ khi thật sự chia sẻ quyền sở hữu; `weak_ptr` để **phá vòng tham chiếu**.
- **Ngôn ngữ có GC vẫn rò rỉ** — collection tĩnh, listener chưa gỡ, closure, vòng tham chiếu, goroutine không có đường thoát.
- **GC pause chi phối độ trễ p99** — p99 xấu mà p50 đẹp thì xem GC log trước khi tối ưu thuật toán.
- Cả ba tầng câu hỏi đều xoay quanh: **bạn đã trả giá cho con trỏ bao giờ chưa** — không phải bạn thuộc cú pháp gì.

**Bài kế tiếp** → [Bài 3: MCP — vì sao cần thêm một lớp trên API](03-mcp-vi-sao-can-them-mot-lop-tren-api.md)
