'use client';

import { useEffect, useState } from 'react';
import { ThreadForm, type FormValues } from '@/components/ThreadForm';
import { TweetCard } from '@/components/TweetCard';
import { PaymentStatus, type Phase } from '@/components/PaymentStatus';
import { HistoryPanel } from '@/components/HistoryPanel';
import { connectWallet, getAddress, payInvoice, waitForTx } from '@/lib/stacks';

type Quote = {
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string;
};

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [txid, setTxid] = useState<string>();
  const [error, setError] = useState<string>();
  const [thread, setThread] = useState<string[]>([]);
  const [stats, setStats] = useState<{ threads: number; stxRevenue: number; sbtcRevenue: number }>();

  useEffect(() => {
    // Hydrate vi tu localStorage sau khi mount (getLocalStorage can `window`,
    // khong chay duoc khi SSR nen khong the dung lazy useState initializer).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(getAddress());
    fetch('/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  async function handleGenerate(values: FormValues) {
    setError(undefined); setThread([]); setTxid(undefined);
    try {
      if (!getAddress()) {
        const addr = await connectWallet();
        setAddress(addr);
      }
      // 1) Xin bao gia → expect 402
      setPhase('quoting');
      const quoteRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: values.topic, tone: values.tone, length: values.length }),
      });
      if (quoteRes.status !== 402) throw new Error('Không lấy được báo giá');
      const quote: Quote = await quoteRes.json();

      // 2) Ky contract-call tu vi
      setPhase('awaiting-signature');
      const amount = values.token === 'STX' ? quote.priceStx : quote.priceSbtc;
      const tx = await payInvoice({ token: values.token, invoiceId: quote.invoiceId, amount });
      setTxid(tx);

      // 3) Cho confirm
      setPhase('confirming');
      const status = await waitForTx(tx);
      if (status !== 'success') throw new Error('Transaction thất bại — invoice còn hạn, thử lại được');

      // 4) Retry kem proof → nhan thread
      setPhase('generating');
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: quote.invoiceId, txId: tx }),
      });
      if (!genRes.ok) {
        const e = await genRes.json().catch(() => ({}));
        throw new Error(e.error ?? `Lỗi ${genRes.status}`);
      }
      const data = await genRes.json();
      setThread(data.thread);
      setPhase('done');
      fetch('/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định');
      setPhase('error');
    }
  }

  const busy = !['idle', 'done', 'error'].includes(phase);

  return (
    <main className="mx-auto max-w-xl p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⚡ ThreadPay</h1>
        <button className="text-sm underline"
          onClick={async () => setAddress(address ? null : await connectWallet())}>
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect ví'}
        </button>
      </header>
      <p className="text-sm text-gray-600">
        AI viết thread cho X — trả từng lần bằng STX hoặc sBTC. Không tài khoản, không subscription.
      </p>

      <ThreadForm onSubmit={handleGenerate} disabled={busy} />
      <PaymentStatus phase={phase} txid={txid} error={error} />

      {thread.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Thread của bạn 🧵</h2>
            <button className="text-sm text-blue-600"
              onClick={() => navigator.clipboard.writeText(thread.join('\n\n'))}>
              Copy cả thread
            </button>
          </div>
          {thread.map((t, i) => (
            <TweetCard key={i} text={t} index={i} total={thread.length} />
          ))}
        </section>
      )}

      <HistoryPanel address={address} onSelect={(t) => { setThread(t); setPhase('done'); }} />

      {stats && (
        <footer className="text-xs text-gray-500 border-t pt-4">
          🔥 {stats.threads} threads đã bán · {stats.stxRevenue / 1_000_000} STX + {stats.sbtcRevenue} sats doanh thu on-chain
        </footer>
      )}
    </main>
  );
}
