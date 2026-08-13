import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/requests-recent.json' with { type: 'json' };
import { RequestTracker } from './requests.ts';

const NOW = 1_770_000_100_000;

describe('RequestTracker', () => {
  it('first fixture poll emits 5 events with exact bytes and REJECT failed', () => {
    const tracker = new RequestTracker();
    const events = tracker.ingest(fixture, NOW);
    expect(events).toHaveLength(5);

    const byId = Object.fromEntries(events.map((e) => [e.flowId, e]));

    expect(byId['surge:101']?.bytesIn).toBe(148230);
    expect(byId['surge:101']?.bytesOut).toBe(20488);
    expect(byId['surge:101']?.state).toBe('active');
    expect(byId['surge:101']?.dst.host).toBe('claude.ai');
    expect(byId['surge:101']?.dst.ip).toBe('160.79.104.10');
    expect(byId['surge:101']?.dst.port).toBe(443);
    expect(byId['surge:101']?.dst.proto).toBe('tcp');
    expect(byId['surge:101']?.attrs?.policyChain).toEqual([
      'RULE-SET, AI.list',
      'AI Suite',
      '🇯🇵 JP',
      'Oracle-JP',
    ]);

    expect(byId['surge:102']?.bytesIn).toBe(8123);
    expect(byId['surge:102']?.bytesOut).toBe(4021);
    expect(byId['surge:102']?.state).toBe('active');

    expect(byId['surge:103']?.bytesIn).toBe(941233);
    expect(byId['surge:103']?.bytesOut).toBe(51200);
    expect(byId['surge:103']?.state).toBe('completed');
    expect(byId['surge:103']?.device.ip).toBe('127.0.0.1');
    expect(byId['surge:103']?.attrs?.process).toBe('ghostty');

    expect(byId['surge:104']?.bytesIn).toBe(220);
    expect(byId['surge:104']?.bytesOut).toBe(180);
    expect(byId['surge:104']?.dst.ip).toBe('203.0.113.88');
    expect(byId['surge:104']?.dst.host).toBeUndefined();
    expect(byId['surge:104']?.dst.proto).toBe('udp');
    expect(byId['surge:104']?.state).toBe('active');

    expect(byId['surge:105']?.bytesIn).toBe(0);
    expect(byId['surge:105']?.bytesOut).toBe(0);
    expect(byId['surge:105']?.state).toBe('failed');
    expect(byId['surge:105']?.attrs?.policy).toBe('REJECT');
  });

  it('known id growth emits only the delta', () => {
    const tracker = new RequestTracker();
    tracker.ingest(fixture, NOW);

    const grown = structuredClone(fixture);
    const req101 = grown.requests.find((r) => r.id === 101)!;
    req101.inBytes = 148230 + 500;
    req101.outBytes = 20488 + 100;

    const events = tracker.ingest(grown, NOW + 2000);
    const e101 = events.filter((e) => e.flowId === 'surge:101');
    expect(e101).toHaveLength(1);
    expect(e101[0]?.bytesIn).toBe(500);
    expect(e101[0]?.bytesOut).toBe(100);
    expect(e101[0]?.state).toBe('active');
  });

  it('re-served completed id emits nothing', () => {
    const tracker = new RequestTracker();
    tracker.ingest(fixture, NOW);

    const again = {
      requests: [fixture.requests.find((r) => r.id === 103)!],
    };
    const events = tracker.ingest(again, NOW + 1000);
    expect(events.filter((e) => e.flowId === 'surge:103')).toHaveLength(0);
  });

  it('counter reset treats smaller current as full delta', () => {
    const tracker = new RequestTracker();
    tracker.ingest(fixture, NOW);

    const reset = structuredClone(fixture);
    const req101 = reset.requests.find((r) => r.id === 101)!;
    req101.inBytes = 50;
    req101.outBytes = 20;

    const events = tracker.ingest(reset, NOW + 2000);
    const e101 = events.find((e) => e.flowId === 'surge:101');
    expect(e101?.bytesIn).toBe(50);
    expect(e101?.bytesOut).toBe(20);
  });

  it('completing id emits completed then TTL suppresses next poll', () => {
    const tracker = new RequestTracker();
    tracker.ingest(fixture, NOW);

    const completing = structuredClone(fixture);
    const req104 = completing.requests.find((r) => r.id === 104)!;
    req104.completed = true;
    req104.status = 'Completed';
    req104.inBytes = 300;
    req104.outBytes = 200;

    const events = tracker.ingest(completing, NOW + 2000);
    const e104 = events.find((e) => e.flowId === 'surge:104');
    expect(e104?.state).toBe('completed');
    expect(e104?.bytesIn).toBe(80);
    expect(e104?.bytesOut).toBe(20);

    const again = {
      requests: [completing.requests.find((r) => r.id === 104)!],
    };
    const suppressed = tracker.ingest(again, NOW + 3000);
    expect(suppressed.filter((e) => e.flowId === 'surge:104')).toHaveLength(0);
  });

  it('prefers sourceAddress and carries the client mac and name', () => {
    const tracker = new RequestTracker();
    const events = tracker.ingest(
      {
        requests: [
          {
            id: 900,
            remoteHost: 'a.example:443',
            sourceAddress: '192.168.31.122',
            localAddress: '192.168.31.2',
            remoteClientPhysicalAddress: 'AA:BB:CC:00:11:22',
            deviceName: 'Ban',
            inBytes: 10,
            outBytes: 5,
          },
        ],
      },
      1_000,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.device).toEqual({
      mac: 'AA:BB:CC:00:11:22',
      ip: '192.168.31.122',
      name: 'Ban',
    });
    expect(events[0]!.dst).toMatchObject({ host: 'a.example', port: 443 });

    const fake = tracker.ingest(
      { requests: [{ id: 901, remoteHost: 'b.example', sourceAddress: '198.18.0.1', inBytes: 1, outBytes: 1 }] },
      2_000,
    );
    expect(fake[0]!.device).toEqual({});
  });
});
