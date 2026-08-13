"use client";

import type { DestinationCountry } from "@the-network/schema";
import { geoCentroid } from "d3-geo";
import { useMemo } from "react";
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps";
import topology from "world-atlas/countries-110m.json";
import { ALPHA2_TO_NUMERIC, NUMERIC_TO_ALPHA2 } from "@/components/screens/destinations-data";

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
  selected,
  onSelect,
}: {
  countries: DestinationCountry[];
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

  return (
    <ComposableMap
      projection="geoEqualEarth"
      projectionConfig={{ scale: 150 }}
      width={940}
      height={430}
      style={{ width: "100%", height: "auto" }}
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
            const share = countryBytes(country) / maxArcBytes;
            return [
              {
                code: country.code,
                destination,
                strokeWidth: 0.8 + share * 2.2,
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
                <Line
                  key={arc.code}
                  from={HOME}
                  to={arc.destination}
                  stroke="var(--color-chart-1)"
                  strokeWidth={arc.strokeWidth}
                  strokeLinecap="round"
                  opacity={0.5}
                />
              ))}
              <Marker coordinates={HOME}>
                <circle r={6} fill="var(--color-ok)" opacity={0.25} />
                <circle r={3} fill="var(--color-ok)" />
              </Marker>
              {arcs.map((arc) => (
                <Marker key={`end-${arc.code}`} coordinates={arc.destination}>
                  <circle r={2} fill="var(--color-chart-1)" />
                </Marker>
              ))}
            </>
          );
        }}
      </Geographies>
    </ComposableMap>
  );
}
