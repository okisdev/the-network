import { randomUUID } from 'node:crypto';
import { surgeProbe } from '@the-network/probe-surge';
import type {
  EventDto,
  ProbeAdapter,
  ProbeContext,
  ProbeStatus,
  TestConnectionResult,
} from '@the-network/schema';
import type { Logger } from './logger.ts';
import { logger } from './logger.ts';
import { Pipeline } from './pipeline.ts';
import { Store } from './store.ts';

export const ADAPTERS: Readonly<Record<string, ProbeAdapter>> = { surge: surgeProbe };

interface ProbeRuntime {
  controller?: AbortController;
  restartTimer?: ReturnType<typeof setTimeout>;
  backoffMs: number;
}

interface ProbeStats {
  lastEventAt?: number;
  timestamps: number[];
}

export interface ProbeManagerOptions {
  adapters?: Readonly<Record<string, ProbeAdapter>>;
  logger?: Logger;
  now?: () => number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export class ProbeManager {
  private readonly statuses = new Map<string, ProbeStatus>();
  private readonly runtimes = new Map<string, ProbeRuntime>();
  private readonly stats = new Map<string, ProbeStats>();
  private readonly adapters: Readonly<Record<string, ProbeAdapter>>;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly store: Store,
    private readonly pipeline: Pipeline,
    options: ProbeManagerOptions = {},
  ) {
    this.adapters = options.adapters ?? ADAPTERS;
    this.log = options.logger ?? logger;
    this.now = options.now ?? Date.now;
    this.minBackoffMs = options.minBackoffMs ?? 5_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
  }

  startEnabled(): void {
    for (const source of this.store.listSources()) {
      if (source.enabled) this.start(source.id);
      else this.statuses.set(source.id, { state: 'stopped' });
    }
  }

  start(sourceId: string): void {
    this.stop(sourceId);
    const source = this.store.getSource(sourceId);
    if (source === undefined || !source.enabled) return;
    this.runtimes.set(sourceId, { backoffMs: this.minBackoffMs });
    this.launch(sourceId);
  }

  restart(sourceId: string): void {
    this.start(sourceId);
  }

  stop(sourceId: string): void {
    const runtime = this.runtimes.get(sourceId);
    runtime?.controller?.abort();
    if (runtime?.restartTimer !== undefined) clearTimeout(runtime.restartTimer);
    this.runtimes.delete(sourceId);
    this.statuses.set(sourceId, { state: 'stopped' });
  }

  stopAll(): void {
    for (const sourceId of [...this.runtimes.keys()]) this.stop(sourceId);
  }

  getStatus(sourceId: string): ProbeStatus {
    return this.statuses.get(sourceId) ?? { state: 'stopped' };
  }

  sampleHealth(ts: number = this.now()): void {
    for (const source of this.store.listSources()) {
      const status = this.getStatus(source.id);
      this.store.appendSourceHealth(
        source.id,
        ts,
        status.state === 'ok',
        status.lastLatencyMs,
      );
    }
  }

  getStats(sourceId: string): { lastEventAt?: number; eventsPerMinute?: number } {
    const stats = this.stats.get(sourceId);
    if (stats === undefined) return {};
    const threshold = this.now() - 60_000;
    stats.timestamps = stats.timestamps.filter((ts) => ts >= threshold);
    return {
      ...(stats.lastEventAt === undefined ? {} : { lastEventAt: stats.lastEventAt }),
      eventsPerMinute: stats.timestamps.length,
    };
  }

  getAdapter(kind: string): ProbeAdapter | undefined {
    return this.adapters[kind];
  }

