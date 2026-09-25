import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BundleRecord } from './types';
import { DEFAULT_ENDPOINT } from './fhir';
import { useWD } from './store';

export const useOutbox = create<{ endpoint: string; setEndpoint: (e: string) => void }>()(
  persist((set) => ({ endpoint: DEFAULT_ENDPOINT, setEndpoint: (e) => set({ endpoint: e.trim().replace(/\/+$/, '') || DEFAULT_ENDPOINT }) }),
    { name: 'watchdog-outbox', storage: createJSONStorage(() => localStorage), skipHydration: true }),
);

export interface Receipt { http: number; ms: number; endpoint: string; entries: { status: string; location?: string }[] }
type TxResponse = { entry?: { response?: { status?: string; location?: string } }[]; issue?: { diagnostics?: string; details?: { text?: string } }[] };

export function parseReceipt(s?: string): Receipt | null {
  try { const r = s ? (JSON.parse(s) as Receipt) : null; return r && typeof r.http === 'number' ? r : null; } catch { return null; }
}

/** POSTs a validated transaction bundle to a FHIR R4 base URL and records the outcome through the reducer. */
export async function sendBundle(b: BundleRecord, endpoint: string): Promise<{ ok: boolean; message: string }> {
  const { dispatch } = useWD.getState();
  if (b.validation.errors.length) {
    dispatch({ type: 'bundle/status', id: b.id, status: 'failed', error: `Blocked locally: ${b.validation.errors.length} validation error(s)` });
    return { ok: false, message: 'The bundle has validation errors and was not sent.' };
  }
  dispatch({ type: 'bundle/status', id: b.id, status: 'sending' });
  const t0 = performance.now();
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' }, body: JSON.stringify(b.bundle) });
    const ms = Math.round(performance.now() - t0);
    const body = (await res.json().catch(() => null)) as TxResponse | null;
    if (res.ok) {
      const entries = (body?.entry ?? []).map((e) => ({ status: e.response?.status ?? '', location: e.response?.location }));
      const receipt: Receipt = { http: res.status, ms, endpoint, entries };
      dispatch({ type: 'bundle/status', id: b.id, status: 'sent', http: res.status, receipt: JSON.stringify(receipt) });
      return { ok: true, message: `HTTP ${res.status} · ${entries.length} resources created in ${ms} ms` };
    }
    const issue = body?.issue?.[0]?.diagnostics ?? body?.issue?.[0]?.details?.text ?? res.statusText;
    dispatch({ type: 'bundle/status', id: b.id, status: 'failed', http: res.status, error: `HTTP ${res.status}: ${issue}` });
    return { ok: false, message: `HTTP ${res.status}: ${issue}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    dispatch({ type: 'bundle/status', id: b.id, status: 'failed', error: `${msg} — offline, blocked by CORS, or endpoint down` });
    return { ok: false, message: msg };
  }
}

/** Reads the server's CapabilityStatement. */
export async function pingEndpoint(endpoint: string) {
  const t0 = performance.now();
  const res = await fetch(`${endpoint}/metadata?_summary=true`, { headers: { Accept: 'application/fhir+json' } });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { fhirVersion?: string; software?: { name?: string; version?: string }; implementation?: { description?: string } };
  return { ms, fhirVersion: j.fhirVersion ?? '?', software: `${j.software?.name ?? j.implementation?.description ?? 'FHIR server'}${j.software?.version ? ` ${j.software.version}` : ''}` };
}
