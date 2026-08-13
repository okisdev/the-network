import { z } from 'zod';

export const vantageSchema = z.enum(['gateway', 'host', 'infra', 'passive']);
export type Vantage = z.infer<typeof vantageSchema>;

export const deviceHintSchema = z.object({
  mac: z.string().optional(),
  ip: z.string().optional(),
  name: z.string().optional(),
});
export type DeviceHint = z.infer<typeof deviceHintSchema>;

export const flowStateSchema = z.enum(['active', 'completed', 'failed']);
export type FlowState = z.infer<typeof flowStateSchema>;

export const flowDeltaEventSchema = z.object({
  kind: z.literal('flow_delta'),
  ts: z.number(),
  flowId: z.string(),
  device: deviceHintSchema,
  dst: z.object({
    host: z.string().optional(),
    ip: z.string().optional(),
    port: z.number().optional(),
    proto: z.enum(['tcp', 'udp', 'other']).optional(),
  }),
  bytesIn: z.number().min(0),
  bytesOut: z.number().min(0),
  state: flowStateSchema,
  attrs: z
    .object({
      policy: z.string().optional(),
      policyChain: z.array(z.string()).optional(),
      rule: z.string().optional(),
      process: z.string().optional(),
      url: z.string().optional(),
      startedAt: z.number().optional(),
    })
    .optional(),
});
export type FlowDeltaEvent = z.infer<typeof flowDeltaEventSchema>;

export const dnsEventSchema = z.object({
  kind: z.literal('dns'),
  ts: z.number(),
  device: deviceHintSchema,
  qname: z.string(),
  answers: z.array(z.string()),
  rttMs: z.number().optional(),
});
export type DnsEvent = z.infer<typeof dnsEventSchema>;

export const presenceEventSchema = z.object({
  kind: z.literal('presence'),
  ts: z.number(),
  device: deviceHintSchema,
  event: z.enum(['seen', 'lease', 'gone']),
  meta: z
    .object({
      hostname: z.string().optional(),
      dhcpName: z.string().optional(),
      vendor: z.string().optional(),
      iconId: z.string().optional(),
      managed: z.boolean().optional(),
      lastActiveAt: z.number().optional(),
    })
    .optional(),
});
export type PresenceEvent = z.infer<typeof presenceEventSchema>;

export const metricEventSchema = z.object({
  kind: z.literal('metric'),
  ts: z.number(),
  scope: z.string(),
  inBps: z.number().min(0),
  outBps: z.number().min(0),
  totals: z
    .object({
      inBytes: z.number().min(0),
      outBytes: z.number().min(0),
    })
    .optional(),
});
export type MetricEvent = z.infer<typeof metricEventSchema>;

export const probeEventSchema = z.discriminatedUnion('kind', [
  flowDeltaEventSchema,
  dnsEventSchema,
  presenceEventSchema,
  metricEventSchema,
]);
export type ProbeEvent = z.infer<typeof probeEventSchema>;
