;; Trait toi gian cho fungible token: chi can ham transfer.
;; sBTC token that cung khop signature nay (SIP-010).
(define-trait ft-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
  )
)
