import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card ring-border rounded-lg ring-1", className)}>
      {(title || action) && (
        <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          {title && <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
