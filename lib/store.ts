import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Domain } from './types';
import { buildScenario, reduce, type Action } from './sim';
import { eraseDevice } from './privacy';
import { addMs } from './utils';
import { bindStore, sync } from './sync';

export type Locale = 'en' | 'pt';
export interface Prefs { locale: Locale; largeText: boolean; consoleTz: string }
export interface Device { id: string; name?: string; pet?: string }

export interface WDState {
  d: Domain; hydrated: boolean; running: boolean; speed: number; storageFull: boolean;
  session: string | null; device: Device; follows: string[]; volunteer: string; prefs: Prefs;
  dispatch: (a: Action) => string | undefined;
  reset: (preset?: string) => void;
  advance: (minutes: number) => void;
  setRunning: (r: boolean) => void;
  setSpeed: (s: number) => void;
  login: (personId: string) => void;
  logout: () => void;
  toggleFollow: (siteId: string) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setDevice: (p: Partial<Device>) => void;
  newDevice: () => void;
  forgetDevice: () => { deleted: number; unlinked: number };
  setVolunteer: (id: string) => void;
}

const randomDevice = () => `anon-${Math.random().toString(16).slice(2, 6)}`;

/** Drops older photos from the serialised state when localStorage is full. */
function slim(json: string, keep: number) {
  try {
    const v = JSON.parse(json) as { state?: { d?: Domain } };
    const d = v.state?.d;
    if (!d) return json;
    let n = 0;
    for (const o of d.observations) if (o.photo && ++n > keep) delete o.photo;
    for (const l of d.looks) if (l.response?.photo && ++n > keep) delete l.response.photo;
    return JSON.stringify(v);
  } catch { return json; }
}
const storage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => {
    for (const attempt of [() => v, () => slim(v, 4), () => slim(v, 0)]) {
      try { localStorage.setItem(k, attempt()); return; } catch { /* quota — try slimmer */ }
    }
    if (!useWD.getState().storageFull) useWD.setState({ storageFull: true });
  },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const useWD = create<WDState>()(
  persist(
    (set, get) => ({
      d: buildScenario('day2'),
      hydrated: false,
      running: false,
      speed: 60,
      storageFull: false,
      session: null,
      device: { id: 'anon-8f92', name: 'Ana', pet: 'Bolota' },
      follows: ['COI-03'],
      volunteer: 'tiago',
      prefs: { locale: 'en', largeText: false, consoleTz: 'Europe/Lisbon' },
      dispatch: (a) => { const next = reduce(get().d, a); set({ d: next }); sync.send(a); return next.lastCreated; },
      reset: (preset = 'day2') => { set({ d: buildScenario(preset), running: false }); sync.reset(preset); },
      advance: (minutes) => { const d = get().d; const a: Action = { type: 'advance', to: addMs(d.now, Math.round(minutes * 60_000)) }; set({ d: reduce(d, a) }); sync.send(a); },
      setRunning: (running) => set({ running }),
      setSpeed: (speed) => set({ speed }),
      login: (session) => set({ session }),
      logout: () => set({ session: null }),
      toggleFollow: (id) => set((s) => ({ follows: s.follows.includes(id) ? s.follows.filter((x) => x !== id) : [...s.follows, id] })),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setDevice: (p) => set((s) => ({ device: { ...s.device, ...p } })),
      newDevice: () => set({ device: { id: randomDevice() }, follows: [] }),
      forgetDevice: () => {
        const { d, device } = get();
        const r = eraseDevice(d, device.id, device.pet ? [device.pet] : []);
        set({ d: r.d, device: { id: randomDevice() }, follows: [] });
        sync.send({ type: 'device/erase', deviceId: device.id, names: device.pet ? [device.pet] : [] });
        return { deleted: r.deleted, unlinked: r.unlinked };
      },
      setVolunteer: (volunteer) => set({ volunteer }),
    }),
    {
      name: 'watchdog-state',
      version: 1,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      partialize: (s) => ({ d: s.d, session: s.session, device: s.device, follows: s.follows, volunteer: s.volunteer, prefs: s.prefs, speed: s.speed }),
      migrate: () => ({}) as unknown as WDState,
    },
  ),
);

export const useDomain = () => useWD((s) => s.d);

/** Remote transport (NEXT_PUBLIC_BACKEND=remote): the sync engine reads and replaces the domain through this bridge. */
bindStore({ get: () => useWD.getState().d, set: (d) => useWD.setState({ d }) });
