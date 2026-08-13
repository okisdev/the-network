"use client";

import type { CityPoint, DestinationCountry } from "@the-network/schema";
import { geoCentroid, geoEqualEarth } from "d3-geo";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import topology from "world-atlas/countries-110m.json";
import { ALPHA2_TO_NUMERIC, NUMERIC_TO_ALPHA2 } from "@/components/screens/destinations-data";
import { Button } from "@/components/ui/button";
import { CountryChip } from "@/components/ui/country-chip";
import { formatBytes } from "@/lib/format";

const HOME: [number, number] = [121.47, 31.23];
const worldData = topology as unknown as object;

function countryBytes(country: DestinationCountry): number {
  return country.bytesIn + country.bytesOut;
}

function shareFill(share: number): string {
  const percentage = Math.round(15 + Math.pow(Math.min(1, Math.max(0, share)), 0.4) * 60);
  return `color-mix(in oklab, var(--color-primary) ${percentage}%, var(--color-muted))`;
}

export function WorldMap({
  countries,
  cities = [],
  selected,
  onSelect,
}: {
  countries: DestinationCountry[];
  cities?: CityPoint[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const byNumeric = useMemo(() => {
    const map = new Map<string, DestinationCountry>();
    for (const country of countries) {
      const numeric = ALPHA2_TO_NUMERIC[country.code.toUpperCase()];
      if (numeric) map.set(numeric, country);
    }
    return map;
  }, [countries]);

  const totalBytes = useMemo(
    () => Math.max(1, countries.reduce((sum, country) => sum + countryBytes(country), 0)),
    [countries],
  );

  const topArcs = useMemo(
    () => [...countries].sort((a, b) => countryBytes(b) - countryBytes(a)).slice(0, 8),
    [countries],
  );
  const maxArcBytes = Math.max(1, ...topArcs.map(countryBytes));
  const visibleCities = useMemo(
    () =>
      [...cities]
        .filter(
          (city) =>
            Number.isFinite(city.lat) &&
            Number.isFinite(city.lon) &&
            Number.isFinite(city.bytes) &&
            city.bytes >= 0,
        )
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 60),
    [cities],
  );
  const maxCityBytes = Math.max(1, ...visibleCities.map((city) => city.bytes));
  const projection = useMemo(
    () => geoEqualEarth().scale(150).rotate([-150, 0, 0]).translate([470, 215]),
    [],
  );
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [150, 0],
    zoom: 1,
  });
  const router = useRouter();
  const [hovered, setHovered] = useState<
    | { kind: "city"; city: string; country: string; bytes: number; flows: number }
    | { kind: "country"; code: string; bytes: number; flows: number }
    | null
  >(null);

  const zoomBy = (factor: number) => {
    setPosition((current) => ({
      ...current,
      zoom: Math.min(8, Math.max(1, current.zoom * factor)),
    }));
  };

  return (
    <div className="relative">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 150, rotate: [-150, 0, 0] }}
        width={940}
        height={430}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          minZoom={1}
          maxZoom={8}
          onMoveEnd={({ coordinates, zoom }) => setPosition({ coordinates, zoom })}
          filterZoomEvent={
            ((event: Event) =>
              event.type === "wheel"
                ? (event as WheelEvent).metaKey || (event as WheelEvent).ctrlKey
                : true) as unknown as (element: SVGElement) => boolean
          }
        >
      <Geographies geography={worldData}>
        {({ geographies }) => {
          const centroids = new Map<string, [number, number]>();
          for (const geography of geographies) {
            const id = String(geography.id ?? "");
            if (!id) continue;
            const [longitude, latitude] = geoCentroid(geography);
            if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
              centroids.set(id, [longitude, latitude]);
            }
          }

          const arcs = topArcs.flatMap((country) => {
            const numeric = ALPHA2_TO_NUMERIC[country.code.toUpperCase()];
            if (!numeric) return [];
            const destination = centroids.get(numeric);
            if (!destination) return [];
            const start = projection(HOME);
            const end = projection(destination);
            if (!start || !end) return [];
            const [x1, y1] = start;
            const [x2, y2] = end;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.hypot(dx, dy);
            if (distance < 4) return [];
            const height = Math.min(distance * 0.22, 70);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const normalX = -dy / distance;
            const normalY = dx / distance;
            const controlY = midY + normalY * height;
            const control =
              controlY <= midY
                ? [midX + normalX * height, controlY]
                : [midX - normalX * height, midY - normalY * height];
            const share = countryBytes(country) / maxArcBytes;
            return [
              {
                code: country.code,
                destination,
                path: `M ${x1} ${y1} Q ${control[0]} ${control[1]} ${x2} ${y2}`,
                strokeWidth: 0.8 + share * 2.2,
                bytes: countryBytes(country),
                flows: country.flows,
              },
            ];
          });

          return (
            <>
              {geographies.map((geography) => {
                const id = String(geography.id ?? "");
                const country = byNumeric.get(id);
                const alpha = NUMERIC_TO_ALPHA2[id];
                const hasTraffic = country !== undefined;
                const share = country ? countryBytes(country) / totalBytes : 0;
                const isSelected =
                  selected !== null &&
                  (selected === alpha || selected === country?.code.toUpperCase());
                const selectCountry = () => {
                  if (alpha && hasTraffic) onSelect(alpha);
                };

                return (
                  <Geography
                    key={geography.rsmKey}
                    geography={geography}
                    className={
                      hasTraffic
                        ? "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        : undefined
                    }
                    fill={
                      hasTraffic
                        ? isSelected
                          ? "var(--color-primary)"
                          : shareFill(share)
                        : "var(--color-muted)"
                    }
                    stroke="var(--color-border)"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: {
                        fill: hasTraffic
                          ? isSelected
                            ? "var(--color-primary)"
                            : shareFill(Math.min(1, share + 0.15))
                          : "var(--color-muted)",
                        outline: "none",
                        cursor: hasTraffic ? "pointer" : "default",
                      },
                      pressed: { outline: "none" },
                    }}
                    role={hasTraffic ? "button" : undefined}
                    tabIndex={hasTraffic ? 0 : undefined}
                    aria-label={hasTraffic && alpha ? `${alpha} destination traffic` : undefined}
                    onClick={selectCountry}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectCountry();
                      }
                    }}
                  />
                );
              })}
              {arcs.map((arc) => (
                <path
                  key={arc.code}
                  d={arc.path}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  stroke="var(--color-chart-1)"
                  strokeWidth={arc.strokeWidth}
                  strokeLinecap="round"
                  opacity={0.5}
                />
              ))}
              {visibleCities.map((city) => (
                <Marker
                  key={`${city.country}-${city.city}-${city.lat}-${city.lon}`}
                  coordinates={[city.lon, city.lat]}
                >
                  <circle
                    r={1.6 + 2.8 * Math.sqrt(city.bytes / maxCityBytes)}
                    fill="var(--color-chart-2)"
                    fillOpacity={0.65}
                    stroke="var(--color-card)"
                    strokeWidth={0.4}
                    className="cursor-pointer transition-transform duration-150 [transform-box:fill-box] origin-center hover:scale-125"
                    onMouseEnter={() =>
                      setHovered({
                        kind: "city",
                        city: city.city,
                        country: city.country,
                        bytes: city.bytes,
                        flows: city.flows,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => router.push(`/flows?city=${encodeURIComponent(city.city)}`)}
                  />
                </Marker>
              ))}
              <Marker coordinates={HOME}>
                <circle r={6} fill="var(--color-ok)" opacity={0.25} />
                <circle r={3} fill="var(--color-ok)" />
              </Marker>
              {arcs.map((arc) => (
                <Marker key={`end-${arc.code}`} coordinates={arc.destination}>
                  <circle
                    r={3}
                    fill="var(--color-chart-1)"
                    className="cursor-pointer transition-transform duration-150 [transform-box:fill-box] origin-center hover:scale-125"
                    onMouseEnter={() =>
                      setHovered({
                        kind: "country",
                        code: arc.code.toUpperCase(),
                        bytes: arc.bytes,
                        flows: arc.flows,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onSelect?.(arc.code.toUpperCase())}
                  />
                </Marker>
              ))}
            </>
          );
        }}
      </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      {hovered && (
        <div className="ring-border bg-popover pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs shadow-sm ring-1">
          <CountryChip code={hovered.kind === "city" ? hovered.country : hovered.code} />
          {hovered.kind === "city" && <span className="font-medium">{hovered.city}</span>}
          <span className="text-muted-foreground font-mono tabular-nums">
            {formatBytes(hovered.bytes)} · {hovered.flows.toLocaleString()} flows
          </span>
        </div>
      )}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <Button type="button" variant="outline" size="icon" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>
          <Plus className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>
          <Minus className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Reset zoom"
          onClick={() => setPosition({ coordinates: [150, 0], zoom: 1 })}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
