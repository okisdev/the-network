"use client";

import { ArrowDown, ArrowUp, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { StatusDot } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { formatRate } from "@/lib/format";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-md transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
    >
      {mounted ? (
        resolvedTheme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}

export function Topbar() {
  const { connected, summary } = useLive();

  return (
    <header className="border-border bg-background/90 sticky top-0 z-20 flex h-12 items-center justify-end gap-3 border-b px-6 backdrop-blur">
      {summary && (
        <div className="text-muted-foreground flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="flex items-center gap-1">
            <ArrowDown className="text-chart-1 size-3 shrink-0" />
            {formatRate(summary.wan.rateIn)}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp className="text-chart-3 size-3 shrink-0" />
            {formatRate(summary.wan.rateOut)}
          </span>
        </div>
      )}
      <div className="ring-border bg-muted text-muted-foreground flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs ring-1">
        <StatusDot tone={connected ? "ok" : "destructive"} />
        {connected ? "Live" : "Reconnecting"}
      </div>
      <TimeRangePicker />
      <ThemeToggle />
    </header>
  );
}
