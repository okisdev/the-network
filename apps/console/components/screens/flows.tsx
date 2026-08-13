"use client";

import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlowDto, FlowState } from "@the-network/schema";
import { Pause, Play } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusDot } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { api } from "@/lib/api";
import {
  formatBytes,
  formatDuration,
  formatTime,
  formatTimeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const COLS =
  "grid grid-cols-[72px_1fr_110px_1.4fr_120px_1fr_90px_90px_60px] gap-2 items-center";

const ALL = "all";

function policyTone(policy?: string): "destructive" | "muted" | "primary" {
  if (!policy) return "muted";
  const upper = policy.toUpperCase();
  if (upper === "REJECT" || upper.includes("REJECT")) return "destructive";
  if (upper === "DIRECT" || upper.includes("DIRECT")) return "muted";
  return "primary";
}

function stateTone(state: FlowState): "ok" | "muted" | "destructive" {
  if (state === "active") return "ok";
  if (state === "failed") return "destructive";
  return "muted";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function FlowsScreen() {
  const live = useLive();
  const [paused, setPaused] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [stateFilter, setStateFilter] = useState<"" | FlowState>("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [serverFlows, setServerFlows] = useState<FlowDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const filterActive = Boolean(deviceId || stateFilter || debouncedSearch.trim());
  const serverMode = paused || filterActive;

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: api.devices,
    refetchInterval: 30000,
  });

  const queryKey = useMemo(
    () =>
      [
        "flows",
        "page",
        deviceId || null,
        stateFilter || null,
        debouncedSearch.trim() || null,
      ] as const,
    [deviceId, stateFilter, debouncedSearch],
  );

  const {
    data: firstPage,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey,
    queryFn: () =>
      api.flows({
        deviceId: deviceId || undefined,
        search: debouncedSearch.trim() || undefined,
        state: stateFilter || undefined,
        limit: 100,
      }),
    enabled: serverMode,
  });

  useEffect(() => {
    if (!serverMode) {
      setServerFlows([]);
      setNextCursor(undefined);
      return;
    }
    if (firstPage) {
      setServerFlows(firstPage.flows);
      setNextCursor(firstPage.nextCursor);
    }
  }, [firstPage, serverMode, queryKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.flows({
        deviceId: deviceId || undefined,
        search: debouncedSearch.trim() || undefined,
        state: stateFilter || undefined,
        limit: 100,
        cursor: nextCursor,
      });
      setServerFlows((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        const added = page.flows.filter((f) => !seen.has(f.id));
        return [...prev, ...added];
      });
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, deviceId, debouncedSearch, stateFilter]);

  const rows = serverMode ? serverFlows : live.flows;

  const parentRef = useRef<HTMLDivElement>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const now = Date.now();

  return (
    <>
      <PageHeader title="Flows" sub="Live connection log across the whole home" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        {paused && <Badge tone="warn">Paused</Badge>}

        <Select
          value={deviceId || ALL}
          onValueChange={(v) => setDeviceId(!v || v === ALL ? "" : v)}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All devices</SelectItem>
            {(devices ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={stateFilter || ALL}
          onValueChange={(v) =>
            setStateFilter(!v || v === ALL ? "" : (v as FlowState))
          }
        >
          <SelectTrigger className="min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Host, IP, process"
          className="min-w-[180px]"
        />

        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {rows.length} flow{rows.length === 1 ? "" : "s"}
          {serverMode ? " · server" : " · live"}
        </span>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty
            message={isLoading && serverMode ? "Loading flows" : "No flows yet"}
            hint={
              serverMode && filterActive
                ? "Try clearing filters"
                : "Traffic will appear once a source is connected"
            }
          />
        ) : (
          <div
            ref={parentRef}
            className="-m-4 h-[calc(100vh-230px)] overflow-auto"
          >
            <div
              className={cn(
                COLS,
                "bg-card text-muted-foreground sticky top-0 z-10 border-b border-border px-3 py-2 text-xs font-medium",
              )}
            >
              <span>Time</span>
              <span>Device</span>
              <span>Process</span>
              <span>Destination</span>
              <span>Policy</span>
              <span>Rule</span>
              <span className="text-right">Down</span>
              <span className="text-right">Up</span>
              <span>State</span>
            </div>
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const flow = rows[vi.index];
                if (!flow) return null;
                const isOpen = expanded.has(flow.id);
                return (
                  <FlowRow
                    key={flow.id}
                    flow={flow}
                    expanded={isOpen}
                    fresh={now - flow.ts < 2000}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                    }}
                    measureRef={virtualizer.measureElement}
                    virtualIndex={vi.index}
                    onToggle={() => toggleExpand(flow.id)}
                  />
                );
              })}
            </div>
            {serverMode && nextCursor && (
              <div className="border-border flex justify-center border-t py-3">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={loadingMore || isFetching}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

const FlowRow = memo(function FlowRow({
  flow,
  expanded,
  fresh,
  style,
  measureRef,
  virtualIndex,
  onToggle,
}: {
  flow: FlowDto;
  expanded: boolean;
  fresh: boolean;
  style: CSSProperties;
  measureRef: (node: Element | null) => void;
  virtualIndex: number;
  onToggle: () => void;
}) {
  const destHost = flow.dst.host;
  const destIp = flow.dst.ip;
  const destLabel = destHost || destIp || "—";
  const port = flow.dst.port != null ? `:${flow.dst.port}` : "";
  const duration =
    flow.startedAt != null && flow.endedAt != null
      ? formatDuration(flow.endedAt - flow.startedAt)
      : flow.startedAt != null
        ? formatDuration(Date.now() - flow.startedAt)
        : null;

  return (
    <div
      ref={measureRef}
      data-index={virtualIndex}
      style={style}
      className={cn(
        "border-border border-b transition-colors duration-150",
        fresh && "bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          COLS,
          "hover:bg-muted w-full px-3 py-2 text-left text-xs focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <span className="text-muted-foreground font-mono tabular-nums">
          {formatTime(flow.ts)}
        </span>
        <span className="text-foreground truncate">{flow.deviceName}</span>
        <span className="text-muted-foreground truncate font-mono">
          {flow.process ?? "—"}
        </span>
        <span className="truncate">
          <span className={destHost ? "text-foreground font-medium" : "text-foreground"}>
            {destLabel}
          </span>
          {port && <span className="text-muted-foreground">{port}</span>}
          {flow.country ? (
            <>
              {" "}
              <CountryChip code={flow.country} />
            </>
          ) : null}
        </span>
        <span className="min-w-0" title={flow.policy ?? undefined}>
          {flow.policy ? (
            <Badge tone={policyTone(flow.policy)} className="max-w-full">
              <span className="min-w-0 truncate">{flow.policy}</span>
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
        <span className="text-muted-foreground truncate" title={flow.rule}>
          {flow.rule ?? "—"}
        </span>
        <span className="text-foreground text-right font-mono tabular-nums">
          {formatBytes(flow.bytesIn)}
        </span>
        <span className="text-foreground text-right font-mono tabular-nums">
          {formatBytes(flow.bytesOut)}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot tone={stateTone(flow.state)} />
          <span className="text-muted-foreground font-mono text-[11px]">{flow.state}</span>
        </span>
      </button>

      {expanded && (
        <div className="bg-muted/40 border-border space-y-1.5 border-t px-4 py-3 text-xs">
          {flow.policyChain && flow.policyChain.length > 0 && (
            <p className="text-muted-foreground">
              <span className="text-muted-foreground text-xs">Chain </span>
              {flow.policyChain.join(" → ")}
            </p>
          )}
          {(flow.dst.host || flow.dst.ip) && (
            <p className="text-muted-foreground font-mono">
              {[flow.dst.proto, flow.dst.host, flow.dst.ip, flow.dst.port]
                .filter((x) => x != null && x !== "")
                .join(" · ")}
            </p>
          )}
          {flow.rule && (
            <p className="text-muted-foreground">
              <span className="text-muted-foreground text-xs">Rule </span>
              {flow.rule}
            </p>
          )}
          <p className="text-muted-foreground font-mono text-[11px]">
            {flow.startedAt != null && (
              <span>
                Started {formatTime(flow.startedAt)}
                {flow.endedAt != null
                  ? ` · ended ${formatTime(flow.endedAt)}`
                  : ` · ${formatTimeAgo(flow.startedAt)}`}
                {duration != null && ` · ${duration}`}
              </span>
            )}
            {flow.startedAt == null && <span>Seen {formatTimeAgo(flow.ts)}</span>}
            <span className="text-muted-foreground ml-2 font-mono">id {flow.id}</span>
          </p>
        </div>
      )}
    </div>
  );
});
