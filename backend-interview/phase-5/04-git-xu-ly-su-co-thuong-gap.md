# Bài 4: Git — xử lý sự cố thường gặp

11 giờ đêm. Bạn vừa gõ `git reset --hard`. Ba tiếng đồng hồ code vừa biến mất khỏi màn hình.

Tim đập nhanh. Bạn mở Google, gõ "git recover lost commits", và mọi kết quả đều nói những thứ bạn không hiểu.

**Tin tốt: trong Git, hầu như không có gì thật sự mất.** Git giữ lại gần như mọi thứ trong ít nhất 30 ngày — chỉ là bạn chưa biết cách nhìn thấy chúng.

Bài này không dạy 21 lệnh Git cơ bản. Nó dạy **mô hình tư duy** để bạn tự suy ra lệnh cần dùng, và **cách thoát khỏi bảy tình huống** khiến người mới hoảng loạn.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa tiếng Việt |
|---|---|
| **Commit** | **Bản ghi** — một ảnh chụp toàn bộ dự án tại một thời điểm |
| **Branch** | **Nhánh** — chỉ là một **con trỏ** trỏ vào một commit |
| **HEAD** | Con trỏ chỉ *"bạn đang đứng ở đâu"* |
| **Working directory** | **Thư mục làm việc** — file bạn đang sửa |
| **Staging area / Index** | **Vùng chờ** — thứ sẽ vào commit tiếp theo |
| **Repository** | **Kho** — nơi chứa lịch sử commit |
| **Remote** | **Kho từ xa** — bản trên GitHub/GitLab |
| **Merge** | **Gộp** — nối hai nhánh, tạo commit gộp |
| **Rebase** | **Ghép lại nền** — viết lại lịch sử, dời commit sang nền mới |
| **Reflog** | **Nhật ký di chuyển** — Git ghi lại **mọi** lần HEAD đổi chỗ |
| **Detached HEAD** | **HEAD rời** — bạn đang đứng ở một commit, không ở nhánh nào |

## Mô hình tư duy: bốn vùng, và commit là gì

Hiểu đúng hai điều này thì 90% lệnh Git tự suy ra được.

```text
   BỐN VÙNG — dữ liệu chảy từ trái sang phải

   ┌──────────────┐  git add   ┌──────────┐  git commit  ┌────────────┐  git push  ┌────────┐
   │ THƯ MỤC      │ ─────────► │ VÙNG CHỜ │ ───────────► │ KHO CỤC BỘ │ ─────────► │ TỪ XA  │
   │ LÀM VIỆC     │            │ (index)  │              │ (.git)     │            │(GitHub)│
   └──────────────┘            └──────────┘              └────────────┘            └────────┘
          ▲                          ▲                          ▲
          │  git checkout --         │  git reset               │  git fetch
          └──────────────────────────┴──────────────────────────┘

   Mọi lệnh Git thực chất chỉ là DI CHUYỂN DỮ LIỆU giữa bốn vùng này.
   Khi bối rối, hãy tự hỏi: "tôi đang muốn chuyển gì, từ vùng nào sang vùng nào?"
```

```text
   COMMIT KHÔNG PHẢI "PHẦN THAY ĐỔI".
   COMMIT LÀ MỘT ẢNH CHỤP TOÀN BỘ DỰ ÁN, kèm con trỏ tới commit cha.

      A ◄── B ◄── C ◄── D
                        ▲
                     main (chỉ là một CON TRỎ)
                        ▲
                      HEAD (bạn đang ở đây)

   NHÁNH CHỈ LÀ MỘT CON TRỎ tới một commit. Nó nhẹ tới mức
   tạo nhánh mới gần như không tốn gì.

   → Vì thế "xoá nhánh" KHÔNG xoá commit. Nó chỉ xoá con trỏ.
     Commit vẫn nằm đó, và reflog vẫn nhớ đường tới nó.
```

**Đây là chìa khoá của toàn bộ bài:** hiểu rằng commit tồn tại độc lập với nhánh, và Git rất khó làm mất dữ liệu **đã commit**.

## Lệnh cứu mạng số một: `git reflog`

```text
   reflog = NHẬT KÝ DI CHUYỂN của HEAD.
   Git ghi lại MỌI lần HEAD đổi chỗ — commit, checkout, reset, merge, rebase.
   Giữ mặc định 90 ngày (30 ngày cho commit không được nhánh nào trỏ tới).

   → Đây là CHIẾC PHAO CỨU SINH cho gần như mọi tai nạn Git.
```

