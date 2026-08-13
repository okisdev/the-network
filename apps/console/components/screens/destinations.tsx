"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  BreakdownRow,
  CityPoint,
  DestinationCountry,
  DestinationHost,
  HostDetailDto,
  SankeyDto,
  TimeseriesPoint,
} from "@the-network/schema";
import { Download, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type KeyboardEvent } from "react";
import { BarsList } from "@/components/charts/bars-list";
import { DonutChart } from "@/components/charts/donut";
import { MirroredAreaChart } from "@/components/charts/mirrored-area";
import { SankeyFlow } from "@/components/charts/sankey-flow";
import { Sparkline } from "@/components/charts/sparkline";
import { SplitBar } from "@/components/charts/split-bar";
import { TreemapChart } from "@/components/charts/treemap-chart";
import { ArrowLink } from "@/components/ui/arrow-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { DomainFavicon } from "@/components/ui/domain-favicon";
import { Empty } from "@/components/ui/empty";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api, type RangeQuery } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatBytes, formatTime } from "@/lib/format";
import { registrableDomain, serviceForPort } from "@/lib/net-labels";
import { useQueryParams } from "@/lib/use-query-params";

const WorldMap = dynamic(
  () => import("@/components/screens/world-map").then((module) => module.WorldMap),
  { ssr: false, loading: () => <Skeleton className="aspect-[94/43] w-full" /> },
);

const EMPTY_SANKEY: SankeyDto = { nodes: [], links: [] };
const TABS = ["map", "domains", "ports", "flow"] as const;
type DestinationTab = (typeof TABS)[number];

function isDestinationTab(value: string | null): value is DestinationTab {
  return value !== null && TABS.some((tab) => tab === value);
}

function countryBytes(country: DestinationCountry): number {
  return country.bytesIn + country.bytesOut;
}

function breakdownBytes(row: BreakdownRow): number {
  return row.bytesIn + row.bytesOut;
}

function flowHref(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `/flows?${search.toString()}`;
}

