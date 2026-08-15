"use client";

import { useQuery } from "@tanstack/react-query";
import type { DnsLogEntry, SystemLogEntry } from "@the-network/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DonutChart } from "@/components/charts/donut";
import { MiniBars } from "@/components/charts/mini-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { DetailList, DetailRow } from "@/components/ui/detail-list";
import { DomainFavicon } from "@/components/ui/domain-favicon";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
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
import { formatTime, formatTimeAgo } from "@/lib/format";
import { registrableDomain } from "@/lib/net-labels";

const DNS_COLS = "grid grid-cols-[72px_110px_1.2fr_1.1fr_0.9fr_64px_56px_64px] gap-2 items-center";
const SYS_COLS = "grid grid-cols-[72px_72px_100px_1fr] gap-2 items-center";
const SYS_LEVELS = ["info", "warn", "error"] as const;
const ALL = "all";

type DnsSourceFilter = "" | "cache" | "server";

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

function groupAnswersByNetwork(entry: DnsLogEntry): Array<{
  key: string;
  network?: string;
  answers: Array<{ value: string; country?: string }>;
}> {
  const groups = new Map<
    string,
    { key: string; network?: string; answers: Array<{ value: string; country?: string }> }
  >();
  entry.answers.forEach((value, index) => {
    const meta = entry.answersMeta?.[index];
    const network = meta?.asOrg
      ? meta.asn != null
        ? `${meta.asOrg} · AS${meta.asn}`
        : meta.asOrg
      : meta?.asn != null
        ? `AS${meta.asn}`
        : undefined;
    const key = network ?? "unattributed";
    let group = groups.get(key);
    if (!group) {
      group = { key, ...(network === undefined ? {} : { network }), answers: [] };
      groups.set(key, group);
    }
    group.answers.push({
      value,
      ...(meta?.country === undefined ? {} : { country: meta.country }),
    });
  });
  return [...groups.values()];
}

