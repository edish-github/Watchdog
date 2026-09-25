import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth';

export const metadata: Metadata = { title: 'Sign in' };
export default function LoginPage() {
  return <Suspense fallback={null}><AuthScreen mode="signin" /></Suspense>;
}
