'use client';

import { useEffect, useState } from 'react';

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
    <section className="flex flex-col gap-2 border-t pt-4">
      <h2 className="font-semibold text-sm">Threads đã mua</h2>
      {items.map((it) => (
        <button key={it.invoice_id}
          className="text-left text-sm rounded border p-2 hover:bg-gray-50"
          onClick={() => onSelect(it.thread_content)}>
          <span className="font-medium">{it.invoices?.topic ?? '(không rõ topic)'}</span>
          <span className="text-gray-500"> · {it.token} · {new Date(it.created_at).toLocaleString()}</span>
        </button>
      ))}
    </section>
  );
}
