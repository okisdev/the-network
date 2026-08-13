"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { BreakdownRow, MoverRow } from "@the-network/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DailyBars } from "@/components/charts/daily-bars";
import { MiniBars } from "@/components/charts/mini-bars";
import { MirroredAreaChart } from "@/components/charts/mirrored-area";
import { Punchcard } from "@/components/charts/punchcard";
import { Sparkline } from "@/components/charts/sparkline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
import { PageHeader } from "@/components/ui/page-header";
import { RowList } from "@/components/ui/row-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api, type RangeQuery } from "@/lib/api";
import { policyColor } from "@/lib/chart-colors";
import { downsampleCounts } from "@/lib/downsample";
import { formatBytes, formatTimeAgo } from "@/lib/format";

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
    <Card title={title} className="col-span-12 lg:col-span-6 xl:self-start">
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : activeRows.length === 0 ? (
        <Empty message="Both windows are quiet" />
      ) : (
        <RowList
          items={activeRows.slice(0, 8).map((row) => {
            const rising = row.current >= row.previous;
            const ratio = row.previous === 0 ? Infinity : row.current / row.previous;
            const change =
              row.previous === 0
                ? "new"
                : ratio >= 10
                  ? `×${Math.round(ratio)} vs previous`
                  : `${Math.round(Math.abs(((row.current - row.previous) / row.previous) * 100))}% vs previous`;
            return {
              key: row.key,
              label: row.label,
              value: row.current,
              valueSub: (
                <span className="flex items-center justify-end gap-1">
                  {rising ? (
                    <ArrowUp className="size-3 shrink-0" />
                  ) : (
                    <ArrowDown className="size-3 shrink-0" />
                  )}
                  {change}
                </span>
              ),
              href:
                kind === "device"
                  ? `/devices?device=${encodeURIComponent(row.key)}`
                  : `/destinations?tab=domains&host=${encodeURIComponent(row.key)}`,
            };
          })}
          mono={kind === "domain"}
        />
      )}
    </Card>
  );
}

