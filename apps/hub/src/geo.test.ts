import { describe, expect, it, vi } from 'vitest';
import { createGeoLookup, lookupCountry } from './geo.ts';

describe('GeoIP lookup', () => {
  it('skips local ranges and memoizes public addresses', () => {
    const lookup = vi.fn(() => 'US');
    const geo = createGeoLookup(lookup);
    expect(geo('192.168.1.2')).toBeUndefined();
    expect(geo('::1')).toBeUndefined();
    expect(geo('8.8.8.8')).toBe('US');
    expect(geo('8.8.8.8')).toBe('US');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('smokes the bundled database with a public address', () => {
    const country = lookupCountry('8.8.8.8');
    expect(country === undefined || /^[A-Z]{2}$/.test(country)).toBe(true);
  });
});
