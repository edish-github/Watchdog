import type { Domain } from './types';
import { pad } from './utils';

/**
 * Erases a reporter: reports still waiting are deleted; reports already fused into a Signal lose every
 * personal field and are re-keyed to an unlinkable alias, so reporter counts in past decisions stay true.
 */
export function eraseDevice(prev: Domain, deviceId: string, petNames: string[] = []) {
  const d = structuredClone(prev);
  const alias = `erased-${Math.random().toString(16).slice(2, 6)}`;
  const pets = new Set(petNames.filter(Boolean));
  let deleted = 0, unlinked = 0;
  d.observations = d.observations.flatMap((o) => {
    if (o.deviceId !== deviceId) return [o];
    if (o.animal?.name) pets.add(o.animal.name);
    if (o.status !== 'fused') { deleted++; return []; }
    unlinked++;
    return [{ ...o, deviceId: alias, displayName: undefined, photo: undefined, note: undefined, feeling: undefined, animal: o.animal ? { ...o.animal, name: undefined } : undefined }];
  });
  for (const s of d.signals) for (const it of s.snapshot.evidence.items) if (it.deviceId === deviceId) { it.deviceId = alias; it.label = 'Erased reporter'; }
  for (const e of d.audit) if (e.actor.includes(deviceId)) e.actor = 'Erased reporter';
  for (const b of d.bundles) for (const en of b.bundle.entry) {
    const r = en.resource as { resourceType: string; name?: { text?: string }[] };
    if (r.resourceType === 'Patient' && r.name?.some((x) => x.text && pets.has(x.text))) delete r.name;
  }
  d.seq.evt += 1;
  d.audit.unshift({ id: `EV-${pad(d.seq.evt, 4)}`, at: d.now, actor: 'Reporter request', action: 'Reporter data erased', target: alias, detail: `${deleted} deleted · ${unlinked} anonymised`, kind: 'report' });
  return { d, deleted, unlinked };
}
