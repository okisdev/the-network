import type BetterSqlite3 from 'better-sqlite3';
import type {
  BreakdownDim,
  BreakdownDto,
  BreakdownRow,
  CityPoint,
  CountryDeviceShare,
  DailyPoint,
  DestinationCountry,
  DestinationHost,
  DestinationsDto,
  DeviceDto,
  DeviceHint,
  DnsLogEntry,
  DnsLogPage,
  DnsSummaryDto,
  EventDto,
  FlowDto,
  FlowsPage,
  FlowsQuery,
  FlowState,
  FirstSeenDto,
  HostDetailDto,
  LogsQuery,
  MoversDto,
  MultiSeriesDto,
  PresenceInterval,
  PunchcardDto,
  RejectedSummaryDto,
  SankeyDto,
  SystemLogEntry,
  SystemLogPage,
  TimeseriesPoint,
  TimeseriesScope,
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
  policyGroup?: string;
  rule?: string;
  process?: string;
  processPath?: string;
  proxied?: boolean;
  connectMs?: number;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
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
  rejectedToday: { flows: number; bytes: number };
  dnsToday: number;
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
  policy_group: string | null;
  rule: string | null;
  process: string | null;
  process_path: string | null;
  proxied: number | null;
  connect_ms: number | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
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
  server: string | null;
  source: DnsLogEntry['source'] | null;
}

