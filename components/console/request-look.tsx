'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Send } from 'lucide-react';
import type { HazardId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { activeSignal } from '@/lib/select';
import { CHECKLIST, CITY, PEOPLE, SITE } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { Avatar, Field, Modal, Segmented } from '../ui';
import { toast } from '../toast';

const VOLUNTEERS = Object.values(PEOPLE).filter((p) => p.role === 'citizen_scientist');

export function RequestLookModal({ open, onClose, siteId, hazard = 'H1', signalId, purpose = 'verify', onDone }: {
  open: boolean; onClose: () => void; siteId: string; hazard?: HazardId; signalId?: string; purpose?: 'verify' | 'resolve'; onDone?: (id?: string) => void;
}) {
  const d = useWD((s) => s.d);
  const actor = useActorName();
  const site = SITE[siteId];
  const live = d.advisories.find((a) => a.siteId === siteId && a.status === 'live');
  const [assignee, setAssignee] = useState('');
  const [hz, setHz] = useState<HazardId>(hazard);
  const [p, setP] = useState<'verify' | 'resolve'>(purpose);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setAssignee(CITY[site.cityId].volunteers[0]); setHz(hazard); setP(purpose === 'resolve' && !live ? 'verify' : purpose); setNote('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordered = useMemo(() => [...VOLUNTEERS].sort((a, b) => Number(b.cityId === site.cityId) - Number(a.cityId === site.cityId)), [site.cityId]);
  const load = (id: string) => d.looks.filter((l) => l.assignee === id && (l.status === 'queued' || l.status === 'accepted')).length;

  const submit = () => {
    const id = useWD.getState().dispatch({
      type: 'look/request', siteId, hazard: hz, purpose: p, assignee, actor,
      signalId: signalId ?? activeSignal(d, siteId, hz)?.id, advisoryId: p === 'resolve' ? live?.id : undefined, note: note.trim() || undefined,
    });
    toast(`${id ?? 'Look request'} dispatched`, `${PEOPLE[assignee]?.name} · ${site.id} · due in 24 h`);
    onDone?.(id);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Request a look" sub={`${site.id} · ${site.stream}, ${CITY[site.cityId].name}`} className="max-w-xl"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!assignee} onClick={submit}><Send className="h-4 w-4" />Dispatch look request</button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-5">
          <div><p className="mb-1.5 text-[13px] font-bold text-ink">Hazard</p><Segmented size="sm" value={hz} onChange={setHz} options={[{ value: 'H1', label: 'H1 · Heat & low flow' }, { value: 'H2', label: 'H2 · Wet weather' }]} /></div>
          <div><p className="mb-1.5 text-[13px] font-bold text-ink">Purpose</p><Segmented size="sm" value={p} onChange={(v) => { if (v === 'resolve' && !live) return; setP(v); }} options={[{ value: 'verify', label: 'Verify signs' }, { value: 'resolve', label: live ? `Resolve ${live.id}` : 'Resolve (no live advisory)' }]} /></div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-bold text-ink">Volunteer</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ordered.map((v) => (
              <button key={v.id} type="button" aria-pressed={assignee === v.id} onClick={() => setAssignee(v.id)}
                className={cn('flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition', assignee === v.id ? 'border-plum bg-plum-soft/60' : 'border-line hover:border-ink-3')}>
                <Avatar name={v.name} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{v.name}</span><span className="block truncate text-xs text-ink-3">{CITY[v.cityId ?? 'coimbra'].name} · {load(v.id)} open</span></span>
                {v.cityId === site.cityId && <span className="chip !text-[10px]">Local</span>}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-ink">Checklist sent to the volunteer</p>
          <ul className="space-y-1 rounded-2xl bg-sand/50 p-3 text-sm text-ink-2">{CHECKLIST[hz].map((c) => <li key={c.sign} className="flex gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />{c.label}</li>)}</ul>
        </div>
        <Field label="Task note (optional)" hint="Shown with the checklist. The request is due 24 hours after dispatch.">
          <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Check stones below the weir; count dead fish in the pool." />
        </Field>
      </div>
    </Modal>
  );
}
