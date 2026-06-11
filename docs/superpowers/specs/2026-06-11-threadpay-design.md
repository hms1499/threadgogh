# ThreadPay — AI Thread Generator trả phí qua Stacks (x402)

**Ngày:** 2026-06-11
**Mục tiêu:** MVP hackathon, hoàn thành trong ≤ 7 ngày, chạy trên Stacks testnet.

## 1. Tổng quan

Web app: user nhập topic → AI generate thread cho X (Twitter) → trả phí mỗi lần
generate bằng **STX hoặc sBTC** (user chọn) theo chuẩn x402 (HTTP 402 Payment
Required). Không tài khoản, không subscription, không API key — ví Stacks là
identity duy nhất.

**Giá trị cốt lõi:**
- User: trả đúng cái mình dùng (~$0.05/thread), mô hình micro-payment mà thẻ
  tín dụng không làm nổi.
- Hackathon narrative: demo trọn vẹn câu chuyện "micro-payment cho AI service
  trên Bitcoin" — agent/user gặp 402, trả sats, nhận dịch vụ.

**Phạm vi MVP (chốt):**
- Chỉ generate nội dung thread, KHÔNG auto-post lên X (để roadmap).
- Thanh toán per-call theo x402, KHÔNG có credit/subscription (để roadmap).
- Chạy testnet, KHÔNG mainnet.

## 2. Kiến trúc tổng thể

```
┌─────────────┐     402 + invoice      ┌──────────────┐
│  Frontend    │ ◄──────────────────── │   Backend     │
│  Next.js     │ ──── retry + proof ──► │  API routes   │──► LLM API
│  + Stacks.js │                        │  + verify     │   (generate)
└──────┬───────┘                        └──────┬────────┘
       │ contract-call pay                     │ read-only get-receipt
       ▼                                       ▼
┌──────────────────────────────────────────────────────┐
│        Clarity contract: thread-pay (testnet)         │
│        receipts: invoice-id → {payer, amount, token}  │
└──────────────────────────────────────────────────────┘
                        │
                  Supabase (Postgres)
                  invoices + generations
```

**Stack:** một repo Next.js (frontend + API routes), TypeScript,
`@stacks/connect` (ví Leather/Xverse), Clarinet (contract), Supabase
(Postgres), Claude API (generate).

**Nguyên tắc phân tầng nguồn sự thật:**
- Blockchain = nguồn sự thật về thanh toán (receipt on-chain).
- Supabase = chỉ lưu thứ chain không lưu được (tham số invoice, kết quả
  generate). DB sập thì tiền vẫn an toàn, chỉ mất lịch sử hiển thị.

## 3. Clarity contract `thread-pay`

Nhiệm vụ duy nhất: nhận tiền và lưu biên lai on-chain.

**Public functions:**
- `(pay-stx (invoice-id (buff 32)) (amount uint))` — chuyển STX vào địa chỉ
  dịch vụ, ghi receipt.
- `(pay-sbtc (invoice-id (buff 32)) (amount uint))` — gọi `transfer` của sBTC
  token contract (testnet), ghi receipt.
- `(set-price (token ...) (min-amount uint))` — owner-only, đặt giá tối thiểu
  từng token. Contract reject nếu trả thiếu (chống underpay ngay on-chain,
  không cần tin backend).

**Read-only:**
- `(get-receipt (invoice-id (buff 32)))` — backend dùng để verify.
- `(get-price (token ...))`.

**Storage:**
- Map `receipts: invoice-id → {payer, amount, token, paid-at-block}`.
  Insert trùng invoice-id fail → chống replay ở tầng chain.
- Data vars: `owner`, `min-price-stx`, `min-price-sbtc`.

## 4. Backend — luồng x402

1. `POST /api/generate {topic, tone, length}` chưa có proof → tạo invoice
   trong Supabase, trả **HTTP 402** kèm
   `{invoiceId, priceStx, priceSbtc, contractAddress, expiresAt}`.
2. Frontend trả tiền xong, retry `POST /api/generate` kèm
   `{invoiceId, txId}` → backend:
   - Đọc invoice từ Supabase, kiểm tra còn hạn, status hợp lệ.
   - Gọi read-only `get-receipt(invoiceId)` trên contract, kiểm tra amount
     khớp giá đã báo.
   - Receipt hợp lệ → set status `paid`.
3. Gọi LLM generate thread → lưu vào bảng `generations` → set status
   `consumed` (atomic update, chống double-spend một receipt cho hai lần
   generate) → trả kết quả. Chỉ set `consumed` SAU KHI generate thành công.

