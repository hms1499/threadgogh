'use client';

import { useState } from 'react';
import { TONES, LENGTHS, type Tone } from '@/lib/config';

const TONE_LABELS: Record<Tone, string> = {
  educational: '📚 Giáo dục',
  funny: '😂 Hài hước',
  threadboi: '🧵 Thread-boi',
};

export type FormValues = { topic: string; tone: Tone; length: number; token: 'STX' | 'SBTC' };

export function ThreadForm({ onSubmit, disabled }: {
  onSubmit: (v: FormValues) => void;
  disabled: boolean;
}) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('educational');
  const [length, setLength] = useState<number>(8);
  const [token, setToken] = useState<'STX' | 'SBTC'>('STX');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim()) onSubmit({ topic: topic.trim(), tone, length, token });
      }}
    >
      <textarea
        className="rounded-lg border p-3 min-h-24"
        placeholder="Nhập topic hoặc ý tưởng cho thread..."
        maxLength={300}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <div className="flex gap-2 flex-wrap">
        {TONES.map((t) => (
          <button key={t} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${tone === t ? 'bg-black text-white' : ''}`}
            onClick={() => setTone(t)}>
            {TONE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {LENGTHS.map((l) => (
          <button key={l} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${length === l ? 'bg-black text-white' : ''}`}
            onClick={() => setLength(l)}>
            {l} tweets
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {(['STX', 'SBTC'] as const).map((tk) => (
          <button key={tk} type="button"
            className={`rounded-full border px-3 py-1 text-sm ${token === tk ? 'bg-orange-500 text-white' : ''}`}
            onClick={() => setToken(tk)}>
            Trả bằng {tk === 'SBTC' ? 'sBTC' : 'STX'}
          </button>
        ))}
      </div>
      <button type="submit" disabled={disabled || !topic.trim()}
        className="rounded-lg bg-black text-white py-3 font-semibold disabled:opacity-40">
        ⚡ Generate Thread
      </button>
    </form>
  );
}
