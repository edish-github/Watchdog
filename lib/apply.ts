import type { Domain } from './types';
import { reduce } from './sim';
import { eraseDevice } from './privacy';
import type { AnyAction } from './transport';

/** The reducer, plus the few actions that need more than the reducer. Pure; used by the browser and the server alike. */
export function applyAction(d: Domain, a: AnyAction): Domain {
  if (a.type === 'device/erase') return eraseDevice(structuredClone(d), a.deviceId, a.names).d;
  return reduce(d, a);
}
