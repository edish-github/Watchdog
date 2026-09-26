'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Smartphone } from 'lucide-react';
import { useSync } from '@/lib/sync';
import { useClickAway } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const LABEL = { local: 'Local only', connecting: 'Connecting…', online: 'Synced', offline: 'Offline — changes are queued' } as const;

/** Console top-bar control: open this sandbox on a phone (QR + join code) and see the sync status. Remote mode only. */
export function ShareSandbox() {
  const status = useSync((s) => s.status);
  const workspace = useSync((s) => s.workspace);
  const pending = useSync((s) => s.pending);
  const version = useSync((s) => s.version);
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false), open);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const code = workspace?.joinCode ?? '';
  const link = origin && code ? `${origin}/join/${code}` : '';

  useEffect(() => {
    if (!open || !link) return;
    let alive = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d1a17', light: '#00000000' } })
      .then((s) => { if (alive) setSvg(s); })
      .catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [open, link]);

  if (status === 'local') return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { /* insecure origin: the code and link are shown in full */ }
  };
  const dot = status === 'online' ? 'bg-[#1F9483]' : status === 'offline' ? 'bg-[#B45309]' : 'bg-ink-3';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={`Open this sandbox on a phone${code ? `, join code ${code}` : ''}. Status: ${LABEL[status]}`}
        className="btn btn-ghost btn-sm gap-2">
        <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        <span className="mono hidden text-[12px] tracking-[0.12em] lg:inline">{code || '······'}</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Open this sandbox on a phone" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(340px,calc(100vw-2rem))] animate-rise rounded-3xl border border-line bg-paper p-4 shadow-lift">
          <p className="eyebrow">Open on a phone</p>
          <p className="mt-1 text-sm text-ink-2">Scan to open the public app in this same sandbox. Reports filed there appear here within seconds.</p>
          <div className="mt-3 grid place-items-center rounded-2xl bg-sand/55 p-3">
            {svg
              ? <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
              : <div className="grid h-44 w-44 place-items-center text-center text-xs text-ink-3">{code ? 'Drawing the QR code…' : 'Connecting to the sandbox…'}</div>}
          </div>
          <p className="mt-3 text-center">
            <span className="eyebrow block">Join code</span>
            <span className="display text-[1.9rem] tracking-[0.18em] text-ink">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : '— — —'}</span>
          </p>
          {link && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <span className="mono min-w-0 flex-1 truncate text-[12px] text-ink-2">{link}</span>
              <button onClick={copy} className="btn btn-ghost btn-sm !px-2" aria-label="Copy join link">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
            </div>
          )}
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-2">
            <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
            {LABEL[status]}{status === 'online' && version !== null ? ` · version ${version}` : ''}{pending > 0 ? ` · ${pending} change${pending === 1 ? '' : 's'} waiting` : ''}
          </p>
          <p className="mt-2 text-[11px] text-ink-3">Anyone with this code can act in this sandbox. It holds synthetic data only and is deleted after 7 idle days.</p>
        </div>
      )}
    </div>
  );
}
