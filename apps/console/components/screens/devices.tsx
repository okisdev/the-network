"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeviceDto, FlowDto } from "@the-network/schema";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
import { api } from "@/lib/api";
import { formatBytes, formatRate, formatTime, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

function isHiddenMac(mac?: string | null): boolean {
  if (!mac) return true;
  return mac.startsWith("gateway:") || mac.startsWith("unattributed:");
}

type SortKey = "rate" | "name" | "today" | "lastSeen";

type MergedDevice = DeviceDto & { combinedRate: number };

function mergeDevices(
  devices: DeviceDto[] | undefined,
  rates: ReadonlyMap<string, { rateIn: number; rateOut: number; online: boolean }>,
): MergedDevice[] {
  if (!devices) return [];
  return devices.map((d) => {
    const live = rates.get(d.id);
    const rateIn = live?.rateIn ?? d.rateIn;
    const rateOut = live?.rateOut ?? d.rateOut;
    const online = live?.online ?? d.online;
    return {
      ...d,
      rateIn,
      rateOut,
      online,
      combinedRate: rateIn + rateOut,
    };
  });
}

function policyTone(policy?: string): "destructive" | "muted" | "primary" {
  if (!policy) return "muted";
  const upper = policy.toUpperCase();
  if (upper === "REJECT" || upper.includes("REJECT")) return "destructive";
  if (upper === "DIRECT" || upper.includes("DIRECT")) return "muted";
  return "primary";
}

export function DevicesScreen() {
  const live = useLive();
  const { data, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: api.devices,
    refetchInterval: 15000,
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const merged = useMemo(() => mergeDevices(data, live.deviceRates), [data, live.deviceRates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = merged;
    if (q) {
      list = list.filter((d) => {
        if (d.name.toLowerCase().includes(q)) return true;
        if (d.mac?.toLowerCase().includes(q)) return true;
        return d.ips.some((ip) => ip.toLowerCase().includes(q));
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
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
    return sorted;
  }, [merged, search, sortKey]);

  const selected = useMemo(
    () => (selectedId ? (merged.find((d) => d.id === selectedId) ?? null) : null),
    [merged, selectedId],
  );

  const closePanel = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, closePanel]);

  const cycleSort = (key: SortKey) => {
    setSortKey(key);
  };

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortKey !== key) return "none";
    if (key === "name") return "ascending";
    return "descending";
  };

  return (
    <>
      <PageHeader title="Devices" sub="Every device on the network, live" />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, IP, MAC"
        />
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {filtered.length} device{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <Card className="overflow-hidden">
        {isLoading && !data ? (
          <Empty message="Loading devices" />
        ) : filtered.length === 0 ? (
          <Empty
            message="No devices yet"
            hint="Add a Surge source under Sources to light this up"
          />
        ) : (
          <div className="-m-4">
            <Table className="min-w-[720px]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeader className="px-4">Status</TableHeader>
                  <TableHeader
                    className="hover:text-foreground cursor-pointer"
                    aria-sort={ariaSort("name")}
                    onClick={() => cycleSort("name")}
                  >
                    Device
                  </TableHeader>
                  <TableHeader>IPs</TableHeader>
                  <TableHeader
                    className="hover:text-foreground cursor-pointer text-right"
                    aria-sort={ariaSort("rate")}
                    onClick={() => cycleSort("rate")}
                  >
                    Down
                  </TableHeader>
                  <TableHeader
                    className="hover:text-foreground cursor-pointer text-right"
                    aria-sort={ariaSort("rate")}
                    onClick={() => cycleSort("rate")}
                  >
                    Up
                  </TableHeader>
                  <TableHeader
                    className="hover:text-foreground cursor-pointer text-right"
                    aria-sort={ariaSort("today")}
                    onClick={() => cycleSort("today")}
                  >
                    Today
                  </TableHeader>
                  <TableHeader
                    className="hover:text-foreground cursor-pointer px-4"
                    aria-sort={ariaSort("lastSeen")}
                    onClick={() => cycleSort("lastSeen")}
                  >
                    Last seen
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((d) => {
                  const firstIp = d.ips[0];
                  const extra = d.ips.length > 1 ? d.ips.length - 1 : 0;
                  const initial = (d.name.trim().charAt(0) || "?").toUpperCase();
                  return (
                    <TableRow
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={cn(
                        "hover:bg-muted cursor-pointer",
                        selectedId === d.id && "bg-muted",
                      )}
                    >
                      <TableCell className="px-4">
                        <StatusDot tone={d.online ? "ok" : "muted"} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="bg-muted text-muted-foreground ring-border inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1">
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <div className="text-foreground truncate font-medium">{d.name}</div>
                            {!isHiddenMac(d.mac) && (
                              <div className="text-muted-foreground font-mono text-[11px]">
                                {d.mac}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                        {firstIp ?? "—"}
                        {extra > 0 && (
                          <span className="text-muted-foreground"> +{extra}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground text-right font-mono text-xs tabular-nums">
                        {formatRate(d.rateIn)}
                      </TableCell>
                      <TableCell className="text-foreground text-right font-mono text-xs tabular-nums">
                        {formatRate(d.rateOut)}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground text-right font-mono text-xs tabular-nums"
                        title={`↓ ${formatBytes(d.todayIn)} · ↑ ${formatBytes(d.todayOut)}`}
                      >
                        {formatBytes(d.todayIn + d.todayOut)}
                      </TableCell>
                      <TableCell className="text-muted-foreground px-4 font-mono text-xs">
                        {formatTimeAgo(d.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {selected && (
        <DeviceDetailPanel device={selected} liveFlows={live.flows} onClose={closePanel} />
      )}
    </>
  );
}

function DeviceDetailPanel({
  device,
  liveFlows,
  onClose,
}: {
  device: MergedDevice;
  liveFlows: FlowDto[];
  onClose: () => void;
}) {
  const liveDeviceFlows = useMemo(
    () => liveFlows.filter((f) => f.deviceId === device.id).slice(0, 20),
    [liveFlows, device.id],
  );

  const needFetch = liveDeviceFlows.length === 0;
  const { data: remote } = useQuery({
    queryKey: ["flows", "device", device.id],
    queryFn: () => api.flows({ deviceId: device.id, limit: 20 }),
    enabled: true,
  });

  const flows = needFetch ? (remote?.flows ?? []) : liveDeviceFlows;
  const initial = (device.name.trim().charAt(0) || "?").toUpperCase();

  return (
    <>
      <button
        type="button"
        aria-label="Close device detail"
        className="bg-background/60 fixed inset-0 z-20"
        onClick={onClose}
      />
      <aside className="bg-popover ring-border fixed inset-y-0 right-0 z-20 flex w-96 flex-col shadow-xl ring-1">
        <div className="border-border flex items-start justify-between gap-3 border-b px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-muted text-muted-foreground ring-border inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold ring-1">
              {initial}
            </span>
            <div className="min-w-0">
              <h2 className="text-foreground truncate text-base font-semibold">{device.name}</h2>
              {!isHiddenMac(device.mac) && (
                <p className="text-muted-foreground font-mono text-[11px]">{device.mac}</p>
              )}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4 space-y-2">
            {device.ips.length > 0 && (
              <ul className="space-y-0.5">
                {device.ips.map((ip) => (
                  <li key={ip} className="text-muted-foreground font-mono text-xs tabular-nums">
                    {ip}
                  </li>
                ))}
              </ul>
            )}
            {device.managed && <Badge tone="primary">Managed by Surge</Badge>}
            <div className="text-muted-foreground flex flex-wrap gap-3 font-mono text-[11px]">
              <span>First {formatTimeAgo(device.firstSeenAt)}</span>
              <span>Last {formatTimeAgo(device.lastSeenAt)}</span>
            </div>
          </div>

          <div className="bg-card ring-border mb-5 grid grid-cols-2 gap-4 rounded-xl p-3 ring-1">
            <Stat label="Down" value={formatRate(device.rateIn)} />
            <Stat label="Up" value={formatRate(device.rateOut)} />
          </div>

          <h3 className="text-muted-foreground mb-2 text-xs font-medium">Recent flows</h3>
          {flows.length === 0 ? (
            <p className="text-muted-foreground text-xs">No recent flows</p>
          ) : (
            <ul className="bg-card ring-border divide-border divide-y rounded-xl ring-1">
              {flows.map((f) => {
                const dest = f.dst.host || f.dst.ip || "—";
                const port = f.dst.port != null ? `:${f.dst.port}` : "";
                return (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="text-muted-foreground w-14 shrink-0 font-mono tabular-nums">
                      {formatTime(f.ts)}
                    </span>
                    <span className="text-foreground min-w-0 flex-1 truncate">
                      {dest}
                      {port && <span className="text-muted-foreground">{port}</span>}
                    </span>
                    {f.policy && (
                      <Badge tone={policyTone(f.policy)} className="max-w-36">
                        <span className="min-w-0 truncate">{f.policy}</span>
                      </Badge>
                    )}
                    <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                      {formatBytes(f.bytesIn + f.bytesOut)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
