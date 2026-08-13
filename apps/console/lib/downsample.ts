import { formatTime } from "@/lib/format";

export function downsampleCounts(
  series: Array<{ ts: number; flows: number }>,
): Array<{ label: string; count: number }> {
  if (series.length === 0) return [];
  const bucketSize = Math.max(1, Math.ceil(series.length / 24));
  const buckets = Array.from({ length: Math.ceil(series.length / bucketSize) }, (_, index) => {
    const points = series.slice(index * bucketSize, (index + 1) * bucketSize);
    return {
      ts: points[0]?.ts ?? 0,
      count: points.reduce((total, point) => total + point.flows, 0),
    };
  });
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  return buckets.map((bucket, index) => ({
    count: bucket.count,
    label:
      index % labelEvery === 0 || index === buckets.length - 1
        ? formatTime(bucket.ts).slice(0, 5)
        : "",
  }));
}
