'use client';

import { useState } from 'react';
import { Button, Flex, App } from 'antd';
import { CopyOutlined, TwitterOutlined } from '@ant-design/icons';
import { PostThreadModal } from '@/components/PostThreadModal';

// Client island for the public page: copy the whole thread, or walk the
// post-to-X flow. Reuses PostThreadModal. `chained` controls i/n numbering.
export function PublicThreadActions({ thread, chained }: { thread: string[]; chained: boolean }) {
  const { message } = App.useApp();
  const [postOpen, setPostOpen] = useState(false);
  return (
    <Flex gap={8} align="center">
      <Button
        icon={<CopyOutlined />}
        onClick={() => {
          navigator.clipboard.writeText(thread.join('\n\n'));
          message.success('Whole thread copied');
        }}
      >
        Copy
      </Button>
      <Button type="primary" icon={<TwitterOutlined />} onClick={() => setPostOpen(true)}>
        Post to X
      </Button>
      <PostThreadModal thread={thread} chained={chained} open={postOpen} onClose={() => setPostOpen(false)} />
    </Flex>
  );
}
