(impl-trait .traits.ft-trait)

(define-fungible-token mock-sbtc)

(define-constant ERR-NOT-SENDER (err u4))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-SENDER)
    (ft-transfer? mock-sbtc amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-sbtc amount recipient)
)
