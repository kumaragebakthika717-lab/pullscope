"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/analysis/speed", label: "Speed & endurance", icon: Activity },
  { href: "/analysis/matches", label: "Match tagging", icon: Clapperboard },
];

export function AnalysisNav() {
  const pathname = usePathname();
  return (
    <div className="border-b bg-panel/60">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-2">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              pathname.startsWith(href) && "bg-accent text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          Local-only module · stored in this browser
        </span>
      </div>
    </div>
  );
}
