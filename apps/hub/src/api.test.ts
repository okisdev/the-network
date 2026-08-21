import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CatalogDomainDto,
  CityPoint,
  DeviceDetailDto,
  DnsQnameDetail,
  DnsSummaryDto,
  FlowsPage,
  HostDetailDto,
  ProbeAdapter,
  RuleListCoverageDto,
  RulesInventoryDto,
  SankeyDto,
  SourceHealthPoint,
  SourceDto,
  SystemDbDto,
} from '@the-network/schema';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { Identity } from './identity.ts';
import { Pipeline } from './pipeline.ts';
import { ProbeManager } from './probes.ts';
import { Realtime } from './realtime.ts';
import { Store } from './store.ts';

const fakeAdapter: ProbeAdapter = {
  descriptor: {
    kind: 'surge',
    vantage: 'gateway',
    capabilities: ['per_device', 'whole_home'],
  },
  async start(ctx) {
    ctx.setStatus({ state: 'ok', lastLatencyMs: 23 });
    await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve(), { once: true }));
  },
  async testConnection() {
    return { ok: true, message: 'Connected' };
  },
};

describe('Hub API', () => {
  let dataDir: string;
  let surgeProfilePath: string;
  let surgeListsDir: string;
  let db: Database.Database;
  let store: Store;
  let pipeline: Pipeline;
  let probes: ProbeManager;
  let realtime: Realtime;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'the-network-hub-api-'));
    surgeProfilePath = join(dataDir, 'surge-profile.conf');
    surgeListsDir = join(dataDir, 'Surge');
    mkdirSync(surgeListsDir, { recursive: true });
    db = openDatabase(dataDir);
    store = new Store(db);
    pipeline = new Pipeline(store, new Identity(store), {
      autoStart: false,
      geoLookup: (ip) => {
        if (ip === '8.8.8.8') return 'US';
        if (ip === '1.1.1.1') return 'AU';
        return undefined;
      },
      rdnsLookup: async () => undefined,
    });
    probes = new ProbeManager(store, pipeline, { adapters: { surge: fakeAdapter } });
    realtime = new Realtime(pipeline);
    app = await createApi({
      config: {
        dataDir,
        consoleDist: join(dataDir, 'missing-console'),
        faviconsEnabled: true,
        surgeProfilePath,
        surgeListsDir,
      },
      store,
      pipeline,
      probes,
      realtime,
    });
  });

  async function recreateApp(
    options: { authToken?: string; faviconsEnabled?: boolean; fetch?: typeof fetch } = {},
  ): Promise<void> {
    await app.close();
    app = await createApi({
      config: {
        dataDir,
        consoleDist: join(dataDir, 'missing-console'),
        faviconsEnabled: options.faviconsEnabled ?? true,
        surgeProfilePath,
        surgeListsDir,
        ...(options.authToken === undefined ? {} : { authToken: options.authToken }),
      },
      store,
      pipeline,
      probes,
      realtime,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  afterEach(async () => {
    probes.stopAll();
    realtime.close();
    pipeline.stop();
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('loads optional authentication tokens from trimmed environment values', () => {
    expect(loadConfig({ TN_DATA_DIR: dataDir, TN_AUTH_TOKEN: '  shared secret  ' }, dataDir)).toMatchObject({
      authToken: 'shared secret',
      asnDbPath: join(dataDir, 'ip2asn-combined.tsv'),
      surgeProfilePath: join(dataDir, 'surge-profile.conf'),
      surgeListsDir: join(dataDir, 'config', 'Surge'),
    });
    expect(loadConfig({ TN_DATA_DIR: dataDir, TN_AUTH_TOKEN: '   ' }, dataDir).authToken).toBeUndefined();
    expect(loadConfig({ TN_DATA_DIR: dataDir, TN_ASN_DB: 'asn.tsv' }, dataDir).asnDbPath).toBe(
      join(dataDir, 'asn.tsv'),
    );
    expect(
      loadConfig(
        { TN_DATA_DIR: dataDir, TN_SURGE_PROFILE: 'profile.conf', TN_SURGE_LISTS: 'lists' },
        dataDir,
      ),
    ).toMatchObject({
      surgeProfilePath: join(dataDir, 'profile.conf'),
      surgeListsDir: join(dataDir, 'lists'),
    });
    expect(
      loadConfig(
        {
          TN_DATA_DIR: dataDir,
          TN_NOTIFY_WEBHOOK: ' https://notify.example/hook ',
          TN_NOTIFY_BARK: ' https://api.day.app/key ',
          TN_NOTIFY_REJECTED_THRESHOLD: '75',
          TN_FAVICONS: 'off',
        },
        dataDir,
      ),
    ).toMatchObject({
      notifyWebhookUrl: 'https://notify.example/hook',
      notifyBarkUrl: 'https://api.day.app/key',
      notifyRejectedThreshold: 75,
      faviconsEnabled: false,
    });
    expect(loadConfig({ TN_DATA_DIR: dataDir }, dataDir)).toMatchObject({
      notifyRejectedThreshold: 50,
      faviconsEnabled: true,
    });
    expect(() =>
      loadConfig({ TN_DATA_DIR: dataDir, TN_NOTIFY_REJECTED_THRESHOLD: '1.5' }, dataDir),
    ).toThrow('TN_NOTIFY_REJECTED_THRESHOLD must be a positive integer');
  });

  it('proxies favicons and reuses fresh cached files', async () => {
    const icon = Buffer.from([0, 1, 2, 3]);
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(icon, { status: 200, headers: { 'content-type': 'image/png' } }));
    await recreateApp({ fetch: fetchMock as typeof fetch });

    const first = await app.inject({ method: 'GET', url: '/api/favicon/Example.com' });
    const second = await app.inject({ method: 'GET', url: '/api/favicon/example.com' });

    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/x-icon');
    expect(first.headers['cache-control']).toBe('public,max-age=86400');
    expect(first.rawPayload).toEqual(icon);
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload).toEqual(icon);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://icons.duckduckgo.com/ip3/example.com.ico',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('negative-caches favicon failures', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } }));
    await recreateApp({ fetch: fetchMock as typeof fetch });

    const first = await app.inject({ method: 'GET', url: '/api/favicon/missing.example' });
    const second = await app.inject({ method: 'GET', url: '/api/favicon/missing.example' });

    expect(first.statusCode).toBe(404);
    expect(second.statusCode).toBe(404);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('evicts the oldest favicon negative-cache entry beyond capacity', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } }));
    await recreateApp({ fetch: fetchMock as typeof fetch });

    // Miss the first host, then flood with FAVICON_MISSES_MAX other misses so the
    // first host's negative entry is the one evicted.
    await app.inject({ method: 'GET', url: '/api/favicon/first.example' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 1_000; i += 1) {
      await app.inject({ method: 'GET', url: `/api/favicon/host-${i}.example` });
    }
    // first.example's negative entry was evicted, so its second request fetches
    // again (and fails, re-entering the cache) instead of short-circuiting.
    await app.inject({ method: 'GET', url: '/api/favicon/first.example' });
    expect(fetchMock).toHaveBeenCalledTimes(1 + 1_000);
  });

  it('rejects invalid favicon domains before fetching', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }));
    await recreateApp({ fetch: fetchMock as typeof fetch });

    const response = await app.inject({ method: 'GET', url: '/api/favicon/bad_domain' });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the favicon endpoint disabled when configured off', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }));
    await recreateApp({ faviconsEnabled: false, fetch: fetchMock as typeof fetch });

    const response = await app.inject({ method: 'GET', url: '/api/favicon/example.com' });

    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps authentication disabled when no token is configured', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ enabled: false, authenticated: false });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { token: 'anything' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ enabled: false, authenticated: true });
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).statusCode).toBe(200);
  });

  it('authenticates API requests with sessions or bearer tokens and clears sessions', async () => {
    await recreateApp({ authToken: 'correct horse' });

    const status = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ enabled: true, authenticated: false });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).json()).toEqual({
      message: 'Unauthorized',
    });
    expect((await app.inject({ method: 'GET', url: '/api/stream' })).statusCode).toBe(401);

    const invalidLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { token: 'wrong horse' },
    });
    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toEqual({ message: 'Invalid token' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { token: 'correct horse' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ enabled: true, authenticated: true });
    const setCookieHeader = login.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(setCookie).toContain('tn_session=');
    expect(setCookie).toContain('HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000');
    const cookie = setCookie!.split(';', 1)[0]!;

    const cookieStatus = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
      headers: { cookie },
    });
    expect(cookieStatus.json()).toEqual({ enabled: true, authenticated: true });
    expect(
      (await app.inject({ method: 'GET', url: '/api/overview', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/overview',
          headers: { authorization: 'Bearer correct horse' },
        })
      ).statusCode,
    ).toBe(200);

    for (const invalidCookie of [
      `tn_session=${Date.now() - 1}.` + '0'.repeat(64),
      `tn_session=${Date.now() + 60_000}.` + '0'.repeat(64),
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/overview',
        headers: { cookie: invalidCookie },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ message: 'Unauthorized' });
    }

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });
    expect(logout.headers['set-cookie']).toBe(
      'tn_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    );
  });

  it('roundtrips sources and redacts api keys', async () => {
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/sources',
      payload: {
        kind: 'surge',
        name: 'Gateway',
        settings: { url: 'http://gateway.local', apiKey: 'top-secret' },
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<SourceDto>();
    expect(created.settings.apiKey).toBe('••••cret');

    const tested = await app.inject({
      method: 'POST',
      url: '/api/sources/test',
      payload: {
        kind: 'surge',
        name: 'Gateway',
        settings: { url: 'http://gateway.local', apiKey: 'top-secret' },
      },
    });
    expect(tested.json()).toEqual({ ok: true, message: 'Connected' });

    const listed = await app.inject({ method: 'GET', url: '/api/sources' });
    expect(listed.json<SourceDto[]>()).toEqual([
      expect.objectContaining({ id: created.id, name: 'Gateway', settings: expect.objectContaining({ apiKey: '••••cret' }) }),
    ]);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sources/${created.id}`,
      payload: { name: 'Main gateway', enabled: false },
    });
    expect(patched.json<SourceDto>()).toMatchObject({ name: 'Main gateway', enabled: false });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/sources/${created.id}` });
    expect(deleted.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: '/api/sources' })).json()).toEqual([]);
  });

  it('samples and returns source health within explicit ranges', async () => {
    const now = Date.now();
    const source = store.createSource({
      id: 'source-health',
      kind: 'surge',
      name: 'Gateway',
      enabled: true,
      settingsJson: JSON.stringify({ url: 'http://gateway.local', apiKey: 'secret' }),
      createdAt: now,
    });
    probes.start(source.id);
    await vi.waitFor(() => expect(probes.getStatus(source.id).state).toBe('ok'));
    store.appendSourceHealth(source.id, now - 60_000, false);
    probes.sampleHealth(now - 30_000);

    const response = await app.inject({
      method: 'GET',
      url: `/api/sources/${source.id}/health?minutes=1&from=${now - 60_000}&to=${now}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<SourceHealthPoint[]>()).toEqual([
      { ts: now - 60_000, ok: false },
      { ts: now - 30_000, ok: true, latencyMs: 23 },
    ]);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/sources/missing/health?minutes=1&from=${now - 60_000}&to=${now}`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ message: 'Source not found' });
  });

  it('returns database size, table counts, and retention policy', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/system/db' });
    expect(response.statusCode).toBe(200);
    const info = response.json<SystemDbDto>();
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(info.tables).toEqual(
      [
        'flows',
        'rollup_minute',
        'rollup_hour',
        'dns_log',
        'system_log',
        'events',
        'presence_log',
        'source_health',
        'devices',
        'device_ips',
      ].map((name) => ({ name, rows: 0 })),
    );
    expect(info.retention).toEqual([
      { table: 'flows', days: 14 },
      { table: 'rollup_minute', days: 2 },
      { table: 'rollup_hour', days: 396 },
      { table: 'dns_log', days: 7 },
      { table: 'system_log', days: 7 },
      { table: 'events', days: 90 },
      { table: 'source_health', days: 30 },
    ]);
  });

  it('returns the overview contract after fake events', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: '00:11:22:33:44:55', ip: '192.168.1.5', name: 'Laptop' },
        event: 'seen',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-1',
        device: { mac: '00:11:22:33:44:55', ip: '192.168.1.5' },
        dst: { host: 'cdn.example.com', port: 443, proto: 'tcp' },
        bytesIn: 400,
        bytesOut: 100,
        state: 'active',
        attrs: { policy: 'Proxy' },
      },
      {
        kind: 'metric',
        ts: now,
        scope: 'wan',
        inBps: 2_000,
        outBps: 500,
        totals: { inBytes: 0, outBytes: 0 },
      },
      {
        kind: 'metric',
        ts: now + 1_000,
        scope: 'wan',
        inBps: 2_000,
        outBps: 500,
        totals: { inBytes: 400, outBytes: 100 },
      },
    ]);
    pipeline.flush();

    const response = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      wan: { rateIn: expect.any(Number), rateOut: expect.any(Number) },
      today: { in: 400, out: 100 },
      activeDevices: 1,
      totalDevices: 1,
      flowsActive: 1,
      rejectedToday: { flows: 0, bytes: 0 },
      dnsToday: 0,
      topDevices: [
        { deviceId: expect.any(String), name: 'Laptop', rateIn: expect.any(Number), rateOut: expect.any(Number) },
      ],
      topDestinations: [{ host: 'example.com', bytes: 500 }],
      policySplit: [{ policy: 'Proxy', bytes: 500 }],
      events: [expect.objectContaining({ kind: 'device_joined' })],
    });
  });

  it('returns a rules inventory joined to observed flow decisions without leaking proxy credentials', async () => {
    const now = Date.now();
    writeFileSync(
      surgeProfilePath,
      `[Proxy]
Secret Node = vmess, proxy.example, 443, password=top-secret, sni=secret.example

[Proxy Group]
Child = select, DIRECT
AI Suite = select, Child, Secret Node, url=https://probe.example, interval=600

[Rule]
RULE-SET,https://rules.example/Test.list,AI Suite,extended-matching
FINAL,AI Suite,dns-failed
`,
    );
    writeFileSync(
      join(surgeListsDir, 'Test.list'),
      '# observed domains\nDOMAIN-SUFFIX,example.com\nPROCESS-NAME,observed-process\nDOMAIN,unused.test\n',
    );
    store.writeFlush({
      flows: [
        {
          id: 'rules-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          host: 'api.example.com',
          ip: '10.0.0.42',
          bytesIn: 100,
          bytesOut: 25,
          state: 'active',
          policy: 'Secret Node',
          policyGroup: 'Secret Node',
          rule: 'RULE-SET Test.list',
          process: 'observed-process',
        },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/api/rules' });
    const coverageResponse = await app.inject({
      method: 'GET',
      url: '/api/rules/coverage/Test.list',
    });

    expect(response.statusCode).toBe(200);
    expect(coverageResponse.statusCode).toBe(200);
    const inventory = response.json<RulesInventoryDto>();
    const coverage = coverageResponse.json<RuleListCoverageDto>();
    expect(inventory).toEqual({
      available: true,
      groups: [
        {
          name: 'Child',
          type: 'select',
          members: [{ name: 'DIRECT', isGroup: false }],
          bytes: 0,
        },
        {
          name: 'AI Suite',
          type: 'select',
          members: [
            { name: 'Child', isGroup: true },
            { name: 'Secret Node', isGroup: false },
          ],
          bytes: 125,
        },
      ],
      rules: [
        {
          index: 0,
          type: 'RULE-SET',
          target: 'https://rules.example/Test.list',
          policy: 'AI Suite',
          displayKey: 'RULE-SET Test.list',
          hits: 1,
          bytes: 125,
          lastHit: now,
        },
        {
          index: 1,
          type: 'FINAL',
          policy: 'AI Suite',
          displayKey: 'FINAL',
          hits: 0,
          bytes: 0,
        },
      ],
      lists: [
        {
          name: 'Test.list',
          path: expect.stringMatching(/Test\.list$/),
          entries: 3,
          matched: 2,
        },
      ],
    });
    expect(inventory.lists[0]!.matched).toBe(coverage.matched);
    expect(response.body).not.toContain('password=');
    expect(response.body).not.toContain('sni=');
    expect(response.body).not.toContain('top-secret');
    expect(response.body).not.toContain('secret.example');
  });

  it('returns an unavailable rules inventory when the Surge profile is missing', async () => {
    writeFileSync(join(surgeListsDir, 'StillPresent.list'), 'DOMAIN,example.com\n');

    const response = await app.inject({ method: 'GET', url: '/api/rules' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false, groups: [], rules: [], lists: [] });
  });

  it('audits rule-list coverage against recent flows and historical host rollups', async () => {
    const now = Date.now();
    const historyTs = now - 30 * 24 * 60 * 60 * 1_000;
    const historyBucket = Math.floor(historyTs / 3_600_000) * 3_600_000;
    writeFileSync(
      join(surgeListsDir, 'Coverage.list'),
      'DOMAIN-SUFFIX,flow.example.com\nDOMAIN-SUFFIX,history.example\nDOMAIN,missing.example\n',
    );
    store.writeFlush({
      flows: [
        {
          id: 'coverage-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          host: 'api.flow.example.com',
          bytesIn: 1,
          bytesOut: 2,
          state: 'active',
        },
      ],
      rollups: [
        {
          ts: historyTs,
          scope: 'host',
          key: 'history.example',
          bytesIn: 3,
          bytesOut: 4,
          flows: 1,
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/rules/coverage/Coverage.list',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'Coverage.list',
      total: 3,
      matched: 2,
      entries: [
        {
          value: 'flow.example.com',
          type: 'DOMAIN-SUFFIX',
          matched: true,
          matchedVia: 'flows',
          lastSeen: now,
        },
        {
          value: 'history.example',
          type: 'DOMAIN-SUFFIX',
          matched: true,
          matchedVia: 'history',
          lastSeen: historyBucket,
        },
        { value: 'missing.example', type: 'DOMAIN', matched: false },
      ],
    });

    const missing = await app.inject({ method: 'GET', url: '/api/rules/coverage/Unknown.list' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ message: 'Rule list not found' });
  });

  it('searches the full domain catalog with literal LIKE characters and bounded limits', async () => {
    const hour = 3_600_000;
    const latest = Math.floor(Date.now() / hour) * hour;
    const first = latest - hour;
    store.writeFlush({
      flows: [],
      rollups: [
        { ts: first, scope: 'host', key: 'api_foo.example', bytesIn: 10, bytesOut: 3 },
        { ts: latest, scope: 'host', key: 'api_foo.example', bytesIn: 20, bytesOut: 2 },
        { ts: latest, scope: 'host', key: 'xapi_foo.example', bytesIn: 700, bytesOut: 300 },
        { ts: latest, scope: 'host', key: 'apiXfoo.example', bytesIn: 1_500, bytesOut: 500 },
        { ts: latest, scope: 'host', key: 'alpha.example', bytesIn: 200, bytesOut: 100 },
        { ts: latest, scope: 'wan', key: 'api_foo.example', bytesIn: 9_000, bytesOut: 9_000 },
      ],
    });

    const search = await app.inject({
      method: 'GET',
      url: '/api/catalog/domains?q=API_foo&limit=2',
    });
    const limited = await app.inject({ method: 'GET', url: '/api/catalog/domains?limit=1' });
    const overLimit = await app.inject({ method: 'GET', url: '/api/catalog/domains?limit=101' });

    expect(search.statusCode).toBe(200);
    expect(search.json<CatalogDomainDto[]>()).toEqual([
      {
        domain: 'api_foo.example',
        firstSeen: first,
        lastSeen: latest,
        bytesIn: 30,
        bytesOut: 5,
      },
      {
        domain: 'xapi_foo.example',
        firstSeen: latest,
        lastSeen: latest,
        bytesIn: 700,
        bytesOut: 300,
      },
    ]);
    expect(limited.statusCode).toBe(200);
    expect(limited.json<CatalogDomainDto[]>()).toEqual([
      {
        domain: 'apiXfoo.example',
        firstSeen: latest,
        lastSeen: latest,
        bytesIn: 1_500,
        bytesOut: 500,
      },
    ]);
    expect(overLimit.statusCode).toBe(400);
  });

  it('filters every breakdown path by exact raw policy', async () => {
    const now = Date.now();
    store.writeFlush({
      flows: [
        {
          id: 'filtered-policy',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          host: 'api.example.com',
          bytesIn: 100,
          bytesOut: 20,
          state: 'completed',
          policy: '[oixCloud] HK Fusion 11',
        },
        {
          id: 'other-policy',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: now,
          host: 'cdn.example.com',
          bytesIn: 1_000,
          bytesOut: 200,
          state: 'completed',
          policy: 'DIRECT',
        },
      ],
    });
    const policy = encodeURIComponent('[oixCloud] HK Fusion 11');

    const host = await app.inject({
      method: 'GET',
      url: `/api/breakdown?dim=host&minutes=5&policy=${policy}`,
    });
    const domain = await app.inject({
      method: 'GET',
      url: `/api/breakdown?dim=domain&minutes=5&policy=${policy}`,
    });

    expect(host.statusCode).toBe(200);
    expect(host.json()).toMatchObject({
      rows: [
        {
          key: 'api.example.com',
          bytesIn: 100,
          bytesOut: 20,
          flows: 1,
          devices: 1,
        },
      ],
    });
    expect(domain.statusCode).toBe(200);
    expect(domain.json()).toMatchObject({
      rows: [
        { key: 'example.com', bytesIn: 100, bytesOut: 20, flows: 1, devices: 1 },
      ],
    });
  });

  it('filters flows by device id', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-a',
        device: { mac: '00:00:00:00:00:01', name: 'One' },
        dst: { host: 'one.example' },
        bytesIn: 1,
        bytesOut: 2,
        state: 'active',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-b',
        device: { mac: '00:00:00:00:00:02', name: 'Two' },
        dst: { host: 'two.example' },
        bytesIn: 3,
        bytesOut: 4,
        state: 'active',
      },
    ]);
    pipeline.flush();
    const deviceId = store.listDevices().find((device) => device.name === 'One')!.id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/flows?deviceId=${encodeURIComponent(deviceId)}`,
    });
    expect(response.json()).toEqual({
      flows: [expect.objectContaining({ id: 'flow-a', deviceId })],
    });
  });

  it('filters flows by country', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-us',
        device: { mac: '00:00:00:00:01:01', name: 'One' },
        dst: { ip: '8.8.8.8' },
        bytesIn: 10,
        bytesOut: 2,
        state: 'active',
      },
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'flow-au',
        device: { mac: '00:00:00:00:01:02', name: 'Two' },
        dst: { ip: '1.1.1.1' },
        bytesIn: 20,
        bytesOut: 4,
        state: 'active',
      },
    ]);
    pipeline.flush();

    const response = await app.inject({ method: 'GET', url: '/api/flows?country=US' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      flows: [expect.objectContaining({ id: 'flow-us', country: 'US' })],
    });
  });

  it('filters flows by extended fields and keeps keyset pagination inside the filtered set', async () => {
    const now = Date.now();
    store.upsertDevice({
      id: 'device-1',
      name: 'Laptop',
      firstSeenAt: now - 60_000,
      lastSeenAt: now,
    });
    store.writeFlush({
      flows: [
        {
          id: 'tcp-new',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 10_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'udp-new',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 15_000,
          port: 53,
          proto: 'udp',
          process: 'Resolver',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'tcp-middle',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 20_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'other-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 25_000,
          port: 443,
          proto: 'other',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
        {
          id: 'tcp-old',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 30_000,
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 1,
          bytesOut: 1,
          state: 'completed',
        },
      ],
    });
    const ids = async (query: string): Promise<string[]> => {
      const response = await app.inject({ method: 'GET', url: `/api/flows?${query}` });
      expect(response.statusCode).toBe(200);
      return response.json<FlowsPage>().flows.map((flow) => flow.id);
    };

    expect(await ids('proto=udp')).toEqual(['udp-new']);
    expect(await ids('port=53')).toEqual(['udp-new']);
    expect(await ids('process=Resolver')).toEqual(['udp-new']);
    expect(await ids(`from=${now - 20_000}`)).toEqual(['tcp-new', 'udp-new', 'tcp-middle']);
    expect(await ids(`to=${now - 25_000}`)).toEqual(['other-flow', 'tcp-old']);

    const query = `proto=tcp&port=443&process=Browser&from=${now - 30_000}&to=${now - 10_000}&limit=2`;
    const first = await app.inject({ method: 'GET', url: `/api/flows?${query}` });
    const firstPage = first.json<FlowsPage>();
    expect(firstPage.flows.map((flow) => flow.id)).toEqual(['tcp-new', 'tcp-middle']);
    expect(firstPage.nextCursor).toBeTypeOf('string');
    const second = await app.inject({
      method: 'GET',
      url: `/api/flows?${query}&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(second.json<FlowsPage>()).toEqual({
      flows: [expect.objectContaining({ id: 'tcp-old' })],
    });
  });

  it('returns device detail from rollups, flow breakdowns, and presence', async () => {
    const now = Date.now();
    store.upsertDevice({
      id: 'device-detail',
      name: 'Laptop',
      firstSeenAt: now - 3_600_000,
      lastSeenAt: now,
    });
    store.bindDeviceIp('device-detail', '192.168.1.10', now);
    store.openPresence('device-detail', now - 120_000);
    store.closePresence('device-detail', now - 60_000);
    store.writeFlush({
      flows: [
        {
          id: 'detail-flow',
          sourceId: 'source-1',
          deviceId: 'device-detail',
          ts: now - 10_000,
          host: 'api.example.com',
          port: 443,
          proto: 'tcp',
          process: 'Browser',
          bytesIn: 120,
          bytesOut: 30,
          state: 'completed',
          policy: 'Proxy',
          country: 'US',
        },
        {
          id: 'detail-unclassified',
          sourceId: 'source-1',
          deviceId: 'device-detail',
          ts: now - 20_000,
          bytesIn: 10,
          bytesOut: 5,
          state: 'completed',
        },
      ],
      rollups: [
        { ts: now, scope: 'device_host', key: 'device-detail|rollup.example', bytesIn: 900, bytesOut: 100, flows: 4 },
        { ts: now, scope: 'device_country', key: 'device-detail|SG', bytesIn: 700, bytesOut: 100, flows: 3 },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/devices/device-detail/detail?minutes=5',
    });
    expect(response.statusCode).toBe(200);
    const detail = response.json<DeviceDetailDto>();
    expect(detail.device).toMatchObject({
      id: 'device-detail',
      name: 'Laptop',
      ips: ['192.168.1.10'],
      online: true,
      rateIn: 0,
      rateOut: 0,
    });
    expect(detail.series).toHaveLength(5);
    expect(detail.topHosts).toEqual([
      { key: 'rollup.example', bytesIn: 900, bytesOut: 100, flows: 4 },
      { key: 'example.com', bytesIn: 120, bytesOut: 30, flows: 1 },
    ]);
    expect(detail.topCountries).toEqual([
      { key: 'SG', bytesIn: 700, bytesOut: 100, flows: 3 },
      { key: 'US', bytesIn: 120, bytesOut: 30, flows: 1 },
    ]);
    expect(detail.topProcesses).toEqual([
      { key: 'Browser', country: 'US', bytesIn: 120, bytesOut: 30, flows: 1, devices: 1 },
    ]);
    expect(detail.topPorts).toEqual([
      { key: '443', country: 'US', bytesIn: 120, bytesOut: 30, flows: 1, devices: 1 },
    ]);
    expect(detail.policySplit).toEqual([{ policy: 'Proxy', bytes: 150 }]);
    expect(detail.presence).toEqual([{ start: now - 120_000, end: now - 60_000 }]);
    expect(detail.recentFlows.map((flow) => flow.id)).toEqual(['detail-flow', 'detail-unclassified']);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/devices/missing/detail?minutes=5',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ message: 'Device not found' });
  });

  it('returns ordered destinations and country device shares', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'flow_delta',
        ts: now,
        flowId: 'alpha-us',
        device: { mac: '00:00:00:00:02:01', name: 'Laptop' },
        dst: { host: 'api.alpha.example', ip: '8.8.8.8' },
        bytesIn: 250,
        bytesOut: 50,
        state: 'completed',
      },
      {
        kind: 'flow_delta',
        ts: now + 1,
        flowId: 'alpha-au',
        device: { mac: '00:00:00:00:02:02', name: 'Phone' },
        dst: { host: 'cdn.alpha.example', ip: '1.1.1.1' },
        bytesIn: 80,
        bytesOut: 20,
        state: 'completed',
      },
      {
        kind: 'flow_delta',
        ts: now + 2,
        flowId: 'beta-au',
        device: { mac: '00:00:00:00:02:02', name: 'Phone' },
        dst: { host: 'beta.example', ip: '1.1.1.1' },
        bytesIn: 400,
        bytesOut: 100,
        state: 'completed',
      },
    ]);
    pipeline.flush();

    const destinations = await app.inject({ method: 'GET', url: '/api/destinations' });
    expect(destinations.statusCode).toBe(200);
    expect(destinations.json()).toEqual({
      countries: [
        { code: 'AU', bytesIn: 480, bytesOut: 120, flows: 2 },
        { code: 'US', bytesIn: 250, bytesOut: 50, flows: 1 },
      ],
      hosts: [
        { host: 'beta.example', country: 'AU', bytes: 500, flows: 1, devices: 1 },
        { host: 'alpha.example', country: 'US', bytes: 400, flows: 2, devices: 2 },
      ],
    });

    const devices = await app.inject({
      method: 'GET',
      url: '/api/destinations/au/devices',
    });
    expect(devices.statusCode).toBe(200);
    expect(devices.json()).toEqual([
      {
        deviceId: expect.any(String),
        deviceName: 'Phone',
        bytes: 600,
        flows: 2,
      },
    ]);
  });

  it('returns geo-complete cities and host details with subdomain matches', async () => {
    const now = Date.now();
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
    ] as const) {
      store.upsertDevice({ id, name, firstSeenAt: now - 60_000, lastSeenAt: now });
    }
    store.writeFlush({
      flows: [
        {
          id: 'host-exact',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 30_000,
          host: 'example.com',
          port: 443,
          process: 'Browser',
          bytesIn: 80,
          bytesOut: 20,
          state: 'completed',
          country: 'US',
          city: 'Singapore',
          lat: 1,
          lon: 103,
        },
        {
          id: 'host-subdomain',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: now - 20_000,
          host: 'x.example.com',
          port: 8443,
          process: 'Agent',
          bytesIn: 280,
          bytesOut: 20,
          state: 'completed',
          country: 'CA',
          city: 'Toronto',
          lat: 43,
          lon: -79,
        },
        {
          id: 'host-subdomain-2',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: now - 10_000,
          host: 'y.example.com',
          port: 8443,
          process: 'Agent',
          bytesIn: 80,
          bytesOut: 20,
          state: 'completed',
          country: 'CA',
          city: 'Toronto',
          lat: 45,
          lon: -81,
        },
        {
          id: 'host-boundary',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          host: 'notexample.com',
          bytesIn: 1_000,
          bytesOut: 0,
          state: 'completed',
          country: 'GB',
          city: 'London',
          lat: 51.5,
          lon: -0.1,
        },
        {
          id: 'missing-geo',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          bytesIn: 500,
          bytesOut: 0,
          state: 'completed',
          country: 'ZZ',
          city: 'Nowhere',
        },
        {
          id: 'missing-country',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          bytesIn: 500,
          bytesOut: 0,
          state: 'completed',
          city: 'Unknown',
          lat: 1,
          lon: 2,
        },
      ],
    });

    const citiesResponse = await app.inject({
      method: 'GET',
      url: '/api/destinations/cities?minutes=5',
    });
    expect(citiesResponse.statusCode).toBe(200);
    expect(citiesResponse.json<CityPoint[]>()).toEqual([
      { city: 'London', country: 'GB', lat: 51.5, lon: -0.1, bytes: 1_000, flows: 1 },
      { city: 'Toronto', country: 'CA', lat: 44, lon: -80, bytes: 400, flows: 2 },
      { city: 'Singapore', country: 'US', lat: 1, lon: 103, bytes: 100, flows: 1 },
    ]);

    const hostResponse = await app.inject({
      method: 'GET',
      url: '/api/hosts/example.com?minutes=5',
    });
    expect(hostResponse.statusCode).toBe(200);
    const detail = hostResponse.json<HostDetailDto>();
    expect(detail).toMatchObject({
      host: 'example.com',
      country: 'CA',
      devices: [
        { key: 'device-2', label: 'Phone', bytesIn: 360, bytesOut: 40, flows: 2, devices: 1 },
        { key: 'device-1', label: 'Laptop', bytesIn: 80, bytesOut: 20, flows: 1, devices: 1 },
      ],
      processes: [
        { key: 'Agent', bytesIn: 360, bytesOut: 40, flows: 2, devices: 1 },
        { key: 'Browser', bytesIn: 80, bytesOut: 20, flows: 1, devices: 1 },
      ],
      ports: [
        { key: '8443', bytesIn: 360, bytesOut: 40, flows: 2, devices: 1 },
        { key: '443', bytesIn: 80, bytesOut: 20, flows: 1, devices: 1 },
      ],
    });
    expect(detail.series).toHaveLength(5);
    expect(detail.recentFlows.map((flow) => flow.id)).toEqual([
      'host-subdomain-2',
      'host-subdomain',
      'host-exact',
    ]);
  });

  it('persists ingested dns batches and exposes pagination and search', async () => {
    const now = Date.now();
    pipeline.ingest('source-1', [
      {
        kind: 'presence',
        ts: now,
        device: { mac: '00:00:00:00:03:01', ip: '192.168.1.20', name: 'Phone' },
        event: 'seen',
      },
    ]);
    const batches: unknown[][] = [];
    const unsubscribe = pipeline.onDns((entries) => batches.push(entries));
    pipeline.ingest('source-1', [
      {
        kind: 'dns',
        ts: now + 1,
        device: { ip: '192.168.1.20' },
        qname: 'push.apple.com',
        answers: ['17.57.146.20'],
        rttMs: 12,
        server: '1.1.1.1',
        source: 'server',
      },
      {
        kind: 'dns',
        ts: now + 2,
        device: {},
        qname: 'example.net',
        answers: [],
        server: 'system',
        source: 'cache',
      },
    ]);
    unsubscribe();

    expect((db.prepare('SELECT COUNT(*) AS count FROM dns_log').get() as { count: number }).count).toBe(2);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]?.[0]).toMatchObject({ deviceName: 'Phone', qname: 'push.apple.com' });

    const first = await app.inject({ method: 'GET', url: '/api/logs/dns?limit=1' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ entries: [expect.any(Object)], nextCursor: expect.any(String) });
    const searched = await app.inject({ method: 'GET', url: '/api/logs/dns?search=apple' });
    expect(searched.json()).toEqual({
      entries: [
        expect.objectContaining({
          qname: 'push.apple.com',
          answers: ['17.57.146.20'],
          rttMs: 12,
          deviceName: 'Phone',
        }),
      ],
    });
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/logs/dns?source=cache&server=system&unanswered=1',
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toMatchObject({ entries: [{ qname: 'example.net', answers: [] }] });
  });

  it('returns zero-filled DNS summary buckets and ranked resolver statistics', async () => {
    const now = Date.now();
    for (const entry of [
      {
        id: 'dns-1',
        ts: now - 1_000,
        qname: 'alpha.example',
        answers: ['1.1.1.1'],
        rttMs: 5,
        server: '1.1.1.1',
        source: 'server' as const,
      },
      {
        id: 'dns-2',
        ts: now - 10_000,
        qname: 'alpha.example',
        answers: [],
        rttMs: 25,
        server: '1.1.1.1',
        source: 'cache' as const,
      },
      {
        id: 'dns-3',
        ts: now - 61_000,
        qname: 'beta.example',
        answers: ['2.2.2.2'],
        rttMs: 75,
        server: '1.1.1.1',
        source: 'server' as const,
      },
      {
        id: 'dns-4',
        ts: now - 121_000,
        qname: 'gamma.example',
        answers: [],
        rttMs: 150,
        server: '8.8.8.8',
        source: 'server' as const,
      },
      {
        id: 'dns-5',
        ts: now - 181_000,
        qname: 'delta.example',
        answers: [],
        rttMs: 350,
        server: '8.8.8.8',
        source: 'server' as const,
      },
    ]) {
      store.appendDnsLog(entry);
    }

    const response = await app.inject({ method: 'GET', url: '/api/dns/summary?minutes=5' });
    expect(response.statusCode).toBe(200);
    const summary = response.json<DnsSummaryDto>();
    expect(summary.series).toHaveLength(5);
    expect(summary.series.reduce((total, point) => total + point.count, 0)).toBe(5);
    expect(summary.topDomains[0]).toEqual({ qname: 'alpha.example', count: 2 });
    expect(summary.rttBuckets).toEqual([
      { label: '<10ms', count: 1 },
      { label: '10-50ms', count: 1 },
      { label: '50-100ms', count: 1 },
      { label: '100-300ms', count: 1 },
      { label: '300ms+', count: 1 },
    ]);
    expect(summary).toMatchObject({
      answered: 2,
      unanswered: 3,
      resolvers: [
        { server: '1.1.1.1', count: 3, medianRttMs: 25 },
        { server: '8.8.8.8', count: 2, medianRttMs: 250 },
      ],
    });
  });

  it('returns exact per-qname DNS detail with zero-filled buckets', async () => {
    const now = Date.now();
    for (const entry of [
      {
        id: 'dns-detail-1',
        ts: now - 1_000,
        qname: 'alpha.example',
        answers: ['1.1.1.1'],
        server: '1.1.1.1',
        source: 'server' as const,
      },
      {
        id: 'dns-detail-2',
        ts: now - 10_000,
        qname: 'alpha.example',
        answers: [],
        server: '1.1.1.1',
        source: 'cache' as const,
      },
      {
        id: 'dns-detail-other',
        ts: now - 20_000,
        qname: 'other.example',
        answers: [],
        server: '8.8.8.8',
        source: 'server' as const,
      },
    ]) {
      store.appendDnsLog(entry);
    }

    const detailResponse = await app.inject({
      method: 'GET',
      url: '/api/dns/qname?name=alpha.example&minutes=5',
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json<DnsQnameDetail>();
    expect(detail).toMatchObject({
      qname: 'alpha.example',
      total: 2,
      resolvers: [{ server: '1.1.1.1', count: 2 }],
      sources: { cache: 1, server: 1 },
    });
    expect(detail.series).toHaveLength(5);
    expect(detail.series.reduce((total, point) => total + point.count, 0)).toBe(2);
  });

  it('filters system logs by level and search', async () => {
    const now = Date.now();
    store.appendSystemLog({
      id: 'system-info',
      ts: now,
      level: 'info',
      scope: 'hub',
      message: 'Hub started',
    });
    store.appendSystemLog({
      id: 'system-error',
      ts: now + 1,
      level: 'error',
      scope: 'Main gateway',
      message: 'Probe request failed',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/logs/system?level=error&search=gateway',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entries: [
        {
          id: 'system-error',
          ts: now + 1,
          level: 'error',
          scope: 'Main gateway',
          message: 'Probe request failed',
        },
      ],
    });
  });

  it('zero-fills exactly the requested number of timeseries points', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/timeseries?scope=wan&minutes=7' });
    expect(response.statusCode).toBe(200);
    const points = response.json<Array<{ ts: number; in: number; out: number }>>();
    expect(points).toHaveLength(7);
    expect(points.every((point) => point.in === 0 && point.out === 0)).toBe(true);
    expect(points[1]!.ts - points[0]!.ts).toBe(60_000);

    const to = Math.floor(Date.now() / 60_000) * 60_000;
    const from = to - 2 * 60_000;
    const explicit = await app.inject({
      method: 'GET',
      url: `/api/timeseries?scope=wan&minutes=1&from=${from}&to=${to}`,
    });
    expect(explicit.statusCode).toBe(200);
    expect(explicit.json()).toEqual([
      { ts: from, in: 0, out: 0 },
      { ts: from + 60_000, in: 0, out: 0 },
      { ts: to, in: 0, out: 0 },
    ]);
  });

  it('serves every aggregate read endpoint with ranked and zero-filled data', async () => {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60_000) * 60_000;
    for (const [id, name] of [
      ['device-1', 'Laptop'],
      ['device-2', 'Phone'],
      ['device-3', 'Tablet'],
    ] as const) {
      store.upsertDevice({
        id,
        name,
        firstSeenAt: now - 60_000,
        lastSeenAt: now,
      });
    }
    store.writeFlush({
      flows: [
        {
          id: 'failed-flow',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: currentMinute,
          host: 'api.example.com',
          port: 443,
          proto: 'tcp',
          bytesIn: 500,
          bytesOut: 100,
          state: 'failed',
          policy: 'Proxy',
          rule: 'Rule A',
          process: 'Browser',
          country: 'US',
        },
        {
          id: 'policy-flow',
          sourceId: 'source-1',
          deviceId: 'device-2',
          ts: currentMinute - 60_000,
          host: 'cdn.example.com',
          port: 443,
          proto: 'tcp',
          bytesIn: 250,
          bytesOut: 50,
          state: 'completed',
          policy: 'reject-drop',
          rule: 'Rule B',
          process: 'Agent',
          country: 'CA',
        },
        {
          id: 'other-flow',
          sourceId: 'source-1',
          deviceId: 'device-3',
          ts: currentMinute,
          host: 'service.other.net',
          port: 53,
          proto: 'udp',
          bytesIn: 100,
          bytesOut: 20,
          state: 'completed',
          policy: 'Direct',
          rule: 'Rule C',
          process: 'Resolver',
          country: 'GB',
        },
      ],
      rollups: [
        { ts: now, scope: 'wan', key: '', bytesIn: 120, bytesOut: 30 },
        { ts: now - 86_400_000, scope: 'wan', key: '', bytesIn: 40, bytesOut: 10 },
      ],
    });

    const multiResponse = await app.inject({
      method: 'GET',
      url: '/api/timeseries/multi?scope=device&minutes=3&limit=2',
    });
    expect(multiResponse.statusCode).toBe(200);
    const multi = multiResponse.json<Array<{ key: string; label: string; points: unknown[] }>>();
    expect(multi.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'device-1', label: 'Laptop' },
      { key: 'device-2', label: 'Phone' },
      { key: 'other', label: 'Other' },
    ]);
    expect(multi.every((series) => series.points.length === 3)).toBe(true);

    const breakdownResponse = await app.inject({
      method: 'GET',
      url: '/api/breakdown?dim=domain&minutes=525600',
    });
    expect(breakdownResponse.statusCode).toBe(200);
    expect(breakdownResponse.json()).toMatchObject({
      window: { from: expect.any(Number), to: expect.any(Number), clamped: true },
      rows: [
        { key: 'example.com', bytesIn: 750, bytesOut: 150, flows: 2, devices: 2 },
        { key: 'other.net', bytesIn: 100, bytesOut: 20, flows: 1, devices: 1 },
      ],
    });

    const sankeyResponse = await app.inject({ method: 'GET', url: '/api/sankey?minutes=60&limit=1' });
    expect(sankeyResponse.statusCode).toBe(200);
    const sankey = sankeyResponse.json<{
      nodes: Array<{ kind: string }>;
      links: Array<{ source: number; target: number; bytes: number }>;
    }>();
    expect(sankey.nodes.filter((node) => node.kind === 'device')).toHaveLength(2);
    expect(sankey.nodes.filter((node) => node.kind === 'policy')).toHaveLength(2);
    expect(sankey.nodes.filter((node) => node.kind === 'country')).toHaveLength(2);
    expect(sankey.links.every((link) => link.bytes > 0)).toBe(true);
    expect(
      sankey.links.every(
        (link) =>
          link.source >= 0 &&
          link.source < sankey.nodes.length &&
          link.target >= 0 &&
          link.target < sankey.nodes.length,
      ),
    ).toBe(true);

    const punchcardResponse = await app.inject({ method: 'GET', url: '/api/insights/punchcard?days=2' });
    expect(punchcardResponse.statusCode).toBe(200);
    expect(punchcardResponse.json()).toMatchObject({
      days: 2,
      max: 150,
      cells: expect.arrayContaining([expect.any(Array)]),
    });

    const dailyResponse = await app.inject({ method: 'GET', url: '/api/insights/daily?days=2' });
    expect(dailyResponse.statusCode).toBe(200);
    const daily = dailyResponse.json<Array<{ day: string; in: number; out: number }>>();
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({ in: 40, out: 10 });
    expect(daily[1]).toMatchObject({ in: 120, out: 30 });
    expect(daily[0]!.day < daily[1]!.day).toBe(true);

    const moversResponse = await app.inject({ method: 'GET', url: '/api/insights/movers?minutes=1' });
    expect(moversResponse.statusCode).toBe(200);
    expect(moversResponse.json()).toMatchObject({
      devices: [
        { key: 'device-1', label: 'Laptop', current: 600, previous: 0 },
        { key: 'device-2', label: 'Phone', current: 0, previous: 300 },
        { key: 'device-3', label: 'Tablet', current: 120, previous: 0 },
      ],
      domains: [
        expect.objectContaining({ key: 'example.com', current: 600, previous: 300 }),
        expect.objectContaining({ key: 'other.net', current: 120, previous: 0 }),
      ],
    });

    const firstSeenResponse = await app.inject({ method: 'GET', url: '/api/insights/firstseen' });
    expect(firstSeenResponse.statusCode).toBe(200);
    expect(firstSeenResponse.json()).toMatchObject({
      devices: expect.arrayContaining([
        { deviceId: 'device-1', name: 'Laptop', firstSeenAt: now - 60_000 },
      ]),
      domains: expect.arrayContaining([
        { domain: 'example.com', firstTs: currentMinute - 60_000, bytes: 900, devices: 2 },
      ]),
    });

    const rejectedResponse = await app.inject({
      method: 'GET',
      url: '/api/insights/rejected?minutes=3',
    });
    expect(rejectedResponse.statusCode).toBe(200);
    const rejected = rejectedResponse.json<{
      series: Array<{ flows: number }>;
      topHosts: Array<{ key: string }>;
      topDevices: Array<{ key: string; label: string }>;
      topRules: Array<{ key: string }>;
    }>();
    expect(rejected.series).toHaveLength(3);
    expect(rejected.series.reduce((sum, point) => sum + point.flows, 0)).toBe(2);
    expect(rejected.topHosts.map((row) => row.key)).toEqual(['api.example.com', 'cdn.example.com']);
    expect(rejected.topDevices).toEqual([
      expect.objectContaining({ key: 'device-1', label: 'Laptop' }),
      expect.objectContaining({ key: 'device-2', label: 'Phone' }),
    ]);
    expect(rejected.topRules.map((row) => row.key)).toEqual(['Rule A', 'Rule B']);
  });

  it('returns ranked observed decision chains', async () => {
    const now = Date.now();
    store.writeFlush({
      flows: [
        {
          id: 'chain-api-1',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now,
          bytesIn: 100,
          bytesOut: 20,
          state: 'completed',
          policyChain: ['Rules', 'Proxy', 'Singapore'],
        },
        {
          id: 'chain-api-2',
          sourceId: 'source-1',
          deviceId: 'device-1',
          ts: now - 1,
          bytesIn: 50,
          bytesOut: 0,
          state: 'completed',
          policyChain: ['Rules', 'Direct'],
        },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/api/chains?minutes=5&limit=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json<SankeyDto>()).toEqual({
      nodes: [
        { id: 'policy:key:Rules', label: 'Rules', kind: 'policy' },
        { id: 'policy:key:Proxy', label: 'Proxy', kind: 'policy' },
        { id: 'policy:key:Singapore', label: 'Singapore', kind: 'policy' },
      ],
      links: [
        { source: 0, target: 1, bytes: 120 },
        { source: 1, target: 2, bytes: 120 },
      ],
    });
  });

  it('validates aggregate read query limits and windows', async () => {
    const urls = [
      '/api/flows?proto=icmp',
      '/api/flows?port=1.5',
      '/api/flows?process=',
      '/api/flows?from=nope',
      '/api/logs/dns?source=origin',
      '/api/logs/dns?server=',
      '/api/logs/dns?unanswered=0',
      '/api/devices/device-1/detail?minutes=0',
      '/api/destinations/cities?minutes=0',
      '/api/hosts/example.com?minutes=0',
      '/api/dns/summary?minutes=0',
      '/api/dns/qname?minutes=1',
      '/api/timeseries/multi?scope=device&minutes=1&limit=13',
      '/api/breakdown?dim=nope&minutes=1',
      '/api/breakdown?dim=domain&minutes=1&policy=',
      '/api/sankey?minutes=0',
      '/api/chains?minutes=0',
      '/api/chains?minutes=1&limit=31',
      '/api/chains?minutes=1&from=2&to=1',
      '/api/insights/punchcard?days=91',
      '/api/insights/daily?days=61',
      '/api/insights/movers?minutes=525601',
      '/api/insights/firstseen?days=31',
      '/api/insights/rejected?minutes=0',
      '/api/timeseries?scope=wan&minutes=1&from=2&to=1',
      '/api/timeseries?scope=wan&minutes=1&from=1',
      '/api/timeseries/multi?scope=device&minutes=1&from=2&to=1',
      '/api/breakdown?dim=domain&minutes=1&from=2&to=1',
      '/api/sankey?minutes=1&from=2&to=1',
      '/api/insights/rejected?minutes=1&from=2&to=1',
      '/api/insights/movers?minutes=1&from=2&to=1',
      '/api/dns/summary?minutes=1&from=2&to=1',
      '/api/dns/qname?name=alpha.example&minutes=1&from=2&to=1',
      '/api/destinations/cities?minutes=1&from=2&to=1',
      '/api/devices/device-1/detail?minutes=1&from=2&to=1',
      '/api/hosts/example.com?minutes=1&from=2&to=1',
    ];
    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(400);
    }
  });

  it('serves Next.js static export routes, assets, SPA 404, and keeps API JSON 404', async () => {
    probes.stopAll();
    realtime.close();
    pipeline.stop();
    await app.close();
    db.close();

    const consoleDist = join(dataDir, 'console-out');
    mkdirSync(join(consoleDist, '_next'), { recursive: true });
    writeFileSync(join(consoleDist, 'index.html'), '<html>index</html>');
    writeFileSync(join(consoleDist, 'devices.html'), '<html>devices-page</html>');
    writeFileSync(join(consoleDist, '404.html'), '<html>not-found-page</html>');
    writeFileSync(join(consoleDist, '_next', 'chunk.js'), 'console.log("chunk")');

    db = openDatabase(dataDir);
    store = new Store(db);
    pipeline = new Pipeline(store, new Identity(store), {
      autoStart: false,
      rdnsLookup: async () => undefined,
    });
    probes = new ProbeManager(store, pipeline, { adapters: { surge: fakeAdapter } });
    realtime = new Realtime(pipeline);
    app = await createApi({
      config: {
        dataDir,
        consoleDist,
        faviconsEnabled: true,
        surgeProfilePath,
        surgeListsDir,
      },
      store,
      pipeline,
      probes,
      realtime,
    });

    const devices = await app.inject({ method: 'GET', url: '/devices' });
    expect(devices.statusCode).toBe(200);
    expect(devices.body).toContain('devices-page');

    const asset = await app.inject({ method: 'GET', url: '/_next/chunk.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('chunk');

    const missing = await app.inject({ method: 'GET', url: '/nope' });
    expect(missing.body).toContain('not-found-page');

    const apiMissing = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(apiMissing.headers['content-type']).toMatch(/application\/json/);
    expect(apiMissing.json()).toEqual({ message: 'Not found' });

    const traversal = await app.inject({ method: 'GET', url: '/../etc/passwd' });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain('devices-page');
    expect(traversal.body).not.toContain('root:');

    const rawTraversal = await app.inject({ method: 'GET', url: '/%2e%2e/etc/passwd' });
    expect(rawTraversal.statusCode).toBe(404);
    expect(rawTraversal.body).not.toContain('root:');
  });
});
