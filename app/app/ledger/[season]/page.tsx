'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CalendarDays, Download, FlaskConical, Sprout, Trees } from 'lucide-react';
import type { HazardId, Site } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { getWeatherVersion } from '@/lib/weather';
import { MEASURES, impact, rankMeasures, seasonById, seasonUntil, siteLedger, type Season } from '@/lib/ledger';
import { CITY, HAZARDS, HZ, SITE, SITES } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { download } from '@/lib/download';
import { cn, fmtDay, localDate } from '@/lib/utils';
import { Card, CardHead, Empty, KV, Meter } from '@/components/ui';
import { DetailHeader, Select } from '@/components/console/kit';

export default function SeasonPage() {
  return <Suspense fallback={null}><SeasonRoute /></Suspense>;
}

function SeasonRoute() {
  const { season: sid } = useParams<{ season: string }>();
  const params = useSearchParams();
  const season = seasonById(sid ?? '');
  const q = params.get('site')?.toUpperCase();
  if (!season) return <Card><Empty icon={Sprout} title="Unknown season" body="Only Summer 2026 is in this replay." action={<Link href="/app/ledger" className="btn btn-primary btn-sm">Season ledger</Link>} /></Card>;
  return <SeasonView season={season} initialSite={q && SITE[q] ? q : 'COI-03'} />;
}

function cell(score: number) { return score >= 70 ? '#B45309' : score >= RULES.tiers.watchOpen ? '#D99A2B' : score >= RULES.tiers.watchClose ? '#EBD9AE' : '#E5DFD4'; }

