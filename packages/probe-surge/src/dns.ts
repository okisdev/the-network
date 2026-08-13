import type { DnsEvent } from '@the-network/schema';
import { z } from 'zod';

const DEDUPE_TTL_MS = 10 * 60 * 1_000;

const entrySchema = z
  .object({
    domain: z.string().trim().min(1),
    data: z.array(z.string()).catch([]).default([]),
    timeCost: z.number().finite().optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    dnsCache: z.array(z.unknown()),
  })
  .passthrough();

export function mapDnsCache(payload: unknown, nowMs: number): DnsEvent[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const events: DnsEvent[] = [];
  for (const raw of parsed.data.dnsCache) {
    const entry = entrySchema.safeParse(raw);
    if (!entry.success) continue;
    events.push({
      kind: 'dns',
      ts: nowMs,
      device: {},
      qname: entry.data.domain,
      answers: entry.data.data,
      ...(entry.data.timeCost === undefined
        ? {}
        : { rttMs: Math.round(entry.data.timeCost * 1_000) }),
    });
  }
  return events;
}

export class DnsDeduper {
  readonly #emittedAt = new Map<string, number>();

  fresh(events: DnsEvent[], nowMs: number): DnsEvent[] {
    for (const [key, emittedAt] of this.#emittedAt) {
      if (nowMs - emittedAt >= DEDUPE_TTL_MS) this.#emittedAt.delete(key);
    }
    const fresh: DnsEvent[] = [];
    for (const event of events) {
      const key = JSON.stringify([event.qname, [...event.answers].sort()]);
      const emittedAt = this.#emittedAt.get(key);
      if (emittedAt !== undefined && nowMs - emittedAt < DEDUPE_TTL_MS) continue;
      this.#emittedAt.set(key, nowMs);
      fresh.push(event);
    }
    return fresh;
  }
}
