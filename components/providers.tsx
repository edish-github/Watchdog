'use client';

import { useEffect } from 'react';
import { useWD } from '@/lib/store';
import { useLiveWeather } from '@/lib/openmeteo';
import { useOutbox } from '@/lib/outbox';
import { Toaster } from './toast';

/** Rehydrates persisted state (live weather first, so scores match), drives the replay clock, applies prefs, hosts toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  const running = useWD((s) => s.running);
  const speed = useWD((s) => s.speed);
  const largeText = useWD((s) => s.prefs.largeText);

  useEffect(() => {
    Promise.all([Promise.resolve(useLiveWeather.persist.rehydrate()), Promise.resolve(useOutbox.persist.rehydrate())])
      .then(() => useWD.persist.rehydrate())
      .finally(() => useWD.setState({ hydrated: true }));
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => useWD.getState().advance(speed / 60), 1000);
    return () => window.clearInterval(id);
  }, [running, speed]);

  useEffect(() => { document.documentElement.classList.toggle('large-text', largeText); }, [largeText]);

  return (<>{children}<Toaster /></>);
}
