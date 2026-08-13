import type BetterSqlite3 from 'better-sqlite3';
import type {
  CountryDeviceShare,
  DestinationCountry,
  DestinationHost,
  DestinationsDto,
  DeviceDto,
  DeviceHint,
  DnsLogEntry,
  DnsLogPage,
  EventDto,
  FlowDto,
  FlowsPage,
  FlowsQuery,
  FlowState,
  LogsQuery,
  SystemLogEntry,
  SystemLogPage,
  TimeseriesPoint,
} from '@the-network/schema';
import {
  DNS_LOG_RETENTION_MS,
  EVENTS_RETENTION_MS,
  FLOWS_RETENTION_MS,
  ROLLUP_HOUR_RETENTION_MS,
  ROLLUP_MINUTE_RETENTION_MS,
  SYSTEM_LOG_RETENTION_MS,
} from './config.ts';

export interface SourceRecord {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  settingsJson: string;
  createdAt: number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  mac?: string;
  vendor?: string;
  iconId?: string;
  managed?: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface DeviceWrite extends DeviceHint {
  id: string;
  vendor?: string;
  iconId?: string;
  managed?: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface DeviceWithUsage extends DeviceRecord {
  ips: string[];
  todayIn: number;
  todayOut: number;
}

export interface FlowWrite {
  id: string;
  sourceId: string;
  deviceId: string;
  ts: number;
  host?: string;
  ip?: string;
  port?: number;
  proto?: string;
  bytesIn: number;
  bytesOut: number;
  state: FlowState;
  policy?: string;
  policyChain?: string[];
  rule?: string;
  process?: string;
  country?: string;
  startedAt?: number;
  endedAt?: number;
  rollupBytesIn?: number;
  rollupBytesOut?: number;
}

export interface RollupIncrement {
  ts: number;
  scope: 'wan' | 'device' | 'policy' | 'host' | 'device_host' | 'country' | 'device_country';
  key: string;
  bytesIn: number;
  bytesOut: number;
  flows?: number;
}

export interface FlushBatch {
  flows: FlowWrite[];
  rollups?: RollupIncrement[];
}

export interface OverviewData {
  today: { in: number; out: number };
  totalDevices: number;
  topDevices: Array<{ deviceId: string; name: string; bytes: number }>;
  topDestinations: Array<{ host: string; bytes: number }>;
  policySplit: Array<{ policy: string; bytes: number }>;
}

interface SourceRow {
  id: string;
  kind: string;
  name: string;
  enabled: number;
  settings_json: string;
  created_at: number;
}

interface DeviceRow {
  id: string;
  name: string;
  mac: string | null;
  vendor: string | null;
  icon_id: string | null;
  managed: number | null;
  first_seen_at: number;
  last_seen_at: number;
}

interface FlowRow {
  id: string;
  ts: number;
  device_id: string;
  device_name: string;
  host: string | null;
  ip: string | null;
  port: number | null;
  proto: string | null;
  bytes_in: number;
  bytes_out: number;
  state: string;
  policy: string | null;
  policy_chain_json: string | null;
  rule: string | null;
  process: string | null;
  country: string | null;
  started_at: number | null;
  ended_at: number | null;
}

interface EventRow {
  id: string;
  ts: number;
  kind: EventDto['kind'];
  message: string;
  device_id: string | null;
  source_id: string | null;
}

interface DnsLogRow {
  id: string;
  ts: number;
  device_id: string | null;
  device_name: string | null;
  qname: string;
  answers_json: string;
  rtt_ms: number | null;
}

interface SystemLogRow {
  id: string;
  ts: number;
  level: SystemLogEntry['level'];
  scope: string;
  message: string;
}

interface CountRow {
  count: number;
}

interface TotalsRow {
  bytes_in: number | null;
  bytes_out: number | null;
}

interface UsageRow {
  key: string;
  bytes_in: number;
  bytes_out: number;
  bytes: number;
}

interface DestinationUsageRow extends UsageRow {
  flows: number;
}

interface HostFlowRow {
  host: string;
  device_id: string;
  country: string | null;
  bytes: number;
}

interface CountryDeviceRow {
  device_id: string;
  device_name: string;
  bytes: number;
  flows: number;
}

interface BucketRow {
  bucket: number;
  bytes_in: number;
  bytes_out: number;
}

function sourceFromRow(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled === 1,
    settingsJson: row.settings_json,
    createdAt: row.created_at,
  };
}

function deviceFromRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    ...(row.mac === null ? {} : { mac: row.mac }),
    ...(row.vendor === null ? {} : { vendor: row.vendor }),
    ...(row.icon_id === null ? {} : { iconId: row.icon_id }),
    ...(row.managed === null ? {} : { managed: row.managed === 1 }),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

function flowFromRow(row: FlowRow): FlowDto {
  let policyChain: string[] | undefined;
  if (row.policy_chain_json !== null) {
    try {
      const value: unknown = JSON.parse(row.policy_chain_json);
      if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
        policyChain = value;
      }
    } catch {}
  }

