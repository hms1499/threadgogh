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
import { ThemeToggle } from '@/components/ThemeToggle';
import { connectWallet, disconnectWallet, getAddress, payInvoice, waitForTx } from '@/lib/stacks';
import { MAX_FREE_REGENS } from '@/lib/config';
import { applyEdit, deleteTweet } from '@/lib/editThread';

const { Title, Paragraph, Text } = Typography;

type Quote = {
  invoiceId: string; priceStx: number; priceSbtc: number; expiresAt: string; previewHook?: string | null;
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
  const [previewHook, setPreviewHook] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [displayedInvoiceId, setDisplayedInvoiceId] = useState<string>();
  const [regenRemaining, setRegenRemaining] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  function refreshStats() {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.threads === 'number') setStats(d); })
      .catch(() => {});
  }

  function handleEditTweet(index: number, draft: string) {
    setThread((t) => applyEdit(t, index, draft));
  }

  function handleDeleteTweet(index: number) {
    setThread((t) => {
      const next = deleteTweet(t, index);
      // Deleting the last tweet returns the gallery to its empty/idle state.
      if (next.length === 0) setPhase('idle');
      return next;
    });
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
      setDisplayedInvoiceId(invoiceId);
      setRegenRemaining(MAX_FREE_REGENS);
      setPreviewHook(null);
      setPendingInvoiceId(undefined);
      setPhase('done');
      refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  async function regenerate() {
    if (!displayedInvoiceId) return;
    setRegenerating(true);
    setError(undefined);
    try {
      const res = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: displayedInvoiceId }),
      });
      if (res.status === 202) {
        message.info('A re-roll is already in progress — try again in a moment.');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setThread(data.thread);
      setRegenRemaining(data.regenRemaining);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Re-roll failed');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleGenerate(values: FormValues) {
    setError(undefined); setThread([]); setTxid(undefined); setPendingInvoiceId(undefined); setPreviewHook(null); setDisplayedInvoiceId(undefined); setRegenRemaining(null);
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
      setPreviewHook(quote.previewHook ?? null);

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
  const editable = phase === 'done' && !regenerating;

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
          <ThemeToggle />
          {address && (
            <Button
              className="vg-wallet-btn"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryOpen(true)}
              style={{
                background: 'var(--vg-glass)',
                borderColor: 'var(--vg-glass-border)',
                color: 'var(--vg-on-art)',
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
              background: 'var(--vg-glass)',
              borderColor: 'var(--vg-glass-border)',
              color: address ? 'var(--vg-on-art-soft)' : 'var(--vg-on-art)',
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
              style={{ margin: 0, fontWeight: 700, fontStyle: 'italic', color: 'var(--vg-on-art)', fontSize: 38 }}
            >
              ThreadGogh
            </Title>
          </Flex>
          <Paragraph
            style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--vg-on-art-soft)', maxWidth: 440 }}
          >
            AI writes X threads — pay per generate with STX or sBTC on Stacks.{' '}
            <span style={{ color: 'var(--vg-on-art-faint)' }}>No account, no subscription.</span>
          </Paragraph>
        </div>
      </div>

      <div style={{ marginBottom: 28 }} />

      {/* ── Form ── */}
      <div className="tp-rise" style={{ animationDelay: '0.08s' }}>
        <ThreadForm onSubmit={handleGenerate} disabled={busy} />
      </div>

      {/* ── Free hook preview ── */}
      {previewHook && thread.length === 0 && (
        <div className="tp-rise vg-gallery" style={{ marginTop: 20, padding: 16 }}>
          <Text style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--vg-on-art-faint)', marginBottom: 8 }}>
            Free preview — your hook
          </Text>
          <Paragraph style={{ margin: 0, color: 'var(--vg-on-art)', fontSize: 15 }}>{previewHook}</Paragraph>
          <Text style={{ display: 'block', marginTop: 10, color: 'var(--vg-on-art-soft)', fontSize: 13 }}>
            Pay to unlock the full thread.
          </Text>
        </div>
      )}

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
              style={{ margin: 0, color: 'var(--vg-star)', fontStyle: 'italic' }}
            >
              Your thread
            </Title>
            <Flex gap={8} align="center">
              {regenRemaining != null && (
                <Button
                  type="text"
                  size="small"
                  loading={regenerating}
                  disabled={regenRemaining === 0 || regenerating}
                  onClick={regenerate}
                  style={{ color: regenRemaining === 0 ? 'var(--vg-faint)' : 'var(--vg-muted)' }}
                >
                  {regenRemaining === 0 ? 'No free re-rolls left' : `Regenerate (${regenRemaining} free)`}
                </Button>
              )}
              <Button
                type="text"
                size="small"
                icon={copiedAll ? <CheckOutlined /> : <CopyOutlined />}
                style={{ color: copiedAll ? 'var(--vg-success)' : 'var(--vg-muted)' }}
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
          </Flex>
          {thread.map((t, i) => (
              <TweetCard
                key={i}
                text={t}
                index={i}
                total={thread.length}
                onEdit={editable ? handleEditTweet : undefined}
                onDelete={editable ? handleDeleteTweet : undefined}
              />
            ))}
        </Flex>
      )}

      {/* ── Empty state — before the first generation ── */}
      {thread.length === 0 && phase === 'idle' && <EmptyGallery />}

      {/* ── History — opened from the hero, not inline ── */}
      <Drawer
        title="Your threads"
        placement="right"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        styles={{ title: { fontSize: 15 } }}
        classNames={{
          section: 'vg-drawer__section',
          header: 'vg-drawer__header',
          title: 'vg-plate',
          body: 'vg-drawer__body',
          close: 'vg-drawer__close',
          mask: 'vg-drawer__mask',
        }}
      >
        <HistoryPanel
          address={address}
          onSelect={(t) => { setThread(t); setPhase('done'); setDisplayedInvoiceId(undefined); setRegenRemaining(null); setHistoryOpen(false); }}
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
              title={<span style={{ color: 'var(--vg-on-art-faint)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Threads sold</span>}
              value={stats.threads}
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => String(Math.round(n))} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: 'var(--vg-star)' } }}
            />
            <Statistic
              title={<span style={{ color: 'var(--vg-on-art-faint)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>STX revenue</span>}
              value={stats.stxRevenue / 1_000_000}
              suffix="STX"
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => n.toFixed(2)} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: 'var(--vg-on-art)' } }}
            />
            <Statistic
              title={<span style={{ color: 'var(--vg-on-art-faint)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>sBTC revenue</span>}
              value={stats.sbtcRevenue}
              suffix="sats"
              formatter={(val) => <AnimatedCounter value={Number(val)} format={(n) => Math.round(n).toLocaleString()} />}
              styles={{ content: { fontFamily: 'var(--font-display)', color: 'var(--vg-on-art)' } }}
            />
          </Flex>
        </div>
      )}
    </main>
  );
}
