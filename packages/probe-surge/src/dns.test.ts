import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dns.json' with { type: 'json' };
import { DnsDeduper, mapDnsCache } from './dns.ts';

const NOW = 1_770_000_100_000;

describe('mapDnsCache', () => {
  it('maps every valid fixture entry with empty answers and rounded rtt', () => {
    const events = mapDnsCache(fixture, NOW);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({
      kind: 'dns',
      ts: NOW,
      device: {},
      qname: 'claude.ai',
      answers: ['160.79.104.10'],
      rttMs: 23,
      expiresAt: 1_786_527_600_000,
      server: 'https://223.5.5.5/dns-query',
      source: 'server',
    });
    expect(events[1]?.rttMs).toBe(8);
    expect(events[1]?.server).toBe('223.5.5.5');
    expect(events[1]?.source).toBe('server');
    expect(events[2]?.server).toBe('system');
    expect(events[2]?.source).toBe('cache');
    expect(events[3]).toMatchObject({
      qname: 'no-answers.example',
      answers: [],
      rttMs: 500,
    });
    expect(events[3]?.server).toBe('223.5.5.5');
    expect(events[3]?.source).toBeUndefined();
    expect(events[3]?.expiresAt).toBeUndefined();
  });

  it('passes server through and maps source Server/Cache', () => {
    const events = mapDnsCache(fixture, NOW);
    expect(events[0]?.server).toBe('https://223.5.5.5/dns-query');
    expect(events[0]?.source).toBe('server');
    expect(events[2]?.source).toBe('cache');
    expect(events[3]?.source).toBeUndefined();
  });

  it('skips entries without a domain and defaults missing answers to empty', () => {
    const events = mapDnsCache(
      {
        dnsCache: [
          { data: ['1.1.1.1'], timeCost: 0.1 },
          { domain: 'empty.example' },
        ],
      },
      NOW,
    );
    expect(events).toEqual([
      {
        kind: 'dns',
        ts: NOW,
        device: {},
        qname: 'empty.example',
        answers: [],
      },
    ]);
  });
});

describe('DnsDeduper', () => {
  it('suppresses identical polls for ten minutes and emits changed answers', () => {
    const deduper = new DnsDeduper();
    const events = mapDnsCache(fixture, NOW);
    expect(deduper.fresh(events, NOW)).toHaveLength(4);
    expect(deduper.fresh(events, NOW + 1_000)).toEqual([]);
    expect(
      deduper.fresh(
        [{ ...events[0]!, answers: ['160.79.104.11'] }],
        NOW + 2_000,
      ),
    ).toHaveLength(1);
    expect(deduper.fresh(events, NOW + 10 * 60 * 1_000)).toHaveLength(4);
  });
});
