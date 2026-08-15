import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import {
  surgeSettingsSchema,
  type AuthStatusDto,
  type CatalogDomainDto,
  type DeviceDetailDto,
  type FlowsQuery,
  type LogsQuery,
  type OverviewDto,
  type RuleListCoverageDto,
  type RulesInventoryDto,
  type SourceHealthPoint,
  type SourceDto,
  type SourceInput,
  type SystemDbDto,
  type TimeseriesQuery,
} from '@the-network/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { createAsnLookup } from './asn.ts';
import { FLOWS_RETENTION_MS, type HubConfig } from './config.ts';
import { logger } from './logger.ts';
import { Pipeline } from './pipeline.ts';
import { ProbeManager } from './probes.ts';
import { Realtime } from './realtime.ts';
import {
  buildListCoverage,
  loadProfile,
  loadRepoLists,
  type ParsedRuleList,
  type ParsedSurgeProfile,
} from './rules.ts';
import type { DnsLogsQuery, ExplicitWindow, SourceRecord } from './store.ts';
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
  proto: z.enum(['tcp', 'udp', 'other']).optional(),
  port: z.coerce.number().int().min(0).max(65_535).optional(),
  process: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const windowFields = {
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
};

function validateWindow(
  value: { from?: number; to?: number },
  context: z.RefinementCtx,
): void {
  if ((value.from === undefined) !== (value.to === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from and to must be provided together',
    });
  } else if (value.from !== undefined && value.to !== undefined && value.to <= value.from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'to must be greater than from',
      path: ['to'],
    });
  }
}

function explicitWindow(value: { from?: number; to?: number }): ExplicitWindow | undefined {
  return value.from === undefined || value.to === undefined
    ? undefined
    : { from: value.from, to: value.to };
}

const logsQuerySchema = z.object({
  search: z.string().optional(),
  level: z.enum(['info', 'warn', 'error']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const dnsLogsQuerySchema = logsQuerySchema.omit({ level: true }).extend({
  source: z.enum(['cache', 'server']).optional(),
  server: z.string().min(1).optional(),
  unanswered: z
    .literal('1')
    .transform(() => true)
    .optional(),
});

const timeseriesQuerySchema = z
  .object({
    scope: z
      .string()
      .refine(
        (value): value is TimeseriesQuery['scope'] =>
          value === 'wan' ||
          ['device:', 'policy:', 'host:', 'country:'].some((prefix) => value.startsWith(prefix)),
      ),
    minutes: z.coerce.number().int().min(1).max(525_600),
    ...windowFields,
  })
  .superRefine(validateWindow);

const minutesSchema = z.coerce.number().int().min(1).max(525_600);

const minutesQuerySchema = z
  .object({ minutes: minutesSchema, ...windowFields })
  .superRefine(validateWindow);

const dnsQnameQuerySchema = z
  .object({
    name: z.string().trim().min(1),
    minutes: minutesSchema,
    ...windowFields,
  })
  .superRefine(validateWindow);

const deviceDetailParamsSchema = z.object({ id: z.string().min(1) });

const hostDetailParamsSchema = z.object({ host: z.string().trim().min(1) });

const sourceHealthParamsSchema = z.object({ id: z.string().min(1) });

const multiTimeseriesQuerySchema = z
  .object({
    scope: z.enum(['device', 'policy']),
    minutes: minutesSchema,
    limit: z.coerce.number().int().min(1).max(12).default(5),
    ...windowFields,
  })
  .superRefine(validateWindow);

const breakdownQuerySchema = z
  .object({
    dim: z.enum(['process', 'port', 'proto', 'rule', 'policy', 'country', 'host', 'domain', 'ip', 'asn']),
    minutes: minutesSchema,
    deviceId: z.string().min(1).optional(),
    policy: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    ...windowFields,
  })
  .superRefine(validateWindow);

const catalogDomainsQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const sankeyQuerySchema = z
  .object({
    minutes: minutesSchema,
    limit: z.coerce.number().int().min(1).max(12).default(8),
    ...windowFields,
  })
  .superRefine(validateWindow);

const chainsQuerySchema = z
  .object({
    minutes: minutesSchema,
    limit: z.coerce.number().int().min(1).max(30).default(12),
    ...windowFields,
  })
  .superRefine(validateWindow);

const punchcardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(28),
});

const dailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(30),
});

const moversQuerySchema = z
  .object({ minutes: minutesSchema, ...windowFields })
  .superRefine(validateWindow);

const firstSeenQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

const rejectedQuerySchema = z
  .object({ minutes: minutesSchema, ...windowFields })
  .superRefine(validateWindow);

const loginBodySchema = z.object({ token: z.string() });

const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i;
const faviconParamsSchema = z.object({ domain: z.string().regex(hostnamePattern) });

