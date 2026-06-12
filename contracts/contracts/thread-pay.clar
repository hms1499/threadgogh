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

(define-public (pay-sbtc (token <ft-trait>) (invoice-id (buff 32)) (amount uint))
  (begin
    (asserts! (is-eq (contract-of token) (var-get sbtc-contract)) ERR-WRONG-TOKEN)
    (asserts! (>= amount (var-get min-price-sbtc)) ERR-UNDERPAID)
    (asserts! (is-none (map-get? receipts invoice-id)) ERR-DUPLICATE-INVOICE)
    (try! (contract-call? token transfer amount tx-sender (var-get treasury) none))
    (map-set receipts invoice-id
      { payer: tx-sender, amount: amount, token: "SBTC", paid-at: burn-block-height })
    (ok true)
  )
)

(define-public (set-prices (stx-price uint) (sbtc-price uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set min-price-stx stx-price)
    (var-set min-price-sbtc sbtc-price)
    (ok true)
  )
)

(define-public (set-sbtc-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set sbtc-contract new-contract)
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
    (var-set treasury new-treasury)
    (ok true)
  )
)
