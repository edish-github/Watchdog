'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, ClipboardCheck, Eye, Play, Radar, Send, ShieldAlert, Sprout, Thermometer, X } from 'lucide-react';
import type { TierId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { allStatuses, counts } from '@/lib/select';
import { CITIES, HAZARDS, SITE, SITES } from '@/lib/catalog';
import { forecastSeries } from '@/lib/engine';
import { fmtClock, fmtDay, pad } from '@/lib/utils';
import { Aurora, Bloom, BlurPanel } from '@/components/art';
import { LogoMark } from '@/components/icons';
import { Avatar, SyntheticBadge, TierBadge } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { MapLegend, NetworkMap, citySummary } from '@/components/network-map';

const TZ = 'Europe/Lisbon';
const MESSAGE: Record<TierId, string> = {
  quiet: 'Nothing of concern forecast or reported here today.',
  watch: 'Heat and low water forecast. Keep dogs on leads near the water — and report what you see.',
  signal: 'Walkers reported signs here. A coordinator is checking — nothing goes public until a person approves it.',
  advisory: '',
  resolved: 'Resolved after two independent “no signs” checks, 24 hours apart.',
};
const LOOP = [
  { icon: Thermometer, title: 'Forecast', text: 'Weather, river flow and each site’s OAH habitat answers open 72-hour Watch windows where shade is missing and water is slow.' },
  { icon: Eye, title: 'Look', text: 'Walkers, pets and wildlife are the sentinels. A report takes three taps and thirty seconds — no account.' },
  { icon: Radar, title: 'Review', text: 'Independent reports fuse into a Signal. The coordinator sees every input, weight and rule in the Why drawer.' },
  { icon: ShieldAlert, title: 'Advise', text: 'A bilingual precaution is drafted, edited and approved by a person. Nothing goes public automatically.' },
  { icon: Send, title: 'Hand off', text: 'The event reaches health services as an HL7 FHIR R4 bundle — with the dog as an animal patient.' },
  { icon: ClipboardCheck, title: 'Verify', text: 'Citizen scientists answer look requests. Two independent clear checks, 24 hours on, resolve it.' },
  { icon: Sprout, title: 'Learn', text: 'The season ledger ranks restoration measures from OAH’s catalogue — like riparian shading.' },
];
const PRINCIPLES = [
  { tone: 'heat' as const, tag: 'Forecast', title: 'Forecast before harm', text: 'Watch windows open from weather and river flow where shade is missing — before anyone gets sick.' },
  { tone: 'tide' as const, tag: 'Sentinels', title: 'Thirty seconds', text: 'Walkers and citizen scientists report signs in three taps. Fish, birds and dogs are the early sentinels.' },
  { tone: 'plum' as const, tag: 'Oversight', title: 'A person decides', text: 'Drafts arrive in two languages, but no warning goes public without a coordinator’s explicit approval.' },
];
const PERSONAS = [
  { name: 'Ana', role: 'Walker · Coimbra', job: 'Knows if today is a keep-the-dog-on-the-lead day, and can say when something looks wrong.', href: '/observe/sites/COI-03', cta: 'Open her stream' },
  { name: 'Tiago', role: 'Citizen scientist', job: 'Spends volunteer time where it matters most, with a four-item checklist.', href: '/observe/requests', cta: 'See look requests' },
  { name: 'Sofia Silva', role: 'Site coordinator', job: 'Decides quickly — and defensibly — whether to warn the public.', href: '/app/overview', cta: 'Open the console' },
  { name: 'Marc Durand', role: 'Health liaison', job: 'Receives structured One Health signals his systems already read.', href: '/app/fhir', cta: 'FHIR outbox' },
  { name: 'Dr Helena Lima', role: 'OAH researcher', job: 'Tests early-warning indicators against field signals, season by season.', href: '/app/ledger', cta: 'Season ledger' },
];
const EVIDENCE = [
  { value: '8', text: 'dogs died on the Loire in August 2017 after toxic mats surfaced at low water. Thirteen were poisoned.', source: 'The Local, 2017', href: 'https://www.thelocal.fr/20170823/at-least-nine-dogs-have-been-killed-in-toxic-french-rivers' },
  { value: '102k', text: 'animal illnesses in CDC’s One Health bloom reports for 2022 — usually entered after a bloom ends.', source: 'CDC OHHABS', href: 'https://www.cdc.gov/ohhabs/data/summary-report-united-states-2022.html' },
  { value: '91%', text: 'of OneAquaHealth’s monitored urban stream sites had pharmaceuticals detected.', source: 'OAH Policy Brief', href: 'https://www.oneaquahealth.eu/2026/05/06/oneaquahealth-policy-brief/' },
  { value: '104M', text: 'dogs live in Europe, in a quarter of households. Their owners visit streams every day.', source: 'FEDIAF 2022', href: 'https://europeanpetfood.org/?p=1963' },
];
const NEVER = [
  { title: 'Detect toxins or measure water quality', text: 'It flags when a professional should look.' },
  { title: 'Diagnose people or animals', text: 'Animal reports are owner observations, never diagnoses.' },
  { title: 'Collect human illness data', text: 'Walkers have no accounts; the phone gets a random ID.' },
  { title: 'Publish a warning on its own', text: 'Every public word passes a coordinator’s explicit approval.' },
  { title: 'Republish OneAquaHealth data', text: 'The public demo runs on labelled synthetic data.' },
];
const FOOTER = [
  { title: 'Product', links: [['Public stream map', '/observe'], ['Report a sighting', '/observe/sites/COI-03/report'], ['Look requests', '/observe/requests'], ['Coordinator console', '/login']] },
  { title: 'Console', links: [['Signals', '/app/signals'], ['Advisories', '/app/advisories'], ['FHIR outbox', '/app/fhir'], ['Hazard rules', '/app/rules']] },
  { title: 'OneAquaHealth', links: [['Policy brief', 'https://www.oneaquahealth.eu/2026/05/06/oneaquahealth-policy-brief/'], ['Resilience Map', 'https://www.oneaquahealth.eu/2026/05/11/oneaquahealth-resilience-map-exploring-environmental-health-through-data/'], ['Catalogue of Measures', 'https://www.oneaquahealth.eu/2026/05/12/oneaquahealth-catalogue-of-measures/'], ['FHIR guide', 'https://build.fhir.org/ig/hl7-eu/oah/']] },
  { title: 'Evidence', links: [['Toxicon 2005', 'https://research.pasteur.fr/en/b/80W'], ['AEM 2007', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2168053'], ['Toxins 2015', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4417972'], ['EEA bathing water', 'https://www.eea.europa.eu/en/analysis/publications/european-bathing-water-quality-in-2023/']] },
];

function A({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return href.startsWith('http') ? <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a> : <Link href={href} className={className}>{children}</Link>;
}

export default function Landing() {
  const d = useWD((s) => s.d);
  const session = useWD((s) => s.session);
  const statuses = useMemo(() => allStatuses(d), [d]);
  const c = useMemo(() => counts(d), [d]);
  const coi = statuses.find((s) => s.site.id === 'COI-03') ?? statuses[0];
  const spark = useMemo(() => forecastSeries(SITE['COI-03'], coi.hazard, d.now, 0, 72, 3).map((p) => p.score), [coi.hazard, d.now]);
  const consoleHref = session ? '/app/overview' : '/login';
  const message = coi.advisory?.text.en ?? MESSAGE[coi.tier];

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2 text-ink"><LogoMark className="h-7 w-7" /><span className="display text-[1.75rem] leading-none">Watchdog</span></Link>
          <nav className="hidden flex-1 justify-center gap-8 text-sm text-ink-2 md:flex" aria-label="Sections">
            {[['How it works', '#how'], ['Network', '#network'], ['Principles', '#principles'], ['Evidence', '#evidence']].map(([l, h]) => <a key={h} href={h} className="transition hover:text-ink">{l}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link href="/observe" className="btn btn-ghost btn-sm hidden sm:inline-flex">Explore streams</Link>
            <Link href={consoleHref} className="btn btn-dark btn-sm">{session ? 'Open console' : 'Coordinator console'}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1240px] px-4 pt-4 md:px-8">
          <div className="grain relative overflow-hidden rounded-[32px] border border-line bg-paper shadow-lift">
            <div className="grid gap-10 px-6 pb-8 pt-12 md:px-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-8 lg:pb-12 lg:pt-16">
              <div className="relative z-[2] animate-rise self-center">
                <span className="chip !border-transparent !bg-sand/80"><span className="h-1.5 w-1.5 rounded-full bg-plum" />Track 6 · Resilience Informatics · OneAquaHealth</span>
                <h1 className="display mt-6 text-[2.85rem] leading-[0.98] sm:text-6xl xl:text-[4.7rem]">
                  The stream’s early&#8209;warning system is <span className="italic text-ink-3">already</span> out walking.
                </h1>
                <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-2">
                  Watchdog turns the people, pets and wildlife already at urban streams into a human-reviewed One Health warning network. It forecasts when a site is vulnerable, asks people to look, and keeps a person in charge of every warning.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/observe" className="btn btn-dark btn-lg">Explore streams</Link>
                  <Link href={consoleHref} className="btn btn-soft btn-lg">Coordinator console<span className="grid h-5 w-5 place-items-center rounded-full bg-espresso text-paper"><Play className="h-2.5 w-2.5 translate-x-[1px] fill-current" /></span></Link>
                </div>
                <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
                  {[['30 s', 'to report a sighting'], ['0', 'warnings without a person'], ['R4', 'HL7 FHIR hand-off']].map(([v, l]) => (
                    <div key={l}><dt className="sr-only">{l}</dt><dd><span className="display block text-3xl leading-none">{v}</span><span className="mt-1 block text-xs text-ink-3">{l}</span></dd></div>
                  ))}
                </dl>
              </div>

              <div className="relative min-h-[470px] lg:min-h-[580px]">
                <div className="absolute inset-0 overflow-hidden rounded-[26px] bg-[#EFE9DF]">
                  <Aurora palette="tide" sun className="absolute inset-0 h-full w-full" />
                  <div className="absolute left-1/2 top-[4%] w-[56%] -translate-x-1/2"><Bloom className="w-full animate-drift opacity-95" /></div>
                </div>
                <div className="absolute inset-x-4 bottom-4 z-[2] rounded-3xl border border-white/60 bg-paper/80 p-4 shadow-lift backdrop-blur-xl sm:inset-x-6 sm:bottom-6 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow flex items-center gap-1.5"><span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping2 rounded-full bg-plum" /><span className="relative h-1.5 w-1.5 rounded-full bg-plum" /></span>Live replay · {fmtDay(d.now, TZ)} {fmtClock(d.now, TZ)}</p>
                      <p className="mt-1 truncate text-[15px] font-bold text-ink">COI-03 · Rio Mondego, Coimbra</p>
                      <p className="truncate text-xs text-ink-2">{HAZARDS[coi.hazard].long}</p>
                    </div>
                    <TierBadge tier={coi.tier} />
                  </div>
                  <div className="mt-3 flex items-end gap-4">
                    <div className="shrink-0"><p className="display text-[2.6rem] leading-none tabular-nums">{coi.score}<span className="text-lg text-ink-3">/100</span></p><p className="text-[11px] text-ink-3">watch score today</p></div>
                    <div className="min-w-0 flex-1"><Sparkline values={spark} threshold={50} className="h-12 w-full text-ink" /><p className="text-right text-[10px] text-ink-3">next 72 h · dashed = watch threshold</p></div>
                  </div>
                  <p className="mt-3 line-clamp-3 rounded-2xl bg-sand/70 px-3 py-2 text-[13px] leading-snug text-ink-2">{message}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live network */}
        <section id="network" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 pt-24 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div><p className="eyebrow">Live network</p><h2 className="display mt-2 text-4xl md:text-5xl">Five pilot cities. <span className="text-ink-3">One network.</span></h2></div>
            <p className="max-w-md text-ink-2">{SITES.length} monitored reaches across OneAquaHealth’s pilot cities. Every dot is computed live from weather, river flow and each site’s habitat answers — {c.watches} watch windows open right now.</p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <ul className="grid gap-3">
              {CITIES.map((city) => {
                const sum = citySummary(statuses, city.id);
                return (
                  <li key={city.id} className="card flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0"><p className="display text-2xl leading-none">{city.name}<span className="ml-2 font-sans text-xs font-bold text-ink-3">{city.cc}</span></p><p className="mt-1.5 truncate text-xs text-ink-2">{sum.sites.length} sites · {sum.text} · {fmtClock(d.now, city.tz)} local</p></div>
                    <TierBadge tier={sum.top} />
                  </li>
                );
              })}
            </ul>
            <div className="card flex flex-col p-2">
              <div className="dot-grid flex-1 rounded-[14px] bg-canvas/60 p-2"><NetworkMap statuses={statuses} hrefBase="/observe/sites/" /></div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"><MapLegend /><SyntheticBadge /></div>
            </div>
          </div>
        </section>

        {/* Loop */}
        <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 pt-28 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div><p className="eyebrow">How it works</p><h2 className="display mt-2 text-4xl md:text-5xl">One closed loop, <span className="text-ink-3">seven steps.</span></h2></div>
            <p className="max-w-md text-ink-2">The forecast decides where attention goes. People supply the evidence. A coordinator makes every public call — and each season teaches the next.</p>
          </div>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((s, i) => {
              const I = s.icon;
              return (
                <li key={s.title} className="card flex flex-col p-6">
                  <div className="flex items-center justify-between"><span className="mono text-xs text-ink-3">{pad(i + 1)}</span><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sand text-ink"><I className="h-[18px] w-[18px]" /></span></div>
                  <h3 className="display mt-7 text-[1.7rem] leading-none">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{s.text}</p>
                </li>
              );
            })}
            <li className="grain relative flex flex-col overflow-hidden rounded-2xl bg-espresso p-6 text-paper">
              <ShieldAlert className="h-6 w-6 text-[#E7A6B8]" />
              <h3 className="display mt-7 text-[1.7rem] leading-tight text-paper">The human gate</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-paper/75">No public advisory or FHIR bundle ever leaves Watchdog without a coordinator’s explicit approval. That is the loop’s one invariant.</p>
            </li>
          </ol>
        </section>

        {/* Principles */}
        <section id="principles" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 pt-28 md:px-8">
          <p className="eyebrow">Three principles</p>
          <h2 className="display mt-2 text-4xl md:text-5xl">Anticipate, <span className="text-ink-3">don’t react.</span></h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <article key={p.title}>
                <BlurPanel tone={p.tone} className="aspect-[4/3] rounded-[28px] shadow-card">
                  <span className="absolute right-4 top-4 rounded-lg bg-paper/90 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">{p.tag}</span>
                </BlurPanel>
                <h3 className="display mt-5 text-3xl">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Personas */}
        <section className="mx-auto max-w-[1240px] px-5 pt-28 md:px-8">
          <p className="eyebrow">Who it’s for</p>
          <h2 className="display mt-2 text-4xl md:text-5xl">Five people, <span className="text-ink-3">one loop.</span></h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PERSONAS.map((p) => (
              <Link key={p.name} href={p.href} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                <Avatar name={p.name} size={42} />
                <p className="mt-4 font-bold text-ink">{p.name}</p>
                <p className="text-xs text-ink-3">{p.role}</p>
                <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-2">{p.job}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-plum">{p.cta}<ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </section>

        {/* Evidence */}
        <section id="evidence" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 pt-28 md:px-8">
          <div className="grain relative overflow-hidden rounded-[32px] bg-espresso px-6 pb-16 pt-14 md:px-12">
            <Aurora palette="ember" className="absolute inset-x-0 bottom-0 h-[75%] w-full opacity-50" />
            <div className="relative z-[2]">
              <p className="eyebrow !text-paper/60">Evidence</p>
              <h2 className="display mt-2 max-w-3xl text-4xl text-paper md:text-5xl">Animals get sick first. <span className="text-paper/55">Nobody had been asked to look.</span></h2>
              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {EVIDENCE.map((e) => (
                  <a key={e.value} href={e.href} target="_blank" rel="noreferrer" className="group rounded-3xl border border-paper/15 bg-paper/[.06] p-5 backdrop-blur transition hover:bg-paper/[.12]">
                    <p className="display text-5xl text-paper">{e.value}</p>
                    <p className="mt-3 text-sm leading-relaxed text-paper/80">{e.text}</p>
                    <p className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-paper/55 group-hover:text-paper">{e.source}<ArrowUpRight className="h-3 w-3" /></p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Responsible */}
        <section id="responsible" className="mx-auto grid max-w-[1240px] scroll-mt-20 gap-10 px-5 pt-28 md:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="eyebrow">Responsible by design</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">What Watchdog <span className="text-ink-3">will never do.</span></h2>
            <p className="mt-4 max-w-md text-ink-2">Built so a freshwater ecologist and an ethics reviewer can both sign it off. AI drafts words; it never scores risk, decides or publishes. Every rule is deterministic, versioned and shown in full.</p>
            <div className="mt-6 flex flex-wrap gap-2">{['No walker accounts', 'Photo location stripped', 'Rules v1.0.0, open', 'WCAG 2.1 AA', 'EN · PT'].map((t) => <span key={t} className="chip">{t}</span>)}</div>
          </div>
          <ul className="card divide-y divide-line">
            {NEVER.map((n) => (
              <li key={n.title} className="flex gap-4 px-6 py-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F7DCE0] text-[#A11C3A]"><X className="h-4 w-4" /></span>
                <div><p className="font-bold text-ink">{n.title}</p><p className="text-sm text-ink-2">{n.text}</p></div>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1240px] px-4 pt-28 md:px-8">
          <BlurPanel tone="plum" className="rounded-[32px] shadow-lift">
            <div className="px-6 py-16 text-center md:px-12">
              <h2 className="display text-4xl text-paper md:text-6xl">Keep the stream <span className="italic text-paper/70">worth visiting.</span></h2>
              <p className="mx-auto mt-4 max-w-lg text-paper/80">Follow a stream, report what you see in thirty seconds, or open the console to make a decision.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/observe" className="btn btn-lg bg-paper text-ink hover:bg-canvas">Explore streams</Link>
                <Link href={consoleHref} className="btn btn-lg border border-paper/40 text-paper hover:bg-paper/10">Coordinator console<ArrowRight className="h-4 w-4" /></Link>
              </div>
            </div>
          </BlurPanel>
        </section>
      </main>

      <footer className="relative mt-28">
        <div className="relative z-[2] mx-auto max-w-[1240px] px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
            <div>
              <Link href="/" className="flex items-center gap-2 text-ink"><LogoMark className="h-8 w-8" /><span className="display text-3xl leading-none">Watchdog</span></Link>
              <p className="mt-4 max-w-sm text-[15px] text-ink-2">A human-reviewed One Health early-warning layer for urban streams — built for the OneAquaHealth IEEE Global Hackathon.</p>
              <div className="mt-6 flex gap-2"><Link href="/observe" className="btn btn-dark btn-sm">Explore streams</Link><Link href={consoleHref} className="btn btn-outline btn-sm">Console</Link></div>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {FOOTER.map((col) => (
                <div key={col.title}>
                  <p className="text-sm font-bold text-ink">{col.title}</p>
                  <ul className="mt-4 space-y-2.5">{col.links.map(([l, h]) => <li key={l}><A href={h} className="text-sm text-ink-2 transition hover:text-ink">{l}</A></li>)}</ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-ink/15 py-5 text-[13px] text-ink-2">
            <p>© 2026 Watchdog · Track 6 · Resilience Informatics</p>
            <p>Open source · Apache-2.0 · All demo data synthetic</p>
          </div>
        </div>
        <div className="relative -mt-4 h-[260px] sm:h-[360px]"><Aurora palette="dusk" className="absolute inset-0 h-full w-full" /></div>
      </footer>
    </div>
  );
}
