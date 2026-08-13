import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function Punchcard({
  cells,
  max,
  className,
}: {
  cells: number[][];
  max: number;
  className?: string;
}) {
  if (cells.length === 0) return null;

  return (
    <div
      className={cn("grid items-center gap-[3px]", className)}
      style={{ gridTemplateColumns: "auto repeat(24, minmax(0, 1fr))" }}
    >
      <span />
      {HOURS.map((hour) => (
        <span
          key={hour}
          className="text-muted-foreground h-3 text-center font-mono text-[9px] tabular-nums"
        >
          {hour % 6 === 0 ? hour : ""}
        </span>
      ))}
      {DAYS.map((day, dayIndex) => (
        <div key={day} className="contents">
          <span className="text-muted-foreground pr-1 text-[10px]">{day}</span>
          {HOURS.map((hour) => {
            const value = Math.max(0, cells[dayIndex]?.[hour] ?? 0);
            const share = max > 0 ? Math.min(1, value / max) : 0;
            const percentage = Math.round(12 + Math.sqrt(share) * 68);
            return (
              <span
                key={hour}
                className="aspect-square rounded-[3px]"
                style={{
                  background:
                    value === 0
                      ? "var(--color-muted)"
                      : `color-mix(in oklab, var(--color-primary) ${percentage}%, var(--color-muted))`,
                }}
                title={`${day} ${hour.toString().padStart(2, "0")}:00 · ${formatBytes(value)}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
