"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { BreakdownRow, MoverRow } from "@the-network/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarsList } from "@/components/charts/bars-list";
import { DailyBars } from "@/components/charts/daily-bars";
import { MiniBars } from "@/components/charts/mini-bars";
import { Punchcard } from "@/components/charts/punchcard";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api } from "@/lib/api";
import { policyColor } from "@/lib/chart-colors";
import { formatBytes, formatTime, formatTimeAgo } from "@/lib/format";

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

function rejectedRows(rows: BreakdownRow[]) {
  return rows.map((row) => ({
    key: row.key,
    label: row.label ?? row.key,
    value: row.flows,
    sub: formatBytes(row.bytesIn + row.bytesOut),
  }));
}

function MoverCard({
  title,
  rows,
  loading,
  kind,
}: {
  title: string;
  rows: MoverRow[];
  loading: boolean;
  kind: "device" | "domain";
}) {
  const activeRows = rows.filter((row) => row.current > 0 || row.previous > 0);
  return (
    <Card title={title} className="col-span-12 lg:col-span-6">
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : activeRows.length === 0 ? (
        <Empty message="Both windows are quiet" />
      ) : (
        <div className="flex flex-col gap-1">
          {activeRows.slice(0, 8).map((row) => {
            const rising = row.current >= row.previous;
            const ratio = row.previous === 0 ? Infinity : row.current / row.previous;
            const change =
              row.previous === 0
                ? "new"
                : ratio >= 10
                  ? `×${Math.round(ratio)} vs previous`
                  : `${Math.round(Math.abs(((row.current - row.previous) / row.previous) * 100))}% vs previous`;
            return (
              <Link
                key={row.key}
                href={
                  kind === "device"
                    ? `/devices?device=${encodeURIComponent(row.key)}`
                    : `/destinations?tab=domains&host=${encodeURIComponent(row.key)}`
                }
                className="hover:bg-muted -mx-1.5 flex items-center justify-between gap-4 rounded-sm px-1.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[13px]">{row.label}</span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xs tabular-nums">
                    {formatBytes(row.current)}
                  </span>
                  <span className="text-muted-foreground flex items-center justify-end gap-1 font-mono text-xs tabular-nums">
                    {rising ? (
                      <ArrowUp className="size-3 shrink-0" />
                    ) : (
                      <ArrowDown className="size-3 shrink-0" />
                    )}
                    {change}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function InsightsScreen() {
  const router = useRouter();
  const { minutes, rangeQuery } = useTimeRange();
  const { data: punchcard, isLoading: punchcardLoading } = useQuery({
    queryKey: ["insights", "punchcard", 28],
    queryFn: () => api.punchcard(28),
    refetchInterval: 30000,
  });
  const { data: daily, isLoading: dailyLoading } = useQuery({
    queryKey: ["insights", "daily", 30],
    queryFn: () => api.daily(30),
    refetchInterval: 30000,
  });
  const { data: movers, isLoading: moversLoading } = useQuery({
    queryKey: ["insights", "movers", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.movers(rangeQuery),
    refetchInterval: 30000,
  });
  const { data: rejected, isLoading: rejectedLoading } = useQuery({
    queryKey: ["rejected", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.rejected(rangeQuery),
    refetchInterval: 30000,
  });
  const { data: firstSeen, isLoading: firstSeenLoading } = useQuery({
    queryKey: ["insights", "first-seen", 7],
    queryFn: () => api.firstSeen(7),
    refetchInterval: 30000,
  });
  const { data: policySeries, isLoading: policySeriesLoading } = useQuery({
    queryKey: [
      "timeseries-multi",
      "policy",
      minutes,
      rangeQuery.from,
      rangeQuery.to,
      6,
    ],
    queryFn: () => api.timeseriesMulti({ scope: "policy", limit: 6, ...rangeQuery }),
    refetchInterval: 20000,
  });

  const rejectedBars = downsampleRejected(rejected?.series ?? []);
  const hostRows = rejectedRows(rejected?.topHosts ?? []);
  const deviceRows = rejectedRows(rejected?.topDevices ?? []);
  const ruleRows = rejectedRows(rejected?.topRules ?? []);
  const rejectedEmpty =
    rejectedBars.length === 0 &&
    hostRows.length === 0 &&
    deviceRows.length === 0 &&
    ruleRows.length === 0;
  const activePolicySeries = (policySeries ?? []).filter((entry) => entry.points.length > 0);

  return (
    <>
      <PageHeader title="Insights" sub="Patterns, movers and anomalies" />
      <div className="grid grid-cols-12 gap-4">
        <Card title="Rhythm" className="col-span-12 xl:col-span-7">
          {punchcardLoading && !punchcard ? (
            <Skeleton className="h-52 w-full" />
          ) : !punchcard || punchcard.cells.length === 0 ? (
            <Empty message="No rhythm data yet" />
          ) : (
            <>
              <div className="overflow-x-auto pb-1">
                <Punchcard className="min-w-[620px]" cells={punchcard.cells} max={punchcard.max} />
              </div>
              <div className="text-muted-foreground mt-4 text-xs">Last 4 weeks · local time</div>
            </>
          )}
        </Card>

        <Card title="Daily volume" className="col-span-12 xl:col-span-5">
          {dailyLoading && !daily ? (
            <Skeleton className="h-52 w-full" />
          ) : (daily ?? []).length === 0 ? (
            <Empty message="No daily volume yet" />
          ) : (
            <DailyBars points={daily ?? []} />
          )}
        </Card>

        <MoverCard
          title="Device movers"
          rows={movers?.devices ?? []}
          loading={moversLoading && !movers}
          kind="device"
        />
        <MoverCard
          title="Domain movers"
          rows={movers?.domains ?? []}
          loading={moversLoading && !movers}
          kind="domain"
        />

        <Card title="Rejected & failed" className="col-span-12">
          {rejectedLoading && !rejected ? (
            <Skeleton className="h-52 w-full" />
          ) : rejectedEmpty ? (
            <Empty message="No rejected or failed flows" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-medium">Timeline</h3>
                {rejectedBars.length === 0 ? (
                  <Empty message="No timeline data" />
                ) : (
                  <MiniBars
                    data={rejectedBars}
                    color="var(--color-chart-6)"
                    height={144}
                  />
                )}
              </div>
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-medium">Hosts</h3>
                {hostRows.length === 0 ? (
                  <Empty message="No hosts" />
                ) : (
                  <BarsList
                    rows={hostRows}
                    format={(value) => value.toLocaleString()}
                    onSelect={(key) => router.push(`/flows?search=${encodeURIComponent(key)}`)}
                  />
                )}
              </div>
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-medium">Devices</h3>
                {deviceRows.length === 0 ? (
                  <Empty message="No devices" />
                ) : (
                  <BarsList
                    rows={deviceRows}
                    format={(value) => value.toLocaleString()}
                    onSelect={(key) => router.push(`/flows?device=${encodeURIComponent(key)}`)}
                  />
                )}
              </div>
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-medium">Rules</h3>
                {ruleRows.length === 0 ? (
                  <Empty message="No rules" />
                ) : (
                  <BarsList rows={ruleRows} format={(value) => value.toLocaleString()} />
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="New devices" className="col-span-12 lg:col-span-6">
          {firstSeenLoading && !firstSeen ? (
            <Skeleton className="h-48 w-full" />
          ) : (firstSeen?.devices.length ?? 0) === 0 ? (
            <Empty message="No new devices this week" />
          ) : (
            <div className="flex flex-col gap-1">
              {(firstSeen?.devices ?? []).map((device) => (
                <Link
                  key={device.deviceId}
                  href={`/devices?device=${encodeURIComponent(device.deviceId)}`}
                  className="hover:bg-muted -mx-1.5 flex items-center justify-between gap-4 rounded-sm px-1.5 py-1.5"
                >
                  <span className="min-w-0 truncate text-[13px]">{device.name}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                    {formatTimeAgo(device.firstSeenAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="New domains" className="col-span-12 lg:col-span-6">
          {firstSeenLoading && !firstSeen ? (
            <Skeleton className="h-48 w-full" />
          ) : (firstSeen?.domains.length ?? 0) === 0 ? (
            <Empty message="No new domains this week" />
          ) : (
            <div className="flex flex-col gap-1">
              {(firstSeen?.domains ?? []).map((domain) => (
                <Link
                  key={domain.domain}
                  href={`/destinations?tab=domains&host=${encodeURIComponent(domain.domain)}`}
                  className="hover:bg-muted -mx-1.5 flex items-center justify-between gap-4 rounded-sm px-1.5 py-1.5"
                >
                  <span className="min-w-0 truncate font-mono text-[12px]">{domain.domain}</span>
                  <span className="text-muted-foreground shrink-0 text-right font-mono text-[10px] leading-4 tabular-nums">
                    <span className="block">{formatTimeAgo(domain.firstTs)}</span>
                    <span className="block">
                      {formatBytes(domain.bytes)} · {domain.devices.toLocaleString()} devices
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="Policies over time" className="col-span-12">
          {policySeriesLoading && !policySeries ? (
            <Skeleton className="h-48 w-full" />
          ) : activePolicySeries.length === 0 ? (
            <Empty message="No policy history yet" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activePolicySeries.map((entry) => {
                const points = entry.points.map((point) => point.in + point.out);
                const total = points.reduce((sum, point) => sum + point, 0);
                const color = policyColor(entry.key);
                return (
                  <Link
                    key={entry.key}
                    href={`/flows?policy=${encodeURIComponent(entry.key)}`}
                    className="ring-border hover:bg-muted rounded-md p-3 ring-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="truncate">{entry.label}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                        {formatBytes(total)}
                      </span>
                    </div>
                    <Sparkline className="mt-3" points={points} stroke={color} />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
