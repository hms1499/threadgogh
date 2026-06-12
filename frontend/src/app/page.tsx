'use client';

import { useEffect, useState } from 'react';
import { Button, Typography, Flex, Statistic, Divider, App } from 'antd';
import { WalletOutlined, CopyOutlined } from '@ant-design/icons';
import { ThreadForm, type FormValues } from '@/components/ThreadForm';
import { TweetCard } from '@/components/TweetCard';
import { PaymentStatus, type Phase } from '@/components/PaymentStatus';
import { HistoryPanel } from '@/components/HistoryPanel';
import { connectWallet, getAddress, payInvoice, waitForTx } from '@/lib/stacks';

const { Title, Paragraph } = Typography;

type Quote = {
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string;
};

export default function Home() {
  const { message } = App.useApp();
  const [address, setAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [txid, setTxid] = useState<string>();
  const [error, setError] = useState<string>();
  const [thread, setThread] = useState<string[]>([]);
  const [stats, setStats] = useState<{ threads: number; stxRevenue: number; sbtcRevenue: number }>();

  function refreshStats() {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.threads === 'number') setStats(d); })
      .catch(() => {});
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(getAddress());
    refreshStats();
  }, []);

  async function handleGenerate(values: FormValues) {
    setError(undefined); setThread([]); setTxid(undefined);
    try {
      if (!getAddress()) {
        const addr = await connectWallet();
        setAddress(addr);
      }
      setPhase('quoting');
      const quoteRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: values.topic, tone: values.tone, length: values.length }),
      });
      if (quoteRes.status !== 402) throw new Error('Could not get a quote');
      const quote: Quote = await quoteRes.json();

      setPhase('awaiting-signature');
      const amount = values.token === 'STX' ? quote.priceStx : quote.priceSbtc;
      const tx = await payInvoice({ token: values.token, invoiceId: quote.invoiceId, amount });
      setTxid(tx);

      setPhase('confirming');
      const status = await waitForTx(tx);
      if (status !== 'success') throw new Error('Transaction failed — invoice still valid, you can retry');

      setPhase('generating');
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: quote.invoiceId, txId: tx }),
      });
      if (!genRes.ok) {
        const e = await genRes.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${genRes.status}`);
      }
      const data = await genRes.json();
      setThread(data.thread);
      setPhase('done');
      refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  const busy = !['idle', 'done', 'error'].includes(phase);

  async function toggleWallet() {
    if (address) { setAddress(null); return; }
    setAddress(await connectWallet());
  }

  return (
    <main className="tp-shell" style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px' }}>
      <Flex className="tp-rise" justify="space-between" align="center" wrap gap={12}>
        <Title level={2} className="tp-display" style={{ margin: 0, fontWeight: 800 }}>
          <span style={{ color: '#F7931A' }}>⚡</span> ThreadPay
        </Title>
        <Button
          icon={<WalletOutlined />}
          onClick={toggleWallet}
          className={address ? 'tp-mono' : undefined}
        >
          {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}
        </Button>
      </Flex>

      <Paragraph type="secondary" className="tp-rise" style={{ marginTop: 12, marginBottom: 28, fontSize: 15 }}>
        AI writes X threads — pay per generate with STX or sBTC on Stacks. No account, no subscription.
      </Paragraph>

      <div className="tp-rise" style={{ animationDelay: '0.06s' }}>
        <ThreadForm onSubmit={handleGenerate} disabled={busy} />
      </div>

      <div style={{ marginTop: 20 }}>
        <PaymentStatus phase={phase} txid={txid} error={error} />
      </div>

      {thread.length > 0 && (
        <Flex vertical gap={12} className="tp-rise" style={{ marginTop: 28 }}>
          <Flex justify="space-between" align="center">
            <Title level={4} className="tp-display" style={{ margin: 0 }}>
              Your thread 🧵
            </Title>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(thread.join('\n\n'));
                message.success('Whole thread copied');
              }}
            >
              Copy whole thread
            </Button>
          </Flex>
          {thread.map((t, i) => (
            <TweetCard key={i} text={t} index={i} total={thread.length} />
          ))}
        </Flex>
      )}

      <div style={{ marginTop: 28 }}>
        <HistoryPanel address={address} onSelect={(t) => { setThread(t); setPhase('done'); }} />
      </div>

      {stats && (
        <>
          <Divider style={{ marginTop: 40, marginBottom: 20 }} />
          <Flex gap={32} wrap>
            <Statistic
              title="Threads sold"
              value={stats.threads}
              styles={{ content: { fontFamily: 'var(--font-display)', color: '#F7931A' } }}
            />
            <Statistic
              title="STX revenue"
              value={stats.stxRevenue / 1_000_000}
              suffix="STX"
              precision={2}
              styles={{ content: { fontFamily: 'var(--font-display)' } }}
            />
            <Statistic
              title="sBTC revenue"
              value={stats.sbtcRevenue}
              suffix="sats"
              styles={{ content: { fontFamily: 'var(--font-display)' } }}
            />
          </Flex>
        </>
      )}
    </main>
  );
}
