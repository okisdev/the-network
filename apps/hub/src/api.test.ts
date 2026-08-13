import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProbeAdapter, SourceDto } from '@the-network/schema';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi } from './api.ts';
import { openDatabase } from './db.ts';
import { Identity } from './identity.ts';
import { Pipeline } from './pipeline.ts';
import { ProbeManager } from './probes.ts';
import { Realtime } from './realtime.ts';
import { Store } from './store.ts';

const fakeAdapter: ProbeAdapter = {
  descriptor: {
    kind: 'surge',
    vantage: 'gateway',
    capabilities: ['per_device', 'whole_home'],
  },
  async start(ctx) {
    ctx.setStatus({ state: 'ok' });
    await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve(), { once: true }));
  },
  async testConnection() {
    return { ok: true, message: 'Connected' };
  },
};

describe('Hub API', () => {
  let dataDir: string;
  let db: Database.Database;
  let store: Store;
  let pipeline: Pipeline;
  let probes: ProbeManager;
  let realtime: Realtime;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-hub-api-'));
    db = openDatabase(dataDir);
    store = new Store(db);
    pipeline = new Pipeline(store, new Identity(store), {
      autoStart: false,
      geoLookup: (ip) => {
        if (ip === '8.8.8.8') return 'US';
        if (ip === '1.1.1.1') return 'AU';
        return undefined;
      },
    });
    probes = new ProbeManager(store, pipeline, { adapters: { surge: fakeAdapter } });
    realtime = new Realtime(pipeline);
    app = await createApi({
      config: { consoleDist: join(dataDir, 'missing-console') },
      store,
      pipeline,
      probes,
      realtime,
    });
  });

  afterEach(async () => {
    probes.stopAll();
    realtime.close();
    pipeline.stop();
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('roundtrips sources and redacts api keys', async () => {
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/sources',
      payload: {
        kind: 'surge',
        name: 'Gateway',
        settings: { url: 'http://gateway.local', apiKey: 'top-secret' },
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<SourceDto>();
    expect(created.settings.apiKey).toBe('••••cret');

    const tested = await app.inject({
      method: 'POST',
      url: '/api/sources/test',
      payload: {
        kind: 'surge',
        name: 'Gateway',
        settings: { url: 'http://gateway.local', apiKey: 'top-secret' },
      },
    });
    expect(tested.json()).toEqual({ ok: true, message: 'Connected' });

    const listed = await app.inject({ method: 'GET', url: '/api/sources' });
    expect(listed.json<SourceDto[]>()).toEqual([
      expect.objectContaining({ id: created.id, name: 'Gateway', settings: expect.objectContaining({ apiKey: '••••cret' }) }),
    ]);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sources/${created.id}`,
      payload: { name: 'Main gateway', enabled: false },
    });
    expect(patched.json<SourceDto>()).toMatchObject({ name: 'Main gateway', enabled: false });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/sources/${created.id}` });
    expect(deleted.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: '/api/sources' })).json()).toEqual([]);
  });

  it('returns the overview contract after fake events', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: '00:11:22:33:44:55', ip: '192.168.1.5', name: 'Laptop' },
        event: 'seen',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-1',
        device: { mac: '00:11:22:33:44:55', ip: '192.168.1.5' },
        dst: { host: 'cdn.example.com', port: 443, proto: 'tcp' },
        bytesIn: 400,
        bytesOut: 100,
        state: 'active',
        attrs: { policy: 'Proxy' },
      },
      {
        kind: 'metric',
        ts: now,
        scope: 'wan',
        inBps: 2_000,
        outBps: 500,
        totals: { inBytes: 0, outBytes: 0 },
      },
      {
        kind: 'metric',
        ts: now + 1_000,
        scope: 'wan',
        inBps: 2_000,
        outBps: 500,
        totals: { inBytes: 400, outBytes: 100 },
      },
    ]);
    pipeline.flush();

    const response = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      wan: { rateIn: expect.any(Number), rateOut: expect.any(Number) },
      today: { in: 400, out: 100 },
      activeDevices: 1,
      totalDevices: 1,
      topDevices: [
        { deviceId: expect.any(String), name: 'Laptop', rateIn: expect.any(Number), rateOut: expect.any(Number) },
      ],
      topDestinations: [{ host: 'example.com', bytes: 500 }],
      policySplit: [{ policy: 'Proxy', bytes: 500 }],
      events: [expect.objectContaining({ kind: 'device_joined' })],
    });
  });

  it('filters flows by device id', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-a',
        device: { mac: '00:00:00:00:00:01', name: 'One' },
        dst: { host: 'one.example' },
        bytesIn: 1,
        bytesOut: 2,
        state: 'active',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-b',
        device: { mac: '00:00:00:00:00:02', name: 'Two' },
        dst: { host: 'two.example' },
        bytesIn: 3,
        bytesOut: 4,
        state: 'active',
      },
    ]);
    pipeline.flush();
    const deviceId = store.listDevices().find((device) => device.name === 'One')!.id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/flows?deviceId=${encodeURIComponent(deviceId)}`,
    });
    expect(response.json()).toEqual({
      flows: [expect.objectContaining({ id: 'flow-a', deviceId })],
    });
  });

  it('filters flows by country', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-us',
        device: { mac: '00:00:00:00:01:01', name: 'One' },
        dst: { ip: '8.8.8.8' },
        bytesIn: 10,
        bytesOut: 2,
        state: 'active',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-au',
        device: { mac: '00:00:00:00:01:02', name: 'Two' },
        dst: { ip: '1.1.1.1' },
        bytesIn: 20,
        bytesOut: 4,
        state: 'active',
      },
    ]);
    pipeline.flush();

    const response = await app.inject({ method: 'GET', url: '/api/flows?country=US' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      flows: [expect.objectContaining({ id: 'flow-us', country: 'US' })],
    });
  });

  it('returns ordered destinations and country device shares', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'alpha-us',
        device: { mac: '00:00:00:00:02:01', name: 'Laptop' },
        dst: { host: 'api.alpha.example', ip: '8.8.8.8' },
        bytesIn: 250,
        bytesOut: 50,
        state: 'completed',
      },
      {
        kind: 'flow_delta',
        ts: now + 1,
        flowId: 'alpha-au',
        device: { mac: '00:00:00:00:02:02', name: 'Phone' },
        dst: { host: 'cdn.alpha.example', ip: '1.1.1.1' },
        bytesIn: 80,
        bytesOut: 20,
        state: 'completed',
      },
      {
        kind: 'flow_delta',
        ts: now + 2,
        flowId: 'beta-au',
        device: { mac: '00:00:00:00:02:02', name: 'Phone' },
        dst: { host: 'beta.example', ip: '1.1.1.1' },
        bytesIn: 400,
        bytesOut: 100,
        state: 'completed',
      },
    ]);
    pipeline.flush();

    const destinations = await app.inject({ method: 'GET', url: '/api/destinations' });
    expect(destinations.statusCode).toBe(200);
    expect(destinations.json()).toEqual({
      countries: [
        { code: 'AU', bytesIn: 480, bytesOut: 120, flows: 2 },
        { code: 'US', bytesIn: 250, bytesOut: 50, flows: 1 },
      ],
      hosts: [
        { host: 'beta.example', country: 'AU', bytes: 500, flows: 1, devices: 1 },
        { host: 'alpha.example', country: 'US', bytes: 400, flows: 2, devices: 2 },
      ],
    });

    const devices = await app.inject({
      method: 'GET',
      url: '/api/destinations/au/devices',
    });
    expect(devices.statusCode).toBe(200);
    expect(devices.json()).toEqual([
      {
        deviceId: expect.any(String),
        deviceName: 'Phone',
        bytes: 600,
        flows: 2,
      },
    ]);
  });

  it('persists ingested dns batches and exposes pagination and search', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: '00:00:00:00:03:01', ip: '192.168.1.20', name: 'Phone' },
        event: 'seen',
      },
    ]);
    const batches: unknown[][] = [];
    const unsubscribe = pipeline.onDns((entries) => batches.push(entries));
    pipeline.ingest('source-1', [
      {
        kind: 'dns',
        ts: now + 1,
        device: { ip: '192.168.1.20' },
        qname: 'push.apple.com',
        answers: ['17.57.146.20'],
        rttMs: 12,
      },
      {
        kind: 'dns',
        ts: now + 2,
        device: {},
        qname: 'example.net',
        answers: [],
      },
    ]);
    unsubscribe();

    expect((db.prepare('SELECT COUNT(*) AS count FROM dns_log').get() as { count: number }).count).toBe(2);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]?.[0]).toMatchObject({ deviceName: 'Phone', qname: 'push.apple.com' });

    const first = await app.inject({ method: 'GET', url: '/api/logs/dns?limit=1' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ entries: [expect.any(Object)], nextCursor: expect.any(String) });
    const searched = await app.inject({ method: 'GET', url: '/api/logs/dns?search=apple' });
    expect(searched.json()).toEqual({
      entries: [
        expect.objectContaining({
          qname: 'push.apple.com',
          answers: ['17.57.146.20'],
          rttMs: 12,
          deviceName: 'Phone',
        }),
      ],
    });
  });

  it('filters system logs by level and search', async () => {
    const now = Date.now();
    store.appendSystemLog({
      id: 'system-info',
      ts: now,
      level: 'info',
      scope: 'hub',
      message: 'Hub started',
    });
    store.appendSystemLog({
      id: 'system-error',
      ts: now + 1,
      level: 'error',
      scope: 'Main gateway',
      message: 'Probe request failed',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/logs/system?level=error&search=gateway',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entries: [
        {
          id: 'system-error',
          ts: now + 1,
          level: 'error',
          scope: 'Main gateway',
          message: 'Probe request failed',
        },
      ],
    });
  });

  it('zero-fills exactly the requested number of timeseries points', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/timeseries?scope=wan&minutes=7' });
    expect(response.statusCode).toBe(200);
    const points = response.json<Array<{ ts: number; in: number; out: number }>>();
    expect(points).toHaveLength(7);
    expect(points.every((point) => point.in === 0 && point.out === 0)).toBe(true);
    expect(points[1]!.ts - points[0]!.ts).toBe(60_000);
  });

  it('serves Next.js static export routes, assets, SPA 404, and keeps API JSON 404', async () => {
    probes.stopAll();
    realtime.close();
    pipeline.stop();
    await app.close();
    db.close();

    const consoleDist = join(dataDir, 'console-out');
    mkdirSync(join(consoleDist, '_next'), { recursive: true });
    writeFileSync(join(consoleDist, 'index.html'), '<html>index</html>');
    writeFileSync(join(consoleDist, 'devices.html'), '<html>devices-page</html>');
    writeFileSync(join(consoleDist, '404.html'), '<html>not-found-page</html>');
    writeFileSync(join(consoleDist, '_next', 'chunk.js'), 'console.log("chunk")');

    db = openDatabase(dataDir);
    store = new Store(db);
    pipeline = new Pipeline(store, new Identity(store), { autoStart: false });
    probes = new ProbeManager(store, pipeline, { adapters: { surge: fakeAdapter } });
    realtime = new Realtime(pipeline);
    app = await createApi({
      config: { consoleDist },
      store,
      pipeline,
      probes,
      realtime,
    });

    const devices = await app.inject({ method: 'GET', url: '/devices' });
    expect(devices.statusCode).toBe(200);
    expect(devices.body).toContain('devices-page');

    const asset = await app.inject({ method: 'GET', url: '/_next/chunk.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('chunk');

    const missing = await app.inject({ method: 'GET', url: '/nope' });
    expect(missing.body).toContain('not-found-page');

    const apiMissing = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(apiMissing.headers['content-type']).toMatch(/application\/json/);
    expect(apiMissing.json()).toEqual({ message: 'Not found' });

    const traversal = await app.inject({ method: 'GET', url: '/../etc/passwd' });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain('devices-page');
    expect(traversal.body).not.toContain('root:');

    const rawTraversal = await app.inject({ method: 'GET', url: '/%2e%2e/etc/passwd' });
    expect(rawTraversal.statusCode).toBe(404);
    expect(rawTraversal.body).not.toContain('root:');
  });
});
