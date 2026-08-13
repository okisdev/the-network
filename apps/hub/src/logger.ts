import { randomUUID } from 'node:crypto';
import type { SystemLogEntry } from '@the-network/schema';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSink = (entry: SystemLogEntry) => void;

export interface Logger {
  log(level: LogLevel, message: string, scope?: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

let sink: LogSink | undefined;
let writingSink = false;

function writeStderr(level: LogLevel, message: string): void {
  process.stderr.write(`${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`);
}

function write(level: LogLevel, message: string, scope = 'hub'): void {
  writeStderr(level, message);
  if (sink === undefined || writingSink) return;
  writingSink = true;
  try {
    sink({ id: randomUUID(), ts: Date.now(), level, scope, message });
  } catch (error) {
    writeStderr('error', `System log sink failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    writingSink = false;
  }
}

export function setLogSink(nextSink?: LogSink): void {
  sink = nextSink;
}

export const logger: Logger = {
  log: write,
  info: (message) => write('info', message),
  warn: (message) => write('warn', message),
  error: (message) => write('error', message),
};
