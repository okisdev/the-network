import type { ReactNode } from "react";

export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="space-y-2.5">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
      <dt className="text-muted-foreground text-xs leading-5">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}
