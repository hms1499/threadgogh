'use client';

import { ConfigProvider, App as AntApp } from 'antd';
import { darkTheme, lightTheme } from '@/theme/themeConfig';
import { useTheme } from '@/theme/ThemeContext';

// ConfigProvider must wrap App so message/notification use the theme tokens (v6).
export function Providers({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <ConfigProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
