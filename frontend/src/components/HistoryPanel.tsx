'use client';

import { useEffect, useState } from 'react';
import { List, Typography, Tag, Flex } from 'antd';

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

  return (
    <Flex vertical gap={10}>
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Your threads
      </Text>
      <List
        size="small"
        dataSource={items}
        renderItem={(it) => (
          <List.Item
            className="vg-history-item"
            onClick={() => onSelect(it.thread_content)}
            style={{ cursor: 'pointer', paddingInline: 8 }}
          >
            <List.Item.Meta
              title={<Text>{it.invoices?.topic ?? '(unknown topic)'}</Text>}
              description={
                <Flex gap={8} align="center">
                  <Tag className="tp-mono" bordered={false} color={it.token === 'SBTC' ? 'gold' : 'default'}>
                    {it.token}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(it.created_at).toLocaleString()}
                  </Text>
                </Flex>
              }
            />
          </List.Item>
        )}
      />
    </Flex>
  );
}
