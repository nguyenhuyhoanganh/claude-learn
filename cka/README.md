# Cka

> Lộ trình đầy đủ cho kỳ thi **Certified Kubernetes Administrator**.

15 phase bám sát domain của kỳ thi: kiến trúc cluster và từng thành phần control plane, scheduling, vòng đời ứng dụng, bảo trì cluster, bảo mật, storage, networking, rồi cài cluster bằng kubeadm, Helm, Kustomize và troubleshooting. Kết thúc bằng phần luyện đề và mẹo cho ngày thi.

**50 bài** trong 15 phần.

## Mục lục

### Phase 1 — mo dau

| Bài | Nội dung |
|---|---|
| [01](phase-1-mo-dau/01-tong-quan-cka.md) | Bài 1: Tổng quan về CKA — Certified Kubernetes Administrator |
| [02](phase-1-mo-dau/02-kubernetes-trilogy-va-lo-trinh.md) | Bài 2: Kubernetes Trilogy và lộ trình học |

### Phase 2 — core concepts

| Bài | Nội dung |
|---|---|
| [01](phase-2-core-concepts/01-kien-truc-cluster.md) | Bài 1: Kiến trúc cluster Kubernetes |
| [02](phase-2-core-concepts/02-container-runtime-docker-containerd.md) | Bài 2: Docker vs ContainerD — Vì sao Docker bị deprecated khỏi K8s |
| [03](phase-2-core-concepts/03-etcd-trong-kubernetes.md) | Bài 3: ETCD — Cơ sở dữ liệu của toàn bộ cluster |
| [04](phase-2-core-concepts/04-kube-api-server.md) | Bài 4: Kube-API Server — Cổng vào duy nhất của cluster |
| [05](phase-2-core-concepts/05-controller-manager.md) | Bài 5: Controller Manager — Người gác quy luật của cluster |
| [06](phase-2-core-concepts/06-scheduler.md) | Bài 6: Kube-Scheduler — Quyết định Pod chạy ở đâu |
| [07](phase-2-core-concepts/07-kubelet-kube-proxy.md) | Bài 7: Kubelet & Kube-Proxy — Agent trên mỗi worker node |
| [08](phase-2-core-concepts/08-pods.md) | Bài 8: Pods — Đơn vị nhỏ nhất của K8s |
| [09](phase-2-core-concepts/09-replicasets.md) | Bài 9: ReplicaSets — Đảm bảo số Pod luôn đúng |
| [10](phase-2-core-concepts/10-deployments.md) | Bài 10: Deployments — Rolling update + rollback |
| [11](phase-2-core-concepts/11-services.md) | Bài 11: Services — Stable network endpoint cho Pod |
| [12](phase-2-core-concepts/12-namespaces.md) | Bài 12: Namespaces — Cô lập resource trong cluster |
| [13](phase-2-core-concepts/13-imperative-vs-declarative.md) | Bài 13: Imperative vs Declarative — Kỹ năng cốt lõi cho CKA |

### Phase 3 — scheduling

| Bài | Nội dung |
|---|---|
| [01](phase-3-scheduling/01-manual-scheduling-labels.md) | Bài 1: Manual Scheduling & Labels/Selectors |
| [02](phase-3-scheduling/02-taints-tolerations.md) | Bài 2: Taints & Tolerations — Node "đẩy" Pod |
| [03](phase-3-scheduling/03-node-selectors-affinity.md) | Bài 3: Node Selectors & Node Affinity — Pod "chọn" node |
| [04](phase-3-scheduling/04-resource-requirements-limits.md) | Bài 4: Resource Requirements & Limits |
| [05](phase-3-scheduling/05-daemonsets-static-pods-priority.md) | Bài 5: DaemonSets, Static Pods, Priority Classes |
| [06](phase-3-scheduling/06-multiple-schedulers.md) | Bài 6: Multiple Schedulers & Scheduling Profiles |
| [07](phase-3-scheduling/07-admission-controllers.md) | Bài 7: Admission Controllers — Validate/Mutate request |

### Phase 4 — logging monitoring

| Bài | Nội dung |
|---|---|
| [01](phase-4-logging-monitoring/01-monitor-cluster.md) | Bài 1: Monitor Cluster Components |

### Phase 5 — app lifecycle

