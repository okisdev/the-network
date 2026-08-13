"use client";

import { useQuery } from "@tanstack/react-query";
import type { DnsLogEntry, SystemLogEntry } from "@the-network/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useLive } from "@/contexts/live-provider";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";

const DNS_COLS = "grid grid-cols-[72px_1.4fr_1.2fr_80px] gap-2 items-center";
const SYS_COLS = "grid grid-cols-[72px_72px_100px_1fr] gap-2 items-center";

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
    <>
      <PageHeader title="Logs" sub="DNS lookups and system activity" />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "dns" | "system")}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
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

        <Card className="overflow-hidden">
          <TabsPanel value="dns">
            <DnsTable search={dnsSearchTrimmed} onCountChange={setDnsCount} />
          </TabsPanel>
          <TabsPanel value="system">
            <SystemTable
              level={level === "all" ? "" : level}
              search={debouncedSysSearch.trim()}
            />
          </TabsPanel>
        </Card>
      </Tabs>
    </>
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
        hint={isLoading ? "Loading…" : "DNS polling starts once the backend lands"}
      />
    );
  }

  return (
    <div className="-mx-4 -my-4 max-h-[calc(100vh-260px)] overflow-auto">
      <div
        className={`${DNS_COLS} sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground`}
      >
        <span>Time</span>
        <span>Query</span>
        <span>Answers</span>
        <span className="text-right">RTT</span>
      </div>
      {rows.map((entry) => {
        const extra = entry.answers.length > 1 ? entry.answers.length - 1 : 0;
        const first = entry.answers[0];
        return (
          <div
            key={entry.id}
            className={`${DNS_COLS} border-b border-border px-3 py-2 text-[12px]`}
          >
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatTime(entry.ts)}
            </span>
            <span
              className="truncate font-mono font-medium text-foreground"
              title={entry.qname}
            >
              {entry.qname}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              {first != null ? (
                <>
                  <span className="truncate font-mono text-muted-foreground">{first}</span>
                  {extra > 0 && <Badge tone="muted">+{extra}</Badge>}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            <span
              className={`text-right font-mono tabular-nums ${
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
}: {
  level: "" | "info" | "warn" | "error";
  search: string;
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

  if (entries.length === 0) {
    return (
      <Empty
        message="No system logs yet"
        hint={
          isLoading
            ? "Loading…"
            : "System activity will appear once the backend lands"
        }
      />
    );
  }

  return (
    <div className="-mx-4 -my-4 max-h-[calc(100vh-260px)] overflow-auto">
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
          className={`${SYS_COLS} border-b border-border px-3 py-2 text-[12px]`}
        >
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatTime(entry.ts)}
          </span>
          <span>
            <Badge tone={levelTone(entry.level)}>{entry.level}</Badge>
          </span>
          <span
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={entry.scope}
          >
            {entry.scope}
          </span>
          <span className="break-words text-[13px] text-muted-foreground">
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
