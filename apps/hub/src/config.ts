import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;

export const FLOWS_RETENTION_MS = 14 * DAY_MS;
export const ROLLUP_MINUTE_RETENTION_MS = 48 * 60 * 60 * 1000;
export const ROLLUP_HOUR_RETENTION_MS = 396 * DAY_MS;
export const EVENTS_RETENTION_MS = 90 * DAY_MS;
export const DNS_LOG_RETENTION_MS = 7 * DAY_MS;
export const SYSTEM_LOG_RETENTION_MS = 7 * DAY_MS;
export const SOURCE_HEALTH_RETENTION_MS = 30 * DAY_MS;

export interface HubConfig {
  port: number;
  dataDir: string;
  asnDbPath: string;
  consoleDist: string;
  flushIntervalMs: number;
  authToken?: string;
  notifyWebhookUrl?: string;
  notifyBarkUrl?: string;
  notifyRejectedThreshold: number;
  faviconsEnabled: boolean;
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
  const asnDbPath = env.TN_ASN_DB
    ? resolve(cwd, env.TN_ASN_DB)
    : join(dataDir, 'ip2asn-combined.tsv');
  const consoleDist = env.TN_CONSOLE_DIST
    ? resolve(cwd, env.TN_CONSOLE_DIST)
    : fileURLToPath(new URL('../../console/out/', import.meta.url));
  const authToken = env.TN_AUTH_TOKEN?.trim() || undefined;
  const notifyWebhookUrl = env.TN_NOTIFY_WEBHOOK?.trim() || undefined;
  const notifyBarkUrl = env.TN_NOTIFY_BARK?.trim() || undefined;
  const notifyRejectedThreshold = Number(env.TN_NOTIFY_REJECTED_THRESHOLD ?? 50);
  if (!Number.isInteger(notifyRejectedThreshold) || notifyRejectedThreshold < 1) {
    throw new Error('TN_NOTIFY_REJECTED_THRESHOLD must be a positive integer');
  }
  const faviconsEnabled = env.TN_FAVICONS?.trim().toLowerCase() !== 'off';
  mkdirSync(dataDir, { recursive: true });

  return {
    port,
    dataDir,
    asnDbPath,
    consoleDist,
    flushIntervalMs: 10_000,
    notifyRejectedThreshold,
    faviconsEnabled,
    ...(authToken === undefined ? {} : { authToken }),
    ...(notifyWebhookUrl === undefined ? {} : { notifyWebhookUrl }),
    ...(notifyBarkUrl === undefined ? {} : { notifyBarkUrl }),
  };
}