```bash
git reflog
```

```text
a3f9c1d HEAD@{0}: reset: moving to HEAD~3      ← lệnh vừa gây tai nạn
9b2e4f7 HEAD@{1}: commit: them tinh nang X     ← ĐÂY LÀ THỨ BẠN TƯỞNG ĐÃ MẤT
8c1d3a5 HEAD@{2}: commit: sua bug Y
7f0b2e9 HEAD@{3}: checkout: moving from main to feature
```

```bash
# Quay lại đúng chỗ đó
git reset --hard 9b2e4f7
# hoặc tạo nhánh mới từ đó cho an toàn
git branch cuu-ho 9b2e4f7
```

> **Ghi nhớ một câu duy nhất từ bài này: khi hoảng loạn, gõ `git reflog` trước khi làm bất cứ điều gì khác.**

## Bảy tình huống và cách thoát

### ① Commit nhầm — muốn sửa commit vừa tạo

```bash
# Quên thêm một file, hoặc sai chính tả trong message
git add file_quen.py
git commit --amend --no-edit          # gộp vào commit trước, giữ nguyên message
git commit --amend -m "Message đúng"  # hoặc sửa luôn message
```

```text
   ⚠️ `--amend` VIẾT LẠI LỊCH SỬ — nó tạo một commit MỚI thay chỗ commit cũ.
      → Chỉ dùng khi commit đó CHƯA PUSH.
      → Đã push rồi mà amend thì phải force push, và điều đó phá
        lịch sử của người khác (xem tình huống ⑦).
```

### ② Muốn bỏ commit — ba mức, ba hậu quả khác nhau

Đây là chỗ người mới hay nhầm và mất code.

```text
   git reset --soft  HEAD~1
      → BỎ commit, GIỮ thay đổi trong VÙNG CHỜ
      → Dùng khi: muốn gộp mấy commit thành một, hoặc sửa lại rồi commit lại

   git reset --mixed HEAD~1     (mặc định)
      → BỎ commit, GIỮ thay đổi trong THƯ MỤC LÀM VIỆC (bỏ khỏi vùng chờ)
      → Dùng khi: muốn chọn lại file nào vào commit

   git reset --hard  HEAD~1
      → BỎ commit VÀ XOÁ SẠCH thay đổi
      → ⚠️ NGUY HIỂM: thay đổi CHƯA COMMIT sẽ MẤT VĨNH VIỄN
        (reflog chỉ cứu được thứ ĐÃ commit)
```

```text
   HÌNH DUNG:
              commit    vùng chờ    thư mục làm việc
   --soft       bỏ         giữ            giữ
   --mixed      bỏ         bỏ             giữ
   --hard       bỏ         bỏ             XOÁ
```

**Luật an toàn:** trước khi `reset --hard`, chạy `git stash` để cất thay đổi chưa commit vào chỗ an toàn.

### ③ Đã push rồi mà muốn hoàn tác — dùng `revert`, không dùng `reset`

```bash
# ❌ SAI trên nhánh chung — viết lại lịch sử người khác đang dùng
git reset --hard HEAD~1
git push --force

# ✅ ĐÚNG — tạo một commit MỚI đảo ngược commit cũ
git revert <commit-hash>
git push
```

```text
   revert KHÔNG XOÁ lịch sử. Nó THÊM một commit làm ngược lại.

      A ◄── B ◄── C ◄── C'
                        ▲ commit mới, đảo ngược C

   ✓ An toàn tuyệt đối trên nhánh chung
   ✓ Lịch sử trung thực: ai cũng thấy C đã có và đã bị hoàn
```

```text
   QUY TẮC VÀNG:
      Nhánh RIÊNG của bạn, chưa ai dùng → reset/rebase thoải mái
      Nhánh CHUNG (main, develop) đã push → CHỈ dùng revert
```

### ④ Commit nhầm nhánh

```bash
# Đang ở main, lỡ commit 2 commit đáng lẽ thuộc nhánh feature
git branch feature-x           # tạo nhánh mới TẠI ĐÂY (giữ 2 commit)
git reset --hard HEAD~2        # đưa main về chỗ cũ
git checkout feature-x         # sang nhánh mới, code vẫn còn nguyên
```

Hoặc dùng `cherry-pick` khi chỉ cần một commit cụ thể:

