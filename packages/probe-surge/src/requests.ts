import { z } from 'zod';
import type { FlowDeltaEvent, FlowState } from '@the-network/schema';

const TTL_MS = 5 * 60 * 1000;

const requestRecordSchema = z
  .object({
    id: z.number(),
    remoteHost: z.string().optional(),
    remoteAddress: z.string().optional(),
    localAddress: z.string().optional(),
    sourceAddress: z.string().optional(),
    remoteClientPhysicalAddress: z.string().optional(),
    deviceName: z.string().optional(),
    sourcePort: z.number().optional(),
    method: z.string().optional(),
    URL: z.string().optional(),
    policyName: z.string().optional(),
    originalPolicyName: z.string().optional(),
    rule: z.string().optional(),
    startDate: z.number().optional(),
    inBytes: z.number().optional(),
    outBytes: z.number().optional(),
    completed: z.boolean().optional(),
    failed: z.boolean().optional(),
    status: z.string().optional(),
    notes: z.array(z.string()).optional(),
    processPath: z.string().optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    requests: z.array(z.unknown()),
  })
  .passthrough();

type LiveEntry = {
  inBytes: number;
  outBytes: number;
  lastSeenAt: number;
  terminal: boolean;
};

type CompletedEntry = {
  inBytes: number;
  outBytes: number;
  completedAt: number;
};

export class RequestTracker {
  readonly #live = new Map<number, LiveEntry>();
  readonly #recentlyCompleted = new Map<number, CompletedEntry>();

  ingest(payload: unknown, nowMs: number): FlowDeltaEvent[] {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return [];

    this.#evict(nowMs);

    const events: FlowDeltaEvent[] = [];
    const seen = new Set<number>();

    for (const raw of parsed.data.requests) {
      const rec = requestRecordSchema.safeParse(raw);
      if (!rec.success) continue;

      const r = rec.data;
      seen.add(r.id);

      const inBytes = r.inBytes ?? 0;
      const outBytes = r.outBytes ?? 0;

      const recent = this.#recentlyCompleted.get(r.id);
      if (recent !== undefined) {
        if (inBytes <= recent.inBytes && outBytes <= recent.outBytes) {
          continue;
        }
      }

      const terminal = isTerminal(r);
      const live = this.#live.get(r.id);

      let deltaIn: number;
      let deltaOut: number;

      if (live === undefined) {
        deltaIn = inBytes;
        deltaOut = outBytes;
      } else {
        deltaIn = inBytes < live.inBytes ? inBytes : inBytes - live.inBytes;
        deltaOut = outBytes < live.outBytes ? outBytes : outBytes - live.outBytes;
      }

      if (live === undefined || deltaIn > 0 || deltaOut > 0 || (terminal && !live?.terminal)) {
        events.push(toEvent(r, nowMs, deltaIn, deltaOut, terminal ? terminalState(r) : 'active'));
      }

      if (terminal) {
        this.#live.delete(r.id);
        this.#recentlyCompleted.set(r.id, {
          inBytes,
          outBytes,
          completedAt: nowMs,
        });
      } else {
        this.#live.set(r.id, {
          inBytes,
          outBytes,
          lastSeenAt: nowMs,
          terminal: false,
        });
      }
    }

    for (const [id, entry] of this.#live) {
      if (!seen.has(id) && nowMs - entry.lastSeenAt > TTL_MS) {
        this.#live.delete(id);
      }
    }

    return events;
  }

  #evict(nowMs: number): void {
    for (const [id, entry] of this.#recentlyCompleted) {
      if (nowMs - entry.completedAt > TTL_MS) {
        this.#recentlyCompleted.delete(id);
      }
    }
    for (const [id, entry] of this.#live) {
      if (nowMs - entry.lastSeenAt > TTL_MS) {
        this.#live.delete(id);
      }
    }
  }
}

function isTerminal(r: z.infer<typeof requestRecordSchema>): boolean {
  if (r.completed === true || r.failed === true) return true;
  if (r.policyName === 'REJECT' && (r.inBytes ?? 0) === 0 && (r.outBytes ?? 0) === 0) {
    return true;
  }
  return false;
}

function terminalState(r: z.infer<typeof requestRecordSchema>): FlowState {
  if (
    r.failed === true ||
    (r.policyName === 'REJECT' && (r.inBytes ?? 0) === 0 && (r.outBytes ?? 0) === 0)
  ) {
    return 'failed';
  }
  return 'completed';
}

