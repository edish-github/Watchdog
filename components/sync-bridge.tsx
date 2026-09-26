'use client';

import { useEffect } from 'react';
import { onSyncNotice } from '@/lib/sync';
import { toast } from './toast';

/** Shows sync notices (offline, back online, change not saved, fresh sandbox) as toasts. */
export function SyncBridge() {
  useEffect(() => onSyncNotice((n) => toast(n.title, n.body, 'info')), []);
  return null;
}
