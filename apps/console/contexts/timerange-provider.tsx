"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { RangeQuery } from "@/lib/api";

export type TimeRangeKey = "1h" | "24h" | "7d" | "30d";

export const TIME_RANGES: Record<TimeRangeKey, { label: string; minutes: number }> = {
  "1h": { label: "1h", minutes: 60 },
  "24h": { label: "24h", minutes: 1440 },
  "7d": { label: "7d", minutes: 10080 },
  "30d": { label: "30d", minutes: 43200 },
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
  const minutes = isCustom
    ? Math.max(1, Math.round((selection.to - selection.from) / 60000))
    : TIME_RANGES[selection].minutes;
  const rangeQuery = isCustom
    ? { minutes, from: selection.from, to: selection.to }
    : { minutes };
  const label = isCustom
    ? `${formatCustomDate(selection.from)} – ${formatCustomDate(selection.to)}`
    : TIME_RANGES[selection].label;
  const setPreset = (nextRange: TimeRangeKey) => setSelection(nextRange);

  return (
    <TimeRangeContext.Provider
      value={{
        range,
        minutes,
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
