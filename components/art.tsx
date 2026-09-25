'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Palette = 'dusk' | 'tide' | 'ember';
const PAL: Record<Palette, { back: string[]; mid: string[]; front: string[]; glow: string }> = {
  dusk: { back: ['#F2A7CB', '#9D86E4', '#6576DA', '#8E74D6'], mid: ['#E53A8B', '#C9588F', '#BBA64C', '#4F63CB', '#6B50C0'], front: ['#D6302C', '#F0612F', '#E4452D', '#B53459'], glow: '#FFE1CC' },
  tide: { back: ['#EBCBDA', '#C9B8E8', '#A8CCE2', '#DCC4E3'], mid: ['#8E6B97', '#6E5575', '#3F7D86', '#5C918D', '#7B5D83'], front: ['#2B4A4F', '#3E6B6E', '#5A4560', '#342D40'], glow: '#FFCF9E' },
  ember: { back: ['#F6CFB5', '#F0B1A6', '#E6A2C0', '#F2C7A1'], mid: ['#F07A45', '#E4553A', '#C9467A', '#E8844A', '#D15A56'], front: ['#9A3B4A', '#6E5575', '#B84A3A', '#5A4560'], glow: '#FFEFC4' },
};
const HILLS = {
  back: 'M0 340C180 300 300 205 470 205C610 205 690 292 810 288C930 284 1030 222 1200 238L1200 600L0 600Z',
  mid: 'M0 410C160 368 330 336 530 366C710 394 830 306 1010 322C1105 331 1165 352 1200 348L1200 600L0 600Z',
  front: 'M0 478C200 436 380 446 565 476C765 510 905 446 1200 462L1200 600L0 600Z',
  ribbon: 'M110 452C300 392 460 402 640 440C820 478 960 420 1130 406',
};

/** Layered, blurred, film-grain hills — the signature landscape. */
export function Aurora({ palette = 'dusk', sun = false, className }: { palette?: Palette; sun?: boolean; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = PAL[palette];
  const lg = (k: string, cols: string[]) => (
    <linearGradient id={`${u}${k}`} x1="0" y1="0" x2="1" y2="0.25">{cols.map((c, i) => <stop key={i} offset={i / (cols.length - 1)} stopColor={c} />)}</linearGradient>
  );
  return (
    <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" className={cn('pointer-events-none select-none', className)} aria-hidden>
      <defs>
        {lg('b', p.back)}{lg('m', p.mid)}{lg('f', p.front)}
        <radialGradient id={`${u}sun`}><stop offset="0" stopColor={p.glow} stopOpacity=".95" /><stop offset=".5" stopColor={p.glow} stopOpacity=".35" /><stop offset="1" stopColor={p.glow} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${u}fade`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".42" stopColor="#fff" stopOpacity="1" /></linearGradient>
        <mask id={`${u}mask`}><rect width="1200" height="600" fill={`url(#${u}fade)`} /></mask>
        <filter id={`${u}s1`} x="-5%" y="-25%" width="110%" height="150%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id={`${u}s2`} x="-5%" y="-35%" width="110%" height="170%"><feGaussianBlur stdDeviation="20" /></filter>
        <filter id={`${u}g`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="table" tableValues="0 0.6" /></feComponentTransfer>
        </filter>
      </defs>
      <g mask={`url(#${u}mask)`}>
        {sun && <circle cx="800" cy="250" r="210" fill={`url(#${u}sun)`} />}
        <path d={HILLS.back} fill={`url(#${u}b)`} opacity=".9" filter={`url(#${u}s2)`} />
        <path d={HILLS.mid} fill={`url(#${u}m)`} opacity=".92" filter={`url(#${u}s1)`} />
        <path d={HILLS.front} fill={`url(#${u}f)`} filter={`url(#${u}s1)`} />
        <path d={HILLS.ribbon} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" filter={`url(#${u}s1)`} />
        <rect width="1200" height="600" filter={`url(#${u}g)`} style={{ mixBlendMode: 'overlay' }} />
      </g>
    </svg>
  );
}

/** Soft-focus water lily. */
export function Bloom({ className }: { className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const petals = [-80, -50, -20, 12, 44, 76];
  return (
    <svg viewBox="0 0 300 380" className={cn('pointer-events-none select-none', className)} aria-hidden>
      <defs>
        <linearGradient id={`${u}p`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF3A1C" /><stop offset=".36" stopColor="#FF6B3B" stopOpacity=".95" /><stop offset=".7" stopColor="#A3D2EB" stopOpacity=".75" /><stop offset="1" stopColor="#D9EEF8" stopOpacity=".2" />
        </linearGradient>
        <filter id={`${u}a`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5" /></filter>
        <filter id={`${u}b`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <path d="M150 200C143 250 162 300 146 372" stroke="#8FCBA8" strokeWidth="8" fill="none" strokeLinecap="round" opacity=".75" filter={`url(#${u}b)`} />
      <g filter={`url(#${u}b)`} opacity=".55">{petals.map((a) => <ellipse key={a} cx="150" cy="104" rx="36" ry="86" transform={`rotate(${a} 150 190)`} fill={`url(#${u}p)`} />)}</g>
      <g filter={`url(#${u}a)`}>{petals.map((a, i) => <ellipse key={a} cx="150" cy="112" rx={i % 2 ? 22 : 27} ry="76" transform={`rotate(${a * 0.9} 150 190)`} fill={`url(#${u}p)`} opacity=".82" />)}</g>
      <circle cx="150" cy="184" r="15" fill="#FF3A1C" opacity=".85" filter={`url(#${u}a)`} />
    </svg>
  );
}

const PANELS = {
  heat: 'radial-gradient(34% 44% at 46% 52%, #FFC247 0%, #F58A2C 38%, rgba(245,138,44,0) 72%), radial-gradient(50% 60% at 18% 22%, #8DB06A 0%, rgba(141,176,106,0) 70%), radial-gradient(60% 70% at 88% 86%, #2F5B3A 0%, rgba(47,91,58,0) 72%), linear-gradient(135deg, #6E9658 0%, #3C6B45 55%, #274A31 100%)',
  tide: 'radial-gradient(11% 13% at 22% 70%, #F2853B 0%, rgba(242,133,59,0) 100%), radial-gradient(9% 11% at 62% 58%, #F7A04E 0%, rgba(247,160,78,0) 100%), radial-gradient(15% 17% at 48% 38%, #3E8C96 0%, rgba(62,140,150,0) 100%), radial-gradient(13% 15% at 80% 30%, #56A6A8 0%, rgba(86,166,168,0) 100%), radial-gradient(8% 10% at 36% 24%, #E86A3A 0%, rgba(232,106,58,0) 100%), linear-gradient(160deg, #10262E 0%, #16333B 60%, #0C1D23 100%)',
  plum: 'radial-gradient(40% 50% at 62% 44%, #E7A6B8 0%, rgba(231,166,184,0) 70%), radial-gradient(45% 55% at 26% 70%, #8E6A9A 0%, rgba(142,106,154,0) 72%), radial-gradient(40% 40% at 80% 82%, #F2C9A6 0%, rgba(242,201,166,0) 70%), linear-gradient(140deg, #5A4560 0%, #6E5575 45%, #3F3048 100%)',
};
export function BlurPanel({ tone, className, children }: { tone: keyof typeof PANELS; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('grain relative isolate overflow-hidden', className)}>
      <div className="absolute -inset-12 animate-drift" style={{ background: PANELS[tone], filter: 'blur(26px)' }} />
      <div className="relative z-[2] h-full">{children}</div>
    </div>
  );
}
