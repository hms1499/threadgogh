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
    <div className="vg-frame">
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
            margin: '0 0 12px',
            fontSize: 15,
            lineHeight: 1.65,
            color: '#e8eaf6',
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
    </div>
  );
}