  return {
    id: row.id,
    ts: row.ts,
    deviceId: row.device_id,
    deviceName: row.device_name,
    dst: {
      ...(row.host === null ? {} : { host: row.host }),
      ...(row.ip === null ? {} : { ip: row.ip }),
      ...(row.port === null ? {} : { port: row.port }),
      ...(row.proto === null ? {} : { proto: row.proto }),
    },
    bytesIn: row.bytes_in,
    bytesOut: row.bytes_out,
    state: row.state as FlowState,
    ...(row.country === null ? {} : { country: row.country }),
    ...(row.policy === null ? {} : { policy: row.policy }),
    ...(policyChain === undefined ? {} : { policyChain }),
    ...(row.rule === null ? {} : { rule: row.rule }),
    ...(row.process === null ? {} : { process: row.process }),
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.ended_at === null ? {} : { endedAt: row.ended_at }),
  };
}

function dnsLogFromRow(row: DnsLogRow): DnsLogEntry {
  let answers: string[] = [];
  try {
    const value: unknown = JSON.parse(row.answers_json);
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) answers = value;
  } catch {}
  return {
    id: row.id,
    ts: row.ts,
    ...(row.device_id === null ? {} : { deviceId: row.device_id }),
    ...(row.device_name === null ? {} : { deviceName: row.device_name }),
    qname: row.qname,
    answers,
    ...(row.rtt_ms === null ? {} : { rttMs: row.rtt_ms }),
  };
}

function systemLogFromRow(row: SystemLogRow): SystemLogEntry {
  return {
    id: row.id,
    ts: row.ts,
    level: row.level,
    scope: row.scope,
    message: row.message,
  };
}

function eventFromRow(row: EventRow): EventDto {
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    message: row.message,
    ...(row.device_id === null ? {} : { deviceId: row.device_id }),
    ...(row.source_id === null ? {} : { sourceId: row.source_id }),
  };
}

function localMidnight(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function encodeCursor(ts: number, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id })).toString('base64url');
}

function decodeCursor(cursor: string): { ts: number; id: string } | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof value === 'object' &&
      value !== null &&
      'ts' in value &&
      'id' in value &&
      typeof value.ts === 'number' &&
      Number.isFinite(value.ts) &&
      typeof value.id === 'string'
    ) {
      return { ts: value.ts, id: value.id };
    }
  } catch {}
  return undefined;
}

