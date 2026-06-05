# Bài 41: Debugging trong VSCode — breakpoint, step, watch, call stack

`println!` rải khắp code để xem giá trị là cách debug "thủ công" — chậm và bẩn. Có cách tốt hơn: **debugger** dừng chương trình tại dòng bạn chọn, cho xem **mọi** biến tại thời điểm đó, rồi bước qua từng dòng. Với recursion (bài 40) — nơi nhiều tầng gọi chồng nhau — debugger gần như bắt buộc để hiểu. Bài này: cài đặt và dùng debugger Rust trong VSCode.

## Debugging là gì

**Debugging** = quá trình tìm và sửa lỗi (bug) trong code. Debugger cho phép **chạy từng bước**: thay vì chạy một mạch, ta **dừng** (pause) tại các điểm chọn trước, xem trạng thái chương trình, rồi tiếp tục từng bước.

## Cài đặt: extension theo hệ điều hành

Để debug Rust trong VSCode cần một extension (khác nhau theo OS):

| Hệ điều hành | Extension cần cài |
|---|---|
| **macOS / Linux** | **CodeLLDB** (tác giả Vadim Chugunov) |
| **Windows** | **C/C++** (Microsoft) |

Vào pane Extensions (icon các khối xếp chồng), tìm tên trên, bấm Install. (Lạ là phải cài công cụ cho C/C++, nhưng phần lõi của chúng giúp debug Rust — giống việc cài C++ build tools để setup Rust trên Windows.)

Một setting cần bật (thường đã sẵn trong workspace khoá học): Command Palette (`Cmd/Ctrl+Shift+P`) → "Preferences: Open Settings (UI)" → tab Workspace → tìm "breakpoints everywhere" → tick **Debug: Allow Breakpoints Everywhere**.

## Breakpoint — điểm dừng

**Breakpoint** = dòng nơi chương trình **tạm dừng** *trước khi* dòng đó chạy. Đặt bằng cách bấm vào **lề trái** (gutter) cạnh số dòng — một chấm đỏ xuất hiện:

```text
   1  fn countdown(seconds: i32) {
●  2      if seconds == 0 {          ← chấm đỏ = breakpoint
   3          println!("Phóng!");
●  4      } else {                    ← breakpoint thứ 2
   5          ...
```

Đặt được nhiều breakpoint. Mỗi cái đánh dấu nơi muốn dừng quan sát. Bấm lại để xoá; bỏ tick trong panel Breakpoints để **tạm tắt** (giữ lại nhưng bỏ qua).

## Chạy ở Debug Mode

Hai cách vào debug mode:
1. Pane **Run and Debug** (icon play + con bọ) → bấm "Run and Debug" → chọn debugger (LLDB cho Mac/Linux, C++ cho Windows). Lần đầu, VSCode hỏi tạo `launch.json` (cấu hình) — bấm Yes, nó tự tạo từ `Cargo.toml`.
2. Nút **Debug** nhỏ ngay trên hàm `main` (cạnh nút Run) — lối tắt làm điều tương tự.

Khi chạy, chương trình dừng tại breakpoint đầu tiên: dòng đó **highlight vàng**, nghĩa là "đang dừng ở đây, dòng này **chưa** chạy".

## Quan sát biến: Variables, Debug Console, Watch

Khi đang dừng, xem giá trị biến qua ba nơi:

**1. Panel Variables** (góc trên trái) — liệt kê **mọi** biến đang sống và giá trị hiện tại. Đang dừng ở `countdown(5)` → thấy `seconds = 5`.

**2. Debug Console** — gõ `?` + space + tên biến để in giá trị:
```text
? seconds
5
```

**3. Panel Watch** — nhập một **expression** để theo dõi; nó **tự tính lại** mỗi khi dừng:
```text
seconds * 2     → 10  (khi seconds=5)
                → 8   (tự cập nhật khi seconds=4)
```
Watch tiện cho giá trị **dẫn xuất** không có sẵn trong code (vd "seconds nhân đôi"). Lưu ý: Watch đôi khi bị giới hạn với biểu thức Rust phức tạp (if/else trong watch có thể không chạy) — khi đó khai một biến tạm trong code thay thế.

## Continue — nhảy tới breakpoint kế

Nút **Continue** (F5) chạy tiếp tới breakpoint **kế tiếp**. Với recursion `countdown`, mỗi Continue đưa tới lần gọi đệ quy tiếp theo:

```text
Dừng ở countdown(5), seconds=5  → Continue →
Dừng ở countdown(4), seconds=4  → Continue →
Dừng ở countdown(3), seconds=3  → ...
```

Đây là cách tuyệt vời thấy recursion "thật": từng tầng gọi, `seconds` giảm dần.

## Call Stack — xem chuỗi gọi hàm

Panel **Call Stack** hiển thị **mọi hàm đang chạy**, mới nhất trên cùng. Với recursion, thấy rõ các frame chồng nhau (đúng như mô tả call stack ở bài 40):

