import type { PresenceInterval } from "@the-network/schema";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PresenceRibbon({
  intervals,
  from,
  to,
  className,
}: {
  intervals: PresenceInterval[];
  from: number;
  to: number;
  className?: string;
}) {
  if (intervals.length === 0 || to <= from) return null;
  const duration = to - from;

  return (
    <div
      className={cn("bg-muted relative h-1.5 overflow-hidden rounded-full", className)}
    >
      {intervals.map((interval, index) => {
        const start = Math.max(from, interval.start);
        const end = Math.min(to, interval.end ?? to);
        if (end <= start) return null;
        return (
          <span
            key={`${interval.start}-${interval.end ?? "open"}-${index}`}
            className="bg-ok/70 absolute inset-y-0"
            style={{
              left: `${((start - from) / duration) * 100}%`,
              minWidth: 2,
              width: `${((end - start) / duration) * 100}%`,
            }}
            title={`${formatTime(start)} to ${formatTime(end)}`}
          />
        );
      })}
    </div>
  );
}
