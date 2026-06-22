'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, nextMode, resolveInitialMode, type ThemeMode } from './themeMode';

type ThemeContextValue = { mode: ThemeMode; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR/first render defaults to dark (matches CSS :root). The effect below
  // reconciles with the value the no-FOUC script already applied.
  const [mode, setMode] = useState<ThemeMode>('dark');

  // On mount, read the stored choice once to seed state (the inline script
  // already painted the right theme; this just syncs React to it). With no
  // stored choice the app defaults to dark — OS preference is not consulted.
  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
    })();
    setMode(resolveInitialMode(stored));
  }, []);

  // Apply the resolved mode to <html> for the CSS variable switch.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = nextMode(current);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
