import Link from "next/link";
import type { ReactNode } from "react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RowListItem {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  value: number;
  valueSub?: ReactNode;
  color?: string;
  icon?: ReactNode;
  href?: string;
  title?: string;
}

function RowBody({
  item,
  share,
  mono,
  format,
}: {
  item: RowListItem;
  share: number | undefined;
  mono: boolean;
  format: (n: number) => string;
}) {
  return (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          {item.icon}
          {item.color !== undefined && share === undefined && (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: item.color }}
            />
          )}
          <span
            className={cn("min-w-0 truncate", mono ? "font-mono text-xs" : "text-sm")}
            title={item.title}
          >
            {item.label}
          </span>
          {item.sub !== undefined && (
            <span className="text-muted-foreground text-2xs shrink-0">{item.sub}</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-xs tabular-nums">{format(item.value)}</span>
          {item.valueSub !== undefined && (
            <span className="text-muted-foreground text-2xs block font-mono tabular-nums">
              {item.valueSub}
            </span>
          )}
        </span>
      </span>
      {share !== undefined && (
        <span className="bg-muted mt-1.5 block h-1 overflow-hidden rounded-full">
          {item.value > 0 && (
            <span
              className="block h-full rounded-full"
              style={{
                background:
                  item.color ?? "color-mix(in oklab, var(--color-primary) 50%, transparent)",
                minWidth: 2,
                width: `${share * 100}%`,
              }}
            />
          )}
        </span>
      )}
    </>
  );
}

export function RowList({
  items,
  format = formatBytes,
  mono = false,
  bars = false,
  onSelect,
  className,
}: {
  items: RowListItem[];
  format?: (n: number) => string;
  mono?: boolean;
  bars?: boolean;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  const maximum = Math.max(0, ...items.map((item) => item.value));

  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const share = bars ? (maximum > 0 ? Math.max(0, item.value) / maximum : 0) : undefined;
        const body = <RowBody format={format} item={item} mono={mono} share={share} />;
        const interactiveClass =
          "hover:bg-muted focus-visible:ring-ring -mx-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none";
        if (item.href !== undefined) {
          return (
            <Link key={item.key} href={item.href} className={interactiveClass}>
              {body}
            </Link>
          );
        }
        if (onSelect !== undefined) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={interactiveClass}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={item.key} className="py-1.5">
            {body}
          </div>
        );
      })}
    </div>
  );
}
