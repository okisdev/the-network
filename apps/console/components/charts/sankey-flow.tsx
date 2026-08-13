"use client";

import type { SankeyDto } from "@the-network/schema";
import type { SankeyLinkProps, SankeyNodeProps } from "recharts";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { chartTooltipProps } from "./tooltip-style";
import { useMounted } from "./use-mounted";

interface SankeyNodeDatum {
  id: string;
  label: string;
  kind: "device" | "policy" | "country";
  name: string;
}

type RenderedSankeyNode = SankeyNodeProps["payload"] & SankeyNodeDatum;
type RenderedSankeyLink = SankeyLinkProps["payload"] & {
  source: RenderedSankeyNode;
  target: RenderedSankeyNode;
};

function nodeColor(kind: SankeyNodeDatum["kind"]): string {
  if (kind === "device") return "var(--color-chart-2)";
  if (kind === "country") return "var(--color-chart-5)";
  return "var(--color-chart-1)";
}

function SankeyNodeShape({ x, y, width, height, payload }: SankeyNodeProps) {
  const node = payload as RenderedSankeyNode;
  const label = node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label;
  const placeLeft = node.kind === "country";
  return (
    <g>
      <rect
        fill={nodeColor(node.kind)}
        fillOpacity={0.85}
        height={height}
        rx={2}
        width={width}
        x={x}
        y={y}
      />
      <text
        dominantBaseline="middle"
        fill="var(--color-foreground)"
        fontSize={11}
        textAnchor={placeLeft ? "end" : "start"}
        x={placeLeft ? x - 6 : x + width + 6}
        y={y + height / 2}
      >
        {label}
      </text>
    </g>
  );
}

function SankeyLinkShape({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
  linkWidth,
  interactive,
}: SankeyLinkProps & { interactive: boolean }) {
  return (
    <path
      className={interactive ? "cursor-pointer hover:stroke-opacity-50" : "hover:stroke-opacity-50"}
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke="var(--color-chart-1)"
      strokeOpacity={0.18}
      strokeWidth={linkWidth}
    />
  );
}

export function SankeyFlow({
  data,
  height = 340,
  onLink,
}: {
  data: SankeyDto;
  height?: number;
  onLink?: (source: string, target: string) => void;
}) {
  const mounted = useMounted();
  if (data.nodes.length === 0 || data.links.length === 0) return null;
  if (!mounted) {
    return (
      <div style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const chartData = {
    nodes: data.nodes.map((node) => ({ ...node, name: node.label })),
    links: data.links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.bytes,
    })),
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={chartData}
          link={(props) => <SankeyLinkShape {...props} interactive={onLink !== undefined} />}
          margin={{ top: 6, right: 112, bottom: 6, left: 112 }}
          node={SankeyNodeShape}
          nodePadding={14}
          nodeWidth={8}
          onClick={(item, type) => {
            if (type !== "link" || !onLink) return;
            const link = (item as SankeyLinkProps).payload as RenderedSankeyLink;
            onLink(link.source.id, link.target.id);
          }}
        >
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, _name, item) => {
              const link = item.payload as Partial<RenderedSankeyLink>;
              if (!link.source || !link.target) return null;
              return [
                `${link.source.label} → ${link.target.label} · ${formatBytes(Number(value))}`,
                null,
              ];
            }}
            labelFormatter={() => ""}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
