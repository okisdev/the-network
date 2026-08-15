"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function GlobeFallback({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}>
      <Globe className="text-muted-foreground size-3" />
    </span>
  );
}

export function DomainFavicon({
  domain,
  className,
}: {
  domain: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <GlobeFallback className={className} />;

  return (
    <span className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}>
      <img
        src={`/api/favicon/${encodeURIComponent(domain)}`}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full rounded-[3px] object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
