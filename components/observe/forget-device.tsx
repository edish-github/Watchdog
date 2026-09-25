'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useWD } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Modal } from '../ui';
import { toast } from '../toast';

export function ForgetDevice({ className }: { className?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const confirm = () => {
    const r = useWD.getState().forgetDevice();
    setOpen(false);
    toast(t('forgetDone'), t('forgetDoneBody', { a: r.deleted, b: r.unlinked }));
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('btn w-full border border-[#EDB7C0] bg-paper text-[#A11C3A] hover:bg-[#F7DCE0]', className)}><Trash2 className="h-4 w-4" />{t('forget')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('forget')}
        footer={<><button className="btn btn-ghost" onClick={() => setOpen(false)}>{t('cancel')}</button><button className="btn bg-[#A11C3A] text-paper hover:bg-[#8a1631]" onClick={confirm}>{t('forgetConfirm')}</button></>}>
        <p className="text-ink-2">{t('forgetBody')}</p>
      </Modal>
    </>
  );
}
