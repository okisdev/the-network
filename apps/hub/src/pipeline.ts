import { randomUUID } from 'node:crypto';
import type {
  DeviceRatePush,
  DnsLogEntry,
  EventDto,
  FlowDeltaEvent,
  FlowDto,
  FlowState,
  ProbeEvent,
  SummaryPush,
} from '@the-network/schema';
import { createGeoLookup, type GeoLookup, type GeoResolver } from './geo.ts';
import { Identity } from './identity.ts';
import type { Logger } from './logger.ts';
import { logger } from './logger.ts';
import type { FlowWrite, RollupIncrement } from './store.ts';
import { Store } from './store.ts';

const EWMA_ALPHA = 0.35;
const RATE_IDLE_MS = 10_000;
const DEVICE_ONLINE_MS = 120_000;

interface RegistryRow extends FlowWrite {
  deviceName: string;
  geoResolved: boolean;
  dirty: boolean;
  pendingBytesIn: number;
  pendingBytesOut: number;
}

interface RateState {
  rateIn: number;
  rateOut: number;
  lastUpdate: number;
  lastFlowAt: number;
}

interface WanState {
  rateIn: number;
  rateOut: number;
  lastUpdate: number;
}

interface WanTotals {
  inBytes: number;
  outBytes: number;
}

export interface PipelineOptions {
  flushIntervalMs?: number;
  autoStart?: boolean;
  now?: () => number;
  logger?: Logger;
  geoLookup?: GeoResolver;
}

function flowDto(row: RegistryRow): FlowDto {
  return {
    id: row.id,
    ts: row.ts,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    dst: {
      ...(row.host === undefined ? {} : { host: row.host }),
      ...(row.ip === undefined ? {} : { ip: row.ip }),
      ...(row.port === undefined ? {} : { port: row.port }),
      ...(row.proto === undefined ? {} : { proto: row.proto }),
    },
    bytesIn: row.bytesIn,
    bytesOut: row.bytesOut,
    state: row.state,
    ...(row.country === undefined ? {} : { country: row.country }),
    ...(row.policy === undefined ? {} : { policy: row.policy }),
    ...(row.policyChain === undefined ? {} : { policyChain: row.policyChain }),
    ...(row.policyGroup === undefined ? {} : { policyGroup: row.policyGroup }),
    ...(row.rule === undefined ? {} : { rule: row.rule }),
    ...(row.process === undefined ? {} : { process: row.process }),
    ...(row.processPath === undefined ? {} : { processPath: row.processPath }),
    ...(row.proxied === undefined ? {} : { proxied: row.proxied }),
    ...(row.connectMs === undefined ? {} : { connectMs: row.connectMs }),
    ...(row.city === undefined ? {} : { city: row.city }),
    ...(row.startedAt === undefined ? {} : { startedAt: row.startedAt }),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
  };
}

function stickyString(current: string | undefined, next: string | undefined): string | undefined {
  return current || next || undefined;
}

function stickyStrings(current: string[] | undefined, next: string[] | undefined): string[] | undefined {
  return current?.length ? current : next?.length ? next : undefined;
}

function decayedRate(state: RateState | WanState, now: number): { rateIn: number; rateOut: number } {
  const idle = Math.max(0, now - state.lastUpdate);
  if (idle >= RATE_IDLE_MS) return { rateIn: 0, rateOut: 0 };
  const factor = 1 - idle / RATE_IDLE_MS;
  return { rateIn: state.rateIn * factor, rateOut: state.rateOut * factor };
}

export class Pipeline {
  private readonly registry = new Map<string, RegistryRow>();
  private readonly rates = new Map<string, RateState>();
  private readonly recentFlows = new Map<string, FlowDto>();
  private readonly eventListeners = new Set<(event: EventDto) => void>();
  private readonly dnsListeners = new Set<(entries: DnsLogEntry[]) => void>();
  private readonly totalsBySource = new Map<string, WanTotals>();
  private onlineDevices = new Set<string>();
  private pendingRollups: RollupIncrement[] = [];
  private wan: WanState = { rateIn: 0, rateOut: 0, lastUpdate: 0 };
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;
  private readonly log: Logger;
  private readonly geoLookup: GeoLookup;