export function registrableHost(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels.at(-1);
  const secondLevel = labels.at(-2);
  const compound = new Set(['com', 'net', 'org', 'co', 'edu', 'gov', 'ac']);
  if (tld?.length === 2 && secondLevel !== undefined && compound.has(secondLevel)) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

export function runMigrations(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      kind TEXT,
      name TEXT,
      enabled INTEGER,
      settings_json TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      mac TEXT UNIQUE,
      vendor TEXT,
      icon_id TEXT,
      managed INTEGER,
      first_seen_at INTEGER,
      last_seen_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS device_ips (
      ip TEXT PRIMARY KEY,
      device_id TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS flows (
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
      started_at INTEGER,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS flows_ts_idx ON flows (ts);
    CREATE INDEX IF NOT EXISTS flows_device_ts_idx ON flows (device_id, ts);
    CREATE INDEX IF NOT EXISTS flows_host_idx ON flows (host);
    CREATE TABLE IF NOT EXISTS rollup_minute (
      bucket INTEGER,
      scope TEXT,
      key TEXT,
      bytes_in INTEGER,
      bytes_out INTEGER,
      flows INTEGER,
      PRIMARY KEY (bucket, scope, key)
    );
    CREATE TABLE IF NOT EXISTS rollup_hour (
      bucket INTEGER,
      scope TEXT,
      key TEXT,
      bytes_in INTEGER,
      bytes_out INTEGER,
      flows INTEGER,
      PRIMARY KEY (bucket, scope, key)
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      ts INTEGER,
      kind TEXT,
      message TEXT,
      device_id TEXT,
      source_id TEXT
    );
    CREATE TABLE IF NOT EXISTS dns_log (
      id TEXT PRIMARY KEY,
      ts INTEGER,
      device_id TEXT,
      qname TEXT,
      answers_json TEXT,
      rtt_ms REAL
    );
    CREATE INDEX IF NOT EXISTS dns_log_ts_idx ON dns_log (ts);
    CREATE TABLE IF NOT EXISTS system_log (
      id TEXT PRIMARY KEY,
      ts INTEGER,
      level TEXT,
      scope TEXT,
      message TEXT
    );
    CREATE INDEX IF NOT EXISTS system_log_ts_idx ON system_log (ts);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  const flowColumns = db.prepare('PRAGMA table_info(flows)').all() as Array<{ name: string }>;
  if (!flowColumns.some((column) => column.name === 'country')) {
    db.exec('ALTER TABLE flows ADD COLUMN country TEXT');
  }
}

export class Store {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly now: () => number = Date.now,
  ) {}

  createSource(source: SourceRecord): SourceRecord {
    this.db
      .prepare(
        'INSERT INTO sources (id, kind, name, enabled, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        source.id,
        source.kind,
        source.name,
        source.enabled ? 1 : 0,
        source.settingsJson,
        source.createdAt,
      );
    return source;
  }

  listSources(): SourceRecord[] {
    const rows = this.db
      .prepare('SELECT id, kind, name, enabled, settings_json, created_at FROM sources ORDER BY created_at, id')
      .all() as SourceRow[];
    return rows.map(sourceFromRow);
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.db
      .prepare('SELECT id, kind, name, enabled, settings_json, created_at FROM sources WHERE id = ?')
      .get(id) as SourceRow | undefined;
    return row === undefined ? undefined : sourceFromRow(row);
  }

  updateSource(
    id: string,
    patch: Partial<Pick<SourceRecord, 'kind' | 'name' | 'enabled' | 'settingsJson'>>,
  ): SourceRecord | undefined {
    const source = this.getSource(id);
    if (source === undefined) return undefined;
    const updated: SourceRecord = { ...source, ...patch };
    this.db
      .prepare('UPDATE sources SET kind = ?, name = ?, enabled = ?, settings_json = ? WHERE id = ?')
      .run(
        updated.kind,
        updated.name,
        updated.enabled ? 1 : 0,
        updated.settingsJson,
        id,
      );
    return updated;
  }

  deleteSource(id: string): boolean {
    return this.db.prepare('DELETE FROM sources WHERE id = ?').run(id).changes > 0;
  }

  getDeviceByMac(mac: string): DeviceRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id, name, mac, vendor, icon_id, managed, first_seen_at, last_seen_at FROM devices WHERE mac = ?',
      )
      .get(mac) as DeviceRow | undefined;
    return row === undefined ? undefined : deviceFromRow(row);
  }

  getDeviceById(id: string): DeviceRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id, name, mac, vendor, icon_id, managed, first_seen_at, last_seen_at FROM devices WHERE id = ?',
      )
      .get(id) as DeviceRow | undefined;
    return row === undefined ? undefined : deviceFromRow(row);
  }

  getDeviceIdByIp(ip: string): string | undefined {
    const row = this.db.prepare('SELECT device_id FROM device_ips WHERE ip = ?').get(ip) as
      | { device_id: string }
      | undefined;
    return row?.device_id;
  }

  upsertDevice(input: DeviceWrite): DeviceRecord {
    const existing = input.mac === undefined ? this.getDeviceById(input.id) : this.getDeviceByMac(input.mac);
    if (existing === undefined) {
      this.db
        .prepare(
          `INSERT INTO devices
            (id, name, mac, vendor, icon_id, managed, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.name ?? input.ip ?? 'Unknown device',
          input.mac ?? null,
          input.vendor ?? null,
          input.iconId ?? null,
          input.managed === undefined ? null : input.managed ? 1 : 0,
          input.firstSeenAt,
          input.lastSeenAt,
        );
      return this.getDeviceById(input.id)!;
    }

    const name = input.name ?? existing.name;
    const vendor = input.vendor ?? existing.vendor;
    const iconId = input.iconId ?? existing.iconId;
    const managed = input.managed ?? existing.managed;
    this.db
      .prepare(
        `UPDATE devices
         SET name = ?, mac = ?, vendor = ?, icon_id = ?, managed = ?, last_seen_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        input.mac ?? existing.mac ?? null,
        vendor ?? null,
        iconId ?? null,
        managed === undefined ? null : managed ? 1 : 0,
        Math.max(existing.lastSeenAt, input.lastSeenAt),
        existing.id,
      );
    return this.getDeviceById(existing.id)!;
  }

  touchDevice(id: string, ts: number, name?: string): DeviceRecord | undefined {
    if (name === undefined) {
      this.db.prepare('UPDATE devices SET last_seen_at = MAX(last_seen_at, ?) WHERE id = ?').run(ts, id);
    } else {
      this.db
        .prepare('UPDATE devices SET name = ?, last_seen_at = MAX(last_seen_at, ?) WHERE id = ?')
        .run(name, ts, id);
    }
    return this.getDeviceById(id);
  }

  bindDeviceIp(deviceId: string, ip: string, ts: number): void {
    this.db
      .prepare(
        `INSERT INTO device_ips (ip, device_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (ip) DO UPDATE SET device_id = excluded.device_id, updated_at = excluded.updated_at`,
      )
      .run(ip, deviceId, ts);
  }

  mergeDevices(fromId: string, toId: string): void {
    if (fromId === toId) return;
    const transaction = this.db.transaction((from: string, to: string) => {
      this.db.prepare('UPDATE flows SET device_id = ? WHERE device_id = ?').run(to, from);
      this.db.prepare('UPDATE device_ips SET device_id = ? WHERE device_id = ?').run(to, from);
      this.db.prepare('UPDATE events SET device_id = ? WHERE device_id = ?').run(to, from);
      this.db.prepare('UPDATE dns_log SET device_id = ? WHERE device_id = ?').run(to, from);

      for (const table of ['rollup_minute', 'rollup_hour'] as const) {
        this.db
          .prepare(
            `INSERT INTO ${table} (bucket, scope, key, bytes_in, bytes_out, flows)
             SELECT bucket, scope, ?, bytes_in, bytes_out, flows
             FROM ${table}
             WHERE scope = 'device' AND key = ?
             ON CONFLICT (bucket, scope, key) DO UPDATE SET
               bytes_in = ${table}.bytes_in + excluded.bytes_in,
               bytes_out = ${table}.bytes_out + excluded.bytes_out,
               flows = ${table}.flows + excluded.flows`,
          )
          .run(to, from);
        this.db.prepare(`DELETE FROM ${table} WHERE scope = 'device' AND key = ?`).run(from);
        this.db
          .prepare(
            `INSERT INTO ${table} (bucket, scope, key, bytes_in, bytes_out, flows)
             SELECT bucket, scope, ? || substr(key, length(?) + 1), bytes_in, bytes_out, flows
             FROM ${table}
             WHERE scope IN ('device_host', 'device_country') AND key LIKE ? || '|%'
             ON CONFLICT (bucket, scope, key) DO UPDATE SET
               bytes_in = ${table}.bytes_in + excluded.bytes_in,
               bytes_out = ${table}.bytes_out + excluded.bytes_out,
               flows = ${table}.flows + excluded.flows`,
          )
          .run(to, from, from);
        this.db
          .prepare(`DELETE FROM ${table} WHERE scope IN ('device_host', 'device_country') AND key LIKE ? || '|%'`)
          .run(from);
      }

      this.db.prepare('DELETE FROM devices WHERE id = ?').run(from);
    });
    transaction(fromId, toId);
  }

  writeFlush(batch: FlushBatch): void {
    const transaction = this.db.transaction((value: FlushBatch) => {
      const upsertFlow = this.db.prepare(`
        INSERT INTO flows (
          id, source_id, device_id, ts, host, ip, port, proto, bytes_in, bytes_out,
          state, policy, policy_chain_json, rule, process, country, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          source_id = excluded.source_id,
          device_id = excluded.device_id,
          ts = excluded.ts,
          host = excluded.host,
          ip = excluded.ip,
          port = excluded.port,
          proto = excluded.proto,
          bytes_in = excluded.bytes_in,
          bytes_out = excluded.bytes_out,
          state = excluded.state,
          policy = excluded.policy,
          policy_chain_json = excluded.policy_chain_json,
          rule = excluded.rule,
          process = excluded.process,
          country = excluded.country,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at
      `);

      const increments: RollupIncrement[] = [...(value.rollups ?? [])];
      for (const flow of value.flows) {
        upsertFlow.run(
          flow.id,
          flow.sourceId,
          flow.deviceId,
          flow.ts,
          flow.host ?? null,
          flow.ip ?? null,
          flow.port ?? null,
          flow.proto ?? null,
          flow.bytesIn,
          flow.bytesOut,
          flow.state,
          flow.policy ?? null,
          flow.policyChain === undefined ? null : JSON.stringify(flow.policyChain),
          flow.rule ?? null,
          flow.process ?? null,
          flow.country ?? null,
          flow.startedAt ?? null,
          flow.endedAt ?? null,
        );

        const bytesIn = flow.rollupBytesIn ?? flow.bytesIn;
        const bytesOut = flow.rollupBytesOut ?? flow.bytesOut;
        // The wan scope is fed only by interface counter metrics; adding flow
        // bytes here would double count every gatewayed connection.
        const base = { ts: flow.ts, bytesIn, bytesOut, flows: 1 };
        increments.push({ ...base, scope: 'device', key: flow.deviceId });
        if (flow.country) {
          increments.push({ ...base, scope: 'country', key: flow.country });
          increments.push({ ...base, scope: 'device_country', key: `${flow.deviceId}|${flow.country}` });
        }
        if (flow.policy) increments.push({ ...base, scope: 'policy', key: flow.policy });
        if (flow.host) {
          const host = registrableHost(flow.host);
          if (host) {
            increments.push({ ...base, scope: 'host', key: host });
            increments.push({ ...base, scope: 'device_host', key: `${flow.deviceId}|${host}` });
          }
        }
      }

      const minute = this.db.prepare(`
        INSERT INTO rollup_minute (bucket, scope, key, bytes_in, bytes_out, flows)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (bucket, scope, key) DO UPDATE SET
          bytes_in = rollup_minute.bytes_in + excluded.bytes_in,
          bytes_out = rollup_minute.bytes_out + excluded.bytes_out,
          flows = rollup_minute.flows + excluded.flows
      `);
      const hour = this.db.prepare(`
        INSERT INTO rollup_hour (bucket, scope, key, bytes_in, bytes_out, flows)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (bucket, scope, key) DO UPDATE SET
          bytes_in = rollup_hour.bytes_in + excluded.bytes_in,
          bytes_out = rollup_hour.bytes_out + excluded.bytes_out,
          flows = rollup_hour.flows + excluded.flows
      `);

      for (const increment of increments) {
        minute.run(
          Math.floor(increment.ts / 60_000) * 60_000,
          increment.scope,
          increment.key,
          increment.bytesIn,
          increment.bytesOut,
          increment.flows ?? 0,
        );
        hour.run(
          Math.floor(increment.ts / 3_600_000) * 3_600_000,
          increment.scope,
          increment.key,
          increment.bytesIn,
          increment.bytesOut,
          increment.flows ?? 0,
        );
      }
    });
    transaction(batch);
  }

  getOverview(now: number = this.now()): OverviewData {
    const start = localMidnight(now);
    const totals = this.db
      .prepare(
        `SELECT SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out
         FROM rollup_minute WHERE bucket >= ? AND scope = 'wan' AND key = ''`,
      )
      .get(start) as TotalsRow;
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM devices').get() as CountRow;
    const deviceRows = this.db
      .prepare(
        `SELECT r.key, SUM(r.bytes_in) AS bytes_in, SUM(r.bytes_out) AS bytes_out,
                SUM(r.bytes_in + r.bytes_out) AS bytes
         FROM rollup_minute r
         WHERE r.bucket >= ? AND r.scope = 'device'
         GROUP BY r.key ORDER BY bytes DESC, r.key LIMIT 8`,
      )
      .all(start) as UsageRow[];
    const topDevices = deviceRows.map((row) => ({
      deviceId: row.key,
      name: this.getDeviceById(row.key)?.name ?? 'Unknown device',
      bytes: row.bytes,
    }));
    const destinationRows = this.db
      .prepare(
        `SELECT key, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                SUM(bytes_in + bytes_out) AS bytes
         FROM rollup_minute
         WHERE bucket >= ? AND scope = 'host'
         GROUP BY key ORDER BY bytes DESC, key LIMIT 8`,
      )
      .all(start) as UsageRow[];
    const policyRows = this.db
      .prepare(
        `SELECT key, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                SUM(bytes_in + bytes_out) AS bytes
         FROM rollup_minute
         WHERE bucket >= ? AND scope = 'policy'
         GROUP BY key ORDER BY bytes DESC, key LIMIT 8`,
      )
      .all(start) as UsageRow[];

    return {
      today: { in: totals.bytes_in ?? 0, out: totals.bytes_out ?? 0 },
      totalDevices: count.count,
      topDevices,
      topDestinations: destinationRows.map((row) => ({ host: row.key, bytes: row.bytes })),
      policySplit: policyRows.map((row) => ({ policy: row.key, bytes: row.bytes })),
    };
  }

  getTodayTotals(now: number = this.now()): { in: number; out: number } {
    return this.getOverview(now).today;
  }

  listDevices(now: number = this.now()): DeviceWithUsage[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, mac, vendor, icon_id, managed, first_seen_at, last_seen_at FROM devices ORDER BY name, id',
      )
      .all() as DeviceRow[];
    const start = localMidnight(now);
    const usageRows = this.db
      .prepare(
        `SELECT key, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                SUM(bytes_in + bytes_out) AS bytes
         FROM rollup_minute WHERE bucket >= ? AND scope = 'device' GROUP BY key`,
      )
      .all(start) as UsageRow[];
    const usage = new Map(usageRows.map((row) => [row.key, row]));
    const ipRows = this.db
      .prepare('SELECT ip, device_id FROM device_ips ORDER BY updated_at DESC, ip')
      .all() as Array<{ ip: string; device_id: string }>;
    const ips = new Map<string, string[]>();
    for (const row of ipRows) {
      const values = ips.get(row.device_id) ?? [];
      values.push(row.ip);
      ips.set(row.device_id, values);
    }
    return rows.map((row) => {
      const device = deviceFromRow(row);
      const totals = usage.get(device.id);
      return {
        ...device,
        ips: ips.get(device.id) ?? [],
        todayIn: totals?.bytes_in ?? 0,
        todayOut: totals?.bytes_out ?? 0,
      };
    });
  }

  getDeviceWithUsage(id: string, now: number = this.now()): DeviceWithUsage | undefined {
    return this.listDevices(now).find((device) => device.id === id);
  }

  listDeviceDtos(
    rates: ReadonlyMap<string, { rateIn: number; rateOut: number }>,
    now: number = this.now(),
  ): DeviceDto[] {
    return this.listDevices(now).map((device) => {
      const rate = rates.get(device.id);
      return {
        id: device.id,
        name: device.name,
        ...(device.mac === undefined ? {} : { mac: device.mac }),
        ...(device.vendor === undefined ? {} : { vendor: device.vendor }),
        ips: device.ips,
        ...(device.iconId === undefined ? {} : { iconId: device.iconId }),
        ...(device.managed === undefined ? {} : { managed: device.managed }),
        online: device.lastSeenAt >= now - 120_000,
        firstSeenAt: device.firstSeenAt,
        lastSeenAt: device.lastSeenAt,
        rateIn: rate?.rateIn ?? 0,
        rateOut: rate?.rateOut ?? 0,
        todayIn: device.todayIn,
        todayOut: device.todayOut,
      };
    });
  }

  getDestinations(now: number = this.now()): DestinationsDto {
    const countryRows = this.listTodayDestinationUsage('country', now);
    const hostRows = this.listTodayDestinationUsage('host', now).slice(0, 30);
    const hostKeys = new Set(hostRows.map((row) => row.key));
    const hostStats = new Map<
      string,
      { devices: Set<string>; countries: Map<string, number> }
    >();
    const flowRows = this.db
      .prepare(
        `SELECT host, device_id, country, bytes_in + bytes_out AS bytes
         FROM flows WHERE ts >= ? AND host IS NOT NULL`,
      )
      .all(localMidnight(now)) as HostFlowRow[];
    for (const row of flowRows) {
      const host = registrableHost(row.host);
      if (!hostKeys.has(host)) continue;
      const stats = hostStats.get(host) ?? { devices: new Set<string>(), countries: new Map<string, number>() };
      stats.devices.add(row.device_id);
      if (row.country !== null) {
        stats.countries.set(row.country, (stats.countries.get(row.country) ?? 0) + row.bytes);
      }
      hostStats.set(host, stats);
    }

    const countries: DestinationCountry[] = countryRows.map((row) => ({
      code: row.key,
      bytesIn: row.bytes_in,
      bytesOut: row.bytes_out,
      flows: row.flows,
    }));
    const hosts: DestinationHost[] = hostRows.map((row) => {
      const stats = hostStats.get(row.key);
      const country =
        stats === undefined
          ? undefined
          : [...stats.countries.entries()].sort(
              (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
            )[0]?.[0];
      return {
        host: row.key,
        ...(country === undefined ? {} : { country }),
        bytes: row.bytes,
        flows: row.flows,
        devices: stats?.devices.size ?? 0,
      };
    });
    return { countries, hosts };
  }

  getCountryDevices(code: string, now: number = this.now()): CountryDeviceShare[] {
    const rows = this.db
      .prepare(
        `SELECT f.device_id, d.name AS device_name, SUM(f.bytes_in + f.bytes_out) AS bytes,
                COUNT(*) AS flows
         FROM flows f JOIN devices d ON d.id = f.device_id
         WHERE f.ts >= ? AND f.country = ?
         GROUP BY f.device_id, d.name
         ORDER BY bytes DESC, f.device_id`,
      )
      .all(localMidnight(now), code) as CountryDeviceRow[];
    return rows.map((row) => ({
      deviceId: row.device_id,
      deviceName: row.device_name,
      bytes: row.bytes,
      flows: row.flows,
    }));
  }

  private listTodayDestinationUsage(
    scope: 'country' | 'host',
    now: number,
  ): DestinationUsageRow[] {
    const start = localMidnight(now);
    const hourMs = 3_600_000;
    const firstFullHour = Math.ceil(start / hourMs) * hourMs;
    const currentHour = Math.floor(now / hourMs) * hourMs;
    if (firstFullHour > currentHour) {
      return this.db
        .prepare(
          `SELECT key, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                  SUM(bytes_in + bytes_out) AS bytes, SUM(flows) AS flows
           FROM rollup_minute WHERE bucket >= ? AND scope = ?
           GROUP BY key ORDER BY bytes DESC, key`,
        )
        .all(start, scope) as DestinationUsageRow[];
    }
    return this.db
      .prepare(
        `SELECT key, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                SUM(bytes_in + bytes_out) AS bytes, SUM(flows) AS flows
         FROM (
           SELECT key, bytes_in, bytes_out, flows FROM rollup_minute
           WHERE bucket >= ? AND bucket < ? AND scope = ?
           UNION ALL
           SELECT key, bytes_in, bytes_out, flows FROM rollup_hour
           WHERE bucket >= ? AND bucket < ? AND scope = ?
           UNION ALL
           SELECT key, bytes_in, bytes_out, flows FROM rollup_minute
           WHERE bucket >= ? AND scope = ?
         )
         GROUP BY key ORDER BY bytes DESC, key`,
      )
      .all(
        start,
        firstFullHour,
        scope,
        firstFullHour,
        currentHour,
        scope,
        currentHour,
        scope,
      ) as DestinationUsageRow[];
  }

  listFlows(query: FlowsQuery & { country?: string } = {}): FlowsPage {
    const limit = Math.min(200, Math.max(1, Math.floor(query.limit ?? 50)));
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (query.deviceId) {
      clauses.push('f.device_id = ?');
      params.push(query.deviceId);
    }
    if (query.search) {
      clauses.push('(f.host LIKE ? OR f.ip LIKE ? OR f.process LIKE ?)');
      const search = `%${query.search}%`;
      params.push(search, search, search);
    }
    if (query.policy) {
      clauses.push('f.policy = ?');
      params.push(query.policy);
    }
    if (query.state) {
      clauses.push('f.state = ?');
      params.push(query.state);
    }
    if (query.country) {
      clauses.push('f.country = ?');
      params.push(query.country);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (cursor === undefined) throw new Error('Invalid cursor');
      clauses.push('(f.ts < ? OR (f.ts = ? AND f.id < ?))');
      params.push(cursor.ts, cursor.ts, cursor.id);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db
      .prepare(
        `SELECT f.id, f.ts, f.device_id, d.name AS device_name, f.host, f.ip, f.port, f.proto,
                f.bytes_in, f.bytes_out, f.state, f.policy, f.policy_chain_json, f.rule,
                f.process, f.country, f.started_at, f.ended_at
         FROM flows f JOIN devices d ON d.id = f.device_id
         ${where}
         ORDER BY f.ts DESC, f.id DESC LIMIT ?`,
      )
      .all(...params, limit + 1) as FlowRow[];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const flows = visible.map(flowFromRow);
    const last = visible.at(-1);
    return {
      flows,
      ...(hasMore && last !== undefined ? { nextCursor: encodeCursor(last.ts, last.id) } : {}),
    };
  }

  timeseries(scope: 'wan' | `device:${string}`, minutes: number, now: number = this.now()): TimeseriesPoint[] {
    const resolution = minutes <= 2_880 ? 60_000 : 3_600_000;
    const points = resolution === 60_000 ? minutes : Math.ceil(minutes / 60);
    const end = Math.floor(now / resolution) * resolution;
    const start = end - (points - 1) * resolution;
    const table = resolution === 60_000 ? 'rollup_minute' : 'rollup_hour';
    const [scopeName, key] = scope === 'wan' ? ['wan', ''] : ['device', scope.slice(7)];
    const rows = this.db
      .prepare(
        `SELECT bucket, bytes_in, bytes_out FROM ${table}
         WHERE bucket >= ? AND bucket <= ? AND scope = ? AND key = ? ORDER BY bucket`,
      )
      .all(start, end, scopeName, key) as BucketRow[];
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    const seconds = resolution / 1_000;
    return Array.from({ length: points }, (_, index) => {
      const ts = start + index * resolution;
      const row = byBucket.get(ts);
      return { ts, in: (row?.bytes_in ?? 0) / seconds, out: (row?.bytes_out ?? 0) / seconds };
    });
  }

  appendDnsLog(entry: Omit<DnsLogEntry, 'deviceName'>): DnsLogEntry {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO dns_log (id, ts, device_id, qname, answers_json, rtt_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.ts,
        entry.deviceId ?? null,
        entry.qname,
        JSON.stringify(entry.answers),
        entry.rttMs ?? null,
      );
    const deviceName =
      entry.deviceId === undefined ? undefined : this.getDeviceById(entry.deviceId)?.name;
    return {
      ...entry,
      ...(deviceName === undefined ? {} : { deviceName }),
    };
  }

  listDnsLog(query: LogsQuery = {}): DnsLogPage {
    const limit = Math.min(200, Math.max(1, Math.floor(query.limit ?? 50)));
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (query.search) {
      clauses.push('l.qname LIKE ?');
      params.push(`%${query.search}%`);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (cursor === undefined) throw new Error('Invalid cursor');
      clauses.push('(l.ts < ? OR (l.ts = ? AND l.id < ?))');
      params.push(cursor.ts, cursor.ts, cursor.id);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db
      .prepare(
        `SELECT l.id, l.ts, l.device_id, d.name AS device_name, l.qname, l.answers_json, l.rtt_ms
         FROM dns_log l LEFT JOIN devices d ON d.id = l.device_id
         ${where}
         ORDER BY l.ts DESC, l.id DESC LIMIT ?`,
      )
      .all(...params, limit + 1) as DnsLogRow[];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const entries = visible.map(dnsLogFromRow);
    const last = visible.at(-1);
    return {
      entries,
      ...(hasMore && last !== undefined ? { nextCursor: encodeCursor(last.ts, last.id) } : {}),
    };
  }

  appendSystemLog(entry: SystemLogEntry): SystemLogEntry {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO system_log (id, ts, level, scope, message) VALUES (?, ?, ?, ?, ?)',
      )
      .run(entry.id, entry.ts, entry.level, entry.scope, entry.message);
    return entry;
  }

  listSystemLog(query: LogsQuery = {}): SystemLogPage {
    const limit = Math.min(200, Math.max(1, Math.floor(query.limit ?? 50)));
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (query.level) {
      clauses.push('l.level = ?');
      params.push(query.level);
    }
    if (query.search) {
      clauses.push('(l.message LIKE ? OR l.scope LIKE ?)');
      const search = `%${query.search}%`;
      params.push(search, search);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (cursor === undefined) throw new Error('Invalid cursor');
      clauses.push('(l.ts < ? OR (l.ts = ? AND l.id < ?))');
      params.push(cursor.ts, cursor.ts, cursor.id);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db
      .prepare(
        `SELECT l.id, l.ts, l.level, l.scope, l.message
         FROM system_log l ${where}
         ORDER BY l.ts DESC, l.id DESC LIMIT ?`,
      )
      .all(...params, limit + 1) as SystemLogRow[];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const entries = visible.map(systemLogFromRow);
    const last = visible.at(-1);
    return {
      entries,
      ...(hasMore && last !== undefined ? { nextCursor: encodeCursor(last.ts, last.id) } : {}),
    };
  }

  insertEvent(event: EventDto): EventDto {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO events (id, ts, kind, message, device_id, source_id) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        event.id,
        event.ts,
        event.kind,
        event.message,
        event.deviceId ?? null,
        event.sourceId ?? null,
      );
    return event;
  }

  latestEvents(limit = 20): EventDto[] {
    const rows = this.db
      .prepare(
        'SELECT id, ts, kind, message, device_id, source_id FROM events ORDER BY ts DESC, id DESC LIMIT ?',
      )
      .all(Math.max(0, Math.floor(limit))) as EventRow[];
    return rows.map(eventFromRow);
  }

  sweepRetention(now: number = this.now()): {
    flows: number;
    rollupMinute: number;
    rollupHour: number;
    events: number;
    dnsLog: number;
    systemLog: number;
  } {
    const transaction = this.db.transaction(() => ({
      flows: this.db.prepare('DELETE FROM flows WHERE ts < ?').run(now - FLOWS_RETENTION_MS).changes,
      rollupMinute: this.db
        .prepare('DELETE FROM rollup_minute WHERE bucket < ?')
        .run(now - ROLLUP_MINUTE_RETENTION_MS).changes,
      rollupHour: this.db
        .prepare('DELETE FROM rollup_hour WHERE bucket < ?')
        .run(now - ROLLUP_HOUR_RETENTION_MS).changes,
      events: this.db.prepare('DELETE FROM events WHERE ts < ?').run(now - EVENTS_RETENTION_MS).changes,
      dnsLog: this.db.prepare('DELETE FROM dns_log WHERE ts < ?').run(now - DNS_LOG_RETENTION_MS).changes,
      systemLog: this.db
        .prepare('DELETE FROM system_log WHERE ts < ?')
        .run(now - SYSTEM_LOG_RETENTION_MS).changes,
    }));
    return transaction();
  }
}
