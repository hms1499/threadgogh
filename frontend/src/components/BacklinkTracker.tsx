'use client';

import { useEffect, useRef } from 'react';
import { backlinkVariant } from '@/lib/track';

// Renders nothing. On a fresh landing that carries the backlink marker (?ref=tg), fire
// exactly one fire-and-forget beacon recording the variant (home vs deep-link thread).
// Reads window.location directly to avoid the useSearchParams Suspense requirement.
export function BacklinkTracker() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (new URLSearchParams(window.location.search).get('ref') !== 'tg') return;
    const variant = backlinkVariant(window.location.pathname);
    const body = JSON.stringify({ event: 'backlink_land', variant });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/track', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  }, []);
  return null;
}
