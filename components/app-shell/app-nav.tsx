"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ShellNavItem } from "./types";

type AppNavProps = {
  items: ShellNavItem[];
};

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ items }: AppNavProps) {
  const pathname = usePathname();

  return (
    <aside className="pointer-events-auto hidden w-64 shrink-0 border-r bg-background/95 p-3 lg:flex lg:flex-col">
      <div className="mb-2 px-2 py-1 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        Workspace
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              className={cn(
                "group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                active
                  ? "border-primary/25 bg-primary/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
              )}
              href={item.href}
              key={item.id}
            >
              <Icon className="size-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{item.label}</p>
                <p className="truncate text-[11px] opacity-80">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