interface PresenceRow {
  started_at: number;
  ended_at: number | null;
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

interface RollupBucketRow extends BucketRow {
  key: string;
}

interface BreakdownSqlRow {
  key: string | number | null;
  label?: string | null;
  bytes_in: number;
  bytes_out: number;
  flows: number;
  devices: number;
}

interface CitySqlRow {
  city: string;
  country: string;
  lat: number;
  lon: number;
  bytes: number;
  flows: number;
}

interface DnsBucketRow {
  bucket: number;
  count: number;
}

interface DnsAnswerRow {
  answers_json: string;
  rtt_ms: number | null;
}

interface DomainSqlRow {
  host: string;
  device_id: string;
  bytes_in: number;
  bytes_out: number;
  flows: number;
  first_ts: number;
}

interface SankeySqlRow {
  device_id: string;
  device_name: string | null;
  policy: string | null;
  country: string | null;
  bytes: number;
}

interface MoverSqlRow {
  key: string;
  label: string | null;
  current: number;
  previous: number;
}

interface RejectedBucketRow {
  bucket: number;
  flows: number;
}

interface RejectedTotalRow {
  flows: number;
  bytes: number | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function rollupWindow(minutes: number, now: number): {
  resolution: number;
  points: number;
  start: number;
  end: number;
  table: 'rollup_minute' | 'rollup_hour';
} {
  const resolution = minutes <= 2_880 ? MINUTE_MS : HOUR_MS;
  const points = resolution === MINUTE_MS ? minutes : Math.ceil(minutes / 60);
  const end = Math.floor(now / resolution) * resolution;
  return {
    resolution,
    points,
    start: end - (points - 1) * resolution,
    end,
    table: resolution === MINUTE_MS ? 'rollup_minute' : 'rollup_hour',
  };
}

function retainedFlowWindow(minutes: number, now: number): {
  from: number;
  to: number;
  clamped: boolean;
} {
  const requestedFrom = now - minutes * MINUTE_MS;
  const horizon = now - FLOWS_RETENTION_MS;
  return { from: Math.max(requestedFrom, horizon), to: now, clamped: requestedFrom < horizon };
}

function localDayKey(ts: number): string {
  const date = new Date(ts);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftedLocalMidnight(now: number, days: number): number {
  const date = new Date(localMidnight(now));
  date.setDate(date.getDate() + days);
  return date.getTime();
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
    ...(row.policy_group === null ? {} : { policyGroup: row.policy_group }),
    ...(row.rule === null ? {} : { rule: row.rule }),
    ...(row.process === null ? {} : { process: row.process }),
    ...(row.process_path === null ? {} : { processPath: row.process_path }),
    ...(row.proxied ? { proxied: true } : {}),
    ...(row.connect_ms === null ? {} : { connectMs: row.connect_ms }),
    ...(row.city === null ? {} : { city: row.city }),
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
    ...(row.server === null ? {} : { server: row.server }),
    ...(row.source === null ? {} : { source: row.source }),
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
    CREATE TABLE IF NOT EXISTS presence_log (
      device_id TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      PRIMARY KEY (device_id, started_at)
    );
    CREATE INDEX IF NOT EXISTS presence_log_open_idx ON presence_log (device_id, ended_at);
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
  const flowColumns = new Set(
    (db.prepare('PRAGMA table_info(flows)').all() as Array<{ name: string }>).map((column) => column.name),
  );
  const flowColumnMigrations = [
    ['country', 'TEXT'],
    ['policy_group', 'TEXT'],
    ['process_path', 'TEXT'],
    ['proxied', 'INTEGER'],
    ['connect_ms', 'INTEGER'],
    ['city', 'TEXT'],
    ['lat', 'REAL'],
    ['lon', 'REAL'],
  ] as const;
  for (const [name, type] of flowColumnMigrations) {
    if (!flowColumns.has(name)) db.exec(`ALTER TABLE flows ADD COLUMN ${name} ${type}`);
  }

  const dnsColumns = new Set(
    (db.prepare('PRAGMA table_info(dns_log)').all() as Array<{ name: string }>).map((column) => column.name),
  );
  for (const name of ['server', 'source'] as const) {
    if (!dnsColumns.has(name)) db.exec(`ALTER TABLE dns_log ADD COLUMN ${name} TEXT`);
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

  onlineDeviceIds(now: number = this.now()): Set<string> {
    const rows = this.db
      .prepare('SELECT id FROM devices WHERE last_seen_at >= ?')
      .all(now - 120_000) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  openPresence(deviceId: string, ts: number): void {
    this.db
      .prepare(
        `INSERT INTO presence_log (device_id, started_at, ended_at)
         SELECT ?, ?, NULL
         WHERE NOT EXISTS (
           SELECT 1 FROM presence_log WHERE device_id = ? AND ended_at IS NULL
         )
         ON CONFLICT (device_id, started_at) DO NOTHING`,
      )
      .run(deviceId, ts, deviceId);
  }

  closePresence(deviceId: string, ts: number): void {
    this.db
      .prepare('UPDATE presence_log SET ended_at = ? WHERE device_id = ? AND ended_at IS NULL')
      .run(ts, deviceId);
  }

  listPresence(deviceId: string, from: number, to: number): PresenceInterval[] {
    const rows = this.db
      .prepare(
        `SELECT started_at, ended_at FROM presence_log
         WHERE device_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)
         ORDER BY started_at`,
      )
      .all(deviceId, to, from) as PresenceRow[];
    return rows.map((row) => ({
      start: row.started_at,
      ...(row.ended_at === null ? {} : { end: row.ended_at }),
    }));
  }

  closeStalePresence(now: number = this.now()): void {
    this.db
      .prepare(
        `UPDATE presence_log
         SET ended_at = (
           SELECT last_seen_at FROM devices WHERE devices.id = presence_log.device_id
         )
         WHERE ended_at IS NULL AND EXISTS (
           SELECT 1 FROM devices
           WHERE devices.id = presence_log.device_id AND devices.last_seen_at < ?
         )`,
      )
      .run(now - 120_000);
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
          state, policy, policy_chain_json, policy_group, rule, process, process_path,
          proxied, connect_ms, country, city, lat, lon, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          policy_group = excluded.policy_group,
          rule = excluded.rule,
          process = excluded.process,
          process_path = excluded.process_path,
          proxied = excluded.proxied,
          connect_ms = excluded.connect_ms,
          country = excluded.country,
          city = excluded.city,
          lat = excluded.lat,
          lon = excluded.lon,
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
          flow.policyGroup ?? null,
          flow.rule ?? null,
          flow.process ?? null,
          flow.processPath ?? null,
          flow.proxied === undefined ? null : flow.proxied ? 1 : 0,
          flow.connectMs ?? null,
          flow.country ?? null,
          flow.city ?? null,
          flow.lat ?? null,
          flow.lon ?? null,
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
    const today = this.getTodayTotals(now);
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM devices').get() as CountRow;
    const rejected = this.db
      .prepare(
        `SELECT COUNT(*) AS flows, SUM(bytes_in + bytes_out) AS bytes
         FROM flows
         WHERE ts >= ? AND ts <= ? AND (state = 'failed' OR upper(policy) LIKE 'REJECT%')`,
      )
      .get(start, now) as RejectedTotalRow;
    const dns = this.db
      .prepare('SELECT COUNT(*) AS count FROM dns_log WHERE ts >= ? AND ts <= ?')
      .get(start, now) as CountRow;
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
      today,
      totalDevices: count.count,
      rejectedToday: { flows: rejected.flows, bytes: rejected.bytes ?? 0 },
      dnsToday: dns.count,
      topDevices,
      topDestinations: destinationRows.map((row) => ({ host: row.key, bytes: row.bytes })),
      policySplit: policyRows.map((row) => ({ policy: row.key, bytes: row.bytes })),
    };
  }

  getTodayTotals(now: number = this.now()): { in: number; out: number } {
    const totals = this.db
      .prepare(
        `SELECT SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out
         FROM rollup_minute WHERE bucket >= ? AND scope = 'wan' AND key = ''`,
      )
      .get(localMidnight(now)) as TotalsRow;
    return { in: totals.bytes_in ?? 0, out: totals.bytes_out ?? 0 };
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

  listFlows(query: FlowsQuery = {}): FlowsPage {
    return this.listFlowPage(query);
  }

  private listFlowPage(query: FlowsQuery & { host?: string }): FlowsPage {
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
    if (query.proto) {
      clauses.push('f.proto = ?');
      params.push(query.proto);
    }
    if (query.port !== undefined) {
      clauses.push('f.port = ?');
      params.push(query.port);
    }
    if (query.process !== undefined) {
      clauses.push('f.process = ?');
      params.push(query.process);
    }
    if (query.from !== undefined) {
      clauses.push('f.ts >= ?');
      params.push(query.from);
    }
    if (query.to !== undefined) {
      clauses.push('f.ts <= ?');
      params.push(query.to);
    }
    if (query.host !== undefined) {
      clauses.push("(f.host = ? OR f.host LIKE '%.' || ?)");
      params.push(query.host, query.host);
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
                f.process, f.country, f.started_at, f.ended_at, f.policy_group, f.process_path,
                f.proxied, f.connect_ms, f.city, f.lat, f.lon
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

  deviceRollupBreakdown(
    deviceId: string,
    dimension: 'host' | 'country',
    minutes: number,
    limit: number,
    now: number = this.now(),
  ): BreakdownRow[] {
    const { start, end, table } = rollupWindow(minutes, now);
    const scope = dimension === 'host' ? 'device_host' : 'device_country';
    const rows = this.db
      .prepare(
        `SELECT substr(key, length(?) + 2) AS key, SUM(bytes_in) AS bytes_in,
                SUM(bytes_out) AS bytes_out, SUM(flows) AS flows
         FROM ${table}
         WHERE bucket >= ? AND bucket <= ? AND scope = ?
           AND substr(key, 1, length(?) + 1) = ? || '|'
         GROUP BY key
         ORDER BY bytes_in + bytes_out DESC, key
         LIMIT ?`,
      )
      .all(deviceId, start, end, scope, deviceId, deviceId, limit) as BreakdownSqlRow[];
    return rows.map((row) => ({
      key: String(row.key),
      bytesIn: row.bytes_in,
      bytesOut: row.bytes_out,
      flows: row.flows,
    }));
  }

  devicePolicySplit(
    deviceId: string,
    minutes: number,
    limit: number,
    now: number = this.now(),
  ): Array<{ policy: string; bytes: number }> {
    const window = retainedFlowWindow(minutes, now);
    return this.flowBreakdownRows('policy', window, limit, {
      deviceId,
      omitNull: true,
    }).map((row) => ({ policy: row.key, bytes: row.bytesIn + row.bytesOut }));
  }

  listCities(minutes: number, now: number = this.now()): CityPoint[] {
    const window = retainedFlowWindow(minutes, now);
    const rows = this.db
      .prepare(
        `SELECT f.city, f.country, AVG(f.lat) AS lat, AVG(f.lon) AS lon,
                SUM(f.bytes_in + f.bytes_out) AS bytes, COUNT(*) AS flows
         FROM flows f
         WHERE f.ts >= ? AND f.ts <= ? AND f.city IS NOT NULL
           AND f.country IS NOT NULL AND trim(f.country) <> ''
           AND f.lat IS NOT NULL AND f.lon IS NOT NULL
         GROUP BY f.city, f.country
         ORDER BY bytes DESC, f.city, f.country
         LIMIT 60`,
      )
      .all(window.from, window.to) as CitySqlRow[];
    return rows.map((row) => ({
      city: row.city,
      country: row.country,
      lat: row.lat,
      lon: row.lon,
      bytes: row.bytes,
      flows: row.flows,
    }));
  }

  hostDetail(host: string, minutes: number, now: number = this.now()): HostDetailDto {
    const window = retainedFlowWindow(minutes, now);
    const filters = { host };
    const country = this.flowBreakdownRows('country', window, 1, {
      ...filters,
      omitNull: true,
    })[0]?.key;
    return {
      host,
      ...(country === undefined ? {} : { country }),
      series: this.timeseries(`host:${host}`, minutes, now),
      devices: this.flowBreakdownRows('device', window, 8, filters),
      processes: this.flowBreakdownRows('process', window, 8, filters),
      ports: this.flowBreakdownRows('port', window, 8, filters),
      recentFlows: this.listFlowPage({ host, limit: 15 }).flows,
    };
  }

  dnsSummary(minutes: number, now: number = this.now()): DnsSummaryDto {
    const retainedMinutes = DNS_LOG_RETENTION_MS / MINUTE_MS;
    const { resolution, points, start } = rollupWindow(Math.min(minutes, retainedMinutes), now);
    const bucketRows = this.db
      .prepare(
        `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket, COUNT(*) AS count
         FROM dns_log WHERE ts >= ? AND ts <= ?
         GROUP BY bucket ORDER BY bucket`,
      )
      .all(resolution, resolution, start, now) as DnsBucketRow[];
    const counts = new Map(bucketRows.map((row) => [row.bucket, row.count]));
    const series = Array.from({ length: points }, (_, index) => {
      const ts = start + index * resolution;
      return { ts, count: counts.get(ts) ?? 0 };
    });
    const topDomains = this.db
      .prepare(
        `SELECT qname, COUNT(*) AS count FROM dns_log
         WHERE ts >= ? AND ts <= ?
         GROUP BY qname ORDER BY count DESC, qname LIMIT 10`,
      )
      .all(start, now) as DnsSummaryDto['topDomains'];
    const answerRows = this.db
      .prepare('SELECT answers_json, rtt_ms FROM dns_log WHERE ts >= ? AND ts <= ?')
      .all(start, now) as DnsAnswerRow[];
    const rttBuckets: DnsSummaryDto['rttBuckets'] = [
      { label: '<10ms', count: 0 },
      { label: '10-50ms', count: 0 },
      { label: '50-100ms', count: 0 },
      { label: '100-300ms', count: 0 },
      { label: '300ms+', count: 0 },
    ];
    let answered = 0;
    for (const row of answerRows) {
      try {
        const answers: unknown = JSON.parse(row.answers_json);
        if (Array.isArray(answers) && answers.length > 0) answered += 1;
      } catch {}
      if (row.rtt_ms === null) continue;
      const index = row.rtt_ms < 10 ? 0 : row.rtt_ms < 50 ? 1 : row.rtt_ms < 100 ? 2 : row.rtt_ms < 300 ? 3 : 4;
      rttBuckets[index]!.count += 1;
    }
    const resolvers = this.db
      .prepare(
        `SELECT server, COUNT(*) AS count FROM dns_log
         WHERE ts >= ? AND ts <= ? AND server IS NOT NULL AND trim(server) <> ''
         GROUP BY server ORDER BY count DESC, server LIMIT 6`,
      )
      .all(start, now) as DnsSummaryDto['resolvers'];
    return {
      series,
      topDomains,
      rttBuckets,
      answered,
      unanswered: answerRows.length - answered,
      resolvers,
    };
  }

  timeseries(scope: TimeseriesScope, minutes: number, now: number = this.now()): TimeseriesPoint[] {
    const { resolution, points, start, end, table } = rollupWindow(minutes, now);
    const separator = scope.indexOf(':');
    const [scopeName, key] =
      separator === -1 ? [scope, ''] : [scope.slice(0, separator), scope.slice(separator + 1)];
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

  multiTimeseries(
    scope: 'device' | 'policy',
    minutes: number,
    limit: number,
    now: number = this.now(),
  ): MultiSeriesDto[] {
    const { resolution, points, start, end, table } = rollupWindow(minutes, now);
    const rows = this.db
      .prepare(
        `SELECT bucket, key, bytes_in, bytes_out FROM ${table}
         WHERE bucket >= ? AND bucket <= ? AND scope = ?
         ORDER BY bucket, key`,
      )
      .all(start, end, scope) as RollupBucketRow[];
    const totals = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.key, (totals.get(row.key) ?? 0) + row.bytes_in + row.bytes_out);
    }
    const keys = [...totals]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key);
    const selected = keys.slice(0, limit);
    const selectedSet = new Set(selected);
    const byKey = new Map<string, Map<number, BucketRow>>();
    const otherByBucket = new Map<number, BucketRow>();
    for (const row of rows) {
      if (selectedSet.has(row.key)) {
        const buckets = byKey.get(row.key) ?? new Map<number, BucketRow>();
        buckets.set(row.bucket, row);
        byKey.set(row.key, buckets);
      } else {
        const bucket = otherByBucket.get(row.bucket) ?? {
          bucket: row.bucket,
          bytes_in: 0,
          bytes_out: 0,
        };
        bucket.bytes_in += row.bytes_in;
        bucket.bytes_out += row.bytes_out;
        otherByBucket.set(row.bucket, bucket);
      }
    }
    const seconds = resolution / 1_000;
    const pointsFor = (buckets: ReadonlyMap<number, BucketRow>): TimeseriesPoint[] =>
      Array.from({ length: points }, (_, index) => {
        const ts = start + index * resolution;
        const row = buckets.get(ts);
        return { ts, in: (row?.bytes_in ?? 0) / seconds, out: (row?.bytes_out ?? 0) / seconds };
      });
    const series = selected.map((key) => ({
      key,
      label: scope === 'device' ? (this.getDeviceById(key)?.name ?? 'Unknown device') : key,
      points: pointsFor(byKey.get(key) ?? new Map<number, BucketRow>()),
    }));
    if (keys.length > limit) {
      series.push({ key: 'other', label: 'Other', points: pointsFor(otherByBucket) });
    }
    return series;
  }

  breakdown(
    dim: BreakdownDim,
    minutes: number,
    deviceId: string | undefined,
    limit: number,
    now: number = this.now(),
  ): BreakdownDto {
    const window = retainedFlowWindow(minutes, now);
    const deviceClause = deviceId === undefined ? '' : ' AND f.device_id = ?';
    const params: Array<string | number> = [window.from, window.to];
    if (deviceId !== undefined) params.push(deviceId);

    if (dim === 'domain') {
      const rows = this.db
        .prepare(
          `SELECT f.host, f.device_id, SUM(f.bytes_in) AS bytes_in,
                  SUM(f.bytes_out) AS bytes_out, COUNT(*) AS flows, MIN(f.ts) AS first_ts
           FROM flows f
           WHERE f.ts >= ? AND f.ts <= ? AND f.host IS NOT NULL${deviceClause}
           GROUP BY f.host, f.device_id`,
        )
        .all(...params) as DomainSqlRow[];
      const merged = new Map<
        string,
        { bytesIn: number; bytesOut: number; flows: number; devices: Set<string> }
      >();
      for (const row of rows) {
        const key = registrableHost(row.host);
        if (!key) continue;
        const value = merged.get(key) ?? { bytesIn: 0, bytesOut: 0, flows: 0, devices: new Set() };
        value.bytesIn += row.bytes_in;
        value.bytesOut += row.bytes_out;
        value.flows += row.flows;
        value.devices.add(row.device_id);
        merged.set(key, value);
      }
      const output = [...merged].map(([key, value]) => ({
        key,
        bytesIn: value.bytesIn,
        bytesOut: value.bytesOut,
        flows: value.flows,
        devices: value.devices.size,
      }));
      output.sort(
        (a, b) => b.bytesIn + b.bytesOut - (a.bytesIn + a.bytesOut) || a.key.localeCompare(b.key),
      );
      return { window, rows: output.slice(0, limit) };
    }

    return { window, rows: this.flowBreakdownRows(dim, window, limit, { deviceId }) };
  }

  private flowBreakdownRows(
    dim: Exclude<BreakdownDim, 'domain'> | 'device',
    window: { from: number; to: number },
    limit: number,
    filters: { deviceId?: string; host?: string; omitNull?: boolean } = {},
  ): BreakdownRow[] {
    const rawColumns: Record<Exclude<BreakdownDim, 'domain'> | 'device', string> = {
      device: 'f.device_id',
      process: 'f.process',
      port: 'f.port',
      proto: 'f.proto',
      rule: 'f.rule',
      policy: 'f.policy',
      country: 'f.country',
      host: 'f.host',
    };
    const rawColumn = rawColumns[dim];
    const canBeUnknown = dim === 'policy' || dim === 'country';
    const column = canBeUnknown && !filters.omitNull ? `COALESCE(${rawColumn}, 'unknown')` : rawColumn;
    const deviceLabel = dim === 'device' ? ', d.name AS label' : '';
    const deviceJoin = dim === 'device' ? 'LEFT JOIN devices d ON d.id = f.device_id' : '';
    const deviceGroup = dim === 'device' ? ', d.name' : '';
    const clauses = ['f.ts >= ?', 'f.ts <= ?'];
    const params: Array<string | number> = [window.from, window.to];
    if (filters.deviceId !== undefined) {
      clauses.push('f.device_id = ?');
      params.push(filters.deviceId);
    }
    if (filters.host !== undefined) {
      clauses.push("(f.host = ? OR f.host LIKE '%.' || ?)");
      params.push(filters.host, filters.host);
    }
    if (filters.omitNull) {
      clauses.push(`${rawColumn} IS NOT NULL`, `trim(CAST(${rawColumn} AS TEXT)) <> ''`);
    } else if (!canBeUnknown) {
      clauses.push(`${rawColumn} IS NOT NULL`);
      if (dim === 'process') clauses.push("trim(f.process) <> ''");
    }
    const rows = this.db
      .prepare(
        `SELECT ${column} AS key${deviceLabel}, SUM(f.bytes_in) AS bytes_in, SUM(f.bytes_out) AS bytes_out,
                COUNT(*) AS flows, COUNT(DISTINCT f.device_id) AS devices
         FROM flows f ${deviceJoin}
         WHERE ${clauses.join(' AND ')}
         GROUP BY ${column}${deviceGroup}
         ORDER BY bytes_in + bytes_out DESC, key
         LIMIT ?`,
      )
      .all(...params, limit) as BreakdownSqlRow[];
    return rows.map((row) => {
      const key = String(row.key);
      return {
        key,
        ...(dim === 'device' ? { label: row.label ?? 'Unknown device' } : {}),
        ...(key === 'unknown' && canBeUnknown ? { label: 'Unknown' } : {}),
        bytesIn: row.bytes_in,
        bytesOut: row.bytes_out,
        flows: row.flows,
        devices: row.devices,
      };
    });
  }

  sankey(minutes: number, limit: number, now: number = this.now()): SankeyDto {
    const window = retainedFlowWindow(minutes, now);
    const rows = this.db
      .prepare(
        `SELECT f.device_id, d.name AS device_name, f.policy, f.country,
                SUM(f.bytes_in + f.bytes_out) AS bytes
         FROM flows f LEFT JOIN devices d ON d.id = f.device_id
         WHERE f.ts >= ? AND f.ts <= ?
         GROUP BY f.device_id, d.name, f.policy, f.country
         HAVING bytes > 0`,
      )
      .all(window.from, window.to) as SankeySqlRow[];
    const unknown = '\u0000unknown';
    const other = '\u0000other';
    const deviceLabels = new Map<string, string>();
    const policyLabels = new Map<string, string>();
    const countryLabels = new Map<string, string>();
    const deviceTotals = new Map<string, number>();
    const policyTotals = new Map<string, number>();
    const countryTotals = new Map<string, number>();
    for (const row of rows) {
      const policy = row.policy ?? unknown;
      const country = row.country ?? unknown;
      deviceLabels.set(row.device_id, row.device_name ?? 'Unknown device');
      policyLabels.set(policy, row.policy ?? 'Unknown');
      countryLabels.set(country, row.country ?? 'Unknown');
      deviceTotals.set(row.device_id, (deviceTotals.get(row.device_id) ?? 0) + row.bytes);
      policyTotals.set(policy, (policyTotals.get(policy) ?? 0) + row.bytes);
      countryTotals.set(country, (countryTotals.get(country) ?? 0) + row.bytes);
    }
    const ranked = (totals: ReadonlyMap<string, number>): string[] =>
      [...totals]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key]) => key);
    const tier = (totals: ReadonlyMap<string, number>): { keys: string[]; visible: Set<string> } => {
      const keys = ranked(totals);
      const visible = new Set(keys.slice(0, limit));
      return { keys: keys.length > limit ? [...keys.slice(0, limit), other] : keys, visible };
    };
    const devices = tier(deviceTotals);
    const policies = tier(policyTotals);
    const countries = tier(countryTotals);
    const nodes: SankeyDto['nodes'] = [];
    const indexes = new Map<string, number>();
    const addTier = (
      kind: SankeyDto['nodes'][number]['kind'],
      keys: string[],
      labels: ReadonlyMap<string, string>,
    ): void => {
      for (const key of keys) {
        const id = key === other ? `${kind}:other` : key === unknown ? `${kind}:unknown` : `${kind}:key:${key}`;
        indexes.set(`${kind}\u0000${key}`, nodes.length);
        nodes.push({ id, label: key === other ? (kind === 'device' ? 'Other devices' : 'Other') : (labels.get(key) ?? key), kind });
      }
    };
    addTier('device', devices.keys, deviceLabels);
    addTier('policy', policies.keys, policyLabels);
    addTier('country', countries.keys, countryLabels);
    const devicePolicy = new Map<string, number>();
    const policyCountry = new Map<string, number>();
    for (const row of rows) {
      const device = devices.visible.has(row.device_id) ? row.device_id : other;
      const rawPolicy = row.policy ?? unknown;
      const policy = policies.visible.has(rawPolicy) ? rawPolicy : other;
      const rawCountry = row.country ?? unknown;
      const country = countries.visible.has(rawCountry) ? rawCountry : other;
      const devicePolicyKey = `${device}\u0001${policy}`;
      const policyCountryKey = `${policy}\u0001${country}`;
      devicePolicy.set(devicePolicyKey, (devicePolicy.get(devicePolicyKey) ?? 0) + row.bytes);
      policyCountry.set(policyCountryKey, (policyCountry.get(policyCountryKey) ?? 0) + row.bytes);
    }
    const links: SankeyDto['links'] = [];
    const addLinks = (
      values: ReadonlyMap<string, number>,
      sourceKind: 'device' | 'policy',
      targetKind: 'policy' | 'country',
    ): void => {
      for (const [key, bytes] of values) {
        if (bytes === 0) continue;
        const [sourceKey, targetKey] = key.split('\u0001');
        if (sourceKey === undefined || targetKey === undefined) continue;
        const source = indexes.get(`${sourceKind}\u0000${sourceKey}`);
        const target = indexes.get(`${targetKind}\u0000${targetKey}`);
        if (source !== undefined && target !== undefined) links.push({ source, target, bytes });
      }
    };
    addLinks(devicePolicy, 'device', 'policy');
    addLinks(policyCountry, 'policy', 'country');
    return { nodes, links };
  }

  punchcard(days: number, now: number = this.now()): PunchcardDto {
    const rows = this.db
      .prepare(
        `SELECT bucket, bytes_in, bytes_out FROM rollup_hour
         WHERE scope = 'wan' AND key = '' AND bucket >= ? AND bucket <= ?`,
      )
      .all(now - days * DAY_MS, now) as BucketRow[];
    const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const row of rows) {
      const date = new Date(row.bucket);
      const weekday = (date.getDay() + 6) % 7;
      const hours = cells[weekday];
      if (hours !== undefined) hours[date.getHours()] = (hours[date.getHours()] ?? 0) + row.bytes_in + row.bytes_out;
    }
    return { days, max: Math.max(0, ...cells.flat()), cells };
  }

