import { randomUUID } from 'node:crypto';
import type { DeviceHint, EventDto, PresenceEvent } from '@the-network/schema';
import type { DeviceRecord } from './store.ts';
import { Store } from './store.ts';

function normalizeMac(mac: string): string {
  return mac.trim().toLowerCase();
}

const SOURCE_HOST_TTL_MS = 60_000;

export class Identity {
  private readonly sourceHosts = new Map<string, { host: string | undefined; at: number }>();

  constructor(private readonly store: Store) {}

  private sourceHost(sourceId: string): string | undefined {
    const cached = this.sourceHosts.get(sourceId);
    const now = Date.now();
    if (cached !== undefined && now - cached.at < SOURCE_HOST_TTL_MS) return cached.host;
    let host: string | undefined;
    const source = this.store.getSource(sourceId);
    if (source !== undefined) {
      try {
        const settings = JSON.parse(source.settingsJson) as { url?: unknown };
        if (typeof settings.url === 'string' && settings.url !== '') {
          const normalized = settings.url.includes('://') ? settings.url : `http://${settings.url}`;
          host = new URL(normalized).hostname;
        }
      } catch {}
    }
    this.sourceHosts.set(sourceId, { host, at: now });
    return host;
  }

  private isGatewayAddress(ip: string | undefined, sourceId: string | undefined): boolean {
    if (ip === '127.0.0.1' || ip === '::1') return true;
    if (ip === undefined || sourceId === undefined) return false;
    return ip === this.sourceHost(sourceId);
  }

  resolveDeviceId(hint: DeviceHint, ts: number, sourceId?: string): string {
    let effectiveHint = hint;
    if (sourceId !== undefined && this.isGatewayAddress(hint.ip, sourceId)) {
      const source = this.store.getSource(sourceId);
      effectiveHint = {
        ...hint,
        mac: `gateway:${sourceId}`,
        name: `${source?.name ?? 'Gateway'} (local)`,
      };
    } else if (sourceId !== undefined && hint.mac === undefined && hint.ip === undefined) {
      const source = this.store.getSource(sourceId);
      effectiveHint = {
        mac: `unattributed:${sourceId}`,
        name: `${source?.name ?? 'Gateway'} (unattributed)`,
      };
    }

    if (effectiveHint.mac) {
      const mac = normalizeMac(effectiveHint.mac);
      const existing = this.store.getDeviceByMac(mac);
      const device = this.store.upsertDevice({
        id: existing?.id ?? randomUUID(),
        mac,
        ...(effectiveHint.ip === undefined ? {} : { ip: effectiveHint.ip }),
        ...(effectiveHint.name === undefined ? {} : { name: effectiveHint.name }),
        firstSeenAt: existing?.firstSeenAt ?? ts,
        lastSeenAt: ts,
      });
      if (effectiveHint.ip) this.store.bindDeviceIp(device.id, effectiveHint.ip, ts);
      return device.id;
    }

    if (effectiveHint.ip) {
      const deviceId = this.store.getDeviceIdByIp(effectiveHint.ip);
      if (deviceId !== undefined) {
        this.store.touchDevice(deviceId, ts, effectiveHint.name);
        return deviceId;
      }
    }

    const id = randomUUID();
    const device = this.store.upsertDevice({
      id,
      ...(effectiveHint.ip === undefined ? {} : { ip: effectiveHint.ip }),
      name: effectiveHint.name ?? effectiveHint.ip ?? 'Unknown device',
      firstSeenAt: ts,
      lastSeenAt: ts,
    });
    if (effectiveHint.ip) this.store.bindDeviceIp(device.id, effectiveHint.ip, ts);
    return device.id;
  }

  applyPresence(
    event: PresenceEvent,
    sourceId: string,
  ): { joined?: EventDto; merge?: { fromId: string; toId: string } } {
    const effectiveDevice = this.isGatewayAddress(event.device.ip, sourceId)
      ? {
          ...event.device,
          mac: `gateway:${sourceId}`,
          name: `${this.store.getSource(sourceId)?.name ?? 'Gateway'} (local)`,
        }
      : event.device;
    const mac = effectiveDevice.mac ? normalizeMac(effectiveDevice.mac) : undefined;
    const existing = mac === undefined ? undefined : this.store.getDeviceByMac(mac);
    const isSeen = event.event === 'seen';
    const idleLastSeen = event.meta?.lastActiveAt ?? existing?.lastSeenAt ?? event.ts;
    const lastSeenAt = isSeen ? event.ts : idleLastSeen;
    const id = existing?.id ?? randomUUID();
    const name =
      event.meta?.hostname ??
      event.meta?.dhcpName ??
      effectiveDevice.name ??
      effectiveDevice.ip ??
      existing?.name ??
      'Unknown device';
    let device: DeviceRecord;
    let merge: { fromId: string; toId: string } | undefined;

    if (mac === undefined) {
      const resolvedId = this.resolveDeviceId({ ...effectiveDevice, name }, event.ts, sourceId);
      device = this.store.upsertDevice({
        id: resolvedId,
        name,
        ...(effectiveDevice.ip === undefined ? {} : { ip: effectiveDevice.ip }),
        ...(event.meta?.vendor === undefined ? {} : { vendor: event.meta.vendor }),
        ...(event.meta?.iconId === undefined ? {} : { iconId: event.meta.iconId }),
        ...(event.meta?.managed === undefined ? {} : { managed: event.meta.managed }),
        firstSeenAt: this.store.getDeviceById(resolvedId)?.firstSeenAt ?? event.ts,
        lastSeenAt,
      });
    } else {
      device = this.store.upsertDevice({
        id,
        mac,
        name,
        ...(effectiveDevice.ip === undefined ? {} : { ip: effectiveDevice.ip }),
        ...(event.meta?.vendor === undefined ? {} : { vendor: event.meta.vendor }),
        ...(event.meta?.iconId === undefined ? {} : { iconId: event.meta.iconId }),
        ...(event.meta?.managed === undefined ? {} : { managed: event.meta.managed }),
        firstSeenAt: existing?.firstSeenAt ?? event.ts,
        lastSeenAt,
      });
      if (effectiveDevice.ip) {
        const priorDeviceId = this.store.getDeviceIdByIp(effectiveDevice.ip);
        const priorDevice =
          priorDeviceId === undefined ? undefined : this.store.getDeviceById(priorDeviceId);
        if (priorDeviceId !== undefined && priorDeviceId !== device.id && priorDevice?.mac === undefined) {
          this.store.mergeDevices(priorDeviceId, device.id);
          merge = { fromId: priorDeviceId, toId: device.id };
        }
      }
    }

    if (effectiveDevice.ip) this.store.bindDeviceIp(device.id, effectiveDevice.ip, event.ts);
    const joined =
      mac === undefined || existing !== undefined || !isSeen
        ? undefined
        : this.store.insertEvent({
            id: randomUUID(),
            ts: event.ts,
            kind: 'device_joined',
            message: `${device.name} joined the network`,
            deviceId: device.id,
            sourceId,
          });
    return {
      ...(joined === undefined ? {} : { joined }),
      ...(merge === undefined ? {} : { merge }),
    };
  }
}
