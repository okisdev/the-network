import type { FlowState } from './events.ts';
import type { ProbeStatus } from './probe.ts';

export interface SourceDto {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  status: ProbeStatus;
  lastEventAt?: number;
  eventsPerMinute?: number;
}

export interface DeviceDto {
  id: string;
  name: string;
  mac?: string;
  vendor?: string;
  ips: string[];
  iconId?: string;
  managed?: boolean;
  online: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  rateIn: number;
  rateOut: number;
  todayIn: number;
  todayOut: number;
}

export interface FlowDto {
  id: string;
  ts: number;
  deviceId: string;
  deviceName: string;
  dst: {
    host?: string;
    ip?: string;
    port?: number;
    proto?: string;
  };
  bytesIn: number;
  bytesOut: number;
  state: FlowState;
  country?: string;
  policy?: string;
  policyChain?: string[];
  policyGroup?: string;
  rule?: string;
  process?: string;
  processPath?: string;
  proxied?: boolean;
  connectMs?: number;
  city?: string;
  asn?: number;
  asOrg?: string;
  rdns?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface DestinationCountry {
  code: string;
  bytesIn: number;
  bytesOut: number;
  flows: number;
}

export interface DestinationHost {
  host: string;
  country?: string;
  bytes: number;
  flows: number;
  devices: number;
}

export interface DestinationsDto {
  countries: DestinationCountry[];
  hosts: DestinationHost[];
}

export interface CountryDeviceShare {
  deviceId: string;
  deviceName: string;
  bytes: number;
  flows: number;
}

export interface DnsLogEntry {
  id: string;
  ts: number;
  deviceId?: string;
  deviceName?: string;
  qname: string;
  answers: string[];
  rttMs?: number;
  server?: string;
  source?: 'cache' | 'server';
}

export interface SystemLogEntry {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
}

export interface DnsLogPage {
  entries: DnsLogEntry[];
  nextCursor?: string;
}

export interface SystemLogPage {
  entries: SystemLogEntry[];
  nextCursor?: string;
}

export interface LogsQuery {
  search?: string;
  level?: 'info' | 'warn' | 'error';
  cursor?: string;
  limit?: number;
}

export interface EventDto {
  id: string;
  ts: number;
  kind: 'device_joined' | 'device_online' | 'device_offline' | 'source_error' | 'source_recovered';
  message: string;
  deviceId?: string;
  sourceId?: string;
}

export interface TimeseriesPoint {
  ts: number;
  in: number;
  out: number;
}

export interface OverviewDto {
  wan: { rateIn: number; rateOut: number };
  today: { in: number; out: number };
  activeDevices: number;
  totalDevices: number;
  flowsActive?: number;
  rejectedToday?: { flows: number; bytes: number };
  dnsToday?: number;
  topDevices: Array<{ deviceId: string; name: string; rateIn: number; rateOut: number }>;
  topDestinations: Array<{ host: string; bytes: number }>;
  policySplit: Array<{ policy: string; bytes: number }>;
  events: EventDto[];
}

export interface FlowsPage {
  flows: FlowDto[];
  nextCursor?: string;
}

export interface FlowsQuery {
  deviceId?: string;
  search?: string;
  policy?: string;
  state?: FlowState;
  country?: string;
  proto?: 'tcp' | 'udp' | 'other';
  port?: number;
  process?: string;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
}

export type TimeseriesScope =
  | 'wan'
  | `device:${string}`
  | `policy:${string}`
  | `host:${string}`
  | `country:${string}`;

export interface TimeseriesQuery {
  scope: TimeseriesScope;
  minutes: number;
  from?: number;
  to?: number;
}

export interface AuthStatusDto {
  enabled: boolean;
  authenticated: boolean;
}

export interface SourceHealthPoint {
  ts: number;
  ok: boolean;
  latencyMs?: number;
}

export interface SystemDbDto {
  sizeBytes: number;
  tables: Array<{ name: string; rows: number }>;
  retention: Array<{ table: string; days: number }>;
}

export interface MultiSeriesDto {
  key: string;
  label: string;
  points: TimeseriesPoint[];
}

export type BreakdownDim =
  | 'process'
  | 'port'
  | 'proto'
  | 'rule'
  | 'policy'
  | 'country'
  | 'host'
  | 'domain'
  | 'ip'
  | 'asn';

export interface BreakdownRow {
  key: string;
  label?: string;
  country?: string;
  bytesIn: number;
  bytesOut: number;
  flows: number;
  devices?: number;
}

export interface BreakdownDto {
  window: { from: number; to: number; clamped: boolean };
  rows: BreakdownRow[];
}

export interface SankeyDto {
  nodes: Array<{ id: string; label: string; kind: 'device' | 'policy' | 'country' }>;
  links: Array<{ source: number; target: number; bytes: number }>;
}

export interface PunchcardDto {
  days: number;
  max: number;
  cells: number[][];
}

export interface DailyPoint {
  day: string;
  in: number;
  out: number;
}

export interface MoverRow {
  key: string;
  label: string;
  current: number;
  previous: number;
}

export interface MoversDto {
  devices: MoverRow[];
  domains: MoverRow[];
}

export interface FirstSeenDto {
  devices: Array<{ deviceId: string; name: string; firstSeenAt: number }>;
  domains: Array<{ domain: string; firstTs: number; bytes: number; devices: number }>;
}

export interface RejectedSummaryDto {
  series: Array<{ ts: number; flows: number }>;
  topHosts: BreakdownRow[];
  topDevices: BreakdownRow[];
  topRules: BreakdownRow[];
}

export interface PresenceInterval {
  start: number;
  end?: number;
}

export interface DeviceDetailDto {
  device: DeviceDto;
  series: TimeseriesPoint[];
  topHosts: BreakdownRow[];
  topCountries: BreakdownRow[];
  topProcesses: BreakdownRow[];
  topPorts: BreakdownRow[];
  policySplit: Array<{ policy: string; bytes: number }>;
  presence: PresenceInterval[];
  recentFlows: FlowDto[];
}

export interface CityPoint {
  city: string;
  country: string;
  lat: number;
  lon: number;
  bytes: number;
  flows: number;
}

export interface HostDetailDto {
  host: string;
  country?: string;
  series: TimeseriesPoint[];
  devices: BreakdownRow[];
  processes: BreakdownRow[];
  ports: BreakdownRow[];
  recentFlows: FlowDto[];
}

export interface DnsSummaryDto {
  series: Array<{ ts: number; count: number }>;
  topDomains: Array<{ qname: string; count: number }>;
  rttBuckets: Array<{ label: string; count: number }>;
  answered: number;
  unanswered: number;
  resolvers: Array<{ server: string; count: number }>;
}

export interface SourceInput {
  kind: string;
  name: string;
  settings: Record<string, unknown>;
  enabled?: boolean;
}

export interface SummaryPush {
  wan: { rateIn: number; rateOut: number };
  today: { in: number; out: number };
  activeDevices: number;
  flowsActive?: number;
}

export interface DeviceRatePush {
  id: string;
  rateIn: number;
  rateOut: number;
  online: boolean;
}

export type StreamMessage =
  | { type: 'hello'; data: { serverTime: number } }
  | { type: 'summary'; data: SummaryPush }
  | { type: 'flows'; data: FlowDto[] }
  | { type: 'devices'; data: DeviceRatePush[] }
  | { type: 'event'; data: EventDto }
  | { type: 'dns'; data: DnsLogEntry[] };
