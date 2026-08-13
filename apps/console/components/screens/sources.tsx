"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SourceDto,
  SourceHealthPoint,
  SourceInput,
  TestConnectionResult,
} from "@the-network/schema";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PresenceRibbon } from "@/components/charts/presence-ribbon";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimeRange } from "@/contexts/timerange-provider";
import { ApiError, api, type RangeQuery } from "@/lib/api";
import { formatBytes, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SourceForm {
  name: string;
  url: string;
  apiKey: string;
  requestsIntervalMs: number;
  devicesIntervalMs: number;
  trafficIntervalMs: number;
}

function settingString(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function settingNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function intervalSummary(settings: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, label] of [
    ["requestsIntervalMs", "requests"],
    ["devicesIntervalMs", "devices"],
    ["trafficIntervalMs", "traffic"],
  ] as const) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      parts.push(`${label} ${value / 1000}s`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function initialForm(source?: SourceDto): SourceForm {
  if (!source) {
    return {
      name: "",
      url: "",
      apiKey: "",
      requestsIntervalMs: 2000,
      devicesIntervalMs: 15000,
      trafficIntervalMs: 5000,
    };
  }
  return {
    name: source.name,
    url: settingString(source.settings, "url"),
    apiKey: "",
    requestsIntervalMs: settingNumber(source.settings, "requestsIntervalMs", 2000),
    devicesIntervalMs: settingNumber(source.settings, "devicesIntervalMs", 15000),
    trafficIntervalMs: settingNumber(source.settings, "trafficIntervalMs", 5000),
  };
}

function statusDetails(
  source: SourceDto,
): { tone: "ok" | "warn" | "destructive" | "muted"; label: string } {
  switch (source.status.state) {
    case "ok":
      return { tone: "ok", label: "Healthy" };
    case "degraded":
      return { tone: "warn", label: "Degraded" };
    case "error":
      return { tone: "destructive", label: "Error" };
    case "starting":
      return { tone: "muted", label: "Starting" };
    case "stopped":
      return { tone: "muted", label: "Stopped" };
  }
}

function sourceSettings(form: SourceForm): Record<string, unknown> {
  return {
    url: form.url.trim(),
    apiKey: form.apiKey.trim(),
    requestsIntervalMs: form.requestsIntervalMs,
    devicesIntervalMs: form.devicesIntervalMs,
    trafficIntervalMs: form.trafficIntervalMs,
  };
}

function sourceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Request failed";
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function healthIntervals(points: SourceHealthPoint[]): Array<{ start: number; end: number }> {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index]!.ts - sorted[index - 1]!.ts;
    if (gap > 0) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  const expectedGap = gaps[Math.floor((gaps.length - 1) / 2)] ?? Number.POSITIVE_INFINITY;
  const intervals: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  let end: number | undefined;
  let previousTs: number | undefined;

  for (const point of sorted) {
    const hasGap = previousTs !== undefined && point.ts - previousTs > expectedGap * 2;
    if ((!point.ok || hasGap) && start !== undefined && end !== undefined) {
      intervals.push({ start, end });
      start = undefined;
      end = undefined;
    }
    if (point.ok) {
      start ??= point.ts;
      end = point.ts;
    }
    previousTs = point.ts;
  }

  if (start !== undefined && end !== undefined) intervals.push({ start, end });
  return intervals;
}

function SourceHealthStrip({
  sourceId,
  rangeQuery,
  rangeLabel,
}: {
  sourceId: string;
  rangeQuery: RangeQuery;
  rangeLabel: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "sourceHealth",
      sourceId,
      rangeQuery.minutes,
      rangeQuery.from,
      rangeQuery.to,
    ],
    queryFn: () => api.sourceHealth(sourceId, rangeQuery),
    refetchInterval: 30000,
  });
  const points = Array.isArray(data) ? data : [];

  if (isLoading && !data) return <Skeleton className="mt-4 h-14 w-full" />;
  if (points.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">No health history yet</p>;
  }

  const uptime = (points.filter((point) => point.ok).length / points.length) * 100;
  const latencies = points
    .map((point) => point.latencyMs)
    .filter((latency): latency is number => latency !== undefined);
  const latencyMedian = median(latencies);
  const intervals = healthIntervals(points);
  const to = rangeQuery.to ?? Date.now();
  const from = rangeQuery.from ?? to - rangeQuery.minutes * 60000;

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(180px,1fr)] sm:items-end">
      <div>
        <p
          className={cn(
            "font-mono text-xl tabular-nums",
            uptime >= 99 ? "text-ok" : uptime >= 95 ? "text-warn" : "text-destructive",
          )}
        >
          {uptime.toFixed(uptime === 100 ? 0 : 1)}%
        </p>
        <p className="text-2xs text-muted-foreground">uptime · {rangeLabel}</p>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
          <span>latency</span>
          <span className="font-mono tabular-nums">
            {latencyMedian === undefined ? "—" : `${Math.round(latencyMedian)} ms`}
          </span>
        </div>
        <Sparkline
          className="mt-1"
          points={latencies}
          stroke="var(--color-chart-2)"
        />
      </div>
      <div className="min-w-0">
        <p className="text-2xs text-muted-foreground">availability</p>
        {intervals.length > 0 ? (
          <PresenceRibbon className="mt-2" intervals={intervals} from={from} to={to} />
        ) : (
          <div className="mt-2 h-1.5 rounded-full bg-muted" />
        )}
      </div>
    </div>
  );
}

function SystemCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["systemDb"],
    queryFn: api.systemDb,
    refetchInterval: 60000,
  });
  const tables = [...(data?.tables ?? [])].sort((a, b) => b.rows - a.rows).slice(0, 6);

  return (
    <Card title="System" className="mt-4">
      {isLoading && !data ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <Empty message="Database info is not available yet" />
      ) : (
        <div className="grid gap-8 sm:grid-cols-[auto_1fr_1fr]">
          <div>
            <p className="text-xs text-muted-foreground">Database</p>
            <p className="mt-1 font-mono text-xl tabular-nums">{formatBytes(data.sizeBytes)}</p>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs text-muted-foreground">Tables</p>
            {tables.length > 0 ? (
              <div className="space-y-1">
                {tables.map((table) => (
                  <p key={table.name} className="truncate font-mono text-xs tabular-nums">
                    {table.name} · {table.rows.toLocaleString()} rows
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No table data</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs text-muted-foreground">Retention</p>
            {data.retention.length > 0 ? (
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {data.retention.map((entry) => `${entry.table} ${entry.days}d`).join(" · ")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No retention policies</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function SourcesScreen() {
  const queryClient = useQueryClient();
  const { rangeQuery, label: rangeLabel } = useTimeRange();
  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    refetchInterval: 5000,
  });
  const [dialogSource, setDialogSource] = useState<SourceDto | null | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timeout = window.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [confirmDeleteId]);

  const invalidateSources = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sources"] });
  };

  const toggleEnabled = async (source: SourceDto) => {
    setPendingId(source.id);
    setActionError(null);
    try {
      await api.updateSource(source.id, { enabled: !source.enabled });
      await invalidateSources();
    } catch (error) {
      setActionError(sourceErrorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const deleteSource = async (source: SourceDto) => {
    setPendingId(source.id);
    setActionError(null);
    try {
      await api.deleteSource(source.id);
      setConfirmDeleteId(null);
      await invalidateSources();
      toast("Source deleted");
    } catch (error) {
      setActionError(sourceErrorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Sources"
        sub="Probes feeding this hub"
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setDialogSource(null)}
          >
            Add source
          </Button>
        }
      />

      {actionError && <p className="mb-4 text-sm text-destructive">{actionError}</p>}

      {isLoading && !sources ? (
        <Card>
          <Empty message="Loading sources" />
        </Card>
      ) : (sources ?? []).length === 0 ? (
        <Card>
          <Empty
            message="No sources yet"
            hint="Point The Network at your Surge gateway HTTP API"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {(sources ?? []).map((source) => {
            const status = statusDetails(source);
            const url = settingString(source.settings, "url");
            const apiKey = settingString(source.settings, "apiKey");
            const intervals = intervalSummary(source.settings);
            const isPending = pendingId === source.id;
            const confirmingDelete = confirmDeleteId === source.id;
            return (
              <Card key={source.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-foreground">{source.name}</h2>
                      <Badge tone="muted">surge</Badge>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-muted-foreground">
                      {url && <span className="truncate">{url}</span>}
                      {apiKey && <span>{apiKey}</span>}
                    </div>
                    {intervals && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {intervals}
                      </p>
                    )}
                  </div>

                  <div className="min-w-[150px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        title={
                          source.status.state === "error" ? source.status.message : undefined
                        }
                      >
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </span>
                      {source.eventsPerMinute != null && source.eventsPerMinute !== 0 && (
                        <Badge tone="primary">
                          {Math.round(source.eventsPerMinute)} ev/min
                        </Badge>
                      )}
                    </div>
                    {source.status.lastSuccessAt && (
                      <p className="mt-1 font-mono text-2xs tabular-nums text-muted-foreground">
                        Last success {formatTimeAgo(source.status.lastSuccessAt)}
                      </p>
                    )}
                    {source.lastEventAt !== undefined && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last event {formatTimeAgo(source.lastEventAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={isPending}
                      onClick={() => void toggleEnabled(source)}
                    >
                      {source.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setDialogSource(source)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        if (confirmingDelete) {
                          void deleteSource(source);
                        } else {
                          setConfirmDeleteId(source.id);
                        }
                      }}
                    >
                      {confirmingDelete ? "Confirm delete" : "Delete"}
                    </Button>
                  </div>
                </div>
                <SourceHealthStrip
                  sourceId={source.id}
                  rangeQuery={rangeQuery}
                  rangeLabel={rangeLabel}
                />
              </Card>
            );
          })}
        </div>
      )}

      <SystemCard />

      <Dialog
        open={dialogSource !== undefined}
        onOpenChange={(open) => {
          if (!open) setDialogSource(undefined);
        }}
      >
        {dialogSource !== undefined && (
          <SourceDialog
            key={dialogSource?.id ?? "new"}
            source={dialogSource}
            onSaved={async () => {
              await invalidateSources();
              toast("Source saved");
              setDialogSource(undefined);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function SourceDialog({
  source,
  onSaved,
}: {
  source: SourceDto | null;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<SourceForm>(() => initialForm(source ?? undefined));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const change = <K extends keyof SourceForm>(key: K, value: SourceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
    setTestResult(null);
  };

  const connectionChanged = source
    ? form.url.trim() !== settingString(source.settings, "url") ||
      form.requestsIntervalMs !== settingNumber(source.settings, "requestsIntervalMs", 2000) ||
      form.devicesIntervalMs !== settingNumber(source.settings, "devicesIntervalMs", 15000) ||
      form.trafficIntervalMs !== settingNumber(source.settings, "trafficIntervalMs", 5000)
    : false;
  const canSave = Boolean(
    form.name.trim() && form.url.trim() && (form.apiKey.trim() || source) && !saving,
  );
  const canTest = Boolean(form.url.trim() && form.apiKey.trim() && !testing);

  const testConnection = async () => {
    if (!canTest) return;
    setTesting(true);
    setError(null);
    try {
      setTestResult(
        await api.testSource({
          kind: "surge",
          name: form.name.trim() || "Surge",
          settings: sourceSettings(form),
        }),
      );
    } catch (testError) {
      setTestResult({ ok: false, message: sourceErrorMessage(testError) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    if (source && connectionChanged && !form.apiKey.trim()) {
      setError("Enter an API key to update connection settings");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (source) {
        const patch: Partial<SourceInput> = { name: form.name.trim() };
        if (form.apiKey.trim()) patch.settings = sourceSettings(form);
        await api.updateSource(source.id, patch);
      } else {
        await api.createSource({
          kind: "surge",
          name: form.name.trim(),
          settings: sourceSettings(form),
        });
      }
      await onSaved();
    } catch (saveError) {
      setError(sourceErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="space-y-3">
      <div>
        <DialogTitle>{source ? "Edit source" : "Add source"}</DialogTitle>
        <DialogDescription>Connect a Surge gateway HTTP API</DialogDescription>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">Name</span>
        <Input
          value={form.name}
          onChange={(event) => change("name", event.target.value)}
          autoComplete="off"
          className="w-full"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">URL</span>
        <Input
          type="url"
          value={form.url}
          onChange={(event) => change("url", event.target.value)}
          placeholder="http://192.168.31.2:9091"
          autoComplete="url"
          className="w-full"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">API key</span>
        <Input
          type="password"
          value={form.apiKey}
          onChange={(event) => change("apiKey", event.target.value)}
          placeholder={source ? "Unchanged unless set" : ""}
          autoComplete="new-password"
          className="w-full"
        />
      </label>

      <details className="rounded-md bg-muted px-3 py-2 text-sm ring-1 ring-border">
        <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <NumberField
            label="Requests"
            value={form.requestsIntervalMs}
            onChange={(value) => change("requestsIntervalMs", value)}
          />
          <NumberField
            label="Devices"
            value={form.devicesIntervalMs}
            onChange={(value) => change("devicesIntervalMs", value)}
          />
          <NumberField
            label="Traffic"
            value={form.trafficIntervalMs}
            onChange={(value) => change("trafficIntervalMs", value)}
          />
        </div>
      </details>

      {testResult && (
        <p className={`text-xs ${testResult.ok ? "text-ok" : "text-destructive"}`}>
          {testResult.ok
            ? `Connected${testResult.details?.mode ? ` · ${testResult.details.mode}` : ""}`
            : testResult.message}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={!canTest}
          onClick={() => void testConnection()}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </DialogContent>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs text-muted-foreground">{label} ms</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full font-mono text-xs tabular-nums"
      />
    </label>
  );
}
