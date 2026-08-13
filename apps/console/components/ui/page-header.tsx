import type { ReactNode } from "react";

export function PageHeader({
  title,
  sub,
  stats,
  actions,
}: {
  title: string;
  sub?: string;
  stats?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
        {stats && (
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 font-mono text-sm tabular-nums">
            {stats}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}
