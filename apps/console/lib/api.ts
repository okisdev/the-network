import type {
  CountryDeviceShare,
  DestinationsDto,
  DeviceDto,
  DnsLogPage,
  FlowsPage,
  FlowsQuery,
  LogsQuery,
  OverviewDto,
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
