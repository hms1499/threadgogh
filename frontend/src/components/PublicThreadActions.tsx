'use client';

import { useState } from 'react';
import { Button, Flex, App, Checkbox } from 'antd';
import { CopyOutlined, TwitterOutlined } from '@ant-design/icons';
import { PostThreadModal } from '@/components/PostThreadModal';
import { creditUrl, creditTweet } from '@/lib/postToX';

// Client island for the public page: copy the whole thread, or walk the
// post-to-X flow. Reuses PostThreadModal. `chained` controls i/n numbering.
// `includeCredit` (default on) appends a removable ThreadGogh backlink as a
// separate final tweet, deep-linking back to this thread.
export function PublicThreadActions({ thread, chained, slug }: { thread: string[]; chained: boolean; slug: string }) {
  const { message } = App.useApp();
  const [postOpen, setPostOpen] = useState(false);
  const [includeCredit, setIncludeCredit] = useState(true);
  const credit = includeCredit ? creditTweet(creditUrl(slug)) : null;
  return (
    <Flex gap={8} align="center" wrap justify="flex-end">
      <Checkbox checked={includeCredit} onChange={(e) => setIncludeCredit(e.target.checked)}>
        Add ThreadGogh link
      </Checkbox>
      <Button
        icon={<CopyOutlined />}
        onClick={() => {
          navigator.clipboard.writeText(credit ? `${thread.join('\n\n')}\n\n${credit}` : thread.join('\n\n'));
          message.success('Whole thread copied');
        }}
      >
        Copy
      </Button>
      <Button type="primary" icon={<TwitterOutlined />} onClick={() => setPostOpen(true)}>
        Post to X
      </Button>
      <PostThreadModal thread={thread} chained={chained} credit={credit} open={postOpen} onClose={() => setPostOpen(false)} />
    </Flex>
  );
}
