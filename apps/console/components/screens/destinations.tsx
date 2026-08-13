"use client";

import { useQuery } from "@tanstack/react-query";
import type { DestinationCountry, DestinationHost } from "@the-network/schema";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryChip } from "@/components/ui/country-chip";
import { Empty } from "@/components/ui/empty";
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
import { formatBytes } from "@/lib/format";

const WorldMap = dynamic(
  () => import("@/components/screens/world-map").then((module) => module.WorldMap),
  { ssr: false, loading: () => <Skeleton className="aspect-[94/43] w-full" /> },
);

function countryBytes(country: DestinationCountry): number {
  return country.bytesIn + country.bytesOut;
}

function CountriesPanel({
  countries,
  selected,
  onSelect,
  onClear,
}: {
  countries: DestinationCountry[];
  selected: string | null;
  onSelect: (code: string) => void;
  onClear: () => void;
}) {
  const top = useMemo(
    () => [...countries].sort((a, b) => countryBytes(b) - countryBytes(a)).slice(0, 10),
    [countries],
  );
  const totalBytes = Math.max(
    1,
    countries.reduce((sum, country) => sum + countryBytes(country), 0),
  );
  const maxBytes = Math.max(1, ...top.map(countryBytes));

  const {
    data: deviceData,
    isLoading: devicesLoading,
    isError: devicesError,
  } = useQuery({
    queryKey: ["countryDevices", selected],
    queryFn: () => api.countryDevices(selected!),
    enabled: Boolean(selected),
    refetchInterval: 15000,
  });
  const devices = Array.isArray(deviceData) ? deviceData : [];

  return (
    <Card title="Countries">
      {selected && (
        <div className="bg-muted ring-border mb-4 rounded-lg p-3 ring-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Who talks to {selected}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClear}
              aria-label="Clear country selection"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {devicesLoading && <Empty message="Loading devices" />}
          {devicesError && <Empty message="Destinations API not available yet" />}
          {!devicesLoading && !devicesError && devices.length === 0 && (
            <Empty message="No devices for this country" />
          )}
          {!devicesLoading && !devicesError && devices.length > 0 && (
            <div className="flex flex-col gap-2">
              {devices.map((device) => (
                <div key={device.deviceId} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px]">{device.deviceName}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                    {formatBytes(device.bytes)}
                    <span className="ml-2">{device.flows}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {top.length === 0 ? (
        <Empty
          message="No destination data yet"
          hint="Traffic starts mapping once flows carry GeoIP"
        />
      ) : (
        <div className="flex flex-col gap-1">
          {top.map((country) => {
            const bytes = countryBytes(country);
            const code = country.code.toUpperCase();
            const isSelected = selected === code;

            return (
              <button
                key={code}
                type="button"
                onClick={() => onSelect(code)}
                aria-pressed={isSelected}
                className={`focus-visible:ring-ring rounded-lg px-2 py-1.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none ${
                  isSelected
                    ? "bg-popover ring-primary ring-1"
                    : "hover:bg-muted"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <CountryChip code={code} />
                  <span className="font-mono text-[11px] tabular-nums">{formatBytes(bytes)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/50 h-full rounded-full"
                      style={{ width: `${Math.max(2, (bytes / maxBytes) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {country.flows} · {((bytes / totalBytes) * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HostsTable({ hosts }: { hosts: DestinationHost[] }) {
  const rows = hosts.slice(0, 30);

  if (rows.length === 0) {
    return (
      <Empty
        message="No destination data yet"
        hint="Traffic starts mapping once flows carry GeoIP"
      />
    );
  }

  return (
    <Table className="min-w-[520px]">
      <TableHead>
        <TableRow>
          <TableHeader>Host</TableHeader>
          <TableHeader>Country</TableHeader>
          <TableHeader className="text-right">Traffic</TableHeader>
          <TableHeader className="text-right">Flows</TableHeader>
          <TableHeader className="text-right">Devices</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((host) => (
          <TableRow key={host.host}>
            <TableCell className="font-mono text-[12px]">{host.host}</TableCell>
            <TableCell>
              {host.country ? (
                <CountryChip code={host.country} />
              ) : (
                <span className="text-muted-foreground text-xs">Unknown</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-[12px] tabular-nums">
              {formatBytes(host.bytes)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
              {host.flows}
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono text-[12px] tabular-nums">
              {host.devices}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DestinationsScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["destinations"],
    queryFn: api.destinations,
    refetchInterval: 15000,
  });

  if (isLoading && !data) {
    return (
      <>
        <PageHeader title="Destinations" sub="Where the home network talks to" />
        <Card>
          <Empty message="Loading destinations" />
        </Card>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Destinations" sub="Where the home network talks to" />
        <Card>
          <Empty message="Destinations API not available yet" />
        </Card>
      </>
    );
  }

  const countries = Array.isArray(data?.countries) ? data.countries : [];
  const hosts = Array.isArray(data?.hosts) ? data.hosts : [];

  if (countries.length === 0) {
    return (
      <>
        <PageHeader title="Destinations" sub="Where the home network talks to" />
        <Card>
          <Empty
            message="No destination data yet"
            hint="Traffic starts mapping once flows carry GeoIP"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Destinations" sub="Where the home network talks to" />
      <div className="grid grid-cols-12 gap-4">
        <Card title="Map" className="col-span-12 xl:col-span-8">
          <WorldMap
            countries={countries}
            selected={selected}
            onSelect={(code) => setSelected(code)}
          />
        </Card>
        <div className="col-span-12 xl:col-span-4">
          <CountriesPanel
            countries={countries}
            selected={selected}
            onSelect={(code) => setSelected(code)}
            onClear={() => setSelected(null)}
          />
        </div>
        <Card title="Hosts" className="col-span-12">
          <HostsTable hosts={hosts} />
        </Card>
      </div>
    </>
  );
}
