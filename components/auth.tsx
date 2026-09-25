'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Info, LoaderCircle, Mail } from 'lucide-react';
import type { CityId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { counts } from '@/lib/select';
import { CITIES, CITY, PEOPLE, SITES } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { Aurora, Bloom } from './art';
import { AppleIcon, GithubIcon, GoogleIcon, LogoMark } from './icons';
import { Avatar } from './ui';
import { toast } from './toast';

const ALIASES: Record<string, string> = {
  'coordinator@watchdog': 'sofia', 'coordinator@watchdog.demo': 'sofia', 'liaison@watchdog': 'marc',
  'researcher@watchdog': 'lima', 'volunteer@watchdog': 'tiago',
};
const DEMO = ['sofia', 'pieter', 'marc', 'lima', 'tiago'];
const PROVIDERS = [{ name: 'Google', Icon: GoogleIcon }, { name: 'Apple', Icon: AppleIcon }, { name: 'GitHub', Icon: GithubIcon }];
const resolve = (raw: string) => {
  const e = raw.trim().toLowerCase();
  return ALIASES[e] ?? Object.values(PEOPLE).find((p) => p.email.toLowerCase() === e)?.id;
};

export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const d = useWD((s) => s.d);
  const session = useWD((s) => s.session);
  const hydrated = useWD((s) => s.hydrated);
  const c = useMemo(() => counts(d), [d]);
  const current = hydrated && session ? PEOPLE[session] : undefined;
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pet, setPet] = useState('');
  const [city, setCity] = useState<CityId>('coimbra');
  const q = next ? `?next=${encodeURIComponent(next)}` : '';

  const enter = (id: string) => {
    const p = PEOPLE[id];
    if (!p) return;
    setBusy(id);
    const st = useWD.getState();
    st.login(id);
    if (p.role === 'citizen_scientist') { st.setVolunteer(id); router.push('/observe/requests'); }
    else router.push(next && next.startsWith('/app') ? next : '/app/overview');
  };
  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    const id = resolve(email);
    if (!id) { setError(email.includes('@') ? 'No Watchdog staff account uses this email. Try a demo account below.' : 'Enter the work email your municipality or the OAH consortium issued.'); return; }
    enter(id);
  };
  const onSignUp = (e: FormEvent) => {
    e.preventDefault();
    const follows = SITES.filter((s) => s.cityId === city).map((s) => s.id);
    useWD.getState().setDevice({ name: name.trim() || undefined, pet: pet.trim() || undefined });
    useWD.setState({ follows });
    toast('Sentinel profile saved', `Following ${follows.length} streams in ${CITY[city].name}. Stored on this device only.`);
    router.push('/observe');
  };
  const oauth = (p: string) => setInfo(`${p} sign-in connects through Clerk once the backend keys are configured. Until then, use your Watchdog email or a demo account.`);
  const pill = (active: boolean) => cn('rounded-full px-5 py-2 transition', active ? 'bg-paper text-ink shadow-card' : 'text-ink-3 hover:text-ink');

  return (
    <main className="dot-grid min-h-screen px-4 py-5 sm:px-6 lg:py-8">
      <div className="mx-auto mb-5 flex max-w-[1180px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-ink"><LogoMark className="h-7 w-7" /><span className="display text-2xl leading-none">Watchdog</span></Link>
        <Link href="/observe" className="btn btn-ghost btn-sm">Walkers need no account<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="mx-auto grid max-w-[1180px] gap-4 lg:grid-cols-2">
        <section className="card relative flex flex-col justify-center rounded-[28px] px-6 py-10 sm:px-14 lg:min-h-[700px]">
          <span className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full border border-line bg-canvas text-ink"><LogoMark className="h-5 w-5" /></span>
          <div className="mx-auto w-full max-w-[400px]">
            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-sand/80 p-1 text-sm font-bold">
                <Link href={`/login${q}`} className={pill(mode === 'signin')} aria-current={mode === 'signin' ? 'page' : undefined}>Sign in</Link>
                <Link href={`/signup${q}`} className={pill(mode === 'signup')} aria-current={mode === 'signup' ? 'page' : undefined}>Sign up</Link>
              </div>
            </div>
            <h1 className="display mt-8 text-center text-[2.7rem] leading-tight">{mode === 'signin' ? 'Welcome back.' : 'Join the sentinels.'}</h1>
            <p className="mx-auto mt-2 max-w-xs text-center text-[15px] text-ink-2">
              {mode === 'signin' ? 'Log in to access environmental telemetry and sentinel signals.' : 'Save a name and the streams you follow. It stays on this device — no email, no password.'}
            </p>

            {mode === 'signin' ? (
              <>
                {current && (
                  <button type="button" onClick={() => enter(current.id)} className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas/70 p-3 text-left transition hover:border-ink-3">
                    <Avatar name={current.name} size={36} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">Continue as {current.short}</span><span className="block truncate text-xs text-ink-3">{current.email}</span></span>
                    <ArrowRight className="h-4 w-4 text-ink-3" />
                  </button>
                )}
                <form onSubmit={onSignIn} className="mt-6 space-y-3" noValidate>
                  <label className="block">
                    <span className="sr-only">Work email</span>
                    <span className="relative block">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
                      <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="coordinator@watchdog" className="input !rounded-full !py-3 !pl-11" aria-invalid={!!error} />
                    </span>
                  </label>
                  {error && <p role="alert" className="flex items-start gap-2 text-[13px] text-[#A11C3A]"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                  <button className="btn btn-primary btn-lg w-full" disabled={!!busy}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Continue</button>
                </form>
              </>
            ) : (
              <form onSubmit={onSignUp} className="mt-6 space-y-3">
                <input className="input !rounded-full !py-3" placeholder="Display name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Display name" />
                <input className="input !rounded-full !py-3" placeholder="Your dog’s name (optional)" value={pet} onChange={(e) => setPet(e.target.value)} maxLength={30} aria-label="Dog's name" />
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-bold text-ink">Streams to follow</legend>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {CITIES.map((cy) => (
                      <button type="button" key={cy.id} onClick={() => setCity(cy.id)} aria-pressed={city === cy.id}
                        className={cn('rounded-full border px-3 py-2 text-sm font-bold transition', city === cy.id ? 'border-plum bg-plum-soft text-plum-2' : 'border-line bg-paper text-ink-2 hover:border-ink-3')}>{cy.name}</button>
                    ))}
                  </div>
                </fieldset>
                <button className="btn btn-primary btn-lg w-full">Continue</button>
                <p className="text-center text-xs text-ink-3">Staff accounts are issued by your municipality or the OAH consortium.</p>
              </form>
            )}

            <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(({ name: n, Icon }) => (
                <button key={n} type="button" onClick={() => oauth(n)} className="flex items-center justify-center gap-2 rounded-2xl border border-line-strong/70 bg-[#F5F2EB] py-3 text-sm font-bold text-ink transition hover:border-ink-3">
                  <Icon className="h-4 w-4" /><span className="hidden sm:inline">{n}</span>
                </button>
              ))}
            </div>
            {info && <p className="mt-3 flex gap-2 rounded-2xl bg-sand/60 p-3 text-[13px] text-ink-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-plum" />{info}</p>}

            {mode === 'signin' && (
              <div className="mt-7">
                <p className="eyebrow mb-2 text-center">Demo accounts</p>
                <div className="grid gap-1">
                  {DEMO.map((id) => {
                    const p = PEOPLE[id];
                    return (
                      <button key={id} type="button" onClick={() => enter(id)} disabled={!!busy} className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-line hover:bg-canvas/70">
                        <Avatar name={p.name} size={30} />
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">{p.name}</span><span className="block truncate text-xs text-ink-3">{p.title}</span></span>
                        {busy === id ? <LoaderCircle className="h-4 w-4 animate-spin text-plum" /> : <ArrowRight className="h-4 w-4 text-ink-3 opacity-0 transition group-hover:opacity-100" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-8 text-center text-xs text-ink-3">By proceeding, you agree to our <Link href="/#responsible" className="underline hover:text-ink">Terms of Use</Link> and <Link href="/#responsible" className="underline hover:text-ink">Privacy Policy</Link>.</p>
          </div>
        </section>

        <aside className="grain relative hidden min-h-[700px] overflow-hidden rounded-[28px] border border-line bg-[#EFE9DF] lg:block">
          <Aurora palette="tide" sun className="absolute inset-0 h-full w-full" />
          <div className="absolute left-1/2 top-[7%] w-[46%] -translate-x-1/2"><Bloom className="w-full animate-drift" /></div>
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-espresso/55 to-transparent" />
          <div className="absolute left-6 top-6 z-[2] flex items-center gap-2 rounded-full border border-white/60 bg-paper/75 px-3 py-1.5 text-xs font-bold text-ink-2 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping2 rounded-full bg-[#D99A2B]" /><span className="relative h-2 w-2 rounded-full bg-[#D99A2B]" /></span>
            Live replay · {c.watches} watches · {c.activeSignals} signals
          </div>
          <div className="absolute inset-x-0 bottom-0 z-[2] p-10">
            <div className="mb-6 flex gap-3" aria-hidden>{Array.from({ length: 8 }, (_, i) => <span key={i} className="h-1 w-1 rounded-full bg-paper/60" />)}</div>
            <blockquote className="display text-[2.5rem] leading-[1.06] text-paper">“A stream can’t raise its hand.<br /><span className="text-paper/70">Keep the stream worth visiting.”</span></blockquote>
            <p className="mt-4 text-sm font-bold text-paper/80">Track 6 · Resilience Informatics</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
