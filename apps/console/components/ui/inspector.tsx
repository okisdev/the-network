"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InspectorPanel({
  open,
  onClose,
  title,
  sub,
  actions,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close inspector"
        className="fixed inset-0 z-30 bg-background/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "border-border bg-card fixed inset-y-0 right-0 z-40 flex w-[min(30rem,100vw-1.5rem)] flex-col border-l shadow-xl",
          className,
        )}
      >
        <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {sub != null && (
              <div className="text-muted-foreground mt-0.5 truncate text-xs">{sub}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </>
  );
}

export function InspectorSection({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-6 first:mt-0", className)}>
      <header className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
