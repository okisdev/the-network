export const CHART_SLOTS: readonly string[] = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-8)",
];

export function colorForKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return CHART_SLOTS[(hash >>> 0) % CHART_SLOTS.length] ?? "var(--color-chart-1)";
}

export function policyColor(policy: string): string {
  const upper = policy.toUpperCase();
  if (upper.startsWith("REJECT")) return "var(--color-chart-6)";
  if (upper.startsWith("DIRECT")) return "var(--color-chart-7)";
  return colorForKey(policy);
}
