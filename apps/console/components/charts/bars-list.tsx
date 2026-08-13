import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BarsListRow {
  key: string;
  label: string;
  value: number;
  sub?: string;
  color?: string;
}

function BarRow({
  row,
  maximum,
  format,
}: {
  row: BarsListRow;
  maximum: number;
  format: (n: number) => string;
}) {
  const width = maximum > 0 ? (Math.max(0, row.value) / maximum) * 100 : 0;
  return (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[12px]">
          {row.label}
          {row.sub && <span className="text-muted-foreground ml-1.5">{row.sub}</span>}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
          {format(row.value)}
        </span>
      </span>
      <span className="bg-muted mt-1 block h-1 overflow-hidden rounded-full">
        {row.value > 0 && (
          <span
            className="block h-full rounded-full"
            style={{
              background:
                row.color ??
                "color-mix(in oklab, var(--color-primary) 50%, transparent)",
              minWidth: 2,
              width: `${width}%`,
            }}
          />
        )}
      </span>
    </>
  );
}

export function BarsList({
  rows,
  format = formatBytes,
  onSelect,
}: {
  rows: BarsListRow[];
  format?: (n: number) => string;
  onSelect?: (key: string) => void;
}) {
  if (rows.length === 0) return null;
  const maximum = Math.max(0, ...rows.map((row) => row.value));

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) =>
        onSelect ? (
          <button
            key={row.key}
            className="hover:bg-muted -mx-1.5 rounded-sm px-1.5 text-left"
            type="button"
            onClick={() => onSelect(row.key)}
          >
            <BarRow format={format} maximum={maximum} row={row} />
          </button>
        ) : (
          <div key={row.key}>
            <BarRow format={format} maximum={maximum} row={row} />
          </div>
        ),
      )}
    </div>
  );
}
