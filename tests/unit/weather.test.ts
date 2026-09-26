import { describe, expect, it } from 'vitest';
import { SITE } from '@/lib/catalog';
import { dailyWatch } from '@/lib/engine';
import { activeWeather, browserWeather, getWeatherVersion, overlayWeather, syntheticWeather, withWeather } from '@/lib/weather';

const site = SITE['COI-03'], date = '2026-09-25';

describe('WeatherProvider scoping', () => {
  it('uses the browser provider outside any scope', () => {
    expect(activeWeather()).toBe(browserWeather);
  });
  it('matches the golden-path watch score on synthetic weather', () => {
    expect(withWeather(syntheticWeather, () => dailyWatch(site, 'H1', date).score)).toBe(69);
  });
  it('an overlay changes scores only inside its scope, with its own memo key', () => {
    const base = withWeather(syntheticWeather, () => dailyWatch(site, 'H1', date).score);
    const cool = overlayWeather('test-cool-day', { coimbra: { [date]: { tmax: 18, rain: 0 } } });
    const cooled = withWeather(cool, () => dailyWatch(site, 'H1', date).score);
    expect(cooled).toBeLessThan(base);
    expect(withWeather(syntheticWeather, () => dailyWatch(site, 'H1', date).score)).toBe(base);
    expect(withWeather(cool, getWeatherVersion)).not.toBe(withWeather(syntheticWeather, getWeatherVersion));
  });
  it('restores the previous provider when the scoped call throws', () => {
    expect(() => withWeather(syntheticWeather, () => { throw new Error('boom'); })).toThrow('boom');
    expect(activeWeather()).toBe(browserWeather);
  });
});
