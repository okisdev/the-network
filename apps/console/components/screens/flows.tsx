"use client";

import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlowDto, FlowState, TimeseriesPoint } from "@the-network/schema";
import { ChevronRight, Pause, Play, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MirroredAreaChart } from "@/components/charts/mirrored-area";
import { SplitBar } from "@/components/charts/split-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusDot } from "@/components/ui/status-dot";
import { useLive } from "@/contexts/live-provider";
import { api } from "@/lib/api";
import {
  formatBytes,
  formatDuration,
  formatTime,
  formatTimeAgo,
} from "@/lib/format";
import { registrableDomain, serviceForPort } from "@/lib/net-labels";
import { useQueryParams } from "@/lib/use-query-params";
import { cn } from "@/lib/utils";

const COLS =
  "grid grid-cols-[72px_1fr_120px_1.4fr_150px_1fr_90px_90px_70px] gap-2 items-center";
const ALL = "all";

type ProtoFilter = "" | "tcp" | "udp" | "other";
type ViewMode = "stream" | "groups";

interface DomainGroup {
  key: string;
  label: string;
  flows: number;
  bytesIn: number;
  bytesOut: number;
}

interface ProcessGroup extends DomainGroup {
  domains: DomainGroup[];
}

interface DeviceGroup extends DomainGroup {
  processes: ProcessGroup[];
}

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

function stateFromParam(value: string | null): "" | FlowState {
  if (value === "active" || value === "completed" || value === "failed") return value;
  return "";
}

