'use client';

import { Typography, Button, Flex, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export function TweetCard({ text, index, total }: {
  text: string; index: number; total: number;
}) {
  const { message } = App.useApp();
  const over = text.length > 280;

  return (
    <div
      className="vg-card"
      style={{
        borderRadius: 12,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle top-left star accent */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 10,
          right: 14,
          fontSize: 10,
          color: 'rgba(245,215,110,0.25)',
          letterSpacing: 3,
          userSelect: 'none',
        }}
      >
        ✦ ✦ ✦
      </span>

      <Flex justify="space-between" align="center" style={{ marginBottom: 10 }}>
        <Text
          className="tp-mono"
          style={{ fontSize: 11, color: '#6b7bbf', letterSpacing: '0.06em' }}
        >
          {String(index + 1).padStart(2, '0')} / {total}
        </Text>
        <Text
          className="tp-mono"
          style={{
            fontSize: 11,
            color: over ? '#e57373' : '#6b7bbf',
            background: over ? 'rgba(229,115,115,0.1)' : 'rgba(37,61,138,0.25)',
            padding: '2px 8px',
            borderRadius: 6,
            border: `1px solid ${over ? 'rgba(229,115,115,0.3)' : 'rgba(61,90,173,0.25)'}`,
          }}
        >
          {text.length}/280
        </Text>
      </Flex>

      <Paragraph
        style={{
          whiteSpace: 'pre-wrap',
          margin: '0 0 10px',
          fontSize: 15,
          lineHeight: 1.65,
          color: '#e8eaf6',
        }}
      >
        {text}
      </Paragraph>

      <Flex justify="flex-end">
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          style={{ color: '#6b7bbf', fontSize: 12 }}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            message.success('Tweet copied');
          }}
        >
          Copy
        </Button>
      </Flex>
    </div>
  );
}
