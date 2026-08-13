"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsPanel = TabsPrimitive.Panel;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("ring-border bg-muted inline-flex rounded-md p-0.5 ring-1", className)}
      {...props}
    />
  );
}

export function TabsTab({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "text-muted-foreground hover:text-foreground data-[selected]:bg-card data-[selected]:ring-border data-[selected]:text-foreground rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 outline-none select-none data-[selected]:ring-1",
        className,
      )}
      {...props}
    />
  );
}
