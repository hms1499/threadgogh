'use client';

import { Button, Flex, Typography, App } from 'antd';
import { ShareAltOutlined, LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

// Presentational only — the share network call + wallet signing live in page.tsx
// (where the auth dance already exists). Before share: a "Share" button. After:
// the public link with a copy affordance.
export function ShareButton({ shared, sharing, shareUrl, onShare, onCopy }: {
  shared: boolean; sharing: boolean; shareUrl: string | null;
  onShare: () => void; onCopy: () => void;
}) {
  const { message } = App.useApp();
  if (shared && shareUrl) {
    return (
      <Flex gap={6} align="center">
        <Text type="secondary" ellipsis style={{ maxWidth: 220 }}>{shareUrl}</Text>
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={() => { onCopy(); message.success('Share link copied'); }}
        >
          Copy link
        </Button>
      </Flex>
    );
  }
  return (
    <Button size="small" icon={<ShareAltOutlined />} loading={sharing} onClick={onShare}>
      Share
    </Button>
  );
}
