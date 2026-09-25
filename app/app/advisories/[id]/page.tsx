'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useWD } from '@/lib/store';
import { Card, Empty } from '@/components/ui';
import { AdvisoryEditor } from '@/components/console/advisory-editor';
import { AdvisoryView } from '@/components/console/advisory-view';

export default function AdvisoryPage() {
  const { id } = useParams<{ id: string }>();
  const adv = useWD((s) => s.d.advisories.find((a) => a.id === (id ?? '').toUpperCase()));
  if (!adv) return <Card><Empty icon={ShieldAlert} title="Advisory not found" body="It may belong to another replay scenario." action={<Link href="/app/advisories" className="btn btn-primary btn-sm">Advisory center</Link>} /></Card>;
  return adv.status === 'draft' ? <AdvisoryEditor key={adv.id} adv={adv} /> : <AdvisoryView key={adv.id} adv={adv} />;
}