```bash
git checkout feature-x
git cherry-pick a3f9c1d        # bê đúng commit đó sang
```

### ⑤ Xung đột khi merge — đọc cho đúng

```text
<<<<<<< HEAD
    gia = tinh_gia_moi(don)          ← code của NHÁNH BẠN ĐANG ĐỨNG
=======
    gia = tinh_gia_cu(don)           ← code của NHÁNH BẠN ĐANG GỘP VÀO
>>>>>>> feature-x
```

```bash
# Xem rõ hơn với 3 phía (thêm cả bản GỐC trước khi hai bên tách nhau)
git config --global merge.conflictstyle diff3

# Sau khi sửa xong
git add file_da_sua.py
git commit                     # hoàn tất merge

# Muốn huỷ giữa chừng, quay về trạng thái trước merge
git merge --abort
```

```text
   ⚠️ SAI LẦM PHỔ BIẾN: xoá dấu <<<< ==== >>>> rồi giữ CẢ HAI đoạn code.
      → Code chạy được, nhưng logic bị nhân đôi.
      → LUÔN chạy test sau khi giải quyết xung đột.
```

### ⑥ Merge hay Rebase — câu hỏi phỏng vấn kinh điển

```text
   MERGE — giữ nguyên lịch sử, tạo commit gộp

      main:     A ── B ─────────── M
                      ╲           ╱
      feature:         C ── D ────
                                  ▲ commit gộp

      ✓ TRUNG THỰC: thấy đúng thứ đã xảy ra, thấy nhánh tách ra từ đâu
      ✓ AN TOÀN: không viết lại gì cả
      ✗ Lịch sử rối khi có nhiều nhánh song song


   REBASE — viết lại, dời commit sang nền mới

      main:     A ── B ── C' ── D'
                            ▲ C và D được VIẾT LẠI trên nền B

      ✓ Lịch sử THẲNG, dễ đọc, dễ `git log`
      ✓ Dễ tìm commit gây lỗi bằng `git bisect`
      ✗ TẠO COMMIT MỚI (hash khác) → phá lịch sử nếu đã chia sẻ
```

```text
   ⚠️ LUẬT VÀNG CỦA REBASE:
      ĐỪNG BAO GIỜ REBASE NHÁNH ĐÃ PUSH VÀ CÓ NGƯỜI KHÁC ĐANG DÙNG.

      Vì rebase tạo commit MỚI với hash khác. Người kia pull về sẽ thấy
      lịch sử phân đôi, và họ sẽ tạo ra một mớ hỗn loạn khi cố gộp lại.
```

**Quy trình thực dụng được nhiều team dùng:**

```bash
# 1. Trên nhánh riêng của mình: rebase để cập nhật với main
git checkout feature-x
git fetch origin
git rebase origin/main         # nhánh của tôi, chưa ai dùng → an toàn

# 2. Gộp vào main: dùng merge (thường qua Pull Request)
#    → giữ được dấu vết "nhóm commit này thuộc về tính năng X"
```

### ⑦ Trót force push và xoá mất commit của người khác

```bash
# ✅ Dùng --force-with-lease thay vì --force, LUÔN LUÔN
git push --force-with-lease
# → Nó TỪ CHỐI nếu remote đã thay đổi kể từ lần fetch cuối của bạn
#   → tức là nếu có ai đó vừa push, bạn sẽ không đè lên họ
```

**Nếu đã lỡ đè mất commit của người khác:**

```bash
# Trên máy CỦA NGƯỜI ĐÓ, commit vẫn còn trong reflog
git reflog
git push origin <hash>:refs/heads/nhanh-cuu-ho

# Hoặc trên GitHub: Settings → có thể khôi phục qua API events
# Hoặc: bất kỳ ai đã fetch gần đây đều còn commit đó trong kho cục bộ
```

**Phòng ngừa ở tầng tổ chức** — quan trọng hơn mọi mẹo cứu chữa:

```text
   ① BẢO VỆ NHÁNH (branch protection) trên GitHub/GitLab
      → chặn force push vào main/develop
      → bắt buộc qua Pull Request
      → bắt buộc CI xanh mới merge được

   ② KHÔNG AI PUSH THẲNG VÀO main. Không có ngoại lệ.
```

## Bảng tra nhanh khi hoảng loạn

