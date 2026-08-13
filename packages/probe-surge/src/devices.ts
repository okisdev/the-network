import { z } from 'zod';
import type { PresenceEvent } from '@the-network/schema';

const ACTIVE_WINDOW_S = 300;

const dhcpSchema = z
  .object({
    hostname: z.string().optional(),
    icon: z.string().optional(),
    assignedIP: z.string().optional(),
    lastSeenDate: z.number().optional(),
  })
  .passthrough()
  .optional();

const deviceSchema = z
  .object({
    name: z.string().optional(),
    displayName: z.string().optional(),
    physicalAddress: z.string().optional(),
    address: z.string().optional(),
    shouldHandledBySurge: z.boolean().optional(),
    hasProxyConnection: z.boolean().optional(),
    activeConnections: z.number().optional(),
    currentInSpeed: z.number().optional(),
    currentOutSpeed: z.number().optional(),
    dhcpDevice: dhcpSchema,
  })
  .passthrough();

const payloadSchema = z
  .object({
    devices: z.array(z.unknown()),
  })
  .passthrough();

function nonEmpty(s: string | undefined): string | undefined {
  if (s === undefined || s === '') return undefined;
  return s;
}

export function mapDevices(payload: unknown, nowMs: number): PresenceEvent[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];

  const events: PresenceEvent[] = [];

  for (const raw of parsed.data.devices) {
    const rec = deviceSchema.safeParse(raw);
    if (!rec.success) continue;

    const d = rec.data;
    const mac = nonEmpty(d.physicalAddress);
    if (mac === undefined) continue;

    const ip = nonEmpty(d.address) ?? nonEmpty(d.dhcpDevice?.assignedIP);
    const name =
      nonEmpty(d.displayName) ?? nonEmpty(d.name) ?? nonEmpty(d.dhcpDevice?.hostname);

    const hostname = nonEmpty(d.dhcpDevice?.hostname);
    const iconId = nonEmpty(d.dhcpDevice?.icon);
    const lastSeenS = d.dhcpDevice?.lastSeenDate;
    const active =
      d.hasProxyConnection === true ||
      (d.activeConnections ?? 0) > 0 ||
      (d.currentInSpeed ?? 0) + (d.currentOutSpeed ?? 0) > 0 ||
      (lastSeenS !== undefined && nowMs / 1_000 - lastSeenS < ACTIVE_WINDOW_S);
    const lastActiveAt = lastSeenS === undefined ? undefined : Math.round(lastSeenS * 1_000);

    events.push({
      kind: 'presence',
      ts: nowMs,
      device: {
        mac,
        ...(ip !== undefined ? { ip } : {}),
        ...(name !== undefined ? { name } : {}),
      },
      event: active ? 'seen' : 'lease',
      meta: {
        ...(hostname !== undefined ? { hostname, dhcpName: hostname } : {}),
        ...(iconId !== undefined ? { iconId } : {}),
        ...(d.shouldHandledBySurge !== undefined
          ? { managed: d.shouldHandledBySurge }
          : {}),
        ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
      },
    });
  }

  return events;
}
