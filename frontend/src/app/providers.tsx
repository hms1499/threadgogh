'use client';

import { ConfigProvider, App as AntApp } from 'antd';
import themeConfig from '@/theme/themeConfig';

// ConfigProvider must wrap App so message/notification use the theme tokens (v6).
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
