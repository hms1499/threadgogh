'use client';

import { useState } from 'react';
import { Typography, Tag, Flex, Button, App } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { signMessage } from '@/lib/stacks';
import { buildHistoryMessage } from '@/lib/auth-message';
import { APP_DOMAIN, STACKS_NETWORK } from '@/lib/config';

const { Text } = Typography;

type Cursor = { createdAt: string; id: number };

type Item = {
  invoice_id: string;
  token: string;
  amount: number;
  thread_content: string[];
  created_at: string;
  topic: string | null;
};

export function HistoryPanel({ address, onSelect }: {
  address: string | null;
  onSelect: (thread: string[]) => void;
}) {
  const { message: msg } = App.useApp();
  const [items, setItems] = useState<Item[] | null>(null); // null = not signed in yet
  // The verified sign-in signature, cached so paging doesn't re-prompt the wallet.
  // Valid for the server's 5-minute window; cleared on a 401 to force a re-sign.
  const [cred, setCred] = useState<{ message: string; signature: string } | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null); // next page, null = no more
  const [loading, setLoading] = useState(false);

  if (!address) return null;

  async function ensureCred(addr: string) {
    if (cred) return cred;
    const message = buildHistoryMessage(addr, new Date().toISOString(), APP_DOMAIN, STACKS_NETWORK);
    const signature = await signMessage(message);
    const c = { message, signature };
    setCred(c);
    return c;
  }

  // History is gated behind a wallet signature proving the caller owns the address
  // — a free, no-fee sign-in. `next` null loads the first page (replacing); a cursor
  // appends the next page reusing the cached signature.
  async function loadPage(next: Cursor | null) {
    if (!address) return;
    setLoading(true);
    try {
      const c = await ensureCred(address);
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message: c.message, signature: c.signature, cursor: next }),
      });
      if (res.status === 401) {
        setCred(null); // expired/invalid — next click re-signs
        throw new Error('Your sign-in expired. Please sign in again.');
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${res.status}`);
      }
      const d = await res.json();
      setItems((prev) => (next && prev ? [...prev, ...(d.items ?? [])] : (d.items ?? [])));
      setCursor(d.nextCursor ?? null);
    } catch (e) {
      msg.error(e instanceof Error ? e.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Flex vertical gap={10}>
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Your threads
      </Text>

      {items === null ? (
        <Button
          icon={<SafetyOutlined />}
          loading={loading}
          onClick={() => loadPage(null)}
          style={{ alignSelf: 'flex-start' }}
        >
          Sign in to view your history
        </Button>
      ) : items.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 13 }}>No threads yet for this wallet.</Text>
      ) : (
        <Flex vertical gap={2}>
          {items.map((it) => (
            <div
              key={it.invoice_id}
              className="vg-history-item"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(it.thread_content)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(it.thread_content);
                }
              }}
              style={{ cursor: 'pointer', padding: '10px 8px' }}
            >
              <Text style={{ display: 'block' }}>{it.topic ?? '(unknown topic)'}</Text>
              <Flex gap={8} align="center" style={{ marginTop: 4 }}>
                <Tag className="tp-mono" variant="filled" color={it.token === 'SBTC' ? 'gold' : 'default'}>
                  {it.token}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(it.created_at).toLocaleString()}
                </Text>
              </Flex>
            </div>
          ))}

          {cursor !== null && (
            <Button
              type="text"
              size="small"
              loading={loading}
              onClick={() => loadPage(cursor)}
              icon={cred === null ? <SafetyOutlined /> : undefined}
              style={{ alignSelf: 'flex-start', marginTop: 6 }}
            >
              {cred === null ? 'Sign in to load more' : 'Load more'}
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}