function dominantCountryForDomain(
  domain: string,
  hosts: DestinationHost[],
): string | undefined {
  const countries = new Map<string, number>();
  for (const host of hosts) {
    if (!host.country || registrableDomain(host.host) !== domain.toLowerCase()) continue;
    const code = host.country.toUpperCase();
    countries.set(code, (countries.get(code) ?? 0) + host.bytes);
  }
  return [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function activateRow(event: KeyboardEvent, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function CountriesPanel({
  countries,
  selected,
  onSelect,
  onClear,
}: {
  countries: DestinationCountry[];
  selected: string | null;
  onSelect: (code: string) => void;
  onClear: () => void;
}) {
  const top = useMemo(
    () => [...countries].sort((a, b) => countryBytes(b) - countryBytes(a)).slice(0, 10),
    [countries],
  );
  const totalBytes = Math.max(
    1,
    countries.reduce((sum, country) => sum + countryBytes(country), 0),
  );
  const maxBytes = Math.max(1, ...top.map(countryBytes));

  const {
    data: deviceData,
    isLoading: devicesLoading,
    isError: devicesError,
  } = useQuery({
    queryKey: ["countryDevices", selected],
    queryFn: () => api.countryDevices(selected!),
    enabled: Boolean(selected),
    refetchInterval: 15000,
  });
  const devices = Array.isArray(deviceData) ? deviceData : [];

  return (
    <Card title="Countries">
      {selected && (
        <div className="bg-muted ring-border mb-4 rounded-lg p-3 ring-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Who talks to {selected}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClear}
              aria-label="Clear country selection"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {devicesLoading && <Skeleton className="h-20 w-full" />}
          {devicesError && <Empty message="Destinations API not available yet" />}
          {!devicesLoading && !devicesError && devices.length === 0 && (
            <Empty message="No devices for this country" />
          )}
          {!devicesLoading && !devicesError && devices.length > 0 && (
            <div className="flex flex-col gap-2">
              {devices.map((device) => (
                <div key={device.deviceId} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px]">{device.deviceName}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                    {formatBytes(device.bytes)}
                    <span className="ml-2">{device.flows}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {top.length === 0 ? (
        <Empty
          message="No destination data yet"
          hint="Traffic starts mapping once flows carry GeoIP"
        />
      ) : (
        <div className="flex flex-col gap-1">
          {top.map((country) => {
            const bytes = countryBytes(country);
            const code = country.code.toUpperCase();
            const isSelected = selected === code;

            return (
              <div
                key={code}
                className={`focus-within:ring-ring flex items-stretch rounded-lg transition-colors duration-150 focus-within:ring-2 ${
                  isSelected ? "bg-popover ring-primary ring-1" : "hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(code)}
                  aria-pressed={isSelected}
                  className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <CountryChip code={code} />
                    <span className="font-mono text-[11px] tabular-nums">{formatBytes(bytes)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                      <div
                        className="bg-primary/50 h-full rounded-full"
                        style={{ width: `${Math.max(2, (bytes / maxBytes) * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {country.flows} · {((bytes / totalBytes) * 100).toFixed(0)}%
                    </span>
                  </div>
                </button>
                <ArrowLink
                  href={flowHref({ country: code })}
                  className="shrink-0 rounded-lg px-2 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  flows
                </ArrowLink>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HostsTable({
  hosts,
  onSelect,
}: {
  hosts: DestinationHost[];
  onSelect: (host: string) => void;
}) {
  const rows = hosts.slice(0, 30);

  if (rows.length === 0) {
    return (
      <Empty
        message="No destination data yet"
        hint="Traffic starts mapping once flows carry GeoIP"
      />
    );
  }

  return (
    <Table className="min-w-[520px]">
      <TableHead>
        <TableRow>
          <TableHeader>Host</TableHeader>
          <TableHeader>Country</TableHeader>
          <TableHeader className="text-right">Traffic</TableHeader>
          <TableHeader className="text-right">Flows</TableHeader>
          <TableHeader className="text-right">Devices</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((host) => {
          const domain = registrableDomain(host.host);
          const inspect = () => onSelect(domain);
          return (
            <TableRow
              key={host.host}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${domain}`}
              onClick={inspect}
              onKeyDown={(event) => activateRow(event, inspect)}
              className="hover:bg-muted focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
            >
              <TableCell className="max-w-0 truncate font-mono text-[12px]" title={host.host}>
                {host.host}
              </TableCell>
              <TableCell>
                {host.country ? (
                  <CountryChip code={host.country} />
                ) : (
                  <span className="text-muted-foreground text-xs">Unknown</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-[12px] tabular-nums">
                {formatBytes(host.bytes)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {host.flows}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {host.devices}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function MapTab({
  countries,
  hosts,
  cities,
  selected,
  isLoading,
  isError,
  onSelectCountry,
  onClearCountry,
  onSelectHost,
}: {
  countries: DestinationCountry[];
  hosts: DestinationHost[];
  cities: CityPoint[];
  selected: string | null;
  isLoading: boolean;
  isError: boolean;
  onSelectCountry: (code: string) => void;
  onClearCountry: () => void;
  onSelectHost: (host: string) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <Skeleton className="h-[430px] w-full" />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <Empty message="Destinations API not available yet" />
      </Card>
    );
  }

  if (countries.length === 0) {
    return (
      <Card>
        <Empty
          message="No destination data yet"
          hint="Traffic starts mapping once flows carry GeoIP"
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title="Map" className="col-span-12 xl:col-span-8">
        <WorldMap
          countries={countries}
          cities={cities}
          selected={selected}
          onSelect={onSelectCountry}
        />
      </Card>
      <div className="col-span-12 xl:col-span-4">
        <CountriesPanel
          countries={countries}
          selected={selected}
          onSelect={onSelectCountry}
          onClear={onClearCountry}
        />
      </div>
      <Card title="Hosts" className="col-span-12">
        <HostsTable hosts={hosts} onSelect={onSelectHost} />
      </Card>
    </div>
  );
}

function DomainTable({
  rows,
  hosts,
  trends,
  onSelect,
}: {
  rows: BreakdownRow[];
  hosts: DestinationHost[];
  trends: Array<{ data?: TimeseriesPoint[]; isLoading: boolean }>;
  onSelect: (host: string) => void;
}) {
  if (rows.length === 0) return <Empty message="No domain traffic yet" />;
  const maximum = Math.max(1, ...rows.map(breakdownBytes));

  return (
    <Table className="min-w-[820px]">
      <TableHead>
        <TableRow>
          <TableHeader>Domain</TableHeader>
          <TableHeader>Country</TableHeader>
          <TableHeader className="text-right">Devices</TableHeader>
          <TableHeader className="text-right">Flows</TableHeader>
          <TableHeader className="w-44 text-right">Traffic</TableHeader>
          <TableHeader className="w-32">Trend</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => {
          const country = row.country ?? dominantCountryForDomain(row.key, hosts);
          const trend = trends[index];
          const points = Array.isArray(trend?.data)
            ? trend.data.map((point) => point.in + point.out)
            : [];
          const inspect = () => onSelect(row.key);
          return (
            <TableRow
              key={row.key}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${row.key}`}
              onClick={inspect}
              onKeyDown={(event) => activateRow(event, inspect)}
              className="hover:bg-muted focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
            >
              <TableCell className="max-w-64 font-mono text-[12px]" title={row.key}>
                <span className="flex items-center gap-2">
                  <DomainFavicon domain={row.key} />
                  <span className="truncate">{row.key}</span>
                </span>
              </TableCell>
              <TableCell>
                {country ? (
                  <CountryChip code={country} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {row.devices ?? 0}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {row.flows}
              </TableCell>
              <TableCell>
                <div className="ml-auto w-36">
                  <SplitBar
                    inValue={row.bytesIn}
                    outValue={row.bytesOut}
                    max={maximum}
                  />
                  <div className="text-muted-foreground mt-1 text-right font-mono text-[11px] tabular-nums">
                    {formatBytes(breakdownBytes(row))}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {trend?.isLoading ? (
                  <Skeleton className="h-7 w-full" />
                ) : points.length >= 2 ? (
                  <Sparkline points={points} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DirectIpsTable({ rows, onSelect }: { rows: BreakdownRow[]; onSelect: (ip: string) => void }) {
  if (rows.length === 0) return <Empty message="No direct-IP traffic in this range" />;
  const maximum = Math.max(1, ...rows.map(breakdownBytes));

  return (
    <Table className="min-w-[620px]">
      <TableHead>
        <TableRow>
          <TableHeader>IP</TableHeader>
          <TableHeader>Country</TableHeader>
          <TableHeader>Network</TableHeader>
          <TableHeader className="text-right">Devices</TableHeader>
          <TableHeader className="text-right">Flows</TableHeader>
          <TableHeader className="w-52 text-right">Traffic</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const select = () => onSelect(row.key);
          return (
            <TableRow
              key={row.key}
              role="button"
              tabIndex={0}
              aria-label={`View flows for ${row.key}`}
              onClick={select}
              onKeyDown={(event) => activateRow(event, select)}
              className="hover:bg-muted focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
            >
              <TableCell className="font-mono text-[12px]">{row.key}</TableCell>
              <TableCell>
                {row.country ? (
                  <CountryChip code={row.country} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-64">
                <span className="block truncate text-[12px]" title={row.label}>
                  {row.label ?? "—"}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {row.devices ?? 0}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
                {row.flows}
              </TableCell>
              <TableCell>
                <div className="ml-auto w-40">
                  <SplitBar inValue={row.bytesIn} outValue={row.bytesOut} max={maximum} />
                  <div className="text-muted-foreground mt-1 text-right font-mono text-[11px] tabular-nums">
                    {formatBytes(breakdownBytes(row))}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function HostInspector({
  host,
  rangeQuery,
  fallbackCountry,
  onClose,
}: {
  host: string | null;
  rangeQuery: RangeQuery;
  fallbackCountry?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "hostDetail",
      host,
      rangeQuery.minutes,
      rangeQuery.from,
      rangeQuery.to,
    ],
    queryFn: () => api.hostDetail(host!, rangeQuery),
    enabled: Boolean(host),
    refetchInterval: 30000,
  });
  const detail: HostDetailDto | undefined = data;
  const country = detail?.country?.toUpperCase() ?? fallbackCountry;

  return (
    <InspectorPanel
      open={Boolean(host)}
      onClose={onClose}
      title={
        host ? (
          <span className="flex min-w-0 items-center gap-2">
            <DomainFavicon key={host} domain={host} />
            <span className="truncate">{host}</span>
          </span>
        ) : (
          "Domain"
        )
      }
      sub={
        <span className="inline-flex items-center gap-1.5">
          {country ? <CountryChip code={country} /> : <span>—</span>}
          <span>registrable domain</span>
        </span>
      }
    >
      {isLoading && !detail ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[140px] w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        <Empty message="Host details are not available yet" />
      ) : detail ? (
        <>
          <InspectorSection title="Usage">
            {detail.series.length > 0 ? (
              <MirroredAreaChart points={detail.series} height={140} />
            ) : (
              <Empty message="No usage history yet" />
            )}
          </InspectorSection>
          <InspectorSection title="Devices">
            {detail.devices.length > 0 ? (
              <BarsList
                rows={detail.devices.slice(0, 8).map((row) => ({
                  key: row.key,
                  label: row.label ?? row.key,
                  value: breakdownBytes(row),
                  sub: `${row.flows} flows`,
                }))}
                onSelect={(key) => router.push(flowHref({ device: key, search: detail.host }))}
              />
            ) : (
              <Empty message="No devices yet" />
            )}
          </InspectorSection>
          <InspectorSection title="Processes">
            {detail.processes.length > 0 ? (
              <BarsList
                rows={detail.processes.slice(0, 6).map((row) => ({
                  key: row.key,
                  label: row.label ?? row.key,
                  value: breakdownBytes(row),
                  sub: `${row.flows} flows`,
                }))}
                onSelect={(key) => router.push(flowHref({ process: key, search: detail.host }))}
              />
            ) : (
              <Empty message="No process data yet" />
            )}
          </InspectorSection>
          <InspectorSection title="Ports">
            {detail.ports.length > 0 ? (
              <div className="flex flex-col gap-2">
                {detail.ports.slice(0, 8).map((row) => {
                  const service = serviceForPort(Number(row.key));
                  return (
                    <div key={row.key} className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-[12px]">
                        :{row.key}{service ? ` · ${service}` : ""}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                        {formatBytes(breakdownBytes(row))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty message="No port data yet" />
            )}
          </InspectorSection>
          <InspectorSection
            title="Recent flows"
            action={<ArrowLink href={flowHref({ search: detail.host })}>All flows</ArrowLink>}
          >
            {detail.recentFlows.length > 0 ? (
              <div className="flex flex-col gap-2">
                {detail.recentFlows.slice(0, 10).map((flow) => {
                  const destination = flow.dst.host ?? flow.dst.ip ?? "Unknown";
                  return (
                    <div key={flow.id} className="flex items-baseline gap-2 text-[12px]">
                      <span className="text-muted-foreground w-16 shrink-0 font-mono tabular-nums">
                        {formatTime(flow.ts)}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={destination}>
                        {destination}
                        {flow.dst.port != null && (
                          <span className="text-muted-foreground">:{flow.dst.port}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                        {formatBytes(flow.bytesIn + flow.bytesOut)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty message="No recent flows yet" />
            )}
          </InspectorSection>
        </>
      ) : null}
    </InspectorPanel>
  );
}

function DomainsTab({
  hosts,
  host,
  rangeQuery,
  onSelect,
  onClose,
}: {
  hosts: DestinationHost[];
  host: string | null;
  rangeQuery: RangeQuery;
  onSelect: (host: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { minutes } = rangeQuery;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["breakdown", "domain", minutes, rangeQuery.from, rangeQuery.to, 40],
    queryFn: () => api.breakdown({ dim: "domain", limit: 40, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const { data: directIpData, isLoading: directIpsLoading } = useQuery({
    queryKey: ["breakdown", "ip", minutes, rangeQuery.from, rangeQuery.to, 12],
    queryFn: () => api.breakdown({ dim: "ip", limit: 12, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const directIpRows = Array.isArray(directIpData?.rows) ? directIpData.rows : [];
  const visibleRows = rows.slice(0, 15);
  const trends = useQueries({
    queries: visibleRows.map((row) => ({
      queryKey: [
        "timeseries",
        "host",
        row.key,
        minutes,
        rangeQuery.from,
        rangeQuery.to,
      ],
      queryFn: () => api.timeseries({ scope: `host:${row.key}`, ...rangeQuery }),
      refetchInterval: 60000,
    })),
  });
  const fallbackCountry = host ? dominantCountryForDomain(host, hosts) : undefined;

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        <Card title="Domains by volume" className="col-span-12">
          {isLoading && !data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : isError ? (
            <Empty message="Domain breakdown is not available yet" />
          ) : rows.length === 0 ? (
            <Empty message="No domain traffic yet" />
          ) : (
            <TreemapChart
              items={rows.map((row) => ({
                key: row.key,
                label: row.key,
                value: breakdownBytes(row),
              }))}
              height={300}
              onSelect={onSelect}
            />
          )}
        </Card>
        <Card
          title="Top domains"
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `domains-${new Date().toISOString().slice(0, 16).replace(":", "")}.csv`,
                  ["domain", "country", "devices", "flows", "bytes_in", "bytes_out"],
                  rows.map((row) => [
                    row.key,
                    row.country ?? dominantCountryForDomain(row.key, hosts),
                    row.devices,
                    row.flows,
                    row.bytesIn,
                    row.bytesOut,
                  ]),
                )
              }
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          }
          className="col-span-12"
        >
          {isLoading && !data ? (
            <Skeleton className="h-80 w-full" />
          ) : isError ? (
            <Empty message="Domain breakdown is not available yet" />
          ) : (
            <DomainTable rows={visibleRows} hosts={hosts} trends={trends} onSelect={onSelect} />
          )}
        </Card>
        <Card title="Direct IPs" className="col-span-12">
          {directIpsLoading && !directIpData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <DirectIpsTable
              rows={directIpRows}
              onSelect={(ip) => router.push(flowHref({ search: ip }))}
            />
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Connections that never presented a hostname
          </p>
        </Card>
      </div>
      <HostInspector
        host={host}
        rangeQuery={rangeQuery}
        fallbackCountry={fallbackCountry}
        onClose={onClose}
      />
    </>
  );
}

function protocolColor(key: string): string {
  if (key === "tcp") return "var(--color-chart-2)";
  if (key === "udp") return "var(--color-chart-1)";
  return "var(--color-chart-7)";
}

function PortsTab({ rangeQuery }: { rangeQuery: RangeQuery }) {
  const router = useRouter();
  const { minutes } = rangeQuery;
  const {
    data: protocolData,
    isLoading: protocolsLoading,
    isError: protocolsError,
  } = useQuery({
    queryKey: ["breakdown", "proto", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.breakdown({ dim: "proto", ...rangeQuery }),
    refetchInterval: 30000,
  });
  const {
    data: portData,
    isLoading: portsLoading,
    isError: portsError,
  } = useQuery({
    queryKey: ["breakdown", "port", minutes, rangeQuery.from, rangeQuery.to, 15],
    queryFn: () => api.breakdown({ dim: "port", limit: 15, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const {
    data: networkData,
    isLoading: networksLoading,
    isError: networksError,
  } = useQuery({
    queryKey: ["breakdown", "asn", minutes, rangeQuery.from, rangeQuery.to, 12],
    queryFn: () => api.breakdown({ dim: "asn", limit: 12, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const protocolRows = Array.isArray(protocolData?.rows) ? protocolData.rows : [];
  const portRows = Array.isArray(portData?.rows) ? portData.rows : [];
  const networkRows = Array.isArray(networkData?.rows) ? networkData.rows : [];
  const protocolTotal = protocolRows.reduce((sum, row) => sum + breakdownBytes(row), 0);

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title="Protocols" className="col-span-12 lg:col-span-4">
        {protocolsLoading && !protocolData ? (
          <Skeleton className="h-52 w-full" />
        ) : protocolsError ? (
          <Empty message="Protocol breakdown is not available yet" />
        ) : protocolRows.length === 0 ? (
          <Empty message="No protocol traffic yet" />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-6 lg:flex-col xl:flex-row">
            <DonutChart
              slices={protocolRows.map((row) => ({
                key: row.key,
                label: row.key,
                value: breakdownBytes(row),
                color: protocolColor(row.key.toLowerCase()),
              }))}
              centerLabel={formatBytes(protocolTotal)}
              centerSub="traffic"
            />
            <div className="min-w-32 flex-1 space-y-2">
              {protocolRows.map((row) => {
                const key = row.key.toLowerCase();
                return (
                  <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex items-center gap-2 font-mono uppercase">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: protocolColor(key) }}
                      />
                      {key}
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {row.flows} flows
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
      <Card title="Top ports" className="col-span-12 lg:col-span-8">
        {portsLoading && !portData ? (
          <Skeleton className="h-72 w-full" />
        ) : portsError ? (
          <Empty message="Port breakdown is not available yet" />
        ) : portRows.length === 0 ? (
          <Empty message="No port traffic yet" />
        ) : (
          <BarsList
            rows={portRows.map((row) => {
              const service = serviceForPort(Number(row.key));
              return {
                key: row.key,
                label: `:${row.key}${service ? ` · ${service}` : ""}`,
                sub: `${row.flows} flows · ${row.devices ?? 0} devices`,
                value: breakdownBytes(row),
              };
            })}
            onSelect={(port) => router.push(flowHref({ port }))}
          />
        )}
      </Card>
      <Card title="Networks" className="col-span-12">
        {networksLoading && !networkData ? (
          <Skeleton className="h-72 w-full" />
        ) : networksError ? (
          <Empty message="Network breakdown is not available yet" />
        ) : networkRows.length === 0 ? (
          <Empty message="No AS data yet — run scripts/update-asn.mjs to fetch the offline database" />
        ) : (
          <BarsList
            rows={networkRows.map((row) => ({
              key: row.key,
              label: row.label ?? `AS${row.key}`,
              sub: `AS${row.key} · ${row.flows.toLocaleString()} flows · ${row.devices ?? 0} devices`,
              value: breakdownBytes(row),
            }))}
          />
        )}
      </Card>
    </div>
  );
}

interface ParsedSankeyId {
  kind: "device" | "policy" | "country";
  value: string;
}

function parseSankeyId(id: string): ParsedSankeyId | undefined {
  const firstColon = id.indexOf(":");
  const secondColon = id.indexOf(":", firstColon + 1);
  if (firstColon <= 0 || secondColon <= firstColon + 1 || secondColon === id.length - 1) {
    return undefined;
  }
  const kind = id.slice(0, firstColon);
  if (id.slice(firstColon + 1, secondColon) !== "key") return undefined;
  if (kind !== "device" && kind !== "policy" && kind !== "country") return undefined;
  return { kind, value: id.slice(secondColon + 1) };
}

function FlowTab({ rangeQuery, rangeLabel }: { rangeQuery: RangeQuery; rangeLabel: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "sankey",
      rangeQuery.minutes,
      rangeQuery.from,
      rangeQuery.to,
      8,
    ],
    queryFn: () => api.sankey({ limit: 8, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const sankey = data ?? EMPTY_SANKEY;
  const {
    data: chainsData,
    isLoading: chainsLoading,
    isError: chainsError,
  } = useQuery({
    queryKey: [
      "chains",
      rangeQuery.minutes,
      rangeQuery.from,
      rangeQuery.to,
      12,
    ],
    queryFn: () => api.chains({ limit: 12, ...rangeQuery }),
    refetchInterval: 30000,
  });
  const chains = chainsData ?? EMPTY_SANKEY;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Traffic flow">
        {isLoading && !data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : isError ? (
          <Empty message="Traffic flow is not available yet" />
        ) : sankey.links.length === 0 ? (
          <Empty message="No traffic flow yet" />
        ) : (
          <>
            <SankeyFlow
              data={sankey}
              height={420}
              onLink={(sourceId, targetId) => {
                const source = parseSankeyId(sourceId);
                const target = parseSankeyId(targetId);
                let href: string | undefined;
                if (source?.kind === "device") href = flowHref({ device: source.value });
                else if (source?.kind === "policy") href = flowHref({ policy: source.value });
                else if (target?.kind === "country") href = flowHref({ country: target.value });
                else if (target?.kind === "policy") href = flowHref({ policy: target.value });
                if (href) router.push(href);
              }}
            />
            <p className="text-muted-foreground mt-2 text-xs">
              Devices → policies → countries · top 8 per tier · {rangeLabel}
            </p>
          </>
        )}
      </Card>
      <Card title="Decision chains">
        {chainsLoading && !chainsData ? (
          <Skeleton className="h-[380px] w-full" />
        ) : chainsError ? (
          <Empty message="Decision chains are not available yet" />
        ) : chains.links.length === 0 ? (
          <Empty message="No decision chains recorded yet" />
        ) : (
          <>
            <SankeyFlow data={chains} height={380} />
            <p className="text-muted-foreground mt-2 text-xs">
              Observed rule → policy group → exit paths · top 12 by traffic
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export function DestinationsScreen() {
  const { minutes, rangeQuery, label } = useTimeRange();
  const [params, updateParams] = useQueryParams();
  const [selected, setSelected] = useState<string | null>(null);
  const tabParam = params.get("tab");
  const tab: DestinationTab = isDestinationTab(tabParam) ? tabParam : "map";
  const host = params.get("host");
  const {
    data,
    isLoading: destinationsLoading,
    isError: destinationsError,
  } = useQuery({
    queryKey: ["destinations"],
    queryFn: api.destinations,
    refetchInterval: 15000,
  });
  const { data: cityData } = useQuery({
    queryKey: ["cities", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.cities(rangeQuery),
    enabled: tab === "map",
    refetchInterval: 30000,
  });
  const countries = Array.isArray(data?.countries) ? data.countries : [];
  const hosts = Array.isArray(data?.hosts) ? data.hosts : [];
  const cities = Array.isArray(cityData) ? cityData : [];

  const selectHost = (domain: string) => {
    if (!domain) return;
    updateParams({ tab: "domains", host: domain });
  };

  return (
    <>
      <PageHeader title="Destinations" sub="Where the home network talks to" />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (!isDestinationTab(value)) return;
          updateParams({
            tab: value === "map" ? undefined : value,
            host: value === "domains" ? (host ?? undefined) : undefined,
          });
        }}
      >
        <div className="mb-3">
          <TabsList>
            <TabsTab value="map">Map</TabsTab>
            <TabsTab value="domains">Domains</TabsTab>
            <TabsTab value="ports">Ports</TabsTab>
            <TabsTab value="flow">Flow</TabsTab>
          </TabsList>
        </div>
        <TabsPanel value="map">
          {tab === "map" && (
            <MapTab
              countries={countries}
              hosts={hosts}
              cities={cities}
              selected={selected}
              isLoading={destinationsLoading && !data}
              isError={destinationsError}
              onSelectCountry={setSelected}
              onClearCountry={() => setSelected(null)}
              onSelectHost={selectHost}
            />
          )}
        </TabsPanel>
        <TabsPanel value="domains">
          {tab === "domains" && (
            <DomainsTab
              hosts={hosts}
              host={host}
              rangeQuery={rangeQuery}
              onSelect={selectHost}
              onClose={() => updateParams({ host: undefined })}
            />
          )}
        </TabsPanel>
        <TabsPanel value="ports">
          {tab === "ports" && <PortsTab rangeQuery={rangeQuery} />}
        </TabsPanel>
        <TabsPanel value="flow">
          {tab === "flow" && (
            <FlowTab rangeQuery={rangeQuery} rangeLabel={label} />
          )}
        </TabsPanel>
      </Tabs>
    </>
  );
}
