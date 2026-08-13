import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "ok" | "warn" | "destructive" | "muted" | "primary";

const TONES: Record<BadgeTone, string> = {
  ok: "text-ok ring-ok/30 bg-ok/10",
  warn: "text-warn ring-warn/30 bg-warn/10",
  destructive: "text-destructive ring-destructive/30 bg-destructive/10",
  muted: "text-muted-foreground ring-border bg-muted",
  primary: "text-primary ring-primary/30 bg-primary/10",
};

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ring-1",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