function resolverLabel(server: string): string {
  return server.replace(/^https:\/\//, "");
}

function formatTtl(expiresAt?: number): string | undefined {
  if (expiresAt == null) return undefined;
  const remaining = expiresAt - Date.now();
  if (remaining < 0) return "expired";
  if (remaining < 60_000) return `${Math.round(remaining / 1000)}s`;
  if (remaining < 3_600_000) return `${Math.round(remaining / 60_000)}m`;
  return `${Math.round(remaining / 3_600_000)}h`;
}

function DnsSource({ source }: { source?: DnsLogEntry["source"] }) {
  if (source === "cache") return <Badge tone="muted">cache</Badge>;
  if (source === "server") return <Badge tone="primary">server</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

export function LogsScreen() {
  const { minutes, rangeQuery } = useTimeRange();
  const [tab, setTab] = useState<"dns" | "system">("dns");
  const [dnsSearch, setDnsSearch] = useState("");
  const [dnsSource, setDnsSource] = useState<DnsSourceFilter>("");
  const [dnsServer, setDnsServer] = useState("");
  const [dnsUnanswered, setDnsUnanswered] = useState(false);
  const [sysSearch, setSysSearch] = useState("");
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [dnsCount, setDnsCount] = useState(0);
  const debouncedDnsSearch = useDebounced(dnsSearch, 300);
  const debouncedSysSearch = useDebounced(sysSearch, 300);
  const dnsSearchTrimmed = debouncedDnsSearch.trim();
  const filterActive = Boolean(dnsSearchTrimmed || dnsSource || dnsServer || dnsUnanswered);
  const { data: dnsSummary } = useQuery({
    queryKey: ["dnsSummary", minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.dnsSummary(rangeQuery),
    refetchInterval: 30000,
  });

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
                aria-label="Search DNS queries"
                placeholder="Query name"
                className="min-w-[180px]"
              />
              <Select
                value={dnsSource || ALL}
                onValueChange={(value) =>
                  setDnsSource(value === "cache" || value === "server" ? value : "")
                }
              >
                <SelectTrigger aria-label="Filter by source" className="min-w-[120px]">
                  <SelectValue>
                    {dnsSource === "cache"
                      ? "Cache"
                      : dnsSource === "server"
                        ? "Server"
                        : "All sources"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sources</SelectItem>
                  <SelectItem value="cache">Cache</SelectItem>
                  <SelectItem value="server">Server</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={dnsServer || ALL}
                onValueChange={(value) => setDnsServer(!value || value === ALL ? "" : value)}
              >
                <SelectTrigger
                  aria-label="Filter by resolver"
                  title={dnsServer || undefined}
                  className="min-w-[160px]"
                >
                  <SelectValue>{dnsServer ? resolverLabel(dnsServer) : "All resolvers"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All resolvers</SelectItem>
                  {(dnsSummary?.resolvers ?? []).map((resolver) => (
                    <SelectItem key={resolver.server} value={resolver.server} title={resolver.server}>
                      {resolverLabel(resolver.server)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={dnsUnanswered}
                className={dnsUnanswered ? "bg-muted text-foreground" : undefined}
                onClick={() => setDnsUnanswered((value) => !value)}
              >
                Unanswered
              </Button>
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {dnsCount} lookup{dnsCount === 1 ? "" : "s"}
                {filterActive ? "" : " · live"}
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
            <DnsTable
              search={dnsSearchTrimmed}
              source={dnsSource}
              server={dnsServer}
              unanswered={dnsUnanswered}
              onCountChange={setDnsCount}
            />
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
              valueSub:
                resolver.medianRttMs != null
                  ? `${Math.round(resolver.medianRttMs)} ms median`
                  : undefined,
            }))}
          />
        )}
      </Card>
    </div>
  );
}

function DnsTable({
  search,
  source,
  server,
  unanswered,
  onCountChange,
}: {
  search: string;
  source: DnsSourceFilter;
  server: string;
  unanswered: boolean;
  onCountChange: (count: number) => void;
}) {
  const live = useLive();
  const filterActive = Boolean(search || source || server || unanswered);
  const [entries, setEntries] = useState<DnsLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DnsLogEntry | null>(null);

  const {
    data: firstPage,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ["dnsLogs", search || null, source || null, server || null, unanswered],
    queryFn: () =>
      api.dnsLogs({
        search: search || undefined,
        source: source || undefined,
        server: server || undefined,
        unanswered,
        limit: 100,
      }),
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
  }, [firstPage, isError, search, source, server, unanswered]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.dnsLogs({
        search: search || undefined,
        source: source || undefined,
        server: server || undefined,
        unanswered,
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
  }, [nextCursor, loadingMore, search, source, server, unanswered]);

  const rows = useMemo(() => {
    if (filterActive) {
      return entries.slice(0, 300);
    }
    const map = new Map<string, DnsLogEntry>();
    for (const e of live.dns) map.set(e.id, e);
    for (const e of entries) {
      if (!map.has(e.id)) map.set(e.id, e);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts).slice(0, 300);
  }, [filterActive, live.dns, entries]);

  useEffect(() => {
    onCountChange(rows.length);
  }, [rows.length, onCountChange]);

  return (
    <>
      {rows.length === 0 ? (
        <Empty
          message="No DNS lookups yet"
          hint={isLoading ? "Loading…" : "DNS lookups will appear once a source is connected"}
        />
      ) : (
        <div className="h-full overflow-auto">
          <div
            className={`${DNS_COLS} sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground`}
          >
            <span>Time</span>
            <span>Device</span>
            <span>Query</span>
            <span>Answers</span>
            <span>Resolver</span>
            <span>Source</span>
            <span className="text-right">TTL</span>
            <span className="text-right">RTT</span>
          </div>
          {rows.map((entry) => {
            const extra = entry.answers.length > 1 ? entry.answers.length - 1 : 0;
            const first = entry.answers[0];
            const country = entry.answersMeta?.[0]?.country;
            const ttl = formatTtl(entry.expiresAt);
            const device = entry.deviceName ?? entry.inferredDevice?.name;
            const inferred = !entry.deviceName && entry.inferredDevice !== undefined;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedEntry(entry)}
                className={`${DNS_COLS} border-border hover:bg-muted focus-visible:ring-ring w-full border-b px-3 py-2 text-left text-xs transition-colors duration-150 focus-visible:z-[1] focus-visible:ring-2 focus-visible:outline-none`}
              >
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatTime(entry.ts)}
                </span>
                <span
                  className="truncate text-muted-foreground"
                  title={inferred ? "Inferred from flow timing" : device}
                >
                  {device ?? "—"}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 font-mono font-medium text-foreground">
                  <DomainFavicon domain={registrableDomain(entry.qname)} />
                  <span className="truncate" title={entry.qname}>
                    {entry.qname}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                  {first != null ? (
                    <>
                      <span className="truncate text-muted-foreground">{first}</span>
                      {country && <CountryChip short code={country} />}
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
                    {resolverLabel(entry.server)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span>
                  <DnsSource source={entry.source} />
                </span>
                <span className="text-right font-mono tabular-nums">
                  {ttl === "expired" ? (
                    <span className="text-muted-foreground text-2xs">expired</span>
                  ) : (
                    <span className={ttl ? "text-xs text-foreground" : "text-xs text-muted-foreground"}>
                      {ttl ?? "—"}
                    </span>
                  )}
                </span>
                <span
                  className={`text-right font-mono text-xs tabular-nums ${
                    entry.rttMs != null ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {entry.rttMs != null ? `${entry.rttMs.toFixed(0)} ms` : "—"}
                </span>
              </button>
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
      )}
      <DnsInspector entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </>
  );
}

function DnsInspector({ entry, onClose }: { entry: DnsLogEntry | null; onClose: () => void }) {
  const router = useRouter();
  const { minutes, rangeQuery } = useTimeRange();
  const qname = entry?.qname ?? "";
  const domain = registrableDomain(qname);
  const { data: activity } = useQuery({
    queryKey: ["dnsQname", qname, minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.dnsQname(qname, rangeQuery),
    enabled: Boolean(entry),
  });
  const { data: hostDetail, isLoading: hostDetailLoading } = useQuery({
    queryKey: ["hostDetail", domain, minutes, rangeQuery.from, rangeQuery.to],
    queryFn: () => api.hostDetail(domain, rangeQuery),
    enabled: Boolean(entry),
  });

  if (!entry) {
    return (
      <InspectorPanel open={false} onClose={onClose} title="DNS lookup">
        <span />
      </InspectorPanel>
    );
  }

  const firstCountry = entry.answersMeta?.[0]?.country;
  const ttl = formatTtl(entry.expiresAt);
  const requester = entry.deviceName
    ? { id: entry.deviceId, name: entry.deviceName, inferred: false }
    : entry.inferredDevice
      ? { ...entry.inferredDevice, inferred: true }
      : undefined;

  return (
    <InspectorPanel
      open
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <DomainFavicon domain={domain} />
          <span className="truncate" title={qname}>
            {qname}
          </span>
        </span>
      }
      sub={
        <span className="inline-flex items-center gap-1.5">
          <span>{domain}</span>
          {firstCountry && <CountryChip code={firstCountry} />}
        </span>
      }
    >
      <InspectorSection title="Answers">
        {entry.answers.length > 0 ? (
          <div className="space-y-3">
            {groupAnswersByNetwork(entry).map((group) => (
              <div key={group.key}>
                <div className="space-y-1">
                  {group.answers.map((answer, index) => (
                    <div
                      key={`${answer.value}-${index}`}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      <span className="shrink-0 font-mono text-xs">{answer.value}</span>
                      {answer.country && <CountryChip short code={answer.country} />}
                    </div>
                  ))}
                </div>
                {group.network && (
                  <p
                    className="text-muted-foreground text-2xs mt-1 truncate"
                    title={group.network}
                  >
                    {group.network}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">No answers</span>
        )}
      </InspectorSection>

      <InspectorSection title="Lookup">
        <DetailList>
          <DetailRow label="Resolver">
            {entry.server ? (
              <span className="block truncate font-mono text-xs" title={entry.server}>
                {resolverLabel(entry.server)}
              </span>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Source">
            <DnsSource source={entry.source} />
          </DetailRow>
          <DetailRow label="RTT">
            <span className="font-mono text-xs tabular-nums">
              {entry.rttMs != null ? `${entry.rttMs.toFixed(0)} ms` : "—"}
            </span>
          </DetailRow>
          <DetailRow label="TTL">
            <span className="font-mono text-xs tabular-nums">
              {entry.expiresAt != null ? `${formatTime(entry.expiresAt)} · ${ttl}` : "—"}
            </span>
          </DetailRow>
          <DetailRow label="Seen">
            <span className="font-mono text-xs tabular-nums">
              {formatTime(entry.ts)} · {formatTimeAgo(entry.ts)}
            </span>
          </DetailRow>
        </DetailList>
      </InspectorSection>

      <InspectorSection title="Requester">
        {requester?.id ? (
          <Link
            href={`/flows?device=${encodeURIComponent(requester.id)}`}
            className="hover:bg-muted focus-visible:ring-ring -mx-2 flex flex-wrap items-baseline gap-x-1.5 rounded-md px-2 py-1.5 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-sm">{requester.name}</span>
            {requester.inferred && (
              <span className="text-muted-foreground text-2xs">inferred from flow timing</span>
            )}
          </Link>
        ) : requester ? (
          <span className="text-muted-foreground text-xs">{requester.name}</span>
        ) : (
          <span className="text-muted-foreground text-xs">
            No matching flow within the correlation window
          </span>
        )}
      </InspectorSection>

      <InspectorSection title="Activity">
        <div className="font-mono text-xl font-semibold tabular-nums">
          {(activity?.total ?? 0).toLocaleString()}
        </div>
        <p className="text-muted-foreground text-xs">
          lookup{activity?.total === 1 ? "" : "s"} · observed after probe dedup
        </p>
        <div className="mt-3 h-20">
          <Sparkline className="h-full" points={(activity?.series ?? []).map((point) => point.count)} />
        </div>
        {(activity?.resolvers.length ?? 0) > 1 && (
          <RowList
            className="mt-3"
            mono
            format={(value) => value.toLocaleString()}
            items={(activity?.resolvers ?? []).map((resolver) => ({
              key: resolver.server,
              label: resolverLabel(resolver.server),
              title: resolver.server,
              value: resolver.count,
            }))}
          />
        )}
      </InspectorSection>

      <InspectorSection title="Devices">
        {hostDetail?.devices.length ? (
          <RowList
            bars
            mono
            items={hostDetail.devices.slice(0, 8).map((device) => ({
              key: device.key,
              label: device.label ?? device.key,
              value: device.bytesIn + device.bytesOut,
              sub: `${device.flows.toLocaleString()} flow${device.flows === 1 ? "" : "s"}`,
              href: `/flows?device=${encodeURIComponent(device.key)}&search=${encodeURIComponent(domain)}`,
            }))}
          />
        ) : (
          <span className="text-muted-foreground text-xs">
            {hostDetailLoading ? "Loading…" : "No flows for this domain in range"}
          </span>
        )}
      </InspectorSection>

      <InspectorSection title="Filter by">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push(`/flows?search=${encodeURIComponent(domain)}`)}
          >
            Flows
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/destinations?tab=domains&host=${encodeURIComponent(domain)}`)
            }
          >
            Destinations
          </Button>
        </div>
      </InspectorSection>
    </InspectorPanel>
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
