"use client";

import { ArrowDown, ArrowUp, CalendarRange, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { type FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusDot } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { TIME_RANGES, type TimeRangeKey, useTimeRange } from "@/contexts/timerange-provider";
import { formatRate } from "@/lib/format";

function formatDateTimeLocal(value: number): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

function CustomRangePicker() {
  const { minutes, rangeQuery, isCustom, setCustom, clearCustom } = useTimeRange();
  const [open, setOpen] = useState(false);
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const from = fromValue ? new Date(fromValue).getTime() : Number.NaN;
  const to = toValue ? new Date(toValue).getTime() : Number.NaN;
  const incomplete = !fromValue || !toValue || !Number.isFinite(from) || !Number.isFinite(to);
  const invalid = incomplete || to <= from;
  const error = incomplete ? "Enter a start and end time" : "End must be after start";

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    const activeTo = isCustom && rangeQuery.to ? rangeQuery.to : Math.floor(Date.now() / 60000) * 60000;
    const activeFrom = isCustom && rangeQuery.from ? rangeQuery.from : activeTo - minutes * 60000;
    setFromValue(formatDateTimeLocal(activeFrom));
    setToValue(formatDateTimeLocal(activeTo));
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalid) return;
    setCustom(from, to);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" />}>
        <CalendarRange className="size-3.5" />
        Custom
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80">
        <form onSubmit={apply}>
          <PopoverTitle>Custom range</PopoverTitle>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="custom-range-start" className="text-muted-foreground text-xs font-medium">
                Start
              </label>
              <Input
                id="custom-range-start"
                type="datetime-local"
                step={60}
                value={fromValue}
                onChange={(event) => setFromValue(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={invalid ? "custom-range-error" : undefined}
                className="w-full font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="custom-range-end" className="text-muted-foreground text-xs font-medium">
                End
              </label>
              <Input
                id="custom-range-end"
                type="datetime-local"
                step={60}
                value={toValue}
                onChange={(event) => setToValue(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={invalid ? "custom-range-error" : undefined}
                className="w-full font-mono tabular-nums"
              />
            </div>
            {invalid && (
              <p id="custom-range-error" className="text-destructive text-xs">
                {error}
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={invalid}>
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clearCustom();
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function Topbar() {
  const { connected, summary } = useLive();
  const { range, label, isCustom, setPreset, clearCustom } = useTimeRange();

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
      <SegmentedControl<TimeRangeKey | "custom">
        value={isCustom ? "custom" : range}
        options={(Object.keys(TIME_RANGES) as TimeRangeKey[]).map((key) => ({
          value: key,
          label: TIME_RANGES[key].label,
        }))}
        onChange={(value) => {
          if (value !== "custom") setPreset(value);
        }}
      />
      <CustomRangePicker />
      {isCustom && (
        <Badge tone="primary" className="max-w-80 whitespace-nowrap tabular-nums">
          {label}
          <button
            type="button"
            aria-label="Clear custom time range"
            onClick={clearCustom}
            className="hover:bg-primary/10 focus-visible:ring-ring -mr-1 flex size-5 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            ✕
          </button>
        </Badge>
      )}
      <ThemeToggle />
    </header>
  );
}
