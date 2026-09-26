'use client';

import { useState } from 'react';
import { ArrowUpRight, CloudSun, Database, LoaderCircle, RefreshCw, RotateCcw, Server, ShieldCheck, Waves } from 'lucide-react';
import type { CityId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useSync } from '@/lib/sync';
import { backendMode, serverApi } from '@/lib/transport';
import { fetchGlofas, fetchOpenMeteo, useLiveWeather } from '@/lib/openmeteo';
import { pingEndpoint, useOutbox } from '@/lib/outbox';
import { DEFAULT_ENDPOINT } from '@/lib/fhir';
import { CITIES, CITY } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { Card, CardHead, KV, PageHeader, SyntheticBadge } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { toast } from '@/components/toast';
import { Fact, Select } from '@/components/console/kit';

export default function SourcesPage() {
  const imports = useLiveWeather((s) => s.imports);
  const save = useLiveWeather((s) => s.save);
  const endpoint = useOutbox((s) => s.endpoint);
  const setEndpoint = useOutbox((s) => s.setEndpoint);
  const [busy, setBusy] = useState<string | null>(null);
  const [reseed, setReseed] = useState(true);
  const [errs, setErrs] = useState<Partial<Record<CityId, string>>>({});
  const [gCity, setGCity] = useState<CityId>('coimbra');
  const [glofas, setGlofas] = useState<{ city: CityId; days: { date: string; q: number }[]; ms: number; url: string } | null>(null);
  const [gErr, setGErr] = useState('');
  const [ep, setEp] = useState(endpoint);
  const [meta, setMeta] = useState<{ ms: number; fhirVersion: string; software: string } | null>(null);
  const [epErr, setEpErr] = useState('');
  const live = CITIES.filter((c) => imports[c.id]).length;
  const today = new Date().toISOString().slice(0, 10);
  const reseedNow = () => { const st = useWD.getState(); st.reset(st.d.preset); };
  const remote = backendMode() === 'remote';
  const ai = useSync((s) => s.workspace?.features);

  const pull = async (c: CityId) => { const r = remote ? await serverApi.importWeather(c) : await fetchOpenMeteo(c); save(c, r); return r; };
  const importCity = async (c: CityId) => {
    setBusy(c); setErrs((e) => ({ ...e, [c]: undefined }));
    try { const r = await pull(c); if (reseed) reseedNow(); toast(`Live weather for ${CITY[c].name}`, `${r.days} days · ${r.from} → ${r.to} · ${r.ms} ms${reseed ? ' · replay re-seeded' : ''}`); }
    catch (e) { const m = e instanceof Error ? e.message : 'Import failed'; setErrs((x) => ({ ...x, [c]: m })); toast('Open-Meteo import failed', m, 'warn'); }
    finally { setBusy(null); }
  };
  const importAll = async () => {
    setBusy('all');
    let ok = 0;
    for (const c of CITIES) { try { await pull(c.id); ok++; setErrs((x) => ({ ...x, [c.id]: undefined })); } catch (e) { setErrs((x) => ({ ...x, [c.id]: e instanceof Error ? e.message : 'Import failed' })); } }
    if (reseed && ok) reseedNow();
    setBusy(null);
    toast('Live weather import', `${ok} of ${CITIES.length} cities updated${reseed && ok ? ' · replay re-seeded' : ''}`, ok === CITIES.length ? 'success' : 'warn');
  };
  const revert = async (c: CityId) => { if (remote) { try { await serverApi.revertWeather(c); } catch (e) { toast('Could not switch back on the server', e instanceof Error ? e.message : undefined, 'warn'); return; } } save(c, null); if (reseed) reseedNow(); toast(`${CITY[c].name} is back on synthetic weather`, undefined, 'info'); };
  const loadGlofas = async () => {
    setBusy('glofas'); setGErr('');
    try { const r = await fetchGlofas(gCity); setGlofas({ city: gCity, ...r }); } catch (e) { setGErr(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(null); }
  };
  const ping = async () => {
    const url = ep.trim().replace(/\/+$/, '');
    setBusy('fhir'); setEpErr(''); setMeta(null);
    try { setMeta(await pingEndpoint(url)); setEndpoint(url); } catch (e) { setEpErr(`${e instanceof Error ? e.message : 'Request failed'} — offline, blocked by CORS, or not a FHIR base URL`); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader eyebrow="System · Data Sources" title={<>Inbound <span className="text-ink-3">feeds</span></>}
        sub="Environmental data adapters and service endpoints. Every network call on this page happens only when you press a button."
        actions={<><SyntheticBadge /><button className="btn btn-primary" disabled={!!busy} onClick={importAll}>{busy === 'all' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudSun className="h-4 w-4" />}Import live weather · all cities</button></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Weather mode" value={`${live} / ${CITIES.length} live`} sub={live ? 'Open-Meteo overrides active' : 'Synthetic, labelled on every screen'} />
        <Fact label="FHIR endpoint" value={endpoint.replace(/^https?:\/\//, '').split('/')[0]} sub={endpoint === DEFAULT_ENDPOINT ? 'Public HAPI test server' : 'Custom endpoint'} />
        <Fact label="Drafting" value={ai?.aiDrafting ? (ai.model ?? 'AI') : 'template-v1'} sub={ai?.aiDrafting ? `${ai.provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude'} · guardrail-checked` : remote ? 'Template · no AI key on the server' : 'Template · local mode'} />
        <Fact label="OAH ENORA API" value="Off" sub="Flag off until data use is confirmed" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-12">
          <CardHead title="Open-Meteo weather · per city" icon={CloudSun} sub="Daily max temperature and precipitation · past 92 days + 16-day forecast · CC BY 4.0"
            action={<label className="flex items-center gap-2 text-xs font-bold text-ink-2"><input type="checkbox" className="h-4 w-4 accent-plum" checked={reseed} onChange={(e) => setReseed(e.target.checked)} />Re-seed the replay after import</label>} />
          <div className="overflow-x-auto">
            <table className="tbl min-w-[820px]">
              <thead><tr><th>City</th><th>Mode</th><th>Coverage</th><th>Fetched</th><th>Latency</th><th /></tr></thead>
              <tbody>
                {CITIES.map((c) => {
                  const im = imports[c.id];
                  return (
                    <tr key={c.id}>
                      <td className="font-bold text-ink">{c.name}<p className="mono text-[11px] font-normal text-ink-3">{c.lat.toFixed(3)}, {c.lon.toFixed(3)}</p></td>
                      <td>{im ? <span className="chip !border-[#A9DACB] !bg-[#D6EEE7] !text-[#0F6A60]">Live Open-Meteo</span> : <span className="chip">Synthetic</span>}</td>
                      <td className="text-xs text-ink-2">{im ? `${im.from} → ${im.to} · ${im.days} days` : 'Climatology + scripted heatwave'}</td>
                      <td className="whitespace-nowrap text-xs text-ink-2">{im ? new Date(im.fetchedAt).toLocaleString('en-GB') : '—'}</td>
                      <td className="mono text-xs">{im ? `${im.ms} ms` : '—'}</td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          {im && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => revert(c.id)}><RotateCcw className="h-3.5 w-3.5" />Synthetic</button>}
                          <button className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => importCity(c.id)}>{busy === c.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{im ? 'Refresh' : 'Import live'}</button>
                        </div>
                        {errs[c.id] && <p className="mt-1 text-right text-[11px] text-[#A11C3A]">{errs[c.id]}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Live values replace the synthetic weather for the dates they cover; other dates stay synthetic. The Coimbra golden path is tuned to the synthetic heatwave — with real weather a Watch may not open, which is the honest result.</p>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="GloFAS river discharge" icon={Waves} sub="Copernicus EMS via the Open-Meteo Flood API · 5 km grid · informational"
            action={<div className="flex items-center gap-2"><Select label="City" value={gCity} onChange={setGCity} options={CITIES.map((c) => ({ value: c.id, label: c.name }))} /><button className="btn btn-outline btn-sm" disabled={!!busy} onClick={loadGlofas}>{busy === 'glofas' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Fetch</button></div>} />
          <div className="p-5">
            {gErr && <p className="text-sm text-[#A11C3A]">{gErr}</p>}
            {glofas ? (
              <>
                <p className="text-sm text-ink">{CITY[glofas.city].name}: <b>{glofas.days.filter((x) => x.date <= today).pop()?.q.toFixed(2) ?? '—'} m³/s</b> today · range {Math.min(...glofas.days.map((x) => x.q)).toFixed(2)}–{Math.max(...glofas.days.map((x) => x.q)).toFixed(2)} m³/s · {glofas.ms} ms</p>
                <Sparkline values={glofas.days.map((x) => { const lo = Math.min(...glofas.days.map((y) => y.q)), hi = Math.max(...glofas.days.map((y) => y.q)); return hi > lo ? ((x.q - lo) / (hi - lo)) * 90 + 5 : 50; })} className="mt-3 h-16 w-full text-ink" color="rgb(var(--river))" />
                <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{glofas.days[0].date}</span><span>forecast after {today}</span><span>{glofas.days[glofas.days.length - 1].date}</span></div>
                <a href={glofas.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-plum hover:underline">Raw response<ArrowUpRight className="h-3 w-3" /></a>
              </>
            ) : !gErr && <p className="text-sm text-ink-2">Fetch the modelled discharge at a pilot city’s grid cell. The engine still uses its rain-derived flow index until GloFAS is calibrated against OAH gauges — a 5 km cell is coarse for small urban streams.</p>}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="FHIR hand-off endpoint" icon={Server} />
          <div className="space-y-3 p-5">
            <label className="block"><span className="mb-1.5 block text-[13px] font-bold text-ink">FHIR R4 base URL</span><input className="input mono text-xs" value={ep} onChange={(e) => setEp(e.target.value)} spellCheck={false} /></label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={ping}>{busy === 'fhir' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}Check /metadata & save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEp(DEFAULT_ENDPOINT); setEndpoint(DEFAULT_ENDPOINT); setMeta(null); }}>Reset to HAPI sandbox</button>
            </div>
            {meta && <KV className="rounded-2xl border border-line" rows={[['Server', meta.software], ['FHIR version', meta.fhirVersion], ['Latency', `${meta.ms} ms`]]} />}
            {epErr && <p className="text-xs text-[#A11C3A]">{epErr}</p>}
            <p className="text-xs text-ink-3">The public HAPI server is open to everyone. Bundles are tagged synthetic-demo — never point real data at it.</p>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Other adapters" icon={Database} />
          <KV rows={[
            ['OneAquaHealth ENORA API (habitat & perception codes)', 'Off · awaiting written permission'],
            ['AI advisory drafting', ai?.aiDrafting ? `${ai.model} (${ai.provider}) · server-side, name-free brief, same guardrails` : 'Template (template-v1) · no AI key configured'],
            ['Public PWA reports', remote ? 'Server sandbox · synced across devices' : 'This device only (local mode)'],
            ['Maps', 'Stylised SVG · no tile provider, no tracking'],
          ]} />
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="License attribution" />
          <ul className="space-y-2 p-5 text-sm">
            {[['Weather data by Open-Meteo.com (CC BY 4.0)', 'https://open-meteo.com/'], ['GloFAS river discharge · Copernicus Emergency Management Service', 'https://www.globalfloods.eu/'], ['HAPI FHIR public test server', 'https://hapi.fhir.org/'], ['OneAquaHealth — synthetic stand-ins, never republished', 'https://www.oneaquahealth.eu/about/']].map(([l, h]) => (
              <li key={h}><a href={h} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-plum hover:underline">{l}<ArrowUpRight className="h-3 w-3" /></a></li>
            ))}
            <li className={cn('text-ink-2')}>Watchdog source code · Apache-2.0</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