  daily(days: number, now: number = this.now()): DailyPoint[] {
    const start = shiftedLocalMidnight(now, -(days - 1));
    const rows = this.db
      .prepare(
        `SELECT bucket, bytes_in, bytes_out FROM rollup_hour
         WHERE scope = 'wan' AND key = '' AND bucket >= ? AND bucket <= ?
         ORDER BY bucket`,
      )
      .all(start, now) as BucketRow[];
    const totals = new Map<string, { in: number; out: number }>();
    for (const row of rows) {
      const day = localDayKey(row.bucket);
      const total = totals.get(day) ?? { in: 0, out: 0 };
      total.in += row.bytes_in;
      total.out += row.bytes_out;
      totals.set(day, total);
    }
    return Array.from({ length: days }, (_, index) => {
      const ts = shiftedLocalMidnight(now, index - (days - 1));
      const day = localDayKey(ts);
      const total = totals.get(day);
      return { day, in: total?.in ?? 0, out: total?.out ?? 0 };
    });
  }

  movers(minutes: number, now: number = this.now()): MoversDto {
    const table = minutes <= 2_880 ? 'rollup_minute' : 'rollup_hour';
    const currentFrom = now - minutes * MINUTE_MS;
    const previousFrom = now - 2 * minutes * MINUTE_MS;
    const query = (scope: 'device' | 'host'): MoverSqlRow[] => {
      const label = scope === 'device' ? 'd.name' : 'r.key';
      const join = scope === 'device' ? 'LEFT JOIN devices d ON d.id = r.key' : '';
      return this.db
        .prepare(
          `SELECT r.key, ${label} AS label,
                  SUM(CASE WHEN r.bucket >= ? THEN r.bytes_in + r.bytes_out ELSE 0 END) AS current,
                  SUM(CASE WHEN r.bucket < ? THEN r.bytes_in + r.bytes_out ELSE 0 END) AS previous
           FROM ${table} r ${join}
           WHERE r.scope = ? AND r.bucket >= ? AND r.bucket <= ?
           GROUP BY r.key, ${label}`,
        )
        .all(currentFrom, currentFrom, scope, previousFrom, now) as MoverSqlRow[];
    };
    const mapRows = (rows: MoverSqlRow[]) =>
      rows
        .filter((row) => row.current + row.previous > 0)
        .sort(
          (a, b) =>
            Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous) ||
            a.key.localeCompare(b.key),
        )
        .slice(0, 8)
        .map((row) => ({
          key: row.key,
          label: row.label ?? 'Unknown device',
          current: row.current,
          previous: row.previous,
        }));
    return { devices: mapRows(query('device')), domains: mapRows(query('host')) };
  }

