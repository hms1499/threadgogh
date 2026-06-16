'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, isThemeMode, nextMode, resolveInitialMode, type ThemeMode } from './themeMode';

type ThemeContextValue = { mode: ThemeMode; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR/first render defaults to dark (matches CSS :root). The effect below
  // reconciles with the value the no-FOUC script already applied.
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [userChose, setUserChose] = useState(false);

  // On mount, read storage + OS once to seed state (the inline script already
  // painted the right theme; this just syncs React to it).
  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
    })();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setUserChose(isThemeMode(stored));
    setMode(resolveInitialMode(stored, prefersDark));
  }, []);

  // Apply the resolved mode to <html> for the CSS variable switch.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  // Follow OS changes only until the user makes an explicit choice.
  useEffect(() => {
    if (userChose) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setMode(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [userChose]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = nextMode(current);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
    setUserChose(true);
  }, []);

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
