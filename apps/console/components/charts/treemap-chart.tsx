"use client";

import type { TreemapNode } from "recharts";
import { ResponsiveContainer, Treemap } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { colorForKey } from "@/lib/chart-colors";
import { formatBytes } from "@/lib/format";
import { useMounted } from "./use-mounted";

interface TreemapItem {
  key: string;
  label: string;
  value: number;
}

type RenderedTreemapItem = TreemapNode & TreemapItem;

function TreemapCell({ node, onSelect }: { node: TreemapNode; onSelect?: (key: string) => void }) {
  if (node.depth === 0) return <g />;
  const item = node as RenderedTreemapItem;
  const showLabel = item.width >= 56 && item.height >= 28;
  const maximumCharacters = Math.max(1, Math.floor((item.width - 12) / 6));
  const label =
    item.label.length > maximumCharacters
      ? `${item.label.slice(0, Math.max(1, maximumCharacters - 1))}…`
      : item.label;
  const select = () => onSelect?.(item.key);

  return (
    <g
      className={onSelect ? "cursor-pointer" : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
    >
      <rect
        fill={`color-mix(in oklab, ${colorForKey(item.key)} 26%, var(--color-card))`}
        height={item.height}
        rx={3}
        stroke="var(--color-border)"
        width={item.width}
        x={item.x}
        y={item.y}
      />
      {showLabel && (
        <>
          <text
            fill="var(--color-foreground)"
            fontSize={11}
            x={item.x + 6}
            y={item.y + 12}
          >
            {label}
          </text>
          <text
            className="font-mono tabular-nums"
            fill="var(--color-muted-foreground)"
            fontSize={10}
            x={item.x + 6}
            y={item.y + 24}
          >
            {formatBytes(item.value)}
          </text>
        </>
      )}
    </g>
  );
}

export function TreemapChart({
  items,
  height = 300,
  onSelect,
}: {
  items: TreemapItem[];
  height?: number;
  onSelect?: (key: string) => void;
}) {
  const mounted = useMounted();
  if (items.length === 0) return null;
  if (!mounted) {
    return (
      <div style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const data = items.map((item) => ({ ...item, name: item.label }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          content={(node) => <TreemapCell node={node} onSelect={onSelect} />}
          data={data}
          dataKey="value"
          isAnimationActive={false}
          nameKey="name"
        />
      </ResponsiveContainer>
    </div>
  );
}
