# Bài 1: Tổng quan về CKA — Certified Kubernetes Administrator

## Vì sao CKA đáng giá?

Kubernetes là **platform phổ biến nhất** để host application production trên cloud — Netflix, Airbnb, Spotify, OpenAI đều chạy trên K8s. Theo khảo sát Indeed gần đây, **job search liên quan đến Kubernetes tăng 173%** trong 1 năm — đứng đầu trong các công nghệ cloud-native.

Vấn đề: cầu lớn nhưng cung kỹ sư biết K8s thật sự (không phải chỉ "biết cài kubectl") rất thấp. Lương DevOps/SRE/Platform Engineer có CKA cao hơn rõ rệt so với người tự học không cert.

**CKA = Certified Kubernetes Administrator** — chứng chỉ chính thức của **CNCF (Cloud Native Computing Foundation)** phối hợp với **The Linux Foundation**. Đây là cert được công nhận quốc tế, không phụ thuộc cloud provider (khác với AWS/Azure certs).

## CKA khác gì các cert thông thường?

| | Cert thông thường (AWS, Azure...) | CKA |
|---|---|---|
| Format | Multiple choice | **Hands-on lab** (làm thật trên cluster) |
| Thời gian | 90-180 phút | 120 phút (mới rút từ 3h) |
| Số câu | 60-70 câu chọn đáp án | 15-20 task thực tế phải hoàn thành |
| Browser tools | Không cho dùng | **Được mở docs Kubernetes** (kubernetes.io) |
| Yêu cầu | Học thuộc | Phải **làm được**, gõ lệnh nhanh, sửa cluster lỗi |
| Pass score | ~70-75% | **66%** (kỳ thi cập nhật mới) |

Đây là điểm độc đáo: bạn **không cần học thuộc** một con số nào. Mở docs đọc thoải mái. Nhưng phải đủ nhanh để làm xong 15-20 task trong 2 giờ.

## Yêu cầu kỹ thuật cho kỳ thi

Kỳ thi diễn ra **online qua trình duyệt**, có **proctor (giám thị)** giám sát qua webcam. Yêu cầu môi trường:

- **Phòng**: Tối, không có người khác, không có giấy/ghi chú trên bàn.
- **Máy tính**: Chỉ 1 màn hình, không được dùng 2 monitor.
- **Mạng**: Kết nối ổn định (tối thiểu 5 Mbps upload, latency thấp).
- **Webcam + microphone**: Bắt buộc.
- **Browser**: Chrome hoặc Edge (PSI Secure Browser).

Chi tiết đầy đủ trong **Candidate Handbook** tại CNCF certification page. **Đọc kỹ trước khi đăng ký** — nhiều người fail vì lỗi môi trường, không phải lỗi kiến thức.

## Cấu trúc đề thi (CKA v1.32, cập nhật 2025)

5 domain (tỉ lệ điểm):

```text
Storage                                    10%
Troubleshooting                            30%   ← lớn nhất, quan trọng nhất
Workloads & Scheduling                     15%
Cluster Architecture, Installation & Config 25%
Services & Networking                       20%
```

→ **Troubleshooting chiếm 30%**. Bạn sẽ được giao cluster đang **lỗi sẵn** và phải sửa cho hoạt động. Đây là phần khác biệt lớn nhất so với học lý thuyết — phải biết debug thật.

## Free retake — Một thi lại miễn phí

Khác với đa số cert khác, CKA cho phép **1 lần thi lại miễn phí** trong 12 tháng kể từ ngày đăng ký nếu lần đầu fail. Giảm rủi ro tài chính ($395 USD/lần thi).

**Khuyến nghị thực tế**: Đăng ký lần đầu sau khi học xong khoá này + làm killer.sh (2 mock exam đi kèm khi đăng ký) 2-3 lần. Nếu fail lần đầu, ôn lại đúng phần fail rồi thi lại.

## Lộ trình học để đậu CKA

```text
[Giai đoạn 1: Foundation — 2-4 tuần]
   - Hiểu kiến trúc K8s (control plane + worker)
   - Pod, Deployment, Service, Namespace
   - kubectl thành thạo cả imperative + declarative
        ↓
[Giai đoạn 2: Practical — 2-3 tuần]
   - Scheduling: taints, tolerations, affinity
   - Networking: Service types, Ingress, NetworkPolicy
   - Storage: PV, PVC, StorageClass
   - Security: RBAC, ServiceAccount
        ↓
[Giai đoạn 3: Cluster admin — 1-2 tuần]
   - kubeadm: tự cài cluster từ đầu
   - Backup + restore ETCD
   - Upgrade cluster K8s version
   - Troubleshoot: node NotReady, pod CrashLoopBackOff, ...
        ↓
[Giai đoạn 4: Mock & speed — 1-2 tuần]
   - killer.sh (kèm trong đăng ký thi)
   - Mock exam của khoá học
   - Luyện kubectl alias, vim shortcut để gõ nhanh
        ↓
[Lần đầu thi: tỉ lệ pass cao nếu hoàn thành đủ giai đoạn trên]
```

