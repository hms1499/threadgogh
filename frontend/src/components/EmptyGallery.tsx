'use client';

import { Flex, Typography } from 'antd';

const { Text } = Typography;

// Shown before the first generation — an empty easel inviting the user to
// "paint" their first thread. Pure SVG, theme-aligned.
export function EmptyGallery() {
  return (
    <Flex vertical align="center" gap={12} style={{ padding: '32px 0 8px' }}>
      <svg width="150" height="150" viewBox="0 0 160 160" role="img" aria-label="An empty easel">
        {/* Easel legs */}
        <g stroke="#7a6242" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M80 24 L36 142" />
          <path d="M80 24 L124 142" />
        </g>
        <path d="M80 26 L86 150" stroke="#5f4c34" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        {/* Ledge + brace */}
        <path d="M49 100 L111 100" stroke="#7a6242" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M45 122 L115 122" stroke="#7a6242" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />

        {/* Gilded frame */}
        <rect x="46" y="46" width="68" height="52" rx="3" fill="#b9962f" />
        <rect x="46" y="46" width="68" height="52" rx="3" fill="none" stroke="#e3c570" strokeWidth="1" opacity="0.6" />
        {/* Navy canvas */}
        <rect x="50" y="50" width="60" height="44" rx="1.5" fill="#101d3f" />

        {/* A lone swirl + stars waiting to be painted */}
        <path d="M68 74 C68 66 90 66 90 77 C90 85 74 85 74 73 C74 68 84 68 84 73"
              fill="none" stroke="#6b8fc7" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
        <path d="M76 73 C76 69 85 69 85 74"
              fill="none" stroke="#f5d76e" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        <circle className="vg-easel-star" cx="100" cy="58" r="2.2" fill="#f7e190" />
        <circle className="vg-easel-star" cx="57" cy="61" r="1.4" fill="#f5d76e" />
        <circle className="vg-easel-star" cx="102" cy="86" r="1.4" fill="#f5d76e" opacity="0.8" />
      </svg>

      <Text className="tp-display" style={{ color: 'var(--vg-gold)', fontStyle: 'italic', fontSize: 17 }}>
        An empty canvas
      </Text>
      <Text style={{ color: 'var(--vg-faint)', fontSize: 14, textAlign: 'center', maxWidth: 320 }}>
        Generate your first thread — it&apos;ll hang here as a framed painting.
      </Text>
    </Flex>
  );
}
