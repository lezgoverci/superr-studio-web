"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ShellNavItem } from "./types";

type AppNavProps = {
  items: ShellNavItem[];
};

export function isItemActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavContent({
  items,
  onItemClick,
}: {
  items: ShellNavItem[];
  onItemClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 flex-1 overflow-y-auto w-full">
      {items.map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            href={item.href}
            key={item.id}
            onClick={onItemClick}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNav({ items }: AppNavProps) {
  return (
    <aside className="pointer-events-auto hidden w-64 shrink-0 border-r bg-background p-4 lg:flex lg:flex-col z-20">
      <div className="mb-4 px-3">
        <div className="text-muted-foreground font-semibold text-xs tracking-wider uppercase">
          Workspace
        </div>
      </div>
      <NavContent items={items} />
    </aside>
  );
}
