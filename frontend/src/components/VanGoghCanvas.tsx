'use client';

import { useEffect } from 'react';
import { Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { STACKS_NETWORK } from '@/lib/config';

const { Text } = Typography;

// Full-screen Van Gogh "canvas being painted" overlay. Pure SVG/CSS; honours
// reduced-motion (shows the finished scene statically). Used for the app-open
// splash and the generation takeover. Locks body scroll while mounted.
export function VanGoghCanvas({ label, tx, fadingOut }: {
  label: string; tx?: string; fadingOut?: boolean;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className={`vg-canvas-overlay${fadingOut ? ' is-out' : ''}`} role="status" aria-label={label}>
      <svg className="vg-canvas-art" width="220" height="200" viewBox="0 0 220 200" aria-hidden="true">
        {/* rolling hills */}
        <path d="M0 168 C60 150 150 150 220 170 L220 200 L0 200 Z" fill="#13351f" />
        {/* moon + halo */}
        <circle cx="168" cy="48" r="30" fill="#f7e190" opacity="0.15" />
        <circle className="vg-canvas-moon" cx="168" cy="48" r="20" fill="#f7e190" opacity="0.9" />
        {/* swirling brush strokes */}
        <g className="vg-canvas-swirl">
          <path d="M70 70 C100 55 120 80 105 100 C95 113 78 108 80 94"
            stroke="#6b8fc7" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <path d="M70 70 C95 62 108 80 99 95"
            stroke="#c9b85e" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
        </g>
        {/* stars */}
        <circle className="vg-canvas-star" cx="36" cy="40" r="3" fill="#f5d76e" />
        <circle className="vg-canvas-star" cx="200" cy="120" r="2.5" fill="#f7e190" />
        <circle className="vg-canvas-star" cx="28" cy="110" r="2.5" fill="#f5d76e" />
      </svg>

      <Text
        className="vg-loader__caption tp-display"
        style={{ color: 'var(--vg-gold)', fontStyle: 'italic', fontSize: 17 }}
      >
        {label}
      </Text>

      {tx && (
        <Typography.Link
          className="tp-mono"
          href={`https://explorer.hiro.so/txid/${tx}?chain=${STACKS_NETWORK}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--vg-muted)' }}
        >
          {tx.slice(0, 10)}…{tx.slice(-8)} <ExportOutlined />
        </Typography.Link>
      )}
    </div>
  );
}
