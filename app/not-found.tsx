import Link from 'next/link';
import { LogoMark } from '@/components/icons';

export default function NotFound() {
  return (
    <main className="dot-grid grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <LogoMark className="mx-auto h-10 w-10 text-ink" />
        <p className="eyebrow mt-6">404</p>
        <h1 className="display mt-2 text-5xl">This reach isn’t on our map.</h1>
        <p className="mt-3 text-ink-2">The page doesn’t exist, or it moved upstream.</p>
        <div className="mt-7 flex justify-center gap-2"><Link href="/" className="btn btn-dark">Home</Link><Link href="/observe" className="btn btn-outline">Public stream map</Link></div>
      </div>
    </main>
  );
}
