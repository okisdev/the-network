"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function DomainFavicon({
  domain,
  className,
}: {
  domain: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}>
      {failed ? (
        <Globe className="text-muted-foreground size-3" />
      ) : (
        <img
          src={`/api/favicon/${encodeURIComponent(domain)}`}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full rounded-[3px] object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
