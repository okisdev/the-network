"use client";

import type {
  DeviceRatePush,
  DnsLogEntry,
  EventDto,
  FlowDto,
  StreamMessage,
  SummaryPush,
} from "@the-network/schema";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const FLOW_BUFFER = 400;
const EVENT_BUFFER = 50;
const DNS_BUFFER = 100;

export interface LiveState {
  connected: boolean;
  summary: SummaryPush | null;
  deviceRates: ReadonlyMap<string, DeviceRatePush>;
  flows: FlowDto[];
  events: EventDto[];
  dns: DnsLogEntry[];
}

const initialState: LiveState = {
  connected: false,
  summary: null,
  deviceRates: new Map(),
  flows: [],
  events: [],
  dns: [],
};

const LiveContext = createContext<LiveState>(initialState);

function reduce(state: LiveState, msg: StreamMessage): LiveState {
  switch (msg.type) {
    case "hello":
      return state;
    case "summary":
      return { ...state, summary: msg.data };
    case "flows": {
      const byId = new Map<string, FlowDto>();
      for (const flow of state.flows) byId.set(flow.id, flow);
      for (const flow of msg.data) byId.set(flow.id, flow);
      const flows = [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, FLOW_BUFFER);
      return { ...state, flows };
    }
    case "devices": {
      const deviceRates = new Map(state.deviceRates);
      for (const rate of msg.data) deviceRates.set(rate.id, rate);
      return { ...state, deviceRates };
    }
    case "event":
      return { ...state, events: [msg.data, ...state.events].slice(0, EVENT_BUFFER) };
    case "dns":
      return { ...state, dns: [...msg.data, ...state.dns].slice(0, DNS_BUFFER) };
  }
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveState>(initialState);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: number | undefined;
    let retryMs = 1000;
    let closed = false;

    const connect = () => {
      source = new EventSource("/api/stream");
      source.onopen = () => {
        retryMs = 1000;
        setState((s) => ({ ...s, connected: true }));
      };
      source.onmessage = (event) => {
        const msg = JSON.parse(event.data) as StreamMessage;
        setState((s) => reduce(s, msg));
      };
      source.onerror = () => {
        source?.close();
        setState((s) => ({ ...s, connected: false }));
        if (!closed) {
          timer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 10000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      source?.close();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  return useContext(LiveContext);
}
