"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { InspectorPanel, InspectorSection } from "@/components/ui/inspector";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { policyColor } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { formatBytes, formatTimeAgo } from "@/lib/format";

type RulesInventory = Awaited<ReturnType<typeof api.rules>>;
type RuleGroup = RulesInventory["groups"][number];
type RuleList = RulesInventory["lists"][number];
type RuleCoverage = Awaited<ReturnType<typeof api.ruleCoverage>>;
type RuleCoverageEntry = RuleCoverage["entries"][number];

const VISIBLE_ENTRY_LIMIT = 80;

function coveragePercent(matched: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (matched / total) * 100));
}

function coverageColor(percent: number): string {
  if (percent >= 60) return "var(--color-ok)";
  if (percent >= 20) return "var(--color-warn)";
  return "var(--color-chart-6)";
}

function sortGroups(groups: RuleGroup[]): RuleGroup[] {
  return groups
    .map((group, order) => ({ group, order }))
    .sort((left, right) => {
      if (left.group.bytes === 0 && right.group.bytes === 0) return left.order - right.order;
      if (left.group.bytes === 0) return 1;
      if (right.group.bytes === 0) return -1;
      return right.group.bytes - left.group.bytes || left.order - right.order;
    })
    .map(({ group }) => group);
}

function sortLists(lists: RuleList[]): RuleList[] {
  return lists
    .map((list, order) => ({ list, order }))
    .sort(
      (left, right) =>
        coveragePercent(left.list.matched, left.list.entries) -
          coveragePercent(right.list.matched, right.list.entries) ||
        left.order - right.order,
    )
    .map(({ list }) => list);
}

function memberSummary(group: RuleGroup): string {
  return group.members
    .map((member) => (member.isGroup ? `◆ ${member.name}` : member.name))
    .join(" · ");
}

function RulesLoading() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title="Rule pipeline" className="col-span-12">
        <Skeleton className="h-72 w-full" />
      </Card>
      <Card title="Policy groups" className="col-span-12 xl:col-span-6">
        <Skeleton className="h-64 w-full" />
      </Card>
      <Card title="List coverage" className="col-span-12 xl:col-span-6">
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  );
}

