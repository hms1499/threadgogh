import { describe, it, expect } from 'vitest';
import { resolveInitialMode, nextMode, isThemeMode, THEME_STORAGE_KEY } from '../themeMode';

describe('themeMode', () => {
  it('stored choice wins over OS preference', () => {
    expect(resolveInitialMode('light', true)).toBe('light');
    expect(resolveInitialMode('dark', false)).toBe('dark');
  });

  it('falls back to OS when nothing stored', () => {
    expect(resolveInitialMode(null, true)).toBe('dark');
    expect(resolveInitialMode(null, false)).toBe('light');
  });

  it('ignores invalid stored values and uses OS', () => {
    expect(resolveInitialMode('purple', true)).toBe('dark');
    expect(resolveInitialMode('', false)).toBe('light');
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
