import { z } from 'zod';
import type { MetricEvent } from '@the-network/schema';

const ifaceSchema = z
  .object({
    in: z.number().optional(),
    out: z.number().optional(),
    inCurrentSpeed: z.number().optional(),
    outCurrentSpeed: z.number().optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    interface: z.record(z.string(), z.unknown()).optional(),
    connector: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export function mapTraffic(payload: unknown, nowMs: number): MetricEvent[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];

  const events: MetricEvent[] = [];

  let wanInBps = 0;
  let wanOutBps = 0;
  let wanInBytes = 0;
  let wanOutBytes = 0;
  let hasWan = false;

  const interfaces = parsed.data.interface ?? {};
  for (const [name, raw] of Object.entries(interfaces)) {
    if (name.startsWith('lo')) continue;
    const iface = ifaceSchema.safeParse(raw);
    if (!iface.success) continue;
    hasWan = true;
    wanInBps += iface.data.inCurrentSpeed ?? 0;
    wanOutBps += iface.data.outCurrentSpeed ?? 0;
    wanInBytes += iface.data.in ?? 0;
    wanOutBytes += iface.data.out ?? 0;
  }

  if (hasWan) {
    events.push({
      kind: 'metric',
      ts: nowMs,
      scope: 'wan',
      inBps: wanInBps,
      outBps: wanOutBps,
      totals: { inBytes: wanInBytes, outBytes: wanOutBytes },
    });
  }

  const connectors = parsed.data.connector ?? {};
  for (const [name, raw] of Object.entries(connectors)) {
    const c = ifaceSchema.safeParse(raw);
    if (!c.success) continue;
    events.push({
      kind: 'metric',
      ts: nowMs,
      scope: `policy:${name}`,
      inBps: c.data.inCurrentSpeed ?? 0,
      outBps: c.data.outCurrentSpeed ?? 0,
      totals: {
        inBytes: c.data.in ?? 0,
        outBytes: c.data.out ?? 0,
      },
    });
  }

  return events;
}