function toEvent(
  r: z.infer<typeof requestRecordSchema>,
  nowMs: number,
  bytesIn: number,
  bytesOut: number,
  state: FlowState,
): FlowDeltaEvent {
  const dst = mapDst(r);
  const attrs = mapAttrs(r);

  return {
    kind: 'flow_delta',
    ts: nowMs,
    flowId: `surge:${r.id}`,
    device: mapDevice(r),
    dst,
    bytesIn,
    bytesOut,
    state,
    attrs,
  };
}

function mapDevice(r: z.infer<typeof requestRecordSchema>): FlowDeltaEvent['device'] {
  const mac = r.remoteClientPhysicalAddress;
  // Surge's fake-IP range marks the engine's own synthetic requests, not a client.
  const rawIp = r.sourceAddress ?? r.localAddress;
  const ip = rawIp !== undefined && rawIp.startsWith('198.18.') ? undefined : rawIp;
  const name = r.deviceName;
  return {
    ...(mac !== undefined && mac !== '' ? { mac } : {}),
    ...(ip !== undefined && ip !== '' ? { ip } : {}),
    ...(name !== undefined && name !== '' ? { name } : {}),
  };
}

function mapDst(r: z.infer<typeof requestRecordSchema>): FlowDeltaEvent['dst'] {
  const dst: FlowDeltaEvent['dst'] = {};
  let host = r.remoteHost;
  let hostPort: number | undefined;

  // Surge Mac may report remoteHost as "host:port"; split it so hosts aggregate cleanly.
  if (host !== undefined && !host.includes(']')) {
    const match = /^(.+):(\d{1,5})$/.exec(host);
    if (match?.[1] !== undefined && match[1].includes(':') === false) {
      host = match[1];
      hostPort = Number(match[2]);
    }
  }

  if (host !== undefined && host !== '') {
    if (isIpLiteral(host)) {
      dst.ip = host;
    } else {
      dst.host = host;
      if (r.remoteAddress !== undefined) {
        dst.ip = firstAddressToken(r.remoteAddress);
      }
    }
  } else if (r.remoteAddress !== undefined) {
    dst.ip = firstAddressToken(r.remoteAddress);
  }

  if (hostPort !== undefined) dst.port = hostPort;
  if (dst.port === undefined && r.URL !== undefined) {
    const port = portFromUrl(r.URL);
    if (port !== undefined) dst.port = port;
  }

  dst.proto = mapProto(r.method);
  return dst;
}

function mapAttrs(r: z.infer<typeof requestRecordSchema>): FlowDeltaEvent['attrs'] {
  const attrs: NonNullable<FlowDeltaEvent['attrs']> = {};

  if (r.policyName !== undefined) attrs.policy = r.policyName;
  if (r.rule !== undefined) attrs.rule = r.rule;
  if (r.URL !== undefined) attrs.url = r.URL;
  if (r.startDate !== undefined) attrs.startedAt = Math.round(r.startDate * 1000);

  if (r.processPath !== undefined && r.processPath !== '') {
    const segs = r.processPath.split(/[/\\]/).filter(Boolean);
    const last = segs[segs.length - 1];
    if (last !== undefined) attrs.process = last;
  }

  const chain = policyChainFromNotes(r.notes);
  if (chain !== undefined) attrs.policyChain = chain;

  return attrs;
}

function policyChainFromNotes(notes: string[] | undefined): string[] | undefined {
  if (notes === undefined) return undefined;
  const prefix = '[Rule] Policy decision path:';
  for (const note of notes) {
    if (note.startsWith(prefix)) {
      const rest = note.slice(prefix.length);
      return rest.split('->').map((s) => s.trim());
    }
  }
  return undefined;
}

function mapProto(method: string | undefined): 'tcp' | 'udp' | 'other' {
  if (method === undefined) return 'other';
  const m = method.toUpperCase();
  if (m === 'UDP') return 'udp';
  if (m === 'TCP' || m === 'HTTP' || m === 'HTTPS') return 'tcp';
  return 'other';
}

function portFromUrl(url: string): number | undefined {
  const m = /:(\d+)\s*$/.exec(url);
  if (m === null || m[1] === undefined) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function firstAddressToken(remoteAddress: string): string {
  const stripped = remoteAddress.replace(/\s*\(Proxy\)\s*$/i, '').trim();
  const token = stripped.split(/\s+/)[0];
  return token ?? stripped;
}

function isIpLiteral(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)) return true;
  return false;
}
