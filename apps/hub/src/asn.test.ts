import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAsnLookup } from './asn.ts';

describe('ASN lookup', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-asn-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('parses sorted IPv4 ranges and skips unrouted, IPv6, and private addresses', () => {
    const path = join(dataDir, 'ip2asn-combined.tsv');
    writeFileSync(
      path,
      [
        '8.8.8.0\t8.8.8.255\t15169\tUS\tGoogle LLC',
        '2606:4700::\t2606:4700:ffff:ffff:ffff:ffff:ffff:ffff\t13335\tUS\tCloudflare, Inc.',
        '1.0.0.0\t1.0.0.255\t13335\tAU\tCloudflare, Inc.',
        '9.9.9.0\t9.9.9.255\t0\tZZ\tNot routed',
        '10.0.0.0\t10.255.255.255\t64512\tZZ\tPrivate network',
      ].join('\n'),
    );

    const lookup = createAsnLookup(path);
    expect(lookup('1.0.0.0')).toEqual({ asn: 13335, org: 'Cloudflare, Inc.' });
    expect(lookup('1.0.0.255')).toEqual({ asn: 13335, org: 'Cloudflare, Inc.' });
    expect(lookup('8.8.8.8')).toEqual({ asn: 15169, org: 'Google LLC' });
    expect(lookup('1.0.1.0')).toBeUndefined();
    expect(lookup('9.9.9.9')).toBeUndefined();
    expect(lookup('10.0.0.1')).toBeUndefined();
    expect(lookup('2606:4700:4700::1111')).toBeUndefined();
  });

  it('disables a missing database after the first lazy load attempt', () => {
    const path = join(dataDir, 'missing.tsv');
    const log = { warn: vi.fn() };
    const lookup = createAsnLookup(path, log);

    expect(lookup('8.8.8.8')).toBeUndefined();
    writeFileSync(path, '8.8.8.0\t8.8.8.255\t15169\tUS\tGoogle LLC\n');
    expect(lookup('8.8.8.8')).toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
