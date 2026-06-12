;; Minimal fungible-token trait: only the transfer function is needed.
;; The real sBTC token also matches this signature (SIP-010).
(define-trait ft-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
  )
)
