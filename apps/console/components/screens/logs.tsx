"use client";

import { useQuery } from "@tanstack/react-query";
import type { DnsLogEntry, SystemLogEntry } from "@the-network/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DonutChart } from "@/components/charts/donut";
import { MiniBars } from "@/components/charts/mini-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RowList } from "@/components/ui/row-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useLive } from "@/contexts/live-provider";
import { useTimeRange } from "@/contexts/timerange-provider";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";

const DNS_COLS = "grid grid-cols-[72px_1.3fr_1fr_1fr_70px_80px] gap-2 items-center";
const SYS_COLS = "grid grid-cols-[72px_72px_100px_1fr] gap-2 items-center";
const SYS_LEVELS = ["info", "warn", "error"] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function levelTone(level: SystemLogEntry["level"]): "muted" | "warn" | "destructive" {
  if (level === "error") return "destructive";
  if (level === "warn") return "warn";
  return "muted";
}

export function LogsScreen() {
  const [tab, setTab] = useState<"dns" | "system">("dns");
  const [dnsSearch, setDnsSearch] = useState("");
  const [sysSearch, setSysSearch] = useState("");
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [dnsCount, setDnsCount] = useState(0);
  const debouncedDnsSearch = useDebounced(dnsSearch, 300);
  const debouncedSysSearch = useDebounced(sysSearch, 300);
  const dnsSearchTrimmed = debouncedDnsSearch.trim();

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[32rem] flex-col">
      <PageHeader title="Logs" sub="DNS lookups and system activity" />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "dns" | "system")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <TabsList>
            <TabsTab value="dns">DNS</TabsTab>
            <TabsTab value="system">System</TabsTab>
          </TabsList>

          {tab === "dns" ? (
            <>
              <Input
                type="search"
                value={dnsSearch}
                onChange={(e) => setDnsSearch(e.target.value)}
                placeholder="Query name"
                className="min-w-[180px]"
              />
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {dnsCount} lookup{dnsCount === 1 ? "" : "s"}
                {dnsSearchTrimmed ? "" : " · live"}
              </span>
            </>
          ) : (
            <>
              <Select
                value={level}
                onValueChange={(value) =>
                  setLevel((value as "all" | "info" | "warn" | "error") ?? "all")
                }
              >
                <SelectTrigger className="min-w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="search"
                value={sysSearch}
                onChange={(e) => setSysSearch(e.target.value)}
                placeholder="Scope or message"
                className="min-w-[180px]"
              />
            </>
          )}
        </div>

        <TabsPanel value="dns" className="mb-4 shrink-0">
          <DnsAnalytics />
        </TabsPanel>

        <Card fill flush className="min-h-0 flex-1">
          <TabsPanel value="dns" className="h-full">
            <DnsTable search={dnsSearchTrimmed} onCountChange={setDnsCount} />
          </TabsPanel>
          <TabsPanel value="system" className="h-full">
            <SystemTable
              level={level === "all" ? "" : level}
              search={debouncedSysSearch.trim()}
              onLevelChange={setLevel}
            />
          </TabsPanel>
        </Card>
      </Tabs>
    </div>
  );
}

