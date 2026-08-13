import type {
  AuthStatusDto,
  BreakdownDim,
  BreakdownDto,
  CityPoint,
  CountryDeviceShare,
  DailyPoint,
  DestinationsDto,
  DeviceDetailDto,
  DeviceDto,
  DnsLogPage,
  DnsSummaryDto,
  FirstSeenDto,
  FlowsPage,
  FlowsQuery,
  HostDetailDto,
  LogsQuery,
  MoversDto,
  MultiSeriesDto,
  OverviewDto,
  PunchcardDto,
  RejectedSummaryDto,
  SankeyDto,
  SourceDto,
  SourceHealthPoint,
  SourceInput,
  SystemDbDto,
  SystemLogPage,
  TestConnectionResult,
  TimeseriesPoint,
  TimeseriesQuery,
} from "@the-network/schema";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface RangeQuery {
  minutes: number;
  from?: number;
  to?: number;
}

function rangeParams(range: number | RangeQuery): RangeQuery {
  return typeof range === "number" ? { minutes: range } : range;
}

function qs<T extends object>(params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const api = {
  overview: () => request<OverviewDto>("/api/overview"),
  devices: () => request<DeviceDto[]>("/api/devices"),
  device: (id: string) => request<DeviceDto>(`/api/devices/${id}`),
  flows: (query: FlowsQuery = {}) => request<FlowsPage>(`/api/flows${qs(query)}`),
  timeseries: (query: TimeseriesQuery) => request<TimeseriesPoint[]>(`/api/timeseries${qs(query)}`),
  timeseriesMulti: (
    query: { scope: "device" | "policy"; limit?: number } & RangeQuery,
  ) => request<MultiSeriesDto[]>(`/api/timeseries/multi${qs(query)}`),
  breakdown: (query: { dim: BreakdownDim; deviceId?: string; limit?: number } & RangeQuery) =>
    request<BreakdownDto>(`/api/breakdown${qs(query)}`),
  sankey: (query: { limit?: number } & RangeQuery) =>
    request<SankeyDto>(`/api/sankey${qs(query)}`),
  chains: (query: { limit?: number } & RangeQuery) =>
    request<SankeyDto>(`/api/chains${qs(query)}`),
  punchcard: (days: number) => request<PunchcardDto>(`/api/insights/punchcard${qs({ days })}`),
  daily: (days: number) => request<DailyPoint[]>(`/api/insights/daily${qs({ days })}`),
  movers: (range: number | RangeQuery) =>
    request<MoversDto>(`/api/insights/movers${qs(rangeParams(range))}`),
  firstSeen: (days: number) => request<FirstSeenDto>(`/api/insights/firstseen${qs({ days })}`),
  rejected: (range: number | RangeQuery) =>
    request<RejectedSummaryDto>(`/api/insights/rejected${qs(rangeParams(range))}`),
  deviceDetail: (id: string, range: number | RangeQuery) =>
    request<DeviceDetailDto>(
      `/api/devices/${encodeURIComponent(id)}/detail${qs(rangeParams(range))}`,
    ),
  cities: (range: number | RangeQuery) =>
    request<CityPoint[]>(`/api/destinations/cities${qs(rangeParams(range))}`),
  hostDetail: (host: string, range: number | RangeQuery) =>
    request<HostDetailDto>(`/api/hosts/${encodeURIComponent(host)}${qs(rangeParams(range))}`),
  dnsSummary: (range: number | RangeQuery) =>
    request<DnsSummaryDto>(`/api/dns/summary${qs(rangeParams(range))}`),
  authStatus: () => request<AuthStatusDto>("/api/auth/status"),
  login: (token: string) =>
    request<AuthStatusDto>("/api/auth/login", { method: "POST", body: JSON.stringify({ token }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  destinations: () => request<DestinationsDto>("/api/destinations"),
  countryDevices: (code: string) =>
    request<CountryDeviceShare[]>(`/api/destinations/${encodeURIComponent(code)}/devices`),
  dnsLogs: (query: LogsQuery = {}) => request<DnsLogPage>(`/api/logs/dns${qs(query)}`),
  systemLogs: (query: LogsQuery = {}) => request<SystemLogPage>(`/api/logs/system${qs(query)}`),
  sources: () => request<SourceDto[]>("/api/sources"),
  sourceHealth: (id: string, range: number | RangeQuery) =>
    request<SourceHealthPoint[]>(
      `/api/sources/${encodeURIComponent(id)}/health${qs(rangeParams(range))}`,
    ),
  systemDb: () => request<SystemDbDto>("/api/system/db"),
  createSource: (input: SourceInput) =>
    request<SourceDto>("/api/sources", { method: "POST", body: JSON.stringify(input) }),
  updateSource: (id: string, patch: Partial<SourceInput>) =>
    request<SourceDto>(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSource: (id: string) => request<{ ok: boolean }>(`/api/sources/${id}`, { method: "DELETE" }),
  testSource: (input: SourceInput) =>
    request<TestConnectionResult>("/api/sources/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