function SeasonView({ season, initialSite }: { season: Season; initialSite: string }) {
  const d = useWD((s) => s.d);
  const actor = useActorName();
  const [siteId, setSiteId] = useState(initialSite);
  const site: Site = SITE[siteId], city = CITY[site.cityId];
  const until = seasonUntil(season, localDate(d.now, 'Europe/Lisbon'));
  const wv = getWeatherVersion();
  const led = useMemo(() => siteLedger(site, season.from, until), [site, season, until, wv]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankMeasures(site, season.from, until), [site, season, until, wv]); // eslint-disable-line react-hooks/exhaustive-deps
  const combined = useMemo(() => impact(site, season.from, until, MEASURES), [site, season, until, wv]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState<string[] | null>(null);
  const picked = chosen ?? ranked.filter((r) => r.reduction > 0).slice(0, 2).map((r) => r.measures[0].id);
  const toggle = (id: string) => setChosen((c) => { const cur = c ?? picked; return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; });
  const n = led.byHazard.H1.daily.length;
  const signals = d.signals.filter((s) => s.siteId === site.id).length, advisories = d.advisories.filter((a) => a.siteId === site.id && a.publishedAt).length;
  const months = Array.from(new Set(led.byHazard.H1.daily.map((x) => x.date.slice(0, 7))));

  const proposal = () => {
    const sel = ranked.filter((r) => picked.includes(r.measures[0].id));
    const md = [
      `# Restoration measure proposal — ${site.id} ${site.stream}, ${city.name}`, '',
      `Prepared by ${actor} · ${localDate(d.now, city.tz)} · Watchdog season ledger (${season.label}, ${season.from} to ${until})`, '',
      '## Evidence',
      `- Watch days: H1 ${led.byHazard.H1.watchDays} (peak ${led.byHazard.H1.peak} on ${led.byHazard.H1.peakDate}), H2 ${led.byHazard.H2.watchDays} (peak ${led.byHazard.H2.peak})`,
      `- Drivers of Watch-day risk: ${led.drivers.map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(', ') || 'none'}`,
      `- OAH habitat answers: shade ${Math.round(site.habitat.shadeCover * 100)}%, channel modification ${Math.round(site.habitat.channelModification * 100)}%, soil sealing ${Math.round(site.habitat.soilSealing * 100)}%`,
      `- Replay events at this site: ${signals} signal(s), ${advisories} published advisory(ies)`, '',
      '## Proposed measures',
      ...sel.map((r, i) => `${i + 1}. **${r.measures[0].name}** — ${r.measures[0].category}. ${r.measures[0].change}. Modelled Watch days ${r.before} → ${r.after} (−${Math.round(r.pct * 100)}%). Co-benefits: ${r.measures[0].cobenefits}.`),
      '', '## Method and limits',
      `Deterministic Watchdog rules v${RULES.version} (${RULES.sha}). Scenarios re-run the same season with modified habitat answers; weather is identical. This is not a hydrological or water-temperature model. Demo data is synthetic. Measure categories map to the OneAquaHealth Catalogue of Measures; codes are to be confirmed with the consortium.`,
    ].join('\n');
    download(`watchdog-proposal-${site.id.toLowerCase()}-${season.id}.md`, md, 'text/markdown');
  };

  return (
    <>
      <DetailHeader back="/app/ledger" backLabel="Season Ledger" eyebrow={`${season.label} · ${fmtDay(`${season.from}T12:00:00Z`, 'UTC')} – ${fmtDay(`${until}T12:00:00Z`, 'UTC')}`}
        title={<>{site.id} <span className="text-ink-3">resilience audit</span></>} sub={`${site.stream} · ${site.reach}, ${city.name} · ${led.watchDays} Watch days this season`}
        actions={<><Select label="Site" value={siteId} onChange={(v) => { setSiteId(v); setChosen(null); }} options={SITES.map((s) => ({ value: s.id, label: `${s.id} · ${s.stream}` }))} /><button className="btn btn-primary" onClick={proposal} disabled={!picked.length}><Download className="h-4 w-4" />Measure proposal (.md)</button></>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-12">
          <CardHead title="Season calendar" icon={CalendarDays} sub="Each cell is one day · amber = Watch (≥ 50) · dark = ≥ 70 · sand = 40–49" />
          <div className="overflow-x-auto p-5">
            <svg viewBox={`0 0 ${n * 6 + 70} 64`} className="h-auto w-full min-w-[640px]" role="img" aria-label={`Daily scores for ${site.id}: H1 ${led.byHazard.H1.watchDays} Watch days, H2 ${led.byHazard.H2.watchDays}`}>
              {HZ.map((hz, row) => (
                <g key={hz}>
                  <text x="0" y={row * 22 + 12} className="fill-ink-2" style={{ fontSize: 10, fontWeight: 700 }}>{hz}</text>
                  {led.byHazard[hz].daily.map((x, i) => <rect key={x.date} x={70 + i * 6} y={row * 22} width="5" height="16" rx="1.5" fill={cell(x.score)}><title>{`${x.date} · ${hz} ${x.score}`}</title></rect>)}
                </g>
              ))}
              {months.map((m) => { const i = led.byHazard.H1.daily.findIndex((x) => x.date.startsWith(m)); return <text key={m} x={70 + i * 6} y="60" className="fill-ink-3" style={{ fontSize: 9 }}>{fmtDay(`${m}-15T12:00:00Z`, 'UTC').split(' ')[2]}</text>; })}
            </svg>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Root cause breakdown" icon={Trees} />
          <ul className="space-y-3 p-5">
            {led.drivers.map((f) => (
              <li key={f.key}><div className="flex justify-between text-sm"><span className="font-bold text-ink">{f.label}</span><span className="tabular-nums text-ink-2">{Math.round(f.share * 100)}%</span></div><Meter value={f.share} max={1} tone="watch" className="mt-1.5" label={f.label} /></li>
            ))}
            {!led.drivers.length && <li className="text-sm text-ink-3">No Watch days at this site this season.</li>}
          </ul>
          <KV className="border-t border-line" rows={[
            ['Riparian shade cover', `${Math.round(site.habitat.shadeCover * 100)}%`],
            ['Channel modification', `${Math.round(site.habitat.channelModification * 100)}%`],
            ['Soil sealing', `${Math.round(site.habitat.soilSealing * 100)}%`],
            ...HZ.map((hz): [string, string] => [`${HAZARDS[hz].name} peak`, `${led.byHazard[hz].peak} on ${fmtDay(`${led.byHazard[hz].peakDate}T12:00:00Z`, 'UTC')}`]),
          ]} />
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Simulated impact of restoration" icon={FlaskConical} sub="Same season, same weather — only the habitat answers change" />
          <div className="overflow-x-auto">
            <table className="tbl min-w-[560px]">
              <thead><tr><th>Scenario</th><th>H1 days</th><th>H2 days</th><th>Total</th><th>Change</th></tr></thead>
              <tbody>
                <tr><td className="font-bold">Today’s habitat</td><td className="tabular-nums">{led.byHazard.H1.watchDays}</td><td className="tabular-nums">{led.byHazard.H2.watchDays}</td><td className="font-bold tabular-nums">{led.watchDays}</td><td>—</td></tr>
                {ranked.map((r) => (
                  <tr key={r.measures[0].id}><td><p className="font-bold text-ink">{r.measures[0].name}</p><p className="text-xs text-ink-3">{r.measures[0].change}</p></td>
                    <td className="tabular-nums">{r.byHazard.H1.after}</td><td className="tabular-nums">{r.byHazard.H2.after}</td><td className="font-bold tabular-nums">{r.after}</td>
                    <td className={cn('text-xs font-bold', r.reduction > 0 ? 'text-[#0F6A60]' : 'text-ink-3')}>{r.reduction > 0 ? `−${r.reduction} (−${Math.round(r.pct * 100)}%)` : 'no change'}</td></tr>
                ))}
                <tr className="bg-sand/40"><td className="font-bold">All three measures</td><td className="tabular-nums">{combined.byHazard.H1.after}</td><td className="tabular-nums">{combined.byHazard.H2.after}</td><td className="font-bold tabular-nums">{combined.after}</td><td className={cn('text-xs font-bold', combined.reduction > 0 ? 'text-[#0F6A60]' : 'text-ink-3')}>{combined.reduction > 0 ? `−${combined.reduction} (−${Math.round(combined.pct * 100)}%)` : 'no change'}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Modelled with rules v{RULES.version}: a measure lowers V(s), which lowers the Watch score on every hot or wet day. It does not model water temperature or flow — a planning signal, not an engineering design.</p>
        </Card>

        <Card className="xl:col-span-12">
          <CardHead title="Recommended OneAquaHealth restoration measures" icon={Sprout} sub="Ranked by modelled Watch-day reduction · tick to include in the proposal" />
          <div className="grid gap-3 p-5 md:grid-cols-3">
            {ranked.map((r, i) => {
              const m = r.measures[0], on = picked.includes(m.id);
              return (
                <label key={m.id} className={cn('flex cursor-pointer flex-col rounded-2xl border p-4 transition', on ? 'border-plum bg-plum-soft/40' : 'border-line hover:border-ink-3')}>
                  <div className="flex items-center justify-between"><span className="mono text-xs text-ink-3">0{i + 1} · {m.id}</span><input type="checkbox" className="h-4 w-4 accent-plum" checked={on} onChange={() => toggle(m.id)} /></div>
                  <p className="mt-2 font-bold text-ink">{m.name}</p>
                  <p className="text-xs text-ink-3">{m.category}</p>
                  <p className="mt-2 text-sm text-ink-2">{m.change}. {m.cobenefits}.</p>
                  <p className={cn('mt-auto pt-3 text-sm font-bold', r.reduction > 0 ? 'text-[#0F6A60]' : 'text-ink-3')}>{r.reduction > 0 ? `−${r.reduction} Watch days (−${Math.round(r.pct * 100)}%)` : 'No modelled change here'}</p>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <button className="btn btn-primary btn-sm" onClick={proposal} disabled={!picked.length}><Download className="h-3.5 w-3.5" />Measure proposal for {city.name} planning (.md)</button>
            <button className="btn btn-outline btn-sm" onClick={() => download(`watchdog-restoration-${site.id.toLowerCase()}.json`, JSON.stringify({ site: site.id, season: season.id, until, data: 'synthetic-demo', drivers: led.drivers, measures: ranked.map((r) => ({ id: r.measures[0].id, name: r.measures[0].name, category: r.measures[0].category, before: r.before, after: r.after, selected: picked.includes(r.measures[0].id) })) }, null, 2))}><Download className="h-3.5 w-3.5" />Restoration package (JSON)</button>
          </div>
        </Card>
      </div>
    </>
  );
}
