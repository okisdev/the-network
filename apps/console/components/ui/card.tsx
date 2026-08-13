import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  title,
  action,
  note,
  children,
  className,
  fill = false,
  flush = false,
}: {
  title?: string;
  action?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  fill?: boolean;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "bg-card ring-border rounded-lg ring-1",
        fill && "flex min-h-0 flex-col",
        flush && "overflow-hidden",
        className,
      )}
    >
      {(title || action) && (
        <header className="border-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
          {title && <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn(!flush && "p-4", fill && "flex min-h-0 flex-1 flex-col")}>{children}</div>
      {note && (
        <footer className="border-border text-muted-foreground shrink-0 border-t px-4 py-2.5 text-xs">
          {note}
        </footer>
      )}
    </section>
  );
}
