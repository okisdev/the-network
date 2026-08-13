"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { RangeQuery } from "@/lib/api";

export type TimeRangeKey = "15m" | "1h" | "6h" | "24h" | "7d" | "30d" | "90d" | "today" | "yesterday" | "week" | "month" | "ytd";

type TimeRangeKind = "rolling" | "anchored" | "fixed";
type RollingTimeRangeKey = Extract<TimeRangeKey, "15m" | "1h" | "6h" | "24h" | "7d" | "30d" | "90d">;
type AnchoredTimeRangeKey = Extract<TimeRangeKey, "today" | "week" | "month" | "ytd">;

export const TIME_RANGES: Record<TimeRangeKey, { label: string; short: string; kind: TimeRangeKind }> = {
  "15m": { label: "Last 15 minutes", short: "15m", kind: "rolling" },
  "1h": { label: "Last 1 hour", short: "1h", kind: "rolling" },
  "6h": { label: "Last 6 hours", short: "6h", kind: "rolling" },
  "24h": { label: "Last 24 hours", short: "24h", kind: "rolling" },
  "7d": { label: "Last 7 days", short: "7d", kind: "rolling" },
  "30d": { label: "Last 30 days", short: "30d", kind: "rolling" },
  "90d": { label: "Last 90 days", short: "90d", kind: "rolling" },
  today: { label: "Today", short: "Today", kind: "anchored" },
  yesterday: { label: "Yesterday", short: "Yesterday", kind: "fixed" },
  week: { label: "This week", short: "Week", kind: "anchored" },
  month: { label: "This month", short: "Month", kind: "anchored" },
  ytd: { label: "Year to date", short: "YTD", kind: "anchored" },
};

const ROLLING_MINUTES: Record<RollingTimeRangeKey, number> = {
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440,
  "7d": 10080,
  "30d": 43200,
  "90d": 129600,
};

interface CustomTimeRange {
  from: number;
  to: number;
}

interface TimeRangeState {
  range: TimeRangeKey | "custom";
  minutes: number;
  rangeQuery: RangeQuery;
  label: string;
  isCustom: boolean;
  setRange: (range: TimeRangeKey) => void;
  setPreset: (range: TimeRangeKey) => void;
  setCustom: (from: number, to: number) => void;
  clearCustom: () => void;
}

function formatCustomDate(value: number): string {
  const date = new Date(value);
  const month = date.toLocaleString("en-GB", { month: "short" });
  const day = date.toLocaleString("en-GB", { day: "numeric" });
  const time = date.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${month} ${day} ${time}`;
}

function getAnchor(range: AnchoredTimeRangeKey, now: Date): Date {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);

  if (range === "week") {
    anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  }

  if (range === "month") {
    anchor.setDate(1);
  }

  if (range === "ytd") {
    anchor.setMonth(0, 1);
  }

  return anchor;
}

function isRollingRange(range: TimeRangeKey): range is RollingTimeRangeKey {
  return TIME_RANGES[range].kind === "rolling";
}

function resolvePreset(range: TimeRangeKey): RangeQuery {
  const now = new Date();

  if (isRollingRange(range)) {
    return { minutes: ROLLING_MINUTES[range] };
  }

  if (range === "yesterday") {
    const to = new Date(now);
    to.setHours(0, 0, 0, 0);
    return { minutes: 1440, from: to.getTime() - 1440 * 60_000, to: to.getTime() };
  }

  const anchor = getAnchor(range, now);
  return { minutes: Math.max(1, Math.ceil((now.getTime() - anchor.getTime()) / 60000)) };
}

const TimeRangeContext = createContext<TimeRangeState>({
  range: "1h",
  minutes: 60,
  rangeQuery: { minutes: 60 },
  label: "1h",
  isCustom: false,
  setRange: () => {},
  setPreset: () => {},
  setCustom: () => {},
  clearCustom: () => {},
});

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<TimeRangeKey | CustomTimeRange>("1h");
  const isCustom = typeof selection !== "string";
  const range = isCustom ? "custom" : selection;
  const rangeQuery = isCustom
    ? {
        minutes: Math.max(1, Math.round((selection.to - selection.from) / 60000)),
        from: selection.from,
        to: selection.to,
      }
    : resolvePreset(selection);
  const label = isCustom
    ? `${formatCustomDate(selection.from)} – ${formatCustomDate(selection.to)}`
    : TIME_RANGES[selection].short;
  const setPreset = (nextRange: TimeRangeKey) => setSelection(nextRange);

  return (
    <TimeRangeContext.Provider
      value={{
        range,
        minutes: rangeQuery.minutes,
        rangeQuery,
        label,
        isCustom,
        setRange: setPreset,
        setPreset,
        setCustom: (from, to) => setSelection({ from, to }),
        clearCustom: () => setSelection("24h"),
      }}
    >
      {children}
    </TimeRangeContext.Provider>
  );
}

export function useTimeRange(): TimeRangeState {
  return useContext(TimeRangeContext);
}
