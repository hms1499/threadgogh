import { ImageResponse } from 'next/og';
import { getGenerationBySlug } from '@/lib/share';

export const alt = 'Thread on ThreadGogh';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const thread = await getGenerationBySlug(slug);
  const hook =
    thread?.thread_content[0]?.slice(0, 180) ??
    'A thread generated with ThreadGogh';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: '#0f0f17',
          color: '#f5f5f5',
          fontSize: 48,
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', lineHeight: 1.2 }}>{hook}</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#9aa0aa' }}>
          ThreadGogh · paid on Stacks
        </div>
      </div>
    ),
    { ...size },
  );
}