| Bài | Nội dung |
|---|---|
| [01](phase-5-app-lifecycle/01-rolling-updates-rollback.md) | Bài 1: Rolling Updates & Rollbacks (deep dive) |
| [02](phase-5-app-lifecycle/02-commands-arguments.md) | Bài 2: Commands & Arguments — Override container entrypoint |
| [03](phase-5-app-lifecycle/03-env-configmap.md) | Bài 3: Environment Variables & ConfigMaps |
| [04](phase-5-app-lifecycle/04-encryption-multi-container.md) | Bài 4: Encryption at Rest & Multi-Container Pods |
| [05](phase-5-app-lifecycle/05-autoscaling.md) | Bài 5: HPA, VPA, In-Place Resize (2025 updates) |

### Phase 6 — cluster maintenance

| Bài | Nội dung |
|---|---|
| [01](phase-6-cluster-maintenance/01-os-upgrade-maintenance.md) | Bài 1: OS Upgrade & Cluster Maintenance |
| [02](phase-6-cluster-maintenance/02-backup-restore-etcd.md) | Bài 2: Backup & Restore ETCD |

### Phase 7 — security

| Bài | Nội dung |
|---|---|
| [01](phase-7-security/01-tls-certificates.md) | Bài 1: TLS Certificates trong K8s |
| [02](phase-7-security/02-kubeconfig.md) | Bài 2: KubeConfig — Quản lý connection đến cluster |
| [03](phase-7-security/03-rbac-authorization.md) | Bài 3: Authentication + Authorization + RBAC |
| [04](phase-7-security/04-service-accounts.md) | Bài 4: ServiceAccounts — Identity cho Pod |
| [05](phase-7-security/05-image-security-context.md) | Bài 5: Image Security + Security Context |
| [06](phase-7-security/06-network-policies.md) | Bài 6: Network Policies |
| [07](phase-7-security/07-crd-operators.md) | Bài 7: Custom Resources & Operators (2025 updates) |

### Phase 8 — storage

| Bài | Nội dung |
|---|---|
| [01](phase-8-storage/01-volumes-pv-pvc.md) | Bài 1: Volumes, PV, PVC |
| [02](phase-8-storage/02-storageclass-csi.md) | Bài 2: StorageClass + Dynamic Provisioning + CSI |

### Phase 9 — networking

| Bài | Nội dung |
|---|---|
| [01](phase-9-networking/01-cluster-networking-cni.md) | Bài 1: Cluster Networking & CNI |
| [02](phase-9-networking/02-dns-coredns.md) | Bài 2: DNS trong Kubernetes — CoreDNS |
| [03](phase-9-networking/03-ingress.md) | Bài 3: Ingress + Gateway API |

### Phase 10 — install design

| Bài | Nội dung |
|---|---|
| [01](phase-10-install-design/01-design-install-cluster.md) | Bài 1: Design + Install Kubernetes Cluster |

### Phase 11 — kubeadm hands on

| Bài | Nội dung |
|---|---|
| [01](phase-11-kubeadm-hands-on/01-kubeadm-install.md) | Bài 1: kubeadm — Install Kubernetes step-by-step |

### Phase 12 — helm

| Bài | Nội dung |
|---|---|
| [01](phase-12-helm/01-helm-basics.md) | Bài 1: Helm — Package Manager cho K8s |

### Phase 13 — kustomize

| Bài | Nội dung |
|---|---|
| [01](phase-13-kustomize/01-kustomize-basics.md) | Bài 1: Kustomize — Manifest customization mà không template |

### Phase 14 — troubleshooting

| Bài | Nội dung |
|---|---|
| [01](phase-14-troubleshooting/01-troubleshoot-pods-apps.md) | Bài 1: Troubleshoot Pod & Application |
| [02](phase-14-troubleshooting/02-troubleshoot-cluster.md) | Bài 2: Troubleshoot Control Plane & Worker Node |
| [03](phase-14-troubleshooting/03-troubleshoot-networking.md) | Bài 3: Troubleshoot Networking |

### Phase 15 — mock exam prep

| Bài | Nội dung |
|---|---|
| [01](phase-15-mock-exam-prep/01-mock-exam-prep.md) | Bài 1: Mock Exam Prep & Tips cho ngày thi |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới bắt đầu ôn CKA | phase-1 rồi phase-2 (13 bài core concepts) |
| Đã dùng K8s, cần ôn thi | phase-3 trở đi, nhớ làm kỹ phase-14 troubleshooting |
| Sắp thi trong tuần | phase-15 + phase-2 bài 13 (imperative vs declarative) |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
