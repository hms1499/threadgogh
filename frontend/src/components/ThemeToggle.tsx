'use client';

import { Button } from 'antd';
import { useTheme } from '@/theme/ThemeContext';

// ☾/☀ icon button. Shows the sun while dark (click → light) and the moon
// while light (click → dark). Sits over the hero artwork, so it uses the
// glass tokens like the wallet pill.
export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';
  return (
    <Button
      className="vg-wallet-btn vg-theme-toggle"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      icon={<span className="vg-theme-toggle__icon">{isDark ? '☀' : '☾'}</span>}
      style={{
        background: 'var(--vg-glass)',
        borderColor: 'var(--vg-glass-border)',
        color: 'var(--vg-on-art)',
        backdropFilter: 'blur(8px)',
      }}
    />
  );
}
