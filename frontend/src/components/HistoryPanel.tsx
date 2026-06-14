'use client';

import { useState } from 'react';
import { Typography, Tag, Flex, Button, App } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { signMessage } from '@/lib/stacks';
import { buildHistoryMessage } from '@/lib/auth-message';

const { Text } = Typography;

type Item = {
  invoice_id: string;
  token: string;
  amount: number;
  thread_content: string[];
  created_at: string;
  invoices: { topic: string } | null;
};

export function HistoryPanel({ address, onSelect }: {
  address: string | null;
  onSelect: (thread: string[]) => void;
}) {
  const { message: msg } = App.useApp();
  const [items, setItems] = useState<Item[] | null>(null); // null = not signed in yet
  const [loading, setLoading] = useState(false);

  if (!address) return null;

  // History is gated behind a wallet signature proving the caller owns the
  // address — a free, no-fee sign-in. Triggered on demand, not on every load.
  async function loadHistory() {
    if (!address) return;
    setLoading(true);
    try {
      const message = buildHistoryMessage(address, new Date().toISOString());
      const signature = await signMessage(message);
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${res.status}`);
      }
      const d = await res.json();
      setItems(d.items ?? []);
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
          onClick={loadHistory}
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
              <Text style={{ display: 'block' }}>{it.invoices?.topic ?? '(unknown topic)'}</Text>
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
        </Flex>
      )}
    </Flex>
  );
}
