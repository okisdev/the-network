import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/devices.json' with { type: 'json' };
import { mapDevices } from './devices.ts';

const NOW = 1_770_000_100_000;

describe('mapDevices', () => {
  it('maps fixture to 3 presence events with correct names and managed flags', () => {
    const withSkip = {
      devices: [
        ...fixture.devices,
        {
          name: 'no-mac',
          address: '192.168.31.99',
          shouldHandledBySurge: true,
        },
      ],
    };

    const events = mapDevices(withSkip, NOW);
    expect(events).toHaveLength(3);

    expect(events[0]).toMatchObject({
      kind: 'presence',
      ts: NOW,
      event: 'seen',
      device: {
        mac: 'AA:11:22:33:44:55',
        ip: '192.168.31.23',
        name: 'Harry 的 iPhone',
      },
      meta: {
        hostname: 'Harrys-iPhone',
        dhcpName: 'Harrys-iPhone',
        iconId: 'com.apple.iphone',
        managed: true,
      },
    });

    expect(events[1]).toMatchObject({
      device: {
        mac: 'BB:22:33:44:55:66',
        ip: '192.168.31.41',
        name: '客厅电视',
      },
      meta: {
        hostname: 'MiTV',
        dhcpName: 'MiTV',
        iconId: 'generic.tv',
        managed: true,
      },
    });

    expect(events[2]).toMatchObject({
      device: {
        mac: 'CC:33:44:55:66:77',
        ip: '192.168.31.87',
        name: 'espressif-device',
      },
      meta: {
        hostname: 'espressif-device',
        dhcpName: 'espressif-device',
        managed: false,
      },
    });
    expect(events[2]?.meta?.iconId).toBeUndefined();
  });

  it('treats empty-string name as absent when no dhcp hostname', () => {
    const events = mapDevices(
      {
        devices: [
          {
            name: '',
            displayName: '',
            physicalAddress: 'DD:44:55:66:77:88',
            address: '192.168.31.90',
            shouldHandledBySurge: false,
          },
        ],
      },
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.device.name).toBeUndefined();
  });
});
