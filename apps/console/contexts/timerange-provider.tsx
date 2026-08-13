"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

export type TimeRangeKey = "1h" | "24h" | "7d" | "30d";

export const TIME_RANGES: Record<TimeRangeKey, { label: string; minutes: number }> = {
  "1h": { label: "1h", minutes: 60 },
  "24h": { label: "24h", minutes: 1440 },
  "7d": { label: "7d", minutes: 10080 },
  "30d": { label: "30d", minutes: 43200 },
};

interface TimeRangeState {
  range: TimeRangeKey;
  minutes: number;
  setRange: (range: TimeRangeKey) => void;
}

const TimeRangeContext = createContext<TimeRangeState>({
  range: "1h",
  minutes: 60,
  setRange: () => {},
});

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<TimeRangeKey>("1h");
  return (
    <TimeRangeContext.Provider value={{ range, minutes: TIME_RANGES[range].minutes, setRange }}>
      {children}
    </TimeRangeContext.Provider>
  );
}

export function useTimeRange(): TimeRangeState {
  return useContext(TimeRangeContext);
}