const SESSION_COOKIE = 'tn_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const FAVICON_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
const FAVICON_NEGATIVE_MS = 60 * 60 * 1_000;
const FAVICON_TIMEOUT_MS = 4_000;
const RULES_CACHE_MS = 60_000;

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function tokensEqual(left: string, right: string): boolean {
  return timingSafeEqual(tokenDigest(left), tokenDigest(right));
}

function sessionSignature(expires: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(`tn|${expires}`).digest();
}

function createSessionCookie(authToken: string): string {
  const expires = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1_000);
  const signature = sessionSignature(expires, tokenDigest(authToken)).toString('hex');
  return `${SESSION_COOKIE}=${expires}.${signature}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function validSession(value: string | undefined, authToken: string): boolean {
  if (value === undefined) return false;
  const match = /^(\d+)\.([0-9a-f]{64})$/.exec(value);
  if (match === null) return false;
  const [, expires, signature] = match;
  if (expires === undefined || signature === undefined || Number(expires) <= Date.now()) return false;
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    sessionSignature(expires, tokenDigest(authToken)),
  );
}

function validCredentials(
  cookieHeader: string | undefined,
  authorization: string | undefined,
  authToken: string,
): boolean {
  const session = parseCookies(cookieHeader).get(SESSION_COOKIE);
  if (validSession(session, authToken)) return true;
  return authorization?.startsWith('Bearer ') === true && tokensEqual(authorization.slice(7), authToken);
}

export interface ApiOptions {
  config: Pick<
    HubConfig,
    | 'consoleDist'
    | 'authToken'
    | 'dataDir'
    | 'faviconsEnabled'
    | 'surgeProfilePath'
    | 'surgeListsDir'
  > &
    Partial<Pick<HubConfig, 'asnDbPath'>>;
  store: Store;
  pipeline: Pipeline;
  probes: ProbeManager;
  realtime: Realtime;
  fetch?: typeof fetch;
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
  if (options.config.asnDbPath !== undefined) {
    store.configureDnsEnrichment({
      asnLookup: createAsnLookup(options.config.asnDbPath, logger),
    });
  }
  const authToken = options.config.authToken;
  const fetchFavicon = options.fetch ?? globalThis.fetch;
  const faviconDir = join(options.config.dataDir, 'favicons');
  const faviconMisses = new Map<string, number>();
  let rulesCache:
    | { expiresAt: number; profile: ParsedSurgeProfile | undefined; lists: ParsedRuleList[] }
    | undefined;

  const rulesFiles = async (): Promise<{
    profile: ParsedSurgeProfile | undefined;
    lists: ParsedRuleList[];
  }> => {
    const now = Date.now();
    if (rulesCache !== undefined && rulesCache.expiresAt > now) return rulesCache;
    let profile: ParsedSurgeProfile | undefined;
    try {
      profile = await loadProfile(options.config.surgeProfilePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const lists = await loadRepoLists(options.config.surgeListsDir);
    rulesCache = { expiresAt: now + RULES_CACHE_MS, profile, lists };
    return rulesCache;
  };

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ZodError || message === 'Invalid cursor') {
      return reply.code(400).send({ message });
    }
    return reply.code(500).send({ message });
  });

  app.addHook('preHandler', async (request, reply) => {
    if (
      authToken === undefined ||
      !request.url.startsWith('/api/') ||
      request.url.startsWith('/api/auth/')
    ) {
      return;
    }
    if (validCredentials(request.headers.cookie, request.headers.authorization, authToken)) return;
    return reply.code(401).send({ message: 'Unauthorized' });
  });

  app.get('/health', async () => ({ ok: true as const }));

  app.get<{ Params: { domain: string } }>('/api/favicon/:domain', async (request, reply) => {
    const { domain: inputDomain } = faviconParamsSchema.parse(request.params);
    if (!options.config.faviconsEnabled) return reply.code(404).send({ message: 'Not found' });
    const domain = inputDomain.toLowerCase();
    const now = Date.now();
    if ((faviconMisses.get(domain) ?? 0) > now) {
      return reply.code(404).send({ message: 'Not found' });
    }

    const cachePath = join(faviconDir, `${domain}.ico`);
    try {
      const cacheStat = await stat(cachePath);
      if (now - cacheStat.mtimeMs < FAVICON_FRESH_MS) {
        const icon = await readFile(cachePath);
        return reply
          .type('image/x-icon')
          .header('cache-control', 'public,max-age=86400')
          .send(icon);
      }
    } catch {}

    try {
      const response = await fetchFavicon(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
        signal: AbortSignal.timeout(FAVICON_TIMEOUT_MS),
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (response.status !== 200 || !/^image\//i.test(contentType)) {
        throw new Error(`Invalid favicon response: HTTP ${response.status}`);
      }
      const icon = Buffer.from(await response.arrayBuffer());
      await mkdir(faviconDir, { recursive: true });
      await writeFile(cachePath, icon);
      faviconMisses.delete(domain);
      return reply
        .type('image/x-icon')
        .header('cache-control', 'public,max-age=86400')
        .send(icon);
    } catch {
      faviconMisses.set(domain, now + FAVICON_NEGATIVE_MS);
      return reply.code(404).send({ message: 'Not found' });
    }
  });

  app.get('/api/auth/status', async (request): Promise<AuthStatusDto> => ({
    enabled: authToken !== undefined,
    authenticated:
      authToken !== undefined &&
      validCredentials(request.headers.cookie, request.headers.authorization, authToken),
  }));

  app.post('/api/auth/login', async (request, reply): Promise<AuthStatusDto> => {
    const { token } = loginBodySchema.parse(request.body);
    if (authToken === undefined) return { enabled: false, authenticated: true };
    if (!tokensEqual(token, authToken)) {
      return reply.code(401).send({ message: 'Invalid token' });
    }
    reply.header('set-cookie', createSessionCookie(authToken));
    return { enabled: true, authenticated: true };
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.header(
      'set-cookie',
      `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    );
    return { ok: true as const };
  });

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
      flowsActive: pipeline.activeFlowCount(),
      rejectedToday: aggregate.rejectedToday,
      dnsToday: aggregate.dnsToday,
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

  app.get('/api/system/db', async (): Promise<SystemDbDto> => store.getDatabaseInfo());

  app.get('/api/rules', async (): Promise<RulesInventoryDto> => {
    const { profile, lists } = await rulesFiles();
    if (profile === undefined) return { available: false, groups: [], rules: [], lists: [] };
    const since = Date.now() - FLOWS_RETENTION_MS;
    const ruleAggregates = new Map(
      store.getRulesAggregates(since).map((aggregate) => [aggregate.key, aggregate]),
    );
    const groupBytes = new Map<string, number>();
    for (const rule of profile.rules) {
      groupBytes.set(
        rule.policy,
        (groupBytes.get(rule.policy) ?? 0) + (ruleAggregates.get(rule.displayKey)?.bytes ?? 0),
      );
    }
    const groupNames = new Set(profile.groups.map((group) => group.name));
    const coverageObservations = store.getRulesCoverageObservations(since);
    return {
      available: true,
      groups: profile.groups.map((group) => ({
        name: group.name,
        type: group.type,
        members: group.members.map((name) => ({ name, isGroup: groupNames.has(name) })),
        bytes: groupBytes.get(group.name) ?? 0,
      })),
      rules: profile.rules.map((rule) => {
        const aggregate = ruleAggregates.get(rule.displayKey);
        return {
          ...rule,
          hits: aggregate?.hits ?? 0,
          bytes: aggregate?.bytes ?? 0,
          ...(aggregate === undefined ? {} : { lastHit: aggregate.lastHit }),
        };
      }),
      lists: lists.map((list) => ({
        name: list.name,
        path: list.path,
        entries: list.entries.length,
        matched: buildListCoverage(list, coverageObservations).matched,
      })),
    };
  });

  app.get<{ Params: { list: string } }>(
    '/api/rules/coverage/:list',
    async (request, reply): Promise<RuleListCoverageDto> => {
      const { lists } = await rulesFiles();
      const list = lists.find((candidate) => candidate.name === request.params.list);
      if (list === undefined) return reply.code(404).send({ message: 'Rule list not found' });
      return buildListCoverage(
        list,
        store.getRulesCoverageObservations(Date.now() - FLOWS_RETENTION_MS),
      );
    },
  );

  app.get('/api/devices', async () => store.listDeviceDtos(pipeline.deviceRates()));

  app.get<{ Params: { id: string } }>('/api/devices/:id/detail', async (request, reply) => {
    const { id } = deviceDetailParamsSchema.parse(request.params);
    const query = minutesQuerySchema.parse(request.query);
    const window = explicitWindow(query);
    const { minutes } = query;
    const now = Date.now();
    const device = store
      .listDeviceDtos(pipeline.deviceRates(now), now)
      .find((candidate) => candidate.id === id);
    if (device === undefined) return reply.code(404).send({ message: 'Device not found' });
    const detail: DeviceDetailDto = {
      device,
      series: store.timeseries(`device:${id}`, minutes, now, window),
      topHosts: store.deviceRollupBreakdown(id, 'host', minutes, 10, now, window),
      topCountries: store.deviceRollupBreakdown(id, 'country', minutes, 8, now, window),
      topProcesses: store.breakdown('process', minutes, id, 8, now, window).rows,
      topPorts: store.breakdown('port', minutes, id, 8, now, window).rows,
      policySplit: store.devicePolicySplit(id, minutes, 6, now, window),
      presence: store.listPresence(id, window?.from ?? now - minutes * 60_000, window?.to ?? now),
      recentFlows: store.listFlows({ deviceId: id, limit: 15, ...window }).flows,
    };
    return detail;
  });

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

  app.get('/api/catalog/domains', async (request): Promise<CatalogDomainDto[]> => {
    const query = catalogDomainsQuerySchema.parse(request.query);
    return store.searchCatalogDomains(query.q, query.limit);
  });

  app.get('/api/destinations/cities', async (request) => {
    const query = minutesQuerySchema.parse(request.query);
    return store.listCities(query.minutes, undefined, explicitWindow(query));
  });

  app.get<{ Params: { code: string } }>('/api/destinations/:code/devices', async (request) =>
    store.getCountryDevices(request.params.code.toUpperCase()),
  );

  app.get('/api/logs/dns', async (request) => {
    const query = dnsLogsQuerySchema.parse(request.query) as DnsLogsQuery;
    return store.listDnsLog(query);
  });

  app.get('/api/dns/summary', async (request) => {
    const query = minutesQuerySchema.parse(request.query);
    return store.dnsSummary(query.minutes, undefined, explicitWindow(query));
  });

  app.get('/api/dns/qname', async (request) => {
    const query = dnsQnameQuerySchema.parse(request.query);
    return store.dnsQnameDetail(query.name, query.minutes, undefined, explicitWindow(query));
  });

  app.get<{ Params: { host: string } }>('/api/hosts/:host', async (request) => {
    const { host } = hostDetailParamsSchema.parse(request.params);
    const query = minutesQuerySchema.parse(request.query);
    return store.hostDetail(host, query.minutes, undefined, explicitWindow(query));
  });

  app.get('/api/logs/system', async (request) => {
    const query = logsQuerySchema.parse(request.query) as LogsQuery;
    return store.listSystemLog(query);
  });

  app.get('/api/timeseries', async (request) => {
    const query = timeseriesQuerySchema.parse(request.query);
    return store.timeseries(query.scope, query.minutes, undefined, explicitWindow(query));
  });

  app.get('/api/timeseries/multi', async (request) => {
    const query = multiTimeseriesQuerySchema.parse(request.query);
    return store.multiTimeseries(
      query.scope,
      query.minutes,
      query.limit,
      undefined,
      explicitWindow(query),
    );
  });

  app.get('/api/breakdown', async (request) => {
    const query = breakdownQuerySchema.parse(request.query);
    return store.breakdown(
      query.dim,
      query.minutes,
      query.deviceId,
      query.limit,
      undefined,
      explicitWindow(query),
      query.policy,
    );
  });

  app.get('/api/sankey', async (request) => {
    const query = sankeyQuerySchema.parse(request.query);
    return store.sankey(query.minutes, query.limit, undefined, explicitWindow(query));
  });

  app.get('/api/chains', async (request) => {
    const query = chainsQuerySchema.parse(request.query);
    return store.decisionChains(query.minutes, query.limit, undefined, explicitWindow(query));
  });

  app.get('/api/insights/punchcard', async (request) => {
    const query = punchcardQuerySchema.parse(request.query);
    return store.punchcard(query.days);
  });

  app.get('/api/insights/daily', async (request) => {
    const query = dailyQuerySchema.parse(request.query);
    return store.daily(query.days);
  });

  app.get('/api/insights/movers', async (request) => {
    const query = moversQuerySchema.parse(request.query);
    return store.movers(query.minutes, undefined, explicitWindow(query));
  });

  app.get('/api/insights/firstseen', async (request) => {
    const query = firstSeenQuerySchema.parse(request.query);
    return store.firstSeen(query.days);
  });

  app.get('/api/insights/rejected', async (request) => {
    const query = rejectedQuerySchema.parse(request.query);
    return store.rejected(query.minutes, undefined, explicitWindow(query));
  });

  app.get('/api/sources', async () => store.listSources().map((source) => sourceDto(source, probes)));

  app.get<{ Params: { id: string } }>('/api/sources/:id/health', async (request, reply) => {
    const { id } = sourceHealthParamsSchema.parse(request.params);
    if (store.getSource(id) === undefined) {
      return reply.code(404).send({ message: 'Source not found' });
    }
    const query = minutesQuerySchema.parse(request.query);
    const now = Date.now();
    const window = explicitWindow(query);
    return store.listSourceHealth(
      id,
      window?.from ?? now - query.minutes * 60_000,
      window?.to ?? now,
    ) satisfies SourceHealthPoint[];
  });

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
