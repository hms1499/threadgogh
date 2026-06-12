'use client';

import { Card, Typography, Button, Tag, Flex, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export function TweetCard({ text, index, total }: {
  text: string; index: number; total: number;
}) {
  const { message } = App.useApp();
  const over = text.length > 280;

  return (
    <Card
      size="small"
      variant="outlined"
      style={{ backdropFilter: 'blur(10px)' }}
      styles={{ body: { padding: 16 } }}
    >
      <Flex justify="space-between" align="center">
        <Text className="tp-mono" type="secondary" style={{ fontSize: 12 }}>
          {String(index + 1).padStart(2, '0')} / {total}
        </Text>
        <Tag
          className="tp-mono"
          color={over ? 'error' : undefined}
          bordered={false}
          style={{ marginInlineEnd: 0 }}
        >
          {text.length}/280
        </Tag>
      </Flex>

      <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '12px 0 8px', fontSize: 15, lineHeight: 1.6 }}>
        {text}
      </Paragraph>

      <Flex justify="flex-end">
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            message.success('Đã copy tweet');
          }}
        >
          Copy
        </Button>
      </Flex>
    </Card>
  );
}
