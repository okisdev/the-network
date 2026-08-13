import type { ReactNode } from "react";

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}
