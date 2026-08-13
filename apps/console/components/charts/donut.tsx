"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { colorForKey } from "@/lib/chart-colors";
import { formatBytes } from "@/lib/format";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export function DonutChart({
  slices,
  size = 168,
  centerLabel,
  centerSub,
  onSelect,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
  onSelect?: (key: string) => void;
}) {
  const mounted = useMounted();
  if (slices.length === 0) return null;
  if (!mounted) {
    return (
      <div style={{ height: size, width: size }}>
        <Skeleton className="h-full w-full rounded-full" />
      </div>
    );
  }

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            cornerRadius={3}
            data={slices}
            dataKey="value"
            innerRadius={size * 0.267}
            isAnimationActive={false}
            nameKey="label"
            outerRadius={size * 0.43}
            paddingAngle={2}
          >
            {slices.map((slice) => (
              <Cell
                key={slice.key}
                className={onSelect ? "cursor-pointer" : undefined}
                fill={slice.color ?? colorForKey(slice.key)}
                onClick={onSelect ? () => onSelect(slice.key) : undefined}
              />
            ))}
          </Pie>
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [formatBytes(Number(value)), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel && (
            <span className="font-mono text-lg font-semibold tabular-nums">{centerLabel}</span>
          )}
          {centerSub && <span className="text-muted-foreground text-xs">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}
