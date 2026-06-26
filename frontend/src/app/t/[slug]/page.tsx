import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGenerationBySlug } from '@/lib/share';
import { getService } from '@/lib/services/registry';
import { explorerTxUrl } from '@/lib/config';
import { PublicThread } from '@/components/PublicThread';

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

  return (
    <PublicThread
      label={label}
      topic={thread.topic ?? null}
      tweets={thread.thread_content}
      token={thread.token}
      txUrl={explorerTxUrl(thread.tx_id)}
      chained={chained}
      slug={slug}
    />
  );
}
