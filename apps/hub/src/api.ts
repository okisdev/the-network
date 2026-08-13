import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import {
  surgeSettingsSchema,
  type FlowsQuery,
  type LogsQuery,
  type OverviewDto,
  type SourceDto,
  type SourceInput,
  type TimeseriesQuery,
} from '@the-network/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import type { HubConfig } from './config.ts';
import { Pipeline } from './pipeline.ts';
import { ProbeManager } from './probes.ts';
import { Realtime } from './realtime.ts';
import type { SourceRecord } from './store.ts';
import { Store } from './store.ts';

const sourceInputSchema = z.object({
  kind: z.literal('surge'),
  name: z.string().trim().min(1),
  settings: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional(),
});

const sourcePatchSchema = z
  .object({
    kind: z.literal('surge').optional(),
    name: z.string().trim().min(1).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Source patch must not be empty');

const flowsQuerySchema = z.object({
  deviceId: z.string().min(1).optional(),
  search: z.string().optional(),
  policy: z.string().optional(),
  country: z.string().optional(),
  state: z.enum(['active', 'completed', 'failed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const logsQuerySchema = z.object({
  search: z.string().optional(),
  level: z.enum(['info', 'warn', 'error']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const timeseriesQuerySchema = z.object({
  scope: z.string().refine((value): value is TimeseriesQuery['scope'] => value === 'wan' || value.startsWith('device:')),
  minutes: z.coerce.number().int().min(1).max(525_600),
});

export interface ApiOptions {
  config: Pick<HubConfig, 'consoleDist'>;
  store: Store;
  pipeline: Pipeline;
  probes: ProbeManager;
  realtime: Realtime;
}

function parseSettings(kind: string, settings: Record<string, unknown>): Record<string, unknown> {
  if (kind !== 'surge') throw new Error(`Unknown probe kind: ${kind}`);
  return surgeSettingsSchema.parse(settings);
}

function storedSettings(source: SourceRecord): Record<string, unknown> {
  const value: unknown = JSON.parse(source.settingsJson);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function redactSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const apiKey = settings.apiKey;
  if (typeof apiKey !== 'string') return settings;
  return { ...settings, apiKey: `••••${apiKey.slice(-4)}` };
}

function sourceDto(source: SourceRecord, probes: ProbeManager): SourceDto {
  const stats = probes.getStats(source.id);
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    enabled: source.enabled,
    settings: redactSettings(storedSettings(source)),
    status: probes.getStatus(source.id),
    ...stats,
  };
}

export async function createApi(options: ApiOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { store, pipeline, probes, realtime } = options;

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ZodError || message === 'Invalid cursor') {
      return reply.code(400).send({ message });
    }
    return reply.code(500).send({ message });
  });

  app.get('/health', async () => ({ ok: true as const }));

  app.get('/api/overview', async (): Promise<OverviewDto> => {
    const now = Date.now();
    const aggregate = store.getOverview(now);
    const summary = pipeline.getSummary(now);
    const rates = pipeline.deviceRates(now);
    return {
      wan: summary.wan,
      today: summary.today,
      activeDevices: summary.activeDevices,
      totalDevices: aggregate.totalDevices,
      topDevices: aggregate.topDevices.map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        rateIn: rates.get(device.deviceId)?.rateIn ?? 0,
        rateOut: rates.get(device.deviceId)?.rateOut ?? 0,
      })),
      topDestinations: aggregate.topDestinations,
      policySplit: aggregate.policySplit,
      events: store.latestEvents(20),
    };
  });

  app.get('/api/devices', async () => store.listDeviceDtos(pipeline.deviceRates()));

  app.get<{ Params: { id: string } }>('/api/devices/:id', async (request, reply) => {
    const device = store
      .listDeviceDtos(pipeline.deviceRates())
      .find((candidate) => candidate.id === request.params.id);
    if (device === undefined) return reply.code(404).send({ message: 'Device not found' });
    return device;
  });

  app.get('/api/flows', async (request) => {
    const query = flowsQuerySchema.parse(request.query) as FlowsQuery & { country?: string };
    return store.listFlows(query);
  });

  app.get('/api/destinations', async () => store.getDestinations());

  app.get<{ Params: { code: string } }>('/api/destinations/:code/devices', async (request) =>
    store.getCountryDevices(request.params.code.toUpperCase()),
  );

  app.get('/api/logs/dns', async (request) => {
    const query = logsQuerySchema.parse(request.query) as LogsQuery;
    return store.listDnsLog(query);
  });

  app.get('/api/logs/system', async (request) => {
    const query = logsQuerySchema.parse(request.query) as LogsQuery;
    return store.listSystemLog(query);
  });

  app.get('/api/timeseries', async (request) => {
    const query = timeseriesQuerySchema.parse(request.query);
    return store.timeseries(query.scope, query.minutes);
  });

  app.get('/api/sources', async () => store.listSources().map((source) => sourceDto(source, probes)));

  app.post('/api/sources', async (request, reply) => {
    const input = sourceInputSchema.parse(request.body) as SourceInput;
    const settings = parseSettings(input.kind, input.settings);
    const source = store.createSource({
      id: randomUUID(),
      kind: input.kind,
      name: input.name,
      enabled: input.enabled ?? true,
      settingsJson: JSON.stringify(settings),
      createdAt: Date.now(),
    });
    if (source.enabled) probes.start(source.id);
    return reply.code(201).send(sourceDto(source, probes));
  });

  app.patch<{ Params: { id: string } }>('/api/sources/:id', async (request, reply) => {
    const current = store.getSource(request.params.id);
    if (current === undefined) return reply.code(404).send({ message: 'Source not found' });
    const patch = sourcePatchSchema.parse(request.body);
    const kind = patch.kind ?? current.kind;
    const settings =
      patch.settings === undefined
        ? storedSettings(current)
        : parseSettings(kind, { ...storedSettings(current), ...patch.settings });
    const updated = store.updateSource(current.id, {
      kind,
      name: patch.name ?? current.name,
      enabled: patch.enabled ?? current.enabled,
      settingsJson: JSON.stringify(settings),
    })!;
    probes.restart(updated.id);
    return sourceDto(updated, probes);
  });

  app.delete<{ Params: { id: string } }>('/api/sources/:id', async (request, reply) => {
    if (store.getSource(request.params.id) === undefined) {
      return reply.code(404).send({ message: 'Source not found' });
    }
    probes.stop(request.params.id);
    store.deleteSource(request.params.id);
    return { ok: true };
  });

  app.post('/api/sources/test', async (request) => {
    const input = sourceInputSchema.parse(request.body) as SourceInput;
    const settings = parseSettings(input.kind, input.settings);
    return probes.testConnection(input.kind, settings, 10_000);
  });

  app.get('/api/stream', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const unsubscribe = realtime.subscribe(reply);
    request.raw.once('close', unsubscribe);
  });

  const consoleRoot = options.config.consoleDist;
  const indexPath = join(consoleRoot, 'index.html');
  const hasConsole = existsSync(consoleRoot) && existsSync(indexPath);
  if (hasConsole) {
    await app.register(fastifyStatic, { root: consoleRoot });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api') && hasConsole) {
      const pathOnly = request.url.split('?')[0] ?? '/';
      if (pathOnly.includes('..')) {
        return reply.code(404).send({ message: 'Not found' });
      }
      const normalized = pathOnly === '/' ? '/' : pathOnly.replace(/\/+$/, '') || '/';
      const candidates =
        normalized === '/'
          ? ['index.html']
          : [`${normalized.slice(1)}.html`, `${normalized.slice(1)}/index.html`];
      for (const candidate of candidates) {
        if (existsSync(join(consoleRoot, candidate))) {
          return reply.type('text/html').sendFile(candidate);
        }
      }
      if (existsSync(join(consoleRoot, '404.html'))) {
        return reply.code(404).type('text/html').sendFile('404.html');
      }
      return reply.code(404).send({ message: 'Not found' });
    }
    return reply.code(404).send({ message: 'Not found' });
  });

  return app;
}