function DnsAnalytics() {
  const { minutes, rangeQuery } = useTimeRange();
  const { data, isLoading } = useQuery({
    queryKey: ["dnsSummary", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.dnsSummary(rangeQuery),
    refetchInterval: 30000,
  });

  const queryTotal = data?.series.reduce((sum, point) => sum + point.count, 0) ?? 0;
  const answered = data?.answered ?? 0;
  const unanswered = data?.unanswered ?? 0;
  const answeredTotal = answered + unanswered;
  const answeredPct =
    answeredTotal > 0 ? `${Math.round((answered / answeredTotal) * 100)}%` : "—";
  const resolvers = (data?.resolvers ?? []).slice(0, 5);

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="col-span-12 sm:col-span-6 xl:col-span-3">
            <Skeleton className="h-28 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card fill title="Queries" className="col-span-12 sm:col-span-6 xl:col-span-3">
        <div className="font-mono text-xl font-semibold tabular-nums">
          {queryTotal.toLocaleString()}
        </div>
        <div className="mt-3 min-h-7 flex-1">
          <Sparkline
            className="h-full"
            points={(data?.series ?? []).map((point) => point.count)}
          />
        </div>
      </Card>
      <Card fill title="Latency" className="col-span-12 sm:col-span-6 xl:col-span-3">
        <div className="flex min-h-24 flex-1 flex-col">
          <MiniBars
            fill
            data={(data?.rttBuckets ?? []).map((bucket) => ({
              label: bucket.label,
              count: bucket.count,
            }))}
          />
        </div>
      </Card>
      <Card fill title="Answered" className="col-span-12 sm:col-span-6 xl:col-span-3">
        <div className="flex flex-1 items-center justify-center gap-4">
          <DonutChart
            size={120}
            slices={[
              {
                key: "answered",
                label: "Answered",
                value: answered,
                color: "var(--color-ok)",
              },
              {
                key: "unanswered",
                label: "No answer",
                value: unanswered,
                color: "var(--color-muted-foreground)",
              },
            ]}
            centerLabel={answeredPct}
          />
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--color-ok)" }}
              />
              <span className="text-muted-foreground">Answered</span>
              <span className="font-mono tabular-nums">{answered.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--color-muted-foreground)" }}
              />
              <span className="text-muted-foreground">No answer</span>
              <span className="font-mono tabular-nums">{unanswered.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </Card>
      <Card fill title="Resolvers" className="col-span-12 sm:col-span-6 xl:col-span-3">
        {resolvers.length === 0 ? (
          <Empty message="No resolver data yet" />
        ) : (
          <RowList
            mono
            format={(count) => count.toLocaleString()}
            items={resolvers.map((resolver) => ({
              key: resolver.server,
              label: resolver.server.replace(/^https:\/\//, ""),
              title: resolver.server,
              value: resolver.count,
            }))}
          />
        )}
      </Card>
    </div>
  );
}

function DnsTable({
  search,
  onCountChange,
}: {
  search: string;
  onCountChange: (count: number) => void;
}) {
  const live = useLive();
  const searchActive = Boolean(search);
  const [entries, setEntries] = useState<DnsLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    data: firstPage,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ["dnsLogs", search || null],
    queryFn: () => api.dnsLogs({ search: search || undefined, limit: 100 }),
    refetchInterval: 10000,
    retry: false,
  });

  useEffect(() => {
    if (firstPage) {
      setEntries(firstPage.entries);
      setNextCursor(firstPage.nextCursor);
      return;
    }
    if (isError) {
      setEntries([]);
      setNextCursor(undefined);
    }
  }, [firstPage, isError, search]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.dnsLogs({
        search: search || undefined,
        limit: 100,
        cursor: nextCursor,
      });
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const added = page.entries.filter((e) => !seen.has(e.id));
        return [...prev, ...added];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setNextCursor(undefined);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, search]);

  const rows = useMemo(() => {
    if (searchActive) {
      return entries.slice(0, 300);
    }
    const map = new Map<string, DnsLogEntry>();
    for (const e of live.dns) map.set(e.id, e);
    for (const e of entries) {
      if (!map.has(e.id)) map.set(e.id, e);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts).slice(0, 300);
  }, [searchActive, live.dns, entries]);

  useEffect(() => {
    onCountChange(rows.length);
  }, [rows.length, onCountChange]);

  if (rows.length === 0) {
    return (
      <Empty
        message="No DNS lookups yet"
        hint={isLoading ? "Loading…" : "DNS lookups will appear once a source is connected"}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div
        className={`${DNS_COLS} sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground`}
      >
        <span>Time</span>
        <span>Query</span>
        <span>Answers</span>
        <span>Resolver</span>
        <span>Source</span>
        <span className="text-right">RTT</span>
      </div>
      {rows.map((entry) => {
        const extra = entry.answers.length > 1 ? entry.answers.length - 1 : 0;
        const first = entry.answers[0];
        return (
          <div
            key={entry.id}
            className={`${DNS_COLS} border-b border-border px-3 py-2 text-xs`}
          >
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatTime(entry.ts)}
            </span>
            <span
              className="truncate font-mono font-medium text-foreground"
              title={entry.qname}
            >
              {entry.qname}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
              {first != null ? (
                <>
                  <span className="truncate text-muted-foreground">{first}</span>
                  {extra > 0 && (
                    <Badge tone="muted" className="px-1.5 py-0 text-2xs">
                      +{extra}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            {entry.server ? (
              <span
                className="truncate font-mono text-xs text-muted-foreground"
                title={entry.server}
              >
                {entry.server}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <span>
              {entry.source === "cache" ? (
                <Badge tone="muted">cache</Badge>
              ) : entry.source === "server" ? (
                <Badge tone="primary">server</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            <span
              className={`text-right font-mono text-xs tabular-nums ${
                entry.rttMs != null ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {entry.rttMs != null ? `${entry.rttMs.toFixed(0)} ms` : "—"}
            </span>
          </div>
        );
      })}
      {nextCursor && (
        <div className="flex justify-center border-t border-border py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore || isFetching}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SystemTable({
  level,
  search,
  onLevelChange,
}: {
  level: "" | "info" | "warn" | "error";
  search: string;
  onLevelChange: (level: "all" | "info" | "warn" | "error") => void;
}) {
  const [entries, setEntries] = useState<SystemLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    data: firstPage,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ["systemLogs", level || null, search || null],
    queryFn: () =>
      api.systemLogs({
        level: level || undefined,
        search: search || undefined,
        limit: 100,
      }),
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    if (firstPage) {
      setEntries(firstPage.entries);
      setNextCursor(firstPage.nextCursor);
    } else if (isError) {
      setEntries([]);
      setNextCursor(undefined);
    }
  }, [firstPage, isError, level, search]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.systemLogs({
        level: level || undefined,
        search: search || undefined,
        limit: 100,
        cursor: nextCursor,
      });
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const added = page.entries.filter((e) => !seen.has(e.id));
        return [...prev, ...added];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setNextCursor(undefined);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, level, search]);

  const levelCounts = useMemo(() => {
    const counts = { info: 0, warn: 0, error: 0 };
    for (const entry of entries) {
      if (entry.level === "info" || entry.level === "warn" || entry.level === "error") {
        counts[entry.level] += 1;
      }
    }
    return counts;
  }, [entries]);

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-3">
      <button
        type="button"
        className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => onLevelChange("all")}
      >
        <Badge tone="muted">all {entries.length}</Badge>
      </button>
      {SYS_LEVELS.map((lvl) => (
        <button
          key={lvl}
          type="button"
          className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => onLevelChange(lvl)}
        >
          <Badge tone={levelTone(lvl)}>
            {lvl} {levelCounts[lvl]}
          </Badge>
        </button>
      ))}
    </div>
  );

  if (entries.length === 0) {
    return (
      <>
        {chips}
        <Empty
          message="No system logs yet"
          hint={
            isLoading
              ? "Loading…"
              : "System activity will appear once the hub starts logging"
          }
        />
      </>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {chips}
      <div
        className={`${SYS_COLS} sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground`}
      >
        <span>Time</span>
        <span>Level</span>
        <span>Scope</span>
        <span>Message</span>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`${SYS_COLS} border-b border-border px-3 py-2`}
        >
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTime(entry.ts)}
          </span>
          <span>
            <Badge tone={levelTone(entry.level)}>{entry.level}</Badge>
          </span>
          <span
            className="truncate font-mono text-2xs text-muted-foreground"
            title={entry.scope}
          >
            {entry.scope}
          </span>
          <span className="font-sans break-words text-sm text-muted-foreground">
            {entry.message}
          </span>
        </div>
      ))}
      {nextCursor && (
        <div className="flex justify-center border-t border-border py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore || isFetching}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