| Tình huống | Lệnh |
|---|---|
| **Mất commit sau reset/rebase** | `git reflog` rồi `git reset --hard <hash>` |
| Sửa commit vừa tạo (chưa push) | `git commit --amend` |
| Bỏ commit, giữ code | `git reset --soft HEAD~1` |
| Bỏ commit, xoá code | `git reset --hard HEAD~1` ⚠️ |
| Hoàn tác commit **đã push** | `git revert <hash>` |
| Cất tạm code đang sửa dở | `git stash` → `git stash pop` |
| Bỏ thay đổi một file chưa commit | `git restore <file>` |
| Bỏ file khỏi vùng chờ | `git restore --staged <file>` |
| Commit nhầm nhánh | `git branch new` → `git reset --hard HEAD~n` |
| Bê một commit sang nhánh khác | `git cherry-pick <hash>` |
| Huỷ merge đang dở | `git merge --abort` |
| Huỷ rebase đang dở | `git rebase --abort` |
| Xem ai sửa dòng này | `git blame <file>` |
| Tìm commit gây ra lỗi | `git bisect start` → `good`/`bad` |
| Xoá file đã lỡ commit | `git rm --cached <file>` + thêm vào `.gitignore` |
| Xem thay đổi trước khi commit | `git diff` (chưa add) / `git diff --staged` |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn lỡ commit file `.env` chứa khoá API, và đã push lên GitHub.

**Đây là sự cố bảo mật, không phải sự cố Git.** Thứ tự xử lý rất quan trọng:

```text
   ⚠️ BƯỚC ĐẦU TIÊN KHÔNG PHẢI XOÁ COMMIT.

   ① XOAY KHOÁ NGAY LẬP TỨC
      Coi như khoá đó ĐÃ BỊ LỘ VĨNH VIỄN.
      Bot quét GitHub tìm khoá chạy liên tục — có nghiên cứu cho thấy
      khoá bị phát hiện trong vòng vài phút sau khi push.
      → Vô hiệu hoá khoá cũ, cấp khoá mới. LÀM VIỆC NÀY TRƯỚC.

   ② Rồi mới dọn lịch sử
```

```bash
# Bước ②: xoá file khỏi TOÀN BỘ lịch sử
# git-filter-repo là công cụ được khuyến nghị (nhanh và an toàn hơn filter-branch)
pip install git-filter-repo
git filter-repo --path .env --invert-paths

git push --force --all         # phải force vì lịch sử đã đổi
git push --force --tags

# Bước ③: chặn tái diễn
echo ".env" >> .gitignore
git rm --cached .env
git commit -m "Bỏ .env khỏi theo dõi"
```

```bash
# Bước ④: quét tự động, chặn ngay tại máy dev
pip install detect-secrets    # hoặc gitleaks
detect-secrets scan > .secrets.baseline
# Đặt vào pre-commit hook để nó chặn TRƯỚC khi commit
```

```text
   ⚠️ LƯU Ý QUAN TRỌNG:
      GitHub vẫn giữ commit cũ trong cache và trong các fork.
      Xoá lịch sử KHÔNG đảm bảo khoá biến mất khỏi Internet.
      → Đó là lý do bước ① (xoay khoá) là bước duy nhất thật sự cứu bạn.
```

> **Tình huống 2:** Một bug xuất hiện, nhưng không ai biết nó vào từ commit nào. Có 300 commit từ lần chạy đúng cuối cùng.

**`git bisect`** — tìm nhị phân trên lịch sử. 300 commit chỉ cần **9 lần thử** (log₂300 ≈ 8,2).

```bash
git bisect start
git bisect bad                 # commit hiện tại có bug
git bisect good v1.2.0         # phiên bản này chạy đúng

# Git tự checkout commit ở giữa. Bạn kiểm thử rồi báo:
git bisect good     # commit này ổn
# hoặc
git bisect bad      # commit này có bug

# ... lặp lại ~9 lần, Git chỉ ra chính xác commit gây lỗi
git bisect reset               # quay về trạng thái ban đầu
```

```bash
# Tự động hoá hoàn toàn nếu có script kiểm thử
git bisect start HEAD v1.2.0
git bisect run pytest tests/test_bug.py
# → Git tự chạy, tự tìm, và in ra commit thủ phạm
```

**Đây là lệnh Git giá trị nhất mà ít người dùng** — và nói được nó trong phỏng vấn tạo ấn tượng rất tốt.

> **Tình huống 3:** Người phỏng vấn hỏi *"team bạn dùng chiến lược nhánh nào?"*