function RulePipeline({ rules }: { rules: RulesInventory["rules"] }) {
  return (
    <Card
      flush
      title="Rule pipeline"
      note="Hits join the last 14 days of flows by rule identity"
      className="col-span-12"
    >
      {rules.length === 0 ? (
        <Empty message="No rules configured" />
      ) : (
        <Table className="min-w-[900px]" containerClassName="max-h-[32rem] overflow-y-auto">
          <TableHead className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHeader className="px-4">#</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Target</TableHeader>
              <TableHeader>Policy</TableHeader>
              <TableHeader className="text-right">Hits (14d)</TableHeader>
              <TableHeader className="text-right">Traffic</TableHeader>
              <TableHeader className="px-4">Last hit</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule) => {
              const target = rule.type.toUpperCase() === "FINAL" ? "—" : (rule.target ?? "—");
              return (
                <TableRow key={`${rule.index}:${rule.displayKey}`}>
                  <TableCell className="text-muted-foreground px-4 font-mono text-xs tabular-nums">
                    {rule.index}
                  </TableCell>
                  <TableCell>
                    <Badge tone="muted" className="text-2xs">
                      {rule.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className="block max-w-md truncate" title={target}>
                      {target}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone="muted">
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: policyColor(rule.policy) }}
                      />
                      {rule.policy}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {rule.hits === 0 ? (
                      <Badge tone="warn" className="text-2xs">
                        never
                      </Badge>
                    ) : (
                      rule.hits.toLocaleString()
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatBytes(rule.bytes)}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 font-mono text-xs tabular-nums">
                    {rule.lastHit == null ? "—" : formatTimeAgo(rule.lastHit)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function PolicyGroups({ groups }: { groups: RuleGroup[] }) {
  const sorted = sortGroups(groups);
  const active = sorted.filter((group) => group.bytes > 0);
  const idle = sorted.filter((group) => group.bytes === 0);
  const maximum = Math.max(0, ...active.map((group) => group.bytes));

  return (
    <Card
      title="Policy groups"
      note="Traffic routed into each group by the rule pipeline · last 14 days"
      className="col-span-12 xl:col-span-6 xl:self-start"
    >
      {sorted.length === 0 ? (
        <Empty message="No policy groups configured" />
      ) : (
        <>
          {active.length === 0 ? (
            <Empty message="No group routed traffic in this window" />
          ) : (
            <div className="space-y-4">
              {active.map((group) => {
                const members = memberSummary(group);
                const width = maximum > 0 ? (group.bytes / maximum) * 100 : 0;
                return (
                  <div key={group.name}>
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium" title={group.name}>
                          {group.name}
                        </span>
                        <Badge tone="muted" className="text-2xs shrink-0">
                          {group.type}
                        </Badge>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums">
                        {formatBytes(group.bytes)}
                      </span>
                    </div>
                    <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: policyColor(group.name),
                          width: `${Math.max(2, width)}%`,
                        }}
                      />
                    </div>
                    <p
                      className="text-muted-foreground text-2xs mt-1.5 line-clamp-2"
                      title={members}
                    >
                      {members || "No members"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {idle.length > 0 && (
            <div className={cn(active.length > 0 && "border-border mt-5 border-t pt-4")}>
              <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">
                Idle · {idle.length}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {idle.map((group) => (
                  <span key={group.name} title={memberSummary(group) || "No members"}>
                    <Badge tone="muted" className="text-2xs">
                      {group.name}
                    </Badge>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ListCoverage({ lists, onSelect }: { lists: RuleList[]; onSelect: (name: string) => void }) {
  const sorted = sortLists(lists);

  return (
    <Card
      title="List coverage"
      note="How much of each list has actually fired · full history for domains, 14 days for the rest"
      className="col-span-12 xl:col-span-6 xl:self-start"
    >
      {sorted.length === 0 ? (
        <Empty message="No rule lists configured" />
      ) : (
        <div className="flex flex-col">
          {sorted.map((list) => {
            const percent = coveragePercent(list.matched, list.entries);
            return (
              <button
                key={list.name}
                type="button"
                className="hover:bg-muted focus-visible:ring-ring -mx-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => onSelect(list.name)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs" title={list.name}>
                      {list.name}
                    </span>
                    <span
                      className="text-muted-foreground text-2xs block truncate"
                      title={list.path}
                    >
                      {list.path}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="font-mono text-xs tabular-nums">
                      {list.matched}/{list.entries}
                    </span>
                    <span className="text-muted-foreground text-2xs font-mono tabular-nums">
                      {Math.round(percent)}%
                    </span>
                  </span>
                </span>
                <span className="bg-muted mt-1.5 block h-1 overflow-hidden rounded-full">
                  {percent > 0 && (
                    <span
                      className="block h-full rounded-full"
                      style={{ background: coverageColor(percent), width: `${percent}%` }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function NeverMatchedRows({ entries }: { entries: RuleCoverageEntry[] }) {
  const visible = entries.slice(0, VISIBLE_ENTRY_LIMIT);

  if (entries.length === 0) return <Empty message="Every entry has matched" />;

  return (
    <div>
      <div className="space-y-0.5">
        {visible.map((entry) => (
          <div key={`${entry.type}:${entry.value}`} className="flex items-center gap-2 py-1.5">
            <Badge tone="muted" className="text-2xs shrink-0 px-1.5 py-0">
              {entry.type}
            </Badge>
            <span className="min-w-0 truncate font-mono text-xs" title={entry.value}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
      {entries.length > visible.length && (
        <p className="text-muted-foreground mt-2 text-xs">
          +{entries.length - visible.length} more
        </p>
      )}
    </div>
  );
}

function MatchedRows({ entries }: { entries: RuleCoverageEntry[] }) {
  const visible = entries.slice(0, VISIBLE_ENTRY_LIMIT);

  if (entries.length === 0) return <Empty message="No entries have matched" />;

  return (
    <div>
      <div className="space-y-0.5">
        {visible.map((entry) => (
          <div key={`${entry.type}:${entry.value}`} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.value}>
              {entry.value}
            </span>
            <Badge
              tone={entry.matchedVia === "flows" ? "ok" : "muted"}
              className="text-2xs shrink-0 px-1.5 py-0"
            >
              {entry.matchedVia ?? "unknown"}
            </Badge>
            <span className="text-muted-foreground text-2xs w-14 shrink-0 text-right font-mono tabular-nums">
              {entry.lastSeen == null ? "—" : formatTimeAgo(entry.lastSeen)}
            </span>
          </div>
        ))}
      </div>
      {entries.length > visible.length && (
        <p className="text-muted-foreground mt-2 text-xs">
          +{entries.length - visible.length} more
        </p>
      )}
    </div>
  );
}

function CoverageInspector({ list, onClose }: { list: RuleList | null; onClose: () => void }) {
  const name = list?.name ?? null;
  const { data, isError, isLoading } = useQuery({
    queryKey: ["rule-coverage", name],
    queryFn: () => api.ruleCoverage(name ?? ""),
    enabled: name !== null,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
  const total = data?.total ?? list?.entries ?? 0;
  const matched = data?.matched ?? list?.matched ?? 0;
  const neverMatched = data?.entries.filter((entry) => !entry.matched) ?? [];
  const matchedEntries = data?.entries.filter((entry) => entry.matched) ?? [];

  return (
    <InspectorPanel
      open={list !== null}
      onClose={onClose}
      title={name ?? "List coverage"}
      sub={`${matched} of ${total} entries matched`}
    >
      {isLoading && !data ? (
        <div className="space-y-7">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <Empty message="Coverage unavailable" hint="Try again in a moment" />
      ) : (
        <>
          <InspectorSection title="Never matched">
            <NeverMatchedRows entries={neverMatched} />
          </InspectorSection>
          <InspectorSection title="Matched">
            <MatchedRows entries={matchedEntries} />
          </InspectorSection>
        </>
      )}
    </InspectorPanel>
  );
}

export function RulesScreen() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { data, isError, isLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: api.rules,
    refetchInterval: 60000,
  });

  const selectedList = data?.lists.find((list) => list.name === selectedName) ?? null;
  const zeroCount = data?.rules.filter((rule) => rule.hits === 0).length ?? 0;
  const loading = isLoading && !data;
  const stats = loading ? (
    <Skeleton className="h-5 w-80 max-w-full" />
  ) : data?.available ? (
    <>
      <span>{data.rules.length} rules</span>
      <span aria-hidden>·</span>
      <span>{data.groups.length} policy groups</span>
      <span aria-hidden>·</span>
      <span>{data.lists.length} rule lists</span>
      <span aria-hidden>·</span>
      <span className={zeroCount > 0 ? "text-warn" : undefined}>
        {zeroCount} never matched
      </span>
    </>
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Rules"
        sub="The gateway's decision pipeline, audited against real traffic"
        stats={stats}
      />

      {loading ? (
        <RulesLoading />
      ) : isError || !data ? (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-12">
            <Empty message="Rules unavailable" hint="Try again in a moment" />
          </Card>
        </div>
      ) : !data.available ? (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-12">
            <Empty
              message="No Surge profile found"
              hint="Fetch it to data/surge-profile.conf or set TN_SURGE_PROFILE"
            />
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <RulePipeline rules={data.rules} />
          <PolicyGroups groups={data.groups} />
          <ListCoverage lists={data.lists} onSelect={setSelectedName} />
        </div>
      )}

      <CoverageInspector list={selectedList} onClose={() => setSelectedName(null)} />
    </>
  );
}