function PolicyInspector({
  policy,
  rangeQuery,
  onClose,
}: {
  policy: string | null;
  rangeQuery: RangeQuery;
  onClose: () => void;
}) {
  const router = useRouter();
  const { minutes } = rangeQuery;
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["timeseries", "policy", policy, minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.timeseries({ scope: `policy:${policy!}`, ...rangeQuery }),
    enabled: Boolean(policy),
    refetchInterval: 30000,
  });
  const { data: destinations, isLoading: destinationsLoading } = useQuery({
    queryKey: [
      "breakdown",
      "domain",
      "policy",
      policy,
      minutes,
      rangeQuery.from,
      rangeQuery.to,
      8,
    ],
    queryFn: () => api.breakdown({ dim: "domain", policy: policy!, limit: 8, ...rangeQuery }),
    enabled: Boolean(policy),
    refetchInterval: 30000,
  });
  const { data: processes, isLoading: processesLoading } = useQuery({
    queryKey: [
      "breakdown",
      "process",
      "policy",
      policy,
      minutes,
      rangeQuery.from,
      rangeQuery.to,
      6,
    ],
    queryFn: () => api.breakdown({ dim: "process", policy: policy!, limit: 6, ...rangeQuery }),
    enabled: Boolean(policy),
    refetchInterval: 30000,
  });
  const destinationRows = destinations?.rows ?? [];
  const processRows = processes?.rows ?? [];

  return (
    <InspectorPanel
      open={Boolean(policy)}
      onClose={onClose}
      title={
        policy ? (
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: policyColor(policy) }}
            />
            <span className="truncate">{policy}</span>
          </span>
        ) : (
          "Policy"
        )
      }
      sub="policy"
    >
      <InspectorSection title="Usage">
        {usageLoading && !usage ? (
          <Skeleton className="h-[140px] w-full" />
        ) : (usage ?? []).length === 0 ? (
          <Empty message="No usage history yet" />
        ) : (
          <MirroredAreaChart points={usage ?? []} height={140} />
        )}
      </InspectorSection>
      <InspectorSection title="Top destinations">
        {destinationsLoading && !destinations ? (
          <Skeleton className="h-44 w-full" />
        ) : destinationRows.length === 0 ? (
          <Empty message="No destinations yet" />
        ) : (
          <RowList
            bars
            mono
            items={destinationRows.map((row) => ({
              key: row.key,
              label: row.key,
              value: row.bytesIn + row.bytesOut,
              sub: `${row.flows} flows`,
            }))}
            onSelect={(key) =>
              router.push(`/destinations?tab=domains&host=${encodeURIComponent(key)}`)
            }
          />
        )}
      </InspectorSection>
      <InspectorSection title="Top processes">
        {processesLoading && !processes ? (
          <Skeleton className="h-36 w-full" />
        ) : processRows.length === 0 ? (
          <Empty message="No processes yet" />
        ) : (
          <RowList
            bars
            items={processRows.map((row) => ({
              key: row.key,
              label: row.label ?? row.key,
              value: row.bytesIn + row.bytesOut,
              sub: `${row.flows} flows`,
            }))}
            onSelect={(key) =>
              router.push(
                `/flows?process=${encodeURIComponent(key)}&policy=${encodeURIComponent(policy!)}`,
              )
            }
          />
        )}
      </InspectorSection>
      <InspectorSection title="Filter by">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/flows?policy=${encodeURIComponent(policy!)}`)}
        >
          Flows
        </Button>
      </InspectorSection>
    </InspectorPanel>
  );
}

export function InsightsScreen() {
  const router = useRouter();
  const { minutes, rangeQuery } = useTimeRange();
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
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

  const rejectedBars = downsampleCounts(rejected?.series ?? []);
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
        <Card title="Rhythm" className="col-span-12 xl:col-span-7 xl:self-start">
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

        <Card fill title="Daily volume" className="col-span-12 xl:col-span-5">
          {dailyLoading && !daily ? (
            <Skeleton className="min-h-52 w-full flex-1" />
          ) : (daily ?? []).length === 0 ? (
            <div className="flex min-h-52 flex-1 items-center justify-center">
              <Empty message="No daily volume yet" />
            </div>
          ) : (
            <DailyBars fill points={daily ?? []} />
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
                <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">Timeline</h3>
                <div className="flex min-h-24 min-w-0 flex-col">
                  {rejectedBars.length === 0 ? (
                    <Empty message="No timeline data" />
                  ) : (
                    <MiniBars fill data={rejectedBars} color="var(--color-chart-6)" />
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">Hosts</h3>
                {hostRows.length === 0 ? (
                  <Empty message="No hosts" />
                ) : (
                  <RowList
                    bars
                    mono
                    items={hostRows}
                    format={(value) => value.toLocaleString()}
                    onSelect={(key) => router.push(`/flows?search=${encodeURIComponent(key)}`)}
                  />
                )}
              </div>
              <div>
                <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">Devices</h3>
                {deviceRows.length === 0 ? (
                  <Empty message="No devices" />
                ) : (
                  <RowList
                    bars
                    items={deviceRows}
                    format={(value) => value.toLocaleString()}
                    onSelect={(key) => router.push(`/flows?device=${encodeURIComponent(key)}`)}
                  />
                )}
              </div>
              <div>
                <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">Rules</h3>
                {ruleRows.length === 0 ? (
                  <Empty message="No rules" />
                ) : (
                  <RowList
                    bars
                    mono
                    items={ruleRows}
                    format={(value) => value.toLocaleString()}
                  />
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="New devices" className="col-span-12 lg:col-span-6 xl:self-start">
          {firstSeenLoading && !firstSeen ? (
            <Skeleton className="h-48 w-full" />
          ) : (firstSeen?.devices.length ?? 0) === 0 ? (
            <Empty message="No new devices this week" />
          ) : (
            <div className="flex flex-col">
              {(firstSeen?.devices ?? []).slice(0, 12).map((device) => (
                <Link
                  key={device.deviceId}
                  href={`/devices?device=${encodeURIComponent(device.deviceId)}`}
                  className="hover:bg-muted -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-sm">{device.name}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-2xs tabular-nums">
                    {formatTimeAgo(device.firstSeenAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="New domains" className="col-span-12 lg:col-span-6 xl:self-start">
          {firstSeenLoading && !firstSeen ? (
            <Skeleton className="h-48 w-full" />
          ) : (firstSeen?.domains.length ?? 0) === 0 ? (
            <Empty message="No new domains this week" />
          ) : (
            <RowList
              mono
              items={(firstSeen?.domains ?? []).slice(0, 12).map((domain) => ({
                key: domain.domain,
                label: domain.domain,
                sub: `${domain.devices.toLocaleString()} devices`,
                value: domain.bytes,
                valueSub: formatTimeAgo(domain.firstTs),
                href: `/destinations?tab=domains&host=${encodeURIComponent(domain.domain)}`,
              }))}
            />
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
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setSelectedPolicy(entry.key)}
                    className="ring-border hover:bg-muted hover:ring-primary focus-visible:ring-primary w-full cursor-pointer rounded-md p-3 text-left ring-1 transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="truncate">{entry.label}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-2xs tabular-nums">
                        {formatBytes(total)}
                      </span>
                    </div>
                    <Sparkline className="mt-3" points={points} stroke={color} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
      <PolicyInspector
        policy={selectedPolicy}
        rangeQuery={rangeQuery}
        onClose={() => setSelectedPolicy(null)}
      />
    </>
  );
}
