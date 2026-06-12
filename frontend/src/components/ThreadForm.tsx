'use client';

import { useState } from 'react';
import { Input, Segmented, Button, Typography, Flex } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import { TONES, LENGTHS, type Tone } from '@/lib/config';

const { Text } = Typography;

const TONE_LABELS: Record<Tone, string> = {
  educational: '📚 Giáo dục',
  funny: '😂 Hài hước',
  threadboi: '🧵 Thread-boi',
};

export type FormValues = { topic: string; tone: Tone; length: number; token: 'STX' | 'SBTC' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex vertical gap={8}>
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </Text>
      {children}
    </Flex>
  );
}

export function ThreadForm({ onSubmit, disabled }: {
  onSubmit: (v: FormValues) => void;
  disabled: boolean;
}) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('educational');
  const [length, setLength] = useState<number>(8);
  const [token, setToken] = useState<'STX' | 'SBTC'>('STX');

  function submit() {
    if (topic.trim()) onSubmit({ topic: topic.trim(), tone, length, token });
  }

  return (
    <Flex vertical gap={20}>
      <Field label="Chủ đề">
        <Input.TextArea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Nhập topic hoặc ý tưởng cho thread..."
          maxLength={300}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Field>

      <Field label="Tông giọng">
        <Segmented
          block
          value={tone}
          onChange={(v) => setTone(v as Tone)}
          options={TONES.map((t) => ({ label: TONE_LABELS[t], value: t }))}
        />
      </Field>

      <Field label="Độ dài">
        <Segmented
          block
          value={length}
          onChange={(v) => setLength(Number(v))}
          options={LENGTHS.map((l) => ({ label: `${l} tweets`, value: l }))}
        />
      </Field>

      <Field label="Thanh toán bằng">
        <Segmented
          block
          value={token}
          onChange={(v) => setToken(v as 'STX' | 'SBTC')}
          options={[
            { label: '⚡ STX', value: 'STX' },
            { label: '₿ sBTC', value: 'SBTC' },
          ]}
        />
      </Field>

      <Button
        type="primary"
        size="large"
        block
        disabled={disabled || !topic.trim()}
        loading={disabled}
        onClick={submit}
        icon={<ThunderboltFilled />}
        style={{ marginTop: 4 }}
      >
        Generate Thread
      </Button>
    </Flex>
  );
}
