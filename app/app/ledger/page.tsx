'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Download, Sprout, Trees } from 'lucide-react';
import { useWD } from '@/lib/store';
import { getWeatherVersion } from '@/lib/weather';
import { FACTOR_LABEL, SEASONS, ledgerCsv, ledgerGeoJson, rankMeasures, seasonUntil, siteLedger } from '@/lib/ledger';
import { CITY, SITES } from '@/lib/catalog';
import { download } from '@/lib/download';
import { fmtDay, localDate } from '@/lib/utils';
import { ActionList, Card, CardHead, Meter, PageHeader, SyntheticBadge } from '@/components/ui';
import { Fact } from '@/components/console/kit';

export default function LedgerPage() {
  const d = useWD((s) => s.d);
  const season = SEASONS[0];
  const until = seasonUntil(season, localDate(d.now, 'Europe/Lisbon'));
  const wv = getWeatherVersion();
  const rows = useMemo(() => SITES.map((s) => siteLedger(s, season.from, until)).sort((a, b) => b.watchDays - a.watchDays), [season, until, wv]); // eslint-disable-line react-hooks/exhaustive-deps
  const network = useMemo(() => {
    const attr: Record<string, number> = {};
    rows.forEach((r) => Object.entries(r.attr).forEach(([k, v]) => { attr[k] = (attr[k] ?? 0) + v; }));
    const total = Object.values(attr).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(attr).map(([key, v]) => ({ key, label: FACTOR_LABEL[key] ?? key, share: v / total })).sort((a, b) => b.share - a.share);
  }, [rows]);
  const top = rows[0];
  const best = useMemo(() => (top ? rankMeasures(top.site, season.from, until)[0] : undefined), [top, season, until]);
  const totalDays = rows.reduce((n, r) => n + r.watchDays, 0);
  const affected = rows.filter((r) => r.watchDays > 0).length;
  const range = `${fmtDay(`${season.from}T12:00:00Z`, 'UTC')} – ${fmtDay(`${until}T12:00:00Z`, 'UTC')}`;
  const pkg = () => JSON.stringify({
    format: 'watchdog-restoration-package', version: 1, season: season.id, until, data: 'synthetic-demo', rules: 'v1.0.0',
    sites: rows.slice(0, 5).map((r) => ({ site: r.site.id, stream: r.site.stream, city: CITY[r.site.cityId].name, watchDays: r.watchDays, drivers: r.drivers, candidates: rankMeasures(r.site, season.from, until).map((m) => ({ measure: m.measures[0].id, name: m.measures[0].name, category: m.measures[0].category, before: m.before, after: m.after })) })),
  }, null, 2);

  return (
    <>
      <PageHeader eyebrow="Learning · Season Ledger" title={<>Season <span className="text-ink-3">ledger</span></>}
        sub={`Closing the loop: early warnings into restoration. ${season.label} · ${range} (to date). Every Watch day is attributed to the habitat factors that made the site vulnerable.`}
        actions={<><SyntheticBadge /><button className="btn btn-outline" onClick={() => download(`watchdog-ledger-${season.id}.csv`, ledgerCsv(rows, season, until), 'text/csv')}><Download className="h-4 w-4" />CSV</button><button className="btn btn-outline" onClick={() => download(`watchdog-ledger-${season.id}.geojson`, ledgerGeoJson(rows, season, until), 'application/geo+json')}><Download className="h-4 w-4" />GeoJSON</button></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Watch days, all sites" value={totalDays} sub="H1 + H2, counted per hazard" />
        <Fact label="Sites affected" value={`${affected} / ${rows.length}`} sub="at least one Watch day" />
        <Fact label="Most exposed site" value={top ? top.site.id : '—'} sub={top ? `${top.watchDays} Watch days · ${top.site.stream}` : undefined} />
        <Fact label="Replay events" value={d.signals.length} sub={`signals · ${d.advisories.filter((a) => a.publishedAt).length} advisories published`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="Season hazard days by site" icon={Sprout} />
          <div className="overflow-x-auto">
            <table className="tbl min-w-[640px]">
              <thead><tr><th>Site</th><th>City</th><th>H1 days</th><th>H2 days</th><th>Peak</th><th>Top driver</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.site.id}>
                    <td><Link href={`/app/ledger/${season.id}?site=${r.site.id}`} className="mono font-bold text-ink hover:text-plum">{r.site.id}</Link><p className="text-xs text-ink-3">{r.site.stream}</p></td>
                    <td className="text-sm">{CITY[r.site.cityId].name}</td>
                    <td className="font-bold tabular-nums">{r.byHazard.H1.watchDays}</td>
                    <td className="font-bold tabular-nums">{r.byHazard.H2.watchDays}</td>
                    <td className="tabular-nums text-xs">{Math.max(r.byHazard.H1.peak, r.byHazard.H2.peak)}</td>
                    <td className="text-xs">{r.drivers[0] ? <>{r.drivers[0].label} <span className="text-ink-3">{Math.round(r.drivers[0].share * 100)}%</span></> : <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-5">
          <Card>
            <CardHead title="Primary root causes · network" icon={Trees} />
            <ul className="space-y-3 p-5">
              {network.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between text-sm"><span className="font-bold text-ink">{f.label}</span><span className="tabular-nums text-ink-2">{Math.round(f.share * 100)}%</span></div>
                  <Meter value={f.share} max={1} tone="watch" className="mt-1.5" label={f.label} />
                </li>
              ))}
              {!network.length && <li className="text-sm text-ink-3">No Watch days yet this season.</li>}
            </ul>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Share of Watch-day score attributable to each habitat factor, weighted by the rule’s vulnerability weights. Weather is the trigger; habitat is what restoration can change.</p>
          </Card>

          {top && best && top.drivers[0] && (
            <div className="grain relative overflow-hidden rounded-2xl bg-espresso p-5 text-paper">
              <p className="eyebrow relative z-[2] !text-paper/60">OneAquaHealth restoration mapping</p>
              <p className="relative z-[2] mt-2 text-[15px] leading-relaxed">At <b>{top.site.id}</b>, {top.drivers[0].label.toLowerCase()} drove {Math.round(top.drivers[0].share * 100)}% of the season’s Watch-day risk. Recommended measure: <b>{best.measures[0].name}</b> ({best.measures[0].category}) — modelled {best.before} → {best.after} Watch days.</p>
              <Link href={`/app/ledger/${season.id}?site=${top.site.id}`} className="btn btn-sm relative z-[2] mt-4 bg-paper text-ink hover:bg-canvas">Open {top.site.id} season audit</Link>
            </div>
          )}

          <Card>
            <CardHead title="Long-term planning workflows" />
            <ActionList items={[
              ...(top ? [{ key: 'audit', tier: 'resolved' as const, href: `/app/ledger/${season.id}?site=${top.site.id}`, title: `Open ${top.site.id} season audit & nature-based plan`, meta: 'Drivers · modelled impact · proposal' }] : []),
              { key: 'dss', onClick: () => download(`watchdog-oah-dss-${season.id}.json`, pkg()), title: 'Export package for the OAH Decision Support System', meta: 'Top 5 sites · drivers · ranked measures (JSON)' },
              { key: 'csv', onClick: () => download(`watchdog-ledger-${season.id}.csv`, ledgerCsv(rows, season, until), 'text/csv'), title: 'Download annual resilience CSV', meta: `${rows.length} sites · ${season.label}` },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}
