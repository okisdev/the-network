"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { DeviceDto } from "@the-network/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { MirroredAreaChart } from "@/components/charts/mirrored-area";
import { PresenceRibbon } from "@/components/charts/presence-ribbon";
import { SplitBar } from "@/components/charts/split-bar";
import { TopologyGraph } from "@/components/charts/topology";
import { ArrowLink } from "@/components/ui/arrow-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { DetailList, DetailRow } from "@/components/ui/detail-list";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
import { PageHeader } from "@/components/ui/page-header";
import { RowList } from "@/components/ui/row-list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLive } from "@/contexts/live-provider";
import { useTimeRange } from "@/contexts/timerange-provider";
import { ApiError, api } from "@/lib/api";
import { policyColor } from "@/lib/chart-colors";
import { deviceIcon } from "@/lib/device-icons";
import { formatBytes, formatRate, formatTime, formatTimeAgo } from "@/lib/format";
import { serviceForPort } from "@/lib/net-labels";
import { useQueryParams } from "@/lib/use-query-params";
import { cn } from "@/lib/utils";

function isHiddenMac(mac?: string | null): boolean {
  if (!mac) return true;
  return mac.startsWith("gateway:") || mac.startsWith("unattributed:");
}

function flowsHref(
  deviceId: string,
  extra?: { search?: string; process?: string },
): string {
  const params = new URLSearchParams({ device: deviceId });
  if (extra?.search) params.set("search", extra.search);
  if (extra?.process) params.set("process", extra.process);
  return `/flows?${params.toString()}`;
}

type SortKey = "rate" | "name" | "today" | "lastSeen";
type ViewMode = "list" | "topology";
type MergedDevice = DeviceDto & { combinedRate: number };

function mergeDevices(
  devices: DeviceDto[] | undefined,
  rates: ReadonlyMap<string, { rateIn: number; rateOut: number; online: boolean }>,
): MergedDevice[] {
  if (!devices) return [];
  return devices.map((device) => {
    const live = rates.get(device.id);
    const rateIn = live?.rateIn ?? device.rateIn;
    const rateOut = live?.rateOut ?? device.rateOut;
    return {
      ...device,
      rateIn,
      rateOut,
      online: live?.online ?? device.online,
      combinedRate: rateIn + rateOut,
    };
  });
}

