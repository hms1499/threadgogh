'use client';
import { Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

// outline[0] corresponds to the (already-shown) hook; the locked rows are the rest.
export function lockedOutlineRows(outline: string[] | null): string[] {
  return outline ? outline.slice(1) : [];
}

export function OutlinePreview({ hook, outline, priceLabel }: {
  hook: string;
  outline: string[] | null;
  priceLabel: string;
}) {
  const lockedRows = lockedOutlineRows(outline);
  return (
    <div className="tp-rise vg-gallery" style={{ marginTop: 20, padding: 16 }}>
      <Text style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--vg-on-art-faint)', marginBottom: 8 }}>
        Free preview — your hook
      </Text>
      <Paragraph style={{ margin: 0, color: 'var(--vg-on-art)', fontSize: 15 }}>{hook}</Paragraph>

      {lockedRows.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lockedRows.map((title, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.62 }}>
              <LockOutlined style={{ color: 'var(--vg-on-art-faint)' }} />
              <Text style={{ color: 'var(--vg-on-art-soft)', fontSize: 14 }}>{title}</Text>
            </div>
          ))}
        </div>
      )}

      <Text style={{ display: 'block', marginTop: 14, color: 'var(--vg-on-art-soft)', fontSize: 13 }}>
        Pay {priceLabel} to unlock the full thread.
      </Text>
    </div>
  );
}