```text
   ✅ Câu trả lời cho thấy hiểu đánh đổi, không đọc thuộc:

   "Bọn em dùng TRUNK-BASED: nhánh tính năng sống ngắn, dưới 2-3 ngày,
    rồi merge vào main qua Pull Request. Tính năng chưa xong thì giấu
    sau FEATURE FLAG thay vì giữ nhánh dài.

    Lý do: nhánh sống càng lâu thì xung đột càng lớn và càng khó merge —
    chi phí tăng theo cấp số nhân chứ không tuyến tính. Nhánh 2 ngày
    thì merge trong 5 phút; nhánh 3 tuần có thể mất cả ngày.

    Git Flow với develop, release, hotfix thì em thấy hợp với sản phẩm
    có phiên bản rõ ràng — phần mềm cài đặt, app mobile phải qua kiểm duyệt.
    Với dịch vụ web deploy nhiều lần mỗi ngày thì nó thêm tầng không cần thiết.

    Và bọn em bảo vệ nhánh main: chặn force push, bắt buộc qua PR,
    bắt buộc CI xanh mới merge được."
```

> **Tình huống 4:** Bạn đang sửa dở thì sếp bảo sửa gấp một bug ở nhánh khác.

```bash
# ✅ Cất tạm, không cần commit dở dang
git stash push -m "dang lam tinh nang X"
git checkout hotfix
# ... sửa bug, commit, push ...

git checkout feature-x
git stash pop                  # lấy lại y nguyên

# Xem có gì trong kho cất tạm
git stash list
git stash show -p stash@{0}    # xem nội dung
```

