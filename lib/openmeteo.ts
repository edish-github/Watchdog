import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CityId } from './types';
import { setWeatherOverrides } from './weather';
import type { LiveImport } from './openmeteo-api';

export { fetchGlofas, fetchOpenMeteo } from './openmeteo-api';
export type { DailyMap, LiveImport } from './openmeteo-api';

/**
 * Imported live weather per city, applied as overrides to the synthetic weather on rehydrate and on save.
 * Local mode: filled by the Data Sources page. Remote mode: mirrors the sandbox's server snapshot (WeatherBridge).
 */
export const useLiveWeather = create<{ imports: Partial<Record<CityId, LiveImport>>; save: (c: CityId, v: LiveImport | null) => void }>()(
  persist(
    (set) => ({
      imports: {},
      save: (c, v) => {
        setWeatherOverrides(c, v ? v.data : null);
        set((s) => { const imports = { ...s.imports }; if (v) imports[c] = v; else delete imports[c]; return { imports }; });
      },
    }),
    {
      name: 'watchdog-weather', storage: createJSONStorage(() => localStorage), skipHydration: true,
      onRehydrateStorage: () => (state) => { if (state) for (const [c, v] of Object.entries(state.imports)) if (v) setWeatherOverrides(c as CityId, v.data); },
    },
  ),
);
