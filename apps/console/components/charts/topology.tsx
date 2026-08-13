import { colorForKey } from "@/lib/chart-colors";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TopologyNode {
  id: string;
  name: string;
  rate: number;
  online: boolean;
}

interface PositionedNode extends TopologyNode {
  x: number;
  y: number;
  share: number;
}

function truncateName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function TopologyGraph({
  center,
  nodes,
  height = 380,
  onSelect,
}: {
  center: { name: string };
  nodes: TopologyNode[];
  height?: number;
  onSelect?: (id: string) => void;
}) {
  if (nodes.length === 0) return null;
  const centerX = 400;
  const centerY = 190;
  const visible = [...nodes].sort((a, b) => b.rate - a.rate).slice(0, 24);
  const hiddenCount = Math.max(0, nodes.length - visible.length);
  const positions = visible.length + (hiddenCount > 0 ? 1 : 0);
  const maxRate = Math.max(0, ...nodes.map((node) => node.rate));
  const positioned: PositionedNode[] = visible.map((node, index) => {
    const angle = -Math.PI / 2 + (index / positions) * Math.PI * 2;
    return {
      ...node,
      rate: Math.max(0, node.rate),
      share: maxRate > 0 ? Math.min(1, Math.max(0, node.rate) / maxRate) : 0,
      x: centerX + Math.cos(angle) * 300,
      y: centerY + Math.sin(angle) * 165,
    };
  });
  const ghostAngle =
    hiddenCount > 0 ? -Math.PI / 2 + (visible.length / positions) * Math.PI * 2 : 0;
  const ghostX = centerX + Math.cos(ghostAngle) * 300;
  const ghostY = centerY + Math.sin(ghostAngle) * 165;

  return (
    <svg
      aria-label={`Network topology for ${center.name}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      style={{ maxHeight: height }}
      viewBox="0 0 800 420"
    >
      {positioned.map((node) => {
        const radius = 8 + node.share * 6;
        const edgeMix = Math.round(20 + node.share * 70);
        const select = () => onSelect?.(node.id);
        return (
          <g
            key={node.id}
            className={cn("group", onSelect && "cursor-pointer")}
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
            <line
              className="opacity-60 group-hover:opacity-100"
              stroke={`color-mix(in oklab, var(--color-chart-1) ${edgeMix}%, var(--color-border))`}
              strokeWidth={1 + node.share * 3}
              x1={centerX}
              x2={node.x}
              y1={centerY}
              y2={node.y}
            />
            <circle
              cx={node.x}
              cy={node.y}
              fill="var(--color-card)"
              r={radius}
              stroke="var(--color-border)"
            />
            <circle
              cx={node.x}
              cy={node.y}
              fill={node.online ? colorForKey(node.id) : "var(--color-muted-foreground)"}
              opacity={node.online ? 1 : 0.4}
              r={3.5}
            />
            <text
              fill="var(--color-foreground)"
              fontSize={10.5}
              textAnchor="middle"
              x={node.x}
              y={node.y + radius + 14}
            >
              {truncateName(node.name)}
            </text>
            <text
              className="font-mono tabular-nums"
              fill="var(--color-muted-foreground)"
              fontSize={9.5}
              textAnchor="middle"
              x={node.x}
              y={node.y + radius + 27}
            >
              {formatRate(node.rate)}
            </text>
          </g>
        );
      })}
      {hiddenCount > 0 && (
        <g opacity={0.65}>
          <line
            stroke="var(--color-border)"
            strokeWidth={1}
            x1={centerX}
            x2={ghostX}
            y1={centerY}
            y2={ghostY}
          />
          <circle
            cx={ghostX}
            cy={ghostY}
            fill="var(--color-muted)"
            r={9}
            stroke="var(--color-border)"
          />
          <text
            fill="var(--color-muted-foreground)"
            fontSize={10.5}
            textAnchor="middle"
            x={ghostX}
            y={ghostY + 25}
          >
            +{hiddenCount} more
          </text>
        </g>
      )}
      <circle cx={centerX} cy={centerY} fill="var(--color-primary)" r={18} />
      <text
        fill="var(--color-foreground)"
        fontSize={11}
        textAnchor="middle"
        x={centerX}
        y={centerY + 34}
      >
        {center.name}
      </text>
      {center.name !== "Gateway" && (
        <text
          fill="var(--color-muted-foreground)"
          fontSize={9.5}
          textAnchor="middle"
          x={centerX}
          y={centerY + 47}
        >
          Gateway
        </text>
      )}
    </svg>
  );
}
