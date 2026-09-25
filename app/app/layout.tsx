import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/app-shell';

export const metadata: Metadata = { title: 'Console' };
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