export function DevicesScreen() {
  const live = useLive();
  const [params, updateParams] = useQueryParams();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [view, setView] = useState<ViewMode>("list");
  const selectedId = params.get("device");

  const { data, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: api.devices,
    refetchInterval: 15000,
  });
  const { data: firstSeen } = useQuery({
    queryKey: ["first-seen", 7],
    queryFn: () => api.firstSeen(7),
    refetchInterval: 60000,
  });

  const merged = useMemo(() => mergeDevices(data, live.deviceRates), [data, live.deviceRates]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? merged.filter((device) => {
          if (device.name.toLowerCase().includes(query)) return true;
          if (device.mac?.toLowerCase().includes(query)) return true;
          return device.ips.some((ip) => ip.toLowerCase().includes(query));
        })
      : merged;
    return [...matches].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "today":
          return b.todayIn + b.todayOut - (a.todayIn + a.todayOut);
        case "lastSeen":
          return b.lastSeenAt - a.lastSeenAt;
        case "rate":
        default:
          return b.combinedRate - a.combinedRate;
      }
    });
  }, [merged, search, sortKey]);
  const onlineDevices = useMemo(() => filtered.filter((device) => device.online), [filtered]);
  const selected = useMemo(
    () => (selectedId ? merged.find((device) => device.id === selectedId) : undefined),
    [merged, selectedId],
  );
  const summary = useMemo(
    () => ({
      total: merged.length,
      online: merged.filter((device) => device.online).length,
      managed: merged.filter((device) => device.managed).length,
      newCount: firstSeen?.devices.length ?? 0,
    }),
    [firstSeen, merged],
  );
  const todayMaximum = useMemo(
    () => Math.max(0, ...filtered.map((device) => device.todayIn + device.todayOut)),
    [filtered],
  );
  const stats = isLoading && !data ? (
    <Skeleton className="h-5 w-80 max-w-full" />
  ) : (
    <>
      <span>{summary.total} devices</span>
      <span aria-hidden>·</span>
      <span>{summary.online} online</span>
      <span aria-hidden>·</span>
      <span>{summary.managed} managed by Surge</span>
      {summary.newCount > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>{summary.newCount} new this week</span>
        </>
      )}
    </>
  );

  const openInspector = useCallback(
    (deviceId: string) => updateParams({ device: deviceId }),
    [updateParams],
  );
  const closeInspector = useCallback(() => updateParams({ device: undefined }), [updateParams]);

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortKey !== key) return "none";
    return key === "name" ? "ascending" : "descending";
  };

  return (
    <>
      <PageHeader title="Devices" sub="Every device on the network, live" stats={stats} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={view}
          options={[
            { value: "list", label: "List" },
            { value: "topology", label: "Topology" },
          ]}
          onChange={setView}
        />
        <Input
          className="min-w-56 flex-1 sm:max-w-80"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, IP, MAC"
        />
        {view === "list" && (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {filtered.length} device{filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {view === "list" ? (
        <DevicesList
          devices={filtered}
          isLoading={isLoading && !data}
          search={search}
          selectedId={selectedId}
          todayMaximum={todayMaximum}
          ariaSort={ariaSort}
          onSelect={openInspector}
          onSort={setSortKey}
        />
      ) : (
        <Card>
          {isLoading && !data ? (
            <Skeleton className="h-[380px] w-full" />
          ) : onlineDevices.length === 0 ? (
            <Empty
              message={search.trim() ? "No online devices match this search" : "No devices online"}
              hint={search.trim() ? "Try a different name, IP, or MAC" : undefined}
            />
          ) : (
            <>
              <TopologyGraph
                center={{ name: "Gateway" }}
                nodes={onlineDevices.map((device) => ({
                  id: device.id,
                  name: device.name,
                  rate: device.rateIn + device.rateOut,
                  online: device.online,
                }))}
                onSelect={openInspector}
              />
              <p className="text-muted-foreground mt-2 text-xs">
                Edge width = current rate · node dot color is stable per device
              </p>
            </>
          )}
        </Card>
      )}

      {selectedId && (
        <DeviceInspector
          deviceId={selectedId}
          summaryDevice={selected}
          onClose={closeInspector}
        />
      )}
    </>
  );
}

function DevicesList({
  devices,
  isLoading,
  search,
  selectedId,
  todayMaximum,
  ariaSort,
  onSelect,
  onSort,
}: {
  devices: MergedDevice[];
  isLoading: boolean;
  search: string;
  selectedId: string | null;
  todayMaximum: number;
  ariaSort: (key: SortKey) => "ascending" | "descending" | "none";
  onSelect: (deviceId: string) => void;
  onSort: (key: SortKey) => void;
}) {
  const [showIdle, setShowIdle] = useState(false);
  const active = devices.filter(
    (device) =>
      device.online || device.combinedRate > 0 || device.todayIn + device.todayOut > 0,
  );
  const idle = devices.filter(
    (device) =>
      !device.online && device.combinedRate === 0 && device.todayIn + device.todayOut === 0,
  );
  const queryActive = search.trim().length > 0;
  const visibleIdle = queryActive || showIdle;

  return (
    <Card flush>
      {isLoading ? (
        <DevicesListSkeleton />
      ) : devices.length === 0 ? (
        <Empty
          message={search.trim() ? "No devices match this search" : "No devices yet"}
          hint={
            search.trim()
              ? "Try a different name, IP, or MAC"
              : "Add a Surge source under Sources to light this up"
          }
        />
      ) : (
        <Table
          className="min-w-[880px]"
          containerClassName="max-h-[calc(100dvh-20rem)] overflow-y-auto"
        >
          <TableHead className="bg-card sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHeader className="px-4">Status</TableHeader>
              <TableHeader
                className="hover:text-foreground cursor-pointer"
                aria-sort={ariaSort("name")}
                onClick={() => onSort("name")}
              >
                Device
              </TableHeader>
              <TableHeader>IPs</TableHeader>
              <TableHeader
                className="hover:text-foreground cursor-pointer text-right"
                aria-sort={ariaSort("rate")}
                onClick={() => onSort("rate")}
              >
                Down
              </TableHeader>
              <TableHeader
                className="hover:text-foreground cursor-pointer text-right"
                aria-sort={ariaSort("rate")}
                onClick={() => onSort("rate")}
              >
                Up
              </TableHeader>
              <TableHeader
                className="hover:text-foreground cursor-pointer text-right"
                aria-sort={ariaSort("today")}
                onClick={() => onSort("today")}
              >
                Today
              </TableHeader>
              <TableHeader
                className="hover:text-foreground cursor-pointer px-4"
                aria-sort={ariaSort("lastSeen")}
                onClick={() => onSort("lastSeen")}
              >
                Last seen
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {active.map((device) => (
              <DeviceTableRow
                key={device.id}
                device={device}
                selectedId={selectedId}
                todayMaximum={todayMaximum}
                onSelect={onSelect}
              />
            ))}
            {!queryActive && idle.length > 0 && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <button
                    type="button"
                    className="border-border text-muted-foreground hover:bg-muted w-full border-t px-4 py-2.5 text-left text-xs"
                    onClick={() => setShowIdle((visible) => !visible)}
                  >
                    {showIdle ? "Hide" : "Show"} {idle.length} idle devices
                  </button>
                </TableCell>
              </TableRow>
            )}
            {visibleIdle &&
              idle.map((device) => (
                <DeviceTableRow
                  key={device.id}
                  device={device}
                  selectedId={selectedId}
                  todayMaximum={todayMaximum}
                  onSelect={onSelect}
                />
              ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function DeviceTableRow({
  device,
  selectedId,
  todayMaximum,
  onSelect,
}: {
  device: MergedDevice;
  selectedId: string | null;
  todayMaximum: number;
  onSelect: (deviceId: string) => void;
}) {
  const firstIp = device.ips[0];
  const extra = Math.max(0, device.ips.length - 1);
  const DeviceIcon = deviceIcon(device.iconId, device.name);

  return (
    <TableRow
      className={cn("hover:bg-muted cursor-pointer", selectedId === device.id && "bg-muted")}
      onClick={() => onSelect(device.id)}
    >
      <TableCell className="px-4">
        <StatusDot tone={device.online ? "ok" : "muted"} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className="bg-muted ring-border inline-flex size-7 shrink-0 items-center justify-center rounded-md ring-1">
            <DeviceIcon className="text-muted-foreground size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-foreground truncate font-medium">{device.name}</div>
            {!isHiddenMac(device.mac) && (
              <div className="text-muted-foreground font-mono text-2xs tabular-nums">
                {device.mac}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
        {firstIp ?? "None"}
        {extra > 0 && <span> +{extra}</span>}
      </TableCell>
      <TableCell className="text-foreground text-right font-mono text-xs tabular-nums">
        {formatRate(device.rateIn)}
      </TableCell>
      <TableCell className="text-foreground text-right font-mono text-xs tabular-nums">
        {formatRate(device.rateOut)}
      </TableCell>
      <TableCell
        className="text-muted-foreground font-mono text-xs tabular-nums"
        title={`↓ ${formatBytes(device.todayIn)} · ↑ ${formatBytes(device.todayOut)}`}
      >
        <div className="flex items-center justify-end gap-3">
          <SplitBar
            className="w-20 shrink-0"
            inValue={device.todayIn}
            outValue={device.todayOut}
            max={todayMaximum}
          />
          <span className="w-16 shrink-0 text-right">
            {formatBytes(device.todayIn + device.todayOut)}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground px-4 font-mono text-xs tabular-nums">
        {formatTimeAgo(device.lastSeenAt)}
      </TableCell>
    </TableRow>
  );
}

function DevicesListSkeleton() {
  return (
    <div className="space-y-3 py-1">
      <Skeleton className="h-5 w-full" />
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-7 shrink-0" />
          <Skeleton className="h-8 flex-1" />
        </div>
      ))}
    </div>
  );
}

function DeviceInspector({
  deviceId,
  summaryDevice,
  onClose,
}: {
  deviceId: string;
  summaryDevice?: MergedDevice;
  onClose: () => void;
}) {
  const router = useRouter();
  const live = useLive();
  const { minutes, rangeQuery, label, isCustom } = useTimeRange();
  const { data: detail, error, isLoading } = useQuery({
    queryKey: ["device-detail", deviceId, minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.deviceDetail(deviceId, rangeQuery),
    refetchInterval: 15000,
    retry: (failureCount, queryError) =>
      !(queryError instanceof ApiError && queryError.status === 404) && failureCount < 3,
  });
  const device = detail?.device ?? summaryDevice;
  const liveRate = live.deviceRates.get(deviceId);
  const rateIn = liveRate?.rateIn ?? device?.rateIn ?? 0;
  const rateOut = liveRate?.rateOut ?? device?.rateOut ?? 0;
  const rangeTo = rangeQuery.to ?? Date.now();
  const rangeFrom = rangeQuery.from ?? rangeTo - minutes * 60000;
  const sub = [!isHiddenMac(device?.mac) ? device?.mac : undefined, device?.vendor]
    .filter(Boolean)
    .join(" · ");
  const notFound = error instanceof ApiError && error.status === 404;
  const usageAvailable =
    detail?.series.some((point) => Math.abs(point.in) > 0 || Math.abs(point.out) > 0) ?? false;
  const policyTotal =
    detail?.policySplit.reduce((total, item) => total + Math.max(0, item.bytes), 0) ?? 0;

  return (
    <InspectorPanel
      open
      onClose={onClose}
      title={device?.name ?? "Device"}
      sub={sub || undefined}
      actions={
        <Link
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={flowsHref(deviceId)}
        >
          Flows
        </Link>
      }
    >
      {isLoading && !detail ? (
        <DeviceInspectorSkeleton />
      ) : notFound ? (
        <Empty message="Device not found" hint="It may have been removed from the network" />
      ) : !detail || !device ? (
        <Empty message="Device details unavailable" hint="Try again in a moment" />
      ) : (
        <>
          <InspectorSection title="Identity">
            <DetailList>
              <DetailRow label="IPs">
                <div className="min-w-0 space-y-0.5 font-mono tabular-nums">
                  {device.ips.length > 0
                    ? device.ips.map((ip) => <div key={ip}>{ip}</div>)
                    : "None"}
                </div>
              </DetailRow>
              <DetailRow label="First seen">
                <span className="font-mono tabular-nums">{formatTimeAgo(device.firstSeenAt)}</span>
              </DetailRow>
              <DetailRow label="Last seen">
                <span className="font-mono tabular-nums">{formatTimeAgo(device.lastSeenAt)}</span>
              </DetailRow>
              <DetailRow label="Managed">
                {device.managed ? <Badge tone="primary">Surge</Badge> : <span>Not managed</span>}
              </DetailRow>
              {device.iconId && (
                <DetailRow label="Icon id">
                  <span className="text-muted-foreground block min-w-0 truncate font-mono">
                    {device.iconId}
                  </span>
                </DetailRow>
              )}
            </DetailList>
          </InspectorSection>

          <InspectorSection title="Now">
            <div className="bg-muted/40 ring-border grid grid-cols-2 gap-4 rounded-lg p-3 ring-1">
              <Stat
                label="Down"
                value={<span className="font-mono">{formatRate(rateIn)}</span>}
                sub={
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    Today <ArrowDown className="size-3 shrink-0" /> {formatBytes(device.todayIn)}
                  </span>
                }
              />
              <Stat
                label="Up"
                value={<span className="font-mono">{formatRate(rateOut)}</span>}
                sub={
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    Today <ArrowUp className="size-3 shrink-0" /> {formatBytes(device.todayOut)}
                  </span>
                }
              />
            </div>
          </InspectorSection>

          <InspectorSection title="Usage">
            {usageAvailable ? (
              <MirroredAreaChart height={140} points={detail.series} />
            ) : (
              <InspectorEmpty message="No usage in this range" />
            )}
          </InspectorSection>

          <InspectorSection title="Presence">
            <PresenceRibbon
              intervals={detail.presence}
              from={rangeFrom}
              to={rangeTo}
            />
            {detail.presence.length === 0 && <div className="bg-muted h-1.5 rounded-full" />}
            <p className="text-muted-foreground mt-2 text-2xs">
              online periods · {isCustom ? label : `last ${label}`}
            </p>
          </InspectorSection>

          <InspectorSection title="Top hosts">
            {detail.topHosts.length > 0 ? (
              <RowList
                bars
                mono
                items={detail.topHosts.slice(0, 8).map((row) => ({
                  key: row.key,
                  label: row.key,
                  value: row.bytesIn + row.bytesOut,
                  sub: `${row.flows} flow${row.flows === 1 ? "" : "s"}`,
                }))}
                onSelect={(host) => router.push(flowsHref(deviceId, { search: host }))}
              />
            ) : (
              <InspectorEmpty message="No hosts in this range" />
            )}
          </InspectorSection>

          <InspectorSection title="Countries">
            {detail.topCountries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {detail.topCountries.slice(0, 6).map((row) => (
                  <span
                    key={row.key}
                    className="bg-muted/50 ring-border inline-flex items-center gap-2 rounded-md px-2 py-1 ring-1"
                  >
                    <CountryChip code={row.key} />
                    <span className="text-muted-foreground font-mono text-2xs tabular-nums">
                      {formatBytes(row.bytesIn + row.bytesOut)}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <InspectorEmpty message="No countries in this range" />
            )}
          </InspectorSection>

          <InspectorSection title="Processes">
            {detail.topProcesses.length > 0 ? (
              <RowList
                bars
                mono
                items={detail.topProcesses.slice(0, 6).map((row) => ({
                  key: row.key,
                  label: row.key,
                  value: row.bytesIn + row.bytesOut,
                  sub: `${row.flows} flow${row.flows === 1 ? "" : "s"}`,
                }))}
                onSelect={(process) => router.push(flowsHref(deviceId, { process }))}
              />
            ) : (
              <InspectorEmpty message="No processes in this range" />
            )}
          </InspectorSection>

          <InspectorSection title="Ports">
            {detail.topPorts.length > 0 ? (
              <div className="space-y-2">
                {detail.topPorts.slice(0, 6).map((row) => {
                  const service = serviceForPort(Number(row.key));
                  return (
                    <div key={row.key} className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums">:{row.key}</span>
                      {service && <span className="text-muted-foreground text-2xs">{service}</span>}
                      <span className="text-muted-foreground ms-auto font-mono text-xs tabular-nums">
                        {formatBytes(row.bytesIn + row.bytesOut)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <InspectorEmpty message="No ports in this range" />
            )}
          </InspectorSection>

          <InspectorSection title="Policies">
            {detail.policySplit.length > 0 && policyTotal > 0 ? (
              <>
                <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
                  {detail.policySplit.map((item) => (
                    <span
                      key={item.policy}
                      className="h-full shrink-0"
                      style={{
                        backgroundColor: policyColor(item.policy),
                        width: `${(Math.max(0, item.bytes) / policyTotal) * 100}%`,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {detail.policySplit.map((item) => (
                    <div key={item.policy} className="flex min-w-0 items-center gap-2 text-xs">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: policyColor(item.policy) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.policy}</span>
                      <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                        {formatBytes(item.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <InspectorEmpty message="No policies in this range" />
            )}
          </InspectorSection>

          <InspectorSection
            title="Recent flows"
            action={<ArrowLink href={flowsHref(deviceId)}>All flows</ArrowLink>}
          >
            {detail.recentFlows.length > 0 ? (
              <div className="divide-border divide-y">
                {detail.recentFlows.slice(0, 10).map((flow) => (
                  <div key={flow.id} className="flex items-center gap-2 py-2 first:pt-0">
                    <span className="text-muted-foreground w-14 shrink-0 font-mono text-2xs tabular-nums">
                      {formatTime(flow.ts)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {flow.dst.host || flow.dst.ip || "Unknown"}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {formatBytes(flow.bytesIn + flow.bytesOut)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <InspectorEmpty message="No recent flows" />
            )}
          </InspectorSection>
        </>
      )}
    </InspectorPanel>
  );
}

function DeviceInspectorSkeleton() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-[140px] w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

function InspectorEmpty({ message }: { message: string }) {
  return (
    <div className="-my-4">
      <Empty message={message} />
    </div>
  );
}