Tổng thời gian: **6-10 tuần** nếu học part-time (2-3h/ngày). Người đã có kinh nghiệm DevOps có thể rút xuống 4-5 tuần.

## Tài nguyên chính thức (cho phép mở khi thi)

3 nguồn được phép truy cập trong kỳ thi:

| Nguồn | URL | Dùng cho |
|---|---|---|
| Kubernetes docs | kubernetes.io | Tài liệu chính, có sẵn YAML mẫu |
| Kubernetes blog | kubernetes.io/blog | Thông tin về feature mới |
| Kubernetes GitHub | github.com/kubernetes | Source code reference |

**Quan trọng**: Trong kỳ thi bạn sẽ liên tục copy YAML từ docs về sửa. **Phải biết tìm nhanh** trong docs — luyện trước. Đừng tìm "make sure that..." dài dòng, search trực tiếp keyword (vd: `taint`, `nodeAffinity`, `PersistentVolumeClaim`).

## Kỹ năng cần luyện kèm

CKA không chỉ test kiến thức K8s, mà cả **kỹ năng vận hành Linux + terminal**:

- **vim** (hoặc nano): Edit YAML cực nhanh. Học các shortcut: `dd` xoá dòng, `yy` copy dòng, `:set paste` để paste không lỗi indent.
- **Bash**: Pipes, grep, awk, find — bạn sẽ debug log nhiều.
- **YAML**: Hiểu indent (2 space), list (`-`), map (`:`).
- **kubectl alias**: Khoá học sẽ dạy setup `alias k=kubectl` + autocomplete để gõ nhanh.

Người fail CKA thường không phải vì không biết K8s, mà vì **gõ chậm + tìm docs chậm** → không kịp giờ.

## Kỳ vọng thực tế sau khi đậu CKA

CKA chứng minh bạn có thể:
- Thiết kế và build HA Kubernetes cluster.
- Vận hành: monitor, upgrade, backup, troubleshoot.
- Quản trị workload: schedule, scale, secure.

Không có nghĩa là bạn:
- Đã master mọi production pattern.
- Biết hết về service mesh, GitOps, advanced networking (Cilium, Calico).
- Là kiến trúc sư cloud-native.

→ CKA là **bằng cấp đầu vào** cho công việc K8s — không phải đỉnh cao. Sau CKA nên học tiếp **CKAD** (Developer) hoặc **CKS** (Security) tuỳ định hướng.

## Course này khác gì các course CKA khác?

Course này (Mumshad Mannambeth + KodeKloud) là **course CKA phổ biến nhất thế giới** với lý do:

1. **Animation + analogy**: Mỗi concept giải thích bằng hình minh hoạ + ví dụ đời thực (vd: K8s như đội tàu hàng + tàu chỉ huy). Concept khó như ETCD, RBAC trở nên dễ hiểu.
2. **Hands-on labs trong browser**: Không cần setup môi trường — click 1 nút là có cluster thật để thực hành.
3. **Hundreds of practice questions**: Mỗi topic có 5-15 câu lab, đủ thấm.
4. **Updated quarterly**: Đề thi đổi mỗi quý → course cũng update theo.
5. **CNCF certified training partner**: Course được CNCF công nhận.

## Tóm tắt bài 1

- **CKA** = chứng chỉ hands-on (làm thật, không trắc nghiệm), 120 phút, được mở docs khi thi.
- Phân bố điểm: **Troubleshooting 30%**, Cluster Architecture 25%, Networking 20%, Workloads 15%, Storage 10%.
- Pass score **66%**, có **1 lần thi lại miễn phí** trong 12 tháng.
- Lộ trình **6-10 tuần** từ zero đến đậu (part-time).
- Kỹ năng cần: K8s + Linux + vim + bash + tốc độ gõ.
- Khoá này cover toàn bộ syllabus + hàng trăm lab thực hành trong browser.

**Bài kế tiếp** → [Bài 2: Kubernetes Trilogy và lộ trình học](02-kubernetes-trilogy-va-lo-trinh.md)
