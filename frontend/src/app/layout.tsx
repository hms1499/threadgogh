import type { Metadata } from 'next';
import { Playfair_Display, Sora, JetBrains_Mono } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from './providers';
import { ThemeProvider } from '@/theme/ThemeContext';
import './globals.css';

const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', style: ['normal', 'italic'] });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const TITLE = 'ThreadGogh — AI threads, pay per generate with Bitcoin';
const DESCRIPTION =
  'AI writes X threads — pay per generate with STX or sBTC on Stacks. No account, no subscription.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'ThreadGogh',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  // Domain/project ownership verification (TalentApp). Renders as
  // <meta name="talentapp:project_verification" content="…"> in <head>.
  other: {
    'talentapp:project_verification':
      'daf45ef9fa39647a8907f0a9204a8eb8a48064643051c6ac6eb988e71b580f5ece5b4590414629ffc4dd24fe3e1d1f9f7fab2181209258c82e80fda993f6ecd4',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sora.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Set the theme before first paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('tg-theme');var m=(s==='light'||s==='dark')?s:'dark';var e=document.documentElement;e.dataset.theme=m;e.style.colorScheme=m;}catch(_){}})();",
          }}
        />
        <ThemeProvider>
          <AntdRegistry>
            <Providers>{children}</Providers>
          </AntdRegistry>
        </ThemeProvider>
      </body>
    </html>
  );
}
