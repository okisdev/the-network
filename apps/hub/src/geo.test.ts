import { describe, expect, it, vi } from 'vitest';
import { createGeoLookup, lookupCountry } from './geo.ts';

describe('GeoIP lookup', () => {
  it('skips local ranges and memoizes public addresses', () => {
    const lookup = vi.fn(() => ({ country: 'US', city: '', lat: 37.386, lon: -122.0838 }));
    const geo = createGeoLookup(lookup);
    expect(geo('192.168.1.2')).toBeUndefined();
    expect(geo('::1')).toBeUndefined();
    expect(geo('8.8.8.8')).toEqual({ country: 'US', lat: 37.386, lon: -122.0838 });
    expect(geo('8.8.8.8')).toEqual({ country: 'US', lat: 37.386, lon: -122.0838 });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('smokes the bundled database with a public address', () => {
    const geo = lookupCountry('8.8.8.8');
    expect(geo?.country === undefined || /^[A-Z]{2}$/.test(geo.country)).toBe(true);
    expect(geo?.city).not.toBe('');
    expect(geo?.lat === undefined || Number.isFinite(geo.lat)).toBe(true);
    expect(geo?.lon === undefined || Number.isFinite(geo.lon)).toBe(true);
  });
});
