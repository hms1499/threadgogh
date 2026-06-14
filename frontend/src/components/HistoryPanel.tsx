'use client';

import { useEffect, useState } from 'react';
import { Typography, Tag, Flex } from 'antd';

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
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch(`/api/history?address=${address}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems(d.items ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  if (!address || items.length === 0) return null;

  // antd v6 deprecated <List>; this is a plain Flex composition with a
  // clickable, keyboard-operable row per thread.
  return (
    <Flex vertical gap={10}>
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Your threads
      </Text>
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
    </Flex>
  );
}
