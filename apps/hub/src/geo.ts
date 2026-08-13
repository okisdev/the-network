import { isIP } from 'node:net';
// geoip-lite is CommonJS; a named import resolves under the vitest interop shim
// but not under real ESM at runtime.
import geoip from 'geoip-lite';

const CACHE_LIMIT = 10_000;

export interface GeoResult {
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

export type GeoLookup = (ip: string) => GeoResult | undefined;
export type GeoResolver = (ip: string) => GeoResult | string | undefined;

function isPrivateOrLoopback(ip: string): boolean {
  const normalized = ip.toLowerCase().split('%', 1)[0] ?? ip.toLowerCase();
  const version = isIP(normalized);
  if (version === 0) return true;

  if (version === 4) {
    const octets = normalized.split('.').map(Number);
    const first = octets[0];
    const second = octets[1];
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    return isPrivateOrLoopback(normalized.slice('::ffff:'.length));
  }
  const firstGroup = Number.parseInt(normalized.split(':', 1)[0] ?? '', 16);
  return (firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80;
}

const geoIpLookup: GeoLookup = (ip) => {
  const record = geoip.lookup(ip);
  if (record === null) return undefined;
  const [lat, lon] = record.ll;
  return {
    ...(record.country ? { country: record.country } : {}),
    ...(record.city ? { city: record.city } : {}),
    ...(lat === undefined ? {} : { lat }),
    ...(lon === undefined ? {} : { lon }),
  };
};

export function createGeoLookup(lookup: GeoResolver = geoIpLookup): GeoLookup {
  const cache = new Map<string, GeoResult | undefined>();
  return (ip) => {
    if (cache.has(ip)) return cache.get(ip);
    const result = isPrivateOrLoopback(ip) ? undefined : lookup(ip);
    const geo =
      result === undefined
        ? undefined
        : typeof result === 'string'
          ? result
            ? { country: result }
            : {}
        : {
            ...(result.country ? { country: result.country } : {}),
            ...(result.city ? { city: result.city } : {}),
            ...(result.lat === undefined ? {} : { lat: result.lat }),
            ...(result.lon === undefined ? {} : { lon: result.lon }),
          };
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(ip, geo);
    return geo;
  };
}

export const lookupCountry = createGeoLookup();
