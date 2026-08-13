import { pathToFileURL } from 'node:url';
import { createApi } from './api.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { Identity } from './identity.ts';
import { logger, setLogSink } from './logger.ts';
import { Pipeline } from './pipeline.ts';
import { ProbeManager } from './probes.ts';
import { Realtime } from './realtime.ts';
import { Store } from './store.ts';

export async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dataDir);
  const store = new Store(db);
  setLogSink((entry) => store.appendSystemLog(entry));
  const identity = new Identity(store);
  const pipeline = new Pipeline(store, identity, {
    flushIntervalMs: config.flushIntervalMs,
    logger,
  });
  const realtime = new Realtime(pipeline);
  const probes = new ProbeManager(store, pipeline, { logger });
  const app = await createApi({ config, store, pipeline, probes, realtime });
  probes.startEnabled();

  const retentionTimer = setInterval(() => {
    try {
      store.sweepRetention();
    } catch (error) {
      logger.error(`Retention sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 60 * 60 * 1_000);
  retentionTimer.unref();

  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    probes.stopAll();
    pipeline.stop();
    try {
      pipeline.flush();
    } catch (error) {
      logger.error(`Final pipeline flush failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    clearInterval(retentionTimer);
    realtime.close();
    await app.close();
    setLogSink();
    db.close();
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  try {
    await app.listen({ host: '0.0.0.0', port: config.port });
    logger.info(`Hub listening on 0.0.0.0:${config.port}`);
  } catch (error) {
    logger.error(`Hub failed to start: ${error instanceof Error ? error.message : String(error)}`);
    await shutdown();
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
