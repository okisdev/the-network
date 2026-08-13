"use client";

import type { MultiSeriesDto } from "@the-network/schema";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_SLOTS } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { formatAxisTick, formatPointLabel, formatRate } from "@/lib/format";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

export function StackedAreaChart({
  series,
  height = 208,
  fill = false,
  colorFor,
}: {
  series: MultiSeriesDto[];
  height?: number;
  fill?: boolean;
  colorFor?: (key: string, index: number) => string;
}) {
  const mounted = useMounted();
  const activeSeries = useMemo(() => series.filter((entry) => entry.points.length > 0), [series]);
  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    activeSeries.forEach((entry, seriesIndex) => {
      for (const point of entry.points) {
        const row = rows.get(point.ts) ?? { ts: point.ts };
        row[`series-${seriesIndex}`] = point.in + point.out;
        rows.set(point.ts, row);
      }
    });
    for (const row of rows.values()) {
      activeSeries.forEach((_, seriesIndex) => {
        row[`series-${seriesIndex}`] ??= 0;
      });
    }
    return [...rows.values()].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  }, [activeSeries]);
  const spanMs = data.length > 1 ? Number(data[data.length - 1]?.ts ?? 0) - Number(data[0]?.ts ?? 0) : 0;

  if (data.length === 0) return null;
  if (!mounted) {
    return (
      <div className={cn(fill && "min-h-52 flex-1")} style={fill ? undefined : { height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div
      className={cn("w-full", fill && "relative min-h-52 flex-1")}
      style={fill ? undefined : { height }}
    >
      <div className={fill ? "absolute inset-0" : "h-full w-full"}>
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="ts"
            minTickGap={48}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatAxisTick(Number(value), spanMs)}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatRate(Number(value))}
            tickLine={false}
            width={72}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [formatRate(Number(value)), name]}
            itemSorter={(item) => -Number(item.value ?? 0)}
            labelFormatter={(value) => formatPointLabel(Number(value), spanMs)}
          />
          {activeSeries.map((entry, index) => {
            const color =
              entry.key === "other"
                ? "var(--color-chart-7)"
                : (colorFor?.(entry.key, index) ??
                  CHART_SLOTS[index % CHART_SLOTS.length] ??
                  "var(--color-chart-1)");
            return (
              <Area
                key={entry.key}
                dataKey={`series-${index}`}
                fill={color}
                fillOpacity={0.2}
                isAnimationActive={false}
                name={entry.label}
                stackId="traffic"
                stroke={color}
                strokeWidth={1.4}
                type="monotone"
              />
            );
          })}
        </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
