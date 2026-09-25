'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { SignCode } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SIGN_ICON } from '../icons';

const FISH: SignCode[] = ['dead_fish_1', 'dead_fish_2_10', 'dead_fish_gt10'];
type Tile = SignCode | 'fish';
const PRIMARY: Tile[] = ['dark_mats', 'floating_scum', 'blue_green', 'fish', 'bird_sick', 'dog_unwell', 'sewage_odour', 'grey_milky'];
const MORE: Tile[] = ['foam', 'sanitary_litter', 'oily_sheen', 'low_stagnant', 'dead_amphibians', 'invertebrate_dieoff'];
const TILE: Record<Tile, [string, string]> = {
  dark_mats: ['Dark mats on stones', 'Tapetes escuros nas pedras'], floating_scum: ['Floating mats or scum', 'Tapetes ou espuma a flutuar'],
  blue_green: ['Blue-green water', 'Água verde-azulada'], fish: ['Dead fish', 'Peixes mortos'], bird_sick: ['Sick or dead waterbird', 'Ave aquática doente ou morta'],
  dog_unwell: ['My dog seems unwell', 'O meu cão está indisposto'], sewage_odour: ['Sewage smell', 'Cheiro a esgoto'], grey_milky: ['Grey or milky water', 'Água cinzenta ou leitosa'],
  foam: ['Persistent foam', 'Espuma persistente'], sanitary_litter: ['Wipes or sanitary litter', 'Toalhitas ou lixo sanitário'], oily_sheen: ['Oily sheen', 'Película oleosa'],
  low_stagnant: ['Very low, still water', 'Água muito baixa e parada'], dead_amphibians: ['Dead frogs or toads', 'Rãs ou sapos mortos'], invertebrate_dieoff: ['Many dead insects or snails', 'Muitos insetos ou caracóis mortos'],
  dead_fish_1: ['One dead fish', 'Um peixe morto'], dead_fish_2_10: ['2–10 dead fish', '2 a 10 peixes mortos'], dead_fish_gt10: ['More than 10 dead fish', 'Mais de 10 peixes mortos'],
};

export function SignGrid({ value, onChange }: { value: SignCode[]; onChange: (v: SignCode[]) => void }) {
  const { t, locale } = useT();
  const [more, setMore] = useState(() => value.some((v) => MORE.includes(v)));
  const fish = value.find((v) => FISH.includes(v));
  const on = (tile: Tile) => (tile === 'fish' ? !!fish : value.includes(tile));
  const toggle = (tile: Tile) => {
    if (tile === 'fish') { onChange(fish ? value.filter((v) => !FISH.includes(v)) : [...value, 'dead_fish_2_10']); return; }
    onChange(value.includes(tile) ? value.filter((v) => v !== tile) : [...value, tile]);
  };
  const tile = (x: Tile) => {
    const Icon = SIGN_ICON[x === 'fish' ? 'dead_fish_2_10' : x], sel = on(x), dog = x === 'dog_unwell';
    return (
      <button key={x} type="button" onClick={() => toggle(x)} aria-pressed={sel}
        className={cn('relative flex min-h-[4.75rem] flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left transition', dog && 'col-span-2', sel ? 'border-plum bg-plum-soft/70 shadow-card' : 'border-line bg-paper hover:border-ink-3')}>
        <span className={cn('grid h-8 w-8 place-items-center rounded-xl', sel ? 'bg-plum text-paper' : 'bg-sand text-ink-2')}><Icon className="h-4 w-4" /></span>
        <span className="text-sm font-bold leading-tight text-ink">{TILE[x][locale === 'pt' ? 1 : 0]}</span>
        {sel && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-plum text-paper"><Check className="h-3 w-3" strokeWidth={3} /></span>}
      </button>
    );
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">{PRIMARY.map(tile)}</div>
      {fish && (
        <div className="mt-2 rounded-2xl border border-line bg-paper p-3">
          <p className="text-sm font-bold text-ink">{t('howMany')}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([['dead_fish_1', 'fish1'], ['dead_fish_2_10', 'fish2'], ['dead_fish_gt10', 'fish3']] as const).map(([c, k]) => (
              <button key={c} type="button" aria-pressed={fish === c} onClick={() => onChange([...value.filter((v) => !FISH.includes(v)), c])}
                className={cn('rounded-xl border px-2 py-2 text-sm font-bold transition', fish === c ? 'border-plum bg-plum text-paper' : 'border-line text-ink-2 hover:border-ink-3')}>{t(k)}</button>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-plum">
        {more ? t('fewerSigns') : t('moreSigns')}<ChevronDown className={cn('h-4 w-4 transition', more && 'rotate-180')} />
      </button>
      {more && <div className="mt-2 grid grid-cols-2 gap-2">{MORE.map(tile)}</div>}
    </div>
  );
}
