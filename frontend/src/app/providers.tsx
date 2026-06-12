'use client';

import { ConfigProvider, App as AntApp } from 'antd';
import themeConfig from '@/theme/themeConfig';

// ConfigProvider phai boc App de message/notification dung token theme (v6).
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
