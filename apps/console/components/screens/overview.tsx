"use client";

import { useQuery } from "@tanstack/react-query";
import type { EventDto } from "@the-network/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { BarsList } from "@/components/charts/bars-list";
import { DonutChart } from "@/components/charts/donut";
import { MiniBars } from "@/components/charts/mini-bars";
import { MirroredAreaChart } from "@/components/charts/mirrored-area";
import { Sparkline } from "@/components/charts/sparkline";
import { StackedAreaChart } from "@/components/charts/stacked-area";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api } from "@/lib/api";
import { CHART_SLOTS, colorForKey, policyColor } from "@/lib/chart-colors";
import { formatBytes, formatRate, formatTime, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type ThroughputMode = "total" | "devices" | "policies";

interface ZoomRange {
  from: number;
  to: number;
}

function eventTone(kind: EventDto["kind"]): StatusTone {
  switch (kind) {
    case "device_joined":
      return "primary";
    case "device_online":
    case "source_recovered":
      return "ok";
    case "source_error":
      return "destructive";
    case "device_offline":
      return "muted";
  }
}

function downsampleRejected(series: Array<{ ts: number; flows: number }>) {
  if (series.length === 0) return [];
  const bucketSize = Math.max(1, Math.ceil(series.length / 24));
  const buckets = Array.from({ length: Math.ceil(series.length / bucketSize) }, (_, index) => {
    const points = series.slice(index * bucketSize, (index + 1) * bucketSize);
    return {
      ts: points[0]?.ts ?? 0,
      count: points.reduce((total, point) => total + point.flows, 0),
    };
  });
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  return buckets.map((bucket, index) => ({
    count: bucket.count,
    label:
      index % labelEvery === 0 || index === buckets.length - 1
        ? formatTime(bucket.ts).slice(0, 5)
        : "",
  }));
}

function KpiTile({
  label,
  value,
  sub,
  loading,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  valueClassName?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="col-span-6 sm:col-span-4 xl:col-span-2 [&>div]:p-3.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-24" />
      ) : (
        <div
          className={cn(
            "mt-1 font-mono text-xl leading-none font-semibold tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </div>
      )}
      {children ?? (
        <div className="text-muted-foreground mt-2 min-h-7 font-mono text-[11px] tabular-nums">
          {sub}
        </div>
      )}
    </Card>
  );
}

export function OverviewScreen() {
  const router = useRouter();
  const live = useLive();
  const { minutes } = useTimeRange();
  const [throughputMode, setThroughputMode] = useState<ThroughputMode>("total");
  const [zoom, setZoom] = useState<ZoomRange | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
    refetchInterval: 10000,
  });
  const { data: sources } = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    refetchInterval: 30000,
  });
  const { data: timeseriesData, isLoading: timeseriesLoading } = useQuery({
    queryKey: ["timeseries", "wan", minutes],
    queryFn: () => api.timeseries({ scope: "wan", minutes }),
    refetchInterval: 15000,
  });
  const zoomMinutes = zoom ? Math.max(5, Math.round((zoom.to - zoom.from) / 60000)) : minutes;
  const { data: zoomTimeseriesData, isLoading: zoomTimeseriesLoading } = useQuery({
    queryKey: ["timeseries", "wan", "zoom", minutes, zoomMinutes, zoom?.from, zoom?.to],
    queryFn: () => api.timeseries({ scope: "wan", minutes: zoomMinutes }),
    enabled: zoom !== null && throughputMode === "total",
    refetchInterval: 15000,
  });
  const multiScope = throughputMode === "devices" ? "device" : "policy";
  const { data: multiSeriesData, isLoading: multiSeriesLoading } = useQuery({
    queryKey: ["timeseries-multi", multiScope, minutes],
    queryFn: () => api.timeseriesMulti({ scope: multiScope, minutes, limit: 5 }),
    enabled: throughputMode !== "total",
    refetchInterval: 20000,
  });
  const { data: destinationBreakdown, isLoading: destinationLoading } = useQuery({
    queryKey: ["breakdown", "domain", minutes, 8],
    queryFn: () => api.breakdown({ dim: "domain", minutes, limit: 8 }),
    refetchInterval: 30000,
  });
  const { data: processBreakdown, isLoading: processLoading } = useQuery({
    queryKey: ["breakdown", "process", minutes, 8],
    queryFn: () => api.breakdown({ dim: "process", minutes, limit: 8 }),
    refetchInterval: 30000,
  });
  const { data: dns, isLoading: dnsLoading } = useQuery({
    queryKey: ["dns-summary", minutes],
    queryFn: () => api.dnsSummary(minutes),
    refetchInterval: 30000,
  });
  const { data: rejected, isLoading: rejectedLoading } = useQuery({
    queryKey: ["rejected", minutes],
    queryFn: () => api.rejected(minutes),
    refetchInterval: 30000,
  });

  const overviewEvents = Array.isArray(overview?.events) ? overview.events : [];
  const liveEvents = Array.isArray(live.events) ? live.events : [];
  const recentEvents = useMemo(() => {
    const events = new Map<string, EventDto>();
    for (const event of liveEvents) events.set(event.id, event);
    for (const event of overviewEvents) {
      if (!events.has(event.id)) events.set(event.id, event);
    }
    return [...events.values()].sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [liveEvents, overviewEvents]);

  const overviewTopDevices = Array.isArray(overview?.topDevices) ? overview.topDevices : [];
  const topDevices = useMemo(
    () =>
      overviewTopDevices.slice(0, 5).map((device) => {
        const rate = live.deviceRates.get(device.deviceId);
        return {
          key: device.deviceId,
          label: device.name,
          value: (rate?.rateIn ?? device.rateIn) + (rate?.rateOut ?? device.rateOut),
        };
      }),
    [live.deviceRates, overviewTopDevices],
  );

  const timeseries = Array.isArray(timeseriesData) ? timeseriesData : [];
  const zoomTimeseries = Array.isArray(zoomTimeseriesData) ? zoomTimeseriesData : [];
  const throughputPoints = zoom ? zoomTimeseries : timeseries;
  const multiSeries = (Array.isArray(multiSeriesData) ? multiSeriesData : []).filter(
    (entry) => entry.points.length > 0,
  );
  const policySplit = (Array.isArray(overview?.policySplit) ? overview.policySplit : [])
    .filter((entry) => entry.bytes > 0)
    .slice(0, 6);
  const totalPolicyBytes = policySplit.reduce((total, entry) => total + entry.bytes, 0);
  const summary = live.summary;
  const rateIn = summary?.wan.rateIn ?? overview?.wan.rateIn ?? 0;
  const rateOut = summary?.wan.rateOut ?? overview?.wan.rateOut ?? 0;
  const todayIn = summary?.today.in ?? overview?.today.in ?? 0;
  const todayOut = summary?.today.out ?? overview?.today.out ?? 0;
  const activeDevices = summary?.activeDevices ?? overview?.activeDevices ?? 0;
  const activeFlows = summary?.flowsActive ?? overview?.flowsActive ?? 0;
  const totalDevices = overview?.totalDevices ?? 0;
  const rejectedTodayFlows = overview?.rejectedToday?.flows ?? 0;
  const rejectedTodayBytes = overview?.rejectedToday?.bytes ?? 0;
  const initialSummaryLoading = overviewLoading && !overview && !summary;
  const unhealthySources = (sources ?? [])
    .filter((source) => source.status.state === "error" || source.status.state === "degraded")
    .sort((a, b) => (a.status.state === b.status.state ? 0 : a.status.state === "error" ? -1 : 1));
  const destinationRows = (destinationBreakdown?.rows ?? []).map((row) => ({
    key: row.key,
    label: row.key,
    value: row.bytesIn + row.bytesOut,
    sub: `${row.flows.toLocaleString()} flows`,
    color: colorForKey(row.key),
  }));
  const processRows = (processBreakdown?.rows ?? []).map((row) => ({
    key: row.key,
    label: row.label ?? row.key,
    value: row.bytesIn + row.bytesOut,
    sub: `${row.flows.toLocaleString()} flows`,
    color: colorForKey(row.key),
  }));
  const dnsSeries = dns?.series ?? [];
  const dnsTotal = dnsSeries.reduce((total, point) => total + point.count, 0);
  const rejectedBars = downsampleRejected(rejected?.series ?? []);

  return (
    <>
      <PageHeader title="Overview" sub="How the home network is doing right now" />

      {unhealthySources.length > 0 && (
        <Card className="mb-4 [&>div]:p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              {unhealthySources.map((source) => (
                <div key={source.id} className="flex min-w-0 items-center gap-2">
                  <StatusDot
                    tone={source.status.state === "error" ? "destructive" : "warn"}
                  />
                  <span className="truncate text-sm">
                    {source.name}: {source.status.message ?? source.status.state}
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/sources"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sources
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-4">
        <KpiTile label="Download" loading={initialSummaryLoading} value={formatRate(rateIn)}>
          <div className="mt-2 min-h-7">
            {timeseriesLoading && timeseries.length === 0 ? (
              <Skeleton className="h-7 w-full" />
            ) : (
              <Sparkline points={timeseries.map((point) => point.in)} />
            )}
          </div>
        </KpiTile>
        <KpiTile label="Upload" loading={initialSummaryLoading} value={formatRate(rateOut)}>
          <div className="mt-2 min-h-7">
            {timeseriesLoading && timeseries.length === 0 ? (
              <Skeleton className="h-7 w-full" />
            ) : (
              <Sparkline
                points={timeseries.map((point) => point.out)}
                stroke="var(--color-chart-3)"
              />
            )}
          </div>
        </KpiTile>
        <KpiTile
          label="Active devices"
          loading={initialSummaryLoading}
          sub={`of ${totalDevices.toLocaleString()}`}
          value={activeDevices.toLocaleString()}
        />
        <KpiTile
          label="Active flows"
          loading={initialSummaryLoading}
          sub="connections now"
          value={activeFlows.toLocaleString()}
        />
        <KpiTile
          label="Today"
          loading={initialSummaryLoading}
          sub={`↓ ${formatBytes(todayIn)} · ↑ ${formatBytes(todayOut)}`}
          value={formatBytes(todayIn + todayOut)}
        />
        <KpiTile
          label="Rejected today"
          loading={overviewLoading && !overview}
          sub={formatBytes(rejectedTodayBytes)}
          value={rejectedTodayFlows.toLocaleString()}
          valueClassName={cn(rejectedTodayFlows > 0 && "text-destructive")}
        />

        <Card className="col-span-12 flex flex-col xl:col-span-8 [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-muted-foreground text-xs">Throughput</div>
              {initialSummaryLoading ? (
                <Skeleton className="mt-1 h-5 w-36" />
              ) : (
                <div className="mt-0.5 font-mono text-sm tabular-nums">
                  {formatBytes(todayIn + todayOut)}
                  <span className="text-muted-foreground ml-2 text-xs">
                    today · ↓ {formatBytes(todayIn)} · ↑ {formatBytes(todayOut)}
                  </span>
                </div>
              )}
            </div>
            <SegmentedControl
              value={throughputMode}
              options={[
                { value: "total", label: "Total" },
                { value: "devices", label: "Devices" },
                { value: "policies", label: "Policies" },
              ]}
              onChange={setThroughputMode}
            />
          </div>

          {throughputMode === "total" ? (
            <>
              {zoom && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => setZoom(null)}
                  >
                    <Badge>Zoomed · Reset</Badge>
                  </button>
                </div>
              )}
              {(zoom ? zoomTimeseriesLoading : timeseriesLoading) &&
              throughputPoints.length === 0 ? (
                <Skeleton className="min-h-52 w-full flex-1" />
              ) : throughputPoints.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <Empty message="No throughput history yet" />
                </div>
              ) : (
                <MirroredAreaChart
                  fill
                  points={throughputPoints}
                  onZoom={(from, to) => setZoom({ from, to })}
                />
              )}
            </>
          ) : multiSeriesLoading && multiSeries.length === 0 ? (
            <Skeleton className="min-h-52 w-full flex-1" />
          ) : multiSeries.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Empty
                message={
                  throughputMode === "devices"
                    ? "No device traffic yet"
                    : "No policy traffic yet"
                }
              />
            </div>
          ) : (
            <>
              <StackedAreaChart
                fill
                series={multiSeries}
                colorFor={
                  throughputMode === "policies" ? (key) => policyColor(key) : undefined
                }
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {multiSeries.map((entry, seriesIndex) => (
                  <Link
                    key={entry.key}
                    href={
                      throughputMode === "devices"
                        ? `/devices?device=${encodeURIComponent(entry.key)}`
                        : `/flows?policy=${encodeURIComponent(entry.key)}`
                    }
                    className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-1.5 text-xs"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          entry.key === "other"
                            ? "var(--color-chart-7)"
                            : throughputMode === "policies"
                              ? policyColor(entry.key)
                              : (CHART_SLOTS[seriesIndex % CHART_SLOTS.length] ??
                                "var(--color-chart-1)"),
                      }}
                    />
                    <span className="max-w-36 truncate">{entry.label}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>

        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <Card title="Policies">
            {overviewLoading && !overview ? (
              <Skeleton className="h-44 w-full" />
            ) : policySplit.length === 0 ? (
              <Empty message="No policy traffic yet" />
            ) : (
              <>
                <div className="flex justify-center">
                  <DonutChart
                    slices={policySplit.map((entry) => ({
                      key: entry.policy,
                      label: entry.policy,
                      value: entry.bytes,
                      color: policyColor(entry.policy),
                    }))}
                    centerLabel={formatBytes(todayIn + todayOut)}
                    centerSub="today"
                  />
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {policySplit.map((entry) => (
                    <Link
                      key={entry.policy}
                      href={`/flows?policy=${encodeURIComponent(entry.policy)}`}
                      className="hover:bg-muted -mx-1.5 flex items-center gap-2 rounded-sm px-1.5 py-0.5"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: policyColor(entry.policy) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{entry.policy}</span>
                      <span className="text-muted-foreground shrink-0 text-right font-mono text-[11px] tabular-nums">
                        {formatBytes(entry.bytes)} ·{" "}
                        {((entry.bytes / Math.max(1, totalPolicyBytes)) * 100).toFixed(1)}%
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title="Devices">
            {overviewLoading && !overview ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    {activeDevices.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    active of {totalDevices.toLocaleString()}
                  </span>
                </div>
                {topDevices.length === 0 ? (
                  <Empty message="No devices yet" />
                ) : (
                  <BarsList
                    rows={topDevices}
                    format={formatRate}
                    onSelect={(key) => router.push(`/devices?device=${encodeURIComponent(key)}`)}
                  />
                )}
              </>
            )}
          </Card>
        </div>

        <Card title="Top destinations" className="col-span-12 xl:col-span-4">
          {destinationLoading && !destinationBreakdown ? (
            <Skeleton className="h-52 w-full" />
          ) : destinationRows.length === 0 ? (
            <Empty message="No destinations yet" />
          ) : (
            <BarsList
              rows={destinationRows}
              onSelect={(key) =>
                router.push(`/destinations?tab=domains&host=${encodeURIComponent(key)}`)
              }
            />
          )}
        </Card>

        <Card title="Top processes" className="col-span-12 xl:col-span-4">
          {processLoading && !processBreakdown ? (
            <Skeleton className="h-52 w-full" />
          ) : processRows.length === 0 ? (
            <Empty message="No processes yet" />
          ) : (
            <BarsList
              rows={processRows}
              onSelect={(key) => router.push(`/flows?process=${encodeURIComponent(key)}`)}
            />
          )}
        </Card>

        <Card title="DNS" className="col-span-12 xl:col-span-4">
          {dnsLoading && !dns ? (
            <Skeleton className="h-52 w-full" />
          ) : dnsSeries.length === 0 && (dns?.topDomains.length ?? 0) === 0 ? (
            <Empty message="No DNS lookups yet" />
          ) : (
            <>
              <div className="font-mono text-2xl font-semibold tabular-nums">
                {dnsTotal.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-xs">
                queries
                {dns !== undefined && dns.answered + dns.unanswered > 0 && (
                  <span>
                    {" "}
                    · {Math.round((dns.answered / (dns.answered + dns.unanswered)) * 100)}%
                    answered
                  </span>
                )}
              </div>
              <Sparkline className="mt-3" points={dnsSeries.map((point) => point.count)} />
              <div className="mt-3 flex flex-col gap-1.5">
                {(dns?.topDomains ?? []).slice(0, 5).map((domain) => (
                  <div key={domain.qname} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-[12px]">{domain.qname}</span>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                      {domain.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/logs"
                className="text-muted-foreground hover:text-foreground mt-4 inline-flex text-xs"
              >
                All lookups →
              </Link>
            </>
          )}
        </Card>

        <Card title="Recent events" className="col-span-12 xl:col-span-6">
          {overviewLoading && !overview && recentEvents.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : recentEvents.length === 0 ? (
            <Empty message="Nothing has happened yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3">
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {formatTime(event.ts)}
                  </span>
                  <StatusDot tone={eventTone(event.kind)} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{event.message}</span>
                  <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {formatTimeAgo(event.ts)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Rejected & failed" className="col-span-12 xl:col-span-6">
          {rejectedLoading && !rejected ? (
            <Skeleton className="h-40 w-full" />
          ) : rejectedBars.length === 0 && (rejected?.topHosts.length ?? 0) === 0 ? (
            <Empty message="No rejected or failed flows" />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
                {rejectedBars.length === 0 ? (
                  <Empty message="No timeline data" />
                ) : (
                  <MiniBars data={rejectedBars} color="var(--color-chart-6)" height={120} />
                )}
                <div className="flex flex-col gap-2">
                  {(rejected?.topHosts ?? []).slice(0, 3).map((host) => (
                    <div key={host.key} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-[12px]">
                        {host.label ?? host.key}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                        {host.flows.toLocaleString()} flows
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                href="/insights"
                className="text-muted-foreground hover:text-foreground mt-4 inline-flex text-xs"
              >
                Insights →
              </Link>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
