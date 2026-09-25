'use client';

import { useRef, useState } from 'react';
import { Camera, CircleAlert, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { fmtBytes, processPhoto, type ProcessedPhoto } from '@/lib/photo';
import { useT } from '@/lib/i18n';

export function PhotoInput({ value, onChange }: { value: ProcessedPhoto | null; onChange: (p: ProcessedPhoto | null) => void }) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { onChange(await processPhoto(f)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that photo.'); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label={t('photoTake')} />
      {value ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.dataUrl} alt="" className="max-h-56 w-full object-cover" />
            <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-espresso/80 px-2.5 py-1 text-xs font-bold text-paper backdrop-blur"><X className="h-3 w-3" />{t('photoRemove')}</button>
          </div>
          <p className="flex items-start gap-2 px-3 py-2.5 text-xs text-ink-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1F9483]" />
            <span>{value.hadGps ? t('photoGps') : value.hadExif ? t('photoExif') : t('photoClean')} <span className="text-ink-3">({fmtBytes(value.originalBytes)} → {fmtBytes(value.bytes)})</span></span>
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-paper/60 px-4 py-5 text-sm font-bold text-ink-2 transition hover:border-ink-3 hover:text-ink">
          {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" />{t('photoBusy')}</> : <><Camera className="h-5 w-5" />{t('photoTake')}</>}
        </button>
      )}
      {err && <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-[#A11C3A]"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{err}</p>}
    </div>
  );
}
