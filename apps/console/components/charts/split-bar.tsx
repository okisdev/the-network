import { cn } from "@/lib/utils";

export function SplitBar({
  inValue,
  outValue,
  max,
  className,
}: {
  inValue: number;
  outValue: number;
  max: number;
  className?: string;
}) {
  const inWidth = max > 0 ? Math.max(0, (inValue / max) * 100) : 0;
  const outWidth = max > 0 ? Math.max(0, (outValue / max) * 100) : 0;

  return (
    <div className={cn("bg-muted flex h-1 overflow-hidden rounded-full", className)}>
      {inValue > 0 && (
        <span
          className="h-full shrink-0 bg-[var(--color-chart-1)]"
          style={{ minWidth: 2, width: `${inWidth}%` }}
        />
      )}
      {outValue > 0 && (
        <span
          className="h-full shrink-0 bg-[var(--color-chart-3)]"
          style={{ minWidth: 2, width: `${outWidth}%` }}
        />
      )}
    </div>
  );
}
