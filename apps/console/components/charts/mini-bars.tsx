"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

export function MiniBars({
  data,
  height = 120,
  color = "var(--color-chart-2)",
  format,
}: {
  data: Array<{ label: string; count: number }>;
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  const mounted = useMounted();
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
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            axisLine={false}
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
            tickLine={false}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [
              format ? format(Number(value)) : Number(value).toLocaleString(),
              name,
            ]}
          />
          <Bar
            dataKey="count"
            fill={color}
            isAnimationActive={false}
            name="Count"
            radius={3}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
