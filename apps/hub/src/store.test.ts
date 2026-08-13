import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
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
        },
      ],
    });

    expect(store.listFlows().flows[0]).toMatchObject({
      id: 'flow-1',
      bytesIn: 120,
      bytesOut: 30,
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
});
