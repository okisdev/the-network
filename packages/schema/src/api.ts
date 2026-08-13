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
  rule?: string;
  process?: string;
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
  cursor?: string;
  limit?: number;
}

export interface TimeseriesQuery {
  scope: 'wan' | `device:${string}`;
  minutes: number;
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
