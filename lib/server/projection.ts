import type { Domain } from '../types';
import { ApiProblem } from './errors';
import type { Principal } from './principal';
import { stripTransient } from './repo';

/** What a caller may see. Sandboxes are private worlds, so their visitor sees everything (staff view). */
export type Audience = 'staff' | 'public' | 'volunteer';
export type Projection = Domain;

export const audienceOf = (p: Principal): Audience => (p.kind === 'sandbox' ? 'staff' : 'public');

export function project(d: Domain, p: Principal): Projection {
  const audience = audienceOf(p);
  if (audience === 'staff') return stripTransient(d);
  // B3 adds the redacted public and volunteer projections for the live workspace.
  throw new ApiProblem(403, 'forbidden', `The ${audience} projection is not available yet.`);
}
