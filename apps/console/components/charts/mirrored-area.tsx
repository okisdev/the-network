"use client";

import type { TimeseriesPoint } from "@the-network/schema";
import { useId, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

interface DragSelection {
  start: number;
  current: number;
}

export function MirroredAreaChart({
  points,
  height = 208,
  className,
  onZoom,
  axes = true,
  fill = false,
}: {
  points: TimeseriesPoint[];
  height?: number;
  className?: string;
  onZoom?: (from: number, to: number) => void;
  axes?: boolean;
  fill?: boolean;
}) {
  const mounted = useMounted();
  const downloadGradient = useId().replaceAll(":", "");
  const uploadGradient = useId().replaceAll(":", "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<DragSelection | null>(null);

  if (points.length === 0) return null;
  if (!mounted) {
    return (
      <div
        className={cn(fill && "min-h-52 flex-1", className)}
        style={fill ? undefined : { height }}
      >
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const data = points.map((point) => ({
    ...point,
    download: Math.abs(point.in),
    upload: -Math.abs(point.out),
  }));
  const firstTs = Math.min(...points.map((point) => point.ts));
  const lastTs = Math.max(...points.map((point) => point.ts));

  function plotMetrics() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const left = 72;
    const right = Math.max(left, rect.width - 4);
    return { rect, left, right };
  }

  function pointerX(clientX: number): number | undefined {
    const metrics = plotMetrics();
    if (!metrics) return undefined;
    return Math.min(metrics.right, Math.max(metrics.left, clientX - metrics.rect.left));
  }

  function timestampForX(x: number): number {
    const metrics = plotMetrics();
    if (!metrics || metrics.right <= metrics.left || lastTs <= firstTs) return firstTs;
    return firstTs + ((x - metrics.left) / (metrics.right - metrics.left)) * (lastTs - firstTs);
  }

  const selectionLeft = selection ? Math.min(selection.start, selection.current) : 0;
  const selectionWidth = selection ? Math.abs(selection.current - selection.start) : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full select-none",
        fill && "min-h-52 flex-1",
        onZoom && "cursor-crosshair",
        className,
      )}
      style={fill ? undefined : { height }}
      onPointerCancel={() => setSelection(null)}
      onPointerDown={(event) => {
        if (!onZoom || event.button !== 0) return;
        const metrics = plotMetrics();
        if (!metrics) return;
        const localX = event.clientX - metrics.rect.left;
        const localY = event.clientY - metrics.rect.top;
        if (
          localX < metrics.left ||
          localX > metrics.right ||
          localY < 4 ||
          localY > metrics.rect.height - 24
        ) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelection({ start: localX, current: localX });
      }}
      onPointerMove={(event) => {
        if (!selection) return;
        const current = pointerX(event.clientX);
        if (current !== undefined) setSelection((value) => (value ? { ...value, current } : null));
      }}
      onPointerUp={(event) => {
        if (!selection) return;
        const current = pointerX(event.clientX) ?? selection.current;
        if (Math.abs(current - selection.start) >= 8) {
          const startTs = timestampForX(selection.start);
          const endTs = timestampForX(current);
          onZoom?.(
            Math.round(Math.min(startTs, endTs)),
            Math.round(Math.max(startTs, endTs)),
          );
        }
        setSelection(null);
      }}
    >
      <div className={fill ? "absolute inset-0" : "h-full w-full"}>
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={axes ? { top: 4, right: 4, bottom: 0, left: 0 } : { top: 2, right: 0, bottom: 2, left: 0 }}
        >
          <defs>
            <linearGradient id={downloadGradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={uploadGradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.02} />
              <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.16} />
            </linearGradient>
          </defs>
          {axes && <CartesianGrid stroke="var(--color-border)" vertical={false} />}
          {axes && (
            <XAxis
              axisLine={false}
              dataKey="ts"
              minTickGap={48}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(value) => formatTime(Number(value)).slice(0, 5)}
              tickLine={false}
            />
          )}
          {axes && (
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(value) => formatRate(Math.abs(Number(value)))}
              tickLine={false}
              width={72}
            />
          )}
          <ReferenceLine stroke="var(--color-border)" y={0} />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [formatRate(Math.abs(Number(value))), name]}
            labelFormatter={(value) => formatTime(Number(value))}
          />
          <Area
            dataKey="download"
            fill={`url(#${downloadGradient})`}
            isAnimationActive={false}
            name="Download"
            stroke="var(--color-chart-1)"
            strokeWidth={1.8}
            type="monotone"
          />
          <Area
            dataKey="upload"
            fill={`url(#${uploadGradient})`}
            isAnimationActive={false}
            name="Upload"
            stroke="var(--color-chart-3)"
            strokeWidth={1.4}
            type="monotone"
          />
        </AreaChart>
        </ResponsiveContainer>
      </div>
      {selection && selectionWidth > 0 && (
        <div
          className="bg-primary/10 border-border pointer-events-none absolute top-1 bottom-6 border-x"
          style={{ left: selectionLeft, width: selectionWidth }}
        />
      )}
    </div>
  );
}