  firstSeen(days: number, now: number = this.now()): FirstSeenDto {
    const from = now - days * DAY_MS;
    const devices = this.db
      .prepare(
        `SELECT id, name, first_seen_at FROM devices
         WHERE first_seen_at >= ? AND first_seen_at <= ?
         ORDER BY first_seen_at DESC, id LIMIT 20`,
      )
      .all(from, now) as Array<{ id: string; name: string; first_seen_at: number }>;
    const rows = this.db
      .prepare(
        `SELECT host, device_id, SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
                COUNT(*) AS flows, MIN(ts) AS first_ts
         FROM flows
         WHERE host IS NOT NULL AND ts >= ? AND ts <= ?
         GROUP BY host, device_id`,
      )
      .all(now - FLOWS_RETENTION_MS, now) as DomainSqlRow[];
    const merged = new Map<string, { firstTs: number; bytes: number; devices: Set<string> }>();
    for (const row of rows) {
      const domain = registrableHost(row.host);
      if (!domain) continue;
      const value = merged.get(domain) ?? { firstTs: row.first_ts, bytes: 0, devices: new Set() };
      value.firstTs = Math.min(value.firstTs, row.first_ts);
      value.bytes += row.bytes_in + row.bytes_out;
      value.devices.add(row.device_id);
      merged.set(domain, value);
    }
    const domains = [...merged]
      .filter(([, value]) => value.firstTs >= from)
      .map(([domain, value]) => ({
        domain,
        firstTs: value.firstTs,
        bytes: value.bytes,
        devices: value.devices.size,
      }))
      .sort((a, b) => b.firstTs - a.firstTs || a.domain.localeCompare(b.domain))
      .slice(0, 20);
    return {
      devices: devices.map((row) => ({
        deviceId: row.id,
        name: row.name,
        firstSeenAt: row.first_seen_at,
      })),
      domains,
    };
  }

