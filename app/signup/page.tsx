import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth';

export const metadata: Metadata = { title: 'Sign up' };
export default function SignupPage() {
  return <Suspense fallback={null}><AuthScreen mode="signup" /></Suspense>;
}
