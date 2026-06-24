import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Flex, Typography } from 'antd';
import { getGenerationBySlug } from '@/lib/share';
import { getService } from '@/lib/services/registry';
import { explorerTxUrl } from '@/lib/config';
import { TweetCard } from '@/components/TweetCard';
import { PublicThreadActions } from '@/components/PublicThreadActions';

const { Title, Text, Paragraph } = Typography;

function serviceLabel(serviceId: string): { label: string; chained: boolean } {
  try {
    const s = getService(serviceId);
    return { label: s.label, chained: s.chained };
  } catch {
    return { label: 'Thread', chained: true };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getGenerationBySlug(slug);
  if (!t) return { title: 'Thread not found · ThreadGogh' };
  const title = t.topic ? `${t.topic} · ThreadGogh` : 'A thread · ThreadGogh';
  return { title, description: t.thread_content[0]?.slice(0, 200) ?? 'Generated with ThreadGogh.' };
}

export default async function PublicThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getGenerationBySlug(slug);
  if (!thread) notFound();

  const { label, chained } = serviceLabel(thread.service_id);
  const tweets = thread.thread_content;

  return (
    <Flex vertical gap={16} style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Text type="secondary">{label}</Text>
          {thread.topic && <Title level={3} style={{ margin: 0 }}>{thread.topic}</Title>}
        </div>
        <PublicThreadActions thread={tweets} chained={chained} />
      </Flex>

      <Paragraph type="secondary" style={{ margin: 0 }}>
        Paid with {thread.token} on Stacks ·{' '}
        <a href={explorerTxUrl(thread.tx_id)} target="_blank" rel="noopener noreferrer">view tx</a>
      </Paragraph>

      <Flex vertical gap={12}>
        {tweets.map((t, i) => (
          <TweetCard key={i} text={t} index={i} total={tweets.length} />
        ))}
      </Flex>

      <Flex justify="center" style={{ marginTop: 24 }}>
        <a href="/"><Title level={4} style={{ margin: 0 }}>✍️ Create your own thread →</Title></a>
      </Flex>
    </Flex>
  );
}