  constructor(
    private readonly store: Store,
    private readonly identity: Identity,
    options: PipelineOptions = {},
  ) {
    this.flushIntervalMs = options.flushIntervalMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.log = options.logger ?? logger;
    this.geoLookup = createGeoLookup(options.geoLookup);
    this.store.closeStalePresence(this.now());
    if (options.autoStart !== false) this.start();
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      try {
        this.flush();
      } catch (error) {
        this.log.error(`Pipeline flush failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, this.flushIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  ingest(sourceId: string, events: ProbeEvent[]): void {
    const deviceDeltas = new Map<string, { bytesIn: number; bytesOut: number; ts: number }>();
    const dnsEntries: DnsLogEntry[] = [];
    for (const event of events) {
      switch (event.kind) {
        case 'flow_delta': {
          const deviceId = this.identity.resolveDeviceId(event.device, event.ts, sourceId);
          this.applyFlow(sourceId, deviceId, event);
          const delta = deviceDeltas.get(deviceId) ?? { bytesIn: 0, bytesOut: 0, ts: event.ts };
          delta.bytesIn += event.bytesIn;
          delta.bytesOut += event.bytesOut;
          delta.ts = Math.max(delta.ts, event.ts);
          deviceDeltas.set(deviceId, delta);
          break;
        }
        case 'presence': {
          const result = this.identity.applyPresence(event, sourceId);
          if (result.merge !== undefined) this.remapDevice(result.merge.fromId, result.merge.toId);
          if (result.joined !== undefined) this.emitEvent(result.joined);
          break;
        }
        case 'metric':
          if (event.scope === 'wan') this.applyWanMetric(sourceId, event);
          break;
        case 'dns': {
          const deviceId =
            event.device.ip === undefined
              ? undefined
              : this.store.getDeviceIdByIp(event.device.ip);
          dnsEntries.push(
            this.store.appendDnsLog({
              id: randomUUID(),
              ts: event.ts,
              ...(deviceId === undefined ? {} : { deviceId }),
              qname: event.qname,
              answers: event.answers,
              ...(event.rttMs === undefined ? {} : { rttMs: event.rttMs }),
              ...(event.server === undefined ? {} : { server: event.server }),
              ...(event.source === undefined ? {} : { source: event.source }),
            }),
          );
          break;
        }
      }
    }

    for (const [deviceId, delta] of deviceDeltas) {
      this.updateDeviceRate(deviceId, delta.bytesIn, delta.bytesOut, delta.ts);
    }
    if (dnsEntries.length > 0) this.emitDns(dnsEntries);
  }

  private applyFlow(sourceId: string, deviceId: string, event: FlowDeltaEvent): void {
    const current = this.registry.get(event.flowId);
    const deviceName = this.store.getDeviceById(deviceId)?.name ?? 'Unknown device';
    const endedAt = event.state === 'active' ? current?.endedAt : event.ts;
    const ip = event.dst.ip ?? current?.ip;
    const geo = current?.geoResolved || ip === undefined ? undefined : this.geoLookup(ip);
    const row: RegistryRow = {
      id: event.flowId,
      sourceId,
      deviceId,
      deviceName,
      ts: event.ts,
      host: event.dst.host ?? current?.host,
      ip: event.dst.ip ?? current?.ip,
      port: event.dst.port ?? current?.port,
      proto: event.dst.proto ?? current?.proto,
      bytesIn: (current?.bytesIn ?? 0) + event.bytesIn,
      bytesOut: (current?.bytesOut ?? 0) + event.bytesOut,
      state: event.state,
      policy: stickyString(current?.policy, event.attrs?.policy),
      policyChain: stickyStrings(current?.policyChain, event.attrs?.policyChain),
      policyGroup: stickyString(current?.policyGroup, event.attrs?.policyGroup),
      rule: stickyString(current?.rule, event.attrs?.rule),
      process: stickyString(current?.process, event.attrs?.process),
      processPath: stickyString(current?.processPath, event.attrs?.processPath),
      proxied: current?.proxied ?? event.attrs?.proxied,
      connectMs: current?.connectMs ?? event.attrs?.connectMs,
      country: current?.country ?? geo?.country,
      city: current?.city ?? geo?.city,
      lat: current?.lat ?? geo?.lat,
      lon: current?.lon ?? geo?.lon,
      startedAt: current?.startedAt ?? event.attrs?.startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
      geoResolved: current?.geoResolved === true || geo !== undefined,
      dirty: true,
      pendingBytesIn: (current?.pendingBytesIn ?? 0) + event.bytesIn,
      pendingBytesOut: (current?.pendingBytesOut ?? 0) + event.bytesOut,
    };
    this.registry.set(event.flowId, row);
    this.recentFlows.set(event.flowId, flowDto(row));
  }

  private updateDeviceRate(deviceId: string, bytesIn: number, bytesOut: number, ts: number): void {
    if (bytesIn === 0 && bytesOut === 0) return;
    const current = this.rates.get(deviceId);
    const elapsed = current === undefined ? 1_000 : Math.max(250, ts - current.lastUpdate);
    const instantIn = (bytesIn * 1_000) / elapsed;
    const instantOut = (bytesOut * 1_000) / elapsed;
    this.rates.set(deviceId, {
      rateIn: current === undefined ? instantIn : EWMA_ALPHA * instantIn + (1 - EWMA_ALPHA) * current.rateIn,
      rateOut:
        current === undefined ? instantOut : EWMA_ALPHA * instantOut + (1 - EWMA_ALPHA) * current.rateOut,
      lastUpdate: ts,
      lastFlowAt: ts,
    });
  }

  private remapDevice(fromId: string, toId: string): void {
    const deviceName = this.store.getDeviceById(toId)?.name ?? 'Unknown device';
    for (const row of this.registry.values()) {
      if (row.deviceId !== fromId) continue;
      row.deviceId = toId;
      row.deviceName = deviceName;
    }

    const fromRate = this.rates.get(fromId);
    const toRate = this.rates.get(toId);
    if (fromRate !== undefined && toRate !== undefined) {
      this.rates.set(toId, {
        rateIn: fromRate.rateIn + toRate.rateIn,
        rateOut: fromRate.rateOut + toRate.rateOut,
        lastUpdate: Math.max(fromRate.lastUpdate, toRate.lastUpdate),
        lastFlowAt: Math.max(fromRate.lastFlowAt, toRate.lastFlowAt),
      });
    } else if (fromRate !== undefined) {
      this.rates.set(toId, fromRate);
    }
    this.rates.delete(fromId);
  }

  private applyWanMetric(
    sourceId: string,
    event: Extract<ProbeEvent, { kind: 'metric' }>,
  ): void {
    this.wan = {
      rateIn:
        this.wan.lastUpdate === 0
          ? event.inBps
          : EWMA_ALPHA * event.inBps + (1 - EWMA_ALPHA) * this.wan.rateIn,
      rateOut:
        this.wan.lastUpdate === 0
          ? event.outBps
          : EWMA_ALPHA * event.outBps + (1 - EWMA_ALPHA) * this.wan.rateOut,
      lastUpdate: event.ts,
    };
    if (event.totals === undefined) return;

    const previous = this.totalsBySource.get(sourceId);
    const current = { inBytes: event.totals.inBytes, outBytes: event.totals.outBytes };
    this.totalsBySource.set(sourceId, current);
    if (
      previous === undefined ||
      current.inBytes < previous.inBytes ||
      current.outBytes < previous.outBytes
    ) {
      return;
    }
    const bytesIn = current.inBytes - previous.inBytes;
    const bytesOut = current.outBytes - previous.outBytes;
    if (bytesIn === 0 && bytesOut === 0) return;
    this.pendingRollups.push({
      ts: event.ts,
      scope: 'wan',
      key: '',
      bytesIn,
      bytesOut,
      flows: 0,
    });
  }

  flush(): void {
    this.syncPresence(this.now());
    const dirty = [...this.registry.values()].filter((row) => row.dirty);
    if (dirty.length === 0 && this.pendingRollups.length === 0) return;
    const flows: FlowWrite[] = dirty.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      deviceId: row.deviceId,
      ts: row.ts,
      ...(row.host === undefined ? {} : { host: row.host }),
      ...(row.ip === undefined ? {} : { ip: row.ip }),
      ...(row.port === undefined ? {} : { port: row.port }),
      ...(row.proto === undefined ? {} : { proto: row.proto }),
      bytesIn: row.bytesIn,
      bytesOut: row.bytesOut,
      state: row.state,
      ...(row.policy === undefined ? {} : { policy: row.policy }),
      ...(row.policyChain === undefined ? {} : { policyChain: row.policyChain }),
      ...(row.policyGroup === undefined ? {} : { policyGroup: row.policyGroup }),
      ...(row.rule === undefined ? {} : { rule: row.rule }),
      ...(row.process === undefined ? {} : { process: row.process }),
      ...(row.processPath === undefined ? {} : { processPath: row.processPath }),
      ...(row.proxied === undefined ? {} : { proxied: row.proxied }),
      ...(row.connectMs === undefined ? {} : { connectMs: row.connectMs }),
      ...(row.country === undefined ? {} : { country: row.country }),
      ...(row.city === undefined ? {} : { city: row.city }),
      ...(row.lat === undefined ? {} : { lat: row.lat }),
      ...(row.lon === undefined ? {} : { lon: row.lon }),
      ...(row.startedAt === undefined ? {} : { startedAt: row.startedAt }),
      ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
      rollupBytesIn: row.pendingBytesIn,
      rollupBytesOut: row.pendingBytesOut,
    }));
    const rollups = this.pendingRollups;
    this.store.writeFlush({ flows, rollups });
    this.pendingRollups = [];
    for (const row of dirty) {
      row.dirty = false;
      row.pendingBytesIn = 0;
      row.pendingBytesOut = 0;
      if (row.state !== 'active') this.registry.delete(row.id);
    }
  }

  private syncPresence(now: number): void {
    const onlineDevices = this.store.onlineDeviceIds(now);
    for (const deviceId of onlineDevices) {
      if (!this.onlineDevices.has(deviceId)) this.store.openPresence(deviceId, now);
    }
    for (const deviceId of this.onlineDevices) {
      if (!onlineDevices.has(deviceId)) this.store.closePresence(deviceId, now);
    }
    this.onlineDevices = onlineDevices;
  }

  activeFlowCount(): number {
    let count = 0;
    for (const flow of this.registry.values()) {
      if (flow.state === 'active') count += 1;
    }
    return count;
  }

  getSummary(now: number = this.now()): SummaryPush {
    const wan = this.wan.lastUpdate === 0 ? { rateIn: 0, rateOut: 0 } : decayedRate(this.wan, now);
    let activeDevices = 0;
    for (const rate of this.rates.values()) {
      if (rate.lastFlowAt >= now - 60_000) activeDevices += 1;
    }
    return { wan, today: this.store.getTodayTotals(now), activeDevices };
  }

  deviceRates(now: number = this.now()): Map<string, DeviceRatePush> {
    const output = new Map<string, DeviceRatePush>();
    for (const [id, state] of this.rates) {
      const rate = decayedRate(state, now);
      output.set(id, {
        id,
        rateIn: rate.rateIn,
        rateOut: rate.rateOut,
        online: state.lastFlowAt >= now - DEVICE_ONLINE_MS,
      });
    }
    return output;
  }

  recentFlowDtos(): FlowDto[] {
    const flows = [...this.recentFlows.values()].sort(
      (a, b) => b.ts - a.ts || b.id.localeCompare(a.id),
    );
    this.recentFlows.clear();
    return flows;
  }

  onEvent(listener: (event: EventDto) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onDns(listener: (entries: DnsLogEntry[]) => void): () => void {
    this.dnsListeners.add(listener);
    return () => this.dnsListeners.delete(listener);
  }

  private emitDns(entries: DnsLogEntry[]): void {
    for (const listener of this.dnsListeners) listener(entries);
  }

  emitEvent(event: EventDto): void {
    for (const listener of this.eventListeners) listener(event);
  }
}
