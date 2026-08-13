import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = 'https://iptoasn.com/data/ip2asn-combined.tsv.gz';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(repoRoot, process.env.TN_DATA_DIR ?? 'data');
const target = resolve(dataDir, 'ip2asn-combined.tsv');
const temporary = resolve(dataDir, `.ip2asn-combined.tsv.${process.pid}.${Date.now()}.tmp`);

await mkdir(dataDir, { recursive: true });

let rows = 0;
let sawData = false;
let lastByte = 0;
const countRows = new Transform({
  transform(chunk, _encoding, callback) {
    sawData ||= chunk.length > 0;
    for (const byte of chunk) {
      if (byte === 10) rows += 1;
      lastByte = byte;
    }
    callback(null, chunk);
  },
  flush(callback) {
    if (sawData && lastByte !== 10) rows += 1;
    callback();
  },
});

try {
  const response = await fetch(source);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createGunzip(),
    countRows,
    createWriteStream(temporary),
  );
  await rename(temporary, target);
  process.stdout.write(`Updated ${target} with ${rows.toLocaleString()} rows\n`);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