  async testConnection(
    kind: string,
    settings: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<TestConnectionResult> {
    const adapter = this.adapters[kind];
    if (adapter === undefined) return { ok: false, message: `Unknown probe kind: ${kind}` };
    if (adapter.testConnection === undefined) {
      return { ok: false, message: `${kind} does not support connection tests` };
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<TestConnectionResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, message: 'Connection test timed out' });
      }, timeoutMs);
      timer.unref();
    });
    try {
      return await Promise.race([adapter.testConnection(settings, controller.signal), timeout]);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private launch(sourceId: string): void {
    const source = this.store.getSource(sourceId);
    const runtime = this.runtimes.get(sourceId);
    if (source === undefined || runtime === undefined || !source.enabled) return;
    const adapter = this.adapters[source.kind];
    if (adapter === undefined) {
      this.setStatus(sourceId, { state: 'error', message: `Unknown probe kind: ${source.kind}` });
      return;
    }

    let settings: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(source.settingsJson);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Settings must be an object');
      }
      settings = value as Record<string, unknown>;
    } catch (error) {
      this.setStatus(sourceId, {
        state: 'error',
        message: `Invalid source settings: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    runtime.controller?.abort();
    const controller = new AbortController();
    runtime.controller = controller;
    this.setStatus(sourceId, { state: 'starting' });
    const context: ProbeContext = {
      sourceId,
      settings,
      signal: controller.signal,
      emit: (events) => {
        if (controller.signal.aborted || this.runtimes.get(sourceId)?.controller !== controller) return;
        const now = this.now();
        const stats = this.stats.get(sourceId) ?? { timestamps: [] };
        stats.lastEventAt = events.at(-1)?.ts ?? now;
        stats.timestamps.push(...events.map(() => now));
        stats.timestamps = stats.timestamps.filter((ts) => ts >= now - 60_000);
        this.stats.set(sourceId, stats);
        this.pipeline.ingest(sourceId, events);
      },
      setStatus: (status) => {
        if (controller.signal.aborted || this.runtimes.get(sourceId)?.controller !== controller) return;
        this.setStatus(sourceId, status);
        if (status.state === 'ok') runtime.backoffMs = this.minBackoffMs;
      },
      log: (level, message) => this.log.log(level, message, source.name),
    };

    Promise.resolve()
      .then(() => adapter.start(context))
      .then(() => {
        // Adapters may return after scheduling their own signal-bound loops, so
        // resolution is not a failure; only rejection triggers the restart path.
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || this.runtimes.get(sourceId)?.controller !== controller) return;
        this.setStatus(sourceId, {
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
        this.scheduleRestart(sourceId);
      });
  }

  private scheduleRestart(sourceId: string): void {
    const runtime = this.runtimes.get(sourceId);
    if (runtime === undefined) return;
    const delay = runtime.backoffMs;
    runtime.backoffMs = Math.min(runtime.backoffMs * 2, this.maxBackoffMs);
    runtime.restartTimer = setTimeout(() => {
      runtime.restartTimer = undefined;
      const source = this.store.getSource(sourceId);
      if (source?.enabled) this.launch(sourceId);
    }, delay);
    runtime.restartTimer.unref();
  }

  private setStatus(sourceId: string, status: ProbeStatus): void {
    const previous = this.statuses.get(sourceId);
    const normalized: ProbeStatus =
      status.state === 'ok'
        ? { ...status, lastSuccessAt: status.lastSuccessAt ?? this.now() }
        : status;
    this.statuses.set(sourceId, normalized);
    if (previous?.state === 'ok' && normalized.state === 'error') {
      this.recordSourceEvent(sourceId, 'source_error', normalized.message ?? 'Source entered an error state');
    } else if (previous?.state === 'error' && normalized.state === 'ok') {
      this.recordSourceEvent(sourceId, 'source_recovered', normalized.message ?? 'Source recovered');
    }
  }

  private recordSourceEvent(
    sourceId: string,
    kind: Extract<EventDto['kind'], 'source_error' | 'source_recovered'>,
    message: string,
  ): void {
    const event = this.store.insertEvent({
      id: randomUUID(),
      ts: this.now(),
      kind,
      message,
      sourceId,
    });
    this.pipeline.emitEvent(event);
  }
}
