import type {
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
  SourceInput,
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
  timeseriesMulti: (query: { scope: "device" | "policy"; minutes: number; limit?: number }) =>
    request<MultiSeriesDto[]>(`/api/timeseries/multi${qs(query)}`),
  breakdown: (query: { dim: BreakdownDim; minutes: number; deviceId?: string; limit?: number }) =>
    request<BreakdownDto>(`/api/breakdown${qs(query)}`),
  sankey: (query: { minutes: number; limit?: number }) =>
    request<SankeyDto>(`/api/sankey${qs(query)}`),
  punchcard: (days: number) => request<PunchcardDto>(`/api/insights/punchcard${qs({ days })}`),
  daily: (days: number) => request<DailyPoint[]>(`/api/insights/daily${qs({ days })}`),
  movers: (minutes: number) => request<MoversDto>(`/api/insights/movers${qs({ minutes })}`),
  firstSeen: (days: number) => request<FirstSeenDto>(`/api/insights/firstseen${qs({ days })}`),
  rejected: (minutes: number) =>
    request<RejectedSummaryDto>(`/api/insights/rejected${qs({ minutes })}`),
  deviceDetail: (id: string, minutes: number) =>
    request<DeviceDetailDto>(`/api/devices/${encodeURIComponent(id)}/detail${qs({ minutes })}`),
  cities: (minutes: number) => request<CityPoint[]>(`/api/destinations/cities${qs({ minutes })}`),
  hostDetail: (host: string, minutes: number) =>
    request<HostDetailDto>(`/api/hosts/${encodeURIComponent(host)}${qs({ minutes })}`),
  dnsSummary: (minutes: number) => request<DnsSummaryDto>(`/api/dns/summary${qs({ minutes })}`),
  destinations: () => request<DestinationsDto>("/api/destinations"),
  countryDevices: (code: string) =>
    request<CountryDeviceShare[]>(`/api/destinations/${encodeURIComponent(code)}/devices`),
  dnsLogs: (query: LogsQuery = {}) => request<DnsLogPage>(`/api/logs/dns${qs(query)}`),
  systemLogs: (query: LogsQuery = {}) => request<SystemLogPage>(`/api/logs/system${qs(query)}`),
  sources: () => request<SourceDto[]>("/api/sources"),
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
