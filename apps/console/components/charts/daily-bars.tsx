"use client";

import type { DailyPoint } from "@the-network/schema";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

function shortDay(day: string, compact: boolean): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", compact ? { day: "numeric" } : { month: "short", day: "numeric" });
}

export function DailyBars({
  points,
  height = 200,
  fill = false,
}: {
  points: DailyPoint[];
  height?: number;
  fill?: boolean;
}) {
  const mounted = useMounted();
  if (points.length === 0) return null;
  if (!mounted) {
    return (
      <div className={cn(fill && "min-h-40 flex-1")} style={fill ? undefined : { height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  const compact = points.length > 14;

  return (
    <div
      className={cn("w-full", fill && "relative min-h-40 flex-1")}
      style={fill ? undefined : { height }}
    >
      <div className={fill ? "absolute inset-0" : "h-full w-full"}>
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="day"
            minTickGap={24}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => shortDay(String(value), compact)}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatBytes(Number(value))}
            tickLine={false}
            width={64}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [formatBytes(Number(value)), name]}
            labelFormatter={(label, payload) => {
              const point = payload[0]?.payload as DailyPoint | undefined;
              const total = point ? point.in + point.out : 0;
              return `${shortDay(String(label), false)} · Total ${formatBytes(total)}`;
            }}
          />
          <Bar
            dataKey="in"
            fill="var(--color-chart-1)"
            isAnimationActive={false}
            name="Download"
            radius={[0, 0, 0, 0]}
            stackId="daily"
          />
          <Bar
            dataKey="out"
            fill="var(--color-chart-3)"
            isAnimationActive={false}
            name="Upload"
            radius={[3, 3, 0, 0]}
            stackId="daily"
          />
        </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
