(use-trait ft-trait .traits.ft-trait)

(define-constant ERR-UNDERPAID (err u100))
(define-constant ERR-DUPLICATE-INVOICE (err u101))
(define-constant ERR-NOT-OWNER (err u102))
(define-constant ERR-WRONG-TOKEN (err u103))

(define-data-var owner principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var min-price-stx uint u100000)  ;; 0.1 STX
(define-data-var min-price-sbtc uint u100)    ;; 100 sats
(define-data-var sbtc-contract principal 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

(define-map receipts (buff 32)
  { payer: principal, amount: uint, token: (string-ascii 4), paid-at: uint })

(define-read-only (get-receipt (invoice-id (buff 32)))
  (map-get? receipts invoice-id))

(define-read-only (get-prices)
  { stx: (var-get min-price-stx), sbtc: (var-get min-price-sbtc) })

(define-public (pay-stx (invoice-id (buff 32)) (amount uint))
  (begin
    (asserts! (>= amount (var-get min-price-stx)) ERR-UNDERPAID)
    (asserts! (is-none (map-get? receipts invoice-id)) ERR-DUPLICATE-INVOICE)
    (try! (stx-transfer? amount tx-sender (var-get treasury)))
    (map-set receipts invoice-id
      { payer: tx-sender, amount: amount, token: "STX", paid-at: burn-block-height })
    (ok true)
  )
)
