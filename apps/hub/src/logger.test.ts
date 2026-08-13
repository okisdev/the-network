import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DNS_LOG_RETENTION_MS, SYSTEM_LOG_RETENTION_MS } from './config.ts';
import { openDatabase } from './db.ts';
import { logger, setLogSink } from './logger.ts';
import { Store } from './store.ts';

const NOW = new Date(2026, 0, 2, 12, 0, 30).getTime();

describe('system logging', () => {
  let dataDir: string;
  let db: Database.Database;
  let store: Store;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-hub-logger-'));
    db = openDatabase(dataDir);
    store = new Store(db, () => NOW);
    setLogSink((entry) => store.appendSystemLog(entry));
  });

  afterEach(() => {
    setLogSink();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('writes through the sink, filters levels and scopes, and sweeps log retention', () => {
    logger.warn('Gateway latency is high');
    logger.log('info', 'Probe connected', 'Main gateway');
    expect(store.listSystemLog({ level: 'warn' }).entries).toEqual([
      expect.objectContaining({
        ts: NOW,
        level: 'warn',
        scope: 'hub',
        message: 'Gateway latency is high',
      }),
    ]);
    expect(store.listSystemLog({ search: 'Main gateway' }).entries).toEqual([
      expect.objectContaining({ scope: 'Main gateway', message: 'Probe connected' }),
    ]);

    store.appendSystemLog({
      id: 'old-system',
      ts: NOW - SYSTEM_LOG_RETENTION_MS - 1,
      level: 'error',
      scope: 'hub',
      message: 'Old system entry',
    });
    store.appendDnsLog({
      id: 'old-dns',
      ts: NOW - DNS_LOG_RETENTION_MS - 1,
      qname: 'old.example',
      answers: [],
    });
    expect(store.sweepRetention(NOW)).toMatchObject({ systemLog: 1, dnsLog: 1 });
    expect(store.listSystemLog({ search: 'Old system' }).entries).toEqual([]);
    expect(store.listDnsLog({ search: 'old.example' }).entries).toEqual([]);
  });
});
