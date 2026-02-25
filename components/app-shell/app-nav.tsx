"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ShellNavItem } from "./types";

type AppNavProps = {
  items: ShellNavItem[];
};

function normalizeNavHref(href: string): string {
  const [withoutHash] = href.split("#");
  const [pathname] = withoutHash.split("?");
  return pathname || "/";
}

export function isItemActive(pathname: string, href: string): boolean {
  const normalizedHref = normalizeNavHref(href);
  if (normalizedHref === "/app") {
    return pathname === "/app";
  }
  return (
    pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`)
  );
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
    <nav className="w-full flex-1 space-y-1 overflow-y-auto">
      {items.map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
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
    <aside className="pointer-events-auto z-20 hidden w-64 shrink-0 border-r bg-background p-4 lg:flex lg:flex-col">
      <div className="mb-4 px-3">
        <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Workspace
        </div>
      </div>
      <NavContent items={items} />
    </aside>
  );
}
