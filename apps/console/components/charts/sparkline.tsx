"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function Sparkline({
  points,
  className,
  stroke = "var(--color-chart-1)",
  fill = false,
}: {
  points: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  const gradientId = useId().replaceAll(":", "");
  if (points.length < 2) return null;

  const minimum = Math.min(...points);
  const maximum = Math.max(...points);
  const range = maximum - minimum;
  const line = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = range === 0 ? 14 : 26 - ((point - minimum) / range) * 24;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={cn("h-7 w-full", className)}
      preserveAspectRatio="none"
      viewBox="0 0 100 28"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor={`color-mix(in oklab, ${stroke} 15%, transparent)`}
              />
              <stop
                offset="100%"
                stopColor={`color-mix(in oklab, ${stroke} 0%, transparent)`}
              />
            </linearGradient>
          </defs>
          <path d={`${line} L100,28 L0,28 Z`} fill={`url(#${gradientId})`} stroke="none" />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
