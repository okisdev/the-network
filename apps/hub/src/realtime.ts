import type { FastifyReply } from 'fastify';
import type { DnsLogEntry, EventDto, StreamMessage } from '@the-network/schema';
import { Pipeline } from './pipeline.ts';

export interface RealtimeOptions {
  summaryIntervalMs?: number;
  devicesIntervalMs?: number;
  flowsIntervalMs?: number;
  pingIntervalMs?: number;
  now?: () => number;
}

export class Realtime {
  private readonly clients = new Set<FastifyReply['raw']>();
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];
  private readonly lastOnline = new Map<string, boolean>();
  private readonly now: () => number;
  private readonly removeEventListener: () => void;
  private readonly removeDnsListener: () => void;

  constructor(
    private readonly pipeline: Pipeline,
    options: RealtimeOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.removeEventListener = pipeline.onEvent((event) => this.broadcastEvent(event));
    this.removeDnsListener = pipeline.onDns((entries) => this.broadcastDns(entries));
    this.timers.push(
      setInterval(
        () => this.broadcast({ type: 'summary', data: this.pipeline.getSummary() }),
        options.summaryIntervalMs ?? 1_000,
      ),
      setInterval(() => this.pushDevices(), options.devicesIntervalMs ?? 2_000),
      setInterval(() => this.pushFlows(), options.flowsIntervalMs ?? 500),
      setInterval(() => this.ping(), options.pingIntervalMs ?? 15_000),
    );
    for (const timer of this.timers) timer.unref();
  }

  subscribe(reply: FastifyReply): () => void {
    const response = reply.raw;
    this.clients.add(response);
    this.write(response, { type: 'hello', data: { serverTime: this.now() } });
    return () => this.clients.delete(response);
  }

  broadcastEvent(event: EventDto): void {
    this.broadcast({ type: 'event', data: event });
  }

  broadcastDns(entries: DnsLogEntry[]): void {
    this.broadcast({ type: 'dns', data: entries });
  }

  close(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.removeEventListener();
    this.removeDnsListener();
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  private pushDevices(): void {
    const changed = [];
    for (const [id, rate] of this.pipeline.deviceRates()) {
      const previousOnline = this.lastOnline.get(id);
      this.lastOnline.set(id, rate.online);
      if (rate.rateIn !== 0 || rate.rateOut !== 0 || previousOnline !== rate.online) changed.push(rate);
    }
    if (changed.length > 0) this.broadcast({ type: 'devices', data: changed });
  }

  private pushFlows(): void {
    const flows = this.pipeline.recentFlowDtos();
    if (flows.length > 0) this.broadcast({ type: 'flows', data: flows });
  }

  private ping(): void {
    for (const client of this.clients) {
      try {
        client.write(': ping\n\n');
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private broadcast(message: StreamMessage): void {
    for (const client of this.clients) this.write(client, message);
  }

  private write(response: FastifyReply['raw'], message: StreamMessage): void {
    try {
      response.write(`data: ${JSON.stringify(message)}\n\n`);
    } catch {
      this.clients.delete(response);
    }
  }
}
