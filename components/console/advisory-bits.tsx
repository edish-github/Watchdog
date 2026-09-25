'use client';

import { useRouter } from 'next/navigation';
import { CircleCheck, CircleX, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Lang, Site } from '@/lib/types';
import { whenText, type Check } from '@/lib/advisory';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { CITY } from '@/lib/catalog';
import { cn, dayAdd, fmtClock, localDate, zonedToUtc } from '@/lib/utils';
import { toast } from '../toast';

export const LANG_LABEL: Record<Lang, string> = { en: 'English', pt: 'Português', nl: 'Nederlands', fr: 'Français', it: 'Italiano', nb: 'Norsk' };

export const toLocalInput = (iso: string, tz: string) => `${localDate(iso, tz)}T${fmtClock(iso, tz)}`;
export function fromLocalInput(v: string, tz: string) {
  const [date, hm = '00:00'] = v.split('T');
  const [h, m] = hm.split(':').map(Number);
  return zonedToUtc(date, h || 0, m || 0, tz);
}
/** Next occurrence of a weekday (0 = Sunday) at hh:00 local time, strictly after now. */
export function nextWeekdayAt(now: string, tz: string, weekday: number, hour: number) {
  const today = localDate(now, tz);
  for (let i = 0; i <= 7; i++) {
    const date = dayAdd(today, i);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday) { const iso = zonedToUtc(date, hour, 0, tz); if (iso > now) return iso; }
  }
  return zonedToUtc(dayAdd(today, 7), hour, 0, tz);
}
/** Rewrites the validity phrase in every language when the coordinator changes the expiry. */
export function retime(text: Partial<Record<Lang, string>>, langs: Lang[], site: Site, from: string, to: string) {
  const out = { ...text };
  for (const l of langs) { const a = whenText(from, site, l), b = whenText(to, site, l), t = out[l]; if (t) out[l] = t.split(a).join(b); }
  return out;
}

export function GuardrailList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-line/70">
      {checks.map((c) => {
        const Icon = c.pass ? CircleCheck : c.blocking ? CircleX : TriangleAlert;
        return (
          <li key={c.id} className="flex gap-3 px-5 py-2.5">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', c.pass ? 'text-[#1F9483]' : c.blocking ? 'text-[#C8344F]' : 'text-[#D99A2B]')} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">{c.label}{!c.pass && c.blocking && <span className="rounded-full bg-[#F7DCE0] px-1.5 text-[10px] text-[#A11C3A]">blocks publishing</span>}</p>
              <p className="truncate text-xs text-ink-2">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** How the advisory will look on the public site page. */
export function AdvisoryPreview({ site, text, lang, validUntil, approvedBy }: { site: Site; text: string; lang: Lang; validUntil: string; approvedBy?: string }) {
  const pt = lang === 'pt';
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[30px] border-[7px] border-espresso bg-canvas p-3.5 shadow-lift">
      <p className="mono text-[10px] text-ink-3">{site.id} · {CITY[site.cityId].name}</p>
      <p className="display text-2xl leading-tight">{site.stream}</p>
      <div className="mt-2 rounded-2xl border border-[#EDB7C0] bg-[#F7DCE0]/70 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#A11C3A]"><ShieldAlert className="h-3.5 w-3.5" />{pt ? 'Aviso de precaução em vigor' : 'Precaution advisory in effect'}</p>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{text || '—'}</p>
        <p className="mt-2 border-t border-[#A11C3A]/15 pt-1.5 text-[11px] font-bold text-[#A11C3A]">{pt ? 'Válido até' : 'Valid until'} {whenText(validUntil, site, lang)}</p>
        {approvedBy && <p className="text-[11px] text-ink-2">{pt ? `Aprovado por ${approvedBy}` : `Approved by ${approvedBy}`}</p>}
      </div>
      <p className="mt-2 text-center text-[10px] text-ink-3">{pt ? 'Dados sintéticos · piloto OneAquaHealth' : 'Synthetic data · OneAquaHealth pilot'}</p>
    </div>
  );
}

/** Opens the signal’s current draft or live advisory, or drafts a new one from the signal’s evidence. */
export function useOpenDraft() {
  const router = useRouter();
  const actor = useActorName();
  return (signalId: string) => {
    const st = useWD.getState();
    const s = st.d.signals.find((x) => x.id === signalId);
    if (!s) return;
    const existing = s.advisoryId ? st.d.advisories.find((a) => a.id === s.advisoryId && (a.status === 'draft' || a.status === 'live')) : undefined;
    if (existing) { router.push(`/app/advisories/${existing.id}`); return; }
    const id = st.dispatch({ type: 'advisory/draft', signalId, actor });
    if (id) { toast(`${id} drafted`, 'Bilingual draft from the signal’s evidence — edit, check and approve.', 'info'); router.push(`/app/advisories/${id}`); }
  };
}
