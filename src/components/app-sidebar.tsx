"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Matches", icon: LayoutGrid },
  { href: "/settings/rubric", label: "Rubric", icon: ListChecks },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r bg-panel p-3 md:flex">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            pathname.startsWith(href) && "bg-accent text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
