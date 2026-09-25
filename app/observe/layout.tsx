import type { Metadata } from 'next';
import { MobileShell } from '@/components/observe/mobile-shell';

export const metadata: Metadata = { title: 'Streams', description: 'Your stream’s 72-hour forecast and a 30-second sentinel report.' };
export default function ObserveLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
