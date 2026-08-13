import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "ring-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm ring-1 transition-shadow duration-150 focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
