import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const sans = Atkinson_Hyperlegible({ subsets: ['latin', 'latin-ext'], weight: ['400', '700'], variable: '--font-sans', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin', 'latin-ext'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Watchdog — Environmental Early Warning', template: '%s · Watchdog' },
  description: "The stream's early-warning system is already out walking. A human-reviewed One Health warning network for urban streams.",
  applicationName: 'Watchdog',
};

export const viewport: Viewport = { themeColor: '#F4F0E8', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
