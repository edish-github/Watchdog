import type { ComponentType } from 'react';
import { ArrowDownToLine, Bird, Bug, Cloud, CloudFog, Dog, Droplet, Fish, Fuel, Layers, Trash2, Waves, Wind } from 'lucide-react';
import type { SignCode } from '@/lib/types';

export type IconType = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;

/** The Watchdog mark: an eye above moving water, inside a ring. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round">
      <circle cx="16" cy="16" r="13.5" />
      <circle cx="16" cy="12.5" r="3.4" fill="currentColor" stroke="none" />
      <path d="M7.5 20.5c1.4-1.3 2.8-1.3 4.2 0s2.8 1.3 4.3 0 2.8-1.3 4.3 0 2.8 1.3 4.2 0" />
    </svg>
  );
}

export function Frog({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="8" cy="7.5" r="2.5" /><circle cx="16" cy="7.5" r="2.5" />
      <path d="M5.7 9.2C4 10.6 3.4 12.8 4.2 15c1.1 2.9 4.3 4.5 7.8 4.5s6.7-1.6 7.8-4.5c.8-2.2.2-4.4-1.5-5.8" /><path d="M9 14.5c1.9 1 4.1 1 6 0" />
    </svg>
  );
}

export const SIGN_ICON: Record<SignCode, IconType> = {
  dark_mats: Layers, floating_scum: Waves, blue_green: Droplet, grey_milky: CloudFog, sewage_odour: Wind, foam: Cloud,
  sanitary_litter: Trash2, oily_sheen: Fuel, low_stagnant: ArrowDownToLine, dead_fish_1: Fish, dead_fish_2_10: Fish,
  dead_fish_gt10: Fish, bird_sick: Bird, dead_amphibians: Frog, invertebrate_dieoff: Bug, dog_unwell: Dog,
};

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.37 12.62c-.03-2.73 2.23-4.04 2.33-4.1-1.27-1.86-3.25-2.11-3.95-2.14-1.68-.17-3.28.99-4.13.99-.86 0-2.17-.97-3.57-.94-1.83.03-3.52 1.07-4.46 2.71-1.91 3.3-.49 8.18 1.37 10.86.91 1.31 1.99 2.78 3.41 2.73 1.37-.06 1.89-.88 3.54-.88 1.66 0 2.12.88 3.57.85 1.47-.03 2.41-1.33 3.31-2.65 1.04-1.52 1.47-3 1.5-3.08-.03-.01-2.87-1.1-2.92-4.35zM13.66 4.6c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.39.72-3.17 1.63-.7.8-1.31 2.09-1.14 3.33 1.2.09 2.43-.61 3.19-1.52z" />
    </svg>
  );
}
export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 8.36 22.92c.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
