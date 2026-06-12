'use client';

import { useState } from 'react';

export function TweetCard({ text, index, total }: {
  text: string; index: number; total: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{index + 1}/{total}</span>
        <span className={text.length > 280 ? 'text-red-500' : ''}>{text.length}/280</span>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
      <button
        className="self-end text-sm text-blue-600"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}>
        {copied ? '✓ Đã copy' : 'Copy'}
      </button>
    </div>
  );
}
