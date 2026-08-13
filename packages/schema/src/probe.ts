import { z } from 'zod';
import type { ProbeEvent, Vantage } from './events.ts';

export const probeCapabilitySchema = z.enum([
  'per_device',
  'per_process',
  'policy_verdict',
  'domain.sni',
  'domain.dns',
  'whole_home',
  'control.policy_select',
  'control.device_takeover',
]);
export type ProbeCapability = z.infer<typeof probeCapabilitySchema>;

export const probeStateSchema = z.enum(['starting', 'ok', 'degraded', 'error', 'stopped']);
export type ProbeState = z.infer<typeof probeStateSchema>;

export interface ProbeStatus {
  state: ProbeState;
  message?: string;
  lastSuccessAt?: number;
}

export interface ProbeDescriptor {
  kind: string;
  vantage: Vantage;
  capabilities: ProbeCapability[];
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  details?: Record<string, string>;
}

export interface ProbeContext {
  sourceId: string;
  settings: Record<string, unknown>;
  signal: AbortSignal;
  emit(events: ProbeEvent[]): void;
  setStatus(status: ProbeStatus): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface ProbeAdapter {
  descriptor: ProbeDescriptor;
  start(ctx: ProbeContext): Promise<void>;
  testConnection?(settings: Record<string, unknown>, signal: AbortSignal): Promise<TestConnectionResult>;
}

export const surgeSettingsSchema = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
  requestsIntervalMs: z.number().int().min(500).default(2000),
  devicesIntervalMs: z.number().int().min(2000).default(15000),
  trafficIntervalMs: z.number().int().min(1000).default(5000),
});
export type SurgeSettings = z.infer<typeof surgeSettingsSchema>;
