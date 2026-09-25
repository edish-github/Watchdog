'use client';

import { create } from 'zustand';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'info' | 'warn';
interface Toast { id: number; title: string; body?: string; tone: Tone }
interface ToastState { list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }

let seq = 0;
const useToasts = create<ToastState>((set) => ({
  list: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ list: [...s.list.slice(-3), { ...t, id }] }));
    window.setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 4500);
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}));

export function toast(title: string, body?: string, tone: Tone = 'success') { useToasts.getState().push({ title, body, tone }); }

const ICON = { success: CircleCheck, info: Info, warn: TriangleAlert };
const COLOR = { success: 'text-[#1F9483]', info: 'text-plum', warn: 'text-[#C8344F]' };

export function Toaster() {
  const list = useToasts((s) => s.list);
  const drop = useToasts((s) => s.drop);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
      {list.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex animate-rise items-start gap-3 rounded-2xl border border-line bg-paper/95 p-3.5 shadow-lift backdrop-blur">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', COLOR[t.tone])} />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{t.title}</p>{t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}</div>
            <button onClick={() => drop(t.id)} className="rounded-full p-1 text-ink-3 hover:bg-sand hover:text-ink" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
    </div>
  );
}
