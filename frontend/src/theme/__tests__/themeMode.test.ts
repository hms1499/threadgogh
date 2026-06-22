import { describe, it, expect } from 'vitest';
import { resolveInitialMode, nextMode, isThemeMode, THEME_STORAGE_KEY } from '../themeMode';

describe('themeMode', () => {
  it('stored choice always wins', () => {
    expect(resolveInitialMode('light')).toBe('light');
    expect(resolveInitialMode('dark')).toBe('dark');
  });

  it('defaults to dark when nothing stored', () => {
    expect(resolveInitialMode(null)).toBe('dark');
  });

  it('ignores invalid stored values and defaults to dark', () => {
    expect(resolveInitialMode('purple')).toBe('dark');
    expect(resolveInitialMode('')).toBe('dark');
  });

  it('toggles between the two modes', () => {
    expect(nextMode('dark')).toBe('light');
    expect(nextMode('light')).toBe('dark');
  });

  it('validates theme-mode strings', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('exposes the storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('tg-theme');
  });
});
