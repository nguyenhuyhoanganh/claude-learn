# Bài 5: Subscription queries — biết trạng thái tổng của Saga

Hiện API đổi số trả **200 ngay lập tức**, bất kể Saga sau đó thành công hay rollback — client không biết kết quả thật. Bài này dùng **subscription query** của Axon để client **chờ** tới khi Saga hoàn tất (thành công hẳn hoặc rollback hẳn) rồi mới nhận trạng thái tổng. Đây cũng là bài cuối của Orchestration.

## Bốn loại query của Axon

| Loại | Dùng khi |
|---|---|
| **Point-to-point** | Query thường, một query handler, một kết quả (ta đã dùng ở Phase 3: `query().join()`) |
| **Scatter-gather** | Nhiều query handler cùng trả lời một query → gom nhiều kết quả |
| **Subscription** | Nhận **trạng thái ban đầu** + **các cập nhật tiếp theo** tới khi xong → **đây là cái ta cần** |
| **Streaming** | Stream kết quả lớn (hàng nghìn record) theo kiểu reactive (như stream video YouTube) |

> **Subscription query** cho phép client lấy state ban đầu của model nó truy vấn và **giữ cập nhật** khi model đổi. Trong Saga, ta dùng nó để **chờ** kết quả mà Saga Manager sẽ "phát ra" (emit) ở cuối luồng.

## Phía controller: mở subscription query và chờ

Trong `CustomerCommandController`, **trước** khi dispatch command khởi đầu Saga, mở subscription query:

```java
@PatchMapping("/mobile-number")
public ResponseEntity<ResponseDto> updateMobileNumber(@Valid @RequestBody MobileNumberUpdateDto dto) {
    FindCustomerQuery query = new FindCustomerQuery(dto.getCurrentMobileNumber());

    try (SubscriptionQueryResult<ResponseDto, ResponseDto> queryResult =
             queryGateway.subscriptionQuery(
                 query,
                 ResponseTypes.instanceOf(ResponseDto.class),   // kiểu state ban đầu
                 ResponseTypes.instanceOf(ResponseDto.class))) { // kiểu các update tiếp theo

        // dispatch command khởi đầu Saga ... (ở đây)

        return ResponseEntity.ok(
            queryResult.updates().blockFirst());   // CHỜ update đầu tiên Saga emit
    }
}
```

| Thành phần | Ý nghĩa |
|---|---|
| `subscriptionQuery(query, initialType, updateType)` | 3 tham số: query, kiểu state ban đầu, kiểu update tiếp theo |
| `queryResult.updates().blockFirst()` | **Chặn** thread tới khi nhận **update đầu tiên** (chính là trạng thái tổng Saga emit). `blockFirst(Duration)` nếu muốn chờ có giới hạn |
| `try (...)` (try-with-resources) | Tự **đóng** `SubscriptionQueryResult` khi xong — tránh rò rỉ tài nguyên |

```text
   Controller: mở subscription query → dispatch command → blockFirst() CHỜ...
                                                              ▲
   Saga Manager (cuối luồng): queryUpdateEmitter.emit(...) ───┘ "đánh thức"
```

## Phía Saga: emit trạng thái tổng ở @EndSaga

Saga Manager "phát" kết quả tại **cả hai** method `@EndSaga` (happy + failure), dùng `QueryUpdateEmitter`:

```java
@Autowired
private transient QueryUpdateEmitter queryUpdateEmitter;

// @EndSaga happy path (LoanMobileNumberUpdatedEvent)
queryUpdateEmitter.emit(
    FindCustomerQuery.class,
    query -> true,                                  // predicate: emit cho mọi subscription khớp
    new ResponseDto("200", CustomerConstants.MOBILE_UPDATE_SUCCESS));

// @EndSaga failure path (CustomerMobileNumberRollbackEvent)
queryUpdateEmitter.emit(
    FindCustomerQuery.class,
    query -> true,
    new ResponseDto("500", CustomerConstants.MOBILE_UPDATE_FAILURE));
```

| Tham số `emit` | Ý nghĩa |
|---|---|
| `FindCustomerQuery.class` | Loại query mà subscription đang chờ (phải khớp controller) |
| `query -> true` | Predicate lọc subscription nào nhận; `true` = mọi subscription khớp |
| `new ResponseDto(...)` | **Payload** emit về client — kiểu phải khớp `updateType` |

Happy path emit `200 "success in all services"`; failure path emit `500 "failed in all services"`. `blockFirst()` ở controller nhận đúng giá trị này → trả về client.

## Bẫy: query class rỗng làm Axon lỗi

Ban đầu ta định tạo `FindUpdateMobileSagaQuery` **rỗng** (không field) vì không thật sự query DB. Nhưng Axon **lỗi** (`cancelled AXONIQ-500`) với query class rỗng/không có query handler.

> **Cách sửa**: dùng một query class **có field + có query handler đăng ký** — ví dụ tái dùng `FindCustomerQuery` (có `mobileNumber`, đã có handler từ Phase 3). Subscription query không nhất thiết phải *dùng* kết quả của handler đó; ta chỉ cần một query "hợp lệ" để bám vào và nhận emit. Nhớ đổi **cả** controller lẫn Saga (`emit(FindCustomerQuery.class, ...)`) cho khớp.

## Bẫy: lỗi ngay trong aggregate, trước khi tới Saga

Subscription query chỉ emit khi Saga **chạy**. Nếu exception xảy ra **trong `CustomerAggregate`** khi xử lý `UpdateCustomerMobileNumCommand` — **trước** khi Saga khởi động — thì không có ai emit, client treo. Xử lý: ở controller, dispatch command đầu bằng `send` + callback, bắt `isExceptional` và trả 500 ngay:

```java
commandGateway.send(customerCommand, (msg, result) -> {
    if (result.isExceptional()) {
        // lỗi ngay tại customer, Saga chưa chạy → trả 500 luôn, không có gì để rollback
    }
});
```

> Nói cách khác: hai tầng bắt lỗi — (1) lỗi trong aggregate đầu → controller xử lý; (2) lỗi ở service sau khi Saga đã chạy → Saga compensation + emit failure.

## Demo

Restart toàn bộ (subscription query cần load lại sạch). Tạo data `...620`, đổi sang `...622`:
- Happy: client **chờ** rồi nhận `"mobile number updation successful in all services"`; `fetchCustomerSummary` với số mới → đủ data.
- Lỗi (ném exception ở `LoanAggregate`): client nhận `"mobile number updation failed in all services"`; số mới không có data, số cũ còn nguyên → compensation đã chạy.

Khác biệt lớn so với trước: client **không** nhận 200 vội — nó chờ kết quả **thật sự cuối cùng** của cả Saga.

## Tóm tắt bài 5

- Bốn loại query Axon: point-to-point, scatter-gather, **subscription** (ta dùng), streaming.
- Controller: `queryGateway.subscriptionQuery(query, initialType, updateType)` + `updates().blockFirst()` (chờ), bọc `try-with-resources` để tự đóng.
- Saga: `QueryUpdateEmitter.emit(QueryClass, predicate, payload)` tại **cả hai** `@EndSaga` — happy emit 200, failure emit 500.
- Bẫy: query class **rỗng** lỗi Axon → dùng `FindCustomerQuery` (có field + handler); lỗi ngay trong aggregate đầu → bắt ở controller (`send`+callback).
- Kết quả: client **chờ** trạng thái tổng thật của Saga thay vì 200 vội.

**Bài kế tiếp** → [Phase 7 — Bài 1: Điều gì xảy ra khi lưu event mới](../phase-7/01-event-replay-co-che.md)
