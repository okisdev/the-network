import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "destructive" | "muted" | "primary";

const TONES: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/50",
  primary: "bg-primary",
};

export function StatusDot({ tone = "muted", className }: { tone?: StatusTone; className?: string }) {
  return <span className={cn("inline-block size-1.5 rounded-full", TONES[tone], className)} />;
}
