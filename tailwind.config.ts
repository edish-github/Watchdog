import type { Config } from 'tailwindcss';

const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.ts'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        paper: v('paper'),
        sand: v('sand'),
        line: v('line'),
        'line-strong': v('line-strong'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3') },
        plum: { DEFAULT: v('plum'), 2: v('plum-2'), soft: v('plum-soft') },
        river: v('river'),
        espresso: v('espresso'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(31,36,33,.03), 0 18px 40px -28px rgba(70,48,36,.28)',
        lift: '0 2px 0 rgba(31,36,33,.04), 0 28px 60px -30px rgba(70,48,36,.45)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        drift: { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(2%,-3%,0) scale(1.06)' } },
        ping2: { '0%': { transform: 'scale(.8)', opacity: '.7' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
        drift: 'drift 14s ease-in-out infinite',
        ping2: 'ping2 1.8s cubic-bezier(0,0,.2,1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
