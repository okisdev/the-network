import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;

export const FLOWS_RETENTION_MS = 14 * DAY_MS;
export const ROLLUP_MINUTE_RETENTION_MS = 48 * 60 * 60 * 1000;
export const ROLLUP_HOUR_RETENTION_MS = 396 * DAY_MS;
export const EVENTS_RETENTION_MS = 90 * DAY_MS;
export const DNS_LOG_RETENTION_MS = 7 * DAY_MS;
export const SYSTEM_LOG_RETENTION_MS = 7 * DAY_MS;

export interface HubConfig {
  port: number;
  dataDir: string;
  consoleDist: string;
  flushIntervalMs: number;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): HubConfig {
  const port = Number(env.TN_PORT ?? 9420);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('TN_PORT must be an integer between 1 and 65535');
  }

  const dataDir = resolve(cwd, env.TN_DATA_DIR ?? './data');
  const consoleDist = env.TN_CONSOLE_DIST
    ? resolve(cwd, env.TN_CONSOLE_DIST)
    : fileURLToPath(new URL('../../console/out/', import.meta.url));
  mkdirSync(dataDir, { recursive: true });

  return {
    port,
    dataDir,
    consoleDist,
    flushIntervalMs: 10_000,
  };
}
