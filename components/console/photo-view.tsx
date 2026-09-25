'use client';

import { useState } from 'react';
import { Maximize2, ShieldCheck } from 'lucide-react';
import type { Photo } from '@/lib/types';
import { fmtBytes } from '@/lib/photo';
import { cn } from '@/lib/utils';
import { Modal } from '../ui';

export function PhotoView({ photo, className }: { photo: Photo; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('group relative block w-full overflow-hidden rounded-2xl border border-line', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt="Reporter photo" className="max-h-72 w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-espresso/75 px-2.5 py-1 text-[11px] font-bold text-paper backdrop-blur"><Maximize2 className="h-3 w-3" />Inspect</span>
      </button>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        <span>{photo.width}×{photo.height} px</span><span>{fmtBytes(photo.bytes)} JPEG</span>
        <span className="inline-flex items-center gap-1 text-[#0F6A60]"><ShieldCheck className="h-3.5 w-3.5" />Re-encoded on the reporter’s device · no EXIF or GPS</span>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="Photo inspector" sub={`${photo.width}×${photo.height} px · ${fmtBytes(photo.bytes)}`} className="max-w-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt="Reporter photo, full size" className="w-full rounded-xl" />
      </Modal>
    </>
  );
}