**Quy tắc tin cậy quan trọng:** nếu LLM lỗi *sau khi* user đã trả tiền,
invoice CHƯA bị đánh dấu `consumed` — user retry miễn phí với cùng receipt.
Tiền không bao giờ mất oan. (Thứ tự: chỉ set `consumed` sau khi generate
thành công; dùng transaction/atomic update.)

**Endpoint phụ:**
- `GET /api/history?address=...` — lịch sử thread theo ví.
- `GET /api/stats` — tổng thread bán + doanh thu (cho dashboard mini).
- `GET /api/generation/:invoiceId` — lấy lại kết quả đã mua (chống mất kết
  quả khi refresh).

## 5. Database (Supabase / Postgres)

### Bảng `invoices`
| Cột | Vai trò |
|---|---|
| `invoice_id` (PK) | Khớp invoice-id trong contract receipt |
| `topic`, `tone`, `length` | Tham số khóa lúc báo giá — tránh trả tiền topic A rồi đổi sang topic B |
| `price_stx`, `price_sbtc` | Giá đã báo |
| `status` | `pending → paid → consumed` — cột chống replay |
| `expires_at` | Hết hạn 15 phút |
| `created_at` | |

### Bảng `generations`
| Cột | Vai trò |
|---|---|
| `id` (PK), `invoice_id` (FK, unique) | Liên kết thanh toán |
| `payer_address`, `token`, `tx_id` | Đọc từ receipt, lưu để query nhanh |
| `thread_content` (jsonb) | Kết quả AI generate |
| `created_at` | |

**Cố tình KHÔNG lưu:** user accounts, API keys, số dư — chain và ví lo hết.

## 6. Frontend — luồng người dùng

1. Trang chính: ô nhập topic + chọn tone (giáo dục / hài hước / thread-boi 🧵)
   + độ dài (5/8/12 tweets) + chọn token **STX/sBTC**.
2. Bấm Generate → modal hiện giá (vd: 0.1 STX ≈ $0.05) → ví mở, ký
   contract-call → chờ confirm (~5-10s fast blocks, progress indicator kèm
   link explorer).
3. Thread hiện dạng **tweet cards xem trước như trên X thật**: đánh số 1/n,
   đếm ký tự từng tweet, nút copy từng tweet / copy cả thread.
4. Connect ví → xem lại lịch sử thread đã mua (không cần tài khoản).
5. Footer: dashboard mini — tổng thread đã bán + doanh thu (từ `/api/stats`).

## 7. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Tx fail / user hủy ký | Quay về form, invoice còn hạn dùng lại được |
| Trả thiếu tiền | Contract reject ngay on-chain |
| Invoice hết hạn (15 phút) | Trả 402 mới, giá mới |
| LLM lỗi sau khi đã trả | Retry miễn phí với receipt cũ (invoice chưa `consumed`) |
| Hai request cùng receipt | Atomic update status trong Postgres, request sau bị từ chối |
| User refresh mất kết quả | `GET /api/generation/:invoiceId` lấy lại thread đã mua |

## 8. Testing

- **Contract (Clarinet unit tests):** pay đúng giá OK; trả thiếu reject;
  invoice-id trùng reject; get-receipt trả đúng dữ liệu; set-price owner-only.
- **Backend:** verify logic với receipt mock; luồng 402 → proof → generate;
  atomic consume (hai request song song chỉ một thắng).
- **E2E:** chạy tay trên testnet với ví thật, cả nhánh STX lẫn sBTC, trước
  ngày demo.

## 9. Kế hoạch 7 ngày

| Ngày | Việc |
|---|---|
| 1 | Contract `thread-pay` + Clarinet tests, deploy testnet |
| 2 | Backend: luồng 402, verify receipt, Supabase schema + client |
| 3 | AI generation: prompt engineering, format thread |
| 4 | Frontend: wallet connect, payment flow |
| 5 | UI tweet-card preview + history + dashboard mini |
| 6 | E2E testnet cả 2 token, sửa edge cases |
| 7 | Buffer + demo script + pitch |

## 10. Roadmap (không build trong MVP)

- Nút "Post to X" (OAuth, X API).
- Nạp credit cho power user.
- Marketplace nhiều AI service trên cùng cổng thanh toán.
- Mainnet.

## 11. Kịch bản demo 2 phút

1. Nhập topic "Tại sao Bitcoin cần layer 2" → chọn tone + 8 tweets + STX.
2. Bấm Generate → 402 hiện giá → ví ký → confirm ~5-10s, link explorer.
3. Thread hiện dạng tweet cards → copy cả thread.
4. Đổi sang sBTC, generate thread thứ hai → demo cả hai token.
5. Chỉ vào dashboard mini: doanh thu nhảy số, kèm transaction on-chain.
