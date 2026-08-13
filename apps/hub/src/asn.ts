import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import type { Logger } from './logger.ts';

export interface AsnResult {
  asn: number;
  org: string;
}

export type AsnLookup = (ip: string) => AsnResult | undefined;

interface AsnTable {
  starts: Uint32Array;
  ends: Uint32Array;
  metadataIndexes: Uint32Array;
  metadata: AsnResult[];
}

function ipv4Number(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return (((octets[0]! * 256 + octets[1]!) * 256 + octets[2]!) * 256 + octets[3]!) >>> 0;
}

function isPrivateOrLoopback(ip: string): boolean {
  const normalized = ip.toLowerCase().split('%', 1)[0] ?? ip.toLowerCase();
  const version = isIP(normalized);
  if (version === 0) return true;
  if (version !== 4) return true;
  const octets = normalized.split('.').map(Number);
  const first = octets[0];
  const second = octets[1];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseTable(contents: string): AsnTable {
  const rows: Array<{ start: number; end: number; metadataIndex: number }> = [];
  const metadata: AsnResult[] = [];
  const metadataByValue = new Map<string, number>();
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const [rangeStart, rangeEnd, asnText, , ...description] = line.split('\t');
    if (rangeStart === undefined || rangeEnd === undefined || asnText === undefined) continue;
    const start = ipv4Number(rangeStart);
    const end = ipv4Number(rangeEnd);
    const asn = Number(asnText);
    if (start === undefined || end === undefined || end < start || !Number.isSafeInteger(asn) || asn <= 0) {
      continue;
    }
    const org = description.join('\t').trim();
    const metadataKey = `${asn}\u0000${org}`;
    let metadataIndex = metadataByValue.get(metadataKey);
    if (metadataIndex === undefined) {
      metadataIndex = metadata.length;
      metadataByValue.set(metadataKey, metadataIndex);
      metadata.push({ asn, org });
    }
    rows.push({ start, end, metadataIndex });
  }
  rows.sort((left, right) => left.start - right.start || left.end - right.end);
  return {
    starts: Uint32Array.from(rows, (row) => row.start),
    ends: Uint32Array.from(rows, (row) => row.end),
    metadataIndexes: Uint32Array.from(rows, (row) => row.metadataIndex),
    metadata,
  };
}

export function createAsnLookup(path: string, log?: Pick<Logger, 'warn'>): AsnLookup {
  let table: AsnTable | undefined;
  let loaded = false;
  return (ip) => {
    if (isPrivateOrLoopback(ip)) return undefined;
    if (!loaded) {
      loaded = true;
      try {
        table = parseTable(readFileSync(path, 'utf8'));
      } catch (error) {
        log?.warn(`ASN database unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (table === undefined) return undefined;
    const target = ipv4Number(ip);
    if (target === undefined) return undefined;
    let low = 0;
    let high = table.starts.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (table.starts[middle]! <= target) low = middle + 1;
      else high = middle - 1;
    }
    if (high < 0 || target > table.ends[high]!) return undefined;
    return table.metadata[table.metadataIndexes[high]!];
  };
}
