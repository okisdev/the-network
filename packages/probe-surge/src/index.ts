import {
  surgeSettingsSchema,
  type ProbeAdapter,
  type ProbeContext,
  type TestConnectionResult,
} from '@the-network/schema';
import { SurgeClient } from './client.ts';
import { mapDevices } from './devices.ts';
import { DnsDeduper, mapDnsCache } from './dns.ts';
import { RequestTracker } from './requests.ts';
import { mapTraffic } from './traffic.ts';

export const surgeProbe: ProbeAdapter = {
  descriptor: {
    kind: 'surge',
    vantage: 'gateway',
    capabilities: ['per_device', 'whole_home', 'policy_verdict', 'domain.sni', 'domain.dns'],
  },

  async start(ctx: ProbeContext): Promise<void> {
    const parsed = surgeSettingsSchema.safeParse(ctx.settings);
    if (!parsed.success) {
      ctx.setStatus({ state: 'error', message: 'Invalid Surge settings' });
      return;
    }

    const settings = parsed.data;
    const client = new SurgeClient(settings.url, settings.apiKey);
    const tracker = new RequestTracker();
    const dnsDeduper = new DnsDeduper();
    let requestFailures = 0;

    const runLoop = (intervalMs: number, tick: () => Promise<void>): void => {
      let handle: ReturnType<typeof setTimeout> | undefined;
      ctx.signal.addEventListener(
        'abort',
        () => {
          if (handle !== undefined) clearTimeout(handle);
        },
        { once: true },
      );
      const schedule = (): void => {
        if (ctx.signal.aborted) return;
        handle = setTimeout(() => {
          void (async () => {
            if (ctx.signal.aborted) return;
            try {
              await tick();
            } catch {}
            schedule();
          })();
        }, intervalMs);
      };
      schedule();
    };

    runLoop(settings.requestsIntervalMs, async () => {
      try {
        const payload = await client.getRecentRequests(ctx.signal);
        const events = tracker.ingest(payload, Date.now());
        if (events.length > 0) ctx.emit(events);
        requestFailures = 0;
        ctx.setStatus({
          state: 'ok',
          lastSuccessAt: Date.now(),
        });
      } catch (err) {
        requestFailures += 1;
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) {
          ctx.setStatus({ state: 'error', message: 'Invalid API key' });
          return;
        }
        if (requestFailures >= 3) {
          ctx.setStatus({
            state: 'degraded',
            message: err instanceof Error ? err.message : 'Requests poll failed',
          });
        }
      }
    });

    runLoop(settings.devicesIntervalMs, async () => {
      try {
        const payload = await client.getDevices(ctx.signal);
        const events = mapDevices(payload, Date.now());
        if (events.length > 0) ctx.emit(events);
        const dnsPayload = await client.getDnsCache(ctx.signal);
        const now = Date.now();
        const dnsEvents = dnsDeduper.fresh(mapDnsCache(dnsPayload, now), now);
        if (dnsEvents.length > 0) ctx.emit(dnsEvents);
      } catch {}
    });

    runLoop(settings.trafficIntervalMs, async () => {
      try {
        const payload = await client.getTraffic(ctx.signal);
        const events = mapTraffic(payload, Date.now());
        if (events.length > 0) ctx.emit(events);
      } catch {}
    });
  },

  async testConnection(
    settings: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<TestConnectionResult> {
    const parsed = surgeSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid Surge settings' };
    }

    const client = new SurgeClient(parsed.data.url, parsed.data.apiKey);
    try {
      const outbound = await client.getOutbound(signal);
      let mode = 'unknown';
      if (typeof outbound === 'object' && outbound !== null) {
        const o = outbound as Record<string, unknown>;
        if (typeof o['mode'] === 'string') mode = o['mode'];
        else if (typeof o['policy'] === 'string') mode = o['policy'];
        else if (typeof o['outbound'] === 'string') mode = o['outbound'];
      } else if (typeof outbound === 'string') {
        mode = outbound;
      }

      return {
        ok: true,
        message: 'Connected to Surge',
        details: { mode },
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
