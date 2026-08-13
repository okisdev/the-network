import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase } from './db.ts';
import { Store } from './store.ts';

const NOW = new Date(2026, 0, 2, 12, 0, 30).getTime();

describe('Store', () => {
  let dataDir: string;
  let db: Database.Database;
  let store: Store;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-hub-store-'));
    db = openDatabase(dataDir);
    store = new Store(db, () => NOW);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('migrates idempotently', () => {
    migrate(db);
    migrate(db);
    const source = store.createSource({
      id: 'source-1',
      kind: 'surge',
      name: 'Gateway',
      enabled: true,
      settingsJson: '{}',
      createdAt: NOW,
    });
    expect(store.getSource(source.id)).toEqual(source);
  });

  it('migrates a pre-enrichment database idempotently', () => {
    const legacyDb = new Database(':memory:');
    try {
      legacyDb.exec(`
        CREATE TABLE flows (
          id TEXT PRIMARY KEY,
          source_id TEXT,
          device_id TEXT,
          ts INTEGER,
          host TEXT,
          ip TEXT,
          port INTEGER,
          proto TEXT,
          bytes_in INTEGER,
          bytes_out INTEGER,
          state TEXT,
          policy TEXT,
          policy_chain_json TEXT,
          rule TEXT,
          process TEXT,
          country TEXT,
          started_at INTEGER,
          ended_at INTEGER
        );
        CREATE TABLE dns_log (
          id TEXT PRIMARY KEY,
          ts INTEGER,
          device_id TEXT,
          qname TEXT,
          answers_json TEXT,
          rtt_ms REAL
        );
      `);

      migrate(legacyDb);
      migrate(legacyDb);

      const flowColumns = new Map(
        (legacyDb.prepare('PRAGMA table_info(flows)').all() as Array<{ name: string; type: string }>).map(
          (column) => [column.name, column.type],
        ),
      );
      expect(Object.fromEntries(flowColumns)).toMatchObject({
        policy_group: 'TEXT',
        process_path: 'TEXT',
        proxied: 'INTEGER',
        connect_ms: 'INTEGER',
        city: 'TEXT',
        lat: 'REAL',
        lon: 'REAL',
      });
      expect(
        (legacyDb.prepare('PRAGMA table_info(dns_log)').all() as Array<{ name: string }>).map(
          (column) => column.name,
        ),
      ).toEqual(expect.arrayContaining(['server', 'source']));
      expect(
        legacyDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'presence_log_open_idx'")
          .pluck()
          .get(),
      ).toBe('presence_log_open_idx');
    } finally {
      legacyDb.close();
    }
  });

  it('writes flows with matching minute and hour rollups', () => {
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      mac: '00:11:22:33:44:55',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });
    store.writeFlush({
      flows: [
        {
          id: 'flow-1',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW,
          host: 'api.service.example.co.uk',
          bytesIn: 120,
          bytesOut: 30,
          state: 'active',
          policy: 'Proxy',
          policyGroup: 'Proxy Group',
          processPath: '/Applications/Browser.app/Browser',
          proxied: true,
          connectMs: 42,
          country: 'US',
          city: 'Mountain View',
          lat: 37.386,
          lon: -122.0838,
        },
      ],
    });

    expect(store.listFlows().flows[0]).toMatchObject({
      id: 'flow-1',
      bytesIn: 120,
      bytesOut: 30,
      policyGroup: 'Proxy Group',
      processPath: '/Applications/Browser.app/Browser',
      proxied: true,
      connectMs: 42,
      city: 'Mountain View',
    });
    expect(db.prepare('SELECT lat, lon FROM flows WHERE id = ?').get('flow-1')).toEqual({
      lat: 37.386,
      lon: -122.0838,
    });
    expect(store.timeseries('wan', 1, NOW)).toEqual([
      { ts: Math.floor(NOW / 60_000) * 60_000, in: 0, out: 0 },
    ]);
    expect(store.timeseries('device:device-1', 1, NOW)).toEqual([
      { ts: Math.floor(NOW / 60_000) * 60_000, in: 120 / 60, out: 30 / 60 },
    ]);
    const hourly = store.timeseries('device:device-1', 2_881, NOW);
    expect(hourly.reduce((sum, point) => sum + point.in, 0)).toBeCloseTo(120 / 3_600, 6);
    expect(hourly.reduce((sum, point) => sum + point.out, 0)).toBeCloseTo(30 / 3_600, 6);
    expect(store.getOverview(NOW)).toMatchObject({
      topDestinations: [{ host: 'example.co.uk', bytes: 150 }],
      policySplit: [{ policy: 'Proxy', bytes: 150 }],
    });
  });

  it('paginates newest first without gaps at equal timestamps', () => {
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });
    store.writeFlush({
      flows: [
        {
          id: 'flow-a',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 2_000,
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'flow-b',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 1_000,
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'flow-c',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 1_000,
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'flow-d',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW,
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
      ],
    });

    const first = store.listFlows({ limit: 2 });
    expect(first.flows.map((flow) => flow.id)).toEqual(['flow-d', 'flow-c']);
    expect(first.nextCursor).toBeTypeOf('string');
    const second = store.listFlows({ limit: 2, cursor: first.nextCursor });
    expect(second.flows.map((flow) => flow.id)).toEqual(['flow-b', 'flow-a']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('filters flows by protocol, port, process, inclusive bounds, and a filtered cursor', () => {
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      firstSeenAt: NOW - 60_000,
      lastSeenAt: NOW,
    });
    store.writeFlush({
      flows: [
        {
          id: 'tcp-new',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 10_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'udp-new',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 15_000,
          port: 53,
          proto: 'udp',
          process: 'Resolver',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'tcp-middle',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 20_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'other-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 25_000,
          port: 443,
          proto: 'other',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'tcp-old',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 30_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
      ],
    });

    expect(store.listFlows({ proto: 'udp' }).flows.map((flow) => flow.id)).toEqual(['udp-new']);
    expect(store.listFlows({ port: 53 }).flows.map((flow) => flow.id)).toEqual(['udp-new']);
    expect(store.listFlows({ process: 'Resolver' }).flows.map((flow) => flow.id)).toEqual(['udp-new']);
    expect(store.listFlows({ from: NOW - 20_000 }).flows.map((flow) => flow.id)).toEqual([
      'tcp-new',
      'udp-new',
      'tcp-middle',
    ]);
    expect(store.listFlows({ to: NOW - 25_000 }).flows.map((flow) => flow.id)).toEqual([
      'other-flow',
      'tcp-old',
    ]);

    const query = {
      proto: 'tcp' as const,
      port: 443,
      process: 'Browser',
      from: NOW - 30_000,
      to: NOW - 10_000,
      limit: 2,
    };
    const first = store.listFlows(query);
    expect(first.flows.map((flow) => flow.id)).toEqual(['tcp-new', 'tcp-middle']);
    expect(first.nextCursor).toBeTypeOf('string');
    const second = store.listFlows({ ...query, cursor: first.nextCursor });
    expect(second.flows.map((flow) => flow.id)).toEqual(['tcp-old']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('roundtrips DNS resolver fields', () => {
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });
    const entry = store.appendDnsLog({
      id: 'dns-1',
      ts: NOW,
      deviceId: 'device-1',
      qname: 'example.com',
      answers: ['93.184.216.34'],
      rttMs: 12,
      server: '1.1.1.1',
      source: 'server',
    });

    expect(entry).toMatchObject({ server: '1.1.1.1', source: 'server', deviceName: 'Laptop' });
    expect(store.listDnsLog().entries).toEqual([entry]);
  });

  it('summarizes DNS buckets, answers, response times, and resolvers within retention', () => {
    const entries = [
      { id: 'dns-1', ts: NOW - 1_000, qname: 'alpha.example', answers: ['1.1.1.1'], rttMs: 5, server: '1.1.1.1' },
      { id: 'dns-2', ts: NOW - 10_000, qname: 'alpha.example', answers: [], rttMs: 10, server: '1.1.1.1' },
      { id: 'dns-3', ts: NOW - 61_000, qname: 'beta.example', answers: ['2.2.2.2'], rttMs: 50, server: '1.1.1.1' },
      { id: 'dns-4', ts: NOW - 121_000, qname: 'beta.example', answers: [], rttMs: 100, server: '8.8.8.8' },
      { id: 'dns-5', ts: NOW - 181_000, qname: 'gamma.example', answers: [], rttMs: 300, server: '8.8.8.8' },
      { id: 'dns-6', ts: NOW - 241_000, qname: 'gamma.example', answers: [], server: '' },
    ];
    for (const entry of entries) store.appendDnsLog(entry);

    const summary = store.dnsSummary(5, NOW);
    expect(summary.series).toHaveLength(5);
    expect(summary.series.reduce((total, point) => total + point.count, 0)).toBe(6);
    expect(summary.topDomains).toEqual([
      { qname: 'alpha.example', count: 2 },
      { qname: 'beta.example', count: 2 },
      { qname: 'gamma.example', count: 2 },
    ]);
    expect(summary.rttBuckets).toEqual([
      { label: '<10ms', count: 1 },
      { label: '10-50ms', count: 1 },
      { label: '50-100ms', count: 1 },
      { label: '100-300ms', count: 1 },
      { label: '300ms+', count: 1 },
    ]);
    expect(summary).toMatchObject({
      answered: 2,
      unanswered: 4,
      resolvers: [
        { server: '1.1.1.1', count: 3 },
        { server: '8.8.8.8', count: 2 },
      ],
    });
    const retained = store.dnsSummary(525_600, NOW).series;
    expect(retained).toHaveLength(168);
    expect(retained[1]!.ts - retained[0]!.ts).toBe(3_600_000);
  });

  it('opens, closes, lists, and repairs presence intervals', () => {
    store.upsertDevice({
      id: 'stale-device',
      name: 'Stale device',
      firstSeenAt: NOW - 300_000,
      lastSeenAt: NOW - 130_000,
    });
    store.upsertDevice({
      id: 'online-device',
      name: 'Online device',
      firstSeenAt: NOW - 20_000,
      lastSeenAt: NOW,
    });

    store.openPresence('stale-device', NOW - 200_000);
    store.openPresence('stale-device', NOW - 190_000);
    store.openPresence('online-device', NOW - 10_000);
    store.openPresence('online-device', NOW - 9_000);
    store.closePresence('online-device', NOW - 5_000);
    store.openPresence('online-device', NOW);
    store.closeStalePresence(NOW);

    expect(store.listPresence('stale-device', NOW - 250_000, NOW)).toEqual([
      { start: NOW - 200_000, end: NOW - 130_000 },
    ]);
    expect(store.listPresence('online-device', NOW - 7_500, NOW + 1)).toEqual([
      { start: NOW - 10_000, end: NOW - 5_000 },
      { start: NOW },
    ]);
  });

  it('builds ranked multi-series and retained flow breakdowns', () => {
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
      ['device-3', 'Tablet'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: NOW - 1_000, lastSeenAt: NOW });
    }
    store.writeFlush({
      flows: [
        {
          id: 'flow-1',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 30_000,
          host: 'api.example.com',
          port: 443,
          proto: 'tcp',
          bytesIn: 600,
          bytesOut: 0,
          state: 'completed',
          policy: 'Proxy',
          process: 'Browser',
          country: 'US',
        },
        {
          id: 'flow-2',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: NOW - 90_000,
          host: 'cdn.example.com',
          port: 443,
          proto: 'tcp',
          bytesIn: 300,
          bytesOut: 0,
          state: 'completed',
          process: '',
        },
        {
          id: 'flow-3',
          sourceId: 'source-1',
          deviceId: 'device-3',
          ts: NOW - 30_000,
          host: 'service.other.net',
          port: 53,
          proto: 'udp',
          bytesIn: 120,
          bytesOut: 0,
          state: 'completed',
          policy: 'Direct',
          country: 'CA',
        },
      ],
    });

    const series = store.multiTimeseries('device', 3, 2, NOW);
    expect(series.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'device-1', label: 'Laptop' },
      { key: 'device-2', label: 'Phone' },
      { key: 'other', label: 'Other' },
    ]);
    expect(series.every((item) => item.points.length === 3)).toBe(true);
    expect(series[0]!.points.map((point) => point.in)).toEqual([0, 0, 10]);
    expect(series[2]!.points.at(-1)).toMatchObject({ in: 2, out: 0 });
    expect(store.multiTimeseries('policy', 3, 1, NOW).map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'Proxy', label: 'Proxy' },
      { key: 'other', label: 'Other' },
    ]);

    const domains = store.breakdown('domain', 60, undefined, 12, NOW);
    expect(domains.window).toEqual({ from: NOW - 3_600_000, to: NOW, clamped: false });
    expect(domains.rows).toEqual([
      { key: 'example.com', bytesIn: 900, bytesOut: 0, flows: 2, devices: 2 },
      { key: 'other.net', bytesIn: 120, bytesOut: 0, flows: 1, devices: 1 },
    ]);
    expect(store.breakdown('process', 60, undefined, 12, NOW).rows).toEqual([
      { key: 'Browser', bytesIn: 600, bytesOut: 0, flows: 1, devices: 1 },
    ]);
    expect(store.breakdown('policy', 60, undefined, 12, NOW).rows).toContainEqual({
      key: 'unknown',
      label: 'Unknown',
      bytesIn: 300,
      bytesOut: 0,
      flows: 1,
      devices: 1,
    });
    expect(store.breakdown('host', 525_600, undefined, 12, NOW).window).toEqual({
      from: NOW - 14 * 86_400_000,
      to: NOW,
      clamped: true,
    });
  });

  it('builds device rollup details and excludes null policies', () => {
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      firstSeenAt: NOW - 60_000,
      lastSeenAt: NOW,
    });
    store.writeFlush({
      flows: [
        {
          id: 'detail-flow-1',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 10_000,
          host: 'api.example.com',
          port: 443,
          process: 'Browser',
          bytesIn: 100,
          bytesOut: 50,
          state: 'completed',
          policy: 'Proxy',
          country: 'US',
        },
        {
          id: 'detail-flow-2',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 20_000,
          host: 'other.example.net',
          port: 53,
          process: 'Resolver',
          bytesIn: 20,
          bytesOut: 5,
          state: 'completed',
          country: 'CA',
        },
      ],
      rollups: [
        { ts: NOW, scope: 'device_host', key: 'device-1|rollup.example', bytesIn: 900, bytesOut: 100, flows: 4 },
        { ts: NOW, scope: 'device_country', key: 'device-1|SG', bytesIn: 700, bytesOut: 100, flows: 3 },
      ],
    });

    expect(store.deviceRollupBreakdown('device-1', 'host', 5, 10, NOW)).toEqual([
      { key: 'rollup.example', bytesIn: 900, bytesOut: 100, flows: 4 },
      { key: 'example.com', bytesIn: 100, bytesOut: 50, flows: 1 },
      { key: 'example.net', bytesIn: 20, bytesOut: 5, flows: 1 },
    ]);
    expect(store.deviceRollupBreakdown('device-1', 'country', 5, 8, NOW)).toEqual([
      { key: 'SG', bytesIn: 700, bytesOut: 100, flows: 3 },
      { key: 'US', bytesIn: 100, bytesOut: 50, flows: 1 },
      { key: 'CA', bytesIn: 20, bytesOut: 5, flows: 1 },
    ]);
    expect(store.devicePolicySplit('device-1', 5, 6, NOW)).toEqual([
      { policy: 'Proxy', bytes: 150 },
    ]);
  });

  it('aggregates cities and host details with exact subdomain boundaries', () => {
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: NOW - 60_000, lastSeenAt: NOW });
    }
    store.writeFlush({
      flows: [
        {
          id: 'host-exact',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 20_000,
          host: 'example.com',
          port: 443,
          process: 'Browser',
          bytesIn: 80,
          bytesOut: 20,
          state: 'completed',
          country: 'US',
          city: 'Singapore',
          lat: 1,
          lon: 103,
        },
        {
          id: 'host-subdomain',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: NOW - 10_000,
          host: 'x.example.com',
          port: 8443,
          process: 'Agent',
          bytesIn: 280,
          bytesOut: 20,
          state: 'completed',
          country: 'CA',
          city: 'Toronto',
          lat: 43.65,
          lon: -79.38,
        },
        {
          id: 'host-boundary',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 5_000,
          host: 'notexample.com',
          port: 443,
          process: 'Browser',
          bytesIn: 1_000,
          bytesOut: 0,
          state: 'completed',
          country: 'GB',
          city: 'London',
          lat: 51.5,
          lon: -0.1,
        },
        {
          id: 'missing-geo',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW,
          bytesIn: 500,
          bytesOut: 0,
          state: 'completed',
          city: 'Nowhere',
          country: 'ZZ',
        },
        {
          id: 'missing-country',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW,
          bytesIn: 500,
          bytesOut: 0,
          state: 'completed',
          city: 'Unknown',
          lat: 1,
          lon: 2,
        },
      ],
    });

    expect(store.listCities(5, NOW)).toEqual([
      { city: 'London', country: 'GB', lat: 51.5, lon: -0.1, bytes: 1_000, flows: 1 },
      { city: 'Toronto', country: 'CA', lat: 43.65, lon: -79.38, bytes: 300, flows: 1 },
      { city: 'Singapore', country: 'US', lat: 1, lon: 103, bytes: 100, flows: 1 },
    ]);
    const detail = store.hostDetail('example.com', 5, NOW);
    expect(detail.country).toBe('CA');
    expect(detail.devices).toEqual([
      { key: 'device-2', label: 'Phone', bytesIn: 280, bytesOut: 20, flows: 1, devices: 1 },
      { key: 'device-1', label: 'Laptop', bytesIn: 80, bytesOut: 20, flows: 1, devices: 1 },
    ]);
    expect(detail.processes.map((row) => row.key)).toEqual(['Agent', 'Browser']);
    expect(detail.ports.map((row) => row.key)).toEqual(['8443', '443']);
    expect(detail.recentFlows.map((flow) => flow.id)).toEqual(['host-subdomain', 'host-exact']);
    expect(detail.series.reduce((total, point) => total + (point.in + point.out) * 60, 0)).toBeCloseTo(400);
  });

  it('merges sankey overflow per tier and emits valid positive links', () => {
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
      ['device-3', 'Tablet'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: NOW, lastSeenAt: NOW });
    }
    store.writeFlush({
      flows: [
        {
          id: 'flow-1',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW,
          bytesIn: 100,
          bytesOut: 0,
          state: 'completed',
          policy: 'Proxy',
          country: 'US',
        },
        {
          id: 'flow-2',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: NOW,
          bytesIn: 60,
          bytesOut: 0,
          state: 'completed',
          policy: 'Direct',
          country: 'CA',
        },
        {
          id: 'flow-3',
          sourceId: 'source-1',
          deviceId: 'device-3',
          ts: NOW,
          bytesIn: 40,
          bytesOut: 0,
          state: 'completed',
        },
        {
          id: 'flow-zero',
          sourceId: 'source-1',
          deviceId: 'device-3',
          ts: NOW,
          bytesIn: 0,
          bytesOut: 0,
          state: 'completed',
          policy: 'Zero',
          country: 'ZZ',
        },
      ],
    });

    const result = store.sankey(60, 1, NOW);
    expect(result.nodes.map((node) => node.kind)).toEqual([
      'device',
      'device',
      'policy',
      'policy',
      'country',
      'country',
    ]);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Laptop', kind: 'device' }),
        expect.objectContaining({ label: 'Other devices', kind: 'device' }),
        expect.objectContaining({ label: 'Proxy', kind: 'policy' }),
        expect.objectContaining({ label: 'Other', kind: 'policy' }),
      ]),
    );
    expect(result.links.length).toBeGreaterThan(0);
    expect(result.links.every((link) => link.bytes > 0)).toBe(true);
    expect(
      result.links.every(
        (link) =>
          link.source >= 0 &&
          link.source < result.nodes.length &&
          link.target >= 0 &&
          link.target < result.nodes.length,
      ),
    ).toBe(true);
    expect(store.sankey(60, 3, NOW).nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Unknown', kind: 'policy' }),
        expect.objectContaining({ label: 'Unknown', kind: 'country' }),
      ]),
    );
  });

  it('maps wan rollups into local punchcard and zero-filled daily buckets', () => {
    const currentHour = Math.floor(NOW / 3_600_000) * 3_600_000;
    const previousDay = new Date(currentHour);
    previousDay.setDate(previousDay.getDate() - 1);
    store.writeFlush({
      flows: [],
      rollups: [
        { ts: currentHour, scope: 'wan', key: '', bytesIn: 120, bytesOut: 30 },
        { ts: previousDay.getTime(), scope: 'wan', key: '', bytesIn: 40, bytesOut: 10 },
      ],
    });

    const punchcard = store.punchcard(2, NOW);
    const todayIndex = (new Date(currentHour).getDay() + 6) % 7;
    const previousIndex = (previousDay.getDay() + 6) % 7;
    expect(punchcard.days).toBe(2);
    expect(punchcard.cells).toHaveLength(7);
    expect(punchcard.cells.every((row) => row.length === 24)).toBe(true);
    expect(punchcard.cells[todayIndex]![new Date(currentHour).getHours()]).toBe(150);
    expect(punchcard.cells[previousIndex]![previousDay.getHours()]).toBe(50);
    expect(punchcard.max).toBe(150);

    const daily = store.daily(3, NOW);
    expect(daily).toHaveLength(3);
    expect(daily.map((point) => point.day)).toEqual([...daily.map((point) => point.day)].sort());
    expect(daily[0]).toMatchObject({ in: 0, out: 0 });
    expect(daily[1]).toMatchObject({ in: 40, out: 10 });
    expect(daily[2]).toMatchObject({ in: 120, out: 30 });
  });

  it('compares adjacent mover windows at the selected rollup resolution', () => {
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: NOW, lastSeenAt: NOW });
    }
    const current = Math.floor(NOW / 60_000) * 60_000;
    const previous = current - 60_000;
    store.writeFlush({
      flows: [],
      rollups: [
        { ts: previous, scope: 'device', key: 'device-1', bytesIn: 100, bytesOut: 0 },
        { ts: current, scope: 'device', key: 'device-1', bytesIn: 400, bytesOut: 0 },
        { ts: previous, scope: 'device', key: 'device-2', bytesIn: 600, bytesOut: 0 },
        { ts: previous, scope: 'host', key: 'old.example', bytesIn: 500, bytesOut: 0 },
        { ts: current, scope: 'host', key: 'new.example', bytesIn: 300, bytesOut: 0 },
      ],
    });

    expect(store.movers(1, NOW)).toEqual({
      devices: [
        { key: 'device-2', label: 'Phone', current: 0, previous: 600 },
        { key: 'device-1', label: 'Laptop', current: 400, previous: 100 },
      ],
      domains: [
        { key: 'old.example', label: 'old.example', current: 0, previous: 500 },
        { key: 'new.example', label: 'new.example', current: 300, previous: 0 },
      ],
    });
  });

  it('finds first-seen devices and registrable domains inside their windows', () => {
    store.upsertDevice({
      id: 'device-new',
      name: 'New phone',
      firstSeenAt: NOW - 60_000,
      lastSeenAt: NOW,
    });
    store.upsertDevice({
      id: 'device-old',
      name: 'Old laptop',
      firstSeenAt: NOW - 10 * 86_400_000,
      lastSeenAt: NOW,
    });
    store.writeFlush({
      flows: [
        {
          id: 'flow-newer',
          sourceId: 'source-1',
          deviceId: 'device-new',
          ts: NOW - 86_400_000,
          host: 'api.example.com',
          bytesIn: 100,
          bytesOut: 10,
          state: 'completed',
        },
        {
          id: 'flow-older',
          sourceId: 'source-1',
          deviceId: 'device-old',
          ts: NOW - 2 * 86_400_000,
          host: 'cdn.example.com',
          bytesIn: 50,
          bytesOut: 5,
          state: 'completed',
        },
        {
          id: 'flow-outside',
          sourceId: 'source-1',
          deviceId: 'device-old',
          ts: NOW - 10 * 86_400_000,
          host: 'old.example.net',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
      ],
    });

    expect(store.firstSeen(7, NOW)).toEqual({
      devices: [{ deviceId: 'device-new', name: 'New phone', firstSeenAt: NOW - 60_000 }],
      domains: [
        {
          domain: 'example.com',
          firstTs: NOW - 2 * 86_400_000,
          bytes: 165,
          devices: 2,
        },
      ],
    });
  });

  it('summarizes both rejected definitions and overview day counters', () => {
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: NOW, lastSeenAt: NOW });
    }
    store.writeFlush({
      flows: [
        {
          id: 'failed-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 30_000,
          host: 'blocked.example',
          bytesIn: 10,
          bytesOut: 5,
          state: 'failed',
          policy: 'Proxy',
          rule: 'Rule A',
        },
        {
          id: 'policy-flow',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: NOW - 90_000,
          host: 'blocked.example',
          bytesIn: 20,
          bytesOut: 5,
          state: 'completed',
          policy: 'reject-drop',
          rule: 'Rule B',
        },
        {
          id: 'allowed-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: NOW - 30_000,
          host: 'allowed.example',
          bytesIn: 1_000,
          bytesOut: 0,
          state: 'completed',
          policy: 'Direct',
          rule: 'Rule C',
        },
      ],
    });
    store.appendDnsLog({
      id: 'dns-today',
      ts: NOW,
      qname: 'example.com',
      answers: [],
    });
    const yesterday = new Date(NOW);
    yesterday.setHours(0, 0, 0, 0);
    store.appendDnsLog({
      id: 'dns-yesterday',
      ts: yesterday.getTime() - 1,
      qname: 'old.example',
      answers: [],
    });

    const rejected = store.rejected(3, NOW);
    expect(rejected.series).toHaveLength(3);
    expect(rejected.series.reduce((sum, point) => sum + point.flows, 0)).toBe(2);
    expect(rejected.topHosts).toEqual([
      {
        key: 'blocked.example',
        bytesIn: 30,
        bytesOut: 10,
        flows: 2,
        devices: 2,
      },
    ]);
    expect(rejected.topDevices).toEqual([
      { key: 'device-2', label: 'Phone', bytesIn: 20, bytesOut: 5, flows: 1 },
      { key: 'device-1', label: 'Laptop', bytesIn: 10, bytesOut: 5, flows: 1 },
    ]);
    expect(rejected.topRules.map((row) => row.key)).toEqual(['Rule B', 'Rule A']);
    expect(store.getOverview(NOW)).toMatchObject({
      rejectedToday: { flows: 2, bytes: 40 },
      dnsToday: 1,
    });
  });
});
