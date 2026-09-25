'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { PEOPLE } from './catalog';
import { useWD } from './store';
import type { Person } from './types';

export function useActor(): Person | undefined {
  const id = useWD((s) => s.session);
  return id ? PEOPLE[id] : undefined;
}
export const useActorName = () => useActor()?.name ?? 'Coordinator';
export const useConsoleTz = () => useWD((s) => s.prefs.consoleTz);

export const ROLE_LABEL: Record<Person['role'], string> = {
  coordinator: 'Coordinator', citizen_scientist: 'Citizen scientist', health_liaison: 'Health liaison', researcher: 'Researcher',
};

export function useClickAway(ref: RefObject<HTMLElement | null>, onAway: () => void, active = true) {
  const cb = useRef(onAway);
  cb.current = onAway;
  useEffect(() => {
    if (!active) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [ref, active]);
}
