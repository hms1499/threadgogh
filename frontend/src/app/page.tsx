'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Typography, Flex, Statistic, App, Drawer } from 'antd';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { WalletOutlined, CopyOutlined, CheckOutlined, HistoryOutlined } from '@ant-design/icons';
import { ThreadForm, type FormValues } from '@/components/ThreadForm';
import { TweetCard } from '@/components/TweetCard';
import { PaymentStatus, type Phase } from '@/components/PaymentStatus';
import { HistoryPanel } from '@/components/HistoryPanel';
import { EmptyGallery } from '@/components/EmptyGallery';
import { connectWallet, disconnectWallet, getAddress, payInvoice, waitForTx } from '@/lib/stacks';

const { Title, Paragraph, Text } = Typography;

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
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string>();
  const [stats, setStats] = useState<{ threads: number; stxRevenue: number; sbtcRevenue: number }>();
  const [copiedAll, setCopiedAll] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

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

  // When a fresh thread finishes, bring it into view so the result isn't
  // stranded below the fold. Respects reduced-motion.
  useEffect(() => {
    if (phase !== 'done' || thread.length === 0 || !threadRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    threadRef.current.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [phase, thread]);

  async function redeem(invoiceId: string, txId?: string) {
    try {
      setError(undefined);
      setPhase('generating');
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, txId }),
      });
      if (genRes.status === 402 || genRes.status === 202) {
        setPendingInvoiceId(invoiceId);
        setPhase('recover');
        setError(genRes.status === 402
          ? 'Payment not confirmed on-chain yet — wait a moment, then Check payment.'
          : 'AI is still writing your thread — Check payment again in a moment.');
        return;
      }
      if (!genRes.ok) {
        const e = await genRes.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${genRes.status}`);
      }
      const data = await genRes.json();
      setThread(data.thread);
      setPendingInvoiceId(undefined);
      setPhase('done');
      refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  async function handleGenerate(values: FormValues) {
    setError(undefined); setThread([]); setTxid(undefined); setPendingInvoiceId(undefined);
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
      if (status === 'failed') {
        throw new Error('Transaction reverted on-chain — invoice still valid, you can retry');
      }
      if (status === 'pending') {
        setPendingInvoiceId(quote.invoiceId);
        setPhase('recover');
        setError('Confirmation is taking longer than usual. Your invoice is saved — click Check payment once the tx confirms.');
        return;
      }
      await redeem(quote.invoiceId, tx);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  const busy = !['idle', 'done', 'error', 'recover'].includes(phase);

  async function toggleWallet() {
    if (address) {
      disconnectWallet();
      setAddress(null);
      return;
    }
    setAddress(await connectWallet());
  }

  return (
    <main className="tp-shell" style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px 80px' }}>

      {/* ── Hero: the real Starry Night painting ── */}
      <div className="vg-hero tp-rise">
        <Flex gap={8} style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
          {address && (
            <Button
              className="vg-wallet-btn"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryOpen(true)}
              style={{
                background: 'rgba(8,14,28,0.55)',
                borderColor: 'rgba(61,90,173,0.6)',
                color: '#e8eaf6',
                backdropFilter: 'blur(8px)',
              }}
            >
              History
            </Button>
          )}
          <Button
            className={`vg-wallet-btn ${address ? 'tp-mono' : ''}`}
            icon={<WalletOutlined />}
            onClick={toggleWallet}
            style={{
              background: 'rgba(8,14,28,0.55)',
              borderColor: 'rgba(61,90,173,0.6)',
              color: address ? '#9fa8d4' : '#e8eaf6',
              backdropFilter: 'blur(8px)',
            }}
          >
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}
          </Button>
        </Flex>

        <div className="vg-hero__content">
          <Flex align="center" gap={10}>
            <span className="vg-star-glow" style={{ fontSize: 26, lineHeight: 1 }}>✦</span>
            <Title
              level={1}
              className="tp-display"
              style={{ margin: 0, fontWeight: 700, fontStyle: 'italic', color: '#fdfcf7', fontSize: 38 }}
            >
              ThreadGogh
            </Title>
          </Flex>
          <Paragraph
            style={{ margin: '8px 0 0', fontSize: 15, color: '#cdd3ee', maxWidth: 440 }}
          >
            AI writes X threads — pay per generate with STX or sBTC on Stacks.{' '}
            <span style={{ color: 'rgba(205,211,238,0.6)' }}>No account, no subscription.</span>
          </Paragraph>
        </div>
      </div>

      <div style={{ marginBottom: 28 }} />

      {/* ── Form ── */}
      <div className="tp-rise" style={{ animationDelay: '0.08s' }}>
        <ThreadForm onSubmit={handleGenerate} disabled={busy} />
      </div>

      {/* ── Payment status ── */}
      <div style={{ marginTop: 20 }}>
        <PaymentStatus phase={phase} txid={txid} error={error} />
        {phase === 'recover' && pendingInvoiceId && (
          <Button
            type="primary"
            block
            className="vg-glow-btn"
            style={{ marginTop: 12 }}
            onClick={() => redeem(pendingInvoiceId, txid)}
          >
            Check payment
          </Button>
        )}
      </div>

      {/* ── Generated thread ── */}
      {thread.length > 0 && (
        <Flex ref={threadRef} vertical gap={12} style={{ marginTop: 32, scrollMarginTop: 24 }}>
          <Flex justify="space-between" align="center" className="tp-rise">
            <Title
              level={4}
              className="tp-display"
              style={{ margin: 0, color: '#f5d76e', fontStyle: 'italic' }}
            >
              Your thread
            </Title>
            <Button
              type="text"
              size="small"
              icon={copiedAll ? <CheckOutlined /> : <CopyOutlined />}
              style={{ color: copiedAll ? '#7bc67e' : '#9fa8d4' }}
              onClick={() => {
                navigator.clipboard.writeText(thread.join('\n\n'));
                message.success('Whole thread copied');
                setCopiedAll(true);
                setTimeout(() => setCopiedAll(false), 1400);
              }}
            >
              {copiedAll ? 'Copied' : 'Copy all'}
            </Button>
          </Flex>
          {thread.map((t, i) => (
            <TweetCard key={i} text={t} index={i} total={thread.length} />
          ))}
        </Flex>
      )}

      {/* ── Empty state — before the first generation ── */}
      {thread.length === 0 && phase === 'idle' && <EmptyGallery />}

      {/* ── History — opened from the hero, not inline ── */}
      <Drawer
        title="Your threads"
        placement="right"
        width={380}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      >
        <HistoryPanel
          address={address}
          onSelect={(t) => { setThread(t); setPhase('done'); setHistoryOpen(false); }}
        />
      </Drawer>

      {/* ── Stats — gallery placard with Sunflowers ── */}
      {stats && (
        <div className="vg-gallery tp-rise" style={{ marginTop: 48 }}>
          <Text className="vg-plate" style={{ display: 'block', marginBottom: 16 }}>
            The ThreadGogh Collection
          </Text>
          <Flex gap={32} wrap>
            <Statistic
              title={<span style={{ color: '#9fb0e0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Threads sold</span>}
              value={stats.threads}
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => String(Math.round(n))} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: '#f5d76e' } }}
            />
            <Statistic
              title={<span style={{ color: '#9fb0e0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>STX revenue</span>}
              value={stats.stxRevenue / 1_000_000}
              suffix="STX"
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => n.toFixed(2)} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: '#f0eee8' } }}
            />
            <Statistic
              title={<span style={{ color: '#9fb0e0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>sBTC revenue</span>}
              value={stats.sbtcRevenue}
              suffix="sats"
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => Math.round(n).toLocaleString()} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: '#f0eee8' } }}
            />
          </Flex>
        </div>
      )}
    </main>
  );
}
