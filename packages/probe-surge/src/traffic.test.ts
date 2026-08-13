import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/traffic.json' with { type: 'json' };
import { mapTraffic } from './traffic.ts';

const NOW = 1_770_000_100_000;

describe('mapTraffic', () => {
  it('sums wan excluding lo0 and emits policy metrics for connectors', () => {
    const events = mapTraffic(fixture, NOW);
    expect(events).toHaveLength(3);

    const wan = events.find((e) => e.scope === 'wan');
    expect(wan).toEqual({
      kind: 'metric',
      ts: NOW,
      scope: 'wan',
      inBps: 1_250_000,
      outBps: 88_000,
      totals: {
        inBytes: 48_123_456_789,
        outBytes: 3_123_456_789,
      },
    });

    const oracle = events.find((e) => e.scope === 'policy:Oracle-JP');
    expect(oracle).toEqual({
      kind: 'metric',
      ts: NOW,
      scope: 'policy:Oracle-JP',
      inBps: 420_000,
      outBps: 20_000,
      totals: {
        inBytes: 9_123_456_789,
        outBytes: 812_345_678,
      },
    });

    const direct = events.find((e) => e.scope === 'policy:DIRECT');
    expect(direct).toEqual({
      kind: 'metric',
      ts: NOW,
      scope: 'policy:DIRECT',
      inBps: 830_000,
      outBps: 68_000,
      totals: {
        inBytes: 30_123_456_789,
        outBytes: 2_123_456_789,
      },
    });
  });
});