  rejected(minutes: number, now: number = this.now()): RejectedSummaryDto {
    const rollup = rollupWindow(minutes, now);
    const seriesFrom = Math.max(rollup.start, now - FLOWS_RETENTION_MS);
    const rejectedWhere = "(f.state = 'failed' OR upper(f.policy) LIKE 'REJECT%')";
    const bucketRows = this.db
      .prepare(
        `SELECT CAST(f.ts / ? AS INTEGER) * ? AS bucket, COUNT(*) AS flows
         FROM flows f
         WHERE f.ts >= ? AND f.ts <= ? AND ${rejectedWhere}
         GROUP BY bucket ORDER BY bucket`,
      )
      .all(rollup.resolution, rollup.resolution, seriesFrom, now) as RejectedBucketRow[];
    const byBucket = new Map(bucketRows.map((row) => [row.bucket, row.flows]));
    const series = Array.from({ length: rollup.points }, (_, index) => {
      const ts = rollup.start + index * rollup.resolution;
      return { ts, flows: byBucket.get(ts) ?? 0 };
    });
    const window = retainedFlowWindow(minutes, now);
    const topRows = (
      column: 'f.host' | 'f.device_id' | 'f.rule',
      includeDevices: boolean,
      joinDevices: boolean,
    ): BreakdownRow[] => {
      const label = joinDevices ? ', d.name AS label' : '';
      const join = joinDevices ? 'LEFT JOIN devices d ON d.id = f.device_id' : '';
      const devices = includeDevices ? ', COUNT(DISTINCT f.device_id) AS devices' : '';
      const rows = this.db
        .prepare(
          `SELECT ${column} AS key${label}, SUM(f.bytes_in) AS bytes_in,
                  SUM(f.bytes_out) AS bytes_out, COUNT(*) AS flows${devices}
           FROM flows f ${join}
           WHERE f.ts >= ? AND f.ts <= ? AND ${rejectedWhere} AND ${column} IS NOT NULL
           GROUP BY ${column}${joinDevices ? ', d.name' : ''}
           ORDER BY flows DESC, bytes_in + bytes_out DESC, key LIMIT 8`,
        )
        .all(window.from, window.to) as Array<BreakdownSqlRow & { label?: string | null }>;
      return rows.map((row) => ({
        key: String(row.key),
        ...(row.label === undefined || row.label === null ? {} : { label: row.label }),
        bytesIn: row.bytes_in,
        bytesOut: row.bytes_out,
        flows: row.flows,
        ...(includeDevices ? { devices: row.devices } : {}),
      }));
    };
    return {
      series,
      topHosts: topRows('f.host', true, false),
      topDevices: topRows('f.device_id', false, true),
      topRules: topRows('f.rule', false, false),
    };
  }

  appendDnsLog(entry: Omit<DnsLogEntry, 'deviceName'>): DnsLogEntry {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO dns_log
           (id, ts, device_id, qname, answers_json, rtt_ms, server, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.ts,
        entry.deviceId ?? null,
        entry.qname,
        JSON.stringify(entry.answers),
        entry.rttMs ?? null,
        entry.server ?? null,
        entry.source ?? null,
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
        `SELECT l.id, l.ts, l.device_id, d.name AS device_name, l.qname, l.answers_json, l.rtt_ms,
                l.server, l.source
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