```text
   ⚠️ `git stash` mặc định KHÔNG cất file chưa được theo dõi (untracked).
      → dùng `git stash -u` để cất cả file mới tạo.
      → Đây là lý do nhiều người "mất" file sau khi stash.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `reset --hard` khi có code chưa commit | **Mất vĩnh viễn** — reflog không cứu được | `git stash` trước |
| `reset` trên nhánh chung đã push | Phá lịch sử người khác | Dùng `revert` |
| `git push --force` | Đè mất commit người khác | `--force-with-lease` |
| Rebase nhánh đã chia sẻ | Lịch sử phân đôi, hỗn loạn | Chỉ rebase nhánh riêng |
| Giữ cả hai đoạn khi giải xung đột | Logic nhân đôi, chạy sai | Đọc kỹ + **chạy test** |
| Commit file `.env`, khoá API | Lộ khoá vĩnh viễn | **Xoay khoá trước**, rồi mới dọn |
| Tưởng xoá lịch sử là khoá an toàn | GitHub giữ cache và fork | Coi khoá đã lộ là mất |
| `git stash` quên `-u` | File mới tạo không được cất | `git stash -u` |
| Nhánh sống nhiều tuần | Xung đột khổng lồ khi merge | Nhánh ngắn + feature flag |
| Push thẳng vào main | Không ai review, dễ hỏng | Branch protection + PR |
| Commit message vô nghĩa (`fix`, `update`) | Không ai hiểu lịch sử | Ghi **vì sao**, không chỉ **cái gì** |
| Không dùng `.gitignore` | Commit `node_modules`, file build | Dùng template chuẩn |
| Hoảng loạn rồi gõ lệnh bừa | Làm tình hình tệ hơn | **`git reflog` trước tiên** |

## Câu hỏi phỏng vấn hay gặp

**H: `git merge` và `git rebase` khác gì? Chọn cái nào?**
Merge **giữ nguyên lịch sử** và tạo một commit gộp — trung thực, an toàn, thấy được nhánh tách ra từ đâu, nhưng lịch sử rối khi có nhiều nhánh song song. Rebase **viết lại lịch sử**, dời commit sang nền mới nên lịch sử thẳng và dễ đọc, dễ dùng `git bisect` — nhưng nó tạo commit mới với hash khác. Luật vàng: **đừng bao giờ rebase nhánh đã push và có người khác đang dùng**. Quy trình em dùng là rebase trên nhánh riêng để cập nhật với main, rồi merge vào main qua Pull Request.

**H: Lỡ `reset --hard` mất commit thì làm sao?**
Gõ **`git reflog`** trước khi làm bất cứ điều gì khác. Nó là nhật ký ghi lại mọi lần HEAD đổi chỗ, giữ khoảng 30–90 ngày, nên commit "mất" vẫn còn đó — chỉ là không có nhánh nào trỏ tới nữa. Tìm hash rồi `git reset --hard <hash>` hoặc an toàn hơn là `git branch cuu-ho <hash>`. **Lưu ý quan trọng: reflog chỉ cứu được thứ đã commit** — thay đổi chưa commit mà bị `reset --hard` thì mất vĩnh viễn, nên phải `git stash` trước.

**H: `reset` và `revert` khác gì?**
`reset` **dời con trỏ nhánh về sau**, tức là viết lại lịch sử — chỉ an toàn trên nhánh riêng chưa ai dùng. `revert` **tạo một commit mới làm ngược lại** commit cũ, không xoá gì cả — an toàn tuyệt đối trên nhánh chung, và lịch sử trung thực vì ai cũng thấy commit đó đã có và đã bị hoàn. Quy tắc: nhánh riêng thì `reset` thoải mái, nhánh chung đã push thì **chỉ dùng `revert`**.

**H: Lỡ commit file chứa khoá API và đã push, xử lý thế nào?**
Bước đầu tiên **không phải xoá commit** mà là **xoay khoá ngay lập tức** — coi như nó đã lộ vĩnh viễn, vì bot quét GitHub tìm khoá chạy liên tục và có thể phát hiện trong vài phút. Sau đó mới dọn lịch sử bằng `git filter-repo`, thêm vào `.gitignore`, và đặt công cụ quét bí mật như `gitleaks` vào pre-commit hook. Lưu ý: GitHub vẫn giữ commit cũ trong cache và trong các fork, nên **xoá lịch sử không đảm bảo khoá biến mất khỏi Internet** — bước xoay khoá là bước duy nhất thật sự cứu bạn.

**H: Có một bug mà không biết commit nào gây ra, trong 300 commit?**
`git bisect` — tìm nhị phân trên lịch sử, 300 commit chỉ cần khoảng 9 lần thử. Đánh dấu commit hiện tại là `bad` và một phiên bản chạy đúng là `good`, Git tự checkout commit ở giữa và bạn báo lại kết quả. Nếu có script kiểm thử tự động thì dùng `git bisect run pytest tests/...` — Git tự chạy, tự tìm, và in ra commit thủ phạm.

**H: Team bạn dùng chiến lược nhánh nào?**
**Trunk-based**: nhánh tính năng sống ngắn dưới 2–3 ngày rồi merge vào main qua PR, tính năng chưa xong thì giấu sau feature flag. Lý do là chi phí merge tăng **theo cấp số nhân** chứ không tuyến tính theo tuổi nhánh — nhánh 2 ngày merge trong 5 phút, nhánh 3 tuần có thể mất cả ngày. Git Flow hợp với sản phẩm có phiên bản rõ ràng như phần mềm cài đặt hoặc app mobile phải qua kiểm duyệt; với dịch vụ web deploy nhiều lần mỗi ngày thì nó thêm tầng không cần thiết.

## Tóm tắt bài 4

- Hai mô hình tư duy giải thích 90% lệnh Git: **bốn vùng** (thư mục → vùng chờ → kho cục bộ → từ xa), và **commit là ảnh chụp toàn bộ, nhánh chỉ là con trỏ**.
- **Khi hoảng loạn, gõ `git reflog` trước tiên** — nó nhớ mọi lần HEAD đổi chỗ trong 30–90 ngày.
- `reset` có ba mức: `--soft` (giữ vùng chờ), `--mixed` (giữ thư mục), `--hard` (**xoá sạch — reflog không cứu được thứ chưa commit**).
- **Nhánh riêng thì `reset`/`rebase` thoải mái; nhánh chung đã push thì chỉ `revert`.**
- Rebase cho lịch sử thẳng nhưng **tạo commit mới** — đừng bao giờ rebase nhánh người khác đang dùng.
- Luôn dùng **`--force-with-lease`** thay `--force`; và bảo vệ nhánh main ở tầng tổ chức là quan trọng hơn mọi mẹo cứu chữa.
- Lộ khoá trong commit: **xoay khoá trước, dọn lịch sử sau** — vì GitHub giữ cache và fork.
- **`git bisect`** tìm commit gây lỗi trong 300 commit chỉ với 9 lần thử — và tự động hoá được bằng `bisect run`.

**Bài kế tiếp** → [Bài 5: Excel cho dev — VLOOKUP, INDEX MATCH hay XLOOKUP](05-excel-cho-dev-vlookup-index-match-xlookup.md)
