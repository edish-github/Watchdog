'use client';

import { useEffect } from 'react';
import { CITIES } from '@/lib/catalog';
import { useLiveWeather } from '@/lib/openmeteo';
import { useSync } from '@/lib/sync';
import { backendMode, serverApi } from '@/lib/transport';

/**
 * Remote mode: keeps this browser's weather overrides equal to the sandbox's server snapshots, so charts and
 * optimistic updates here use exactly the weather the server scores with — on the laptop and on a joined phone.
 */
export function WeatherBridge() {
  const key = useSync((s) => JSON.stringify(s.workspace?.weather ?? null));
  useEffect(() => {
    if (backendMode() !== 'remote' || key === 'null') return;
    const want = JSON.parse(key) as Record<string, string>;
    const { imports, save } = useLiveWeather.getState();
    for (const c of CITIES) {
      const have = imports[c.id]?.fetchedAt;
      if (want[c.id] && want[c.id] !== have) {
        serverApi.weather(c.id).then((imp) => useLiveWeather.getState().save(c.id, imp)).catch(() => { /* retried on the next change */ });
      } else if (!want[c.id] && have) save(c.id, null);
    }
  }, [key]);
  return null;
}
