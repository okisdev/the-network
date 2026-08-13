import { describe, expect, it, vi } from 'vitest';
import { createRdnsResolver } from './rdns.ts';

describe('reverse DNS', () => {
  it('deduplicates in-flight requests and caches positive and negative results', async () => {
    const resolver = vi.fn(async (ip: string) => {
      if (ip === '8.8.8.8') return ['DNS.GOOGLE.'];
      throw new Error('No PTR record');
    });
    const lookup = createRdnsResolver(resolver);

    await expect(Promise.all([lookup('8.8.8.8'), lookup('8.8.8.8')])).resolves.toEqual([
      'dns.google',
      'dns.google',
    ]);
    await expect(lookup('8.8.8.8')).resolves.toBe('dns.google');
    await expect(lookup('1.1.1.1')).resolves.toBeUndefined();
    await expect(lookup('1.1.1.1')).resolves.toBeUndefined();
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('caches a timeout as a negative result', async () => {
    const resolver = vi.fn(() => new Promise<string[]>(() => {}));
    const lookup = createRdnsResolver(resolver, 10);

    await expect(lookup('203.0.113.1')).resolves.toBeUndefined();
    await expect(lookup('203.0.113.1')).resolves.toBeUndefined();
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('limits distinct reverse lookups to four concurrent requests', async () => {
    let active = 0;
    let maximum = 0;
    const resolver = vi.fn(async (ip: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [`ptr-${ip}.`];
    });
    const lookup = createRdnsResolver(resolver, 100);

    await Promise.all(Array.from({ length: 8 }, (_, index) => lookup(`203.0.113.${index}`)));
    expect(maximum).toBe(4);
  });
});
