'use client';

import { useEffect, useRef, useState } from 'react';
import { splashDone } from '@/lib/splash';
import { VanGoghCanvas } from './VanGoghCanvas';

// App-open splash. Shows the painting until services settle (loaded or errored)
// or the cap elapses, then fades out (~400ms) and unmounts. Shown on every load.
export function AppSplash({ servicesSettled, capMs = 2500 }: {
  servicesSettled: boolean; capMs?: number;
}) {
  const startRef = useRef(Date.now());
  const [done, setDone] = useState(false);   // readiness reached → begin fade
  const [hidden, setHidden] = useState(false); // fade finished → unmount

  // Dismiss when ready, and arm a cap timer so a slow network can't trap the user.
  useEffect(() => {
    if (done) return;
    if (splashDone(servicesSettled, Date.now() - startRef.current, capMs)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(true);
      return;
    }
    const remaining = Math.max(0, capMs - (Date.now() - startRef.current));
    const t = setTimeout(() => setDone(true), remaining);
    return () => clearTimeout(t);
  }, [servicesSettled, capMs, done]);

  // Play the fade-out, then unmount.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 400);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  return <VanGoghCanvas label="Warming up the studio…" fadingOut={done} />;
}
