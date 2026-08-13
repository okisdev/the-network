"use client";

import { useQuery } from "@tanstack/react-query";
import type { EventDto, TimeseriesPoint } from "@the-network/schema";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api } from "@/lib/api";
import { formatBytes, formatRate, formatTime, formatTimeAgo } from "@/lib/format";

const POLICY_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function policyColor(policy: string, index: number): string {
  const upper = policy.toUpperCase();
  if (upper === "REJECT") return "var(--color-chart-6)";
  if (upper === "DIRECT") return "var(--color-muted-foreground)";
  return POLICY_COLORS[index % POLICY_COLORS.length] ?? "var(--color-chart-1)";
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

function ThroughputChart({ data, longRange }: { data: TimeseriesPoint[]; longRange: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <Skeleton className="h-52" />;

  return (
    <div className="min-h-52 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="wan-in" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(value) =>
              longRange
                ? new Date(Number(value)).toLocaleDateString("en-GB", {
                    month: "short",
                    day: "numeric",
                  })
                : formatTime(Number(value)).slice(0, 5)
            }
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(value) => formatRate(Number(value))}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 0 0 1px var(--color-border)",
              color: "var(--color-foreground)",
              fontSize: 12,
            }}
            itemStyle={{ color: "var(--color-muted-foreground)" }}
            labelStyle={{ color: "var(--color-muted-foreground)" }}
            labelFormatter={(value) => formatTime(Number(value))}
            formatter={(value, name) => [
              formatRate(Number(value)),
              name === "in" ? "Download" : "Upload",
            ]}
          />
          <Area
            type="monotone"
            dataKey="in"
            stroke="var(--color-chart-1)"
            strokeWidth={1.8}
            fill="url(#wan-in)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="out"
            stroke="var(--color-chart-3)"
            strokeWidth={1.4}
            fill="transparent"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewScreen() {
  const live = useLive();
  const { minutes, range } = useTimeRange();
  const { data: overview, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
    refetchInterval: 10000,
  });
  const { data: timeseriesData } = useQuery({
    queryKey: ["timeseries", "wan", minutes],
    queryFn: () => api.timeseries({ scope: "wan", minutes }),
    refetchInterval: 15000,
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
  const topDevices = useMemo(() => {
    return overviewTopDevices.slice(0, 5).map((device) => {
      const rate = live.deviceRates.get(device.deviceId);
      return {
        ...device,
        rate: (rate?.rateIn ?? device.rateIn) + (rate?.rateOut ?? device.rateOut),
      };
    });
  }, [live.deviceRates, overviewTopDevices]);

  const maxDeviceRate = Math.max(1, ...topDevices.map((device) => device.rate));
  const overviewTopDestinations = Array.isArray(overview?.topDestinations)
    ? overview.topDestinations
    : [];
  const topDestinations = overviewTopDestinations.slice(0, 8);
  const maxDestinationBytes = Math.max(
    1,
    ...topDestinations.map((destination) => destination.bytes),
  );
  const overviewPolicySplit = Array.isArray(overview?.policySplit) ? overview.policySplit : [];
  const policySplit = overviewPolicySplit.slice(0, 6);
  const totalPolicyBytes = policySplit.reduce((total, entry) => total + entry.bytes, 0);
  const timeseries = Array.isArray(timeseriesData) ? timeseriesData : [];
  const summary = live.summary;
  const rateIn = summary?.wan.rateIn ?? overview?.wan.rateIn ?? 0;
  const rateOut = summary?.wan.rateOut ?? overview?.wan.rateOut ?? 0;
  const todayIn = summary?.today.in ?? overview?.today.in ?? 0;
  const todayOut = summary?.today.out ?? overview?.today.out ?? 0;
  const activeDevices = summary?.activeDevices ?? overview?.activeDevices ?? 0;
  const longRange = range === "7d" || range === "30d";

  if (isLoading && !overview) {
    return (
      <>
        <PageHeader title="Overview" sub="How the home network is doing right now" />
        <Card>
          <Empty message="Waiting for data" />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" sub="How the home network is doing right now" />
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 flex flex-col lg:col-span-8 [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div className="text-muted-foreground text-xs">Download</div>
                <div className="mt-0.5 font-mono text-[26px] leading-none font-semibold tabular-nums">
                  {formatRate(rateIn)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Upload</div>
                <div className="text-muted-foreground mt-0.5 font-mono text-[26px] leading-none font-semibold tabular-nums">
                  {formatRate(rateOut)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Today</div>
              <div className="mt-0.5 font-mono text-sm tabular-nums">
                {formatBytes(todayIn + todayOut)}
                <span className="text-muted-foreground ml-2 text-xs">
                  ↓ {formatBytes(todayIn)} · ↑ {formatBytes(todayOut)}
                </span>
              </div>
            </div>
          </div>
          {timeseries.length === 0 ? (
            <Empty message="No throughput history yet" />
          ) : (
            <ThroughputChart data={timeseries} longRange={longRange} />
          )}
        </Card>

        <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
          <Card title="Devices">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums">{activeDevices}</span>
              <span className="text-muted-foreground text-xs">
                active of {overview?.totalDevices ?? 0}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {topDevices.map((device) => (
                <div key={device.deviceId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px]">{device.name}</span>
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {formatRate(device.rate)}
                    </span>
                  </div>
                  <div className="bg-muted mt-1 h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/60 h-full rounded-full"
                      style={{ width: `${Math.max(3, (device.rate / maxDeviceRate) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {topDevices.length === 0 && <Empty message="No devices yet" />}
            </div>
          </Card>

          <Card title="Policy split">
            {policySplit.length === 0 ? (
              <Empty message="No traffic yet" />
            ) : (
              <>
                <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
                  {policySplit.map((entry, index) => (
                    <div
                      key={entry.policy}
                      style={{
                        width: `${(entry.bytes / Math.max(1, totalPolicyBytes)) * 100}%`,
                        background: policyColor(entry.policy, index),
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {policySplit.map((entry, index) => (
                    <div key={entry.policy} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px]">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: policyColor(entry.policy, index) }}
                        />
                        <span className="truncate" title={entry.policy}>
                          {entry.policy}
                        </span>
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                        {formatBytes(entry.bytes)} ·{" "}
                        {((entry.bytes / Math.max(1, totalPolicyBytes)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <Card title="Top destinations" className="col-span-12 lg:col-span-6">
          {topDestinations.length === 0 ? (
            <Empty message="No destinations yet" />
          ) : (
            <div className="flex flex-col gap-2.5">
              {topDestinations.map((destination) => (
                <div key={destination.host}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[12px]">{destination.host}</span>
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {formatBytes(destination.bytes)}
                    </span>
                  </div>
                  <div className="bg-muted mt-1 h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/50 h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (destination.bytes / maxDestinationBytes) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent events" className="col-span-12 lg:col-span-6">
          {recentEvents.length === 0 ? (
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
      </div>
    </>
  );
}
