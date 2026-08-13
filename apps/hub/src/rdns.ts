import { reverse } from 'node:dns/promises';

const CACHE_LIMIT = 5_000;
const CONCURRENCY = 4;
const TIMEOUT_MS = 1_500;

export type ReverseResolver = (ip: string) => Promise<string[]>;
export type RdnsLookup = (ip: string) => Promise<string | undefined>;

export function createRdnsResolver(
  resolver: ReverseResolver = reverse,
  timeoutMs: number = TIMEOUT_MS,
): RdnsLookup {
  const cache = new Map<string, string | undefined>();
  const inFlight = new Map<string, Promise<string | undefined>>();
  const waiting: Array<() => void> = [];
  let active = 0;

  const acquire = async (): Promise<void> => {
    if (active < CONCURRENCY) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(() => resolve()));
  };

  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) active -= 1;
    else next();
  };

  const lookup = async (ip: string): Promise<string | undefined> => {
    await acquire();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
        timer.unref();
      });
      const names = await Promise.race([resolver(ip), timeout]);
      const first = names?.[0]?.trim().replace(/\.+$/, '').toLowerCase();
      return first || undefined;
    } catch {
      return undefined;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      release();
    }
  };

  return (ip) => {
    if (cache.has(ip)) {
      const cached = cache.get(ip);
      cache.delete(ip);
      cache.set(ip, cached);
      return Promise.resolve(cached);
    }
    const pending = inFlight.get(ip);
    if (pending !== undefined) return pending;
    const request = lookup(ip).then((result) => {
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(ip, result);
      inFlight.delete(ip);
      return result;
    });
    inFlight.set(ip, request);
    return request;
  };
}

export const resolveRdns = createRdnsResolver();
