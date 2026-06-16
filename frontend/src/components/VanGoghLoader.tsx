'use client';

import { Flex, Typography } from 'antd';

const { Text } = Typography;

// A swirling night-sky loader — evokes Van Gogh's brush tracing the sky
// while the AI "paints" the thread. Pure SVG/CSS, honours reduced-motion.
export function VanGoghLoader({ label = 'Painting your thread…' }: { label?: string }) {
  return (
    <Flex vertical align="center" gap={14} style={{ padding: '12px 0 4px' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={label}>
        {/* Moon glow at centre */}
        <circle cx="60" cy="60" r="16" fill="#f7e190" opacity="0.18" />
        <circle cx="60" cy="60" r="8" fill="#f7e190" opacity="0.85" />

        {/* Outer swirling arc — slow clockwise */}
        <g className="vg-loader__swirl-out">
          <path
            d="M60 18 C83 18 102 37 102 60 C102 79 87 94 68 94 C54 94 43 83 43 69"
            stroke="#6b8fc7" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.7"
          />
          <path
            d="M60 28 C77 28 90 41 90 58"
            stroke="#c9b85e" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"
          />
        </g>

        {/* Inner swirl — counter-rotating, "draws" itself */}
        <g className="vg-loader__swirl-in">
          <path
            className="vg-loader__trace"
            d="M60 38 C72 38 80 47 80 59 C80 70 71 77 62 77 C55 77 50 72 50 65 C50 59 55 55 60 55"
            stroke="#f5d76e" strokeWidth="2.4" fill="none" strokeLinecap="round"
          />
        </g>

        {/* Twinkling stars */}
        <circle className="vg-loader__star" cx="24" cy="30" r="2.4" fill="#f5d76e" />
        <circle className="vg-loader__star" cx="98" cy="34" r="2" fill="#f7e190" />
        <circle className="vg-loader__star" cx="96" cy="92" r="2.4" fill="#f5d76e" />
        <circle className="vg-loader__star" cx="22" cy="88" r="2" fill="#f7e190" />
      </svg>

      <Text className="vg-loader__caption tp-display" style={{ color: 'var(--vg-gold)', fontStyle: 'italic', fontSize: 15 }}>
        {label}
      </Text>
    </Flex>
  );
}
