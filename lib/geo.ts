import { create } from 'zustand';
import { SITES } from './catalog';
import type { Site } from './types';

export interface LatLon { lat: number; lon: number }

/** Great-circle distance in km. */
export function km(a: LatLon, b: LatLon) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const fmtDistance = (k: number) => (k < 1 ? `${Math.max(10, Math.round((k * 1000) / 10) * 10)} m` : k < 10 ? `${k.toFixed(1)} km` : `${Math.round(k).toLocaleString('en')} km`);
export const nearestSites = (p: LatLon, sites: Site[] = SITES) => sites.map((site) => ({ site, km: km(p, site) })).sort((a, b) => a.km - b.km);

type GeoStatus = 'idle' | 'busy' | 'ok' | 'denied' | 'unavailable';
/** Session-only location (never persisted, never sent). */
export const useGeo = create<{ me: LatLon | null; status: GeoStatus; request: () => Promise<LatLon | null> }>((set) => ({
  me: null,
  status: 'idle',
  request: () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { set({ status: 'unavailable' }); return Promise.resolve(null); }
    set({ status: 'busy' });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => { const me = { lat: p.coords.latitude, lon: p.coords.longitude }; set({ me, status: 'ok' }); resolve(me); },
        (e) => { set({ status: e.code === 1 ? 'denied' : 'unavailable' }); resolve(null); },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
      );
    });
  },
}));
