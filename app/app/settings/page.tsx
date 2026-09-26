'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Accessibility, Clock, Database, Download, Globe, Info, LogOut, Pause, Play, RotateCcw, Trash2, Upload, User } from 'lucide-react';
import type { Domain } from '@/lib/types';
import { useWD } from '@/lib/store';
import { sync } from '@/lib/sync';
import { ROLE_LABEL, useActor } from '@/lib/hooks';
import { PRESETS } from '@/lib/sim';
import { RULES } from '@/lib/engine';
import { download } from '@/lib/download';
import { fmtBytes } from '@/lib/photo';
import { cn, fmtWhen } from '@/lib/utils';
import { Avatar, Card, CardHead, KV, Modal, PageHeader, Segmented } from '@/components/ui';
import { toast } from '@/components/toast';
import { Select } from '@/components/console/kit';

const KEYS = ['watchdog-state', 'watchdog-weather', 'watchdog-outbox'];
const bytes = (k: string) => { try { return (localStorage.getItem(k) ?? '').length * 2; } catch { return 0; } };

export default function SettingsPage() {
  const d = useWD((s) => s.d);
  const prefs = useWD((s) => s.prefs);
  const running = useWD((s) => s.running);
  const speed = useWD((s) => s.speed);
  const me = useActor();
  const router = useRouter();
  const [wipe, setWipe] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { setPrefs, setRunning, setSpeed, reset, logout } = useWD.getState();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Array.from(new Set(['Europe/Lisbon', 'Europe/Brussels', 'Europe/Paris', 'Europe/Oslo', 'Europe/Rome', 'UTC', browserTz]));
  const photos = d.observations.filter((o) => o.photo).length + d.looks.filter((l) => l.response?.photo).length;

  const exportState = () => {
    const s = useWD.getState();
    download(`watchdog-state-${d.now.slice(0, 10)}.json`, JSON.stringify({ format: 'watchdog-state', version: 1, exportedAt: new Date().toISOString(), d: s.d, device: s.device, follows: s.follows, prefs: s.prefs }, null, 2));
  };
  const importState = async (f?: File) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as { format?: string; d?: Domain };
      if (j.format !== 'watchdog-state' || !j.d || !Array.isArray(j.d.observations) || !Array.isArray(j.d.watches) || typeof j.d.now !== 'string') throw new Error('Not a Watchdog state export');
      useWD.setState({ d: j.d, running: false });
      sync.importDomain(j.d);
      toast('State imported', `Replay clock at ${fmtWhen(j.d.now, prefs.consoleTz)}`);
    } catch (e) { toast('Import failed', e instanceof Error ? e.message : 'Unreadable file', 'warn'); }
    finally { if (file.current) file.current.value = ''; }
  };
  const wipeAll = () => {
    useWD.setState({ running: false });
    KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    window.location.href = '/';
  };

  return (
    <>
      <PageHeader eyebrow="System · Settings" title={<>Console <span className="text-ink-3">settings</span></>} sub="Staff session, localisation, accessibility, the demo replay clock and the data kept in this browser." />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHead title="Coordinator profile" icon={User} />
          {me && (
            <div className="flex items-center gap-4 px-5 pt-5">
              <Avatar name={me.name} size={52} status />
              <div className="min-w-0"><p className="display text-2xl leading-tight">{me.name}</p><p className="truncate text-sm text-ink-2">{me.title}</p><p className="mono truncate text-xs text-ink-3">{me.email}</p></div>
            </div>
          )}
          <KV className="mt-3" rows={[['Role', me ? ROLE_LABEL[me.role] : '—'], ['Session', 'Local demo session'], ['MFA & SSO', 'Clerk, in the backend build'], ['Decisions logged as', me?.name ?? '—']]} />
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <button className="btn btn-outline btn-sm" onClick={() => { logout(); router.push('/login'); }}><User className="h-3.5 w-3.5" />Switch account</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { logout(); router.push('/'); }}><LogOut className="h-3.5 w-3.5" />Sign out</button>
          </div>
        </Card>

        <Card className="xl:col-span-6">
          <CardHead title="Localisation" icon={Globe} />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-ink-2">Console time zone</span><Select label="Console time zone" value={prefs.consoleTz} onChange={(v) => setPrefs({ consoleTz: v })} options={zones.map((z) => ({ value: z, label: z === browserTz ? `${z} (this device)` : z }))} /></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-ink-2">Public app language</span><Segmented size="sm" label="Public app language" value={prefs.locale} onChange={(v) => setPrefs({ locale: v })} options={[{ value: 'pt', label: 'Português' }, { value: 'en', label: 'English' }]} /></div>
            <KV className="rounded-2xl border border-line" rows={[['Units', 'Metric · °C · mm · m³/s'], ['Replay now', fmtWhen(d.now, prefs.consoleTz)], ['Console language', 'English']]} />
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Accessibility" icon={Accessibility} />
          <div className="space-y-3 p-5 text-sm">
            <button className={cn('btn w-full', prefs.largeText ? 'btn-dark' : 'btn-outline')} onClick={() => setPrefs({ largeText: !prefs.largeText })} aria-pressed={prefs.largeText}>Large text {prefs.largeText ? 'on' : 'off'}</button>
            <p className="text-ink-2">Reduced motion follows your system setting. Tier colours always come with an icon and a word; charts have table fallbacks for screen readers.</p>
          </div>
        </Card>

        <Card className="xl:col-span-8">
          <CardHead title="Demo replay clock & synthetic data" icon={Clock} action={<span className="chip">{d.autopilot ? 'Autopilot' : 'Presenter mode'}</span>} />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="display text-2xl">{fmtWhen(d.now, prefs.consoleTz)}</p>
              <button className="btn btn-primary btn-sm" onClick={() => setRunning(!running)}>{running ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Play</>}</button>
              <Segmented size="sm" label="Replay speed" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[{ value: '60', label: '1 min/s' }, { value: '600', label: '10 min/s' }, { value: '3600', label: '1 h/s' }]} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => { reset(p.id); toast('Scenario re-seeded', `${p.label} — ${p.title}`, 'info'); }} className={cn('rounded-2xl border p-3 text-left transition', d.preset === p.id ? 'border-plum bg-plum-soft/50' : 'border-line hover:border-ink-3')}>
                  <p className="text-sm font-bold text-ink">{p.label}</p><p className="text-xs text-ink-2">{p.title}</p>{p.autopilot && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-plum">autopilot</p>}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3">The “Synthetic data” badge is always shown on synthetic telemetry and cannot be switched off. Re-seeding replaces actions taken since the last jump.</p>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Data in this browser" icon={Database} />
          <KV rows={[
            ['Scenario state', fmtBytes(bytes('watchdog-state'))], ['Live weather cache', fmtBytes(bytes('watchdog-weather'))], ['Outbox settings', fmtBytes(bytes('watchdog-outbox'))],
            ['Records', `${d.observations.length} reports · ${d.signals.length} signals · ${d.advisories.length} advisories · ${d.bundles.length} bundles`],
            ['Photos stored', photos], ['Audit events', d.audit.length],
          ]} />
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <button className="btn btn-outline btn-sm" onClick={exportState}><Download className="h-3.5 w-3.5" />Export state (JSON)</button>
            <input ref={file} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importState(e.target.files?.[0])} aria-label="Import state file" />
            <button className="btn btn-outline btn-sm" onClick={() => file.current?.click()}><Upload className="h-3.5 w-3.5" />Import state</button>
            <button className="btn btn-outline btn-sm" onClick={() => { reset(d.preset); toast('Scenario re-seeded', undefined, 'info'); }}><RotateCcw className="h-3.5 w-3.5" />Re-seed current scenario</button>
            <button className="btn btn-sm border border-[#EDB7C0] bg-paper text-[#A11C3A] hover:bg-[#F7DCE0]" onClick={() => setWipe(true)}><Trash2 className="h-3.5 w-3.5" />Reset everything</button>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="About this build" icon={Info} />
          <KV rows={[['Watchdog', 'v0.1.0 · frontend'], ['Rules', `v${RULES.version} · ${RULES.sha}`], ['Framework', 'Next.js 15 · React 19 · Tailwind 3'], ['Data', 'Synthetic demo · OneAquaHealth pilot sites'], ['License', 'Apache-2.0']]} />
        </Card>
      </div>

      <Modal open={wipe} onClose={() => setWipe(false)} title="Reset everything?" sub="Clears the scenario, live-weather cache, outbox settings and your session from this browser."
        footer={<><button className="btn btn-ghost" onClick={() => setWipe(false)}>Cancel</button><button className="btn bg-[#A11C3A] text-paper hover:bg-[#8a1631]" onClick={wipeAll}>Reset and reload</button></>}>
        <p className="text-sm text-ink-2">Export the state first if you want to keep this run. Nothing is stored on a server.</p>
      </Modal>
    </>
  );
}
