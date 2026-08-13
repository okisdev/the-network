"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TIME_RANGES, type TimeRangeKey, useTimeRange } from "@/contexts/timerange-provider";

const RELATIVE_PRESETS: TimeRangeKey[] = ["15m", "1h", "6h", "24h", "7d", "30d", "90d"];
const CALENDAR_PRESETS: TimeRangeKey[] = ["today", "yesterday", "week", "month", "ytd"];

function formatDateTimeLocal(value: number): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMonthDay(value: Date): string {
  const month = value.toLocaleString("en-GB", { month: "short" });
  const day = value.toLocaleString("en-GB", { day: "numeric" });
  return `${month} ${day}`;
}

function getCalendarHint(range: TimeRangeKey): string | undefined {
  const now = new Date();

  if (range === "today") return "00:00";

  if (range === "yesterday") {
    now.setDate(now.getDate() - 1);
    return formatMonthDay(now);
  }

  if (range === "week") return "since Mon";
  if (range === "month") return `since ${formatMonthDay(new Date(now.getFullYear(), now.getMonth(), 1))}`;
  if (range === "ytd") return `since ${formatMonthDay(new Date(now.getFullYear(), 0, 1))}`;
}

export function TimeRangePicker() {
  const { label, minutes, range, rangeQuery, isCustom, setPreset, setCustom, clearCustom } = useTimeRange();
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

  const selectPreset = (preset: TimeRangeKey) => {
    setPreset(preset);
    setOpen(false);
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalid) return;
    setCustom(from, to);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <CalendarRange className="size-3.5" />
        <span className="max-w-56 truncate font-mono text-xs tabular-nums">{label}</span>
        <ChevronDown className="text-muted-foreground size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[380px]">
        <PopoverTitle className="sr-only">Time range</PopoverTitle>
        <div className="grid grid-cols-2 gap-4">
          <PresetGroup title="Relative" presets={RELATIVE_PRESETS} range={range} onSelect={selectPreset} />
          <PresetGroup title="Calendar" presets={CALENDAR_PRESETS} range={range} onSelect={selectPreset} />
        </div>
        <form className="mt-3 border-t pt-3" onSubmit={apply}>
          <div className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wide">Custom</div>
          <div className="space-y-3">
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
            {isCustom && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-1 text-[11px]"
                onClick={() => {
                  clearCustom();
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>
        <p className="text-muted-foreground mt-3 border-t pt-2 text-[11px]">
          Minute detail up to 48 h · hourly beyond · flow-level views keep 14 days
        </p>
      </PopoverContent>
    </Popover>
  );
}

function PresetGroup({
  title,
  presets,
  range,
  onSelect,
}: {
  title: string;
  presets: TimeRangeKey[];
  range: TimeRangeKey | "custom";
  onSelect: (preset: TimeRangeKey) => void;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wide">{title}</div>
      <div>
        {presets.map((preset) => {
          const active = range === preset;
          const hint = getCalendarHint(preset);
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onSelect(preset)}
              className={`focus-visible:ring-ring flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none ${
                active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <span>{TIME_RANGES[preset].label}</span>
              {hint && <span className="text-muted-foreground font-mono text-[11px] tabular-nums">{hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
