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
import { colorForKey } from "@/lib/chart-colors";
import { formatRate, formatTime } from "@/lib/format";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

export function StackedAreaChart({
  series,
  height = 208,
}: {
  series: MultiSeriesDto[];
  height?: number;
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

  if (data.length === 0) return null;
  if (!mounted) {
    return (
      <div style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="ts"
            minTickGap={48}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatTime(Number(value)).slice(0, 5)}
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
            labelFormatter={(value) => formatTime(Number(value))}
          />
          {activeSeries.map((entry, index) => {
            const color =
              entry.key === "other" ? "var(--color-chart-7)" : colorForKey(entry.key);
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
  );
}