function protoFromParam(value: string | null): ProtoFilter {
  if (value === "tcp" || value === "udp" || value === "other") return value;
  return "";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function totalBytes(group: DomainGroup): number {
  return group.bytesIn + group.bytesOut;
}

function buildGroups(flows: FlowDto[]): DeviceGroup[] {
  const devices = new Map<
    string,
    Omit<DeviceGroup, "processes"> & {
      processes: Map<
        string,
        Omit<ProcessGroup, "domains"> & { domains: Map<string, DomainGroup> }
      >;
    }
  >();

  for (const flow of flows) {
    const deviceKey = `device:${flow.deviceId}`;
    const processLabel = flow.process || "no process";
    const processKey = `${deviceKey}/process:${processLabel}`;
    const domainLabel = flow.dst.host
      ? registrableDomain(flow.dst.host)
      : flow.dst.ip || "unknown";
    const domainKey = `${processKey}/domain:${domainLabel}`;
    let device = devices.get(deviceKey);
    if (!device) {
      device = {
        key: deviceKey,
        label: flow.deviceName || flow.deviceId,
        flows: 0,
        bytesIn: 0,
        bytesOut: 0,
        processes: new Map(),
      };
      devices.set(deviceKey, device);
    }

    let process = device.processes.get(processKey);
    if (!process) {
      process = {
        key: processKey,
        label: processLabel,
        flows: 0,
        bytesIn: 0,
        bytesOut: 0,
        domains: new Map(),
      };
      device.processes.set(processKey, process);
    }

    let domain = process.domains.get(domainKey);
    if (!domain) {
      domain = {
        key: domainKey,
        label: domainLabel,
        flows: 0,
        bytesIn: 0,
        bytesOut: 0,
      };
      process.domains.set(domainKey, domain);
    }

    for (const group of [device, process, domain]) {
      group.flows += 1;
      group.bytesIn += flow.bytesIn;
      group.bytesOut += flow.bytesOut;
    }
  }

  return [...devices.values()]
    .map((device) => ({
      ...device,
      processes: [...device.processes.values()]
        .map((process) => ({
          ...process,
          domains: [...process.domains.values()].sort(
            (a, b) => totalBytes(b) - totalBytes(a),
          ),
        }))
        .sort((a, b) => totalBytes(b) - totalBytes(a)),
    }))
    .sort((a, b) => totalBytes(b) - totalBytes(a));
}

export function FlowsScreen() {
  const live = useLive();
  const [params, update] = useQueryParams();
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<ViewMode>("stream");
  const [selected, setSelected] = useState<FlowDto | null>(null);
  const [serverFlows, setServerFlows] = useState<FlowDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [throughput, setThroughput] = useState<TimeseriesPoint[]>([]);
  const [groupExpansion, setGroupExpansion] = useState<Set<string>>(() => new Set());
  const lastSummaryRef = useRef<typeof live.summary>(null);
  const groupScopeRef = useRef("");

  const deviceId = params.get("device") ?? "";
  const policyFilter = params.get("policy") ?? "";
  const countryFilter = params.get("country") ?? "";
  const stateFilter = stateFromParam(params.get("state"));
  const protoFilter = protoFromParam(params.get("proto"));
  const processFilter = params.get("process") ?? "";
  const portFilter = params.get("port") ?? "";
  const search = params.get("search") ?? params.get("host") ?? "";
  const debouncedSearch = useDebounced(search, 300);
  const parsedPort = portFilter ? Number(portFilter) : undefined;
  const port = parsedPort !== undefined && Number.isFinite(parsedPort) ? parsedPort : undefined;
  const filterActive = Boolean(
    deviceId ||
      policyFilter ||
      countryFilter ||
      stateFilter ||
      protoFilter ||
      processFilter ||
      portFilter ||
      debouncedSearch.trim(),
  );
  const serverMode = paused || filterActive;

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: api.devices,
    refetchInterval: 30000,
  });

  const { data: policyBreakdown } = useQuery({
    queryKey: ["breakdown", "policy", 1440, 50],
    queryFn: () => api.breakdown({ dim: "policy", minutes: 1440, limit: 50 }),
    refetchInterval: 120000,
  });

  const { data: countryBreakdown } = useQuery({
    queryKey: ["breakdown", "country", 1440, 50],
    queryFn: () => api.breakdown({ dim: "country", minutes: 1440, limit: 50 }),
    refetchInterval: 120000,
  });

  const queryKey = useMemo(
    () =>
      [
        "flows",
        "page",
        deviceId || null,
        policyFilter || null,
        countryFilter || null,
        stateFilter || null,
        protoFilter || null,
        processFilter || null,
        port ?? null,
        debouncedSearch.trim() || null,
      ] as const,
    [
      deviceId,
      policyFilter,
      countryFilter,
      stateFilter,
      protoFilter,
      processFilter,
      port,
      debouncedSearch,
    ],
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
        policy: policyFilter || undefined,
        state: stateFilter || undefined,
        country: countryFilter || undefined,
        proto: protoFilter || undefined,
        port,
        process: processFilter || undefined,
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

  useEffect(() => {
    if (!live.summary || lastSummaryRef.current === live.summary) return;
    lastSummaryRef.current = live.summary;
    setThroughput((points) => [
      ...points,
      {
        ts: Date.now(),
        in: live.summary?.wan.rateIn ?? 0,
        out: live.summary?.wan.rateOut ?? 0,
      },
    ].slice(-60));
  }, [live.summary]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.flows({
        deviceId: deviceId || undefined,
        search: debouncedSearch.trim() || undefined,
        policy: policyFilter || undefined,
        state: stateFilter || undefined,
        country: countryFilter || undefined,
        proto: protoFilter || undefined,
        port,
        process: processFilter || undefined,
        limit: 100,
        cursor: nextCursor,
      });
      setServerFlows((previous) => {
        const seen = new Set(previous.map((flow) => flow.id));
        const added = page.flows.filter((flow) => !seen.has(flow.id));
        return [...previous, ...added];
      });
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [
    nextCursor,
    loadingMore,
    deviceId,
    debouncedSearch,
    policyFilter,
    stateFilter,
    countryFilter,
    protoFilter,
    port,
    processFilter,
  ]);

  const rows = serverMode ? serverFlows : live.flows;
  const groups = useMemo(() => buildGroups(rows), [rows]);
  const stateCounts = useMemo(
    () => ({
      active: rows.filter((flow) => flow.state === "active").length,
      completed: rows.filter((flow) => flow.state === "completed").length,
      failed: rows.filter((flow) => flow.state === "failed").length,
      rejected: rows.filter((flow) => flow.policy?.toUpperCase().startsWith("REJECT")).length,
    }),
    [rows],
  );

  useEffect(() => {
    if (view !== "groups" || !groups[0]) return;
    const scope = serverMode ? queryKey.join("|") : "live";
    if (groupScopeRef.current === scope) return;
    groupScopeRef.current = scope;
    setGroupExpansion(new Set([groups[0].key]));
  }, [groups, queryKey, serverMode, view]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  const toggleGroup = useCallback((key: string) => {
    setGroupExpansion((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    update({
      device: undefined,
      policy: undefined,
      country: undefined,
      state: undefined,
      proto: undefined,
      process: undefined,
      port: undefined,
      search: undefined,
      host: undefined,
    });
  }, [update]);

  const now = Date.now();
  const loading = isLoading && serverMode;

  return (
    <>
      <PageHeader title="Flows" sub="Live connection log across the whole home" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" onClick={() => setPaused((value) => !value)}>
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        {paused && <Badge tone="warn">Paused</Badge>}

        <Select
          value={deviceId || ALL}
          onValueChange={(value) => update({ device: !value || value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by device" className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All devices</SelectItem>
            {(devices ?? []).map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={stateFilter || ALL}
          onValueChange={(value) => update({ state: !value || value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by state" className="min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={policyFilter || ALL}
          onValueChange={(value) => update({ policy: !value || value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by policy" className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All policies</SelectItem>
            {(policyBreakdown?.rows ?? []).map((row) => (
              <SelectItem key={row.key} value={row.key}>
                {row.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={countryFilter || ALL}
          onValueChange={(value) => update({ country: !value || value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by country" className="min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All countries</SelectItem>
            {(countryBreakdown?.rows ?? []).map((row) => (
              <SelectItem key={row.key} value={row.key}>
                <CountryChip code={row.key} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div role="group" aria-label="Filter by protocol">
          <SegmentedControl<ProtoFilter | typeof ALL>
            value={protoFilter || ALL}
            options={[
              { value: ALL, label: "All" },
              { value: "tcp", label: "TCP" },
              { value: "udp", label: "UDP" },
              { value: "other", label: "Other" },
            ]}
            onChange={(value) => update({ proto: value === ALL ? undefined : value })}
          />
        </div>

        <Input
          aria-label="Search flows"
          type="search"
          value={search}
          onChange={(event) => update({ search: event.target.value || undefined, host: undefined })}
          placeholder="Host, IP, process"
          className="min-w-[180px] flex-1 basis-[180px]"
        />

        {processFilter && (
          <button
            type="button"
            aria-label={`Remove process filter ${processFilter}`}
            className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => update({ process: undefined })}
          >
            <Badge>
              process: {processFilter}
              <X className="size-3" />
            </Badge>
          </button>
        )}

        {portFilter && (
          <button
            type="button"
            aria-label={`Remove port filter ${portFilter}`}
            className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => update({ port: undefined })}
          >
            <Badge>
              port: {portFilter}
              <X className="size-3" />
            </Badge>
          </button>
        )}

        {filterActive && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground whitespace-nowrap font-mono text-xs tabular-nums">
            {rows.length} flow{rows.length === 1 ? "" : "s"}
            {serverMode ? " · server" : " · live"}
          </span>
          <div role="group" aria-label="Flow view">
            <SegmentedControl<ViewMode>
              value={view}
              options={[
                { value: "stream", label: "Stream" },
                { value: "groups", label: "Groups" },
              ]}
              onChange={setView}
            />
          </div>
        </div>
      </div>

      {!filterActive && (
        <Card className="mb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div
              role="img"
              className="min-w-0 flex-1"
              aria-label="60-second download and upload throughput"
            >
              <MirroredAreaChart points={throughput} height={64} axes={false} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StateFilterButton
                label="Active"
                count={stateCounts.active}
                className="text-ok ring-ok/30 bg-ok/10 hover:bg-ok/10"
                onClick={() => update({ state: "active" })}
              />
              <StateFilterButton
                label="Completed"
                count={stateCounts.completed}
                className="bg-muted"
                onClick={() => update({ state: "completed" })}
              />
              <StateFilterButton
                label="Failed"
                count={stateCounts.failed}
                destructive
                className="bg-destructive/10"
                onClick={() => update({ state: "failed" })}
              />
              <StateFilterButton
                label="Rejected"
                count={stateCounts.rejected}
                destructive
                onClick={() => update({ policy: "REJECT" })}
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty
            message={loading ? "Loading flows" : "No flows yet"}
            hint={
              serverMode && filterActive
                ? "Try clearing filters"
                : "Traffic will appear once a source is connected"
            }
          />
        ) : view === "stream" ? (
          <div
            ref={parentRef}
            className={cn(
              "-m-4 min-h-[280px] overflow-auto",
              filterActive ? "h-[calc(100vh-230px)]" : "h-[calc(100vh-340px)]",
            )}
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
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const flow = rows[virtualRow.index];
                if (!flow) return null;
                return (
                  <FlowRow
                    key={flow.id}
                    flow={flow}
                    fresh={now - flow.ts < 2000}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    measureRef={virtualizer.measureElement}
                    virtualIndex={virtualRow.index}
                    onSelect={() => setSelected(flow)}
                  />
                );
              })}
            </div>
            {serverMode && nextCursor && (
              <LoadMore
                loading={loadingMore || isFetching}
                onLoad={() => void loadMore()}
              />
            )}
          </div>
        ) : (
          <GroupsView
            groups={groups}
            expanded={groupExpansion}
            loadedFlows={rows.length}
            loadingMore={loadingMore || isFetching}
            canLoadMore={serverMode && Boolean(nextCursor)}
            onToggle={toggleGroup}
            onSelectDomain={(domain) => update({ search: domain, host: undefined })}
            onLoadMore={() => void loadMore()}
          />
        )}
      </Card>

      <FlowInspector
        flow={selected}
        onClose={() => setSelected(null)}
        onFilterDevice={(flow) => {
          update({ device: flow.deviceId });
          setSelected(null);
        }}
        onFilterHost={(host) => {
          update({ search: registrableDomain(host), host: undefined });
          setSelected(null);
        }}
        onFilterPolicy={(policy) => {
          update({ policy });
          setSelected(null);
        }}
      />
    </>
  );
}

function StateFilterButton({
  label,
  count,
  destructive = false,
  className,
  onClick,
}: {
  label: string;
  count: number;
  destructive?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={destructive ? "destructive" : "outline"}
      className={cn("rounded-full font-mono tabular-nums", className)}
      onClick={onClick}
    >
      {label} {count}
    </Button>
  );
}

function LoadMore({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  return (
    <div className="border-border flex justify-center border-t py-3">
      <Button type="button" variant="default" size="sm" disabled={loading} onClick={onLoad}>
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

const FlowRow = memo(function FlowRow({
  flow,
  fresh,
  style,
  measureRef,
  virtualIndex,
  onSelect,
}: {
  flow: FlowDto;
  fresh: boolean;
  style: CSSProperties;
  measureRef: (node: Element | null) => void;
  virtualIndex: number;
  onSelect: () => void;
}) {
  const destination = flow.dst.host || flow.dst.ip || "—";
  const port = flow.dst.port != null ? `:${flow.dst.port}` : "";
  const policyTitle = flow.policyGroup
    ? `${flow.policyGroup} → ${flow.policy ?? "—"}`
    : flow.policy;

  return (
    <button
      ref={measureRef}
      data-index={virtualIndex}
      type="button"
      style={style}
      onClick={onSelect}
      className={cn(
        COLS,
        "border-border hover:bg-muted focus-visible:ring-ring w-full border-b px-3 py-2 text-left text-xs transition-colors duration-150 focus-visible:z-[1] focus-visible:ring-2 focus-visible:outline-none",
        fresh && "bg-primary/10",
      )}
    >
      <span className="text-muted-foreground font-mono tabular-nums">
        {formatTime(flow.ts)}
      </span>
      <span className="text-foreground truncate">{flow.deviceName}</span>
      <span
        className="text-muted-foreground truncate font-mono"
        title={flow.processPath}
      >
        {flow.process ?? "—"}
      </span>
      <span className="min-w-0 truncate">
        <span className={flow.dst.host ? "text-foreground font-medium" : "text-foreground"}>
          {destination}
        </span>
        {port && <span className="text-muted-foreground">{port}</span>}
        {flow.dst.proto && (
          <span className="text-muted-foreground text-[10px]"> · {flow.dst.proto}</span>
        )}
        {flow.country && (
          <>
            {" "}
            <CountryChip code={flow.country} />
          </>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1" title={policyTitle}>
        {flow.policy ? (
          <Badge tone={policyTone(flow.policy)} className="min-w-0 max-w-full">
            <span className="min-w-0 truncate">{flow.policy}</span>
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {flow.proxied && (
          <Badge tone="muted" className="shrink-0 px-1.5 py-0 text-[10px]">
            proxy
          </Badge>
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
  );
});

function GroupsView({
  groups,
  expanded,
  loadedFlows,
  loadingMore,
  canLoadMore,
  onToggle,
  onSelectDomain,
  onLoadMore,
}: {
  groups: DeviceGroup[];
  expanded: Set<string>;
  loadedFlows: number;
  loadingMore: boolean;
  canLoadMore: boolean;
  onToggle: (key: string) => void;
  onSelectDomain: (domain: string) => void;
  onLoadMore: () => void;
}) {
  const deviceMaximum = Math.max(0, ...groups.map(totalBytes));

  return (
    <div className="-m-4">
      <div className="divide-border divide-y">
        {groups.map((device) => {
          const deviceOpen = expanded.has(device.key);
          const processMaximum = Math.max(0, ...device.processes.map(totalBytes));
          return (
            <div key={device.key}>
              <GroupBranchRow
                group={device}
                maximum={deviceMaximum}
                open={deviceOpen}
                level={0}
                onToggle={() => onToggle(device.key)}
              />
              {deviceOpen && (
                <div className="bg-muted/20">
                  {device.processes.map((process) => {
                    const processOpen = expanded.has(process.key);
                    const domainMaximum = Math.max(0, ...process.domains.map(totalBytes));
                    return (
                      <div key={process.key}>
                        <GroupBranchRow
                          group={process}
                          maximum={processMaximum}
                          open={processOpen}
                          level={1}
                          onToggle={() => onToggle(process.key)}
                        />
                        {processOpen && (
                          <div>
                            {process.domains.map((domain) => (
                              <GroupLeafRow
                                key={domain.key}
                                group={domain}
                                maximum={domainMaximum}
                                onSelect={() => onSelectDomain(domain.label)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <footer className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Grouping {loadedFlows} loaded flows · filters and pause affect the set
        </p>
        {canLoadMore && (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function GroupBranchRow({
  group,
  maximum,
  open,
  level,
  onToggle,
}: {
  group: DeviceGroup | ProcessGroup;
  maximum: number;
  open: boolean;
  level: 0 | 1;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 px-4 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-none",
        level === 1 && "ps-9",
      )}
    >
      <ChevronRight
        className={cn(
          "text-muted-foreground size-3.5 shrink-0 transition-transform duration-150",
          open && "rotate-90",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{group.label}</span>
      <GroupMetrics group={group} maximum={maximum} />
    </button>
  );
}

function GroupLeafRow({
  group,
  maximum,
  onSelect,
}: {
  group: DomainGroup;
  maximum: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 py-2 pe-4 ps-16 text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
        {group.label}
      </span>
      <GroupMetrics group={group} maximum={maximum} />
    </button>
  );
}

function GroupMetrics({ group, maximum }: { group: DomainGroup; maximum: number }) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      <span className="text-muted-foreground whitespace-nowrap text-xs">
        {group.flows} flows
      </span>
      <SplitBar
        inValue={group.bytesIn}
        outValue={group.bytesOut}
        max={maximum}
        className="w-28"
      />
      <span className="w-16 text-right font-mono text-xs tabular-nums">
        {formatBytes(totalBytes(group))}
      </span>
    </span>
  );
}

function FlowInspector({
  flow,
  onClose,
  onFilterDevice,
  onFilterHost,
  onFilterPolicy,
}: {
  flow: FlowDto | null;
  onClose: () => void;
  onFilterDevice: (flow: FlowDto) => void;
  onFilterHost: (host: string) => void;
  onFilterPolicy: (policy: string) => void;
}) {
  if (!flow) {
    return (
      <InspectorPanel open={false} onClose={onClose} title="Flow">
        <span />
      </InspectorPanel>
    );
  }

  const destination = flow.dst.host ?? flow.dst.ip ?? "Flow";
  const service = flow.dst.port != null ? serviceForPort(flow.dst.port) : undefined;
  const duration =
    flow.startedAt != null && flow.endedAt != null
      ? formatDuration(flow.endedAt - flow.startedAt)
      : flow.startedAt != null
        ? formatDuration(Date.now() - flow.startedAt)
        : undefined;
  const total = flow.bytesIn + flow.bytesOut;

  return (
    <InspectorPanel
      open
      onClose={onClose}
      title={destination}
      sub={`${flow.deviceName} · ${formatTime(flow.ts)}`}
    >
      <InspectorSection title="Destination">
        <DetailList>
          <DetailRow label="Host">
            <span className="break-all">{flow.dst.host ?? "—"}</span>
          </DetailRow>
          <DetailRow label="IP">
            <span className="font-mono text-xs break-all">{flow.dst.ip ?? "—"}</span>
          </DetailRow>
          <DetailRow label="Port">
            <span className="font-mono text-xs tabular-nums">
              {flow.dst.port != null ? `:${flow.dst.port}${service ? ` · ${service}` : ""}` : "—"}
            </span>
          </DetailRow>
          <DetailRow label="Protocol">
            <span className="font-mono text-xs">{flow.dst.proto ?? "—"}</span>
          </DetailRow>
          <DetailRow label="Country">
            {flow.country ? <CountryChip code={flow.country} /> : "—"}
          </DetailRow>
          {flow.city && <DetailRow label="City">{flow.city}</DetailRow>}
        </DetailList>
      </InspectorSection>

      <InspectorSection title="Decision">
        <DetailList>
          {flow.policyGroup && <DetailRow label="Policy group">{flow.policyGroup}</DetailRow>}
          <DetailRow label="Policy">
            {flow.policy ? <Badge tone={policyTone(flow.policy)}>{flow.policy}</Badge> : "—"}
          </DetailRow>
          {flow.policyChain && flow.policyChain.length > 0 && (
            <DetailRow label="Chain">
              <div className="border-border ml-1 border-l pl-4">
                {flow.policyChain.map((hop, index) => (
                  <div
                    key={`${hop}-${index}`}
                    className="relative py-1 text-xs"
                  >
                    <span className="bg-muted-foreground absolute top-2.5 -left-[19px] size-1.5 rounded-full" />
                    {hop}
                  </div>
                ))}
              </div>
            </DetailRow>
          )}
          {flow.rule && (
            <DetailRow label="Rule">
              <span className="font-mono text-[11px] break-words">{flow.rule}</span>
            </DetailRow>
          )}
          {flow.proxied && (
            <DetailRow label="Proxied">
              <Badge tone="warn">Yes</Badge>
            </DetailRow>
          )}
        </DetailList>
      </InspectorSection>

      <InspectorSection title="Process">
        <DetailList>
          <DetailRow label="Name">{flow.process ?? "—"}</DetailRow>
          {flow.processPath && (
            <DetailRow label="Path">
              <span className="font-mono text-[11px] break-all">{flow.processPath}</span>
            </DetailRow>
          )}
        </DetailList>
      </InspectorSection>

      <InspectorSection title="Traffic">
        <div className="space-y-2.5">
          <SplitBar inValue={flow.bytesIn} outValue={flow.bytesOut} max={total} />
          <p className="font-mono text-xs tabular-nums">
            ↓ {formatBytes(flow.bytesIn)} · ↑ {formatBytes(flow.bytesOut)}
          </p>
          {duration && <p className="text-muted-foreground text-xs">Duration {duration}</p>}
          {flow.connectMs != null && (
            <p className="text-muted-foreground font-mono text-xs tabular-nums">
              connected in {flow.connectMs}ms
            </p>
          )}
        </div>
      </InspectorSection>

      <InspectorSection title="Timeline">
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <StatusDot tone={stateTone(flow.state)} />
            <span className="font-mono">{flow.state}</span>
          </div>
          {flow.startedAt != null && (
            <p className="text-muted-foreground font-mono tabular-nums">
              Started {formatTime(flow.startedAt)} · {formatTimeAgo(flow.startedAt)}
            </p>
          )}
          {flow.endedAt != null && (
            <p className="text-muted-foreground font-mono tabular-nums">
              Ended {formatTime(flow.endedAt)} · {formatTimeAgo(flow.endedAt)}
            </p>
          )}
          <p className="text-muted-foreground font-mono tabular-nums">
            First seen {formatTime(flow.ts)} · {formatTimeAgo(flow.ts)}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="Filter by">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onFilterDevice(flow)}>
            Device
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!flow.dst.host}
            onClick={() => flow.dst.host && onFilterHost(flow.dst.host)}
          >
            Host
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!flow.policy}
            onClick={() => flow.policy && onFilterPolicy(flow.policy)}
          >
            Policy
          </Button>
        </div>
      </InspectorSection>
    </InspectorPanel>
  );
}

function DetailList({ children }: { children: ReactNode }) {
  return <dl className="space-y-2.5">{children}</dl>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}
