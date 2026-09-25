'use client';

import { LoaderCircle, LocateFixed } from 'lucide-react';
import type { SiteStatus } from '@/lib/select';
import { CITIES } from '@/lib/catalog';
import { fmtDistance, nearestSites, useGeo } from '@/lib/geo';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Modal } from '../ui';
import { PublicTierBadge } from './public';

export function SitePicker({ open, onClose, value, onPick, statuses }: { open: boolean; onClose: () => void; value: string; onPick: (id: string) => void; statuses: SiteStatus[] }) {
  const { t } = useT();
  const me = useGeo((s) => s.me);
  const status = useGeo((s) => s.status);
  const request = useGeo((s) => s.request);
  const near = me ? nearestSites(me) : null;
  const local = near && near[0].km < 50;
  const byId = new Map(statuses.map((s) => [s.site.id, s]));
  const groups = local
    ? [{ label: '', items: near!.slice(0, 8).map((n) => ({ st: byId.get(n.site.id)!, km: n.km })) }]
    : CITIES.map((c) => ({ label: c.name, items: statuses.filter((s) => s.site.cityId === c.id).map((st) => ({ st, km: undefined as number | undefined })) }));
  return (
    <Modal open={open} onClose={onClose} title={t('pickSite')}>
      <button type="button" onClick={() => request()} disabled={status === 'busy'} className="btn btn-outline btn-sm mb-4 w-full">
        {status === 'busy' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}{status === 'busy' ? t('locating') : t('useLocation')}
      </button>
      {near && !local && <p className="mb-3 text-xs text-ink-3">{t('farAway', { d: fmtDistance(near[0].km) })}</p>}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.label || 'near'}>
            {g.label && <p className="eyebrow mb-1.5">{g.label}</p>}
            <ul className="space-y-1.5">
              {g.items.map(({ st, km: k }, i) => (
                <li key={st.site.id}>
                  <button type="button" onClick={() => { onPick(st.site.id); onClose(); }} aria-pressed={st.site.id === value}
                    className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition', st.site.id === value ? 'border-plum bg-plum-soft/60' : 'border-line hover:border-ink-3')}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink">{st.site.stream} <span className="mono text-xs font-normal text-ink-3">{st.site.id}</span></span>
                      <span className="block truncate text-xs text-ink-2">{st.site.reach}{k !== undefined && ` · ${fmtDistance(k)}${i === 0 ? ` · ${t('nearest')}` : ''}`}</span>
                    </span>
                    <PublicTierBadge tier={st.tier} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
