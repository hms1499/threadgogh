// Pure, DOM-free theme-mode logic so it can be unit-tested without a browser.
export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tg-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

// Explicit stored choice always wins; otherwise default to dark (the app's
// baseline — CSS :root is dark). OS preference is intentionally not consulted.
export function resolveInitialMode(stored: string | null): ThemeMode {
  return isThemeMode(stored) ? stored : 'dark';
}

export function nextMode(mode: ThemeMode): ThemeMode {
  return mode === 'dark' ? 'light' : 'dark';
}
