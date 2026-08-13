"use client";

import {
  ArrowRightLeft,
  Globe,
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  PlugZap,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MONITOR_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: MonitorSmartphone },
  { href: "/flows", label: "Flows", icon: ArrowRightLeft },
  { href: "/destinations", label: "Destinations", icon: Globe },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

const SYSTEM_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/sources", label: "Sources", icon: PlugZap },
];

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active && (
        <span className="bg-foreground absolute inset-y-1.5 left-0 w-0.5 rounded-full" />
      )}
      <Icon
        className={cn(
          "size-4",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="border-border bg-background fixed inset-y-0 left-0 flex w-52 flex-col border-r">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <span className="relative flex size-2">
          <span className="bg-foreground absolute inline-flex size-full animate-ping rounded-full opacity-40" />
          <span className="bg-foreground relative inline-flex size-2 rounded-full" />
        </span>
        <div className="leading-tight">
          <div className="text-foreground text-sm font-semibold tracking-wide">The Network</div>
          <div className="text-muted-foreground text-xs">Home observability</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium">Monitor</div>
        {MONITOR_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
        <div className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-medium">System</div>
        {SYSTEM_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
      <footer className="border-border text-muted-foreground border-t px-4 py-3 text-xs">
        M0 · self hosted
      </footer>
    </aside>
  );
}
