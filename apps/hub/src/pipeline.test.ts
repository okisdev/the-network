import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db.ts';
import type { GeoLookup } from './geo.ts';
import { Identity } from './identity.ts';
import { Pipeline } from './pipeline.ts';
import { Store } from './store.ts';

const NOW = new Date(2026, 0, 2, 12, 0, 30).getTime();

describe('Pipeline', () => {
  let dataDir: string;
  let db: Database.Database;
  let store: Store;
  let pipeline: Pipeline;
  let now: number;
  let geoLookup: ReturnType<typeof vi.fn<GeoLookup>>;

  beforeEach(() => {
    now = NOW;
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-hub-pipeline-'));
    db = openDatabase(dataDir);
    store = new Store(db, () => now);
    geoLookup = vi.fn((ip: string) =>
      ip === '8.8.8.8'
        ? { country: 'US', city: 'Mountain View', lat: 37.386, lon: -122.0838 }
        : undefined,
    );
    pipeline = new Pipeline(store, new Identity(store), {
      autoStart: false,
      now: () => now,
      geoLookup,
    });
  });

  afterEach(() => {
    pipeline.stop();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('accumulates repeated deltas and persists their total', () => {
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-1',
        device: { mac: '00:11:22:33:44:55', name: 'Laptop' },
        dst: { host: 'example.com', proto: 'tcp' },
        bytesIn: 100,
        bytesOut: 20,
        state: 'active',
      },
    ]);
    now += 1_000;
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-1',
        device: { mac: '00:11:22:33:44:55' },
        dst: { host: 'example.com', proto: 'tcp' },
        bytesIn: 50,
        bytesOut: 10,
        state: 'completed',
      },
    ]);
    pipeline.flush();

    const flow = store.listFlows().flows[0];
    expect(flow).toMatchObject({ id: 'flow-1', bytesIn: 150, bytesOut: 30, state: 'completed' });
    expect(store.timeseries(`device:${flow!.deviceId}`, 1, now)).toEqual([
      { ts: Math.floor(now / 60_000) * 60_000, in: 150 / 60, out: 30 / 60 },
    ]);
  });

  it('keeps the first flow attributes and counts active flows', () => {
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-attrs',
        device: { mac: '00:11:22:33:44:77', name: 'Desktop' },
        dst: { ip: '8.8.8.8', proto: 'tcp' },
        bytesIn: 10,
        bytesOut: 5,
        state: 'active',
        attrs: {
          policyGroup: 'Primary',
          processPath: '/Applications/First.app/First',
          proxied: true,
          connectMs: 42,
        },
      },
    ]);
    expect(pipeline.activeFlowCount()).toBe(1);

    now += 1_000;
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-attrs',
        device: { mac: '00:11:22:33:44:77' },
        dst: { ip: '1.1.1.1', proto: 'tcp' },
        bytesIn: 20,
        bytesOut: 10,
        state: 'completed',
        attrs: {
          policyGroup: 'Later',
          processPath: '/Applications/Later.app/Later',
          proxied: false,
          connectMs: 99,
        },
      },
    ]);
    expect(pipeline.activeFlowCount()).toBe(0);
    expect(pipeline.recentFlowDtos()).toEqual([
      expect.objectContaining({
        id: 'flow-attrs',
        policyGroup: 'Primary',
        processPath: '/Applications/First.app/First',
        proxied: true,
        connectMs: 42,
        country: 'US',
        city: 'Mountain View',
      }),
    ]);

    pipeline.flush();

    expect(store.listFlows().flows[0]).toMatchObject({
      id: 'flow-attrs',
      policyGroup: 'Primary',
      processPath: '/Applications/First.app/First',
      proxied: true,
      connectMs: 42,
      country: 'US',
      city: 'Mountain View',
    });
    expect(db.prepare('SELECT lat, lon FROM flows WHERE id = ?').get('flow-attrs')).toEqual({
      lat: 37.386,
      lon: -122.0838,
    });
    expect(geoLookup).toHaveBeenCalledTimes(1);
  });

  it('uses a presence mac and ip binding for later ip-only flows', () => {
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.20', name: 'Phone' },
        event: 'seen',
      },
    ]);
    const device = store.listDevices(now)[0]!;
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now + 1_000,
        flowId: 'flow-1',
        device: { ip: '192.168.1.20' },
        dst: { ip: '1.1.1.1', port: 443, proto: 'tcp' },
        bytesIn: 25,
        bytesOut: 5,
        state: 'active',
      },
    ]);
    pipeline.flush();

    expect(store.listDevices(now)).toHaveLength(1);
    expect(store.listFlows().flows[0]?.deviceId).toBe(device.id);
    expect(store.latestEvents()).toEqual([
      expect.objectContaining({ kind: 'device_joined', deviceId: device.id }),
    ]);
  });

  it('enriches a flow once and writes country rollups', () => {
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-country',
        device: { mac: '00:11:22:33:44:66', name: 'Tablet' },
        dst: { ip: '8.8.8.8', proto: 'udp' },
        bytesIn: 100,
        bytesOut: 20,
        state: 'active',
      },
      {
        kind: 'flow_delta',
        ts: now + 1_000,
        flowId: 'flow-country',
        device: { mac: '00:11:22:33:44:66' },
        dst: { ip: '1.1.1.1', proto: 'udp' },
        bytesIn: 50,
        bytesOut: 10,
        state: 'completed',
      },
    ]);
    pipeline.flush();

    const flow = store.listFlows().flows[0]!;
    expect(flow).toMatchObject({ id: 'flow-country', country: 'US', bytesIn: 150, bytesOut: 30 });
    expect(geoLookup).toHaveBeenCalledTimes(1);
    expect(
      db
        .prepare(
          "SELECT scope, key, bytes_in, bytes_out FROM rollup_minute WHERE scope IN ('country', 'device_country') ORDER BY scope",
        )
        .all(),
    ).toEqual([
      { scope: 'country', key: 'US', bytes_in: 150, bytes_out: 30 },
      { scope: 'device_country', key: `${flow.deviceId}|US`, bytes_in: 150, bytes_out: 30 },
    ]);
  });

  it('merges an ip-only device when presence reveals its mac', () => {
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-1',
        device: { ip: '192.168.31.50' },
        dst: { host: 'example.com', proto: 'tcp' },
        bytesIn: 100,
        bytesOut: 20,
        state: 'active',
      },
    ]);
    pipeline.flush();
    const deadDeviceId = store.listDevices(now)[0]!.id;

    now += 1_000;
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: 'AA:BB:CC:DD:EE:01', ip: '192.168.31.50', name: 'Phone' },
        event: 'seen',
      },
    ]);
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now + 1_000,
        flowId: 'flow-2',
        device: { ip: '192.168.31.50' },
        dst: { host: 'example.com', proto: 'tcp' },
        bytesIn: 50,
        bytesOut: 10,
        state: 'active',
      },
    ]);
    pipeline.flush();

    const devices = store.listDevices(now).filter((device) => !device.mac?.startsWith('gateway:'));
    expect(devices).toHaveLength(1);
    const device = devices[0]!;
    expect(device).toMatchObject({ mac: 'aa:bb:cc:dd:ee:01', name: 'Phone' });
    expect(store.listFlows({ limit: 200 }).flows).toEqual([
      expect.objectContaining({ id: 'flow-2', deviceId: device.id }),
      expect.objectContaining({ id: 'flow-1', deviceId: device.id }),
    ]);
    expect(
      db.prepare("SELECT key FROM rollup_minute WHERE scope = 'device' ORDER BY key").all(),
    ).toEqual([{ key: device.id }]);
    expect(pipeline.deviceRates(now).has(deadDeviceId)).toBe(false);
  });

  it('re-baselines wan counters after reset without negative rollups', () => {
    const metric = (ts: number, inBytes: number, outBytes: number) => ({
      kind: 'metric' as const,
      ts,
      scope: 'wan',
      inBps: 10,
      outBps: 5,
      totals: { inBytes, outBytes },
    });
    pipeline.ingest('source-1', [metric(now, 100, 200)]);
    pipeline.ingest('source-1', [metric(now + 1_000, 150, 260)]);
    pipeline.ingest('source-1', [metric(now + 2_000, 10, 20)]);
    pipeline.ingest('source-1', [metric(now + 3_000, 15, 25)]);
    pipeline.flush();

    const points = store.timeseries('wan', 1, now + 3_000);
    expect(points[0]).toMatchObject({ in: 55 / 60, out: 65 / 60 });
    expect(points[0]!.in).toBeGreaterThanOrEqual(0);
    expect(points[0]!.out).toBeGreaterThanOrEqual(0);
  });

  it('records presence changes on flush ticks', () => {
    const firstTick = now;
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: 'AA:BB:CC:DD:EE:10', name: 'Watch' },
        event: 'seen',
      },
    ]);
    const deviceId = store.listDevices(now)[0]!.id;
    pipeline.flush();

    now += 120_001;
    pipeline.flush();
    now += 1;
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: 'AA:BB:CC:DD:EE:10', name: 'Watch' },
        event: 'seen',
      },
    ]);
    pipeline.flush();

    expect(store.listPresence(deviceId, firstTick - 1, now + 1)).toEqual([
      { start: firstTick, end: firstTick + 120_001 },
      { start: firstTick + 120_002 },
    ]);
  });

  it('persists and emits DNS resolver fields', () => {
    const listener = vi.fn();
    pipeline.onDns(listener);

    pipeline.ingest('source-1', [
      {
        kind: 'dns',
        ts: now,
        device: {},
        qname: 'example.com',
        answers: ['93.184.216.34'],
        rttMs: 8,
        server: '1.1.1.1',
        source: 'cache',
      },
    ]);

    expect(store.listDnsLog().entries[0]).toMatchObject({ server: '1.1.1.1', source: 'cache' });
    expect(listener).toHaveBeenCalledWith([
      expect.objectContaining({ server: '1.1.1.1', source: 'cache' }),
    ]);
  });
});
