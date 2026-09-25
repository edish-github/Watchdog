'use client';

import { useEffect, useState } from 'react';
import { Field, Modal } from '../ui';

/** Any negative decision (dismiss, discard, withdraw) requires a written rationale for the audit trail. */
export function ReasonModal({ open, onClose, title, sub, confirmLabel, presets = [], onConfirm }: {
  open: boolean; onClose: () => void; title: string; sub?: string; confirmLabel: string; presets?: string[]; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const n = reason.trim().length, ok = n >= 10;
  return (
    <Modal open={open} onClose={onClose} title={title} sub={sub}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn bg-[#A11C3A] text-paper hover:bg-[#8a1631]" disabled={!ok} onClick={() => { onConfirm(reason.trim()); onClose(); }}>{confirmLabel}</button></>}>
      {presets.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{presets.map((p) => <button type="button" key={p} className="chip transition hover:border-ink-3" onClick={() => setReason(p)}>{p}</button>)}</div>}
      <Field label="Written rationale" hint={`${n}/10 characters minimum · recorded in the audit trail with your name`}>
        <textarea className="input min-h-[110px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} autoFocus />
      </Field>
    </Modal>
  );
}