```text
Call Stack:
  countdown   (seconds=3)   ← mới nhất, đang dừng ở đây
  countdown   (seconds=4)
  countdown   (seconds=5)
  main                       ← gốc
```

Đây là hình ảnh trực quan của call stack — bằng chứng sống cho cơ chế đệ quy. Bấm vào một frame để xem biến của tầng đó.

## Các nút điều hướng: Step Over / Into / Out

Ngoài Continue (nhảy theo breakpoint), có ba nút bước **theo dòng/hàm** (cần ít nhất một breakpoint để đang dừng):

| Nút | Phím | Tác dụng |
|---|---|---|
| **Step Over** | F10 | Chạy dòng hiện tại, **bỏ qua** nội bộ hàm được gọi; sang dòng kế |
| **Step Into** | F11 | **Đi vào** trong hàm được gọi để xem từng dòng |
| **Step Out** | Shift+F11 | Chạy nốt hàm hiện tại, **quay lên** hàm gọi nó |
| **Restart** | — | Bắt đầu lại từ đầu |
| **Stop** | — | Dừng debug |

```text
Đang ở dòng: countdown(seconds - 1);

Step Over → chạy cả countdown đó, không vào trong, sang dòng kế
Step Into → đi VÀO countdown(4), dừng ở dòng đầu của nó
Step Out  → (nếu đang trong countdown(4)) chạy hết nó, quay về countdown(5)
```

- **Step Over**: dùng khi tin hàm đó đúng, không cần xem trong.
- **Step Into**: dùng khi nghi hàm đó có bug, muốn xem từng dòng. Nếu dòng không có lời gọi hàm, Step Into = sang dòng kế (như tạo breakpoint tự động từng dòng).
- **Step Out**: dùng khi lỡ đi sâu quá, muốn quay lên tầng trên.

## Đào sâu: debugger vs `println!`

| | `println!` debug | Debugger |
|---|---|---|
| Setup | Không cần | Cài extension + launch.json |
| Xem biến | Chỉ cái bạn in trước | **Mọi** biến, bất cứ lúc nào |
| Sửa code để debug | Có (thêm/xoá println) | Không (đặt breakpoint) |
| Bước từng dòng | Không | Có |
| Xem call stack | Không | Có |
| Phù hợp | Lỗi đơn giản, nhanh | Logic phức tạp, recursion, nhiều biến |

`println!` vẫn ổn cho kiểm tra nhanh một giá trị. Nhưng với bug phức tạp — recursion, nhiều biến tương tác, không rõ chương trình đi nhánh nào — debugger tiết kiệm thời gian khổng lồ vì cho **toàn cảnh** trạng thái mà không phải sửa code.

> Bonus: **conditional breakpoint** — chuột phải vào breakpoint → "Edit Breakpoint" → nhập điều kiện (vd `seconds == 2`). Chương trình chỉ dừng khi điều kiện đúng — cực hữu ích trong vòng lặp/đệ quy dài, khỏi bấm Continue hàng chục lần.

## Quy trình debug điển hình

```text
1. Đặt breakpoint tại dòng nghi ngờ.
2. Chạy Debug mode → dừng tại breakpoint.
3. Xem Variables / Call Stack → trạng thái có đúng kỳ vọng?
4. Step Over/Into từng dòng, quan sát biến thay đổi.
5. Tìm dòng nơi giá trị sai lệch so với kỳ vọng → đó là vùng bug.
6. Sửa, xoá breakpoint, chạy lại xác nhận.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên cài extension đúng OS | Debug không chạy | CodeLLDB (Mac/Linux), C/C++ (Windows) |
| Không có breakpoint nào | Chương trình chạy thẳng, không dừng | Đặt ít nhất một breakpoint |
| Tưởng dòng highlight đã chạy | Hiểu sai trạng thái | Dòng vàng **chưa** chạy |
| Step Into vào code nội bộ Rust | Lạc sâu không cần thiết | Step Out hoặc Continue ra |
| Để breakpoint trong code production | (chỉ ảnh hưởng lúc debug) | Xoá khi xong |
| Bấm Continue hàng chục lần trong loop | Mất thời gian | Dùng conditional breakpoint |

## Tóm tắt bài 41

- **Debugger** dừng chương trình tại **breakpoint** (bấm lề trái), xem trạng thái trước khi dòng đó chạy.
- Cài extension theo OS: **CodeLLDB** (Mac/Linux), **C/C++** (Windows); bật "breakpoints everywhere".
- Xem biến qua **Variables**, **Debug Console** (`? var`), **Watch** (expression tự tính lại).
- **Continue** (F5) nhảy breakpoint kế; **Call Stack** hiện chuỗi hàm đang chạy (thấy rõ recursion).
- **Step Over** (bỏ qua nội bộ), **Step Into** (đi vào hàm), **Step Out** (quay lên tầng trên).
- Debugger vượt `println!` cho bug phức tạp; conditional breakpoint cho vòng lặp/đệ quy dài.

**Bài kế tiếp** → [Bài 42: Project & Section Review — giai thừa (lặp & đệ quy), tổng kết Control Flow](09-project-va-review.md)
