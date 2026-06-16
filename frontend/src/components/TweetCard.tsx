'use client';

import { useState, type CSSProperties } from 'react';
import { Typography, Button, Flex, App } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export function TweetCard({ text, index, total }: {
  text: string; index: number; total: number;
}) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const over = text.length > 280;

  // Each painting is brushed in a beat after the previous one — gallery-style stagger.
  // The delay is a custom property so the sheen pseudo-element inherits it too.
  return (
    <div className="vg-paint" style={{ '--paint-delay': `${index * 0.1}s` } as CSSProperties}>
      <div className={`vg-frame${over ? ' vg-frame--over' : ''}`}>
      <div className="vg-frame__canvas">
        {/* Museum plate label + character counter */}
        <Flex justify="space-between" align="center" style={{ marginBottom: 10 }}>
          <Text className="vg-plate">
            Plate {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </Text>
          <Text
            className="tp-mono"
            style={{
              fontSize: 11,
              color: over ? 'var(--vg-error)' : 'var(--vg-faint)',
              background: over ? 'var(--vg-error-bg)' : 'var(--vg-pill-bg)',
              padding: '2px 8px',
              borderRadius: 6,
              border: `1px solid ${over ? 'var(--vg-error-border)' : 'var(--vg-pill-border)'}`,
            }}
          >
            {text.length}/280
          </Text>
        </Flex>

        <Paragraph
          style={{
            whiteSpace: 'pre-wrap',
            margin: '0 0 12px',
            fontSize: 15,
            lineHeight: 1.65,
            color: 'var(--vg-canvas)',
          }}
        >
          {text}
        </Paragraph>

        {/* Artist's signature + copy */}
        <Flex justify="space-between" align="center">
          <Text className="vg-signature">Vincent&nbsp;✦</Text>
          <Button
            size="small"
            type="text"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            style={{ color: copied ? 'var(--vg-success)' : 'var(--vg-faint)', fontSize: 12 }}
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              message.success('Tweet copied');
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Flex>
      </div>
      </div>
    </div>
  );
}
