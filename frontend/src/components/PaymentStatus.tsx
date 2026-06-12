'use client';

export type Phase =
  | 'idle' | 'quoting' | 'awaiting-signature'
  | 'confirming' | 'generating' | 'done' | 'error';

const MESSAGES: Record<Phase, string> = {
  idle: '',
  quoting: 'Đang lấy báo giá (HTTP 402)...',
  'awaiting-signature': 'Mở ví để ký thanh toán...',
  confirming: 'Chờ transaction confirm trên Stacks (~10s)...',
  generating: 'Đã thanh toán ✓ — AI đang viết thread...',
  done: '',
  error: 'Có lỗi xảy ra.',
};

export function PaymentStatus({ phase, txid, error }: {
  phase: Phase; txid?: string; error?: string;
}) {
  if (phase === 'idle' || phase === 'done') return null;
  return (
    <div className="rounded-lg border p-4 text-sm flex flex-col gap-1">
      <span>{phase === 'error' ? (error ?? MESSAGES.error) : MESSAGES[phase]}</span>
      {txid && (
        <a className="text-blue-600 underline" target="_blank" rel="noreferrer"
          href={`https://explorer.hiro.so/txid/${txid}?chain=testnet`}>
          Xem transaction trên explorer ↗
        </a>
      )}
      {(phase === 'confirming' || phase === 'generating' || phase === 'quoting') && (
        <div className="h-1 w-full overflow-hidden rounded bg-gray-200">
          <div className="h-full w-1/3 animate-pulse bg-orange-500" />
        </div>
      )}
    </div>
  );
}
