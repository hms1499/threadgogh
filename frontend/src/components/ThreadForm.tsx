'use client';

import { useState } from 'react';
import { Input, Segmented, Button, Flex } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import { TONES, LENGTHS, type Tone } from '@/lib/config';

const TONE_LABELS: Record<Tone, string> = {
  educational: '📚 Educational',
  funny:       '😂 Funny',
  threadboi:   '🧵 Thread-boi',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: '#6b7bbf',
      fontFamily: 'var(--font-mono)',
    }}>
      {children}
    </span>
  );
}

export type FormValues = { topic: string; tone: Tone; length: number; token: 'STX' | 'SBTC' };

export function ThreadForm({ onSubmit, disabled }: {
  onSubmit: (v: FormValues) => void;
  disabled: boolean;
}) {
  const [topic, setTopic]   = useState('');
  const [tone, setTone]     = useState<Tone>('educational');
  const [length, setLength] = useState<number>(8);
  const [token, setToken]   = useState<'STX' | 'SBTC'>('STX');

  function submit() {
    if (topic.trim()) onSubmit({ topic: topic.trim(), tone, length, token });
  }

  return (
    <div
      className="vg-card"
      style={{ borderRadius: 14, padding: '22px 20px' }}
    >
      <Flex vertical gap={20}>
        <Flex vertical gap={8}>
          <FieldLabel>Topic</FieldLabel>
          <Input.TextArea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic or idea for your thread..."
            maxLength={300}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Flex>

        <Flex vertical gap={8}>
          <FieldLabel>Tone</FieldLabel>
          <Segmented
            block
            value={tone}
            onChange={(v) => setTone(v as Tone)}
            options={TONES.map((t) => ({ label: TONE_LABELS[t], value: t }))}
          />
        </Flex>

        <Flex vertical gap={8}>
          <FieldLabel>Length</FieldLabel>
          <Segmented
            block
            value={length}
            onChange={(v) => setLength(Number(v))}
            options={LENGTHS.map((l) => ({ label: `${l} tweets`, value: l }))}
          />
        </Flex>

        <Flex vertical gap={8}>
          <FieldLabel>Pay with</FieldLabel>
          <Segmented
            block
            value={token}
            onChange={(v) => setToken(v as 'STX' | 'SBTC')}
            options={[
              { label: '⚡ STX',  value: 'STX' },
              { label: '₿ sBTC', value: 'SBTC' },
            ]}
          />
        </Flex>

        <Button
          type="primary"
          size="large"
          block
          disabled={disabled || !topic.trim()}
          loading={disabled}
          onClick={submit}
          icon={<ThunderboltFilled />}
          className="vg-glow-btn"
          style={{ marginTop: 4, height: 48, fontSize: 15, fontWeight: 600 }}
        >
          Generate Thread
        </Button>
      </Flex>
    </div>
  );
}
